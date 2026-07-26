import hashlib
import json
from pathlib import Path

from fslab.model_registry import METHODS


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
        assert method["compute"]["mean_inference_ms"] > 0
        assert method["compute"]["peak_memory_mib"] > 0
        assert method["compute"]["model_artifact_bytes"] >= 0


def test_temporal_evidence_covers_tracking_and_official_video_propagation():
    tracked = json.loads(
        (ROOT / "data/derived/temporal/unet-watershed-v2.json").read_text(encoding="utf-8")
    )
    video = json.loads(
        (ROOT / "data/derived/temporal/sam2-1-hiera-tiny.json").read_text(encoding="utf-8")
    )
    assert tracked["sequence_count"] >= 5
    assert tracked["frames_per_sequence"] >= 8
    assert "mean_idf1" in tracked
    assert "mean_hota" in tracked
    assert "mean_flow_epe_px" in tracked
    assert video["upstream_commit"] == "2b90b9f5ceec907a1c18123530e92e794ad901a4"
    assert video["frames"] >= 8
    assert video["prompted_objects"] >= 12
    assert "idf1" in video["temporal_metrics"]
    assert "hota" in video["temporal_metrics"]
    assert "flow_epe_px" in video["temporal_metrics"]


def test_release_inventory_is_complete_and_honest():
    report = json.loads(
        (ROOT / "data/derived/release-report.json").read_text(encoding="utf-8")
    )
    assert report["schema"] == "frothseg.release/v2"
    assert report["complete"] is (len(report["errors"]) == 0)
    assert len(report["methods"]) == 15
    assert report["method_benchmark"]["beyond_sota_claim"] is False


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
    assert evidence["schema"] == "frothseg.n1-preregistered-ablation/v1"
    assert evidence["protocol"]["test_access_before_selection"] is False
    assert evidence["protocol"]["final_test_evaluations"] == 1
    assert len(evidence["validation_results"]) == 6
    winner = max(evidence["validation_results"], key=lambda row: row["mean_ap"])
    assert winner["id"] == evidence["selection"]["id"] == "c24-e40-s20260727"
    assert winner["mean_ap"] == evidence["selection"]["validation_mean_ap"]
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
