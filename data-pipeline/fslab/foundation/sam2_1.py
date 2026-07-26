"""Official SAM 2.1 automatic-mask CUDA benchmark."""

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

MODEL_ID = "facebook/sam2.1-hiera-tiny"
UPSTREAM_COMMIT = "2b90b9f5ceec907a1c18123530e92e794ad901a4"


def _annotations_to_labels(annotations: list[dict], shape: tuple[int, int]) -> np.ndarray:
    labels = np.zeros(shape, dtype=np.int32)
    ordered = sorted(
        annotations,
        key=lambda item: (float(item.get("predicted_iou", 0)), -int(item.get("area", 0))),
    )
    for instance_id, annotation in enumerate(ordered, start=1):
        labels[np.asarray(annotation["segmentation"], dtype=bool)] = instance_id
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


def run(cache_path: Path, output: Path, canonical_output: Path) -> dict:
    import torch
    from huggingface_hub import snapshot_download
    from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
    from sam2.build_sam import build_sam2_hf

    if not torch.cuda.is_available():
        raise RuntimeError("SAM 2.1 benchmark requires CUDA; CPU fallback is forbidden")
    snapshot = Path(snapshot_download(MODEL_ID))
    checkpoints = sorted(snapshot.glob("*.pt"))
    if len(checkpoints) != 1:
        raise RuntimeError(f"expected one SAM 2.1 checkpoint, found {checkpoints}")
    checkpoint = checkpoints[0]
    model = build_sam2_hf(MODEL_ID, device="cuda")
    generator = SAM2AutomaticMaskGenerator(
        model,
        points_per_side=8,
        points_per_batch=64,
        pred_iou_thresh=0.7,
        stability_score_thresh=0.8,
        min_mask_region_area=5,
        output_mode="binary_mask",
        use_m2m=True,
    )
    cache = load_cache(cache_path)
    test = select_split(cache, "test")
    rows = []
    started = time.perf_counter()
    for index, image in enumerate(test["images"]):
        rgb = np.repeat(image[:, :, None], 3, axis=2)
        with torch.inference_mode(), torch.autocast("cuda", dtype=torch.bfloat16):
            annotations = generator.generate(rgb)
        labels = _annotations_to_labels(annotations, image.shape)
        rows.append({
            "sample_id": str(test["sample_ids"][index]),
            "condition_id": str(test["conditions"][index]),
            "group_id": str(test["group_ids"][index]),
            "n_masks": len(annotations),
            **mask_ap(labels, test["labels"][index]),
            **panoptic_quality(labels, test["labels"][index]),
        })
        print(f"sam2_test={index + 1}/{len(test['images'])} masks={len(annotations)}", flush=True)
    evaluation = _summary(rows, split="test")

    canonical_rows = []
    for index, case in enumerate(list_cases()):
        scene = generate(case.spec)
        image = np.repeat(np.round(scene["image"] * 255).astype(np.uint8)[:, :, None], 3, axis=2)
        with torch.inference_mode(), torch.autocast("cuda", dtype=torch.bfloat16):
            annotations = generator.generate(image)
        labels = _annotations_to_labels(annotations, scene["labels"].shape)
        case_dir = canonical_output / "cases" / case.id
        case_dir.mkdir(parents=True, exist_ok=True)
        mask_path = case_dir / "instances.png"
        Image.fromarray(labels.astype(np.uint16)).save(mask_path, optimize=True)
        canonical_rows.append({
            "case_id": case.id,
            "n_masks": len(annotations),
            **mask_ap(labels, scene["labels"]),
            **panoptic_quality(labels, scene["labels"]),
            "bsd_w": bsd_wasserstein(labels, scene["labels"]),
            "mask_path": str(mask_path.relative_to(canonical_output)).replace("\\", "/"),
        })
        print(f"sam2_canonical={index + 1}/13 masks={len(annotations)}", flush=True)
    canonical = {
        "schema": "frothseg.learned-benchmark/v1",
        "method": "sam2_1",
        "device": "cuda:0",
        **_summary(canonical_rows, split="canonical-synthetic-diagnostic"),
    }
    canonical_output.mkdir(parents=True, exist_ok=True)
    (canonical_output / "benchmark.json").write_text(
        json.dumps(canonical, indent=2), encoding="utf-8",
    )
    props = torch.cuda.get_device_properties(0)
    run_manifest = {
        "schema": "frothseg.foundation-run/v1",
        "method": "sam2_1",
        "engine": "facebookresearch/sam2",
        "upstream_commit": UPSTREAM_COMMIT,
        "model": {
            "id": MODEL_ID,
            "checkpoint_local_cache": str(checkpoint),
            "bytes": checkpoint.stat().st_size,
            "sha256": hashlib.sha256(checkpoint.read_bytes()).hexdigest(),
            "committed": False,
        },
        "parameters": {
            "points_per_side": 8,
            "points_per_batch": 64,
            "pred_iou_thresh": 0.7,
            "stability_score_thresh": 0.8,
            "min_mask_region_area": 5,
            "use_m2m": True,
            "optional_cuda_cc_extension": False,
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
        "duration_seconds": round(time.perf_counter() - started, 3),
        "evaluation": evaluation,
        "canonical_diagnostic": {
            key: canonical[key] for key in ("mean_ap", "mean_ap50", "mean_pq")
        },
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / "run.json").write_text(json.dumps(run_manifest, indent=2), encoding="utf-8")
    return run_manifest
