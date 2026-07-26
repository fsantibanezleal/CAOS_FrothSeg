"""Benchmark L1 temporal consistency on exact-id synthetic sequences."""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from dataclasses import asdict
from pathlib import Path

import numpy as np

from fslab.learning.unet_watershed import load_npz_weights, predict_at_training_scale
from fslab.science.froth_gen import CASES, generate_sequence
from fslab.temporal import temporal_metrics, track_by_iou


def main() -> None:
    import torch

    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=Path("models/unet-watershed-v2"))
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/derived/temporal/unet-watershed-v2.json"),
    )
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("temporal benchmark requires CUDA; CPU fallback is forbidden")
    run = json.loads((args.model / "run.json").read_text(encoding="utf-8"))
    weights_path = args.model / run["inference_weights"]["path"]
    if hashlib.sha256(weights_path.read_bytes()).hexdigest() != run["inference_weights"]["sha256"]:
        raise ValueError("checkpoint checksum mismatch")
    model = load_npz_weights(
        weights_path,
        base_channels=int(run["config"]["base_channels"]),
    ).to("cuda")
    calibration = run["calibration"]
    condition_ids = (
        "poly-normal",
        "fine-froth",
        "glare-storm",
        "motion-fast",
        "bursting",
    )
    rows = []
    started = time.perf_counter()
    for condition_id in condition_ids:
        spec = next(case for case in CASES if case.name == condition_id)
        sequence = generate_sequence(spec, frames=8)
        local_predictions = []
        for frame in sequence:
            prediction = predict_at_training_scale(
                model,
                frame["image"],
                training_size=int(run["config"]["image_size"]),
                device="cuda",
                foreground_threshold=calibration["foreground_threshold"],
                boundary_threshold=calibration["boundary_threshold"],
                min_distance=calibration["min_distance"],
            )
            local_predictions.append(prediction.labels)
        tracked = track_by_iou(local_predictions, threshold=0.25)
        metrics = temporal_metrics(tracked, [frame["labels"] for frame in sequence])
        rows.append({"condition_id": condition_id, **asdict(metrics)})
    report = {
        "schema": "frothseg.temporal-benchmark/v1",
        "method": "unet_watershed",
        "checkpoint_sha256": run["inference_weights"]["sha256"],
        "device": "cuda",
        "sequence_count": len(rows),
        "frames_per_sequence": 8,
        "mean_id_switch_rate": float(np.mean([row["id_switch_rate"] for row in rows])),
        "mean_frame_coverage": float(np.mean([row["mean_frame_coverage"] for row in rows])),
        "mean_idf1": float(np.mean([row["idf1"] for row in rows])),
        "mean_hota": float(np.mean([row["hota"] for row in rows])),
        "total_track_fragmentations": int(sum(row["track_fragmentations"] for row in rows)),
        "mean_event_precision": float(np.mean([row["event_precision"] for row in rows])),
        "mean_event_recall": float(np.mean([row["event_recall"] for row in rows])),
        "mean_flow_epe_px": float(np.mean([
            row["flow_epe_px"] for row in rows if row["flow_epe_px"] is not None
        ])),
        "duration_seconds": round(time.perf_counter() - started, 3),
        "sequences": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
