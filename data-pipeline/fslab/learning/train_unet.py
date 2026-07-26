"""Train/evaluate the L1 boundary U-Net on leakage-safe synthetic seed families.

This is a real resumable training command, not a UI adapter:

    python -m fslab.learning.train_unet --output runs/unet-v1 --epochs 12
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
from dataclasses import asdict, dataclass, replace
from pathlib import Path

import numpy as np

from ..science.froth_gen import CASES, FrothSpec, generate
from ..science.segment import mask_ap, panoptic_quality
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
    epochs: int = 12
    learning_rate: float = 1e-3
    train_variants_per_family: int = 4
    validation_variants_per_family: int = 1
    test_variants_per_family: int = 1
    image_size: int = 128
    base_channels: int = 12


def _variant(spec: FrothSpec, *, split: str, index: int, size: int) -> FrothSpec:
    split_offset = {"train": 10_000, "validation": 20_000, "test": 30_000}[split]
    scale = size / spec.h
    return replace(
        spec,
        name=f"{spec.name}-{split}-v{index:02d}",
        seed=spec.seed + split_offset + index,
        h=size,
        w=size,
        d32_px=max(6.0, spec.d32_px * scale),
        motion_blur=max(0, int(round(spec.motion_blur * scale))),
        defocus=spec.defocus * scale,
    )


def _specs(split: str, count: int, size: int) -> list[FrothSpec]:
    # Empty control is a benchmark control, not a useful supervised training image.
    return [
        _variant(spec, split=split, index=index, size=size)
        for spec in CASES if not spec.empty
        for index in range(count)
    ]


def _seed_everything(seed: int) -> None:
    import torch

    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.use_deterministic_algorithms(True)


def _loss(logits, truth):
    import torch
    from torch.nn import functional as functional

    # Thin lamella pixels are rare and scientifically load-bearing.
    weights = torch.tensor([1.0, 4.0], device=logits.device)[None, :, None, None]
    bce = functional.binary_cross_entropy_with_logits(logits, truth, reduction="none")
    return (bce * weights).mean()


def train(config: TrainConfig, output: Path, *, resume: bool = True) -> dict:
    import torch

    _seed_everything(config.seed)
    output.mkdir(parents=True, exist_ok=True)
    checkpoint_path = output / "checkpoint.pt"
    model = build_model(config.base_channels)
    optimizer = torch.optim.AdamW(model.parameters(), lr=config.learning_rate)
    start_epoch = 0
    history: list[dict] = []
    if resume and checkpoint_path.exists():
        checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
        model.load_state_dict(checkpoint["model"])
        optimizer.load_state_dict(checkpoint["optimizer"])
        start_epoch = int(checkpoint["epoch"]) + 1
        history = list(checkpoint.get("history", []))

    train_specs = _specs("train", config.train_variants_per_family, config.image_size)
    for epoch in range(start_epoch, config.epochs):
        model.train()
        order = np.random.default_rng(config.seed + epoch).permutation(len(train_specs))
        losses = []
        for sample_index in order:
            scene = generate(train_specs[int(sample_index)])
            image = torch.from_numpy(scene["image"].astype(np.float32))[None, None]
            truth = torch.from_numpy(targets(scene["labels"]))[None]
            optimizer.zero_grad(set_to_none=True)
            loss = _loss(model(image), truth)
            loss.backward()
            optimizer.step()
            losses.append(float(loss.detach()))
        row = {"epoch": epoch, "loss": float(np.mean(losses))}
        history.append(row)
        torch.save({
            "schema": "frothseg.checkpoint/unet-watershed-v1",
            "method": "unet_watershed",
            "epoch": epoch,
            "model": model.state_dict(),
            "optimizer": optimizer.state_dict(),
            "config": asdict(config),
            "history": history,
        }, checkpoint_path)
        print(f"epoch={epoch + 1}/{config.epochs} loss={row['loss']:.5f}", flush=True)

    weights_path = output / "weights.npz"
    np.savez_compressed(
        weights_path,
        **{name: tensor.detach().cpu().numpy() for name, tensor in model.state_dict().items()},
    )
    weights_sha256 = hashlib.sha256(weights_path.read_bytes()).hexdigest()
    calibration = calibrate(model, config)
    evaluation = evaluate(model, config, calibration)
    manifest = {
        "schema": "frothseg.training-run/v1",
        "method": "unet_watershed",
        "config": asdict(config),
        "resume_checkpoint_local": checkpoint_path.name,
        "inference_weights": {
            "path": weights_path.name,
            "format": "numpy-npz/pytorch-state-dict",
            "bytes": weights_path.stat().st_size,
            "sha256": weights_sha256,
        },
        "n_train": len(train_specs),
        "history": history,
        "calibration": calibration,
        "evaluation": evaluation,
    }
    (output / "run.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def calibrate(model, config: TrainConfig) -> dict:
    """Tune instance-forming thresholds on validation only; test stays untouched."""
    cached = []
    for spec in _specs("validation", config.validation_variants_per_family, config.image_size):
        scene = generate(spec)
        cached.append((scene, predict_probabilities(model, scene["image"])))
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
                    }
    return best


def evaluate(model, config: TrainConfig, calibration: dict) -> dict:
    rows = []
    specs = _specs("test", config.test_variants_per_family, config.image_size)
    for spec in specs:
        scene = generate(spec)
        result = predict(
            model,
            scene["image"],
            foreground_threshold=calibration["foreground_threshold"],
            boundary_threshold=calibration["boundary_threshold"],
            min_distance=calibration["min_distance"],
        )
        ap = mask_ap(result.labels, scene["labels"])
        pq = panoptic_quality(result.labels, scene["labels"])
        rows.append({"case_id": spec.name, **ap, **pq})
    scored = [row for row in rows if row["ap"] is not None]
    return {
        "split": "test",
        "n": len(rows),
        "mean_ap": float(np.mean([row["ap"] for row in scored])),
        "mean_ap50": float(np.mean([row["ap50"] for row in scored])),
        "mean_pq": float(np.mean([row["pq"] for row in scored])),
        "cases": rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--image-size", type=int, default=128)
    parser.add_argument("--base-channels", type=int, default=12)
    parser.add_argument("--no-resume", action="store_true")
    args = parser.parse_args()
    config = TrainConfig(
        epochs=args.epochs,
        image_size=args.image_size,
        base_channels=args.base_channels,
    )
    manifest = train(config, args.output, resume=not args.no_resume)
    print(json.dumps(manifest["evaluation"], indent=2))


if __name__ == "__main__":
    main()
