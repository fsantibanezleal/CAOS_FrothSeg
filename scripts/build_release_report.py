"""Build the auditable release inventory from already-computed evidence."""

from __future__ import annotations

import argparse
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
    "mean_ap75",
    "mean_pq",
    "mean_sq",
    "mean_rq",
    "mean_boundary_precision",
    "mean_boundary_recall",
    "mean_boundary_fscore",
    "mean_bsd_wasserstein",
    "mean_count_absolute_error",
    "mean_count_relative_error",
    "mean_d10_relative_error",
    "mean_d32_relative_error",
    "mean_d50_relative_error",
    "mean_d90_relative_error",
    "mean_inference_ms",
    "p95_inference_ms",
    "robustness_by_condition",
    "micro",
    "cases",
}

REQUIRED_CASE_METRICS = {
    "sample_id",
    "condition_id",
    "group_id",
    "ap",
    "ap50",
    "ap75",
    "nGt",
    "nPred",
    "pq",
    "sq",
    "rq",
    "tp",
    "fp",
    "fn",
    "merges",
    "splits",
    "boundary_precision",
    "boundary_recall",
    "boundary_fscore",
    "boundary_tolerance_px",
    "diameter_unit",
    "count_absolute_error",
    "d10_relative_error",
    "d32_relative_error",
    "d50_relative_error",
    "d90_relative_error",
    "bsd_wasserstein",
    "count_relative_error",
}

REQUIRED_COMPUTE_FIELDS = {
    "hardware_lane",
    "device",
    "mean_inference_ms",
    "peak_memory_mib",
    "peak_memory_metric",
    "model_artifact_bytes",
    "model_artifact_committed",
    "training_duration_seconds",
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
    "security",
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
    if benchmark.get("schema") != "frothseg.method-benchmark/v2":
        errors = ["unified benchmark schema must be frothseg.method-benchmark/v2"]
    else:
        errors = []
    coverage = benchmark.get("coverage", {})
    if coverage.get("complete") is not True:
        errors.append("unified benchmark method-case coverage is incomplete")
    if int(coverage.get("expected_cells", 0)) != 960:
        errors.append("unified benchmark does not require all 960 held-out cells")
    if int(coverage.get("observed_cells", 0)) != 960:
        errors.append("unified benchmark does not contain all 960 held-out cells")
    if int(coverage.get("condition_count", 0)) != 16:
        errors.append("unified benchmark does not cover all 16 held-out conditions")
    benchmark_rows = {row["slug"]: row for row in benchmark["methods"]}
    evidence = []
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
        cases = test.get("cases", [])
        if len(cases) != 64:
            errors.append(f"{method.id}: benchmark exposes {len(cases)} held-out cells, expected 64")
        case_ids = [case.get("sample_id") for case in cases]
        if len(case_ids) != len(set(case_ids)):
            errors.append(f"{method.id}: duplicate held-out sample ids")
        for index, case in enumerate(cases):
            missing_case_metrics = sorted(REQUIRED_CASE_METRICS - case.keys())
            if missing_case_metrics:
                errors.append(
                    f"{method.id}: held-out cell {index} lacks "
                    + ", ".join(missing_case_metrics)
                )
                break
        micro = test.get("micro", {})
        for key in ("nGt", "nPred", "tp", "fp", "fn", "instance_precision", "instance_recall"):
            if micro.get(key) is None:
                errors.append(f"{method.id}: missing micro aggregate {key}")
        compute = row.get("compute") or {}
        missing_compute = sorted(REQUIRED_COMPUTE_FIELDS - compute.keys())
        if missing_compute:
            errors.append(f"{method.id}: missing compute evidence: {', '.join(missing_compute)}")
        elif (
            compute.get("hardware_lane") not in {"cpu", "gpu"}
            or float(compute.get("mean_inference_ms", 0)) <= 0
            or float(compute.get("peak_memory_mib", 0)) <= 0
            or int(compute.get("model_artifact_bytes", -1)) < 0
        ):
            errors.append(f"{method.id}: invalid compute evidence")
        if method.learned and (
            int(compute.get("model_artifact_bytes", 0)) <= 0
            or not compute.get("model_artifact_sha256")
        ):
            errors.append(f"{method.id}: learned model lacks sized, hashed inference artifact")
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
            "test_cell_count": len(cases),
            "test_micro": micro,
            "compute": compute,
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
        sources_by_id = {
            source["source_id"]: source
            for source in source_registry.get("sources", [])
        }
        real_manifest_path = ROOT / "data/derived/real-dataset-manifest.json"
        if real_manifest_path.exists():
            real_manifest = _load("data/derived/real-dataset-manifest.json")
            source = sources_by_id.get(real_manifest.get("source_id"))
            review = real_manifest.get("annotation_review", {})
            if real_manifest.get("schema") != "frothseg.real-dataset/v1":
                errors.append("real held-out manifest schema mismatch")
            elif source is None or not str(source.get("kind", "")).startswith("real"):
                errors.append("real held-out manifest source is absent from the registry")
            elif source.get("license") != real_manifest.get("license"):
                errors.append("real held-out manifest license does not match the source registry")
            elif review.get("state") != "accepted" or not review.get("reviewer"):
                errors.append("real held-out annotations lack accepted independent review")
            elif int(real_manifest.get("sample_count", 0)) <= 0:
                errors.append("real held-out manifest contains no samples")
            elif int(real_manifest.get("scoreable_sample_count", 0)) <= 0:
                errors.append("real held-out manifest contains no scoreable samples")
            elif int(real_manifest.get("splits", {}).get("test", 0)) <= 0:
                errors.append("real held-out manifest contains no untouched test samples")
            else:
                accepted_real_sources.append({
                    **source,
                    "sample_count": real_manifest["sample_count"],
                    "calibrated_sample_count": real_manifest.get(
                        "calibrated_sample_count", 0
                    ),
                    "manifest": "data/derived/real-dataset-manifest.json",
                    "sha256": _sha(real_manifest_path),
                })
        if not accepted_real_sources and not any(
            error.startswith("real held-out") for error in errors
        ):
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
        ("verification/classical-live-parity.json", "classical live parity evidence"),
        ("verification/visual-qa/manifest.json", "full visual QA manifest"),
        ("VERSION", "root version file"),
    ):
        if not (ROOT / relative).exists():
            errors.append(f"missing {label}: {relative}")

    parity_path = ROOT / "verification/classical-live-parity.json"
    parity_evidence = None
    if parity_path.exists():
        parity = _load("verification/classical-live-parity.json")
        accepted_methods = set(parity.get("accepted_methods", []))
        expected_live_methods = {"otsu_cc", "watershed_hmax", "watershed_dt"}
        if parity.get("schema") != "frothseg.classical-live-parity/v1":
            errors.append("classical live parity schema mismatch")
        if parity.get("complete") is not True:
            errors.append("classical live twins have not passed parity")
        if accepted_methods != expected_live_methods:
            errors.append("classical live parity does not accept exactly C1/C3/C4")
        if any(int(row.get("n_conditions", 0)) != 16 for row in parity.get("methods", [])):
            errors.append("classical live parity does not cover all 16 conditions")
        parity_evidence = {
            "path": "verification/classical-live-parity.json",
            "sha256": _sha(parity_path),
            "accepted_methods": sorted(accepted_methods),
            "selection": parity.get("selection"),
            "acceptance": parity.get("acceptance"),
        }

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
            "real_evidence": [
                {
                    "source_id": source["source_id"],
                    "manifest": source["manifest"],
                    "sha256": source["sha256"],
                    "sample_count": source["sample_count"],
                    "calibrated_sample_count": source["calibrated_sample_count"],
                }
                for source in accepted_real_sources
            ],
        },
        "method_benchmark": {
            "path": "data/derived/method-benchmark.json",
            "sha256": _sha(benchmark_path),
            "method_count": benchmark["method_count"],
            "implemented_count": benchmark["implemented_count"],
            "leader": benchmark["current_bar"]["leader"],
            "beyond_sota_claim": benchmark["current_bar"]["beyond_sota_claim"],
            "coverage": benchmark["coverage"],
        },
        "methods": evidence,
        "temporal_evidence": temporal,
        "classical_live_parity": parity_evidence,
        "release_contract": {
            "required_test_metrics": sorted(REQUIRED_TEST_METRICS),
            "required_temporal_metrics": sorted(REQUIRED_TEMPORAL_METRICS),
            "required_doc_themes": sorted(REQUIRED_DOC_THEMES),
            "expected_tag": expected_tag,
            "latest_tag": latest_tag,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "data/derived/release-report.json",
    )
    args = parser.parse_args()
    report = build()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(report, indent=2))
    print(json.dumps({
        "complete": report["complete"],
        "errors": report["errors"],
        "methods": len(report["methods"]),
    }, indent=2))
    return 0 if report["complete"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
