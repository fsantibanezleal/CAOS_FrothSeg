"""Official Ultralytics YOLO instance-segmentation training and evaluation."""

from __future__ import annotations

import hashlib
import json
import platform
import shutil
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from ..learning.data_cache import load_cache, select_split
from ..registry import list_cases
from ..science.froth_gen import generate
from ..science.segment import bsd_wasserstein, mask_ap, panoptic_quality


def _polygon_lines(labels: np.ndarray) -> list[str]:
    height, width = labels.shape
    lines = []
    for instance_id in np.unique(labels):
        if instance_id == 0:
            continue
        mask = (labels == instance_id).astype(np.uint8)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue
        contour = max(contours, key=cv2.contourArea)
        epsilon = max(0.5, 0.006 * cv2.arcLength(contour, True))
        polygon = cv2.approxPolyDP(contour, epsilon, True).reshape(-1, 2)
        if len(polygon) < 3:
            continue
        coordinates = []
        for x, y in polygon:
            coordinates.extend((x / width, y / height))
        lines.append("0 " + " ".join(f"{value:.6f}" for value in coordinates))
    return lines


def export_dataset(cache_path: Path, output: Path) -> Path:
    cache = load_cache(cache_path)
    for split, yolo_split in (("train", "train"), ("validation", "val")):
        selected = select_split(cache, split)
        image_dir = output / "images" / yolo_split
        label_dir = output / "labels" / yolo_split
        image_dir.mkdir(parents=True, exist_ok=True)
        label_dir.mkdir(parents=True, exist_ok=True)
        for index, sample_id in enumerate(selected["sample_ids"]):
            image = np.repeat(selected["images"][index, :, :, None], 3, axis=2)
            Image.fromarray(image).save(image_dir / f"{sample_id}.png", optimize=True)
            lines = _polygon_lines(selected["labels"][index])
            (label_dir / f"{sample_id}.txt").write_text(
                "\n".join(lines) + ("\n" if lines else ""),
                encoding="utf-8",
            )
    yaml_path = output / "dataset.yaml"
    yaml_path.write_text(
        "\n".join((
            f"path: {output.resolve().as_posix()}",
            "train: images/train",
            "val: images/val",
            "names:",
            "  0: bubble",
            "",
        )),
        encoding="utf-8",
    )
    return yaml_path


def _results_to_labels(result, shape: tuple[int, int]) -> np.ndarray:
    labels = np.zeros(shape, dtype=np.int32)
    if result.masks is None or len(result.masks.data) == 0:
        return labels
    masks = result.masks.data.cpu().numpy()
    confidences = result.boxes.conf.cpu().numpy()
    order = np.argsort(confidences)
    for instance_id, index in enumerate(order, start=1):
        mask = masks[index]
        if mask.shape != shape:
            mask = cv2.resize(mask, (shape[1], shape[0]), interpolation=cv2.INTER_NEAREST)
        labels[mask >= 0.5] = instance_id
    return labels


def _summary(rows: list[dict], *, split: str) -> dict:
    scored = [row for row in rows if row["ap"] is not None]
    return {
        "split": split,
        "n": len(rows),
        "mean_ap": float(np.mean([row["ap"] for row in scored])),
        "mean_ap50": float(np.mean([row["ap50"] for row in scored])),
        "mean_pq": float(np.mean([row["pq"] for row in scored])),
        "cases": rows,
    }


def train(
    cache_path: Path,
    dataset_dir: Path,
    output: Path,
    canonical_output: Path,
    *,
    epochs: int = 20,
    existing_checkpoint: Path | None = None,
) -> dict:
    import torch
    from ultralytics import YOLO, __version__ as ultralytics_version

    if not torch.cuda.is_available():
        raise RuntimeError("YOLO segmentation training requires CUDA; CPU fallback is forbidden")
    yaml_path = export_dataset(cache_path, dataset_dir)
    started = time.perf_counter()
    training_results_source: Path | None = None
    if existing_checkpoint is None:
        model = YOLO("yolo11n-seg.pt")
        train_result = model.train(
            data=str(yaml_path),
            epochs=epochs,
            imgsz=192,
            batch=16,
            device=0,
            workers=0,
            seed=20260725,
            deterministic=True,
            project=str(output.parent.resolve()),
            name=output.name,
            exist_ok=True,
            cache="disk",
            plots=True,
            verbose=False,
        )
        source_best_path = Path(train_result.save_dir) / "weights" / "best.pt"
        training_results_source = Path(train_result.save_dir) / "results.csv"
    else:
        source_best_path = existing_checkpoint.resolve()
        training_results_source = source_best_path.parents[1] / "results.csv"
    output.mkdir(parents=True, exist_ok=True)
    best_path = output / "weights" / "best.pt"
    best_path.parent.mkdir(parents=True, exist_ok=True)
    if source_best_path.resolve() != best_path.resolve():
        shutil.copy2(source_best_path, best_path)
    if training_results_source.exists():
        shutil.copy2(training_results_source, output / "training-results.csv")
    model = YOLO(str(best_path))
    cache = load_cache(cache_path)
    test = select_split(cache, "test")
    test_images = [
        np.repeat(image[:, :, None], 3, axis=2) for image in test["images"]
    ]
    predictions = model.predict(
        source=test_images,
        imgsz=192,
        conf=0.1,
        iou=0.7,
        device=0,
        batch=16,
        verbose=False,
    )
    test_rows = []
    for index, result in enumerate(predictions):
        labels = _results_to_labels(result, test["labels"][index].shape)
        test_rows.append({
            "sample_id": str(test["sample_ids"][index]),
            "condition_id": str(test["conditions"][index]),
            "group_id": str(test["group_ids"][index]),
            **mask_ap(labels, test["labels"][index]),
            **panoptic_quality(labels, test["labels"][index]),
        })
    evaluation = _summary(test_rows, split="test")

    cases_and_scenes = [(case, generate(case.spec)) for case in list_cases()]
    canonical_images = [
        np.repeat(np.round(scene["image"] * 255).astype(np.uint8)[:, :, None], 3, axis=2)
        for _, scene in cases_and_scenes
    ]
    canonical_predictions = model.predict(
        source=canonical_images,
        imgsz=256,
        conf=0.1,
        iou=0.7,
        device=0,
        batch=8,
        verbose=False,
    )
    canonical_rows = []
    for (case, scene), result in zip(cases_and_scenes, canonical_predictions):
        labels = _results_to_labels(result, scene["labels"].shape)
        case_dir = canonical_output / "cases" / case.id
        case_dir.mkdir(parents=True, exist_ok=True)
        mask_path = case_dir / "instances.png"
        Image.fromarray(labels.astype(np.uint16)).save(mask_path, optimize=True)
        canonical_rows.append({
            "case_id": case.id,
            **mask_ap(labels, scene["labels"]),
            **panoptic_quality(labels, scene["labels"]),
            "bsd_w": bsd_wasserstein(labels, scene["labels"]),
            "mask_path": str(mask_path.relative_to(canonical_output)).replace("\\", "/"),
        })
    canonical = {
        "schema": "frothseg.learned-benchmark/v1",
        "method": "yolo_froth_seg",
        "device": "cuda:0",
        **_summary(canonical_rows, split="canonical-synthetic-diagnostic"),
    }
    canonical_output.mkdir(parents=True, exist_ok=True)
    (canonical_output / "benchmark.json").write_text(
        json.dumps(canonical, indent=2), encoding="utf-8",
    )
    props = torch.cuda.get_device_properties(0)
    run_manifest = {
        "schema": "frothseg.training-run/v2",
        "method": "yolo_froth_seg",
        "config": {
            "base_model": "yolo11n-seg.pt",
            "epochs": epochs,
            "image_size": 192,
            "batch_size": 16,
            "confidence": 0.1,
            "iou": 0.7,
            "seed": 20260725,
        },
        "dataset_cache_sha256": json.loads(
            cache_path.with_suffix(".json").read_text(encoding="utf-8")
        )["sha256"],
        "environment": {
            "python": platform.python_version(),
            "torch": torch.__version__,
            "cuda_runtime": torch.version.cuda,
            "ultralytics": ultralytics_version,
            "device": props.name,
            "peak_allocated_mib": round(torch.cuda.max_memory_allocated() / 1024**2, 1),
        },
        "duration_seconds": round(time.perf_counter() - started, 3),
        "inference_weights": {
            "path": str(best_path.relative_to(output)).replace("\\", "/"),
            "bytes": best_path.stat().st_size,
            "sha256": hashlib.sha256(best_path.read_bytes()).hexdigest(),
        },
        "evaluation": evaluation,
        "canonical_diagnostic": {
            key: canonical[key] for key in ("mean_ap", "mean_ap50", "mean_pq")
        },
    }
    (output / "run.json").write_text(json.dumps(run_manifest, indent=2), encoding="utf-8")
    return run_manifest
