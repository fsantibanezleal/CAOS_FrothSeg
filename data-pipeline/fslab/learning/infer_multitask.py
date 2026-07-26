"""Canonical diagnostic inference for L2/L3/N1 trained methods."""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from pathlib import Path

import numpy as np
from PIL import Image
from skimage.transform import resize

from ..registry import list_cases
from ..science.froth_gen import generate
from ..science.segment import (
    binary_calibration_metrics,
    full_instance_metrics,
    summarize_metric_rows,
)
from .multitask_models import build_model, probabilities_to_instances


def run(model_dir: Path, output: Path, *, device: str = "cuda") -> dict:
    import torch

    if device.startswith("cuda") and not torch.cuda.is_available():
        raise RuntimeError("CUDA inference requested but unavailable; CPU fallback is forbidden")
    manifest = json.loads((model_dir / "run.json").read_text(encoding="utf-8"))
    config = manifest["config"]
    calibration = manifest["calibration"]
    weights_path = model_dir / manifest["inference_weights"]["path"]
    actual_hash = hashlib.sha256(weights_path.read_bytes()).hexdigest()
    if actual_hash != manifest["inference_weights"]["sha256"]:
        raise ValueError("checkpoint checksum mismatch")
    model = build_model(config["method"], int(config["base_channels"]))
    archive = np.load(weights_path)
    model.load_state_dict({
        name: torch.from_numpy(archive[name]) for name in archive.files
    })
    model.to(device).eval()
    training_size = 192
    rows = []
    for case in list_cases():
        scene = generate(case.spec)
        small = resize(
            scene["image"],
            (training_size, training_size),
            order=1,
            preserve_range=True,
            anti_aliasing=True,
        ).astype(np.float32)
        tensor = torch.from_numpy(small)[None, None].to(device)
        started = time.perf_counter()
        with torch.inference_mode():
            small_probabilities = torch.sigmoid(model(tensor))[0].cpu().numpy()
        probabilities = np.stack([
            resize(channel, scene["image"].shape, order=1, preserve_range=True)
            for channel in small_probabilities
        ])
        scale = max(scene["image"].shape) / training_size
        labels = probabilities_to_instances(
            probabilities,
            foreground_threshold=calibration["foreground_threshold"],
            boundary_threshold=calibration["boundary_threshold"],
            marker_threshold=calibration["marker_threshold"],
            min_distance=max(1, int(round(calibration["min_distance"] * scale))),
            center_weight=calibration.get("center_weight", 0.5),
        )
        inference_ms = (time.perf_counter() - started) * 1000
        case_dir = output / "cases" / case.id
        case_dir.mkdir(parents=True, exist_ok=True)
        mask_path = case_dir / "instances.png"
        Image.fromarray(labels.astype(np.uint16)).save(mask_path, optimize=True)
        rows.append({
            "case_id": case.id,
            **full_instance_metrics(labels, scene["labels"]),
            **{
                key: value
                for key, value in binary_calibration_metrics(
                    probabilities[0],
                    scene["labels"] > 0,
                ).items()
                if key in {"brier", "ece"}
            },
            "inference_ms": round(inference_ms, 3),
            "mask_path": str(mask_path.relative_to(output)).replace("\\", "/"),
        })
    scored = [row for row in rows if row["ap"] is not None]
    metric_summary = summarize_metric_rows(rows, split="canonical-synthetic-diagnostic")
    report = {
        "schema": "frothseg.learned-benchmark/v1",
        "method": config["method"],
        "checkpoint_sha256": actual_hash,
        "split": "canonical-synthetic-diagnostic",
        "device": device,
        "n_cases": len(rows),
        "mean_ap": float(np.mean([row["ap"] for row in scored])),
        "mean_ap50": float(np.mean([row["ap50"] for row in scored])),
        "mean_pq": float(np.mean([row["pq"] for row in scored])),
        "metric_summary": {
            key: value for key, value in metric_summary.items()
            if key not in {"cases", "split", "n"}
        },
        "cases": rows,
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / "benchmark.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--device", default="cuda")
    args = parser.parse_args()
    report = run(args.model, args.output, device=args.device)
    print(json.dumps({
        key: report[key] for key in ("method", "mean_ap", "mean_ap50", "mean_pq")
    }, indent=2))


if __name__ == "__main__":
    main()
