"""Offline pipeline orchestrator and CLI.

The canonical bake is an explicit release operation. Tests and CI smoke runs must
write to a caller-provided sandbox and must never overwrite ``data/derived``.

    python -m fslab.pipeline all
    python -m fslab.pipeline poly-normal
    python -m fslab.pipeline showcase
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
from .showcase import TEMPORAL_CASE_IDS, TEMPORAL_FRAMES, bake as bake_showcase_artifacts
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


def bake_showcase(
    *,
    input_root: str | Path | None = None,
    output_root: str | Path | None = None,
) -> dict:
    """Bake all 15 method previews after classical and learned inference."""
    inputs = Path(input_root).resolve() if input_root is not None else DERIVED
    outputs = PipelinePaths.from_root(output_root).root / "showcase"
    return bake_showcase_artifacts(inputs, outputs)


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
    showcase_path = DERIVED / "showcase" / "manifest.json"
    if not showcase_path.is_file():
        print("  MISSING showcase/manifest.json")
        mismatches += 1
    else:
        import json

        showcase = json.loads(showcase_path.read_text(encoding="utf-8"))
        expected_artifacts = len(registry.list_cases()) * len(registry_document()["methods"])
        expected_pairs = {
            (method["id"], case.id)
            for method in registry_document()["methods"]
            for case in registry.list_cases()
        }
        artifacts = showcase.get("artifacts", [])
        observed_pairs = {
            (artifact.get("method_id"), artifact.get("case_id"))
            for artifact in artifacts
        }
        if (
            not showcase.get("complete")
            or showcase.get("method_count") != len(registry_document()["methods"])
            or showcase.get("case_count") != len(registry.list_cases())
            or showcase.get("artifact_count") != expected_artifacts
            or len(artifacts) != expected_artifacts
            or observed_pairs != expected_pairs
        ):
            print("  DRIFT showcase coverage")
            mismatches += 1
        expected_showcase_paths: set[str] = set()
        for artifact in artifacts:
            for name in ("labels", "preview", "analysis"):
                relative_path = artifact.get(f"{name}_path")
                expected_sha256 = artifact.get(f"{name}_sha256")
                path = DERIVED / relative_path if isinstance(relative_path, str) else None
                if path is None or not path.is_file():
                    print(f"  MISSING showcase {name}: {relative_path}")
                    mismatches += 1
                elif hashlib.sha256(path.read_bytes()).hexdigest() != expected_sha256:
                    print(f"  DRIFT showcase {name}: {relative_path}")
                    mismatches += 1
                if (
                    name != "labels"
                    or artifact.get("labels_scope") == "showcase"
                ) and isinstance(relative_path, str):
                    expected_showcase_paths.add(relative_path)
        temporal_summary = showcase.get("temporal", {})
        temporal_relative = temporal_summary.get("manifest_path")
        temporal_path = DERIVED / temporal_relative if isinstance(temporal_relative, str) else None
        if temporal_path is None or not temporal_path.is_file():
            print(f"  MISSING temporal showcase manifest: {temporal_relative}")
            mismatches += 1
        elif hashlib.sha256(temporal_path.read_bytes()).hexdigest() != temporal_summary.get(
            "manifest_sha256"
        ):
            print(f"  DRIFT temporal showcase manifest: {temporal_relative}")
            mismatches += 1
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
                or {sequence.get("case_id") for sequence in sequences}
                != set(TEMPORAL_CASE_IDS)
            ):
                print("  DRIFT temporal showcase coverage")
                mismatches += 1
            for sequence in sequences:
                frames = sequence.get("frames", [])
                if len(frames) != TEMPORAL_FRAMES:
                    print(f"  DRIFT temporal frame count: {sequence.get('case_id')}")
                    mismatches += 1
                for frame in frames:
                    for name in ("source", "truth", "overlay"):
                        relative_path = frame.get(f"{name}_path")
                        expected_sha256 = frame.get(f"{name}_sha256")
                        path = DERIVED / relative_path if isinstance(relative_path, str) else None
                        if path is None or not path.is_file():
                            print(f"  MISSING temporal showcase {name}: {relative_path}")
                            mismatches += 1
                        elif hashlib.sha256(path.read_bytes()).hexdigest() != expected_sha256:
                            print(f"  DRIFT temporal showcase {name}: {relative_path}")
                            mismatches += 1
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
            print(
                "  DRIFT showcase file inventory: "
                f"missing={missing} extra={extra}"
            )
            mismatches += 1
        if (
            showcase.get("file_count") != len(actual_showcase_paths) + 1
            or showcase.get("hashed_file_count") != len(expected_showcase_paths)
        ):
            print("  DRIFT showcase file counts")
            mismatches += 1
    return mismatches


def main() -> None:
    ap = argparse.ArgumentParser(prog="fslab.pipeline")
    ap.add_argument("case", nargs="?", default="all", help="a case id, or 'all'")
    ap.add_argument(
        "--input",
        type=Path,
        help="derived artifact input root for the showcase stage",
    )
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
    if args.case == "showcase":
        manifest = bake_showcase(input_root=args.input, output_root=args.output)
        print(
            f"baked {manifest['artifact_count']} showcase artifacts "
            f"({manifest['method_count']} methods x {manifest['case_count']} cases)"
        )
    elif args.case == "all":
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
