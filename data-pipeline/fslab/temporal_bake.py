"""Precomputed temporal inference for every registered method.

The still benchmark answers "how good is this mask". A froth cell is a moving system, so the
sequence lane answers a different question: does a method keep an identity on a bubble while
the surface advects, glares, and bursts. Answering it for one method is an anecdote; the whole
registry under one protocol is a comparison.

Two prediction modes exist, and the difference is reported rather than hidden:

* ``framewise_segmentation_with_iou_identity_association`` (C1-C7, L1-L6, N1). The method has no
  temporal model. It segments each frame independently and identities are assigned afterwards by
  greedy IoU association (:func:`fslab.temporal.track_by_iou`). Identity performance here measures
  the stability of the masks, not a tracker the method owns.
* ``native_prompted_video_propagation`` (L7). SAM 2.1 carries its own memory across frames and is
  prompted once on the first frame, so its identities come from the engine. Baked separately by
  ``scripts/benchmark_sam2_video.py``.

Mixing the two in one ranking would be dishonest, so every published row carries its ``mode``.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections.abc import Callable
from dataclasses import asdict
from pathlib import Path

import numpy as np

from .model_registry import METHODS
from .science.froth_gen import CASES, generate_sequence
from .science.segment import METHODS as CLASSICAL_METHODS
from .showcase import encode_label_runs, sha256
from .temporal import (
    FRAMES,
    FRAMEWISE_MODE,
    FRAMEWISE_PROTOCOL,
    IOU_ASSOCIATION_THRESHOLD,
    SEQUENCE_IDS,
    identity_events,
    temporal_metrics,
    track_by_iou,
)

__all__ = [
    "FRAMES",
    "FRAMEWISE_METHOD_IDS",
    "FRAMEWISE_MODE",
    "FRAMEWISE_PROTOCOL",
    "IOU_ASSOCIATION_THRESHOLD",
    "SEQUENCE_IDS",
    "bake_method",
    "frame_predictor",
    "report_filename",
]

#: Methods baked by this module. L7 propagates natively and is baked by its own script.
FRAMEWISE_METHOD_IDS: tuple[str, ...] = tuple(
    method.id for method in METHODS if method.id != "L7"
)

MODEL_DIRS = {
    "L1": Path("models/unet-watershed-v2"),
    "L2": Path("models/deep-marker-watershed-v1"),
    "L3": Path("models/gc-fsegnet-v1"),
    "L4": Path("models/stardist-froth-v1"),
    "L5": Path("models/cellpose-sam-cpsam-v2"),
    "L6": Path("models/yolo-froth-seg-v1"),
    "N1": Path("models/lamellastar-v1"),
}

Predictor = Callable[[np.ndarray], np.ndarray]


def _verify_checkpoint(model_dir: Path, manifest: dict) -> tuple[Path, str]:
    """Refuse to publish evidence from a checkpoint that is not the one recorded in run.json."""
    weights_path = model_dir / manifest["inference_weights"]["path"]
    digest = hashlib.sha256(weights_path.read_bytes()).hexdigest()
    if digest != manifest["inference_weights"]["sha256"]:
        raise ValueError(f"{model_dir}: checkpoint checksum mismatch")
    return weights_path, digest


def _classical_predictor(slug: str) -> tuple[Predictor, str | None]:
    engine = CLASSICAL_METHODS[slug]

    def predict(image: np.ndarray) -> np.ndarray:
        return np.asarray(engine(image.astype(np.float32)), dtype=np.int32)

    return predict, None


def _unet_predictor(model_dir: Path, device: str) -> tuple[Predictor, str]:
    import torch  # noqa: F401  (import guarded here so the classical lane stays torch-free)

    from .learning.unet_watershed import load_npz_weights, predict_at_training_scale

    manifest = json.loads((model_dir / "run.json").read_text(encoding="utf-8"))
    weights_path, digest = _verify_checkpoint(model_dir, manifest)
    config = manifest["config"]
    calibration = manifest["calibration"]
    model = load_npz_weights(weights_path, base_channels=int(config["base_channels"])).to(device)

    def predict(image: np.ndarray) -> np.ndarray:
        prediction = predict_at_training_scale(
            model,
            image,
            training_size=int(config["image_size"]),
            device=device,
            foreground_threshold=calibration["foreground_threshold"],
            boundary_threshold=calibration["boundary_threshold"],
            min_distance=calibration["min_distance"],
        )
        return np.asarray(prediction.labels, dtype=np.int32)

    return predict, digest


def _multitask_predictor(model_dir: Path, device: str) -> tuple[Predictor, str]:
    """L2, L3 and N1 share the multitask head; only the graph and calibration differ."""
    import torch
    from skimage.transform import resize

    from .learning.multitask_models import build_model, probabilities_to_instances

    manifest = json.loads((model_dir / "run.json").read_text(encoding="utf-8"))
    weights_path, digest = _verify_checkpoint(model_dir, manifest)
    config = manifest["config"]
    calibration = manifest["calibration"]
    model = build_model(config["method"], int(config["base_channels"]))
    archive = np.load(weights_path)
    model.load_state_dict({name: torch.from_numpy(archive[name]) for name in archive.files})
    model.to(device).eval()
    # Mirrors fslab.learning.infer_multitask: the graph was trained at 192 px and the physical
    # receptive field only stays correct if inference resamples to the same scale.
    training_size = 192

    def predict(image: np.ndarray) -> np.ndarray:
        small = resize(
            image, (training_size, training_size),
            order=1, preserve_range=True, anti_aliasing=True,
        ).astype(np.float32)
        tensor = torch.from_numpy(small)[None, None].to(device)
        with torch.inference_mode():
            small_probabilities = torch.sigmoid(model(tensor))[0].cpu().numpy()
        probabilities = np.stack([
            resize(channel, image.shape, order=1, preserve_range=True)
            for channel in small_probabilities
        ])
        scale = max(image.shape) / training_size
        return np.asarray(
            probabilities_to_instances(
                probabilities,
                foreground_threshold=calibration["foreground_threshold"],
                boundary_threshold=calibration["boundary_threshold"],
                marker_threshold=calibration["marker_threshold"],
                min_distance=max(1, int(round(calibration["min_distance"] * scale))),
                center_weight=calibration.get("center_weight", 0.5),
            ),
            dtype=np.int32,
        )

    return predict, digest


def _stardist_predictor(model_dir: Path) -> tuple[Predictor, str]:
    from csbdeep.utils import normalize
    from stardist.models import StarDist2D

    manifest = json.loads((model_dir / "run.json").read_text(encoding="utf-8"))
    weights_path, digest = _verify_checkpoint(model_dir, manifest)
    model = StarDist2D(None, name=model_dir.name, basedir=str(model_dir.parent))

    def predict(image: np.ndarray) -> np.ndarray:
        normalized = normalize(image.astype(np.float32), 1, 99.8, axis=(0, 1))
        labels, _ = model.predict_instances(normalized)
        return np.asarray(labels, dtype=np.int32)

    _ = weights_path
    return predict, digest


def _cellpose_predictor(model_dir: Path) -> tuple[Predictor, str]:
    import torch
    from cellpose import models

    if not torch.cuda.is_available():
        raise RuntimeError("Cellpose-SAM requires CUDA; CPU fallback is forbidden")
    manifest = json.loads((model_dir / "run.json").read_text(encoding="utf-8"))
    pretrained = manifest.get("pretrained_model", "cpsam_v2")
    model = models.CellposeModel(gpu=True, pretrained_model=str(pretrained), use_bfloat16=True)
    digest = hashlib.sha256(Path(model.pretrained_model).read_bytes()).hexdigest()

    def predict(image: np.ndarray) -> np.ndarray:
        masks, _, _ = model.eval(
            [image.astype(np.float32)],
            batch_size=1,
            channel_axis=None,
            normalize=True,
            diameter=None,
            flow_threshold=0.4,
            cellprob_threshold=0.0,
            min_size=5,
        )
        return np.asarray(masks[0], dtype=np.int32)

    return predict, digest


def _yolo_predictor(model_dir: Path) -> tuple[Predictor, str]:
    from ultralytics import YOLO

    from .learning.train_yolo_seg import _results_to_labels

    weights_path = model_dir / "weights" / "best.pt"
    digest = hashlib.sha256(weights_path.read_bytes()).hexdigest()
    model = YOLO(str(weights_path))

    def predict(image: np.ndarray) -> np.ndarray:
        frame = np.repeat(
            np.round(np.clip(image, 0.0, 1.0) * 255).astype(np.uint8)[:, :, None], 3, axis=2
        )
        result = model.predict(
            source=[frame], imgsz=256, conf=0.1, iou=0.7, device=0, batch=1, verbose=False
        )[0]
        return np.asarray(_results_to_labels(result, image.shape), dtype=np.int32)

    return predict, digest


def frame_predictor(method_id: str, *, device: str = "cuda") -> tuple[Predictor, str | None]:
    """Return ``(predict, checkpoint_sha256)`` for one method's single-frame inference."""
    method = next(entry for entry in METHODS if entry.id == method_id)
    if method.tier == "classical":
        return _classical_predictor(method.slug)
    if method_id == "L1":
        return _unet_predictor(MODEL_DIRS[method_id], device)
    if method_id in {"L2", "L3", "N1"}:
        return _multitask_predictor(MODEL_DIRS[method_id], device)
    if method_id == "L4":
        return _stardist_predictor(MODEL_DIRS[method_id])
    if method_id == "L5":
        return _cellpose_predictor(MODEL_DIRS[method_id])
    if method_id == "L6":
        return _yolo_predictor(MODEL_DIRS[method_id])
    raise ValueError(f"{method_id} has no framewise predictor (L7 propagates natively)")


def bake_method(
    method_id: str,
    *,
    report_path: Path,
    artifacts_root: Path | None = None,
    device: str = "cuda",
    sequence_ids: tuple[str, ...] = SEQUENCE_IDS,
) -> dict:
    """Run one method over every canonical sequence and write its temporal evidence."""
    method = next(entry for entry in METHODS if entry.id == method_id)
    report_root = report_path.resolve().parent
    artifacts_root = (artifacts_root or report_path.with_suffix("")).resolve()
    if not artifacts_root.is_relative_to(report_root):
        raise ValueError("prediction artifacts must stay under the temporal report directory")

    predict, checkpoint_sha256 = frame_predictor(method_id, device=device)
    rows: list[dict] = []
    started = time.perf_counter()
    for condition_id in sequence_ids:
        spec = next(case for case in CASES if case.name == condition_id)
        sequence = generate_sequence(spec, frames=FRAMES)
        predictions = [predict(frame["image"]) for frame in sequence]
        tracked = track_by_iou(predictions, threshold=IOU_ASSOCIATION_THRESHOLD)
        metrics = temporal_metrics(tracked, [frame["labels"] for frame in sequence])
        frame_artifacts = []
        for frame, labels in zip(sequence, tracked):
            # Only the label runs are written. A rendered overlay is source + labels, which the
            # browser composites on a canvas; baking it as a PNG per frame per method added
            # 63 MB of artifacts carrying no information the labels did not already hold.
            frame_index = int(frame["frame_index"])
            frame_root = artifacts_root / condition_id / f"{frame_index:03d}"
            frame_root.mkdir(parents=True, exist_ok=True)
            labels_path = frame_root / "prediction.rle"
            labels_path.write_bytes(encode_label_runs(labels))
            frame_artifacts.append({
                "frame_index": frame_index,
                "prediction_path": labels_path.relative_to(report_root).as_posix(),
                "prediction_sha256": sha256(labels_path),
            })
        rows.append({
            "condition_id": condition_id,
            **asdict(metrics),
            "truth_events": identity_events(
                [np.asarray(frame["labels"], dtype=np.int32) for frame in sequence]
            ),
            "predicted_events": identity_events(tracked),
            "frame_artifacts": frame_artifacts,
        })

    flow_values = [row["flow_epe_px"] for row in rows if row["flow_epe_px"] is not None]
    report = {
        "schema": "frothseg.temporal-benchmark/v1",
        "method": method.slug,
        "method_id": method.id,
        "prediction_kind": FRAMEWISE_MODE,
        "checkpoint_sha256": checkpoint_sha256,
        "device": device if method.learned else "cpu",
        "sequence_count": len(rows),
        "frames_per_sequence": FRAMES,
        "association_threshold": IOU_ASSOCIATION_THRESHOLD,
        "mean_id_switch_rate": float(np.mean([row["id_switch_rate"] for row in rows])),
        "mean_frame_coverage": float(np.mean([row["mean_frame_coverage"] for row in rows])),
        "mean_idf1": float(np.mean([row["idf1"] for row in rows])),
        "mean_hota": float(np.mean([row["hota"] for row in rows])),
        "total_track_fragmentations": int(sum(row["track_fragmentations"] for row in rows)),
        "mean_event_precision": float(np.mean([row["event_precision"] for row in rows])),
        "mean_event_recall": float(np.mean([row["event_recall"] for row in rows])),
        "mean_flow_epe_px": float(np.mean(flow_values)) if flow_values else None,
        "duration_seconds": round(time.perf_counter() - started, 3),
        "sequences": rows,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    with report_path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(report, indent=2, sort_keys=True) + "\n")
    return report


def report_filename(method_id: str) -> str:
    """Report file name for a method. Slug-keyed so the path never drifts from the registry."""
    return f"{next(entry for entry in METHODS if entry.id == method_id).slug}.json"
