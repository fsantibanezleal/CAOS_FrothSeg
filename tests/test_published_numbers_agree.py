"""The artifacts that publish the same quantity must agree with each other.

Every number in this repository exists in more than one place: an engine writes it, a benchmark
aggregates it, prose quotes it. Nothing checked that the first two agreed, and on 2026-08-02 a
release shipped with fourteen prose claims still asserting pre-correction values while the
artifacts underneath them had all moved. The prose half of that problem cannot be tested cheaply.
The artifact half can, and this file does it.

What is asserted here is narrow on purpose: only relationships that must hold BY CONSTRUCTION, so
a failure means a real inconsistency and never a stale expectation. No literal metric values are
pinned, because a test that hardcodes 0.2975 has to be edited every time a legitimate re-bake
happens, and a test that gets edited on every run stops being read.
"""

from __future__ import annotations

import json
import statistics
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]

SLUG_TO_ID = {
    "otsu_cc": "C1",
    "watershed_immersion": "C2",
    "watershed_hmax": "C3",
    "watershed_dt": "C4",
    "watershed_hmin": "C5",
    "slic_merge": "C6",
    "valley_edge": "C7",
}


def load(relative: str):
    path = ROOT / relative
    if not path.exists():
        pytest.skip(f"{relative} not present")
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def benchmark():
    return load("data/derived/method-benchmark.json")


@pytest.fixture(scope="module")
def timing():
    """Deliberately NOT load(): a missing timing artifact must fail, never skip.

    load() skips when a file is absent, so deleting data/derived/inference-timing.json turned off
    both timing invariants at once and the benchmark could revert to per-bake leftovers with a
    green suite. The artifact is a release input, not an optional extra.
    """
    path = ROOT / "data/derived/inference-timing.json"
    assert path.exists(), (
        "data/derived/inference-timing.json is missing. It is the only source of the published "
        "compute axis; without it build_method_benchmark falls back to per-bake timings."
    )
    return json.loads(path.read_text(encoding="utf-8"))


def test_classical_heldout_agrees_with_the_benchmark(benchmark):
    """The benchmark's classical rows are a copy of classical-heldout. Copies drift."""
    classical = load("data/derived/classical-heldout.json")
    published = {
        row["id"]: row["test"]["mean_ap"] for row in benchmark["methods"] if row.get("test")
    }
    for row in classical["methods"]:
        method_id = SLUG_TO_ID[row["method"]]
        assert row["mean_ap"] == pytest.approx(published[method_id], abs=1e-12), (
            f"{method_id}: classical-heldout says {row['mean_ap']}, the benchmark says "
            f"{published[method_id]}. One of the two was re-baked without the other."
        )


def test_the_compute_axis_comes_from_the_timing_artifact(benchmark, timing):
    """ms/image is a Pareto axis. It must be the measured number, not a per-bake leftover."""
    measured = {
        row["id"]: row for row in timing["methods"] if row["measured"]
    }
    # Coverage has to be asserted, not assumed. Skipping rows absent from the timing artifact meant
    # a method whose predictor failed to load silently kept whatever its own bake had recorded.
    unmeasured = {row["id"] for row in timing["methods"] if not row["measured"]}
    covered = set(measured) | unmeasured
    published = {row["id"] for row in benchmark["methods"] if row.get("test")}
    assert published <= covered, (
        f"methods published with no row in inference-timing.json: {sorted(published - covered)}"
    )
    for row in benchmark["methods"]:
        compute = row.get("compute") or {}
        if row["id"] not in measured:
            continue
        assert compute["mean_inference_ms"] == pytest.approx(
            measured[row["id"]]["mean_inference_ms"], abs=1e-9
        ), f"{row['id']}: the benchmark's ms disagrees with data/derived/inference-timing.json"
        assert compute["timing_source"] == "repeated-per-image"
        assert compute["timing_is_measured_inference"] is True


def test_no_published_timing_is_an_undisclosed_wall_clock_division(benchmark):
    """A derived figure may ship, but never while claiming to be a measurement.

    L6 published 300.91 ms/image from a run that included its own TRAINING, and L7 972.42 ms from
    one that included loading a checkpoint. Both were labelled inference and nothing downstream
    could tell.
    """
    for row in benchmark["methods"]:
        compute = row.get("compute") or {}
        source = compute.get("timing_source")
        if source is None:
            continue
        derived = source in {"run-duration-divided", "test-duration-divided", "no-single-image-lane"}
        assert compute["timing_is_measured_inference"] is not derived, (
            f"{row['id']}: timing_source {source!r} is labelled "
            f"measured={compute['timing_is_measured_inference']}"
        )
        if derived:
            assert compute.get("timing_note"), (
                f"{row['id']}: carries a derived timing with no reason recorded"
            )


def test_an_unstable_timing_never_reaches_the_compute_axis(benchmark, timing):
    assert timing["all_stable"] is True, f"unstable rows published: {timing['unstable']}"
    assert not timing["stability_not_established"], (
        f"rows with no stability verdict published: {timing['stability_not_established']}"
    )
    for row in timing["methods"]:
        if row["measured"]:
            assert row["stable"] is True, f"{row['id']}: measured but stable={row['stable']!r}"


def test_the_sam_summary_matches_its_own_scored_cases():
    """The floor column is the best classical method per case, so it moves when they do."""
    sam = load("data/derived/sam_benchmark.json")
    scored = [case for case in sam["cases"] if case.get("floor_ap") is not None]
    summary = sam["summary"]
    assert summary["n_scored"] == len(scored)
    assert summary["mean_sam_ap"] == pytest.approx(
        round(statistics.fmean(case["sam_ap"] for case in scored), 3), abs=1e-9
    )
    assert summary["mean_floor_ap"] == pytest.approx(
        round(statistics.fmean(case["floor_ap"] for case in scored), 3), abs=1e-9
    )
    assert summary["sam_wins"] == sum(
        1 for case in scored if case["sam_ap"] > case["floor_ap"]
    )
    for case in scored:
        assert case["floor_method"] in SLUG_TO_ID, (
            f"{case['case_id']}: floor_method {case['floor_method']!r} is not a classical slug"
        )


def test_the_transfer_delta_is_computed_across_one_engine(benchmark):
    """Both sides of a subtraction have to be re-baked together.

    Re-running only the synthetic side after the C3 depth correction would have turned a measured
    -0.081 into a fabricated -0.170, with every rebake step still reporting success.
    """
    real = load("data/derived/real-adjacent-benchmark.json")
    real_ap = {row["id"]: row["mean_ap"] for row in real["methods"]}
    synthetic = {
        row["id"]: row["test"]["mean_ap"] for row in benchmark["methods"] if row.get("test")
    }
    shared = set(real_ap) & set(synthetic)
    assert len(shared) >= 14, f"only {len(shared)} methods scored on both surfaces"
    # C3 is the row the depth correction moved. Its synthetic score must be the corrected one, and
    # the real side must have been re-measured with it: the pre-correction pair was 0.2196/0.1278.
    assert synthetic["C3"] > 0.25, (
        "C3's synthetic AP looks pre-correction; method-benchmark was not re-baked"
    )
    assert real_ap["C3"] > 0.15, (
        "C3's real-adjacent AP looks pre-correction while the synthetic side moved, so the "
        "transfer delta would be computed across two different engines"
    )


def test_the_baseline_reproduction_certifies_the_artifact_that_ships():
    """"Identical to the committed artifact" has to name WHICH bytes it reproduced.

    The certificate recorded only a path, so re-baking classical-heldout.json let a reproduction
    claim made about different bytes carry over silently, and the engine constants it was produced
    under were not recorded at all.
    """
    import hashlib

    reproduction = load("data/derived/phase1/baseline-reproduction.json")
    assert reproduction["all_identical"] is True
    reference = ROOT / reproduction["reference_artifact"]
    assert reference.exists()
    assert reproduction["reference_artifact_sha256"] == hashlib.sha256(
        reference.read_bytes()
    ).hexdigest(), (
        "the baseline reproduction was certified against a different version of "
        f"{reproduction['reference_artifact']} than the one that ships"
    )
    import sys

    sys.path.insert(0, str(ROOT / "data-pipeline"))
    from fslab.science import segment

    for name, value in reproduction["engine_constants"].items():
        assert getattr(segment, name) == value, (
            f"{name}: reproduction ran with {value!r}, the engine now ships "
            f"{getattr(segment, name)!r}"
        )


def test_the_release_report_names_the_release_that_ships():
    """The report is the release inventory. It shipped stamped 0.5.0 while the tag was v0.06.001.

    build_release_report reads the version from pyproject and fslab.__version__, and the rebake
    driver runs it BEFORE the version bump, so the artifact lagged a release every time.
    """
    report = load("data/derived/release-report.json")
    declared = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    semver = ".".join(str(int(part)) for part in declared.split("."))
    assert report["version"] == semver, (
        f"release-report.json says version {report['version']!r}, VERSION says {declared!r} "
        f"({semver!r}). Regenerate the report after the version bump."
    )
