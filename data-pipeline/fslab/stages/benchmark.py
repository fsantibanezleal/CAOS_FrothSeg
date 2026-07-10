"""Stage: benchmark — run every classical FLOOR method on a scene and score it against the EXACT ground truth.

Scores = per-image instance mask AP@[.5:.95] (greedy IoU matching) + the BSD Wasserstein-1 distance between the
predicted and true bubble-diameter distributions. These are the honest baselines the live SAM-class product must
beat. The methods (DT-watershed, highlight-seeded watershed, SLIC+merge) live in science/segment.py; the offline
SAM2/Mask-R-CNN teacher is added as a later benchmark row (plan step 2), not fabricated here.
"""
from __future__ import annotations

from ..io.schema import FloorScore, FrothScene
from ..science.segment import METHODS, bsd_wasserstein, mask_ap


def run(scene: FrothScene) -> list[FloorScore]:
    scores: list[FloorScore] = []
    for name, fn in METHODS.items():
        pred = fn(scene.image)
        ap = mask_ap(pred, scene.labels)
        bw = bsd_wasserstein(pred, scene.labels)
        scores.append(FloorScore(
            method=name, ap=ap["ap"], ap50=ap["ap50"], ap75=ap["ap75"],
            bsd_w=bw, n_pred=ap["nPred"], n_gt=ap["nGt"],
        ))
    return scores
