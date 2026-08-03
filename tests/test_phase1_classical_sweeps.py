"""Phase 1 guards: the classical defaults are pinned, and the two that moved moved for a source.

Phase 1 of the 2026-07-31 research plan exposed the classical tier's magic constants as named module
constants and keyword arguments so they could be swept. These tests pin every default, so a change of
one is always a deliberate edit to this file and never a drift.

Two defaults were adopted on 2026-08-01, `C3_FLOODING_SURFACE` and `C7_MODE`. Neither was adopted for
winning its sweep: each was adopted because the engine was not implementing the source the registry
already cites for that method, and each was confirmed BEFORE and AFTER on an untouched reserve slice
that no sweep observed (`verification/phase1-adoption.json`, slice spend recorded in
`verification/reserve-slice-ledger.json`). The guards below pin that story: the new values, the
sourced basis, the unmoved neighbours, and the confirmation on the unobserved surface.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from fslab.science import segment

ROOT = Path(__file__).resolve().parents[1]
PHASE1 = ROOT / "data" / "derived" / "phase1"
VERIFICATION = ROOT / "verification" / "phase1-classical-sweeps.json"
ADOPTION = ROOT / "verification" / "phase1-adoption.json"
RESERVE_LEDGER = ROOT / "verification" / "reserve-slice-ledger.json"

# The two defaults the 2026-08-01 adoption moved, and what they moved from. Anything that changes a
# value here must also change verification/phase1-adoption.json, because the artifact is what says the
# change was confirmed on a surface no sweep observed.
# Exactly the two this artifact moved. C3_H_MAXIMA moved on the same day but under R-2, whose
# evidence is verification/r2-c3-flooding-depth.json, so it does not belong in this set: adding it
# here would assert that phase1-adoption.json claims a change it never made.
ADOPTED_DEFAULTS = {
    "C3_FLOODING_SURFACE": {"from": "neg_edt", "to": "neg_gray"},
    "C7_MODE": {"from": "subtract", "to": "watershed"},
}

PUBLISHED_DEFAULTS = {
    "FOREGROUND_OTSU_FACTOR": 0.75,
    "FOREGROUND_HOLE_MAX_SIZE": 16,
    "FOREGROUND_OBJECT_MAX_SIZE": 12,
    "C2_MIN_DISTANCE": 2,
    "C2_GRADIENT_RADIUS": 1,
    "C4_MIN_DISTANCE": 4,
    "C4_COMPACTNESS": 0.0,
    "C4_WATERSHED_LINE": False,
    "C3_H_MAXIMA": 0.12,                 # ADOPTED 2026-08-01 (R-2), was 0.06
    "C3_FLOODING_SURFACE": "neg_gray",   # ADOPTED 2026-08-01, was "neg_edt"
    "C5_H_MINIMA": 0.08,
    "C7_SEAM_RADIUS": 3,
    "C7_MIN_CAP_SIZE": 8,
    "C7_MODE": "watershed",              # ADOPTED 2026-08-01, was "subtract"
    "C7_WATERSHED_LINE": False,
}


def _froth_frame(seed: int = 7, size: int = 96) -> np.ndarray:
    """A small deterministic froth-like frame: bright caps separated by dark seams."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:size, 0:size]
    image = np.zeros((size, size), dtype=np.float32)
    for _ in range(24):
        cy, cx = rng.integers(6, size - 6, size=2)
        radius = float(rng.integers(4, 9))
        image = np.maximum(image, np.exp(-((yy - cy) ** 2 + (xx - cx) ** 2) / (2 * radius**2)))
    image += rng.normal(0.0, 0.01, image.shape).astype(np.float32)
    return np.clip(image, 0.0, 1.0).astype(np.float32)


@pytest.mark.parametrize(("name", "value"), sorted(PUBLISHED_DEFAULTS.items()))
def test_published_default_is_unchanged(name: str, value) -> None:
    assert getattr(segment, name) == value
    assert isinstance(getattr(segment, name), type(value))


def test_explicit_published_values_are_identical_to_the_defaults() -> None:
    """Passing every published constant explicitly must reproduce the no-argument call exactly."""
    gray = _froth_frame()
    explicit = {
        "otsu_cc": dict(
            otsu_factor=segment.FOREGROUND_OTSU_FACTOR,
            hole_max_size=segment.FOREGROUND_HOLE_MAX_SIZE,
            object_max_size=segment.FOREGROUND_OBJECT_MAX_SIZE,
        ),
        "watershed_immersion": dict(
            min_distance=segment.C2_MIN_DISTANCE,
            gradient_radius=segment.C2_GRADIENT_RADIUS,
        ),
        "watershed_hmax": dict(
            h=segment.C3_H_MAXIMA,
            surface=segment.C3_FLOODING_SURFACE,
            watershed_line=False,
        ),
        "watershed_dt": dict(
            min_distance=segment.C4_MIN_DISTANCE,
            compactness=segment.C4_COMPACTNESS,
            watershed_line=segment.C4_WATERSHED_LINE,
        ),
        "watershed_hmin": dict(h=segment.C5_H_MINIMA),
        "slic_merge": {},
        "valley_edge": dict(
            seam_radius=segment.C7_SEAM_RADIUS,
            min_cap_size=segment.C7_MIN_CAP_SIZE,
            mode=segment.C7_MODE,
            watershed_line=segment.C7_WATERSHED_LINE,
        ),
    }
    assert set(explicit) == set(segment.METHODS)
    for name, kwargs in explicit.items():
        engine = segment.METHODS[name]
        assert np.array_equal(engine(gray), engine(gray, **kwargs)), name


def test_valley_edge_watershed_mode_grows_caps_back() -> None:
    """The constrained-watershed mode must cover at least as much as the seam-subtraction mode."""
    gray = _froth_frame()
    subtracted = segment.valley_edge(gray, mode="subtract")
    flooded = segment.valley_edge(gray, mode="watershed")
    assert int((flooded > 0).sum()) >= int((subtracted > 0).sum())


def test_unknown_mode_and_surface_are_rejected() -> None:
    gray = _froth_frame()
    with pytest.raises(ValueError):
        segment.valley_edge(gray, mode="nope")
    with pytest.raises(ValueError):
        segment.watershed_hmax(gray, surface="nope")


@pytest.mark.skipif(not VERIFICATION.exists(), reason="Phase 1 sweeps have not been run here")
def test_phase1_records_the_two_adopted_defaults_and_reproduces_the_baseline() -> None:
    document = json.loads(VERIFICATION.read_text(encoding="utf-8"))
    changed = {entry["constant"]: entry for entry in document["published_defaults_changed"]}
    assert set(changed) == set(ADOPTED_DEFAULTS)
    for name, move in ADOPTED_DEFAULTS.items():
        assert changed[name]["from"] == move["from"]
        assert changed[name]["to"] == move["to"] == getattr(segment, name)
        assert (ROOT / changed[name]["confirmed_on"]).exists()
    assert document["surface"]["learned_lane_test_evaluations_spent"] == 0
    assert document["baseline_reproduction"][
        "all_seven_engines_identical_to_committed_artifact"
    ] is True
    for path in document["study_artifacts"].values():
        assert (ROOT / path).exists(), path


@pytest.mark.skipif(not ADOPTION.exists(), reason="the adoption has not been confirmed here")
def test_each_adopted_default_was_confirmed_on_an_unobserved_reserve_slice() -> None:
    """The sweeps ran on the observed test split, so the effect must come from somewhere else.

    This pins the whole reason the adoption is allowed to stand: a slice the sweeps never saw, whose
    ids match the frozen pre-registration, measured once, with the direction confirmed on it."""
    document = json.loads(ADOPTION.read_text(encoding="utf-8"))
    prereg = json.loads(
        (ROOT / "verification" / "phase2-data-preregistration.json").read_text(encoding="utf-8")
    )
    slice_name = document["surface"]["reserve_study_slice"]
    expected = prereg["synthetic"]["reserve_matrix"]["per_study"][slice_name]
    assert document["surface"]["group_ids_sha256"] == expected["group_ids_sha256"]
    assert document["surface"]["sample_ids_sha256"] == expected["sample_ids_sha256"]
    assert document["surface"]["cache"] != "data/cache/learned-v2-192.npz"

    assert document["verdict"] == "adopted"
    assert {change["change_id"] for change in document["changes"]} == {
        "c3-flooding-surface", "c7-mode",
    }
    for change in document["changes"]:
        assert change["direction_on_reserve"] == "confirmed"
        assert change["source"]["doi"], change["change_id"]
        delta = change["reserve"]["paired_deltas"]["ap"]
        assert delta["mean_delta"] > 0, change["change_id"]
        assert delta["bootstrap_ci95"][0] > 0, change["change_id"]

    # The one metric that got worse must travel with the change, not sit in a footnote.
    cost = next(c for c in document["changes"] if c["change_id"] == "c7-mode")["stated_cost"]
    assert cost["metric"] == "mean_d32_relative_error"
    assert cost["reserve_after"] > cost["reserve_before"]

    # The neighbours that a score would have moved and a source does not.
    not_moved = {entry["constant"]: entry["value"] for entry in document["deliberately_not_moved"]}
    assert not_moved["valley_edge.seam_radius"] == segment.C7_SEAM_RADIUS
    assert not_moved["valley_edge.watershed_line"] == segment.C7_WATERSHED_LINE
    assert not_moved["watershed_dt.compactness"] == segment.C4_COMPACTNESS
    assert not_moved["_foreground.otsu_factor"] == segment.FOREGROUND_OTSU_FACTOR


@pytest.mark.skipif(not ADOPTION.exists(), reason="the adoption has not been confirmed here")
def test_the_spent_reserve_slice_is_recorded_exactly_once() -> None:
    """A slice observed twice has no guarantee left, so the ledger must show one entry for it."""
    document = json.loads(ADOPTION.read_text(encoding="utf-8"))
    ledger = json.loads(RESERVE_LEDGER.read_text(encoding="utf-8"))
    slice_name = document["surface"]["reserve_study_slice"]
    entries = [entry for entry in ledger["entries"] if entry["reserve_study"] == slice_name]
    assert len(entries) == 1
    entry = entries[0]
    assert entry["spent_by"] == document["reserve_ledger_entry"]["spent_by"]
    assert entry["evidence"] == "verification/phase1-adoption.json"
    assert entry["group_ids_sha256"] == document["surface"]["group_ids_sha256"]
    assert entry["sample_ids_sha256"] == document["surface"]["sample_ids_sha256"]
    assert ledger["slices_spent"] == len(ledger["entries"])
    assert len({e["reserve_study"] for e in ledger["entries"]}) == len(ledger["entries"])


@pytest.mark.skipif(not PHASE1.exists(), reason="Phase 1 sweeps have not been run here")
def test_every_scored_classical_constant_is_swept_or_sourced() -> None:
    """Every constant must be defended, and "not-swept" is not a defence on its own.

    The earlier version of this test accepted `status == "not-swept"` as equivalent to having a
    source, so any constant could exempt itself by declaring the exemption. It also had no status
    for a constant that was swept AND THEN adopted, which is what happened to watershed_hmax.h.
    """
    ledger = json.loads((PHASE1 / "classical-constant-ledger.json").read_text(encoding="utf-8"))
    for row in ledger["constants"]:
        status = row["status"]
        assert status in {"swept", "adopted", "sourced", "not-swept"}, (
            f"{row['constant']}: unknown ledger status {status!r}"
        )
        if status in {"swept", "adopted"}:
            assert row["sweep_artifact"] is not None, row["constant"]
            assert (ROOT / row["sweep_artifact"]).exists(), row["constant"]
        if status == "adopted":
            # An adopted constant changed the engine, so it owes evidence and a stated basis.
            assert row.get("decision_evidence"), (
                f"{row['constant']}: adopted with no decision_evidence"
            )
            assert (ROOT / row["decision_evidence"]).exists(), row["constant"]
            assert row.get("decision_basis"), (
                f"{row['constant']}: adopted with no stated basis"
            )
        if status == "not-swept":
            # A declared exemption must carry a reason a reader can check, not just the label.
            assert bool(row.get("source")) or bool(row.get("verdict")), (
                f"{row['constant']}: declares itself not-swept with neither a source nor a verdict"
            )
    assert ledger["acceptance_met_for_scored_methods_c1_c3_c4_c5_c7"] is True


@pytest.mark.skipif(not PHASE1.exists(), reason="Phase 1 sweeps have not been run here")
def test_the_ledger_publishes_the_value_the_engine_ships() -> None:
    """The ledger's whole job is to say what ships. It restated literals and drifted.

    On 2026-08-02 it published watershed_hmax.h = 0.06 while the engine shipped 0.12, in a file
    that had been regenerated AFTER the change, because the generator hardcoded its published
    values instead of reading them.
    """
    import inspect

    ledger = json.loads((PHASE1 / "classical-constant-ledger.json").read_text(encoding="utf-8"))
    published = {row["constant"]: row["published_value"] for row in ledger["constants"]}
    for constant, (method, parameter) in {
        "watershed_hmax.h": ("watershed_hmax", "h"),
        "watershed_dt.min_distance": ("watershed_dt", "min_distance"),
        "watershed_hmin.h": ("watershed_hmin", "h"),
        "valley_edge.min_cap_size": ("valley_edge", "min_cap_size"),
        "valley_edge.seam_radius": ("valley_edge", "seam_radius"),
    }.items():
        if constant not in published:
            continue
        default = inspect.signature(segment.METHODS[method]).parameters[parameter].default
        assert published[constant] == default, (
            f"{constant}: ledger says {published[constant]!r}, the engine ships {default!r}"
        )
