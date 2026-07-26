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
from fslab.showcase import TEMPORAL_CASE_IDS, TEMPORAL_FRAMES  # noqa: E402


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
        expected_pairs = {
            (method.id, case_id)
            for method in METHODS
            for case_id in expected_case_ids
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
            or showcase.get("case_count") != 13
            or showcase.get("artifact_count") != 195
            or len(showcase.get("cases", [])) != 13
            or len(set(showcase.get("cases", []))) != 13
            or set(showcase.get("methods", [])) != expected_ids
            or set(showcase.get("cases", [])) != expected_case_ids
            or len(artifacts) != 195
            or observed_pairs != expected_pairs
        ):
            errors.append("showcase does not cover all 15 methods x 13 canonical cases")
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
            if (
                temporal.get("schema") != "frothseg.temporal-showcase/v1"
                or temporal.get("source_kind") != "deterministic_generated"
                or temporal.get("label_kind") != "ground_truth"
                or temporal.get("prediction_method") is not None
                or temporal.get("sequence_count") != len(TEMPORAL_CASE_IDS)
                or temporal.get("frames_per_sequence") != TEMPORAL_FRAMES
                or temporal.get("artifact_count")
                != len(TEMPORAL_CASE_IDS) * TEMPORAL_FRAMES * 3
                or temporal.get("complete") is not True
                or len(sequences) != len(TEMPORAL_CASE_IDS)
                or {sequence.get("case_id") for sequence in sequences}
                != set(TEMPORAL_CASE_IDS)
            ):
                errors.append("temporal showcase does not cover five canonical 8-frame sequences")
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
            if len(test.get("cases", [])) != 64 or not test.get("micro"):
                errors.append(f"{row.get('id')}: lacks per-cell or micro held-out evidence")
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
