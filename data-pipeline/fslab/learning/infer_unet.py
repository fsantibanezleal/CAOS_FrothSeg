"""Batch inference/evaluation for the committed L1 U-Net checkpoint."""
from __future__ import annotations

import argparse
import hashlib
import json
import time
from pathlib import Path

import numpy as np
from PIL import Image

from ..registry import list_cases
from ..science.froth_gen import generate
from ..science.segment import bsd_wasserstein, mask_ap, panoptic_quality
from .unet_watershed import load_npz_weights, predict_at_training_scale


def run(model_dir: Path, output: Path) -> dict:
    run_manifest = json.loads((model_dir / "run.json").read_text(encoding="utf-8"))
    config = run_manifest["config"]
    calibration = run_manifest["calibration"]
    weights = model_dir / run_manifest["inference_weights"]["path"]
    actual_hash = hashlib.sha256(weights.read_bytes()).hexdigest()
    if actual_hash != run_manifest["inference_weights"]["sha256"]:
        raise ValueError("inference checkpoint checksum mismatch")
    model = load_npz_weights(weights, base_channels=int(config["base_channels"]))
    rows = []
    for case in list_cases():
        scene = generate(case.spec)
        started = time.perf_counter()
        result = predict_at_training_scale(
            model,
            scene["image"],
            training_size=int(config["image_size"]),
            foreground_threshold=calibration["foreground_threshold"],
            boundary_threshold=calibration["boundary_threshold"],
            min_distance=calibration["min_distance"],
        )
        inference_ms = (time.perf_counter() - started) * 1000
        case_dir = output / "cases" / case.id
        case_dir.mkdir(parents=True, exist_ok=True)
        mask_path = case_dir / "instances.png"
        Image.fromarray(result.labels.astype(np.uint16)).save(mask_path, optimize=True)
        ap = mask_ap(result.labels, scene["labels"])
        pq = panoptic_quality(result.labels, scene["labels"])
        rows.append({
            "case_id": case.id,
            **ap,
            **pq,
            "bsd_w": bsd_wasserstein(result.labels, scene["labels"]),
            "inference_ms": round(inference_ms, 3),
            "mask_path": str(mask_path.relative_to(output)).replace("\\", "/"),
        })
    scored = [row for row in rows if row["ap"] is not None]
    report = {
        "schema": "frothseg.learned-benchmark/v1",
        "method": "unet_watershed",
        "checkpoint_sha256": actual_hash,
        "split": "canonical-synthetic-diagnostic",
        "n_cases": len(rows),
        "mean_ap": float(np.mean([row["ap"] for row in scored])),
        "mean_ap50": float(np.mean([row["ap50"] for row in scored])),
        "mean_pq": float(np.mean([row["pq"] for row in scored])),
        "cases": rows,
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / "benchmark.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(run(args.model, args.output), indent=2))


if __name__ == "__main__":
    main()
