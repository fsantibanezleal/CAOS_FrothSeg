"""Guard the P-3 conformal evidence against silent drift.

A conformal guarantee is only worth the calibration set it was fitted on, so the properties that
make it valid are asserted here rather than trusted: the calibration draw is the pre-registered
fresh reserve slice, it is disjoint from the test groups, the burned calibration split is not
used, no test evaluation was spent, and the recorded verdict follows from the recorded numbers
instead of being written by hand.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "verification/p3-conformal-intervals.json"
PREREGISTRATION = ROOT / "verification/phase2-data-preregistration.json"
LEDGER = ROOT / "verification/reserve-slice-ledger.json"


@pytest.fixture(scope="module")
def document() -> dict:
    if not EVIDENCE.exists():
        pytest.skip("P-3 evidence not built in this checkout")
    return json.loads(EVIDENCE.read_text(encoding="utf-8"))


def test_calibration_is_the_preregistered_fresh_reserve_slice(document: dict) -> None:
    if not PREREGISTRATION.exists():
        pytest.skip("Phase 2 pre-registration not built in this checkout")
    registered = json.loads(PREREGISTRATION.read_text(encoding="utf-8"))
    slice_record = registered["synthetic"]["reserve_matrix"]["per_study"]["p3"]
    source = document["design"]["calibration_source"]
    assert source["reserve_study"] == "p3"
    assert source["group_ids_sha256"] == slice_record["group_ids_sha256"]
    assert source["sample_ids_sha256"] == slice_record["sample_ids_sha256"]
    assert source["sample_count"] == slice_record["sample_count"]
    assert source["disjoint_from_test_groups"] is True


def test_calibration_frames_never_reuse_a_working_split_group(document: dict) -> None:
    groups = {row["group_id"] for row in document["calibration_frames"]}
    assert groups, "no calibration frames recorded"
    assert all(group.startswith("syn2r-") for group in groups)
    assert all("-p3-" in group for group in groups)


def test_no_test_evaluation_was_spent(document: dict) -> None:
    assert document["test_evaluations_spent"] == 0
    assert document["trained"] == "nothing"
    assert "models/lamellastar-v1/run.json" in document["test_evidence_source"]


def test_the_operating_point_is_the_published_one_and_was_not_refitted(document: dict) -> None:
    assert document["design"]["operating_point"] == {
        "foreground_threshold": 0.6,
        "boundary_threshold": 0.65,
        "marker_threshold": 0.15,
        "min_distance": 3,
        "center_weight": 0.5,
    }
    assert document["design"]["operating_point_source"] == "models/lamellastar-v1/run.json calibration"


def test_the_burned_calibration_split_is_labelled_invalid_wherever_it_appears(document: dict) -> None:
    hazard = document["hazard_demonstration"]
    assert hazard["status"].startswith("INVALID")
    assert "405" in hazard["why_invalid"]
    for lane in hazard["lanes"].values():
        assert lane["quantity"] in {"d32_px", "bubble_count"}


def test_the_verdict_follows_from_the_recorded_numbers(document: dict) -> None:
    band = document["coverage_band"]
    d32 = document["lanes"]["d32_px.absolute"]
    coverage_ok = band["lower_coverage"] <= d32["empirical_coverage"] <= band["upper_coverage"]
    width_ok = d32["median_relative_half_width"] < 0.15
    assert document["coverage_within_band"]["d32_px.absolute"] is coverage_ok
    assert document["d32_width_within_bar"] is width_ok
    assert document["verdict"]["hypothesis_supported"] is bool(coverage_ok and width_ok)


def test_the_conformal_rank_matches_the_calibration_size(document: dict) -> None:
    for lane in document["lanes"].values():
        if "conformal_rank" not in lane:
            continue
        assert lane["conformal_rank"] == 59
        assert lane["calibration_n"] == 64
        assert lane["evaluation_n"] == 64


def test_mondrian_infeasibility_is_published_with_the_size_it_would_need(document: dict) -> None:
    mondrian = document["mondrian_by_condition"]
    assert mondrian["minimum_calibration_size_per_group"] == 9
    assert set(mondrian["groups"]) == set(document["lanes"]["d32_px.absolute"]["per_condition_coverage"])


def test_each_reserve_slice_is_spent_at_most_once(document: dict) -> None:
    if not LEDGER.exists():
        pytest.skip("reserve ledger not built in this checkout")
    ledger = json.loads(LEDGER.read_text(encoding="utf-8"))
    slices = [entry["reserve_study"] for entry in ledger["entries"]]
    assert len(slices) == len(set(slices)), "a reserve slice was observed twice"
    p3 = next(entry for entry in ledger["entries"] if entry["reserve_study"] == "p3")
    assert p3["spent_by"] == document["experiment"]
    assert p3["sample_ids_sha256"] == document["design"]["calibration_source"]["sample_ids_sha256"]


def test_the_follow_on_never_reads_the_test_split(document: dict) -> None:
    follow_on = document["follow_on_instance_prediction_sets"]
    assert "test split is never read" in follow_on["split_rule"]
    assert follow_on["fit_frames"] + follow_on["verification_frames"] == 64
    assert follow_on["risk_control"]["risk_is_non_increasing_in_lambda"] is True
