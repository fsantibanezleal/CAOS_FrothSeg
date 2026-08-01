"""Measure inference cost for every method, once, under one protocol.

Why this exists. `mean_inference_ms` is one of the two axes of the published Pareto frontier and
until 2026-08-01 it was assembled from whatever each method's own bake happened to leave behind.
Three different things were being written into one field:

  * classical methods: one `perf_counter` per image on a single un-repeated pass, so whatever else
    the machine was doing entered the number. Across committed bakes of identical code on identical
    inputs the same method moved by up to x2.74.
  * L1, L2, L3, L4, N1: per-case timings from inside an evaluation loop, also a single pass.
  * L5, L6, L7: no per-image timing at all. `scripts/build_method_benchmark.py` divided a run's
    wall-clock by the image count. For L6 that run included ITS OWN TRAINING (19.258 s over 64
    images, published as 300.91 ms/image of inference). For L7 it included loading the SAM2.1
    checkpoint (62.235 s over 64 images, published as 972.42 ms).

A frontier computed across those three kinds of number compares methods on an axis that does not
mean the same thing from row to row. This script replaces all of it: every method is timed through
`frame_predictor`, which is the same inference path the App and `infer_file` use, in ONE process,
against ONE canary, with a warmup pass and repeated passes. Model loading happens in
`frame_predictor` and is therefore outside the timed region, which is what makes the result an
inference measurement rather than a startup measurement.

L7 is a deliberate exception and is recorded as one. It propagates from first-frame prompts and has
no unprompted single-image lane at all, so there is no per-image inference to measure here. Rather
than divide a wall-clock and call it inference, this script records L7 with a null and the benchmark
carries its cost from the prompted video protocol, labelled as what it is.

Run it on a quiet machine. It refuses to publish a result whose inter-repeat spread says otherwise.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.learning.data_cache import load_cache, select_split  # noqa: E402
from fslab.model_registry import METHODS  # noqa: E402
from fslab.science import timing  # noqa: E402

# No unprompted single-image lane. See the module docstring.
NO_SINGLE_IMAGE_LANE = {"L7"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=ROOT / "data/cache/learned-v2-192.npz")
    parser.add_argument("--split", default="test")
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--method", action="append", dest="methods")
    parser.add_argument(
        "--output", type=Path, default=ROOT / "data/derived/inference-timing.json",
    )
    args = parser.parse_args()

    from fslab.temporal_bake import frame_predictor

    split = select_split(load_cache(args.cache), args.split)
    images = [image.astype(np.float32) / 255.0 for image in split["images"]]
    print(f"timing on {len(images)} {args.split} images, {args.repeats} repeats each", flush=True)

    selected = [
        method for method in METHODS
        if not args.methods or method.id in args.methods
    ]
    rows = []
    for method in selected:
        if method.id in NO_SINGLE_IMAGE_LANE:
            rows.append({
                "id": method.id,
                "slug": method.slug,
                "measured": False,
                "reason": (
                    "propagates from first-frame prompts; no unprompted single-image lane exists, "
                    "so there is no per-image inference cost to measure under this protocol"
                ),
                "mean_inference_ms": None,
            })
            print(f"{method.id:>3} {method.slug:<26} skipped: no single-image lane", flush=True)
            continue
        try:
            predict, _ = frame_predictor(method.id, device=args.device)
        except Exception as error:  # noqa: BLE001 - recorded, not swallowed
            rows.append({
                "id": method.id,
                "slug": method.slug,
                "measured": False,
                "reason": f"predictor unavailable: {type(error).__name__}: {error}",
                "mean_inference_ms": None,
            })
            print(f"{method.id:>3} {method.slug:<26} UNAVAILABLE: {error}", flush=True)
            continue
        report = timing.time_over_items(predict, images, repeats=args.repeats)
        report.pop("per_image_ms")
        rows.append({
            "id": method.id,
            "slug": method.slug,
            "tier": method.tier,
            "lane": "gpu" if method.learned and args.device == "cuda" else "cpu",
            "measured": True,
            **report,
        })
        print(
            f"{method.id:>3} {method.slug:<26} {report['mean_inference_ms']:9.2f} ms  "
            f"p95={report['p95_inference_ms']:8.2f}  cv={report['inter_repeat_cv']:.4f}"
            f"{'' if report['stable'] else '   UNSTABLE'}",
            flush=True,
        )

    measured = [row for row in rows if row["measured"]]
    document = {
        "schema": "frothseg.inference-timing/v1",
        "protocol": {
            "path": "fslab.temporal_bake.frame_predictor, the same path infer_file and the App use",
            "split": args.split,
            "images": len(images),
            "repeats": args.repeats,
            "warmup_passes": 1,
            "statistic": "mean over images of the per-image median across repeats",
            "model_load_excluded": True,
            "device_requested": args.device,
        },
        "environment": timing.environment(),
        "all_stable": all(row["stable"] for row in measured),
        "unstable": [row["id"] for row in measured if not row["stable"]],
        "unmeasured": [row["id"] for row in rows if not row["measured"]],
        "methods": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, indent=2), encoding="utf-8")
    print(f"\nwrote {args.output}")
    if not document["all_stable"]:
        print(
            f"UNSTABLE: {document['unstable']} exceeded cv {timing.CV_UNSTABLE}. "
            "The machine moved during the run; re-run it quiet before publishing.",
            flush=True,
        )
        raise SystemExit(2)


if __name__ == "__main__":
    main()
