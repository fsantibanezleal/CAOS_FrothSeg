import hashlib
import json
from pathlib import Path

from fslab.model_registry import METHODS
from fslab.temporal import FRAMES, FRAMEWISE_MODE, NATIVE_VIDEO_MODE, SEQUENCE_IDS


ROOT = Path(__file__).resolve().parents[1]


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_unified_benchmark_covers_every_registered_method():
    report = json.loads(
        (ROOT / "data/derived/method-benchmark.json").read_text(encoding="utf-8")
    )
    assert report["schema"] == "frothseg.method-benchmark/v2"
    assert report["method_count"] == len(METHODS) == 15
    assert report["implemented_count"] == 15
    assert report["missing_count"] == 0
    assert report["current_bar"]["leader"]["slug"] == "cellpose_sam"
    assert report["current_bar"]["beyond_sota_claim"] is False
    assert report["coverage"] == {
        "expected_methods": 15,
        "expected_test_samples": 64,
        "expected_cells": 960,
        "observed_cells": 960,
        "condition_count": 16,
        "complete": True,
        "errors": [],
    }
    for method in report["methods"]:
        assert len(method["test"]["cases"]) == 64
        assert method["test"]["micro"]["nGt"] > 0
        assert len(method["canonical_cases"]) == 13
        empty_control = next(
            case
            for case in method["canonical_cases"]
            if case["case_id"] == "empty-control"
        )
        assert empty_control.get("n_gt", empty_control.get("nGt")) == 0
        assert method["compute"]["mean_inference_ms"] > 0
        assert method["compute"]["peak_memory_mib"] > 0
        assert method["compute"]["model_artifact_bytes"] >= 0


def test_every_registered_method_has_complete_temporal_evidence():
    """The sequence lane covers the whole ladder, not a favoured subset.

    A method that cannot be run over the sequences does not get to be quietly absent: the file
    has to exist, name itself, cover all five sequences at eight frames, and every published
    artifact has to hash to what the report claims.
    """
    for method in METHODS:
        report_path = ROOT / f"data/derived/temporal/{method.slug}.json"
        assert report_path.is_file(), f"{method.id}: no temporal evidence"
        report = json.loads(report_path.read_text(encoding="utf-8"))
        assert report["method_id"] == method.id
        assert report["frames_per_sequence"] == FRAMES
        assert report["sequence_count"] == len(SEQUENCE_IDS)
        assert {row["condition_id"] for row in report["sequences"]} == set(SEQUENCE_IDS)
        for key in ("mean_idf1", "mean_hota", "mean_frame_coverage", "mean_id_switch_rate"):
            assert key in report, f"{method.id}: missing {key}"
        expected_mode = (
            NATIVE_VIDEO_MODE if method.id == "L7" else FRAMEWISE_MODE
        )
        assert report["prediction_kind"] == expected_mode
        for row in report["sequences"]:
            assert len(row["frame_artifacts"]) == FRAMES
            assert {a["frame_index"] for a in row["frame_artifacts"]} == set(range(FRAMES))
            assert isinstance(row["truth_events"], list)
            assert isinstance(row["predicted_events"], list)
            for artifact in row["frame_artifacts"]:
                path = report_path.parent / artifact["prediction_path"]
                assert path.is_file(), f"{method.id}/{row['condition_id']}: {path} missing"
                assert _sha256(path) == artifact["prediction_sha256"]


def test_official_video_propagation_keeps_its_upstream_provenance():
    """L7 is the one method with a non-comparable protocol; pin its identity and its mode."""
    video = json.loads(
        (ROOT / "data/derived/temporal/sam2_1.json").read_text(encoding="utf-8")
    )
    assert video["upstream_commit"] == "2b90b9f5ceec907a1c18123530e92e794ad901a4"
    assert video["method_id"] == "L7"
    assert video["prediction_kind"] == NATIVE_VIDEO_MODE
    assert video["checkpoint_sha256"] == (
        "7402e0d864fa82708a20fbd15bc84245c2f26dff0eb43a4b5b93452deb34be69"
    )
    assert video["sequence_count"] == len(SEQUENCE_IDS)
    for row in video["sequences"]:
        assert row["prompted_objects"] >= 8
        assert 0.0 <= row["mean_identity_iou"] <= 1.0


def test_release_inventory_is_complete_and_honest():
    report = json.loads(
        (ROOT / "data/derived/release-report.json").read_text(encoding="utf-8")
    )
    assert report["schema"] == "frothseg.release/v2"
    assert report["complete"] is (len(report["errors"]) == 0)
    assert len(report["methods"]) == 15
    assert report["method_benchmark"]["beyond_sota_claim"] is False
    temporal = {row["method_id"]: row for row in report["temporal_evidence"]}
    assert set(temporal) == {method.id for method in METHODS}
    for method_id, row in temporal.items():
        assert row["prediction_sequence_count"] == len(SEQUENCE_IDS), method_id
        assert row["prediction_frame_count"] == len(SEQUENCE_IDS) * FRAMES, method_id


def test_browser_classical_twins_pass_predeclared_cross_language_gate():
    report = json.loads(
        (ROOT / "verification/classical-live-parity.json").read_text(
            encoding="utf-8"
        )
    )
    assert report["schema"] == "frothseg.classical-live-parity/v1"
    assert report["complete"] is True
    assert set(report["accepted_methods"]) == {
        "otsu_cc",
        "watershed_hmax",
        "watershed_dt",
    }
    assert len(report["methods"]) == 3
    for method in report["methods"]:
        assert method["n_conditions"] == 16
        assert method["accepted"] is True
        assert all(method["checks"].values())


def test_n1_preregistered_selection_and_single_test_are_reproducible():
    evidence = json.loads(
        (ROOT / "verification/n1-preregistered-ablation.json").read_text(
            encoding="utf-8"
        )
    )
    assert evidence["schema"] == "frothseg.n1-preregistered-ablation/v2"
    assert evidence["protocol"]["test_access_before_each_selection"] is False
    assert evidence["protocol"]["final_test_evaluations"] == 2
    assert evidence["dataset"]["reserve_groups"] == 0
    assert len(evidence["studies"]) == 2
    assert all(len(study["validation_results"]) == 6 for study in evidence["studies"])
    latest = evidence["studies"][-1]
    winner = max(latest["validation_results"], key=lambda row: row["mean_ap"])
    assert winner["id"] == evidence["selection"]["id"] == "c24-e80-s20260727"
    assert winner["mean_ap"] == evidence["selection"]["validation_mean_ap"]
    assert latest["finalist_gate"]["passed"] is True
    assert evidence["comparison"]["clears_controlled_bar"] is True
    assert evidence["comparison"]["exceeds_measured_leader"] is False

    benchmark = json.loads(
        (ROOT / "data/derived/method-benchmark.json").read_text(encoding="utf-8")
    )
    n1 = next(method for method in benchmark["methods"] if method["id"] == "N1")
    assert n1["test"]["mean_ap"] == evidence["untouched_test"]["mean_ap"]
    assert (
        benchmark["current_bar"]["leader"]["mean_ap"]
        == evidence["comparison"]["cellpose_sam_mean_ap"]
    )
    for artifact in evidence["artifacts"].values():
        path = ROOT / artifact["path"]
        assert path.is_file()
        assert _sha256(path) == artifact["sha256"]
