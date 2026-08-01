"""Guard the Phase 2 data pre-registration against silent drift.

The file's whole purpose is to make "which surface did this number come from" answerable later,
so the properties that make it answerable are asserted here rather than trusted: one reserve
slice per planned study, reserve disjoint from the working matrix, the fresh real draw disjoint
from the observed 64, and every recorded hash actually matching the ids it claims to cover.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from fslab.datasets import RESERVE_STUDIES

ROOT = Path(__file__).resolve().parents[1]
PREREGISTRATION = ROOT / "verification/phase2-data-preregistration.json"


def _sha256_ids(ids: list[str]) -> str:
    return hashlib.sha256(("\n".join(sorted(ids)) + "\n").encode("utf-8")).hexdigest()


@pytest.fixture(scope="module")
def document() -> dict:
    if not PREREGISTRATION.exists():
        pytest.skip("Phase 2 pre-registration not built in this checkout")
    return json.loads(PREREGISTRATION.read_text(encoding="utf-8"))


def test_every_planned_study_owns_a_reserve_slice(document: dict) -> None:
    reserve = document["synthetic"]["reserve_matrix"]
    assert reserve["study_count"] >= reserve["planned_study_count"]
    assert list(reserve["per_study"]) == list(RESERVE_STUDIES)
    for study, slice_record in reserve["per_study"].items():
        assert slice_record["condition_count"] == 16, study
        assert slice_record["group_count"] > 0, study


def test_reserve_group_hashes_match_the_ids_they_cover(document: dict) -> None:
    reserve = document["synthetic"]["reserve_matrix"]
    every_group: list[str] = []
    for study, slice_record in reserve["per_study"].items():
        assert slice_record["group_ids_sha256"] == _sha256_ids(slice_record["group_ids"]), study
        every_group.extend(slice_record["group_ids"])
    assert len(every_group) == len(set(every_group))
    assert len(every_group) == reserve["group_count"]
    assert reserve["all_group_ids_sha256"] == _sha256_ids(every_group)


def test_reserve_slices_do_not_share_a_group(document: dict) -> None:
    per_study = document["synthetic"]["reserve_matrix"]["per_study"]
    seen: set[str] = set()
    for slice_record in per_study.values():
        groups = set(slice_record["group_ids"])
        assert not groups & seen
        seen |= groups


def test_working_matrix_survived_the_phase2_refactor_unchanged(document: dict) -> None:
    working = document["synthetic"]["working_matrix"]
    assert working["cache_sha256_matches_committed_report"] is True
    check = working["regeneration_check"]
    assert check["verdict"] == "unchanged"
    assert check["archive_bytes_identical"] is True
    assert check["rebuilt_sha256"] == working["cache_sha256"]


def test_fresh_real_draw_is_disjoint_from_the_burned_surface(document: dict) -> None:
    real = document["real_adjacent"]
    burned_groups = set(real["burned_surface"]["burned_group_ids"])
    drawn_groups: set[str] = set()
    for split in real["fresh_draw"]["splits"].values():
        groups = set(split["group_ids"])
        assert not groups & burned_groups
        assert not groups & drawn_groups
        drawn_groups |= groups
        assert split["sample_ids_sha256"] == _sha256_ids(split["sample_ids"])
        assert split["group_ids_sha256"] == _sha256_ids(split["group_ids"])
        assert split["sample_count"] >= 64


def test_no_budget_was_spent_by_the_data_step(document: dict) -> None:
    """This file is a FROZEN snapshot of the data step, so its counters stay at zero.

    Running spends live in ``verification/reserve-slice-ledger.json``, which is the mutable
    ledger. A study that observes a reserve slice appends there and never back-edits this file.
    """
    assert document["test_evaluations_spent"] == 0
    assert document["trained"] == "nothing"
    assert document["evaluated"] == "nothing"
    assert document["budget"]["reserve_slices_spent"] == 0
    assert document["budget"]["fresh_real_test_evaluations_spent"] == 0


def test_the_running_ledger_never_exceeds_what_was_reserved(document: dict) -> None:
    """Every recorded spend names a real reserve slice, at most once, with its evidence."""
    ledger_path = ROOT / "verification/reserve-slice-ledger.json"
    if not ledger_path.is_file():
        pytest.skip("reserve ledger not built in this checkout")
    ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
    reserved = document["synthetic"]["reserve_matrix"]
    slices = [entry["reserve_study"] for entry in ledger["entries"]]
    assert len(slices) == len(set(slices)), "a reserve slice was observed twice"
    assert len(slices) <= document["budget"]["reserve_slices_available"]
    assert ledger["slices_spent"] == len(slices)
    for entry in ledger["entries"]:
        registered = reserved["per_study"][entry["reserve_study"]]
        assert entry["sample_ids_sha256"] == registered["sample_ids_sha256"]
        assert entry["group_ids_sha256"] == registered["group_ids_sha256"]
        assert entry["sample_count"] == registered["sample_count"]
        assert entry["evidence"].startswith("verification/")
