"""Classical froth segmentation methods (the honest cited FLOOR) + morphometry + benchmark scoring.

The PRODUCT method is a live SAM-class model in the browser (onnxruntime-web + WebGPU); these classical
methods are the baselines it must beat, implemented with the proper CV stack (scikit-image / scipy /
OpenCV), never hand-rolled. Each is tagged with its froth-vision provenance.

Methods:
  * `watershed_dt`      Otsu foreground + EXACT distance-transform markers + marker-controlled watershed
                        (Meyer). The generic floor. (skimage.segmentation.watershed)
  * `watershed_hmax`    highlight-seeded: h-maxima of the bright specular spots are the markers, the classic
                        industrial froth trick (Sweet/Aldrich line). Fails under glare, quantified.
  * `slic_merge`        SLIC superpixels + region-adjacency mean-intensity merge, texture-aware.

Morphometry uses skimage.regionprops (equivalent diameter, eccentricity, solidity). Scoring uses greedy
IoU matching -> per-image mask AP@[.5:.95] + the BSD Wasserstein-1 distance vs the known GT diameters.
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage as ndi
from skimage import feature, filters, measure, morphology, segmentation


def _foreground(gray: np.ndarray) -> np.ndarray:
    """Froth foreground (bubbles vs dark Plateau borders/junctions) by Otsu, then small-hole cleanup."""
    thr = filters.threshold_otsu(gray)
    fg = gray > thr * 0.75
    fg = morphology.remove_small_holes(fg, max_size=16)
    return morphology.remove_small_objects(fg, max_size=12)


def watershed_dt(gray: np.ndarray) -> np.ndarray:
    """Distance-transform marker-controlled watershed (Meyer): the generic classical floor."""
    fg = _foreground(gray)
    dist = ndi.distance_transform_edt(fg)
    coords = feature.peak_local_max(dist, min_distance=4, labels=fg)
    markers = np.zeros(dist.shape, dtype=np.int32)
    for j, (y, x) in enumerate(coords, start=1):
        markers[y, x] = j
    markers = ndi.label(markers)[0]
    return segmentation.watershed(-dist, markers, mask=fg)


def watershed_hmax(gray: np.ndarray) -> np.ndarray:
    """Highlight-seeded watershed: bright specular spots (h-maxima) are the bubble markers, the canonical
    industrial froth method. Robust on clean specular froth, degrades under glare (the honest failure)."""
    fg = _foreground(gray)
    hmax = morphology.h_maxima(gray, h=0.06)
    markers = ndi.label(hmax)[0]
    if markers.max() == 0:                              # no clean highlights -> fall back to DT markers
        return watershed_dt(gray)
    dist = ndi.distance_transform_edt(fg)
    return segmentation.watershed(-dist, markers, mask=fg)


def slic_merge(gray: np.ndarray) -> np.ndarray:
    """SLIC superpixels + mean-intensity region merge, texture-aware baseline."""
    rgb = np.dstack([gray] * 3)
    sp = segmentation.slic(rgb, n_segments=400, compactness=8, sigma=1, channel_axis=-1, start_label=1)
    means = ndi.mean(gray, sp, index=np.arange(1, sp.max() + 1))
    order = np.argsort(means)
    remap = np.zeros(sp.max() + 1, dtype=np.int32)
    for new, old in enumerate(order, start=1):
        remap[old + 1] = new
    return remap[sp]


METHODS = {"watershed_dt": watershed_dt, "watershed_hmax": watershed_hmax, "slic_merge": slic_merge}


def morphometry(lab: np.ndarray) -> list[dict]:
    """Per-instance froth morphometry via skimage.regionprops (equivalent diameter, area, eccentricity,
    solidity), the descriptors the BSD + froth-class layers consume."""
    out = []
    for p in measure.regionprops(lab):
        if p.area < 8:
            continue
        out.append(dict(area=int(p.area), d_eq=round(float(p.equivalent_diameter_area), 2),
                        ecc=round(float(p.eccentricity), 3), solidity=round(float(p.solidity), 3)))
    return out


def _diams(lab: np.ndarray) -> np.ndarray:
    ids = np.unique(lab[lab > 0])
    if ids.size == 0:
        return np.zeros(0)
    counts = np.asarray(ndi.sum(np.ones_like(lab), lab, index=ids))
    return 2.0 * np.sqrt(counts / np.pi)


def bsd_wasserstein(pred: np.ndarray, gt: np.ndarray) -> float | None:
    """Wasserstein-1 distance between the predicted and GT bubble-diameter distributions (BSD fidelity)."""
    from scipy.stats import wasserstein_distance
    dp, dg = _diams(pred), _diams(gt)
    if dp.size == 0 or dg.size == 0:
        return None
    return round(float(wasserstein_distance(dp, dg)), 3)


def mask_ap(pred: np.ndarray, gt: np.ndarray, thresholds=np.arange(0.5, 1.0, 0.05)) -> dict:
    """Per-image instance mask AP: greedy IoU matching of predicted vs GT instances, averaged over IoU
    thresholds .5:.05:.95 (the COCO-style summary). Returns AP, AP50, AP75, over/under-seg counts."""
    gt_ids = [i for i in np.unique(gt) if i > 0]
    pr_ids = [i for i in np.unique(pred) if i > 0]
    if not gt_ids:
        return dict(ap=None, ap50=None, ap75=None, nGt=0, nPred=len(pr_ids))
    gt_masks = {i: gt == i for i in gt_ids}
    pr_masks = {i: pred == i for i in pr_ids}
    iou = np.zeros((len(pr_ids), len(gt_ids)))
    for a, pi in enumerate(pr_ids):
        pm = pr_masks[pi]
        pa = pm.sum()
        for b, gj in enumerate(gt_ids):
            inter = np.logical_and(pm, gt_masks[gj]).sum()
            if inter:
                iou[a, b] = inter / (pa + gt_masks[gj].sum() - inter)
    aps = {}
    for t in thresholds:
        matched_g, matched_p, tp = set(), set(), 0
        order = np.argsort(-iou, axis=None)
        for flat in order:
            a, b = divmod(flat, len(gt_ids))
            if iou[a, b] < t:
                break
            if a in matched_p or b in matched_g:
                continue
            matched_p.add(a)
            matched_g.add(b)
            tp += 1
        fp = len(pr_ids) - tp
        fn = len(gt_ids) - tp
        aps[round(float(t), 2)] = tp / (tp + fp + fn) if (tp + fp + fn) else 0.0
    return dict(ap=round(float(np.mean(list(aps.values()))), 3),
                ap50=round(aps[0.5], 3), ap75=round(aps[0.75], 3),
                nGt=len(gt_ids), nPred=len(pr_ids))
