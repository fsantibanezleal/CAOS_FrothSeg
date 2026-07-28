"""Validate CONTRACT 2 on disk (the pipeline -> web artifact contract): the index references every case; each
manifest exists; every artifact (frame.png / masks.json / bsd.csv / benchmark.json) exists, is non-empty, matches
the recorded byte size AND sha256; the lane matches the gate verdict; and masks.json's instance count agrees with
the manifest. Stdlib only (runs in CI WITHOUT installing the package). Exit non-zero on any drift.

Used by scripts/smoke.* and by .github/workflows/ci.yml · the mechanical guard that a product can't regress to
serving artifacts that don't match their manifests."""
from __future__ import annotations

import hashlib
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.model_registry import METHODS  # noqa: E402
from fslab.showcase import verify_temporal_prediction  # noqa: E402

DERIVED = ROOT / "data" / "derived"
MANIFESTS = DERIVED / "manifests"
PRIMARY_EXCLUDED_CASE_IDS = {"empty-control"}
TEMPORAL_CASE_IDS = {
    "poly-normal",
    "fine-froth",
    "glare-storm",
    "motion-fast",
    "bursting",
}
# Every registered method owes a prediction on every canonical sequence.
TEMPORAL_PREDICTION_CASES = {method.id: TEMPORAL_CASE_IDS for method in METHODS}
TEMPORAL_METRICS = {
    "frames",
    "matched_gt_instances",
    "false_positive_instances",
    "false_negative_instances",
    "id_switches",
    "id_switch_rate",
    "mean_frame_coverage",
    "id_precision",
    "id_recall",
    "idf1",
    "detection_accuracy",
    "association_accuracy",
    "hota",
    "track_fragmentations",
    "event_true_positives",
    "event_false_positives",
    "event_false_negatives",
    "event_precision",
    "event_recall",
    "event_f1",
    "flow_epe_px",
}


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _rle_has_foreground(path: Path) -> bool:
    payload = path.read_bytes()
    if len(payload) < 20 or len(payload) % 8 != 4:
        return False
    magic, version, width, height, pair_count = struct.unpack_from("<5I", payload)
    if magic != 0x46534C52 or version != 1 or width == 0 or height == 0:
        return False
    if len(payload) != 20 + pair_count * 8:
        return False
    total = 0
    foreground = False
    for value, count in struct.iter_unpack("<II", payload[20:]):
        total += count
        foreground = foreground or (value > 0 and count > 0)
    return total == width * height and foreground


def main() -> int:
    idx_path = MANIFESTS / "index.json"
    if not idx_path.exists():
        print(f"FAIL: missing {idx_path} (run scripts/precompute.sh first)")
        return 1
    index = json.loads(idx_path.read_text(encoding="utf-8"))
    errs: list[str] = []
    registry_path = DERIVED / "method-registry.json"
    expected_benchmark_methods: set[str] = set()
    expected_showcase_methods: set[str] = set()
    if not registry_path.exists():
        errs.append("missing method-registry.json")
    else:
        method_registry = json.loads(registry_path.read_text(encoding="utf-8"))
        expected_showcase_methods = {
            method["id"] for method in method_registry.get("methods", [])
        }
        expected_benchmark_methods = {
            method["slug"]
            for method in method_registry.get("methods", [])
            if method.get("tier") == "classical" and method.get("state") in {"partial", "accepted"}
        }
        if len(method_registry.get("methods", [])) < 10:
            errs.append("method registry below product-depth floor")
    for entry in index.get("cases", []):
        mp = DERIVED / entry["manifest_path"]
        if not mp.exists():
            errs.append(f"missing manifest: {mp}")
            continue
        m = json.loads(mp.read_text(encoding="utf-8"))
        for key, art in m.get("artifacts", {}).items():
            ap = DERIVED / art["path"]
            if not ap.exists():
                errs.append(f"missing {key} artifact: {ap}")
                continue
            size = ap.stat().st_size
            if size == 0:
                errs.append(f"empty {key} artifact: {ap}")
            if size != art["bytes"]:
                errs.append(f"byte drift {ap}: manifest={art['bytes']} disk={size}")
            if _sha256(ap) != art["sha256"]:
                errs.append(f"sha256 drift {ap}")
        if m.get("gate", {}).get("lane") != m.get("lane"):
            errs.append(f"lane/gate mismatch: {entry['case_id']}")
        actual_methods = {row.get("method") for row in m.get("benchmark", [])}
        if expected_benchmark_methods and actual_methods != expected_benchmark_methods:
            missing = sorted(expected_benchmark_methods - actual_methods)
            extra = sorted(actual_methods - expected_benchmark_methods)
            errs.append(
                f"benchmark method matrix incomplete: {entry['case_id']} "
                f"missing={missing} extra={extra}"
            )
        # masks instance count must agree with the encoded masks file
        masks = m.get("artifacts", {}).get("masks")
        if masks and (DERIVED / masks["path"]).exists():
            doc = json.loads((DERIVED / masks["path"]).read_text(encoding="utf-8"))
            if doc.get("n_instances") != masks.get("n_instances"):
                errs.append(f"masks n_instances drift: {entry['case_id']} "
                            f"({doc.get('n_instances')} != {masks.get('n_instances')})")

    showcase_path = DERIVED / "showcase" / "manifest.json"
    if not showcase_path.is_file():
        errs.append("missing showcase/manifest.json")
    else:
        showcase = json.loads(showcase_path.read_text(encoding="utf-8"))
        expected_cases = {entry["case_id"] for entry in index.get("cases", [])}
        primary_cases = expected_cases - PRIMARY_EXCLUDED_CASE_IDS
        expected_pairs = {
            (method_id, case_id)
            for method_id in expected_showcase_methods
            for case_id in primary_cases
        }
        artifacts = showcase.get("artifacts", [])
        observed_pairs = {
            (artifact.get("method_id"), artifact.get("case_id"))
            for artifact in artifacts
        }
        if (
            showcase.get("schema") != "frothseg.showcase/v1"
            or showcase.get("complete") is not True
            or set(showcase.get("methods", [])) != expected_showcase_methods
            or set(showcase.get("cases", [])) != primary_cases
            or showcase.get("benchmark_case_count") != len(expected_cases)
            or set(showcase.get("excluded_primary_cases", []))
            != PRIMARY_EXCLUDED_CASE_IDS
            or showcase.get("artifact_count") != len(expected_pairs)
            or len(artifacts) != len(expected_pairs)
            or observed_pairs != expected_pairs
        ):
            errs.append("showcase method/case coverage drift")

        expected_showcase_paths: set[str] = set()
        for artifact in artifacts:
            for name in ("labels", "analysis", "preview"):
                relative_path = artifact.get(f"{name}_path")
                path = DERIVED / relative_path if isinstance(relative_path, str) else None
                if path is None or not path.is_file():
                    errs.append(
                        f"missing showcase {name}: "
                        f"{artifact.get('method_id')}/{artifact.get('case_id')}"
                    )
                elif _sha256(path) != artifact.get(f"{name}_sha256"):
                    errs.append(
                        f"sha256 drift showcase {name}: "
                        f"{artifact.get('method_id')}/{artifact.get('case_id')}"
                    )
                if (
                    name != "labels"
                    or artifact.get("labels_scope") == "showcase"
                ) and isinstance(relative_path, str):
                    expected_showcase_paths.add(relative_path)

        temporal_summary = showcase.get("temporal", {})
        temporal_relative = temporal_summary.get("manifest_path")
        temporal_path = DERIVED / temporal_relative if isinstance(temporal_relative, str) else None
        if temporal_path is None or not temporal_path.is_file():
            errs.append("missing temporal showcase manifest")
        elif _sha256(temporal_path) != temporal_summary.get("manifest_sha256"):
            errs.append("sha256 drift temporal showcase manifest")
        else:
            expected_showcase_paths.add(temporal_relative)
            temporal = json.loads(temporal_path.read_text(encoding="utf-8"))
            sequences = temporal.get("sequences", [])
            expected_prediction_pairs = {
                (method_id, case_id)
                for method_id, case_ids in TEMPORAL_PREDICTION_CASES.items()
                for case_id in case_ids
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
                or temporal.get("sequence_count") != 5
                or temporal.get("frames_per_sequence") != 8
                or temporal.get("prediction_method_count") != len(METHODS)
                or temporal.get("prediction_sequence_count") != len(expected_prediction_pairs)
                or temporal.get("prediction_frame_count")
                != len(expected_prediction_pairs) * 8
                # 3 base artifacts per frame, 1 label file per prediction frame, 1 event log
                # per (method, sequence) pair.
                or temporal.get("artifact_count")
                != (
                    len(TEMPORAL_CASE_IDS) * 8 * 3
                    + len(expected_prediction_pairs) * 8
                    + len(expected_prediction_pairs)
                )
                or temporal.get("complete") is not True
                or len(sequences) != 5
                or {sequence.get("case_id") for sequence in sequences}
                != TEMPORAL_CASE_IDS
                or observed_prediction_pairs != expected_prediction_pairs
                or set(availability) != expected_showcase_methods
            ):
                errs.append("temporal showcase coverage drift")
            for method_id in expected_showcase_methods:
                row = availability.get(method_id, {})
                expected_sequence_ids = sorted(
                    TEMPORAL_PREDICTION_CASES.get(method_id, set())
                )
                if expected_sequence_ids:
                    valid = (
                        row.get("status") == "available"
                        and row.get("available_sequence_ids")
                        == expected_sequence_ids
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
                    errs.append(
                        f"temporal availability contract drift: {method_id}"
                    )
            for sequence in sequences:
                frames = sequence.get("frames", [])
                if len(frames) != 8:
                    errs.append(
                        f"temporal showcase frame-count drift: {sequence.get('case_id')}"
                    )
                for frame in frames:
                    for name in ("source", "truth", "overlay"):
                        relative_path = frame.get(f"{name}_path")
                        path = (
                            DERIVED / relative_path
                            if isinstance(relative_path, str)
                            else None
                        )
                        if path is None or not path.is_file():
                            errs.append(
                                f"missing temporal showcase {name}: "
                                f"{sequence.get('case_id')}/{frame.get('frame_index')}"
                            )
                        elif _sha256(path) != frame.get(f"{name}_sha256"):
                            errs.append(
                                f"sha256 drift temporal showcase {name}: "
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
                    errs.extend(row_errors)
                    expected_showcase_paths |= row_paths
        actual_showcase_paths = {
            path.relative_to(DERIVED).as_posix()
            for path in showcase_path.parent.rglob("*")
            if path.is_file() and path != showcase_path
        }
        if actual_showcase_paths != expected_showcase_paths:
            missing = sorted(expected_showcase_paths - actual_showcase_paths)
            extra = sorted(actual_showcase_paths - expected_showcase_paths)
            errs.append(f"showcase file inventory drift: missing={missing} extra={extra}")
        if (
            showcase.get("file_count") != len(actual_showcase_paths) + 1
            or showcase.get("hashed_file_count") != len(expected_showcase_paths)
        ):
            errs.append("showcase file-count drift")
    if errs:
        print("CONTRACT 2 DRIFT:")
        for e in errs:
            print("  -", e)
        return 1
    print(f"CONTRACT 2 OK: {len(index.get('cases', []))} cases, manifests <-> artifacts consistent (sha256-checked).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
