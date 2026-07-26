"""Build the auditable release inventory from already-computed evidence."""

from __future__ import annotations

import hashlib
import json
import subprocess
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

REQUIRED_TEST_METRICS = {
    "mean_ap",
    "mean_ap50",
    "mean_pq",
    "mean_boundary_fscore",
    "mean_bsd_wasserstein",
    "mean_count_relative_error",
    "mean_d32_relative_error",
    "mean_inference_ms",
    "robustness_by_condition",
}

REQUIRED_DOC_THEMES = {
    "architecture",
    "frameworks",
    "guides",
    "methods",
    "data-contract",
    "metrics",
    "temporal",
    "benchmark",
    "problem-types",
    "use-cases",
}

REQUIRED_TEMPORAL_METRICS = {
    "idf1",
    "hota",
    "track_fragmentations",
    "event_precision",
    "event_recall",
    "flow_epe_px",
}


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load(relative: str) -> dict:
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def _latest_tag() -> str | None:
    result = subprocess.run(
        ["git", "describe", "--tags", "--abbrev=0"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip() or None


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
        test = row.get("test") or {}
        missing_metrics = sorted(REQUIRED_TEST_METRICS - test.keys())
        if missing_metrics:
            errors.append(f"{method.id}: incomplete held-out metrics: {', '.join(missing_metrics)}")
        if test.get("n") != 64:
            errors.append(f"{method.id}: held-out matrix has {test.get('n')} rows, expected 64")
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
            "test_mean_ap": test.get("mean_ap"),
            "test_mean_boundary_fscore": test.get("mean_boundary_fscore"),
            "test_mean_bsd_wasserstein": test.get("mean_bsd_wasserstein"),
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
        document = _load(relative)
        if "sam2" in relative:
            values = document.get("temporal_metrics", {})
        else:
            sequences = document.get("sequences", [])
            values = sequences[0] if sequences else {}
        missing_temporal = sorted(REQUIRED_TEMPORAL_METRICS - values.keys())
        if missing_temporal:
            errors.append(
                f"incomplete temporal metrics in {relative}: {', '.join(missing_temporal)}"
            )
        temporal.append({
            "path": relative,
            "sha256": _sha(path),
            "schema": document["schema"],
            "metrics": {key: values.get(key) for key in sorted(REQUIRED_TEMPORAL_METRICS)},
        })

    source_registry_path = ROOT / "manifests/source-registry.json"
    accepted_real_sources = []
    if not source_registry_path.exists():
        errors.append("missing source registry")
    else:
        source_registry = _load("manifests/source-registry.json")
        accepted_real_sources = [
            source for source in source_registry.get("sources", [])
            if str(source.get("kind", "")).startswith("real")
            and source.get("acceptance_state") == "accepted"
            and int(source.get("sample_count", 0)) > 0
        ]
        if not accepted_real_sources:
            errors.append(
                "no accepted licensed real held-out source with imported samples and calibration"
            )
        elif not any(source.get("calibrated_sample_count", 0) > 0 for source in accepted_real_sources):
            errors.append("accepted real sources contain no physically calibrated samples")

    cellpose_run = _load(MODEL_RUNS["cellpose_sam"])
    cellpose_fine_tuning = cellpose_run.get("fine_tuning", {})
    if cellpose_fine_tuning.get("state") != "completed":
        errors.append("L5: Cellpose-SAM is evaluated pretrained but has not been fine-tuned")
    elif int(cellpose_fine_tuning.get("epochs", 0)) < 2:
        errors.append("L5: Cellpose-SAM fine-tuning must cover at least two full epochs")

    for method in METHODS:
        if not method.learned:
            continue
        run = _load(MODEL_RUNS[method.slug])
        evaluation = run.get("evaluation", {})
        if evaluation.get("mean_ece") is None and run.get("calibration_status") != "not-exposed-by-engine":
            errors.append(f"{method.id}: missing calibration/uncertainty evidence or engine rationale")

    missing_doc_themes = sorted(
        theme for theme in REQUIRED_DOC_THEMES
        if not (ROOT / "docs" / theme).is_dir()
    )
    if missing_doc_themes:
        errors.append(f"missing deep wiki themes: {', '.join(missing_doc_themes)}")

    for relative, label in (
        ("verification/workbench-contract.json", "workbench acceptance evidence"),
        ("verification/visual-qa/manifest.json", "full visual QA manifest"),
        ("VERSION", "root version file"),
    ):
        if not (ROOT / relative).exists():
            errors.append(f"missing {label}: {relative}")

    version = "0.4.0"
    latest_tag = _latest_tag()
    expected_tag = "v0.04.000"
    if latest_tag != expected_tag:
        errors.append(f"version/tag mismatch: expected {expected_tag}, latest is {latest_tag}")
    license_text = (ROOT / "LICENSE").read_text(encoding="utf-8")
    if "Apache License" not in license_text:
        errors.append("repository code license is not Apache-2.0")

    return {
        "schema": "frothseg.release/v2",
        "version": version,
        "complete": not errors,
        "errors": errors,
        "branch_policy": "existing develop branch; no worktree",
        "dataset": {
            "manifest": "manifests/learned-dataset-v2.json",
            "schema": benchmark["dataset_schema"],
            "test_samples": 64,
            "calibration_samples": 64,
            "split_unit": "latent geometry group",
            "accepted_real_sources": [
                source["source_id"] for source in accepted_real_sources
            ],
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
        "release_contract": {
            "required_test_metrics": sorted(REQUIRED_TEST_METRICS),
            "required_temporal_metrics": sorted(REQUIRED_TEMPORAL_METRICS),
            "required_doc_themes": sorted(REQUIRED_DOC_THEMES),
            "expected_tag": expected_tag,
            "latest_tag": latest_tag,
        },
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
