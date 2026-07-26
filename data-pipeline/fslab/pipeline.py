"""Offline pipeline orchestrator and CLI.

The canonical bake is an explicit release operation. Tests and CI smoke runs must
write to a caller-provided sandbox and must never overwrite ``data/derived``.

    python -m fslab.pipeline all
    python -m fslab.pipeline poly-normal
    python -m fslab.pipeline all --output build/precompute-smoke
    python -m fslab.pipeline --check
"""
from __future__ import annotations

import argparse
import time
from dataclasses import dataclass
from pathlib import Path

from . import registry
from .core.manifest import build_index
from .io.formats import write_json
from .model_registry import registry_document
from .stages import benchmark, export, generate

# data-pipeline/fslab/pipeline.py -> parents[2] = repo root (works under `pip install -e .` too)
REPO_ROOT = Path(__file__).resolve().parents[2]
DERIVED = REPO_ROOT / "data" / "derived"
MANIFESTS = DERIVED / "manifests"

STAGES = (
    "generate",
    "preprocess",
    "feature_extraction",
    "train",
    "infer",
    "evaluate",
    "export",
)


@dataclass(frozen=True)
class PipelinePaths:
    """Resolved output locations for one pipeline invocation."""

    root: Path
    manifests: Path

    @classmethod
    def from_root(cls, root: str | Path | None = None) -> "PipelinePaths":
        resolved = Path(root).resolve() if root is not None else DERIVED
        return cls(root=resolved, manifests=resolved / "manifests")


def precompute(case_id: str, *, output_root: str | Path | None = None) -> dict:
    # The synthetic frame is a PURE function of the case's fixed FrothSpec.seed (there is no run-level seed knob):
    # the manifest records that generation seed, so a re-run is byte-identical and CONTRACT-2 --check is stable.
    case = registry.get_case(case_id)
    t0 = time.perf_counter()
    scene = generate.run(case)
    scores = benchmark.run(scene)
    run_ms = (time.perf_counter() - t0) * 1000.0
    paths = PipelinePaths.from_root(output_root)
    return export.run(
        case=case,
        scene=scene,
        benchmark=scores,
        seed=case.spec.seed,
        run_ms=run_ms,
        derived_dir=str(paths.root),
        manifests_dir=str(paths.manifests),
    )


def run_all(*, output_root: str | Path | None = None) -> list[dict]:
    paths = PipelinePaths.from_root(output_root)
    entries = []
    for c in registry.list_cases():
        precompute(c.id, output_root=paths.root)
        entries.append({"case_id": c.id, "category": c.category, "manifest_path": f"manifests/{c.id}.json"})
    write_json(paths.manifests / "index.json", build_index(entries))
    write_json(paths.root / "method-registry.json", registry_document())
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
    ap.add_argument("--check", action="store_true", help="verify committed artifacts vs a fresh run, then exit")
    ap.add_argument(
        "--output",
        type=Path,
        help="sandbox output root; omit only for an intentional canonical release bake",
    )
    args = ap.parse_args()
    if args.check:
        n = check()
        print("CONTRACT-2 check: clean" if n == 0 else f"CONTRACT-2 check: {n} MISMATCH(es)")
        raise SystemExit(1 if n else 0)
    if args.case == "all":
        entries = run_all(output_root=args.output)
        paths = PipelinePaths.from_root(args.output)
        print(f"precomputed {len(entries)} froth cases -> {paths.root / 'synth'}")
        for e in entries:
            print(f"  {e['case_id']:18s} [{e['category']}]")
        print(f"index -> {paths.manifests / 'index.json'}")
    else:
        m = precompute(args.case, output_root=args.output)
        paths = PipelinePaths.from_root(args.output)
        best = next((b for b in m["benchmark"] if b["ap"] is not None), None)
        headline = f"floor AP={best['ap']} ({best['method']})" if best else "no bubbles"
        print(f"precomputed {args.case}: lane={m['lane']} bubbles={m['bsd']['count']} {headline} "
              f"-> {paths.root / 'synth' / args.case}")


if __name__ == "__main__":
    main()
