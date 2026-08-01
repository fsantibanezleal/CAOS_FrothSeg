"""Leakage-safe dataset records and deterministic grouped splitting."""
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Literal

from .science.froth_gen import CASES, FrothSpec

Split = Literal["train", "validation", "calibration", "test", "reserve"]

#: The working splits, i.e. every split a training or evaluation run is allowed to read.
#: ``reserve`` is deliberately absent: reserve groups are materialized, hashed and then left
#: alone until a pre-registered study spends its own slice.
WORKING_SPLITS: tuple[Split, ...] = ("train", "validation", "calibration", "test")

#: One reserve slice per pre-registered study in the 2026-07-31 plan proposal (P-1 to P-5).
#: A study may only ever read the slice it is named in, which is what makes "which surface did
#: this number come from" answerable from the pre-registration alone.
RESERVE_STUDIES: tuple[str, ...] = ("p1", "p2", "p3", "p4", "p5")

#: Latent geometries reserved per condition per study. Two matches the burned test split's shape
#: (``learned_dataset_matrix`` gives every condition two test groups), so a reserve slice is read
#: on exactly the same footing as the split it replaces.
RESERVE_GROUPS_PER_CONDITION: int = 2

#: Seed base for reserve geometries. ``learned_dataset_matrix`` occupies 1_000_000 + at most
#: 1_150_000 + 1_100, so 2_000_000 cannot collide; ``validate_reserve_matrix`` asserts it.
RESERVE_SEED_BASE: int = 2_000_000


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
    #: Only set on ``split == "reserve"`` rows: the pre-registered study that owns the slice.
    reserve_study: str | None = None


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


def _check_matrix_arguments(image_size: int, appearance_variants: int) -> None:
    if image_size < 64 or image_size % 4:
        raise ValueError("image_size must be >=64 and divisible by four")
    if appearance_variants < 1:
        raise ValueError("appearance_variants must be positive")


def _group_samples(
    *,
    condition: FrothSpec,
    group_id: str,
    geometry_seed: int,
    split: Split,
    latent_index: int,
    image_size: int,
    appearance_variants: int,
    source_id: str,
    reserve_study: str | None = None,
) -> list[SyntheticSample]:
    """Materialize the appearance variants of one latent geometry.

    Shared by the working matrix and the reserve matrix so a reserve sample is built by
    exactly the same code path as the split it stands in for. Only ``geometry_seed``,
    ``group_id`` and ``split`` differ.
    """
    scale = image_size / condition.h
    out: list[SyntheticSample] = []
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
            source_id=source_id,
            group_id=group_id,
            frame_id=sample_id,
            image_uri=f"generated://{sample_id}/image",
            mask_uri=f"generated://{sample_id}/instances",
            mm_per_px=None,
            license="Apache-2.0-generated",
            scoreable=True,
            synthetic=True,
        )
        out.append(
            SyntheticSample(
                record=record,
                split=split,
                condition_id=condition.name,
                latent_index=latent_index,
                appearance_index=appearance_index,
                spec=spec,
                reserve_study=reserve_study,
            )
        )
    return out


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

    This matrix is frozen: every published learned-model number was selected on it, and the
    P-1 ensemble-spread study reads its 192-sample train split. Phase 2 enlarges the dataset
    through :func:`reserve_dataset_matrix` instead of by changing anything here.
    """
    _check_matrix_arguments(image_size, appearance_variants)
    split_counts: tuple[tuple[Split, int], ...] = (
        ("train", 6),
        ("validation", 2),
        ("calibration", 2),
        ("test", 2),
    )
    samples: list[SyntheticSample] = []
    for condition_index, condition in enumerate(_condition_specs()):
        latent_index = 0
        for split, count in split_counts:
            for _ in range(count):
                samples.extend(_group_samples(
                    condition=condition,
                    group_id=f"syn2-{condition.name}-g{latent_index:02d}",
                    geometry_seed=1_000_000 + condition_index * 10_000 + latent_index * 100,
                    split=split,
                    latent_index=latent_index,
                    image_size=image_size,
                    appearance_variants=appearance_variants,
                    source_id="frothseg-synthetic-v2",
                ))
                latent_index += 1
    return samples


def reserve_dataset_matrix(
    *,
    image_size: int = 192,
    appearance_variants: int = 2,
    studies: tuple[str, ...] = RESERVE_STUDIES,
    groups_per_condition: int = RESERVE_GROUPS_PER_CONDITION,
) -> list[SyntheticSample]:
    """Build the reserve matrix: one untouched slice per pre-registered study.

    Every condition contributes ``groups_per_condition`` fresh latent geometries to every
    study, so a study's slice is stratified exactly like the working test split and can be
    read on the same footing. Geometries are drawn from a disjoint seed range, so a reserve
    sample is a new scene rather than a re-render of an observed one.

    Generating these is not observing them. Nothing in this repository evaluates a reserve
    row; a study spends its own slice once, under its own pre-registration, and records that
    it did.
    """
    _check_matrix_arguments(image_size, appearance_variants)
    if not studies:
        raise ValueError("at least one reserve study is required")
    if len(set(studies)) != len(studies):
        raise ValueError("reserve study ids must be unique")
    if groups_per_condition < 1:
        raise ValueError("groups_per_condition must be positive")
    samples: list[SyntheticSample] = []
    for condition_index, condition in enumerate(_condition_specs()):
        reserve_index = 0
        for study in studies:
            for group_index in range(groups_per_condition):
                samples.extend(_group_samples(
                    condition=condition,
                    group_id=f"syn2r-{condition.name}-{study}-g{group_index:02d}",
                    geometry_seed=(
                        RESERVE_SEED_BASE + condition_index * 10_000 + reserve_index * 100
                    ),
                    split="reserve",
                    latent_index=reserve_index,
                    image_size=image_size,
                    appearance_variants=appearance_variants,
                    source_id="frothseg-synthetic-v2-reserve",
                    reserve_study=study,
                ))
                reserve_index += 1
    return samples


def validate_reserve_matrix(
    reserve: Iterable[SyntheticSample],
    working: Iterable[SyntheticSample],
    *,
    studies: tuple[str, ...] = RESERVE_STUDIES,
    groups_per_condition: int = RESERVE_GROUPS_PER_CONDITION,
) -> list[str]:
    """Check the reserve is well formed AND fully disjoint from the working matrix.

    Disjointness is checked on three keys at once: sample id, group id and geometry seed. An
    id-only check would pass a reserve that silently re-renders an observed scene under a new
    name, which would make the reserve worthless without looking worthless.
    """
    errors: list[str] = []
    reserve_rows = list(reserve)
    working_rows = list(working)

    errors.extend(validate_splits(
        SplitRecord(sample=row.record, split=row.split) for row in reserve_rows
    ))
    for row in reserve_rows:
        if row.split != "reserve":
            errors.append(f"{row.record.sample_id}: split is {row.split}, expected reserve")
        if row.reserve_study not in studies:
            errors.append(f"{row.record.sample_id}: unknown reserve_study {row.reserve_study!r}")

    by_study: dict[str, dict[str, set[str]]] = {}
    for row in reserve_rows:
        by_study.setdefault(str(row.reserve_study), {}).setdefault(
            row.condition_id, set()
        ).add(row.record.group_id)
    for study in studies:
        conditions = by_study.get(study, {})
        if len(conditions) != 16:
            errors.append(f"{study}: expected 16 conditions, got {len(conditions)}")
        for condition, groups in sorted(conditions.items()):
            if len(groups) != groups_per_condition:
                errors.append(
                    f"{study}/{condition}: {len(groups)} reserve groups, "
                    f"expected {groups_per_condition}"
                )

    for key, extract in (
        ("sample_id", lambda row: row.record.sample_id),
        ("group_id", lambda row: row.record.group_id),
        ("geometry_seed", lambda row: row.spec.seed),
    ):
        overlap = {extract(row) for row in reserve_rows} & {extract(row) for row in working_rows}
        if overlap:
            errors.append(
                f"reserve overlaps the working matrix on {key}: "
                + ", ".join(str(value) for value in sorted(overlap)[:5])
            )
    return errors


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
        if sample.split not in WORKING_SPLITS:
            # A reserve row in the working matrix would be read by every trainer, which is the
            # exact failure the reserve exists to prevent. Refuse it loudly.
            errors.append(
                f"{sample.record.sample_id}: split {sample.split} is not a working split"
            )
            continue
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
