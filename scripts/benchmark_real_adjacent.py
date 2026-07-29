"""Run the method ladder over the real adjacent-domain held-out split.

This answers one question the synthetic benchmark cannot: does any of the 15-method comparison
survive contact with real photographs, or is it an artefact of one generator's statistics?

It deliberately does NOT answer whether any method is accurate on froth. The samples are cell
nuclei. Every output of this script carries `domain: adjacent` and the release gate refuses to
let it clear the froth requirement.

The protocol matches the froth held-out lane so the two are readable side by side: the same
methods, the same metrics, the same per-sample scoring, and a comparable sample count. Nothing
is retrained or recalibrated for this data. That is the point. Post-processing thresholds fitted
on synthetic froth are applied unchanged, so the numbers measure transfer, not fit, and a method
that collapses here is telling us its calibration was generator-specific.

    python scripts/benchmark_real_adjacent.py --raw-root E:/_Temp/bbbc038/extracted
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.model_registry import METHODS  # noqa: E402
from fslab.science.segment import full_instance_metrics  # noqa: E402

MANIFEST = ROOT / "data/derived/real-adjacent-dataset-manifest.json"
#: L7 is prompted with first-frame truth and has no unprompted single-image lane.
EXCLUDED = {"L7"}


def _load_sample(raw_root: Path, sample_id: str) -> tuple[np.ndarray, np.ndarray]:
    from PIL import Image

    sample_dir = raw_root / sample_id
    image_files = sorted((sample_dir / "images").glob("*.png"))
    with Image.open(image_files[0]) as handle:
        image = np.asarray(handle.convert("L"), dtype=np.float32) / 255.0
    labels = np.zeros(image.shape, dtype=np.int32)
    for index, mask_path in enumerate(sorted((sample_dir / "masks").glob("*.png")), start=1):
        with Image.open(mask_path) as handle:
            labels[np.asarray(handle.convert("L")) > 127] = index
    return image, labels


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-root", type=Path, required=True)
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "data/derived/real-adjacent-benchmark.json",
    )
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--methods", default="")
    args = parser.parse_args()

    from fslab.temporal_bake import frame_predictor

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    samples = manifest["test_samples"]
    raw_root = args.raw_root.resolve()

    selected = (
        [m.strip() for m in args.methods.split(",") if m.strip()]
        if args.methods
        else [method.id for method in METHODS if method.id not in EXCLUDED]
    )

    loaded = [(row["sample_id"], *_load_sample(raw_root, row["sample_id"])) for row in samples]
    print(f"loaded {len(loaded)} real held-out samples")

    rows = []
    for method_id in selected:
        method = next(entry for entry in METHODS if entry.id == method_id)
        started = time.perf_counter()
        try:
            predict, _ = frame_predictor(method_id, device=args.device)
        except Exception as error:  # noqa: BLE001
            print(f"[{method_id}] predictor unavailable: {error}")
            continue
        per_sample = []
        for sample_id, image, truth in loaded:
            try:
                labels = predict(image)
            except Exception as error:  # noqa: BLE001
                # A method that cannot run on a real image is a result, not a gap to hide.
                per_sample.append({"sample_id": sample_id, "ap": None, "error": str(error)[:200]})
                continue
            metrics = full_instance_metrics(labels, truth)
            per_sample.append({"sample_id": sample_id, **{
                key: metrics[key] for key in ("ap", "ap50", "pq", "nGt", "nPred")
                if key in metrics
            }})
        scored = [row for row in per_sample if row.get("ap") is not None]
        duration = time.perf_counter() - started
        summary = {
            "id": method.id,
            "slug": method.slug,
            "name": method.name,
            "tier": method.tier,
            "n_scored": len(scored),
            "n_failed": len(per_sample) - len(scored),
            "mean_ap": float(np.mean([r["ap"] for r in scored])) if scored else None,
            "mean_ap50": float(np.mean([r["ap50"] for r in scored])) if scored else None,
            "mean_pq": (
                float(np.mean([r["pq"] for r in scored if r.get("pq") is not None]))
                if scored else None
            ),
            "seconds": round(duration, 1),
            "samples": per_sample,
        }
        rows.append(summary)
        print(
            f"[{method.id}] {method.slug:26} "
            f"AP {summary['mean_ap']:.4f}  PQ {summary['mean_pq']:.4f}  "
            f"({summary['n_scored']}/{len(per_sample)} scored, {duration:.0f}s)"
            if summary["mean_ap"] is not None
            else f"[{method.id}] {method.slug:26} no scored samples"
        )

    ranked = sorted(
        (row for row in rows if row["mean_ap"] is not None),
        key=lambda row: -row["mean_ap"],
    )
    report = {
        "schema": "frothseg.real-adjacent-benchmark/v1",
        "domain": "adjacent",
        "source_id": manifest["source_id"],
        "license": manifest["license"],
        "dataset_manifest": "data/derived/real-adjacent-dataset-manifest.json",
        "split": "test",
        "n_samples": len(samples),
        "device": args.device,
        "protocol": (
            "Synthetic-fitted post-processing applied unchanged. Nothing was retrained or "
            "recalibrated for this data, so the numbers measure transfer rather than fit."
        ),
        "scope": (
            "Real dense-instance microscopy, NOT froth. This measures whether the ladder "
            "generalises off the in-repo generator. It supports no statement about "
            "flotation accuracy."
        ),
        "methods": rows,
        "ranking": [
            {"id": row["id"], "mean_ap": row["mean_ap"], "mean_pq": row["mean_pq"]}
            for row in ranked
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(report, indent=2) + "\n")

    print()
    print(json.dumps({
        "evaluated": len(rows),
        "top5": report["ranking"][:5],
        "output": str(args.output.relative_to(ROOT)).replace("\\", "/"),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
