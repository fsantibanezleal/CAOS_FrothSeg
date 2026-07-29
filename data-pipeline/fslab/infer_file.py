"""Run any registered method over an image file the user supplies.

Everything else in this repository operates on the registered cases or the pinned dataset
cache. That is the right default for a benchmark, and it left a real gap: a practitioner with
a froth photograph had no way to run the ladder over it. The App used to print a command that
claimed to do this and did not exist; the honest fix is to make the command real.

What it does NOT do, because the repository cannot honestly claim it:

* **no accuracy claim.** There is no ground truth for a file the user brings, so the output is
  a mask and its physical descriptors, never a score. Scoring needs an annotation.
* **no video.** Nothing here decodes video. An image sequence is a directory of frames, and
  ``--input`` accepts one so the temporal association lane is reachable, but a container file
  (mp4, avi) is rejected with that reason stated rather than silently mishandled.
* **no calibration transfer.** Post-processing thresholds were fitted on the synthetic
  calibration split. On a real photograph they are a starting point, and the report says so.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
from PIL import Image

from .model_registry import METHODS
from .science.segment import morphometry
from .showcase import encode_label_runs, preview, sha256
from .temporal import IOU_ASSOCIATION_THRESHOLD, track_by_iou

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff"}
VIDEO_SUFFIXES = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".m4v", ".wmv"}


class VideoNotSupported(ValueError):
    """Raised for a video container, with the reason rather than a generic parse failure."""


def load_grayscale(path: Path) -> np.ndarray:
    """Load one image as float32 in [0, 1], matching what every engine expects."""
    if path.suffix.lower() in VIDEO_SUFFIXES:
        raise VideoNotSupported(
            f"{path.name}: this repository does not decode video. Extract frames first "
            "(for example with ffmpeg) and pass the directory of images instead."
        )
    if path.suffix.lower() not in IMAGE_SUFFIXES:
        raise ValueError(f"{path.name}: unsupported image type {path.suffix or '(none)'}")
    with Image.open(path) as handle:
        image = handle.convert("L")
        return np.asarray(image, dtype=np.float32) / 255.0


def collect_inputs(target: Path) -> list[Path]:
    """One image, or every image in a directory sorted by name (an image sequence)."""
    if target.is_dir():
        frames = sorted(
            child for child in target.iterdir()
            if child.is_file() and child.suffix.lower() in IMAGE_SUFFIXES
        )
        if not frames:
            raise ValueError(f"{target}: no images found")
        return frames
    if not target.exists():
        raise FileNotFoundError(f"{target}: no such file or directory")
    return [target]


def _descriptors(labels: np.ndarray, px_per_mm: float | None) -> dict:
    """Instance count and size distribution. Physical units only when a scale is supplied."""
    instances = morphometry(labels)
    diameters = np.array(
        [entry["d_eq"] for entry in instances], dtype=np.float64
    )
    if diameters.size == 0:
        return {"count": 0, "unit": "px", "note": "no instances segmented"}
    if px_per_mm:
        diameters = diameters / px_per_mm
    percentiles = np.percentile(diameters, [10, 50, 90])
    cubed, squared = np.sum(diameters**3), np.sum(diameters**2)
    return {
        "count": int(diameters.size),
        "unit": "mm" if px_per_mm else "px",
        "d10": float(percentiles[0]),
        "d50": float(percentiles[1]),
        "d90": float(percentiles[2]),
        "d32_sauter": float(cubed / squared) if squared else None,
        "mean": float(diameters.mean()),
    }


def infer_path(
    *,
    method_id: str,
    target: Path,
    output_root: Path,
    device: str = "cuda",
    px_per_mm: float | None = None,
    associate: bool = False,
) -> dict:
    """Run one registered method over a file or a directory of frames."""
    from .temporal_bake import frame_predictor

    method = next((entry for entry in METHODS if entry.id == method_id), None)
    if method is None:
        known = ", ".join(entry.id for entry in METHODS)
        raise ValueError(f"unknown method {method_id!r}; registered methods are {known}")
    if method_id == "L7":
        raise ValueError(
            "L7 propagates from first-frame prompts and has no unprompted single-image "
            "lane. Use a framewise method, or scripts/benchmark_sam2_video.py for the "
            "prompted protocol."
        )

    frames = collect_inputs(target)
    predict, checkpoint_sha256 = frame_predictor(method_id, device=device)
    output_root.mkdir(parents=True, exist_ok=True)

    started = time.perf_counter()
    images = [load_grayscale(path) for path in frames]
    predictions = [predict(image) for image in images]
    inference_seconds = time.perf_counter() - started

    # Identity association only makes sense across a sequence, and it is opt-in because a
    # directory of unrelated photographs is not a sequence.
    associated = (
        track_by_iou(predictions, threshold=IOU_ASSOCIATION_THRESHOLD)
        if associate and len(predictions) > 1
        else predictions
    )

    results = []
    for path, image, labels in zip(frames, images, associated):
        stem = path.stem
        labels_path = output_root / f"{stem}.rle"
        overlay_path = output_root / f"{stem}-overlay.png"
        labels_path.write_bytes(encode_label_runs(labels.astype(np.uint16)))
        source = np.rint(np.clip(image, 0.0, 1.0) * 255.0).astype(np.uint8)
        preview(source, labels).save(overlay_path, optimize=True)
        results.append({
            "input": path.name,
            "height": int(labels.shape[0]),
            "width": int(labels.shape[1]),
            "labels_path": labels_path.name,
            "labels_sha256": sha256(labels_path),
            "overlay_path": overlay_path.name,
            "descriptors": _descriptors(labels, px_per_mm),
        })

    report = {
        "schema": "frothseg.file-inference/v1",
        "method_id": method.id,
        "method": method.slug,
        "tier": method.tier,
        "checkpoint_sha256": checkpoint_sha256,
        "device": device if method.learned else "cpu",
        "input": str(target),
        "input_kind": "directory" if target.is_dir() else "file",
        "frame_count": len(frames),
        "identity_association": (
            f"iou@{IOU_ASSOCIATION_THRESHOLD}" if associated is not predictions else "none"
        ),
        "scale_px_per_mm": px_per_mm,
        "inference_seconds": round(inference_seconds, 3),
        "scored": False,
        "scope": (
            "Masks and size descriptors only. No accuracy is reported because a supplied "
            "image has no ground truth; scoring requires an annotation and the offline "
            "evaluation lane. Post-processing thresholds were calibrated on the synthetic "
            "calibration split and are a starting point on real imagery, not a fitted "
            "setting for it."
        ),
        "results": results,
    }
    report_path = output_root / "inference.json"
    with report_path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(report, indent=2) + "\n")
    return report
