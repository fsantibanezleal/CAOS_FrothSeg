"""The offline pipeline orchestrator + CLI (ADR-0057). For each froth case: generate the synthetic scene (image +
EXACT instance GT), run the classical-floor benchmark against that GT, and export the committed artifacts +
manifest (CONTRACT 2). Writes a flat index.json inventorying every case.

    python -m fslab.pipeline                 # all cases
    python -m fslab.pipeline poly-normal     # one case
    python -m fslab.pipeline --check         # re-verify committed artifacts vs a fresh run (CONTRACT-2 check)
"""
from __future__ import annotations

import argparse
import time
from pathlib import Path

from . import registry
from .core.manifest import build_index
from .io.formats import write_json
from .stages import benchmark, export, generate

# data-pipeline/fslab/pipeline.py -> parents[2] = repo root (works under `pip install -e .` too)
REPO_ROOT = Path(__file__).resolve().parents[2]
DERIVED = REPO_ROOT / "data" / "derived"
MANIFESTS = DERIVED / "manifests"

STAGES = ("generate", "benchmark", "export")


def precompute(case_id: str, seed: int = 42) -> dict:
    case = registry.get_case(case_id)
    t0 = time.perf_counter()
    scene = generate.run(case)
    scores = benchmark.run(scene)
    run_ms = (time.perf_counter() - t0) * 1000.0
    return export.run(case=case, scene=scene, benchmark=scores, seed=seed, run_ms=run_ms,
                      derived_dir=str(DERIVED), manifests_dir=str(MANIFESTS))


def run_all(seed: int = 42) -> list[dict]:
    entries = []
    for c in registry.list_cases():
        precompute(c.id, seed=seed)
        entries.append({"case_id": c.id, "category": c.category, "manifest_path": f"manifests/{c.id}.json"})
    write_json(MANIFESTS / "index.json", build_index(entries))
    return entries


def check() -> int:
    """CONTRACT-2 consistency check: regenerate each case and confirm the committed sha256s still match. Returns
    the number of MISMATCHED cases (0 = clean). Used in CI so a code change that silently alters an artifact fails.
    """
    import hashlib
    from .io.froth_io import encode_png_bytes, masks_to_coco_rle

    mismatches = 0
    for c in registry.list_cases():
        mpath = MANIFESTS / f"{c.id}.json"
        if not mpath.exists():
            print(f"  MISSING manifest: {c.id}")
            mismatches += 1
            continue
        import json
        man = json.loads(mpath.read_text(encoding="utf-8"))
        scene = generate.run(c)
        png_sha = hashlib.sha256(encode_png_bytes(scene.image)).hexdigest()
        if png_sha != man["artifacts"]["frame"]["sha256"]:
            print(f"  DRIFT frame.png: {c.id}")
            mismatches += 1
        n_now = len(masks_to_coco_rle(scene.labels))
        if n_now != man["artifacts"]["masks"]["n_instances"]:
            print(f"  DRIFT masks n_instances: {c.id} ({n_now} != {man['artifacts']['masks']['n_instances']})")
            mismatches += 1
    return mismatches


def main() -> None:
    ap = argparse.ArgumentParser(prog="fslab.pipeline")
    ap.add_argument("case", nargs="?", default="all", help="a case id, or 'all'")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--check", action="store_true", help="verify committed artifacts vs a fresh run, then exit")
    args = ap.parse_args()
    if args.check:
        n = check()
        print("CONTRACT-2 check: clean" if n == 0 else f"CONTRACT-2 check: {n} MISMATCH(es)")
        raise SystemExit(1 if n else 0)
    if args.case == "all":
        entries = run_all(args.seed)
        print(f"precomputed {len(entries)} froth cases -> {DERIVED / 'synth'}")
        for e in entries:
            print(f"  {e['case_id']:18s} [{e['category']}]")
        print(f"index -> {MANIFESTS / 'index.json'}")
    else:
        m = precompute(args.case, args.seed)
        best = next((b for b in m["benchmark"] if b["ap"] is not None), None)
        headline = f"floor AP={best['ap']} ({best['method']})" if best else "no bubbles"
        print(f"precomputed {args.case}: lane={m['lane']} bubbles={m['bsd']['count']} {headline} "
              f"-> {DERIVED / 'synth' / args.case}")


if __name__ == "__main__":
    main()
