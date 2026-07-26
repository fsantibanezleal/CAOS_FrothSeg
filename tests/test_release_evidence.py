import json
from pathlib import Path

from fslab.model_registry import METHODS


ROOT = Path(__file__).resolve().parents[1]


def test_unified_benchmark_covers_every_registered_method():
    report = json.loads(
        (ROOT / "data/derived/method-benchmark.json").read_text(encoding="utf-8")
    )
    assert report["method_count"] == len(METHODS) == 15
    assert report["implemented_count"] == 15
    assert report["missing_count"] == 0
    assert report["current_bar"]["leader"]["slug"] == "cellpose_sam"
    assert report["current_bar"]["beyond_sota_claim"] is False


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
