"""Build the complete 15-method held-out benchmark and compute inventory."""

from __future__ import annotations

import argparse
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
    slug: ROOT / f"data/derived/learned/{model}/benchmark.json"
    for slug, model in {
        "unet_watershed": "unet-watershed-v2",
        "deep_marker_watershed": "deep-marker-watershed-v1",
        "gc_fsegnet": "gc-fsegnet-v1",
        "stardist_2d": "stardist-froth-v1",
        "cellpose_sam": "cellpose-sam-cpsam-v2",
        "yolo_froth_seg": "yolo-froth-seg-v1",
        "sam2_1": "sam2-1-hiera-tiny",
        "lamellastar": "lamellastar-v1",
    }.items()
}

SUMMARY_KEYS = (
    "split",
    "n",
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
    "mean_brier",
    "mean_ece",
    "mean_inference_ms",
    "p95_inference_ms",
    "robustness_by_condition",
)

CASE_KEYS = (
    "sample_id",
    "case_id",
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
    "count_relative_error",
    "d10_relative_error",
    "d32_relative_error",
    "d50_relative_error",
    "d90_relative_error",
    "bsd_wasserstein",
    "brier",
    "ece",
    "inference_ms",
)


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


def _case_id(row: dict) -> str:
    value = row.get("sample_id", row.get("case_id"))
    if value is None:
        raise ValueError("held-out case lacks sample_id/case_id")
    return str(value)


def _compact_cases(evaluation: dict) -> list[dict]:
    compact = []
    for source in evaluation.get("cases", []):
        row = {key: source.get(key) for key in CASE_KEYS if key in source}
        row["sample_id"] = _case_id(source)
        row.pop("case_id", None)
        compact.append(row)
    return sorted(compact, key=lambda row: row["sample_id"])


def _micro(cases: list[dict]) -> dict:
    totals = {
        key: int(sum(int(row.get(key, 0)) for row in cases))
        for key in ("nGt", "nPred", "tp", "fp", "fn", "merges", "splits")
    }
    precision_denominator = totals["tp"] + totals["fp"]
    recall_denominator = totals["tp"] + totals["fn"]
    precision = totals["tp"] / precision_denominator if precision_denominator else 0.0
    recall = totals["tp"] / recall_denominator if recall_denominator else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "association_iou": 0.5,
        **totals,
        "instance_precision": precision,
        "instance_recall": recall,
        "instance_f1": f1,
    }


def _runtime(evaluation: dict, run: dict | None, canonical: dict | None) -> tuple[float, float | None]:
    if evaluation.get("mean_inference_ms") is not None:
        return float(evaluation["mean_inference_ms"]), evaluation.get("p95_inference_ms")
    timed_cases = [
        float(row["inference_ms"])
        for row in evaluation.get("cases", [])
        if row.get("inference_ms") is not None
    ]
    if timed_cases:
        return float(np.mean(timed_cases)), float(np.percentile(timed_cases, 95))
    if run and run.get("test_duration_seconds") is not None and evaluation.get("n"):
        return 1000.0 * float(run["test_duration_seconds"]) / int(evaluation["n"]), None
    canonical_times = [
        float(row["inference_ms"])
        for row in (canonical or {}).get("cases", [])
        if row.get("inference_ms") is not None
    ]
    if canonical_times:
        return float(np.mean(canonical_times)), float(np.percentile(canonical_times, 95))
    if run and run.get("duration_seconds") is not None:
        evaluated = int(evaluation.get("n", 0)) + int((canonical or {}).get("n_cases", 0))
        if evaluated:
            return 1000.0 * float(run["duration_seconds"]) / evaluated, None
    raise ValueError("no inference timing evidence")


def _compute(method_slug: str, evaluation: dict, run: dict | None, canonical: dict | None) -> dict:
    mean_ms, p95_ms = _runtime(evaluation, run, canonical)
    if run is None:
        peak = evaluation.get("peak_traced_memory_mib")
        return {
            "hardware_lane": "cpu",
            "device": evaluation.get("device", "CPU"),
            "mean_inference_ms": mean_ms,
            "p95_inference_ms": p95_ms,
            "peak_memory_mib": peak,
            "peak_memory_metric": evaluation.get("peak_memory_metric"),
            "model_artifact_bytes": 0,
            "model_artifact_sha256": None,
            "model_artifact_committed": True,
            "training_duration_seconds": 0.0,
        }
    environment = run.get("environment", {})
    device = str(environment.get("device", "unknown"))
    peak = environment.get("peak_allocated_mib", environment.get("peak_traced_memory_mib"))
    peak_metric = (
        "cuda-peak-allocated"
        if environment.get("peak_allocated_mib") is not None
        else environment.get("peak_memory_metric")
    )
    artifact = (
        run.get("inference_weights")
        or run.get("model")
        or run.get("pretrained_model")
        or {}
    )
    training = run.get("fine_tuning", {})
    training_duration = (
        training.get("duration_seconds")
        if training.get("state") == "completed"
        else run.get("duration_seconds")
    )
    return {
        "hardware_lane": "gpu" if environment.get("cuda_runtime") else "cpu",
        "device": device,
        "mean_inference_ms": mean_ms,
        "p95_inference_ms": p95_ms,
        "peak_memory_mib": peak,
        "peak_memory_metric": peak_metric,
        "model_artifact_bytes": artifact.get("bytes"),
        "model_artifact_sha256": artifact.get("sha256"),
        "model_artifact_committed": artifact.get("committed", True),
        "training_duration_seconds": training_duration,
        "run_manifest": str(MODEL_RUNS[method_slug].relative_to(ROOT)).replace("\\", "/"),
    }


def build() -> dict:
    dataset = _load(ROOT / "manifests/learned-dataset-v2.json")
    if dataset is None:
        raise FileNotFoundError("manifests/learned-dataset-v2.json")
    expected_sample_ids = sorted(
        row["sample_id"] for row in dataset["samples"] if row["split"] == "test"
    )
    classical = _classical_canonical()
    classical_document = _load(ROOT / "data/derived/classical-heldout.json")
    classical_heldout = {
        row["method"]: row for row in (classical_document or {}).get("methods", [])
    }
    rows = []
    coverage_errors = []
    observed_cells = 0
    for method in METHODS:
        run = _load(MODEL_RUNS[method.slug]) if method.slug in MODEL_RUNS else None
        canonical = (
            _load(CANONICAL_RUNS[method.slug])
            if method.slug in CANONICAL_RUNS
            else classical.get(method.slug)
        )
        evaluation = run.get("evaluation") if run else classical_heldout.get(method.slug)
        executable = canonical is not None and evaluation is not None and (
            not method.learned or run is not None
        )
        score = evaluation.get("mean_ap") if evaluation else None
        test = None
        compute = None
        if evaluation:
            cases = _compact_cases(evaluation)
            observed_cells += len(cases)
            case_ids = [row["sample_id"] for row in cases]
            if case_ids != expected_sample_ids:
                coverage_errors.append(f"{method.id}: held-out sample matrix mismatch")
            compute = _compute(method.slug, evaluation, run, canonical)
            test = {
                key: evaluation.get(key)
                for key in SUMMARY_KEYS
                if key in evaluation
            }
            test["mean_inference_ms"] = compute["mean_inference_ms"]
            test["p95_inference_ms"] = compute["p95_inference_ms"]
            test["micro"] = _micro(cases)
            test["cases"] = cases
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
            "test": test,
            "compute": compute,
            "canonical": {
                key: canonical.get(key)
                for key in ("split", "n_cases", "n", "mean_ap", "mean_ap50", "mean_pq")
                if key in canonical
            } if canonical else None,
            "canonical_cases": canonical.get("cases", []) if canonical else [],
            "docs_path": method.docs_path,
        })
    implemented = [row for row in rows if row["state"] == "implemented"]
    scored = [row for row in implemented if row["test"] is not None]
    leader = max(scored, key=lambda row: row["test"]["mean_ap"]) if scored else None
    expected_cells = len(METHODS) * len(expected_sample_ids)
    if observed_cells != expected_cells:
        coverage_errors.append(
            f"observed {observed_cells} method-case cells, expected {expected_cells}"
        )
    return {
        "schema": "frothseg.method-benchmark/v2",
        "dataset_schema": dataset["schema"],
        "canonical_case_count": 13,
        "method_count": len(rows),
        "implemented_count": len(implemented),
        "missing_count": len(rows) - len(implemented),
        "coverage": {
            "expected_methods": len(METHODS),
            "expected_test_samples": len(expected_sample_ids),
            "expected_cells": expected_cells,
            "observed_cells": observed_cells,
            "condition_count": len({
                row["condition_id"]
                for method in rows
                for row in (method["test"] or {}).get("cases", [])
            }),
            "complete": not coverage_errors,
            "errors": coverage_errors,
        },
        "aggregation": {
            "macro": "unweighted mean across held-out samples",
            "micro": "global TP/FP/FN at IoU 0.5 across held-out samples",
            "failures_dropped": False,
        },
        "current_bar": {
            "metric": "test mean mask AP@[.5:.95]",
            "threshold": 0.30,
            "leader": {
                "id": leader["id"],
                "slug": leader["slug"],
                "mean_ap": leader["test"]["mean_ap"],
            } if leader else None,
            # Stays False even now that N1 leads this table. The two are different claims:
            # leading a synthetic in-repo benchmark against a Cellpose-SAM checkpoint given a
            # two-pass fine-tuning budget is a leaderboard result. A beyond-SOTA claim would
            # need real licensed froth data, a properly tuned baseline, and more than one
            # ensemble draw (the study-v3 margin is smaller than the seed spread it measured).
            "beyond_sota_claim": False,
            "leader_note": (
                "Leads this controlled synthetic benchmark. Not a state-of-the-art claim; "
                "see verification/n1-preregistered-ablation.json for the limits."
            ),
        },
        "methods": rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "data/derived/method-benchmark.json",
    )
    args = parser.parse_args()
    document = build()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(document, indent=2))
    print(json.dumps({
        key: document[key]
        for key in (
            "method_count",
            "implemented_count",
            "missing_count",
            "coverage",
            "current_bar",
        )
    }, indent=2))


if __name__ == "__main__":
    main()
