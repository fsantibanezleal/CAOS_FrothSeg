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


def test_the_preregistered_claim_language_is_kept_verbatim_both_ways(report: dict) -> None:
    language = report["preregistered_claim_language"]
    assert language["branch_taken"] in {"pass", "fail"}
    assert language["if_it_passes"]
    assert language["if_it_fails"]
    # The factual account of the path taken sits next to it, never instead of it.
    assert report["outcome_statement"]["statement"]
