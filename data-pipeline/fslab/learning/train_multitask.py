"""CUDA trainer/evaluator for L2, L3, and N1 FrothSeg methods."""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import random
import time
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from ..science.segment import (
    binary_calibration_metrics,
    full_instance_metrics,
    mask_ap,
    summarize_metric_rows,
)
from .data_cache import load_cache, select_split
from .multitask_models import (
    METHOD_CHANNELS,
    build_model,
    probabilities_to_instances,
    targets,
)


@dataclass(frozen=True)
class Config:
    method: str
    seed: int = 20260725
    epochs: int = 16
    learning_rate: float = 8e-4
    base_channels: int = 16
    batch_size: int = 8
    device: str = "cuda"
    evaluation_split: str = "validation"


def _training_config(config: Config) -> dict:
    """Return fields that affect optimization and checkpoint compatibility."""
    values = asdict(config)
    values.pop("evaluation_split")
    return values


def _seed(seed: int) -> None:
    import torch

    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.use_deterministic_algorithms(True)
    torch.backends.cudnn.benchmark = False


def _tensor_data(cache_split: dict[str, np.ndarray], *, include_centers: bool):
    import torch

    images = torch.from_numpy(cache_split["images"].astype(np.float32)[:, None] / 255.0)
    target_array = np.stack([
        targets(label.astype(np.int32), include_centers=include_centers)
        for label in cache_split["labels"]
    ])
    return images, torch.from_numpy(target_array)


def _loss(logits, truth):
    import torch
    from torch.nn import functional as functional

    foreground_probability = torch.sigmoid(logits[:, 0])
    foreground_bce = functional.binary_cross_entropy_with_logits(logits[:, 0], truth[:, 0])
    foreground_dice = 1.0 - (
        (2.0 * (foreground_probability * truth[:, 0]).sum(dim=(1, 2)) + 1.0)
        / (foreground_probability.sum(dim=(1, 2)) + truth[:, 0].sum(dim=(1, 2)) + 1.0)
    ).mean()
    foreground = foreground_bce + foreground_dice
    boundary_raw = functional.binary_cross_entropy_with_logits(
        logits[:, 1], truth[:, 1], reduction="none",
    )
    boundary_weight = 1.0 + 4.0 * truth[:, 1]
    boundary = (boundary_raw * boundary_weight).mean()
    distance = functional.smooth_l1_loss(torch.sigmoid(logits[:, 2]), truth[:, 2])
    total = foreground + boundary + 2.0 * distance
    if logits.shape[1] > 3:
        center_raw = functional.binary_cross_entropy_with_logits(
            logits[:, 3], truth[:, 3], reduction="none",
        )
        total = total + (center_raw * (1.0 + 6.0 * truth[:, 3])).mean()
    return total


def _probabilities(model, images, *, device, batch_size: int) -> np.ndarray:
    import torch

    model.eval()
    out = []
    with torch.inference_mode():
        for start in range(0, len(images), batch_size):
            logits = model(images[start:start + batch_size].to(device))
            out.append(torch.sigmoid(logits).cpu().numpy())
    return np.concatenate(out)


def _calibrate(probabilities, cache_split) -> dict:
    # One appearance realization per latent group is enough for threshold
    # selection and prevents duplicate views from dominating calibration.
    _, indices = np.unique(cache_split["group_ids"], return_index=True)
    indices = np.sort(indices)
    best = {"mean_ap": -1.0}
    center_weights = (0.0,) if probabilities.shape[1] == 3 else (0.0, 0.25, 0.5, 0.75, 1.0)
    for foreground_threshold in (0.4, 0.5, 0.6):
        for boundary_threshold in (0.35, 0.5, 0.65):
            for marker_threshold in (0.15, 0.25, 0.35):
                for min_distance in (1, 2, 3):
                    for center_weight in center_weights:
                        values = []
                        for index in indices:
                            labels = probabilities_to_instances(
                                probabilities[index],
                                foreground_threshold=foreground_threshold,
                                boundary_threshold=boundary_threshold,
                                marker_threshold=marker_threshold,
                                min_distance=min_distance,
                                center_weight=center_weight,
                            )
                            score = mask_ap(labels, cache_split["labels"][index])["ap"]
                            if score is not None:
                                values.append(score)
                        mean_ap = float(np.mean(values))
                        if mean_ap > best["mean_ap"]:
                            best = {
                                "split": "calibration",
                                "n_groups": len(indices),
                                "mean_ap": mean_ap,
                                "foreground_threshold": foreground_threshold,
                                "boundary_threshold": boundary_threshold,
                                "marker_threshold": marker_threshold,
                                "min_distance": min_distance,
                                "center_weight": center_weight,
                            }
    return best


def _evaluate(probabilities, cache_split, calibration, *, split: str) -> dict:
    rows = []
    for index, probability in enumerate(probabilities):
        labels = probabilities_to_instances(
            probability,
            foreground_threshold=calibration["foreground_threshold"],
            boundary_threshold=calibration["boundary_threshold"],
            marker_threshold=calibration["marker_threshold"],
            min_distance=calibration["min_distance"],
            center_weight=calibration.get("center_weight", 0.5),
        )
        truth = cache_split["labels"][index]
        pixel_calibration = binary_calibration_metrics(probability[0], truth > 0)
        rows.append({
            "sample_id": str(cache_split["sample_ids"][index]),
            "condition_id": str(cache_split["conditions"][index]),
            "group_id": str(cache_split["group_ids"][index]),
            **full_instance_metrics(labels, truth),
            "brier": pixel_calibration["brier"],
            "ece": pixel_calibration["ece"],
            "pixel_calibration": pixel_calibration,
        })
    summary = summarize_metric_rows(rows, split=split)
    summary["mean_brier"] = float(np.mean([row["brier"] for row in rows]))
    summary["mean_ece"] = float(np.mean([row["ece"] for row in rows]))
    return summary


def train(config: Config, cache_path: Path, output: Path, *, resume: bool = True) -> dict:
    import torch

    if config.method not in METHOD_CHANNELS:
        raise ValueError(f"unsupported method: {config.method}")
    if config.device.startswith("cuda") and not torch.cuda.is_available():
        raise RuntimeError("CUDA requested but unavailable; CPU fallback is forbidden")
    _seed(config.seed)
    device = torch.device(config.device)
    cache = load_cache(cache_path)
    train_cache = select_split(cache, "train")
    validation_cache = select_split(cache, "validation")
    calibration_cache = select_split(cache, "calibration")
    if config.evaluation_split not in {"validation", "test"}:
        raise ValueError("evaluation_split must be validation or test")
    evaluation_cache = select_split(cache, config.evaluation_split)
    include_centers = config.method == "lamellastar"
    train_images, train_truth = _tensor_data(train_cache, include_centers=include_centers)
    validation_images, validation_truth = _tensor_data(
        validation_cache, include_centers=include_centers,
    )

    output.mkdir(parents=True, exist_ok=True)
    checkpoint_path = output / "checkpoint.pt"
    model = build_model(config.method, config.base_channels).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=config.learning_rate)
    history = []
    start_epoch = 0
    if resume and checkpoint_path.exists():
        checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
        checkpoint_config = dict(checkpoint["config"])
        checkpoint_config.pop("evaluation_split", None)
        if checkpoint_config != _training_config(config):
            raise RuntimeError("checkpoint configuration mismatch")
        model.load_state_dict(checkpoint["model"])
        optimizer.load_state_dict(checkpoint["optimizer"])
        for state in optimizer.state.values():
            for key, value in state.items():
                if isinstance(value, torch.Tensor):
                    state[key] = value.to(device)
        history = checkpoint["history"]
        start_epoch = checkpoint["epoch"] + 1

    started = time.perf_counter()
    for epoch in range(start_epoch, config.epochs):
        model.train()
        order = np.random.default_rng(config.seed + epoch).permutation(len(train_images))
        losses = []
        for start in range(0, len(order), config.batch_size):
            indices = order[start:start + config.batch_size]
            image = train_images[indices].to(device)
            truth = train_truth[indices].to(device)
            optimizer.zero_grad(set_to_none=True)
            loss = _loss(model(image), truth)
            loss.backward()
            optimizer.step()
            losses.append(float(loss.detach()))
        model.eval()
        validation_losses = []
        with torch.inference_mode():
            for start in range(0, len(validation_images), config.batch_size):
                image = validation_images[start:start + config.batch_size].to(device)
                truth = validation_truth[start:start + config.batch_size].to(device)
                validation_losses.append(float(_loss(model(image), truth)))
        row = {
            "epoch": epoch,
            "train_loss": float(np.mean(losses)),
            "validation_loss": float(np.mean(validation_losses)),
        }
        history.append(row)
        torch.save({
            "schema": "frothseg.checkpoint/multitask-v1",
            "method": config.method,
            "epoch": epoch,
            "model": {key: value.detach().cpu() for key, value in model.state_dict().items()},
            "optimizer": optimizer.state_dict(),
            "config": asdict(config),
            "history": history,
        }, checkpoint_path)
        print(
            f"method={config.method} epoch={epoch + 1}/{config.epochs} "
            f"train_loss={row['train_loss']:.5f} "
            f"validation_loss={row['validation_loss']:.5f}",
            flush=True,
        )

    weights_path = output / "weights.npz"
    np.savez_compressed(
        weights_path,
        **{name: tensor.detach().cpu().numpy() for name, tensor in model.state_dict().items()},
    )
    calibration_images = (
        torch.from_numpy(calibration_cache["images"].astype(np.float32)[:, None] / 255.0)
    )
    evaluation_images = torch.from_numpy(
        evaluation_cache["images"].astype(np.float32)[:, None] / 255.0
    )
    calibration_probabilities = _probabilities(
        model, calibration_images, device=device, batch_size=config.batch_size,
    )
    calibration = _calibrate(calibration_probabilities, calibration_cache)
    evaluation_probabilities = _probabilities(
        model, evaluation_images, device=device, batch_size=config.batch_size,
    )
    evaluation = _evaluate(
        evaluation_probabilities,
        evaluation_cache,
        calibration,
        split=config.evaluation_split,
    )
    props = torch.cuda.get_device_properties(device)
    cache_report = json.loads(cache_path.with_suffix(".json").read_text(encoding="utf-8"))
    manifest = {
        "schema": "frothseg.training-run/v2",
        "method": config.method,
        "config": asdict(config),
        "dataset": {
            "schema": cache_report["dataset_schema"],
            "cache_sha256": cache_report["sha256"],
            "samples": cache_report["samples"],
        },
        "environment": {
            "python": platform.python_version(),
            "torch": torch.__version__,
            "cuda_runtime": torch.version.cuda,
            "device": props.name,
            "device_total_vram_mib": round(props.total_memory / 1024**2),
            "peak_allocated_mib": round(torch.cuda.max_memory_allocated(device) / 1024**2, 1),
        },
        "duration_seconds": round(time.perf_counter() - started, 3),
        "inference_weights": {
            "path": weights_path.name,
            "bytes": weights_path.stat().st_size,
            "sha256": hashlib.sha256(weights_path.read_bytes()).hexdigest(),
        },
        "history": history,
        "calibration": calibration,
        "evaluation": evaluation,
    }
    (output / "run.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--method", choices=sorted(METHOD_CHANNELS), required=True)
    parser.add_argument("--cache", type=Path, default=Path("data/cache/learned-v2-192.npz"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=20260725)
    parser.add_argument("--epochs", type=int, default=16)
    parser.add_argument("--learning-rate", type=float, default=8e-4)
    parser.add_argument("--base-channels", type=int, default=16)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--device", default="cuda")
    parser.add_argument(
        "--evaluation-split",
        choices=("validation", "test"),
        default="validation",
    )
    parser.add_argument("--no-resume", action="store_true")
    args = parser.parse_args()
    config = Config(
        method=args.method,
        seed=args.seed,
        epochs=args.epochs,
        learning_rate=args.learning_rate,
        base_channels=args.base_channels,
        batch_size=args.batch_size,
        device=args.device,
        evaluation_split=args.evaluation_split,
    )
    manifest = train(config, args.cache, args.output, resume=not args.no_resume)
    print(json.dumps(manifest["evaluation"], indent=2))


if __name__ == "__main__":
    main()
