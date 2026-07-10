"""Score the live SAM-class segmenter's offline dumps (verification/sam/<case>.json, produced by
frontend/scripts/verify_sam.ts) against the EXACT synthetic ground truth, using the SAME validated metrics the
classical floor is scored with (fslab.science.segment.mask_ap + bsd_wasserstein). Prints a SAM-vs-floor table so
the product's core is measured, not asserted.

    PYTHONPATH=data-pipeline .venv-pipeline/Scripts/python.exe scripts/score_sam.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.science.froth_gen import CASES  # noqa: E402
from fslab.science.segment import bsd_wasserstein, mask_ap  # noqa: E402

SAM_DIR = ROOT / "verification" / "sam"
BENCH = ROOT / "data" / "derived" / "synth"


def _gt_labels(case_id: str) -> np.ndarray:
    from fslab.science.froth_gen import generate
    spec = next(c for c in CASES if c.name == case_id)
    return np.asarray(generate(spec)["labels"], dtype=np.int32)


def _floor_best(case_id: str) -> tuple[str, float | None]:
    bpath = BENCH / case_id / "benchmark.json"
    if not bpath.exists():
        return ("-", None)
    methods = json.loads(bpath.read_text(encoding="utf-8"))["methods"]
    scored = [m for m in methods if m.get("ap") is not None]
    if not scored:
        return ("-", None)
    best = max(scored, key=lambda m: m["ap"])
    return (best["method"], best["ap"])


def main() -> int:
    if not SAM_DIR.exists():
        print(f"no SAM dumps at {SAM_DIR} (run frontend/scripts/verify_sam.ts first)")
        return 1
    dumps = sorted(SAM_DIR.glob("*.json"))
    if not dumps:
        print(f"no *.json dumps in {SAM_DIR}")
        return 1
    print(f"{'case':16} {'SAM AP':>7} {'SAM AP50':>8} {'floor AP':>8} {'floor':>14} "
          f"{'SAM n':>6} {'GT n':>5} {'SAM d32':>8} {'GT d32':>7} {'BSD-W':>7}")
    print("-" * 96)
    sam_aps, floor_aps = [], []
    for d in dumps:
        j = json.loads(d.read_text(encoding="utf-8"))
        cid = j["case_id"]
        h, w = j["height"], j["width"]
        pred = np.asarray(j["labels"], dtype=np.int32).reshape(h, w)
        gt = _gt_labels(cid)
        ap = mask_ap(pred, gt)
        bw = bsd_wasserstein(pred, gt)
        fmethod, fap = _floor_best(cid)
        gt_ids = int(len({int(i) for i in gt.ravel() if i > 0}))
        gt_d = 2.0 * np.sqrt(np.bincount(gt.ravel())[1:][np.unique(gt[gt > 0]) - 1] / np.pi) if gt_ids else np.array([])
        gt_d32 = round(float((gt_d ** 3).sum() / (gt_d ** 2).sum()), 2) if gt_d.size else None
        sam_ap = ap["ap"] if ap["ap"] is not None else float("nan")
        if ap["ap"] is not None:
            sam_aps.append(ap["ap"])
        if fap is not None:
            floor_aps.append(fap)
        print(f"{cid:16} {sam_ap:7.3f} {(ap['ap50'] or 0):8.3f} {(fap or 0):8.3f} {fmethod:>14} "
              f"{j['nInstances']:6d} {gt_ids:5d} {str(j['bsd']['d32']):>8} {str(gt_d32):>7} {str(bw):>7}")
    print("-" * 96)
    if sam_aps and floor_aps:
        print(f"mean SAM AP = {np.mean(sam_aps):.3f}   mean floor AP = {np.mean(floor_aps):.3f}   "
              f"delta = {np.mean(sam_aps) - np.mean(floor_aps):+.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
