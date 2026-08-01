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


# How a published ms/image was arrived at. This used to be invisible: a number derived by
# dividing a whole run's wall-clock by the image count was written into the same
# `mean_inference_ms` field as a per-image measurement, and nothing downstream could tell them
# apart. That is how L6 came to publish 300.91 ms/image from a 19.258 s run that INCLUDED ITS
# TRAINING, and L7 972.42 ms from a 62.235 s run that included loading the SAM2.1 checkpoint.
# Both were labelled inference. Every route now names itself and says whether it is a real
# per-image measurement, so a derived figure can never again pass as a measured one.
TIMING_SOURCES = {
    "repeated-per-image": (True, "median over repeated passes per image"),
    "per-image-single-pass": (True, "one timed call per image, single pass"),
    "run-duration-divided": (False, "whole-run wall-clock divided by image count"),
    "test-duration-divided": (False, "test-pass wall-clock divided by image count"),
}


def _runtime(
    evaluation: dict, run: dict | None, canonical: dict | None
) -> tuple[float, float | None, str]:
    if evaluation.get("mean_inference_ms") is not None:
        source = (
            "repeated-per-image"
            if evaluation.get("repeats") or evaluation.get("timing_method")
            else "per-image-single-pass"
        )
        return float(evaluation["mean_inference_ms"]), evaluation.get("p95_inference_ms"), source
    timed_cases = [
        float(row["inference_ms"])
        for row in evaluation.get("cases", [])
        if row.get("inference_ms") is not None
    ]
    if timed_cases:
        return (
            float(np.mean(timed_cases)),
            float(np.percentile(timed_cases, 95)),
            "per-image-single-pass",
        )
    canonical_times = [
        float(row["inference_ms"])
        for row in (canonical or {}).get("cases", [])
        if row.get("inference_ms") is not None
    ]
    if canonical_times:
        return (
            float(np.mean(canonical_times)),
            float(np.percentile(canonical_times, 95)),
            "per-image-single-pass",
        )
    if run and run.get("test_duration_seconds") is not None and evaluation.get("n"):
        return (
            1000.0 * float(run["test_duration_seconds"]) / int(evaluation["n"]),
            None,
            "test-duration-divided",
        )
    if run and run.get("duration_seconds") is not None:
        evaluated = int(evaluation.get("n", 0)) + int((canonical or {}).get("n_cases", 0))
        if evaluated:
            return (
                1000.0 * float(run["duration_seconds"]) / evaluated,
                None,
                "run-duration-divided",
            )
    raise ValueError("no inference timing evidence")


def _compute(method_slug: str, evaluation: dict, run: dict | None, canonical: dict | None) -> dict:
    mean_ms, p95_ms, timing_source = _runtime(evaluation, run, canonical)
    measured, description = TIMING_SOURCES[timing_source]
    timing = {
        "timing_source": timing_source,
        "timing_is_measured_inference": measured,
        "timing_description": description,
        "timing_repeats": evaluation.get("repeats"),
        "timing_stable": evaluation.get("stable"),
        "timing_inter_repeat_cv": evaluation.get("inter_repeat_cv"),
    }
    if run is None:
        peak = evaluation.get("peak_traced_memory_mib")
        return {
            "hardware_lane": "cpu",
            "device": evaluation.get("device", "CPU"),
            "mean_inference_ms": mean_ms,
            "p95_inference_ms": p95_ms,
            **timing,
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
        **timing,
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
                "see verification/n1-preregistered-ablation.json for the limits. The "
                "real-domain transfer test (data/derived/real-adjacent-benchmark.json), re-run "
                "on 2026-08-01 after the C3 and C7 adoption, shows this ranking is substantially "
                "generator-specific: on real photographs of dense touching instances N1 falls "
                "from 0.519 to 0.125 while Cellpose-SAM rises from 0.510 to 0.709. All six in-repo "
                "trained models degrade (mean -0.243, unchanged by the adoption, which moved only "
                "classical rows) and five of the seven classical methods "
                "improve, at a tier mean of +0.070. Two do not, and both are named rather than "
                "averaged away: C2 gradient immersion watershed was already at 0.017 on froth and "
                "scores exactly 0.000 on all 64 real samples, and C3 falls from 0.220 to 0.128. "
                "C3's adopted negated-intensity flooding surface is a FROTH mechanism, since it "
                "assumes a bright specular highlight per bubble and a dark Plateau border between "
                "bubbles, and cell nuclei have neither; on this domain the distance transform it "
                "replaced was the better surface. That is recorded, not repaired: the change was "
                "adopted on the froth source and confirmed on a froth reserve slice "
                "(verification/phase1-adoption.json), and this split supports no froth statement. "
                "C7's constrained watershed transfers in the other direction, 0.233 to 0.301, and "
                "is now the best classical here after C1. That test is adjacent-domain "
                "and favours Cellpose-SAM's pretraining domain, so it does not show Cellpose-SAM "
                "is better on froth; it shows N1's froth lead does not survive domain shift."
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
