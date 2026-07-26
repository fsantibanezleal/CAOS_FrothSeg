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
    assert tracked["method_id"] == "L1"
    assert tracked["prediction_kind"] == (
        "framewise_segmentation_with_iou_identity_association"
    )
    assert len(tracked["sequences"]) == 5
    assert all(len(sequence["frame_artifacts"]) == 8 for sequence in tracked["sequences"])
    assert all(
        isinstance(sequence["truth_events"], list)
        and isinstance(sequence["predicted_events"], list)
        for sequence in tracked["sequences"]
    )
    assert video["upstream_commit"] == "2b90b9f5ceec907a1c18123530e92e794ad901a4"
    assert video["method_id"] == "L7"
    assert video["prediction_kind"] == "native_prompted_video_propagation"
    assert video["checkpoint_sha256"] == (
        "7402e0d864fa82708a20fbd15bc84245c2f26dff0eb43a4b5b93452deb34be69"
    )
    assert video["frames"] >= 8
    assert video["prompted_objects"] >= 12
    assert len(video["frame_artifacts"]) == 8
    assert isinstance(video["truth_events"], list)
    assert isinstance(video["predicted_events"], list)
    assert "idf1" in video["temporal_metrics"]
    assert "hota" in video["temporal_metrics"]
    assert "flow_epe_px" in video["temporal_metrics"]
    for report_path, report in (
        (ROOT / "data/derived/temporal/unet-watershed-v2.json", tracked),
        (ROOT / "data/derived/temporal/sam2-1-hiera-tiny.json", video),
    ):
        rows = report.get("sequences", [report])
        for row in rows:
            for artifact in row["frame_artifacts"]:
                for name in ("prediction", "overlay"):
                    path = report_path.parent / artifact[f"{name}_path"]
                    assert path.is_file()
                    assert _sha256(path) == artifact[f"{name}_sha256"]


def test_release_inventory_is_complete_and_honest():
    report = json.loads(
        (ROOT / "data/derived/release-report.json").read_text(encoding="utf-8")
    )
    assert report["schema"] == "frothseg.release/v2"
    assert report["complete"] is (len(report["errors"]) == 0)
    assert len(report["methods"]) == 15
    assert report["method_benchmark"]["beyond_sota_claim"] is False
    temporal = {row["method_id"]: row for row in report["temporal_evidence"]}
    assert temporal["L1"]["prediction_sequence_count"] == 5
    assert temporal["L1"]["prediction_frame_count"] == 40
    assert temporal["L7"]["prediction_sequence_count"] == 1
    assert temporal["L7"]["prediction_frame_count"] == 8


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
