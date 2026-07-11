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
