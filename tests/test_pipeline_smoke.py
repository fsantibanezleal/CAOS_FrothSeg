"""Pipeline smoke + determinism: a case regenerates deterministically (same seed -> identical frame sha256), the
empty control runs without crashing and yields zero bubbles, run_all writes the flat index, and the CONTRACT-2
consistency check is clean after a fresh run_all."""
import json

from fslab import pipeline, registry


def test_case_deterministic_same_seed():
    a = pipeline.precompute("poly-normal")
    b = pipeline.precompute("poly-normal")
    assert a["artifacts"]["frame"]["sha256"] == b["artifacts"]["frame"]["sha256"]
    assert a["bsd"]["count"] == b["bsd"]["count"] > 0


def test_empty_control_runs_and_has_no_bubbles():
    m = pipeline.precompute("empty-control")  # no froth -> segmenter must return zero, no crash
    assert m["bsd"]["count"] == 0
    doc = json.loads((pipeline.DERIVED / m["artifacts"]["masks"]["path"]).read_text(encoding="utf-8"))
    assert doc["n_instances"] == 0


def test_run_all_writes_index_and_check_is_clean():
    entries = pipeline.run_all()
    assert len(entries) == len(registry.list_cases()) >= 12
    idx = json.loads((pipeline.MANIFESTS / "index.json").read_text(encoding="utf-8"))
    assert idx["n_cases"] == len(entries) and idx["schema"].startswith("frothseg.index/")
    assert pipeline.check() == 0, "CONTRACT-2 consistency check found drift right after run_all"
