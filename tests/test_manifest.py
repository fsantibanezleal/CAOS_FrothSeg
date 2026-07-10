"""CONTRACT 2 (artifact) tests: the manifest points to real artifacts with the recorded byte size AND sha256, the
lane verdict is consistent with the gate, and the committed masks round-trip back to the same instance count."""
import json

from fslab import pipeline
from fslab.io.froth_io import coco_rle_to_labels, sha256_file


def test_manifest_matches_artifacts_and_gate():
    m = pipeline.precompute("poly-normal", seed=7)
    assert m["schema"].startswith("frothseg.manifest/")
    for key in ("frame", "masks", "bsd", "benchmark"):
        a = m["artifacts"][key]
        path = pipeline.DERIVED / a["path"]
        assert path.exists(), f"manifest points to a non-existent {key} artifact"
        assert path.stat().st_size == a["bytes"], f"{key} byte size drifted from the artifact"
        assert sha256_file(path) == a["sha256"], f"{key} sha256 drifted"
    # froth benchmark uses scipy/skimage/opencv (not Pyodide-safe) => the case lane is PRECOMPUTE (honest gate)
    assert m["lane"] == "precompute" and m["gate"]["lane"] == m["lane"]


def test_masks_roundtrip_to_same_instance_count():
    m = pipeline.precompute("fine-froth", seed=7)
    doc = json.loads((pipeline.DERIVED / m["artifacts"]["masks"]["path"]).read_text(encoding="utf-8"))
    lab = coco_rle_to_labels(doc["instances"], doc["height"], doc["width"])
    n_decoded = len({int(i) for i in lab.ravel() if i > 0})
    assert n_decoded == doc["n_instances"] == m["artifacts"]["masks"]["n_instances"]
    assert doc["n_instances"] == m["bsd"]["count"] or doc["n_instances"] >= 1


def test_benchmark_scores_present_for_every_floor_method():
    m = pipeline.precompute("poly-normal", seed=7)
    methods = {b["method"] for b in m["benchmark"]}
    assert {"watershed_dt", "watershed_hmax", "slic_merge"} <= methods
    best = max((b for b in m["benchmark"] if b["ap"] is not None), key=lambda b: b["ap"])
    assert best["ap"] > 0.1  # the classical floor recovers a real fraction on a clean nominal case
