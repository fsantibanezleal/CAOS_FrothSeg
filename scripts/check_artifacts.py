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
    if not registry_path.exists():
        errs.append("missing method-registry.json")
    else:
        method_registry = json.loads(registry_path.read_text(encoding="utf-8"))
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
    if errs:
        print("CONTRACT 2 DRIFT:")
        for e in errs:
            print("  -", e)
        return 1
    print(f"CONTRACT 2 OK: {len(index.get('cases', []))} cases, manifests <-> artifacts consistent (sha256-checked).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
