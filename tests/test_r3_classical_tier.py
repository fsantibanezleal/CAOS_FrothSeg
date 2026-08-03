"""Guards on R-3, the classical tier like-for-like study that returned a null.

A null is the easiest result to lose. Nothing in the engine changed, so no downstream artifact
would break if the record quietly drifted, and there is no failing number to notice. These tests
pin the two things that make the null mean something: that the engine really does still ship the
values the study declined to move, and that the decision recorded matches the rule that was fixed
before the slice was read.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.science import segment  # noqa: E402

RESULT = ROOT / "verification/r3-classical-tier.json"
LEDGER = ROOT / "verification/reserve-slice-ledger.json"


def _result() -> dict:
    if not RESULT.exists():
        pytest.skip("R-3 has not been run here")
    return json.loads(RESULT.read_text(encoding="utf-8"))


def test_the_engine_still_ships_what_r3_declined_to_move() -> None:
    """The whole content of a null. If a constant drifts, the published null is a false record."""
    document = _result()
    shipped = document["decision"]["shipped"]
    assert segment.FOREGROUND_OTSU_FACTOR == shipped["otsu_factor"]
    assert segment.C2_MIN_DISTANCE == shipped["c2_min_distance"]
    assert segment.C5_H_MINIMA == shipped["c5_h_minima"]
    assert document["decision"]["adopted"] is False, (
        "R-3 is recorded as adopted; if that changed, the engine defaults and every classical "
        "artifact have to move with it"
    )


def test_the_decision_follows_the_two_preregistered_clauses() -> None:
    """Adoption is a conjunction fixed in advance, not a judgement made after the read."""
    document = _result()
    decision = document["decision"]
    confirmation = document["confirmation"]
    primary = confirmation["primary"]

    expected_primary = primary["paired_delta"] > 0 and primary["p"] < 0.05
    assert decision["primary_clause_passed"] == expected_primary

    floor = confirmation["resolvable_paired_delta"]
    regressors = {
        method: row["paired_delta"]
        for method, row in confirmation["per_method"].items()
        if row["paired_delta"] < -floor
    }
    assert decision["regression_clause_passed"] == (not regressors)
    assert set(decision["regressors"]) == set(regressors)
    assert decision["adopted"] == (
        decision["primary_clause_passed"] and decision["regression_clause_passed"]
    )


def test_the_null_was_not_a_failure_to_find_an_effect() -> None:
    """This null is a REFUSAL, not an absence, and the distinction has to survive in the record.

    The tier mean moved decisively. What blocked adoption was the leader regressing. A future
    reader who sees "not adopted" and assumes "nothing happened" would draw the wrong lesson, so
    the artifact has to keep carrying both halves.
    """
    document = _result()
    primary = document["confirmation"]["primary"]
    assert primary["paired_delta"] > 0 and primary["p"] < 0.05, (
        "the primary clause is recorded as failing; the outcome record says it passed"
    )
    assert document["decision"]["regressors"], (
        "a null with no regressor recorded cannot be explained by the regression clause"
    )


def test_the_confirmation_was_clustered_by_group_not_by_image() -> None:
    """The sizing correction has to reach the test that spends the slice, not just the ledger."""
    document = _result()
    confirmation = document["confirmation"]
    assert confirmation["n_independent"] < confirmation["n_images"], (
        "the confirmation reports as many independent units as images, so it tested across images "
        "and claimed about twice the degrees of freedom the design supplies"
    )
    assert "group" in confirmation["unit_of_replication"]


def test_l1_is_recorded_as_spent_exactly_once() -> None:
    if not LEDGER.exists():
        pytest.skip("ledger not present")
    ledger = json.loads(LEDGER.read_text(encoding="utf-8"))
    spent = [entry["reserve_study"] for entry in ledger["entries"]]
    assert spent.count("l1") == 1, "l1 must appear exactly once; twice means it was observed twice"
    entry = next(e for e in ledger["entries"] if e["reserve_study"] == "l1")
    assert entry["evidence"] == "verification/r3-classical-tier.json"


def test_endpoint_selections_are_reported_rather_than_hidden() -> None:
    """Two constants selected onto a grid edge. That is a finding and has to stay legible."""
    document = _result()
    stage_b = document["selection"]["stage_b"]
    on_endpoint = [name for name, row in stage_b.items() if row["on_endpoint"]]
    assert on_endpoint, (
        "no endpoint selection is recorded, but R-3 found two; if the grids were widened the "
        "study has to be re-pre-registered rather than re-run"
    )
    for name in on_endpoint:
        selected = stage_b[name]["selected"]
        grid = stage_b[name]["grid"]
        assert selected in (grid[0], grid[-1]), f"{name}: flagged as an endpoint but is interior"
