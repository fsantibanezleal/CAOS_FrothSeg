"""Leakage-safe dataset records and deterministic grouped splitting."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Iterable, Literal

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
