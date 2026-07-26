"""Validate CONTRACT 2 on disk (the pipeline -> web artifact contract): the index references every case; each
manifest exists; every artifact (frame.png / masks.json / bsd.csv / benchmark.json) exists, is non-empty, matches
the recorded byte size AND sha256; the lane matches the gate verdict; and masks.json's instance count agrees with
the manifest. Stdlib only (runs in CI WITHOUT installing the package). Exit non-zero on any drift.

Used by scripts/smoke.* and by .github/workflows/ci.yml · the mechanical guard that a product can't regress to
serving artifacts that don't match their manifests."""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DERIVED = ROOT / "data" / "derived"
MANIFESTS = DERIVED / "manifests"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


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
        expected_pairs = {
            (method_id, case_id)
            for method_id in expected_showcase_methods
            for case_id in expected_cases
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
            or set(showcase.get("cases", [])) != expected_cases
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
            if (
                temporal.get("schema") != "frothseg.temporal-showcase/v1"
                or temporal.get("sequence_count") != 5
                or temporal.get("frames_per_sequence") != 8
                or temporal.get("artifact_count") != 120
                or temporal.get("complete") is not True
                or len(sequences) != 5
            ):
                errs.append("temporal showcase coverage drift")
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
