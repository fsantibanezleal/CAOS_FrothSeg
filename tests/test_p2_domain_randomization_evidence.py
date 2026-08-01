"""Guards on the P-2 evidence file.

These do not re-check the science; they check that the file cannot drift away from the
pre-registration it claims to execute. The properties that matter are the ones a later edit
would be tempted to soften: the bar, the budget, the mandatory Cellpose-SAM caveat, and the
rule that a synthetic-only outcome is a failure rather than a partial success.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "verification/p2-domain-randomization.json"


@pytest.fixture(scope="module")
def report() -> dict:
    if not EVIDENCE.is_file():
        pytest.skip("P-2 has not been run in this checkout")
    return json.loads(EVIDENCE.read_text(encoding="utf-8"))


def test_the_bar_is_the_preregistered_one(report: dict) -> None:
    assert report["bar"]["real"]["threshold"] == 0.25
    assert report["bar"]["real"]["rises_from"] == 0.12485937500000001
    assert report["bar"]["synthetic"]["tolerance"] == 0.03
    assert report["bar"]["synthetic"]["reference"] == 0.51859375


def test_the_verdict_follows_the_bar(report: dict) -> None:
    detail = report["verdict_detail"]
    real = detail["real_clause"]
    synthetic = detail["synthetic_clause"]
    assert real["passed"] == (real["measured"] > real["threshold"])
    assert synthetic["passed"] == (
        abs(synthetic["measured"] - synthetic["reference"]) <= synthetic["tolerance"]
    )
    expected = "pass" if (real["passed"] and synthetic["passed"]) else "null"
    assert report["verdict"] == expected


def test_a_synthetic_only_result_is_never_called_a_pass(report: dict) -> None:
    detail = report["verdict_detail"]
    if detail["synthetic_clause"]["passed"] and not detail["real_clause"]["passed"]:
        assert report["verdict"] == "null"


def test_the_budget_is_two_events_and_no_more(report: dict) -> None:
    budget = report["test_budget"]
    assert budget["events_available"] == 2
    assert budget["events_spent"] <= budget["events_available"]
    assert budget["scope_fixed_before_running"] is True
    assert "hard_stop" in budget


def test_the_teacher_ceiling_caveat_is_present_and_not_used_as_a_bar(report: dict) -> None:
    caveat = report["mandatory_caveat"]
    assert "IN-DISTRIBUTION CEILING FOR THE TEACHER" in caveat
    assert "UNVERIFIED" in caveat
    assert report["cellpose_sam_teacher_ceiling"] != report["bar"]["real"]["threshold"]
    # The bar must not be any simple fraction of the teacher ceiling.
    ratio = report["bar"]["real"]["threshold"] / report["cellpose_sam_teacher_ceiling"]
    assert abs(ratio - round(ratio, 1)) > 1e-6 or round(ratio, 1) not in (0.5, 0.25, 0.75)


def test_no_froth_accuracy_claim_and_no_beyond_sota_claim(report: dict) -> None:
    assert report["beyond_sota_claim"] is False
    assert "not froth" in report["scope"]


def test_selection_was_on_validation_only(report: dict) -> None:
    assert report["surfaces"]["selection"]["test_evaluations_spent"] == 0
    assert "validation" in report["selection"]["metric"]
    arms = report["selection"]["validation_mean_ap_by_arm"]
    assert report["selection"]["selected_arm"] == max(arms, key=arms.get)


def test_the_control_arm_is_the_published_model_bit_for_bit(report: dict) -> None:
    """The surface comparison is only meaningful if the arm really is the published one.

    Same three seeds, and post-processing thresholds identical to the published N1 manifest.
    If either drifts, the burned-against-clean deltas in ``surface_replication`` stop being a
    pure surface effect and the reading in that block becomes wrong.
    """
    published_path = ROOT / "models/lamellastar-v1/run.json"
    if not published_path.is_file():
        pytest.skip("published N1 manifest not present in this checkout")
    published = json.loads(published_path.read_text(encoding="utf-8"))
    control = report["design"]["arms"]["A"]
    for key in (
        "foreground_threshold",
        "boundary_threshold",
        "marker_threshold",
        "min_distance",
        "center_weight",
    ):
        assert control["calibration"][key] == published["calibration"][key], key
    assert [member["seed"] for member in control["members"]] == [
        member["config"]["seed"] for member in published["members"]
    ]
    assert all(member["augmentation"] == "none" for member in control["members"])


def test_surface_replication_deltas_match_the_numbers_they_are_derived_from(
    report: dict,
) -> None:
    replication = report.get("surface_replication")
    if replication is None:
        pytest.skip("no control arm was scored")
    real = replication["real_axis"]
    synthetic = replication["synthetic_axis"]
    assert real["delta"] == pytest.approx(
        real["fresh_split_mean_ap"] - real["burned_split_mean_ap"]
    )
    assert synthetic["delta"] == pytest.approx(
        synthetic["reserve_mean_ap"] - synthetic["burned_test_mean_ap"]
    )
    assert real["fresh_split_mean_ap"] == report["results"]["A"]["fresh_real_mean_ap"]
    assert (
        synthetic["reserve_mean_ap"] == report["results"]["A"]["synthetic_reserve_mean_ap"]
    )
    assert synthetic["burned_test_mean_ap"] == report["bar"]["synthetic"]["reference"]
    assert real["burned_split_mean_ap"] == report["bar"]["real"]["rises_from"]


def test_the_preregistered_claim_language_is_kept_verbatim_both_ways(report: dict) -> None:
    language = report["preregistered_claim_language"]
    assert language["branch_taken"] in {"pass", "fail"}
    assert language["if_it_passes"]
    assert language["if_it_fails"]
    # The factual account of the path taken sits next to it, never instead of it.
    assert report["outcome_statement"]["statement"]
