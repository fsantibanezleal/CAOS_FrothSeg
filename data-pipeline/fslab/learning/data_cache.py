"""Materialized cache for the shared learned-model dataset contract."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np

from ..datasets import learned_dataset_matrix, validate_learned_matrix
from ..science.froth_gen import generate


def build_cache(
    path: Path,
    *,
    image_size: int = 192,
    appearance_variants: int = 2,
) -> dict:
    matrix = learned_dataset_matrix(
        image_size=image_size,
        appearance_variants=appearance_variants,
    )
    errors = validate_learned_matrix(matrix)
    if errors:
        raise ValueError("invalid learned dataset matrix: " + "; ".join(errors))

    images = np.empty((len(matrix), image_size, image_size), dtype=np.uint8)
    labels = np.empty((len(matrix), image_size, image_size), dtype=np.uint16)
    for index, sample in enumerate(matrix):
        scene = generate(sample.spec)
        images[index] = np.round(scene["image"] * 255).astype(np.uint8)
        labels[index] = scene["labels"].astype(np.uint16)
        if (index + 1) % 32 == 0:
            print(f"materialized={index + 1}/{len(matrix)}", flush=True)

    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        path,
        images=images,
        labels=labels,
        sample_ids=np.asarray([sample.record.sample_id for sample in matrix]),
        splits=np.asarray([sample.split for sample in matrix]),
        conditions=np.asarray([sample.condition_id for sample in matrix]),
        group_ids=np.asarray([sample.record.group_id for sample in matrix]),
    )
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    report = {
        "schema": "frothseg.learned-cache/v1",
        "dataset_schema": "frothseg.learned-dataset/v2",
        "path": path.name,
        "sha256": digest,
        "bytes": path.stat().st_size,
        "image_size": image_size,
        "appearance_variants": appearance_variants,
        "samples": len(matrix),
    }
    path.with_suffix(".json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def load_cache(path: Path) -> dict[str, np.ndarray]:
    report_path = path.with_suffix(".json")
    if not path.exists() or not report_path.exists():
        raise FileNotFoundError(
            f"learned cache is missing: run scripts/build_learned_cache.py --output {path}"
        )
    report = json.loads(report_path.read_text(encoding="utf-8"))
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != report["sha256"]:
        raise ValueError("learned dataset cache checksum mismatch")
    archive = np.load(path)
    return {name: archive[name] for name in archive.files}


def select_split(cache: dict[str, np.ndarray], split: str) -> dict[str, np.ndarray]:
    selector = cache["splits"] == split
    return {key: value[selector] for key, value in cache.items()}
