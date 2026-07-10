"""LIVE lane entrypoint (Pyodide-safe, numpy-only): turn an instance-label map into the bubble-size distribution.

The product's live SEGMENTATION runs in JS (onnxruntime-web + WebGPU SAM-class model) or via the classical
methods; whichever produced the masks, this reduces a per-pixel int label map to the BSD summary the dashboard
reads. It is pure numpy so it is Pyodide-safe and matches the gate's live-wheel set, and it is the SAME BSD
computation science/froth_gen.bsd() uses on the ground truth, so live and baked numbers are comparable.
"""
from __future__ import annotations

import numpy as np


def bsd_from_labels(labels: list[int] | np.ndarray, height: int, width: int) -> dict:
    """Flattened (row-major) int label map + shape -> BSD summary (count, d10/d50/d90, d32, pctSmall).

    d_eq = 2*sqrt(area/pi) per instance from its pixel area; matches froth_gen.bsd so live == baked.
    """
    lab = np.asarray(labels, dtype=np.int64).reshape(height, width)
    ids = np.unique(lab[lab > 0])
    if ids.size == 0:
        return {"count": 0, "d10": None, "d50": None, "d90": None, "d32": None, "pctSmall": None}
    counts = np.bincount(lab.ravel())[ids]
    d = np.sort(2.0 * np.sqrt(counts / np.pi))
    d50 = float(np.percentile(d, 50))
    return {
        "count": int(d.size),
        "d10": round(float(np.percentile(d, 10)), 2),
        "d50": round(d50, 2),
        "d90": round(float(np.percentile(d, 90)), 2),
        "d32": round(float((d ** 3).sum() / (d ** 2).sum()), 2),
        "pctSmall": round(float(np.mean(d < d50 / 2)), 3),
    }
