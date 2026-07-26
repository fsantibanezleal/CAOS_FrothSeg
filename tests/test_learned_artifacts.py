import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models" / "unet-watershed-v2"


def test_unet_checkpoint_and_heldout_evidence_are_real_and_consistent():
    run = json.loads((MODEL_DIR / "run.json").read_text(encoding="utf-8"))
    weights = MODEL_DIR / run["inference_weights"]["path"]
    assert weights.stat().st_size == run["inference_weights"]["bytes"] > 100_000
    assert hashlib.sha256(weights.read_bytes()).hexdigest() == run["inference_weights"]["sha256"]
    assert run["evaluation"]["split"] == "test"
    assert run["evaluation"]["n"] >= 12
    assert run["evaluation"]["mean_ap"] > 0.20
    assert run["calibration"]["n"] >= 12


def test_unet_canonical_batch_inference_is_complete():
    report = json.loads(
        (ROOT / "data" / "derived" / "learned" / "unet-watershed-v2" / "benchmark.json")
        .read_text(encoding="utf-8")
    )
    assert report["method"] == "unet_watershed"
    assert report["n_cases"] == 13
    assert len(report["cases"]) == 13
    assert report["checkpoint_sha256"]


def test_unet_onnx_export_has_numerical_parity():
    report = json.loads((MODEL_DIR / "onnx-parity.json").read_text(encoding="utf-8"))
    model = MODEL_DIR / report["onnx"]["path"]
    assert model.stat().st_size == report["onnx"]["bytes"] > 100_000
    assert hashlib.sha256(model.read_bytes()).hexdigest() == report["onnx"]["sha256"]
    assert report["passed"] is True
    assert report["max_abs_error"] <= report["absolute_tolerance"] <= 2e-5
