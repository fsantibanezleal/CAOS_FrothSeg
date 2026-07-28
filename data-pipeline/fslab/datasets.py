"""Leakage-safe dataset records and deterministic grouped splitting."""
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Literal

from .science.froth_gen import CASES, FrothSpec

Split = Literal["train", "validation", "calibration", "test"]


@dataclass(frozen=True)
class SampleRecord:
    sample_id: str
    source_id: str
    group_id: str
    frame_id: str
    image_uri: str
    mask_uri: str | None
    mm_per_px: float | None
    license: str
    scoreable: bool
    synthetic: bool


@dataclass(frozen=True)
class SplitRecord:
    sample: SampleRecord
    split: Split


@dataclass(frozen=True)
class SyntheticSample:
    """One materializable sample in the leakage-safe learned-model matrix."""

    record: SampleRecord
    split: Split
    condition_id: str
    latent_index: int
    appearance_index: int
    spec: FrothSpec


def _bucket(group_id: str, seed: int) -> int:
    digest = hashlib.sha256(f"{seed}:{group_id}".encode()).digest()
    return int.from_bytes(digest[:8], "big") % 100


def grouped_split(samples: Iterable[SampleRecord], *, seed: int = 20260725) -> list[SplitRecord]:
    """Split by latent/source group: 65/15/10/10 train/val/calibration/test.

    Every frame/variant sharing ``group_id`` stays together, which blocks adjacent
    video frames and variants of one synthetic latent scene from leaking.
    """
    out: list[SplitRecord] = []
    for sample in samples:
        value = _bucket(sample.group_id, seed)
        split: Split
        if value < 65:
            split = "train"
        elif value < 80:
            split = "validation"
        elif value < 90:
            split = "calibration"
        else:
            split = "test"
        out.append(SplitRecord(sample=sample, split=split))
    return sorted(out, key=lambda row: row.sample.sample_id)


def validate_splits(rows: Iterable[SplitRecord]) -> list[str]:
    errors: list[str] = []
    group_to_split: dict[str, Split] = {}
    ids: set[str] = set()
    for row in rows:
        sample = row.sample
        if sample.sample_id in ids:
            errors.append(f"duplicate sample_id: {sample.sample_id}")
        ids.add(sample.sample_id)
        previous = group_to_split.setdefault(sample.group_id, row.split)
        if previous != row.split:
            errors.append(f"group leakage: {sample.group_id} occurs in {previous} and {row.split}")
        if sample.scoreable and not sample.mask_uri:
            errors.append(f"scoreable sample lacks mask: {sample.sample_id}")
        if sample.mm_per_px is not None and sample.mm_per_px <= 0:
            errors.append(f"invalid calibration: {sample.sample_id}")
        if not sample.license:
            errors.append(f"missing license: {sample.sample_id}")
    return errors


def _condition_specs() -> tuple[FrothSpec, ...]:
    """Sixteen condition families spanning clean, scale, texture, and compound stress."""
    base = tuple(spec for spec in CASES if not spec.empty)
    normal = next(spec for spec in base if spec.name == "poly-normal")
    extra = (
        FrothSpec(
            "microbubble-cloud", seed=201, d32_px=10, sigma_ln=0.35,
            noise=0.055, labels=("ultra-fine", "resolution-limit"),
        ),
        FrothSpec(
            "wide-bimodal-proxy", seed=202, d32_px=30, sigma_ln=0.9,
            labels=("wide-distribution", "mixed-size"),
        ),
        FrothSpec(
            "glare-motion-compound", seed=203, d32_px=normal.d32_px,
            sigma_ln=0.55, glare=0.65, motion_blur=9, noise=0.05,
            labels=("glare", "motion-blur", "compound-stress"),
        ),
        FrothSpec(
            "dark-defocus-compound", seed=204, d32_px=28, sigma_ln=0.55,
            load=0.88, defocus=2.8, noise=0.07,
            labels=("dark", "defocus", "compound-stress"),
        ),
    )
    conditions = base + extra
    if len(conditions) != 16:
        raise AssertionError(f"expected 16 condition families, got {len(conditions)}")
    return conditions


def learned_dataset_matrix(
    *,
    image_size: int = 192,
    appearance_variants: int = 2,
) -> list[SyntheticSample]:
    """Build the stratified learned-model matrix.

    Each of 16 conditions owns 12 independent latent geometries: six train, two
    validation, two calibration, and two untouched test groups. Appearance
    variants of one latent geometry share ``group_id`` and instance geometry,
    making leakage mechanically detectable.
    """
    if image_size < 64 or image_size % 4:
        raise ValueError("image_size must be >=64 and divisible by four")
    if appearance_variants < 1:
        raise ValueError("appearance_variants must be positive")
    split_counts: tuple[tuple[Split, int], ...] = (
        ("train", 6),
        ("validation", 2),
        ("calibration", 2),
        ("test", 2),
    )
    samples: list[SyntheticSample] = []
    for condition_index, condition in enumerate(_condition_specs()):
        latent_index = 0
        scale = image_size / condition.h
        for split, count in split_counts:
            for _ in range(count):
                group_id = f"syn2-{condition.name}-g{latent_index:02d}"
                geometry_seed = 1_000_000 + condition_index * 10_000 + latent_index * 100
                for appearance_index in range(appearance_variants):
                    sample_id = f"{group_id}-a{appearance_index:02d}"
                    spec = FrothSpec(
                        **{
                            **asdict(condition),
                            "name": sample_id,
                            "seed": geometry_seed,
                            "appearance_seed": geometry_seed + appearance_index + 1,
                            "h": image_size,
                            "w": image_size,
                            "d32_px": max(6.0, condition.d32_px * scale),
                            "motion_blur": max(0, int(round(condition.motion_blur * scale))),
                            "defocus": condition.defocus * scale,
                        }
                    )
                    record = SampleRecord(
                        sample_id=sample_id,
                        source_id="frothseg-synthetic-v2",
                        group_id=group_id,
                        frame_id=sample_id,
                        image_uri=f"generated://{sample_id}/image",
                        mask_uri=f"generated://{sample_id}/instances",
                        mm_per_px=None,
                        license="Apache-2.0-generated",
                        scoreable=True,
                        synthetic=True,
                    )
                    samples.append(
                        SyntheticSample(
                            record=record,
                            split=split,
                            condition_id=condition.name,
                            latent_index=latent_index,
                            appearance_index=appearance_index,
                            spec=spec,
                        )
                    )
                latent_index += 1
    return samples


def validate_learned_matrix(samples: Iterable[SyntheticSample]) -> list[str]:
    materialized = list(samples)
    errors = validate_splits(
        SplitRecord(sample=sample.record, split=sample.split) for sample in materialized
    )
    expected = {"train": 6, "validation": 2, "calibration": 2, "test": 2}
    by_condition: dict[str, dict[Split, set[str]]] = {}
    for sample in materialized:
        per_split = by_condition.setdefault(
            sample.condition_id,
            {"train": set(), "validation": set(), "calibration": set(), "test": set()},
        )
        per_split[sample.split].add(sample.record.group_id)
    if len(by_condition) != 16:
        errors.append(f"expected 16 condition families, got {len(by_condition)}")
    for condition, split_groups in by_condition.items():
        for split, count in expected.items():
            actual = len(split_groups[split])
            if actual != count:
                errors.append(f"{condition}: {split} has {actual} groups, expected {count}")
    return errors


def write_learned_manifest(
    path: Path,
    *,
    image_size: int = 192,
    appearance_variants: int = 2,
) -> dict:
    samples = learned_dataset_matrix(
        image_size=image_size,
        appearance_variants=appearance_variants,
    )
    errors = validate_learned_matrix(samples)
    if errors:
        raise ValueError("invalid learned dataset matrix: " + "; ".join(errors))
    document = {
        "schema": "frothseg.learned-dataset/v2",
        "generator": "fslab.science.froth_gen",
        "image_size": image_size,
        "condition_count": len({sample.condition_id for sample in samples}),
        "appearance_variants_per_latent": appearance_variants,
        "sample_count": len(samples),
        "group_count": len({sample.record.group_id for sample in samples}),
        "splits": {
            split: sum(sample.split == split for sample in samples)
            for split in ("train", "validation", "calibration", "test")
        },
        "samples": [
            {
                **asdict(sample.record),
                "split": sample.split,
                "condition_id": sample.condition_id,
                "latent_index": sample.latent_index,
                "appearance_index": sample.appearance_index,
                "spec": asdict(sample.spec),
            }
            for sample in samples
        ],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, indent=2), encoding="utf-8")
    return document
