"""Evaluate official SAM 2.1 video propagation against persistent synthetic ids.

This is a propagation benchmark, not an automatic-discovery benchmark: exact first-frame masks
initialize a fixed cohort and later frames are untouched. It is therefore NOT comparable to the
framewise lane in ``fslab.temporal_bake``, where a method discovers every instance on every frame
with no prompt. The two modes are published side by side with their ``prediction_kind`` attached
so a reader can see which question each row answers.

Every canonical sequence is covered, one propagation run each, so the identity behaviour of a
native video model can be compared across nominal transport, fine bubbles, moving glare, fast
advection, and bursting.
"""

from __future__ import annotations

import argparse
import json
import tempfile
import time
from dataclasses import asdict
from pathlib import Path

import numpy as np
from PIL import Image

from fslab.foundation.sam2_1 import MODEL_ID, UPSTREAM_COMMIT
from fslab.science.froth_gen import CASES, generate_sequence
from fslab.showcase import encode_label_runs, sha256
from fslab.temporal import identity_events, temporal_metrics
from fslab.temporal_bake import SEQUENCE_IDS



def _mean_or_none(values: list) -> float | None:
    """Mean over the rows that HAVE a value; None when none of them do."""
    present = [value for value in values if value is not None]
    return float(np.mean(present)) if present else None

def _iou(left: np.ndarray, right: np.ndarray) -> float:
    intersection = np.logical_and(left, right).sum()
    union = np.logical_or(left, right).sum()
    return float(intersection / union) if union else 1.0


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def _prompted_cohort(first_labels: np.ndarray, objects: int) -> list[int]:
    """Pick a deterministic, area-spread cohort rather than only the easiest large objects."""
    ids, counts = np.unique(first_labels, return_counts=True)
    candidates = [
        (int(instance_id), int(area))
        for instance_id, area in zip(ids, counts)
        if instance_id > 0 and area >= 20
    ]
    if not candidates:
        raise ValueError("sequence has no promptable instance in its first frame")
    ordered = sorted(candidates, key=lambda item: item[1])
    indexes = np.linspace(0, len(ordered) - 1, min(objects, len(ordered)), dtype=int)
    # np.linspace can repeat an index when the cohort is small; keep the ids unique and ordered.
    return sorted({ordered[index][0] for index in indexes})


def _propagate(predictor, torch, sequence: list[dict], prompted_ids: list[int]) -> dict[int, np.ndarray]:
    predicted: dict[int, np.ndarray] = {}
    with tempfile.TemporaryDirectory(prefix="frothseg-sam2-video-") as directory:
        video_dir = Path(directory)
        for index, frame in enumerate(sequence):
            image = np.round(frame["image"] * 255).astype(np.uint8)
            Image.fromarray(image).convert("RGB").save(video_dir / f"{index:05d}.jpg", quality=95)
        with torch.inference_mode(), torch.autocast("cuda", dtype=torch.bfloat16):
            state = predictor.init_state(
                video_path=str(video_dir),
                offload_video_to_cpu=True,
                offload_state_to_cpu=False,
            )
            for object_id in prompted_ids:
                predictor.add_new_mask(
                    state,
                    frame_idx=0,
                    obj_id=object_id,
                    mask=sequence[0]["labels"] == object_id,
                )
            for frame_index, object_ids, logits in predictor.propagate_in_video(state):
                scores = logits[:, 0].float().cpu().numpy()
                best = scores.argmax(axis=0)
                positive = scores.max(axis=0) > 0
                labels = np.zeros(positive.shape, dtype=np.int32)
                ids = np.asarray(object_ids, dtype=np.int32)
                labels[positive] = ids[best[positive]]
                predicted[int(frame_index)] = labels
            predictor.reset_state(state)
    return predicted


def main() -> None:
    import torch
    from sam2.sam2_video_predictor import SAM2VideoPredictor

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/derived/temporal/sam2_1.json"),
    )
    parser.add_argument(
        "--model-run",
        type=Path,
        default=Path("models/sam2-1-hiera-tiny/run.json"),
    )
    parser.add_argument("--objects", type=int, default=12)
    parser.add_argument("--frames", type=int, default=8)
    parser.add_argument("--sequences", default=",".join(SEQUENCE_IDS))
    parser.add_argument(
        "--artifacts-root",
        type=Path,
        help="prediction artifact directory; defaults to the output path without .json",
    )
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("SAM 2.1 video benchmark requires CUDA; CPU fallback is forbidden")
    model_run = json.loads(args.model_run.read_text(encoding="utf-8"))
    if (
        model_run.get("model", {}).get("id") != MODEL_ID
        or model_run.get("upstream_commit") != UPSTREAM_COMMIT
    ):
        raise ValueError("SAM 2.1 model provenance does not match the executable")

    condition_ids = tuple(item.strip() for item in args.sequences.split(",") if item.strip())
    report_root = args.output.resolve().parent
    artifacts_root = (args.artifacts_root or args.output.with_suffix("")).resolve()
    if not artifacts_root.is_relative_to(report_root):
        raise ValueError("prediction artifacts must stay under the temporal report directory")

    started = time.perf_counter()
    predictor = SAM2VideoPredictor.from_pretrained(MODEL_ID, device="cuda", non_overlap_masks=True)
    rows: list[dict] = []
    for condition_id in condition_ids:
        spec = next(case for case in CASES if case.name == condition_id)
        sequence = generate_sequence(spec, frames=args.frames)
        prompted_ids = _prompted_cohort(sequence[0]["labels"], args.objects)
        predicted = _propagate(predictor, torch, sequence, prompted_ids)

        # The prompted cohort is the only thing this protocol is asked to keep, so truth is
        # restricted to it. Scoring against every instance would penalise the model for objects
        # it was never told about, which is a different experiment.
        prompted_truth = []
        for frame in sequence:
            labels = frame["labels"]
            cohort = np.zeros_like(labels)
            for object_id in prompted_ids:
                cohort[labels == object_id] = object_id
            prompted_truth.append(cohort)

        frame_rows = []
        sequence_ious: list[float] = []
        for frame_index, truth_frame in enumerate(sequence):
            labels = predicted[frame_index]
            frame_ious = [
                _iou(labels == object_id, truth_frame["labels"] == object_id)
                for object_id in prompted_ids
            ]
            sequence_ious.extend(frame_ious)
            frame_rows.append({
                "frame": frame_index,
                "mean_identity_iou": float(np.mean(frame_ious)),
                "identity_recall_at_0_5": float(np.mean(np.asarray(frame_ious) >= 0.5)),
            })

        frame_artifacts = []
        for frame_index in range(len(sequence)):
            # Labels only; the overlay is composited in the browser (see fslab.temporal_bake).
            labels = predicted[frame_index]
            frame_root = artifacts_root / condition_id / f"{frame_index:03d}"
            frame_root.mkdir(parents=True, exist_ok=True)
            labels_path = frame_root / "prediction.rle"
            labels_path.write_bytes(encode_label_runs(labels))
            frame_artifacts.append({
                "frame_index": frame_index,
                "prediction_path": labels_path.relative_to(report_root).as_posix(),
                "prediction_sha256": sha256(labels_path),
            })

        metrics = temporal_metrics(
            [predicted[index] for index in range(args.frames)], prompted_truth
        )
        rows.append({
            "condition_id": condition_id,
            **asdict(metrics),
            "prompted_objects": len(prompted_ids),
            "prompted_instance_ids": prompted_ids,
            "mean_identity_iou": float(np.mean(sequence_ious)),
            "identity_recall_at_0_5": float(np.mean(np.asarray(sequence_ious) >= 0.5)),
            "truth_events": identity_events(prompted_truth),
            "predicted_events": identity_events(
                [predicted[index] for index in range(args.frames)]
            ),
            "frame_metrics": frame_rows,
            "frame_artifacts": frame_artifacts,
        })
        print(
            f"[L7] {condition_id:14} identity IoU {rows[-1]['mean_identity_iou']:.3f}  "
            f"IDF1 {metrics.idf1:.3f}  HOTA {metrics.hota:.3f}  "
            f"cohort {len(prompted_ids)}"
        )

    props = torch.cuda.get_device_properties(0)
    flow_values = [row["flow_epe_px"] for row in rows if row["flow_epe_px"] is not None]
    report = {
        "schema": "frothseg.sam2-video-benchmark/v2",
        "method": "sam2_1",
        "method_id": "L7",
        "prediction_kind": "native_prompted_video_propagation",
        "protocol": "first-frame ground-truth mask prompts; forward propagation",
        "model_id": MODEL_ID,
        "upstream_commit": UPSTREAM_COMMIT,
        "checkpoint_sha256": model_run["model"]["sha256"],
        "checkpoint_bytes": model_run["model"]["bytes"],
        "device": props.name,
        "sequence_count": len(rows),
        "frames_per_sequence": args.frames,
        "mean_identity_iou": float(np.mean([row["mean_identity_iou"] for row in rows])),
        "mean_identity_recall_at_0_5": float(
            np.mean([row["identity_recall_at_0_5"] for row in rows])
        ),
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
        "mean_flow_epe_px": float(np.mean(flow_values)) if flow_values else None,
        "duration_seconds": round(time.perf_counter() - started, 3),
        "sequences": rows,
    }
    _write_json(args.output, report)
    print(json.dumps({
        key: report[key] for key in (
            "sequence_count", "mean_identity_iou", "mean_idf1", "mean_hota", "duration_seconds",
        )
    }, indent=2))


if __name__ == "__main__":
    main()
