"""Typed objects passed between pipeline stages, the inter-stage contract. Plain dataclasses (Pyodide-safe).

Domain: flotation-froth bubble segmentation. A SCENE is one froth image (synthetic here, with EXACT per-bubble
ground truth, so segmenters can be scored with real mask metrics; the product runs on REAL uploaded froth). A
FLOORSCORE is one classical baseline method's benchmark result on a scene (mask AP + BSD Wasserstein).
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass(frozen=True)
class FrothScene:
    """One froth image + its EXACT instance ground truth (generate stage output). Arrays are not committed; the
    export stage encodes them into PNG + COCO-RLE + CSV artifacts (CONTRACT 2)."""
    case_id: str
    image: np.ndarray            # (H,W) float32 in [0,1], the froth frame
    labels: np.ndarray           # (H,W) int32 instance map, 0 = background/Plateau border
    bsd: dict                    # bubble-size distribution ground truth (count, d10/d50/d90, d32, pctSmall)
    sites: np.ndarray            # (N,3) generator sites (cx,cy,r); [] for real/uploaded scenes


@dataclass(frozen=True)
class FloorScore:
    """One classical baseline method's benchmark on a scene: instance mask AP + BSD fidelity."""
    method: str
    ap: float | None             # mean mask AP@[.5:.95]
    ap50: float | None
    ap75: float | None
    bsd_w: float | None          # Wasserstein-1 between predicted and GT diameter distributions (0 = perfect)
    n_pred: int                  # predicted instance count
    n_gt: int                    # ground-truth instance count


@dataclass(frozen=True)
class ImageStats:
    """Descriptive stats a froth frame is judged by in CONTRACT 1 (the bring-your-own-froth gate)."""
    h: int
    w: int
    channels: int
    dtype: str
    dyn_range: float             # p99 - p01 of intensity in [0,1] (contrast); low => flat/unusable
    sat_frac: float              # fraction of near-saturated (>0.97) pixels (glare proxy)
    dark_frac: float             # fraction of near-black (<0.03) pixels
    flags: tuple[str, ...] = field(default_factory=tuple)
