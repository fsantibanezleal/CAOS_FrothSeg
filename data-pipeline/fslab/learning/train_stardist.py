"""Official StarDist 2D training, calibration, and evaluation pipeline."""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import time
import tracemalloc
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from ..learning.data_cache import load_cache, select_split
from ..registry import list_cases
from ..science.froth_gen import generate
from ..science.segment import (
    binary_calibration_metrics,
    full_instance_metrics,
    summarize_metric_rows,
)


def _normalize(images: np.ndarray) -> list[np.ndarray]:
    from csbdeep.utils import normalize

    return [normalize(image.astype(np.float32), 1, 99.8, axis=(0, 1)) for image in images]


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
    output: Path,
    canonical_output: Path,
    *,
    epochs: int = 12,
    steps_per_epoch: int = 24,
    evaluate_existing: bool = False,
) -> dict:
    import tensorflow as tf
    from stardist import __version__ as stardist_version
    from stardist.models import Config2D, StarDist2D

    np.random.seed(20260725)
    tf.keras.utils.set_random_seed(20260725)
    cache = load_cache(cache_path)
    train_cache = select_split(cache, "train")
    validation_cache = select_split(cache, "validation")
    calibration_cache = select_split(cache, "calibration")
    test_cache = select_split(cache, "test")
    train_images = _normalize(train_cache["images"])
    validation_images = _normalize(validation_cache["images"])
    train_labels = [label.astype(np.int32) for label in train_cache["labels"]]
    validation_labels = [label.astype(np.int32) for label in validation_cache["labels"]]

    config = Config2D(
        n_rays=32,
        grid=(2, 2),
        n_channel_in=1,
        train_epochs=epochs,
        train_steps_per_epoch=steps_per_epoch,
        train_batch_size=4,
        train_patch_size=(192, 192),
        train_learning_rate=3e-4,
        unet_n_depth=2,
        unet_n_filter_base=24,
        use_gpu=False,
    )
    model = StarDist2D(
        None if evaluate_existing else config,
        name=output.name,
        basedir=str(output.parent),
    )
    started = time.perf_counter()
    if evaluate_existing:
        history_document = {
            "source": "tensorboard-event-logs",
            "files": [
                str(path.relative_to(output)).replace("\\", "/")
                for path in sorted((output / "logs").rglob("events.out.tfevents.*"))
            ],
        }
    else:
        history = model.train(
            train_images,
            train_labels,
            validation_data=(validation_images, validation_labels),
            epochs=epochs,
            steps_per_epoch=steps_per_epoch,
        )
        history_document = {
            key: [float(value) for value in values]
            for key, values in history.history.items()
        }
    calibration_images = _normalize(calibration_cache["images"])
    calibration_labels = [
        label.astype(np.int32) for label in calibration_cache["labels"]
    ]
    if evaluate_existing:
        thresholds = json.loads((output / "thresholds.json").read_text(encoding="utf-8"))
    else:
        thresholds = model.optimize_thresholds(
            calibration_images[::2],
            calibration_labels[::2],
        )

    test_rows = []
    normalized_test_images = _normalize(test_cache["images"])
    for index, image in enumerate(normalized_test_images):
        started_inference = time.perf_counter()
        labels, _ = model.predict_instances(image)
        probability, _ = model.predict(image)
        inference_ms = (time.perf_counter() - started_inference) * 1000
        probability = cv2.resize(
            probability,
            (test_cache["labels"][index].shape[1], test_cache["labels"][index].shape[0]),
            interpolation=cv2.INTER_LINEAR,
        )
        pixel_calibration = binary_calibration_metrics(
            probability,
            test_cache["labels"][index] > 0,
        )
        test_rows.append({
            "sample_id": str(test_cache["sample_ids"][index]),
            "condition_id": str(test_cache["conditions"][index]),
            "group_id": str(test_cache["group_ids"][index]),
            **full_instance_metrics(labels, test_cache["labels"][index]),
            "brier": pixel_calibration["brier"],
            "ece": pixel_calibration["ece"],
            "pixel_calibration": pixel_calibration,
            "inference_ms": round(inference_ms, 3),
        })
    evaluation = summarize_metric_rows(test_rows, split="test")
    evaluation["mean_brier"] = float(np.mean([row["brier"] for row in test_rows]))
    evaluation["mean_ece"] = float(np.mean([row["ece"] for row in test_rows]))
    evaluation["mean_inference_ms"] = float(np.mean([
        row["inference_ms"] for row in test_rows
    ]))
    evaluation["p95_inference_ms"] = float(np.quantile([
        row["inference_ms"] for row in test_rows
    ], 0.95))

    # A separate inference pass measures Python allocations without inflating
    # the reported latency above.
    tracemalloc.start()
    tracemalloc.reset_peak()
    for image in normalized_test_images:
        model.predict_instances(image)
        model.predict(image)
    _, peak_traced_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    canonical_rows = []
    for case in list_cases():
        scene = generate(case.spec)
        labels, _ = model.predict_instances(_normalize(scene["image"][None])[0])
        case_dir = canonical_output / "cases" / case.id
        case_dir.mkdir(parents=True, exist_ok=True)
        mask_path = case_dir / "instances.png"
        Image.fromarray(labels.astype(np.uint16)).save(mask_path, optimize=True)
        canonical_rows.append({
            "case_id": case.id,
            **full_instance_metrics(labels, scene["labels"]),
            "mask_path": str(mask_path.relative_to(canonical_output)).replace("\\", "/"),
        })
    canonical = {
        "schema": "frothseg.learned-benchmark/v1",
        "method": "stardist_2d",
        "device": "cpu-native-windows-tensorflow",
        **_summary(canonical_rows, split="canonical-synthetic-diagnostic"),
    }
    canonical_output.mkdir(parents=True, exist_ok=True)
    (canonical_output / "benchmark.json").write_text(
        json.dumps(canonical, indent=2), encoding="utf-8",
    )

    weights_path = output / "weights_best.h5"
    run_manifest = {
        "schema": "frothseg.training-run/v2",
        "method": "stardist_2d",
        "config": {
            "n_rays": 32,
            "grid": [2, 2],
            "epochs": epochs,
            "steps_per_epoch": steps_per_epoch,
            "batch_size": 4,
            "patch_size": [192, 192],
            "learning_rate": 3e-4,
            "unet_depth": 2,
            "unet_filter_base": 24,
        },
        "dataset_cache_sha256": json.loads(
            cache_path.with_suffix(".json").read_text(encoding="utf-8")
        )["sha256"],
        "environment": {
            "python": platform.python_version(),
            "tensorflow": tf.__version__,
            "stardist": stardist_version,
            "device": "CPU",
            "peak_traced_memory_mib": round(peak_traced_bytes / 1024**2, 3),
            "peak_memory_metric": "python-tracemalloc",
            "limitation": (
                "Official TensorFlow >=2.11 has no native-Windows CUDA support; "
                "use Linux/WSL2 for GPU execution."
            ),
        },
        "duration_seconds": round(time.perf_counter() - started, 3),
        "history": history_document,
        "calibration": {
            "split": "calibration",
            "n_groups": len(calibration_images[::2]),
            **{key: float(value) for key, value in thresholds.items()},
        },
        "inference_weights": {
            "path": str(weights_path.relative_to(output)).replace("\\", "/"),
            "bytes": weights_path.stat().st_size,
            "sha256": hashlib.sha256(weights_path.read_bytes()).hexdigest(),
        },
        "evaluation": evaluation,
        "canonical_diagnostic": {
            key: canonical[key] for key in ("mean_ap", "mean_ap50", "mean_pq")
        },
    }
    (output / "run.json").write_text(json.dumps(run_manifest, indent=2), encoding="utf-8")
    return run_manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=Path("data/cache/learned-v2-192.npz"))
    parser.add_argument("--output", type=Path, default=Path("models/stardist-froth-v1"))
    parser.add_argument(
        "--canonical-output",
        type=Path,
        default=Path("data/derived/learned/stardist-froth-v1"),
    )
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--steps-per-epoch", type=int, default=24)
    parser.add_argument("--evaluate-existing", action="store_true")
    args = parser.parse_args()
    manifest = train(
        args.cache,
        args.output,
        args.canonical_output,
        epochs=args.epochs,
        steps_per_epoch=args.steps_per_epoch,
        evaluate_existing=args.evaluate_existing,
    )
    print(json.dumps({
        "evaluation": {
            key: manifest["evaluation"][key]
            for key in ("mean_ap", "mean_ap50", "mean_pq")
        },
        "canonical_diagnostic": manifest["canonical_diagnostic"],
        "duration_seconds": manifest["duration_seconds"],
    }, indent=2))


if __name__ == "__main__":
    main()
