"""C6 rebuild-or-demote evaluation: maskSLIC and SLICO against the shipped SLIC + RAG merge.

Pre-registration (fixed before any arm was run, PLAN-PROPOSAL.md section 6, row "C6 rebuild or
demotion"):

Question
    C6 ``slic_merge`` costs 536.0 ms/image for mean AP 0.0186 on the 64-image test split
    (data/derived/classical-heldout.json). Do either of the two variants the pinned
    ``skimage.segmentation.slic`` docstring cites itself, maskSLIC (``mask=``, reference [3],
    Irving 2016, arXiv:1606.09518) and SLICO (``slic_zero=True``, reference [2], EPFL IVRL),
    lift that materially at no extra cost?

Arms (all other parameters held at the shipped values n_segments=400, compactness=8, sigma=1,
and the identical RAG mean-color cut at thresh=0.08 plus disconnected-label splitting)
    A0  baseline    shipped slic_merge, re-run here so the comparison is internal
    A1  maskSLIC    slic(..., mask=_foreground(gray))
    A2  SLICO       slic(..., slic_zero=True)
    A3  both        slic(..., mask=_foreground(gray), slic_zero=True)

Split
    The untouched 64-image test split of data/cache/learned-v2-192.npz, the same surface the
    committed C6 number was measured on (archive verified byte-identical to the committed one in
    verification/phase2-working-cache-regeneration.json). Validation is reported alongside as a
    secondary, descriptive read. This is a classical, non-learned, no-selection experiment, in
    the same class as PLAN-PROPOSAL.md section 3, which records its sweeps "over the 64-image
    test split"; no model is selected on the result and no training budget is spent.

Decision rule, fixed before running
    KEEP-AND-REBUILD only if the best variant reaches test mean AP >= 0.0652 at a mean cost no
    higher than the shipped 536.0 ms/image. 0.0652 is C1 otsu_cc's AP on the same split at
    3.4 ms/image: below it the row's three orders of magnitude of extra compute buy nothing the
    cheapest method on the bench does not already deliver.
    Secondary descriptive marker, not a decision threshold: 0.0372, twice the shipped AP.
    Anything short of the bar is a NULL and the output is a DEMOTION recommendation carrying
    this measurement, not a silent retention of the row.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
import time
from pathlib import Path

import numpy as np
from skimage import graph, segmentation

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.learning.data_cache import load_cache, select_split  # noqa: E402
from fslab.science.segment import (  # noqa: E402
    _foreground,
    _split_disconnected_labels,
    full_instance_metrics,
    slic_merge,
    summarize_metric_rows,
)

BASELINE_AP = 0.0186
BASELINE_MS = 536.0
BAR_AP = 0.0652
SECONDARY_MARKER_AP = 0.0372


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _variant(gray: np.ndarray, *, use_mask: bool, slic_zero: bool) -> np.ndarray:
    """slic_merge with the two docstring-cited slic variants switched on or off."""
    rgb = np.dstack([gray] * 3)
    fg = _foreground(gray)
    sp = segmentation.slic(
        rgb, n_segments=400, compactness=8, sigma=1,
        channel_axis=-1, start_label=1,
        mask=fg if use_mask else None,
        slic_zero=slic_zero,
    )
    rag = graph.rag_mean_color(rgb, sp, mode="distance")
    merged = graph.cut_threshold(sp, rag, thresh=0.08, in_place=False).astype(np.int32)
    merged[~fg] = 0
    return _split_disconnected_labels(merged)


ARMS = {
    "A0-baseline": lambda gray: slic_merge(gray),
    "A1-maskSLIC": lambda gray: _variant(gray, use_mask=True, slic_zero=False),
    "A2-SLICO": lambda gray: _variant(gray, use_mask=False, slic_zero=True),
    "A3-maskSLIC+SLICO": lambda gray: _variant(gray, use_mask=True, slic_zero=True),
}


def evaluate(cache: dict, split: str) -> list[dict]:
    subset = select_split(cache, split)
    reports = []
    for arm_name, engine in ARMS.items():
        rows = []
        for index, image in enumerate(subset["images"]):
            started = time.perf_counter()
            labels = engine(image.astype(np.float32) / 255.0)
            inference_ms = (time.perf_counter() - started) * 1000
            rows.append({
                "sample_id": str(subset["sample_ids"][index]),
                "condition_id": str(subset["conditions"][index]),
                "group_id": str(subset["group_ids"][index]),
                **full_instance_metrics(labels, subset["labels"][index]),
                "inference_ms": round(inference_ms, 3),
            })
        report = summarize_metric_rows(rows, split=split)
        report.update({
            "arm": arm_name,
            "split": split,
            "n_images": len(rows),
            "mean_inference_ms": round(float(np.mean([r["inference_ms"] for r in rows])), 3),
            "p95_inference_ms": round(float(np.quantile([r["inference_ms"] for r in rows], 0.95)), 3),
        })
        reports.append(report)
        print(
            f"{split} {arm_name}: AP={report['mean_ap']:.4f} "
            f"AP50={report['mean_ap50']:.4f} bF={report['mean_boundary_fscore']:.4f} "
            f"ms={report['mean_inference_ms']:.1f}",
            flush=True,
        )
    return reports


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=ROOT / "data/cache/learned-v2-192.npz")
    parser.add_argument("--output", type=Path, default=ROOT / "verification/c6-rebuild-or-demote.json")
    args = parser.parse_args()

    cache = load_cache(args.cache)
    test_reports = evaluate(cache, "test")
    validation_reports = evaluate(cache, "validation")

    best = max(test_reports, key=lambda r: r["mean_ap"])
    passes_bar = best["mean_ap"] >= BAR_AP and best["mean_inference_ms"] <= BASELINE_MS

    document = {
        "check": "c6-rebuild-or-demote",
        "schema": "frothseg.c6-rebuild/v1",
        "preregistration": "scripts/evaluate_c6_rebuild.py module docstring; "
                           "CAOS_MANAGE plans/frothseg/research-2026-07-31/PLAN-PROPOSAL.md section 6",
        "cache": str(args.cache.relative_to(ROOT)).replace("\\", "/"),
        "cache_identity_evidence": "verification/phase2-working-cache-regeneration.json",
        "shipped_baseline": {
            "source": "data/derived/classical-heldout.json",
            "method": "slic_merge",
            "mean_ap": BASELINE_AP,
            "mean_inference_ms": BASELINE_MS,
        },
        "bar": {
            "test_mean_ap_at_least": BAR_AP,
            "bar_source": "data/derived/classical-heldout.json otsu_cc mean_ap on the same split",
            "mean_inference_ms_at_most": BASELINE_MS,
            "secondary_descriptive_marker_ap": SECONDARY_MARKER_AP,
        },
        "device": platform.processor() or platform.machine(),
        "segment_py_sha256": _sha256(ROOT / "data-pipeline/fslab/science/segment.py"),
        "test": test_reports,
        "validation": validation_reports,
        "best_test_arm": best["arm"],
        "best_test_mean_ap": best["mean_ap"],
        "best_test_mean_inference_ms": best["mean_inference_ms"],
        "passes_bar": bool(passes_bar),
        "verdict": "rebuild" if passes_bar else "null-demote",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, indent=2), encoding="utf-8")
    print(f"verdict={document['verdict']} best={best['arm']} ap={best['mean_ap']:.4f}")


if __name__ == "__main__":
    main()
