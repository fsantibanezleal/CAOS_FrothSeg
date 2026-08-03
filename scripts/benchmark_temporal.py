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
from fslab.showcase import encode_label_runs, preview, sha256
from fslab.temporal import identity_events, temporal_metrics, track_by_iou



def _mean_or_none(values: list) -> float | None:
    """Mean over the rows that HAVE a value; None when none of them do."""
    present = [value for value in values if value is not None]
    return float(np.mean(present)) if present else None

def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def main() -> None:
    import torch

    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=Path("models/unet-watershed-v2"))
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/derived/temporal/unet-watershed-v2.json"),
    )
    parser.add_argument(
        "--artifacts-root",
        type=Path,
        help="prediction artifact directory; defaults to the output path without .json",
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
    report_root = args.output.resolve().parent
    artifacts_root = (args.artifacts_root or args.output.with_suffix("")).resolve()
    if not artifacts_root.is_relative_to(report_root):
        raise ValueError("prediction artifacts must stay under the temporal report directory")
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
        frame_artifacts = []
        for frame, labels in zip(sequence, tracked):
            frame_index = int(frame["frame_index"])
            frame_root = artifacts_root / condition_id / f"{frame_index:03d}"
            frame_root.mkdir(parents=True, exist_ok=True)
            labels_path = frame_root / "prediction.rle"
            overlay_path = frame_root / "prediction-overlay.png"
            source = np.rint(np.clip(frame["image"], 0.0, 1.0) * 255.0).astype(np.uint8)
            labels_path.write_bytes(encode_label_runs(labels))
            preview(source, labels).save(overlay_path, optimize=True)
            frame_artifacts.append(
                {
                    "frame_index": frame_index,
                    "prediction_path": labels_path.relative_to(report_root).as_posix(),
                    "prediction_sha256": sha256(labels_path),
                    "overlay_path": overlay_path.relative_to(report_root).as_posix(),
                    "overlay_sha256": sha256(overlay_path),
                }
            )
        rows.append(
            {
                "condition_id": condition_id,
                **asdict(metrics),
                "truth_events": identity_events(
                    [np.asarray(frame["labels"], dtype=np.int32) for frame in sequence]
                ),
                "predicted_events": identity_events(tracked),
                "frame_artifacts": frame_artifacts,
            }
        )
    report = {
        "schema": "frothseg.temporal-benchmark/v1",
        "method": "unet_watershed",
        "method_id": "L1",
        "prediction_kind": "framewise_segmentation_with_iou_identity_association",
        "checkpoint_sha256": run["inference_weights"]["sha256"],
        "device": "cuda",
        "sequence_count": len(rows),
        "frames_per_sequence": 8,
        "mean_id_switch_rate": float(np.mean([row["id_switch_rate"] for row in rows])),
        "mean_frame_coverage": float(np.mean([row["mean_frame_coverage"] for row in rows])),
        "mean_idf1": float(np.mean([row["idf1"] for row in rows])),
        "mean_hota": float(np.mean([row["hota"] for row in rows])),
        "total_track_fragmentations": int(sum(row["track_fragmentations"] for row in rows)),
        # None rows are sequences with no events at all. Averaging them as 1.0 published a
        # perfect event score for a lane that detected nothing; averaging them as 0.0 would be
        # equally wrong. They are excluded, and the mean is None when every row is None.
        "mean_event_precision": _mean_or_none([row["event_precision"] for row in rows]),
        "mean_event_recall": _mean_or_none([row["event_recall"] for row in rows]),
        "event_sequences_without_events": sum(
            1 for row in rows if row["event_precision"] is None
        ),
        "mean_flow_epe_px": float(np.mean([
            row["flow_epe_px"] for row in rows if row["flow_epe_px"] is not None
        ])),
        "duration_seconds": round(time.perf_counter() - started, 3),
        "sequences": rows,
    }
    _write_json(args.output, report)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
