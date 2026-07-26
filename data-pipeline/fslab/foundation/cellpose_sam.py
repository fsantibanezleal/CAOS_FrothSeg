"""Official Cellpose-SAM cpsam_v2 inference and benchmark integration."""

from __future__ import annotations

import hashlib
import json
import platform
import time
from pathlib import Path

import numpy as np
from PIL import Image

from ..learning.data_cache import load_cache, select_split
from ..registry import list_cases
from ..science.froth_gen import generate
from ..science.segment import bsd_wasserstein, mask_ap, panoptic_quality


def _score(masks, truth, sample_ids, conditions, groups) -> dict:
    rows = []
    for index, labels in enumerate(masks):
        rows.append({
            "sample_id": str(sample_ids[index]),
            "condition_id": str(conditions[index]),
            "group_id": str(groups[index]),
            **mask_ap(np.asarray(labels, dtype=np.int32), truth[index]),
            **panoptic_quality(np.asarray(labels, dtype=np.int32), truth[index]),
        })
    scored = [row for row in rows if row["ap"] is not None]
    return {
        "split": "test",
        "n": len(rows),
        "mean_ap": float(np.mean([row["ap"] for row in scored])),
        "mean_ap50": float(np.mean([row["ap50"] for row in scored])),
        "mean_pq": float(np.mean([row["pq"] for row in scored])),
        "cases": rows,
    }


def run(cache_path: Path, model_dir: Path, canonical_output: Path) -> dict:
    import torch
    from cellpose import models

    if not torch.cuda.is_available():
        raise RuntimeError("Cellpose-SAM requires CUDA in this benchmark; CPU fallback is forbidden")
    cache = load_cache(cache_path)
    test = select_split(cache, "test")
    model = models.CellposeModel(
        gpu=True,
        pretrained_model="cpsam_v2",
        use_bfloat16=True,
    )
    if model.device.type != "cuda":
        raise RuntimeError(f"Cellpose-SAM selected unexpected device: {model.device}")
    model_path = Path(model.pretrained_model)
    model_sha256 = hashlib.sha256(model_path.read_bytes()).hexdigest()

    test_images = [image.astype(np.float32) / 255.0 for image in test["images"]]
    started = time.perf_counter()
    test_masks, _, _ = model.eval(
        test_images,
        batch_size=8,
        channel_axis=None,
        normalize=True,
        diameter=None,
        flow_threshold=0.4,
        cellprob_threshold=0.0,
        min_size=5,
    )
    test_seconds = time.perf_counter() - started
    evaluation = _score(
        test_masks,
        test["labels"],
        test["sample_ids"],
        test["conditions"],
        test["group_ids"],
    )

    canonical_scenes = [(case, generate(case.spec)) for case in list_cases()]
    canonical_images = [scene["image"].astype(np.float32) for _, scene in canonical_scenes]
    started = time.perf_counter()
    canonical_masks, _, _ = model.eval(
        canonical_images,
        batch_size=8,
        channel_axis=None,
        normalize=True,
        diameter=None,
        flow_threshold=0.4,
        cellprob_threshold=0.0,
        min_size=5,
    )
    canonical_seconds = time.perf_counter() - started
    canonical_rows = []
    for (case, scene), labels in zip(canonical_scenes, canonical_masks):
        labels = np.asarray(labels, dtype=np.int32)
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
    canonical_scored = [row for row in canonical_rows if row["ap"] is not None]
    canonical = {
        "schema": "frothseg.learned-benchmark/v1",
        "method": "cellpose_sam",
        "split": "canonical-synthetic-diagnostic",
        "device": str(model.device),
        "n_cases": len(canonical_rows),
        "duration_seconds": round(canonical_seconds, 3),
        "mean_ap": float(np.mean([row["ap"] for row in canonical_scored])),
        "mean_ap50": float(np.mean([row["ap50"] for row in canonical_scored])),
        "mean_pq": float(np.mean([row["pq"] for row in canonical_scored])),
        "cases": canonical_rows,
    }
    canonical_output.mkdir(parents=True, exist_ok=True)
    (canonical_output / "benchmark.json").write_text(
        json.dumps(canonical, indent=2), encoding="utf-8",
    )

    props = torch.cuda.get_device_properties(0)
    run_manifest = {
        "schema": "frothseg.foundation-run/v1",
        "method": "cellpose_sam",
        "engine": "cellpose",
        "engine_version": __import__("cellpose").version,
        "pretrained_model": {
            "id": "cpsam_v2",
            "path_local_cache": str(model_path),
            "bytes": model_path.stat().st_size,
            "sha256": model_sha256,
            "committed": False,
        },
        "parameters": {
            "batch_size": 8,
            "normalize": True,
            "diameter": None,
            "flow_threshold": 0.4,
            "cellprob_threshold": 0.0,
            "min_size": 5,
        },
        "dataset_cache_sha256": json.loads(
            cache_path.with_suffix(".json").read_text(encoding="utf-8")
        )["sha256"],
        "environment": {
            "python": platform.python_version(),
            "torch": torch.__version__,
            "cuda_runtime": torch.version.cuda,
            "device": props.name,
            "peak_allocated_mib": round(torch.cuda.max_memory_allocated() / 1024**2, 1),
        },
        "test_duration_seconds": round(test_seconds, 3),
        "evaluation": evaluation,
        "canonical_diagnostic": {
            key: canonical[key] for key in ("mean_ap", "mean_ap50", "mean_pq")
        },
    }
    model_dir.mkdir(parents=True, exist_ok=True)
    (model_dir / "run.json").write_text(json.dumps(run_manifest, indent=2), encoding="utf-8")
    return run_manifest
