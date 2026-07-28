"""Validate product-depth evidence without confusing plans with implementations."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.model_registry import METHODS, validate_registry  # noqa: E402
from fslab.registry import list_cases  # noqa: E402
from fslab.showcase import (  # noqa: E402
    PRIMARY_EXCLUDED_CASE_IDS,
    TEMPORAL_CASE_IDS,
    TEMPORAL_FRAMES,
    TEMPORAL_PREDICTION_SOURCES,
    verify_temporal_prediction,
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_development() -> list[str]:
    errors = validate_registry()
    required = {
        "data-pipeline/fslab/datasets.py",
        "data-pipeline/fslab/pipeline.py",
        "data-pipeline/fslab/showcase.py",
        "scripts/check_artifacts.py",
        "scripts/fetch_roboflow_froth.py",
        "scripts/import_real_coco.py",
        "scripts/validate_classical_live_parity.py",
        "tests/test_dataset_splits.py",
        "docs/README.md",
        "docs/security/security.md",
        "verification/classical-live-parity.json",
        "verification/workbench-contract.json",
        "verification/visual-qa/manifest.json",
    }
    for rel in required:
        if not (ROOT / rel).exists():
            errors.append(f"missing required product file: {rel}")

    showcase_path = ROOT / "data/derived/showcase/manifest.json"
    if not showcase_path.exists():
        errors.append("missing data/derived/showcase/manifest.json")
    else:
        showcase = json.loads(showcase_path.read_text(encoding="utf-8"))
        expected_ids = {method.id for method in METHODS}
        expected_case_ids = {case.id for case in list_cases()}
        primary_case_ids = expected_case_ids - set(PRIMARY_EXCLUDED_CASE_IDS)
        expected_pairs = {
            (method.id, case_id)
            for method in METHODS
            for case_id in primary_case_ids
        }
        artifacts = showcase.get("artifacts", [])
        observed_pairs = {
            (artifact.get("method_id"), artifact.get("case_id"))
            for artifact in artifacts
        }
        if (
            showcase.get("schema") != "frothseg.showcase/v1"
            or showcase.get("complete") is not True
            or showcase.get("method_count") != 15
            or showcase.get("case_count") != len(primary_case_ids)
            or showcase.get("benchmark_case_count") != len(expected_case_ids)
            or showcase.get("excluded_primary_cases")
            != list(PRIMARY_EXCLUDED_CASE_IDS)
            or showcase.get("artifact_count") != len(expected_pairs)
            or len(showcase.get("cases", [])) != len(primary_case_ids)
            or len(set(showcase.get("cases", []))) != len(primary_case_ids)
            or set(showcase.get("methods", [])) != expected_ids
            or set(showcase.get("cases", [])) != primary_case_ids
            or len(artifacts) != len(expected_pairs)
            or observed_pairs != expected_pairs
        ):
            errors.append(
                "showcase does not cover all 15 methods x 12 primary cases "
                "while retaining 13 benchmark cases"
            )
        expected_showcase_paths: set[str] = set()
        for artifact in artifacts:
            for name in ("labels", "preview", "analysis"):
                relative_path = artifact.get(f"{name}_path")
                path = (
                    ROOT / "data/derived" / relative_path
                    if isinstance(relative_path, str) and relative_path
                    else None
                )
                if (
                    path is None
                    or not path.is_file()
                    or _sha256(path) != artifact.get(f"{name}_sha256")
                ):
                    errors.append(
                        f"missing or stale showcase {name}: "
                        f"{artifact.get('method_id')}/{artifact.get('case_id')}"
                    )
                if (
                    name != "labels"
                    or artifact.get("labels_scope") == "showcase"
                ) and isinstance(relative_path, str):
                    expected_showcase_paths.add(relative_path)
        temporal_summary = showcase.get("temporal", {})
        temporal_relative = temporal_summary.get("manifest_path")
        temporal_path = (
            ROOT / "data/derived" / temporal_relative
            if isinstance(temporal_relative, str) and temporal_relative
            else None
        )
        if (
            temporal_path is None
            or not temporal_path.is_file()
            or _sha256(temporal_path) != temporal_summary.get("manifest_sha256")
        ):
            errors.append("missing or stale temporal showcase manifest")
        else:
            expected_showcase_paths.add(temporal_relative)
            temporal = json.loads(temporal_path.read_text(encoding="utf-8"))
            sequences = temporal.get("sequences", [])
            expected_prediction_pairs = {
                (method_id, case_id)
                for method_id, config in TEMPORAL_PREDICTION_SOURCES.items()
                for case_id in config["required_cases"]
            }
            observed_prediction_pairs = {
                (prediction.get("method_id"), sequence.get("case_id"))
                for sequence in sequences
                for prediction in sequence.get("predictions", [])
            }
            availability = {
                row.get("method_id"): row
                for row in temporal.get("method_availability", [])
            }
            if (
                temporal.get("schema") != "frothseg.temporal-showcase/v2"
                or temporal.get("source_kind") != "deterministic_generated"
                or temporal.get("label_kind") != "ground_truth"
                or temporal.get("sequence_count") != len(TEMPORAL_CASE_IDS)
                or temporal.get("frames_per_sequence") != TEMPORAL_FRAMES
                # 3 base artifacts per frame, 1 label file per prediction frame, 1 event log
                # per (method, sequence) pair.
                or temporal.get("artifact_count")
                != (
                    len(TEMPORAL_CASE_IDS) * TEMPORAL_FRAMES * 3
                    + len(expected_prediction_pairs) * TEMPORAL_FRAMES
                    + len(expected_prediction_pairs)
                )
                or temporal.get("prediction_method_count")
                != len(TEMPORAL_PREDICTION_SOURCES)
                or temporal.get("prediction_sequence_count")
                != len(expected_prediction_pairs)
                or temporal.get("prediction_frame_count")
                != len(expected_prediction_pairs) * TEMPORAL_FRAMES
                or temporal.get("complete") is not True
                or len(sequences) != len(TEMPORAL_CASE_IDS)
                or {sequence.get("case_id") for sequence in sequences}
                != set(TEMPORAL_CASE_IDS)
                or observed_prediction_pairs != expected_prediction_pairs
                or set(availability) != expected_ids
            ):
                errors.append(
                    "temporal showcase lacks complete truth or the full method x sequence matrix"
                )
            for method_id in expected_ids:
                row = availability.get(method_id, {})
                expected_sequences = sorted(
                    TEMPORAL_PREDICTION_SOURCES.get(method_id, {}).get(
                        "required_cases",
                        (),
                    )
                )
                if expected_sequences:
                    valid = (
                        row.get("status") == "available"
                        and row.get("available_sequence_ids") == expected_sequences
                        and row.get("identity_contract") != "none"
                    )
                else:
                    valid = (
                        row.get("status") == "not_precomputed"
                        and row.get("available_sequence_ids") == []
                        and row.get("identity_contract") == "none"
                        and bool(row.get("reason"))
                    )
                if not valid:
                    errors.append(
                        f"invalid temporal availability contract: {method_id}"
                    )
            for sequence in sequences:
                frames = sequence.get("frames", [])
                if (
                    len(frames) != TEMPORAL_FRAMES
                    or {frame.get("frame_index") for frame in frames}
                    != set(range(TEMPORAL_FRAMES))
                ):
                    errors.append(
                        f"temporal showcase has incomplete frames: {sequence.get('case_id')}"
                    )
                for frame in frames:
                    for name in ("source", "truth", "overlay"):
                        relative_path = frame.get(f"{name}_path")
                        path = (
                            ROOT / "data/derived" / relative_path
                            if isinstance(relative_path, str) and relative_path
                            else None
                        )
                        if (
                            path is None
                            or not path.is_file()
                            or _sha256(path) != frame.get(f"{name}_sha256")
                        ):
                            errors.append(
                                f"missing or stale temporal showcase {name}: "
                                f"{sequence.get('case_id')}/{frame.get('frame_index')}"
                            )
                        if isinstance(relative_path, str):
                            expected_showcase_paths.add(relative_path)
                for prediction in sequence.get("predictions", []):
                    row_errors, row_paths = verify_temporal_prediction(
                        prediction,
                        case_id=str(sequence.get("case_id")),
                        derived_root=ROOT / "data/derived",
                    )
                    errors.extend(row_errors)
                    expected_showcase_paths |= row_paths
        actual_showcase_paths = {
            path.relative_to(ROOT / "data/derived").as_posix()
            for path in showcase_path.parent.rglob("*")
            if path.is_file() and path != showcase_path
        }
        if actual_showcase_paths != expected_showcase_paths:
            missing = sorted(expected_showcase_paths - actual_showcase_paths)
            extra = sorted(actual_showcase_paths - expected_showcase_paths)
            errors.append(
                f"showcase file inventory mismatch: missing={missing} extra={extra}"
            )
        if (
            showcase.get("file_count") != len(actual_showcase_paths) + 1
            or showcase.get("hashed_file_count") != len(expected_showcase_paths)
        ):
            errors.append("showcase file counts do not match its hashed inventory")

    benchmark_path = ROOT / "data/derived/method-benchmark.json"
    if not benchmark_path.exists():
        errors.append("missing data/derived/method-benchmark.json")
    else:
        benchmark = json.loads(benchmark_path.read_text(encoding="utf-8"))
        coverage = benchmark.get("coverage", {})
        if benchmark.get("schema") != "frothseg.method-benchmark/v2":
            errors.append("unified benchmark schema is not v2")
        if benchmark.get("implemented_count") != len(METHODS):
            errors.append("unified benchmark does not implement the complete registry")
        if benchmark.get("missing_count") != 0:
            errors.append("unified benchmark reports missing methods")
        if (
            coverage.get("complete") is not True
            or coverage.get("expected_cells") != 960
            or coverage.get("observed_cells") != 960
            or coverage.get("condition_count") != 16
        ):
            errors.append("unified benchmark lacks complete 15 x 64 held-out coverage")
        for row in benchmark.get("methods", []):
            test = row.get("test") or {}
            compute = row.get("compute") or {}
            canonical_cases = row.get("canonical_cases", [])
            empty_control = next(
                (
                    case
                    for case in canonical_cases
                    if case.get("case_id") == "empty-control"
                ),
                None,
            )
            if len(test.get("cases", [])) != 64 or not test.get("micro"):
                errors.append(f"{row.get('id')}: lacks per-cell or micro held-out evidence")
            if (
                len(canonical_cases) != 13
                or empty_control is None
                or empty_control.get("n_gt", empty_control.get("nGt")) != 0
            ):
                errors.append(
                    f"{row.get('id')}: empty-control evidence was removed from benchmark"
                )
            if (
                float(compute.get("mean_inference_ms", 0)) <= 0
                or float(compute.get("peak_memory_mib", 0)) <= 0
                or int(compute.get("model_artifact_bytes", -1)) < 0
            ):
                errors.append(f"{row.get('id')}: lacks valid compute evidence")

    parity_path = ROOT / "verification/classical-live-parity.json"
    if parity_path.exists():
        parity = json.loads(parity_path.read_text(encoding="utf-8"))
        if parity.get("complete") is not True or set(
            parity.get("accepted_methods", [])
        ) != {"otsu_cc", "watershed_hmax", "watershed_dt"}:
            errors.append("classical browser parity does not accept exactly C1/C3/C4")
        if any(
            int(row.get("n_conditions", 0)) != 16
            for row in parity.get("methods", [])
        ):
            errors.append("classical browser parity lacks all 16 conditions")
        for implementation in parity.get("implementations", {}).values():
            path = ROOT / implementation.get("path", "")
            if not path.is_file() or _sha256(path) != implementation.get("sha256"):
                errors.append(
                    f"classical browser parity is stale for "
                    f"{implementation.get('path', '<missing path>')}"
                )

    workbench_path = ROOT / "verification/workbench-contract.json"
    if workbench_path.is_file():
        workbench = json.loads(workbench_path.read_text(encoding="utf-8"))
        required_views = {
            "segmentation",
            "boundary-error",
            "size-distribution",
            "morphometry",
            "confidence-calibration",
            "froth-state",
            "temporal",
            "provenance",
            "export",
            "method-comparison",
        }
        if (
            workbench.get("canonical_case_count") != 12
            or workbench.get("benchmark_case_count") != 13
            or workbench.get("precomputed_method_count") != 15
            or workbench.get("precomputed_method_case_artifacts") != 180
            or workbench.get("view_count") != len(required_views)
            or set(workbench.get("views", [])) != required_views
            or set(workbench.get("canonical_precomputed_methods", []))
            != expected_ids
            or workbench.get("temporal_prediction_methods") != ["L1", "L7"]
            or workbench.get("temporal_prediction_sequences") != 6
            or workbench.get("temporal_prediction_frames") != 48
        ):
            errors.append("workbench contract has empty or stale enabled UI data")

    visual_path = ROOT / "verification/visual-qa/manifest.json"
    if visual_path.is_file():
        visual = json.loads(visual_path.read_text(encoding="utf-8"))
        panels = visual.get("app_panels", {})
        interactions = visual.get("interaction_checks", {})
        if (
            panels.get("all_rendered") is not True
            or panels.get("canonical_cases") != 12
            or panels.get("benchmark_cases") != 13
            or panels.get("precomputed_methods") != 15
            or panels.get("method_case_artifacts") != 180
            or panels.get("temporal_prediction_methods") != 2
            or panels.get("temporal_prediction_sequences") != 6
            or panels.get("temporal_prediction_frames") != 48
            or panels.get("error_boundaries") != 0
            or interactions.get("temporal_predictions") != "passed"
            or visual.get("browser_console_errors") != 0
            or visual.get("result") != "passed"
        ):
            errors.append("visual QA manifest has stale counts or unverified UI data")
    return errors


def check_release() -> list[str]:
    errors = check_development()
    for method in METHODS:
        if method.state != "accepted":
            errors.append(f"{method.id}/{method.slug}: state={method.state}, expected accepted")
            continue
        if not (ROOT / method.docs_path).exists():
            errors.append(f"{method.id}: missing docs {method.docs_path}")
    report_path = ROOT / "data" / "derived" / "release-report.json"
    if not report_path.exists():
        errors.append("missing data/derived/release-report.json")
    else:
        report = json.loads(report_path.read_text(encoding="utf-8"))
        if report.get("schema") != "frothseg.release/v2":
            errors.append("release report schema mismatch")
        if report.get("complete") is not True:
            errors.append("release report is not complete")
        if len(report.get("methods", [])) != len(METHODS):
            errors.append("release report does not cover the complete registry")
    benchmark_path = ROOT / "data" / "derived" / "method-benchmark.json"
    if not benchmark_path.exists():
        errors.append("missing data/derived/method-benchmark.json")
    else:
        benchmark = json.loads(benchmark_path.read_text(encoding="utf-8"))
        if benchmark.get("implemented_count") != len(METHODS):
            errors.append("unified benchmark has missing method implementations")
        if benchmark.get("missing_count") != 0:
            errors.append("unified benchmark reports missing methods")
    for rel in (
        "data/derived/temporal/unet-watershed-v2.json",
        "data/derived/temporal/sam2-1-hiera-tiny.json",
    ):
        if not (ROOT / rel).exists():
            errors.append(f"missing temporal evidence: {rel}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("development", "release"), default="development")
    args = parser.parse_args()
    errors = check_release() if args.profile == "release" else check_development()
    if errors:
        print(f"PRODUCT COMPLETENESS {args.profile.upper()}: FAIL")
        for error in errors:
            print(f"  - {error}")
        return 1
    print(f"PRODUCT COMPLETENESS {args.profile.upper()}: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
