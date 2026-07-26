"""Train/evaluate the L1 boundary U-Net on leakage-safe synthetic seed families.

This is a real resumable training command, not a UI adapter:

    python -m fslab.learning.train_unet --output runs/unet-v1 --epochs 12
"""
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

from ..datasets import SyntheticSample, learned_dataset_matrix, validate_learned_matrix
from ..science.froth_gen import generate
from ..science.segment import (
    binary_calibration_metrics,
    full_instance_metrics,
    mask_ap,
    summarize_metric_rows,
)
from .unet_watershed import (
    build_model,
    predict,
    predict_probabilities,
    probabilities_to_instances,
    targets,
)


@dataclass(frozen=True)
class TrainConfig:
    seed: int = 20260725
    epochs: int = 24
    learning_rate: float = 8e-4
    image_size: int = 192
    base_channels: int = 24
    batch_size: int = 8
    appearance_variants: int = 2
    device: str = "cuda"


def _seed_everything(seed: int) -> None:
    import torch

    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.use_deterministic_algorithms(True)
    torch.backends.cudnn.benchmark = False


def _loss(logits, truth):
    import torch
    from torch.nn import functional as functional

    # Thin lamella pixels are rare and scientifically load-bearing.
    weights = torch.tensor([1.0, 4.0], device=logits.device)[None, :, None, None]
    bce = functional.binary_cross_entropy_with_logits(logits, truth, reduction="none")
    return (bce * weights).mean()


def _materialize(samples: list[SyntheticSample]):
    import torch

    images = []
    truth = []
    for sample in samples:
        scene = generate(sample.spec)
        images.append(scene["image"].astype(np.float32)[None])
        truth.append(targets(scene["labels"]))
    return torch.from_numpy(np.stack(images)), torch.from_numpy(np.stack(truth))


def _require_device(config: TrainConfig):
    import torch

    if config.device.startswith("cuda") and not torch.cuda.is_available():
        raise RuntimeError("CUDA training was requested but CUDA is unavailable; CPU fallback is forbidden")
    return torch.device(config.device)


def train(config: TrainConfig, output: Path, *, resume: bool = True) -> dict:
    import torch

    _seed_everything(config.seed)
    device = _require_device(config)
    output.mkdir(parents=True, exist_ok=True)
    checkpoint_path = output / "checkpoint.pt"
    model = build_model(config.base_channels).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=config.learning_rate)
    start_epoch = 0
    history: list[dict] = []
    if resume and checkpoint_path.exists():
        checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
        if checkpoint.get("config") != asdict(config):
            raise RuntimeError("checkpoint configuration differs from requested training configuration")
        model.load_state_dict(checkpoint["model"])
        optimizer.load_state_dict(checkpoint["optimizer"])
        for state in optimizer.state.values():
            for key, value in state.items():
                if isinstance(value, torch.Tensor):
                    state[key] = value.to(device)
        start_epoch = int(checkpoint["epoch"]) + 1
        history = list(checkpoint.get("history", []))

    matrix = learned_dataset_matrix(
        image_size=config.image_size,
        appearance_variants=config.appearance_variants,
    )
    matrix_errors = validate_learned_matrix(matrix)
    if matrix_errors:
        raise RuntimeError("invalid learned dataset matrix: " + "; ".join(matrix_errors))
    train_samples = [sample for sample in matrix if sample.split == "train"]
    validation_samples = [sample for sample in matrix if sample.split == "validation"]
    train_images, train_truth = _materialize(train_samples)
    validation_images, validation_truth = _materialize(validation_samples)
    run_started = time.perf_counter()
    for epoch in range(start_epoch, config.epochs):
        model.train()
        order = np.random.default_rng(config.seed + epoch).permutation(len(train_samples))
        losses = []
        for start in range(0, len(order), config.batch_size):
            indices = order[start:start + config.batch_size]
            image = train_images[indices].to(device, non_blocking=True)
            truth = train_truth[indices].to(device, non_blocking=True)
            optimizer.zero_grad(set_to_none=True)
            loss = _loss(model(image), truth)
            loss.backward()
            optimizer.step()
            losses.append(float(loss.detach()))
        model.eval()
        validation_losses = []
        with torch.inference_mode():
            for start in range(0, len(validation_samples), config.batch_size):
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
            "schema": "frothseg.checkpoint/unet-watershed-v2",
            "method": "unet_watershed",
            "epoch": epoch,
            "model": {key: value.detach().cpu() for key, value in model.state_dict().items()},
            "optimizer": optimizer.state_dict(),
            "config": asdict(config),
            "history": history,
        }, checkpoint_path)
        print(
            f"epoch={epoch + 1}/{config.epochs} "
            f"train_loss={row['train_loss']:.5f} "
            f"validation_loss={row['validation_loss']:.5f}",
            flush=True,
        )

    weights_path = output / "weights.npz"
    np.savez_compressed(
        weights_path,
        **{name: tensor.detach().cpu().numpy() for name, tensor in model.state_dict().items()},
    )
    weights_sha256 = hashlib.sha256(weights_path.read_bytes()).hexdigest()
    calibration = calibrate(model, config, matrix, device)
    evaluation = evaluate(model, config, calibration, matrix, device)
    props = torch.cuda.get_device_properties(device) if device.type == "cuda" else None
    manifest = {
        "schema": "frothseg.training-run/v2",
        "method": "unet_watershed",
        "config": asdict(config),
        "dataset": {
            "schema": "frothseg.learned-dataset/v2",
            "condition_count": 16,
            "group_count": len({sample.record.group_id for sample in matrix}),
            "sample_count": len(matrix),
        },
        "environment": {
            "python": platform.python_version(),
            "torch": torch.__version__,
            "cuda_runtime": torch.version.cuda,
            "device": props.name if props else "cpu",
            "device_total_vram_mib": round(props.total_memory / 1024**2) if props else None,
            "peak_allocated_mib": round(torch.cuda.max_memory_allocated(device) / 1024**2, 1)
            if props else None,
        },
        "duration_seconds": round(time.perf_counter() - run_started, 3),
        "resume_checkpoint_local": checkpoint_path.name,
        "inference_weights": {
            "path": weights_path.name,
            "format": "numpy-npz/pytorch-state-dict",
            "bytes": weights_path.stat().st_size,
            "sha256": weights_sha256,
        },
        "n_train": len(train_samples),
        "history": history,
        "calibration": calibration,
        "evaluation": evaluation,
    }
    (output / "run.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def calibrate(model, config: TrainConfig, matrix: list[SyntheticSample], device) -> dict:
    """Tune instance-forming thresholds on calibration only; test stays untouched."""
    cached = []
    for sample in (row for row in matrix if row.split == "calibration"):
        scene = generate(sample.spec)
        cached.append((scene, predict_probabilities(model, scene["image"], device=str(device))))
    best = {"mean_ap": -1.0}
    for foreground_threshold in (0.35, 0.45, 0.55, 0.65):
        for boundary_threshold in (0.3, 0.4, 0.5, 0.6):
            for min_distance in (1, 2, 3, 4):
                values = []
                for scene, probabilities in cached:
                    labels = probabilities_to_instances(
                        probabilities[0], probabilities[1],
                        foreground_threshold=foreground_threshold,
                        boundary_threshold=boundary_threshold,
                        min_distance=min_distance,
                    )
                    score = mask_ap(labels, scene["labels"])["ap"]
                    if score is not None:
                        values.append(score)
                mean_ap = float(np.mean(values))
                if mean_ap > best["mean_ap"]:
                    best = {
                        "mean_ap": mean_ap,
                        "foreground_threshold": foreground_threshold,
                        "boundary_threshold": boundary_threshold,
                        "min_distance": min_distance,
                        "n": len(values),
                        "split": "calibration",
                    }
    return best


def evaluate(
    model,
    config: TrainConfig,
    calibration: dict,
    matrix: list[SyntheticSample],
    device,
) -> dict:
    rows = []
    samples = [sample for sample in matrix if sample.split == "test"]
    for sample in samples:
        scene = generate(sample.spec)
        result = predict(
            model,
            scene["image"],
            device=str(device),
            foreground_threshold=calibration["foreground_threshold"],
            boundary_threshold=calibration["boundary_threshold"],
            min_distance=calibration["min_distance"],
        )
        pixel_calibration = binary_calibration_metrics(
            result.foreground_probability,
            scene["labels"] > 0,
        )
        rows.append({
            "case_id": sample.record.sample_id,
            "condition_id": sample.condition_id,
            "group_id": sample.record.group_id,
            **full_instance_metrics(result.labels, scene["labels"]),
            "brier": pixel_calibration["brier"],
            "ece": pixel_calibration["ece"],
            "pixel_calibration": pixel_calibration,
        })
    summary = summarize_metric_rows(rows, split="test")
    summary["mean_brier"] = float(np.mean([row["brier"] for row in rows]))
    summary["mean_ece"] = float(np.mean([row["ece"] for row in rows]))
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=24)
    parser.add_argument("--image-size", type=int, default=192)
    parser.add_argument("--base-channels", type=int, default=24)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--no-resume", action="store_true")
    args = parser.parse_args()
    config = TrainConfig(
        epochs=args.epochs,
        image_size=args.image_size,
        base_channels=args.base_channels,
        batch_size=args.batch_size,
        device=args.device,
    )
    manifest = train(config, args.output, resume=not args.no_resume)
    print(json.dumps(manifest["evaluation"], indent=2))


if __name__ == "__main__":
    main()
