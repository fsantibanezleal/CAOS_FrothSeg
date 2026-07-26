"""Evaluate official SAM 2.1 video propagation against persistent synthetic ids.

This is a propagation benchmark, not an automatic-discovery benchmark: exact
first-frame masks initialize a fixed cohort and later frames are untouched.
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
from fslab.temporal import temporal_metrics


def _iou(left: np.ndarray, right: np.ndarray) -> float:
    intersection = np.logical_and(left, right).sum()
    union = np.logical_or(left, right).sum()
    return float(intersection / union) if union else 1.0


def main() -> None:
    import torch
    from sam2.sam2_video_predictor import SAM2VideoPredictor

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/derived/temporal/sam2-1-hiera-tiny.json"),
    )
    parser.add_argument("--objects", type=int, default=12)
    parser.add_argument("--frames", type=int, default=8)
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("SAM 2.1 video benchmark requires CUDA; CPU fallback is forbidden")

    spec = next(case for case in CASES if case.name == "motion-fast")
    sequence = generate_sequence(spec, frames=args.frames)
    first_ids, counts = np.unique(sequence[0]["labels"], return_counts=True)
    candidates = [
        (int(instance_id), int(area))
        for instance_id, area in zip(first_ids, counts)
        if instance_id > 0 and area >= 20
    ]
    # Deterministic area-spread cohort rather than only the easiest large objects.
    ordered = sorted(candidates, key=lambda item: item[1])
    indexes = np.linspace(0, len(ordered) - 1, args.objects, dtype=int)
    prompted_ids = [ordered[index][0] for index in indexes]

    started = time.perf_counter()
    predictor = SAM2VideoPredictor.from_pretrained(
        MODEL_ID,
        device="cuda",
        non_overlap_masks=True,
    )
    predicted: dict[int, np.ndarray] = {}
    with tempfile.TemporaryDirectory(prefix="frothseg-sam2-video-") as directory:
        video_dir = Path(directory)
        for index, frame in enumerate(sequence):
            image = np.round(frame["image"] * 255).astype(np.uint8)
            Image.fromarray(image).convert("RGB").save(
                video_dir / f"{index:05d}.jpg", quality=95,
            )
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

    frame_rows = []
    all_ious = []
    for frame_index, truth_frame in enumerate(sequence):
        frame_ious = []
        labels = predicted[frame_index]
        for object_id in prompted_ids:
            value = _iou(labels == object_id, truth_frame["labels"] == object_id)
            frame_ious.append(value)
            all_ious.append(value)
        frame_rows.append({
            "frame": frame_index,
            "mean_identity_iou": float(np.mean(frame_ious)),
            "identity_recall_at_0_5": float(np.mean(np.asarray(frame_ious) >= 0.5)),
        })

    props = torch.cuda.get_device_properties(0)
    prompted_truth = []
    for frame in sequence:
        labels = frame["labels"]
        cohort = np.zeros_like(labels)
        for object_id in prompted_ids:
            cohort[labels == object_id] = object_id
        prompted_truth.append(cohort)
    report = {
        "schema": "frothseg.sam2-video-benchmark/v1",
        "method": "sam2_1",
        "protocol": "first-frame ground-truth mask prompts; forward propagation",
        "condition_id": spec.name,
        "model_id": MODEL_ID,
        "upstream_commit": UPSTREAM_COMMIT,
        "device": props.name,
        "frames": args.frames,
        "prompted_objects": len(prompted_ids),
        "prompted_instance_ids": prompted_ids,
        "mean_identity_iou": float(np.mean(all_ious)),
        "identity_recall_at_0_5": float(np.mean(np.asarray(all_ious) >= 0.5)),
        "temporal_metrics": asdict(temporal_metrics(
            [predicted[index] for index in range(args.frames)],
            prompted_truth,
        )),
        "duration_seconds": round(time.perf_counter() - started, 3),
        "frame_metrics": frame_rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
