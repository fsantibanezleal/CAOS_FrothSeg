"""Phase 1 guards: the classical engines are parameterised WITHOUT moving a published number.

Phase 1 of the 2026-07-31 research plan exposed the classical tier's magic constants as named module
constants and keyword arguments so they could be swept. The whole point is that the sweeps are recorded
and no published default moves, so these tests pin exactly that: every default equals the literal it
replaced, calling an engine with its published values explicitly is bit-identical to calling it with
none, and the recorded sweep artifacts agree with each other and with the committed benchmark.
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

PUBLISHED_DEFAULTS = {
    "FOREGROUND_OTSU_FACTOR": 0.75,
    "FOREGROUND_HOLE_MAX_SIZE": 16,
    "FOREGROUND_OBJECT_MAX_SIZE": 12,
    "C2_MIN_DISTANCE": 2,
    "C2_GRADIENT_RADIUS": 1,
    "C4_MIN_DISTANCE": 4,
    "C4_COMPACTNESS": 0.0,
    "C4_WATERSHED_LINE": False,
    "C3_H_MAXIMA": 0.06,
    "C3_FLOODING_SURFACE": "neg_edt",
    "C5_H_MINIMA": 0.08,
    "C7_SEAM_RADIUS": 3,
    "C7_MIN_CAP_SIZE": 8,
    "C7_MODE": "subtract",
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
def test_phase1_records_no_default_change_and_reproduces_the_baseline() -> None:
    document = json.loads(VERIFICATION.read_text(encoding="utf-8"))
    assert document["published_defaults_changed"] == []
    assert document["surface"]["learned_lane_test_evaluations_spent"] == 0
    assert document["baseline_reproduction"][
        "all_seven_engines_identical_to_committed_artifact"
    ] is True
    for path in document["study_artifacts"].values():
        assert (ROOT / path).exists(), path


@pytest.mark.skipif(not PHASE1.exists(), reason="Phase 1 sweeps have not been run here")
def test_every_scored_classical_constant_is_swept_or_sourced() -> None:
    ledger = json.loads((PHASE1 / "classical-constant-ledger.json").read_text(encoding="utf-8"))
    for row in ledger["constants"]:
        swept = row["status"] == "swept" and row["sweep_artifact"] is not None
        sourced = bool(row.get("source")) or row["status"] == "not-swept"
        assert swept or sourced, row["constant"]
        if swept:
            assert (ROOT / row["sweep_artifact"]).exists(), row["constant"]
    assert ledger["acceptance_met_for_scored_methods_c1_c3_c4_c5_c7"] is True
