"""The real-domain transfer lane, and the separation it must never lose."""

from __future__ import annotations

import json
from pathlib import Path

from fslab.model_registry import METHODS

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data/derived/real-adjacent-dataset-manifest.json"
BENCHMARK = ROOT / "data/derived/real-adjacent-benchmark.json"


def test_adjacent_source_is_marked_adjacent_everywhere():
    """The whole safety property. If this field drifts to 'froth' anywhere, the release
    gate would accept cell nuclei as froth evidence and the report would lie."""
    registry = json.loads(
        (ROOT / "manifests/source-registry.json").read_text(encoding="utf-8")
    )
    source = next(
        s for s in registry["sources"] if s["source_id"] == "bbbc038-dsb2018"
    )
    assert source["domain"] == "adjacent"
    assert source["license"] == "CC0-1.0"

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    assert manifest["domain"] == "adjacent"
    assert manifest["license"] == source["license"]

    benchmark = json.loads(BENCHMARK.read_text(encoding="utf-8"))
    assert benchmark["domain"] == "adjacent"
    assert benchmark["source_id"] == "bbbc038-dsb2018"


def test_release_gate_still_demands_froth():
    """Adjacent evidence must never satisfy the froth requirement, however much of it
    accumulates."""
    report = json.loads(
        (ROOT / "data/derived/release-report.json").read_text(encoding="utf-8")
    )
    assert report["complete"] is False
    assert any("FROTH" in error for error in report["errors"])


def test_transfer_covers_every_unprompted_method_with_no_silent_drops():
    benchmark = json.loads(BENCHMARK.read_text(encoding="utf-8"))
    expected = {method.id for method in METHODS if method.id != "L7"}
    assert {row["id"] for row in benchmark["methods"]} == expected
    for row in benchmark["methods"]:
        # A method that could not run is recorded as failed samples, never omitted.
        assert row["n_scored"] + row["n_failed"] == benchmark["n_samples"]


def test_grouping_declares_itself_a_proxy():
    """BBBC038 ships no acquisition metadata. The split guard is a proxy and the manifest
    has to say so rather than implying real acquisition grouping."""
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    assert "proxy" in manifest["grouping"]["note"].lower()
    assert manifest["grouping"]["group_count"] > 1
    assert manifest["sample_count"] == 670


def test_leader_note_carries_the_transfer_result():
    """The froth leader claim must not be readable without the finding that it does not
    survive a change of domain."""
    bar = json.loads(
        (ROOT / "data/derived/method-benchmark.json").read_text(encoding="utf-8")
    )["current_bar"]
    note = bar["leader_note"]
    assert "transfer" in note.lower()
    assert "generator-specific" in note.lower()
    assert bar["beyond_sota_claim"] is False
