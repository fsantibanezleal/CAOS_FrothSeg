"""Build the auditable release inventory from already-computed evidence."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.model_registry import METHODS  # noqa: E402

MODEL_RUNS = {
    "unet_watershed": "models/unet-watershed-v2/run.json",
    "deep_marker_watershed": "models/deep-marker-watershed-v1/run.json",
    "gc_fsegnet": "models/gc-fsegnet-v1/run.json",
    "stardist_2d": "models/stardist-froth-v1/run.json",
    "cellpose_sam": "models/cellpose-sam-cpsam-v2/run.json",
    "yolo_froth_seg": "models/yolo-froth-seg-v1/run.json",
    "sam2_1": "models/sam2-1-hiera-tiny/run.json",
    "lamellastar": "models/lamellastar-v1/run.json",
}


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load(relative: str) -> dict:
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def build() -> dict:
    benchmark_path = ROOT / "data/derived/method-benchmark.json"
    benchmark = json.loads(benchmark_path.read_text(encoding="utf-8"))
    benchmark_rows = {row["slug"]: row for row in benchmark["methods"]}
    evidence = []
    errors = []
    for method in METHODS:
        row = benchmark_rows.get(method.slug)
        if method.state != "accepted":
            errors.append(f"{method.id}: registry state is {method.state}")
        if row is None or row["state"] != "implemented":
            errors.append(f"{method.id}: missing benchmark evidence")
            continue
        run_relative = MODEL_RUNS.get(method.slug)
        run_path = ROOT / run_relative if run_relative else None
        if method.learned and (run_path is None or not run_path.exists()):
            errors.append(f"{method.id}: missing model run")
        evidence.append({
            "id": method.id,
            "slug": method.slug,
            "tier": method.tier,
            "implementation_state": row["state"],
            "quality_status": row["quality_status"],
            "test_mean_ap": row["test"]["mean_ap"] if row["test"] else None,
            "canonical_mean_ap": row["canonical"]["mean_ap"] if row["canonical"] else None,
            "run": {
                "path": run_relative,
                "sha256": _sha(run_path),
            } if run_path is not None and run_path.exists() else None,
            "docs_path": method.docs_path,
        })

    temporal_paths = [
        "data/derived/temporal/unet-watershed-v2.json",
        "data/derived/temporal/sam2-1-hiera-tiny.json",
    ]
    temporal = []
    for relative in temporal_paths:
        path = ROOT / relative
        if not path.exists():
            errors.append(f"missing temporal evidence: {relative}")
            continue
        temporal.append({
            "path": relative,
            "sha256": _sha(path),
            "schema": _load(relative)["schema"],
        })

    return {
        "schema": "frothseg.release/v1",
        "version": "0.4.0",
        "complete": not errors,
        "errors": errors,
        "branch_policy": "existing develop branch; no worktree",
        "dataset": {
            "manifest": "manifests/learned-dataset-v2.json",
            "schema": benchmark["dataset_schema"],
            "test_samples": 64,
            "calibration_samples": 64,
            "split_unit": "latent geometry group",
        },
        "method_benchmark": {
            "path": "data/derived/method-benchmark.json",
            "sha256": _sha(benchmark_path),
            "method_count": benchmark["method_count"],
            "implemented_count": benchmark["implemented_count"],
            "leader": benchmark["current_bar"]["leader"],
            "beyond_sota_claim": benchmark["current_bar"]["beyond_sota_claim"],
        },
        "methods": evidence,
        "temporal_evidence": temporal,
    }


def main() -> int:
    report = build()
    output = ROOT / "data/derived/release-report.json"
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({
        "complete": report["complete"],
        "errors": report["errors"],
        "methods": len(report["methods"]),
    }, indent=2))
    return 0 if report["complete"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
