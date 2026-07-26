"""Aggregate every implemented method into the web/release benchmark contract."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.model_registry import METHODS  # noqa: E402

MODEL_RUNS = {
    "unet_watershed": ROOT / "models/unet-watershed-v2/run.json",
    "deep_marker_watershed": ROOT / "models/deep-marker-watershed-v1/run.json",
    "gc_fsegnet": ROOT / "models/gc-fsegnet-v1/run.json",
    "stardist_2d": ROOT / "models/stardist-froth-v1/run.json",
    "cellpose_sam": ROOT / "models/cellpose-sam-cpsam-v2/run.json",
    "yolo_froth_seg": ROOT / "models/yolo-froth-seg-v1/run.json",
    "sam2_1": ROOT / "models/sam2-1-hiera-tiny/run.json",
    "lamellastar": ROOT / "models/lamellastar-v1/run.json",
}

CANONICAL_RUNS = {
    "unet_watershed": ROOT / "data/derived/learned/unet-watershed-v2/benchmark.json",
    "deep_marker_watershed": ROOT / "data/derived/learned/deep-marker-watershed-v1/benchmark.json",
    "gc_fsegnet": ROOT / "data/derived/learned/gc-fsegnet-v1/benchmark.json",
    "stardist_2d": ROOT / "data/derived/learned/stardist-froth-v1/benchmark.json",
    "cellpose_sam": ROOT / "data/derived/learned/cellpose-sam-cpsam-v2/benchmark.json",
    "yolo_froth_seg": ROOT / "data/derived/learned/yolo-froth-seg-v1/benchmark.json",
    "sam2_1": ROOT / "data/derived/learned/sam2-1-hiera-tiny/benchmark.json",
    "lamellastar": ROOT / "data/derived/learned/lamellastar-v1/benchmark.json",
}


def _load(path: Path) -> dict | None:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def _classical_canonical() -> dict[str, dict]:
    by_method: dict[str, list[dict]] = {}
    for path in sorted((ROOT / "data/derived/synth").glob("*/benchmark.json")):
        document = _load(path)
        if document is None:
            continue
        case_id = path.parent.name
        for row in document["methods"]:
            by_method.setdefault(row["method"], []).append({"case_id": case_id, **row})
    out = {}
    for method, rows in by_method.items():
        scored = [row for row in rows if row["ap"] is not None]
        out[method] = {
            "split": "canonical-synthetic-diagnostic",
            "n": len(rows),
            "mean_ap": float(np.mean([row["ap"] for row in scored])),
            "mean_ap50": float(np.mean([row["ap50"] for row in scored])),
            "mean_pq": None,
            "cases": rows,
        }
    return out


def build() -> dict:
    classical = _classical_canonical()
    rows = []
    for method in METHODS:
        run = _load(MODEL_RUNS[method.slug]) if method.slug in MODEL_RUNS else None
        canonical = (
            _load(CANONICAL_RUNS[method.slug])
            if method.slug in CANONICAL_RUNS
            else classical.get(method.slug)
        )
        evaluation = run.get("evaluation") if run else None
        executable = canonical is not None and (not method.learned or run is not None)
        score = evaluation["mean_ap"] if evaluation else (
            canonical["mean_ap"] if canonical else None
        )
        rows.append({
            "id": method.id,
            "slug": method.slug,
            "name": method.name,
            "tier": method.tier,
            "lane": method.lane,
            "engine": method.engine,
            "state": "implemented" if executable else "missing",
            "quality_status": (
                "passes-current-bar" if score is not None and score >= 0.30
                else "below-current-bar" if score is not None
                else "not-evaluated"
            ),
            "test": {
                key: evaluation[key]
                for key in ("split", "n", "mean_ap", "mean_ap50", "mean_pq")
            } if evaluation else None,
            "canonical": {
                key: canonical.get(key)
                for key in ("split", "n_cases", "n", "mean_ap", "mean_ap50", "mean_pq")
                if key in canonical
            } if canonical else None,
            "canonical_cases": canonical.get("cases", []) if canonical else [],
            "docs_path": method.docs_path,
        })
    implemented = [row for row in rows if row["state"] == "implemented"]
    scored_test = [row for row in implemented if row["test"] is not None]
    leader = max(scored_test, key=lambda row: row["test"]["mean_ap"]) if scored_test else None
    return {
        "schema": "frothseg.method-benchmark/v1",
        "dataset_schema": "frothseg.learned-dataset/v2",
        "canonical_case_count": 13,
        "method_count": len(rows),
        "implemented_count": len(implemented),
        "missing_count": len(rows) - len(implemented),
        "current_bar": {
            "metric": "test mean mask AP@[.5:.95]",
            "threshold": 0.30,
            "leader": {
                "id": leader["id"],
                "slug": leader["slug"],
                "mean_ap": leader["test"]["mean_ap"],
            } if leader else None,
            "beyond_sota_claim": False,
        },
        "methods": rows,
    }


def main() -> None:
    document = build()
    output = ROOT / "data/derived/method-benchmark.json"
    output.write_text(json.dumps(document, indent=2), encoding="utf-8")
    print(json.dumps({
        key: document[key]
        for key in ("method_count", "implemented_count", "missing_count", "current_bar")
    }, indent=2))


if __name__ == "__main__":
    main()
