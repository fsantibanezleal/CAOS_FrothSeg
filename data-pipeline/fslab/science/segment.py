"""Classical froth segmentation methods (the honest cited FLOOR) + morphometry + benchmark scoring.

The PRODUCT method is a live SAM-class model in the browser (onnxruntime-web + WebGPU); these classical
methods are the baselines it must beat, implemented with the proper CV stack (scikit-image / scipy /
OpenCV), never hand-rolled. Each is tagged with its froth-vision provenance.

The classical ladder (C1..C7, plan section 1.1), each with its froth-vision provenance:
  * C1 `otsu_cc`             Otsu threshold + connected components. Under-segments (touching bubbles merge).
  * C2 `watershed_immersion` marker-less immersion watershed. Over-segments (a basin per highlight/dip). Exhibit.
  * C3 `watershed_hmax`      highlight-seeded h-maxima markers, the classic industrial froth trick. Fails on glare.
  * C4 `watershed_dt`        distance-transform markers + marker-controlled watershed (Meyer). The generic floor.
  * C5 `watershed_hmin`      H-minima (extended-minima) suppression before flooding; the single knob h.
  * C6 `slic_merge`          SLIC superpixels + region-adjacency mean-intensity merge, texture-aware.
  * C7 `valley_edge`         dark-seam / valley detector (Wang), the domain-specific froth method; the strongest classical.

Morphometry uses skimage.regionprops (equivalent diameter, eccentricity, solidity). Scoring: greedy IoU matching
-> per-image mask AP@[.5:.95], Panoptic Quality (PQ = SQ x RQ) with its merge/split decomposition, and the BSD
Wasserstein-1 distance vs the known GT diameters. All run offline as the pre-validated Benchmark references.
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


def otsu_cc(gray: np.ndarray) -> np.ndarray:
    """C1, Otsu threshold + connected components. The naive baseline: it labels each connected bright region
    as ONE instance, so touching bubbles merge into a single blob. The 'why we need more' under-segmentation
    exhibit (Otsu 1979). No boundary reasoning at all."""
    return ndi.label(_foreground(gray))[0].astype(np.int32)


def watershed_immersion(gray: np.ndarray) -> np.ndarray:
    """C2, morphological-gradient immersion watershed with NO markers (Vincent-Soille 1991). Floods from EVERY
    regional minimum of the gradient, so each specular highlight and every texture dip becomes its own basin:
    the canonical OVER-segmentation exhibit on froth (one bubble fragments into many basins)."""
    fg = _foreground(gray)
    grad = filters.rank.gradient(_as_ubyte(gray), morphology.disk(1)) if hasattr(filters, "rank") else \
        ndi.morphological_gradient(gray, size=3)
    ws = segmentation.watershed(grad, mask=fg)  # no markers -> minima-seeded -> over-segments
    return ws.astype(np.int32)


def watershed_hmin(gray: np.ndarray, h: float = 0.08) -> np.ndarray:
    """C5, H-minima (extended-minima) marker-controlled watershed (Soille 2004). Suppress all minima of the
    negated distance map shallower than depth h before flooding, so shallow highlight/noise dips collapse and
    only genuine bubble-valley basins remain; h is the single knob and effectively sets the smallest resolvable
    bubble. Directly cuts the C2 over-segmentation."""
    fg = _foreground(gray)
    dist = ndi.distance_transform_edt(fg)
    if dist.max() <= 0:
        return np.zeros_like(fg, dtype=np.int32)
    surface = -(dist / dist.max())                       # valleys of -dist are the bubble centres
    markers = ndi.label(morphology.h_minima(surface, h))[0]
    if markers.max() == 0:
        return watershed_dt(gray)
    return segmentation.watershed(surface, markers, mask=fg).astype(np.int32)


def valley_edge(gray: np.ndarray) -> np.ndarray:
    """C7, valley-edge / dark-seam detector, the domain-specific froth classical (Wang 2003; Wang & Chen 2015).
    Froth bubbles are delineated by the darkish inter-bubble VALLEYS (Plateau borders), not by the bright
    specular spots, so gradient/edge detectors that lock onto highlights fail. Here the dark seams are found by a
    black-top-hat (dark structures thinner than the structuring element), removed from the foreground, and the
    enclosed bright caps are labelled as the bubbles. Robust to highlights by construction."""
    seams = morphology.black_tophat(gray, morphology.disk(3))
    seam_mask = seams > filters.threshold_otsu(seams) if seams.max() > 0 else np.zeros_like(gray, bool)
    caps = np.logical_and(_foreground(gray), ~seam_mask)
    caps = morphology.remove_small_objects(caps, max_size=8)
    return ndi.label(caps)[0].astype(np.int32)


def _as_ubyte(gray: np.ndarray) -> np.ndarray:
    from skimage.util import img_as_ubyte
    return img_as_ubyte(np.clip(gray, 0, 1))


# The classical ladder C1..C7 (plan Section 1.1). Every method runs offline here (the pre-validated Benchmark
# references) and has a JS/WASM twin in the live App. C3/C4/C6 pre-existed; C1/C2/C5/C7 added in the rebuild.
METHODS = {
    "otsu_cc": otsu_cc,                 # C1 under-segment baseline
    "watershed_immersion": watershed_immersion,  # C2 over-segment exhibit
    "watershed_hmax": watershed_hmax,  # C3 highlight-seeded marker-controlled
    "watershed_dt": watershed_dt,      # C4 distance-transform marker-controlled
    "watershed_hmin": watershed_hmin,  # C5 H-minima
    "slic_merge": slic_merge,          # C6 SLIC + region merge
    "valley_edge": valley_edge,        # C7 valley-edge dark-seam
}


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


def _iou_matrix(pred: np.ndarray, gt: np.ndarray):
    gt_ids = [i for i in np.unique(gt) if i > 0]
    pr_ids = [i for i in np.unique(pred) if i > 0]
    gm = {i: gt == i for i in gt_ids}
    pm = {i: pred == i for i in pr_ids}
    iou = np.zeros((len(pr_ids), len(gt_ids)))
    cov = np.zeros((len(pr_ids), len(gt_ids)))   # intersection / gt-area (for merge/split accounting)
    for a, pi in enumerate(pr_ids):
        pa = pm[pi].sum()
        for b, gj in enumerate(gt_ids):
            inter = np.logical_and(pm[pi], gm[gj]).sum()
            if inter:
                ga = gm[gj].sum()
                iou[a, b] = inter / (pa + ga - inter)
                cov[a, b] = inter / ga
    return iou, cov, pr_ids, gt_ids


def panoptic_quality(pred: np.ndarray, gt: np.ndarray, cov_thresh: float = 0.2) -> dict:
    """Panoptic Quality (Kirillov et al. 2019) with its merge/split decomposition, the honest instance metric for
    dense froth. Segments match uniquely at IoU > 0.5; PQ = SQ x RQ where SQ = mean IoU over true positives and
    RQ = TP / (TP + 0.5 FP + 0.5 FN). Also returns the two froth-relevant error modes: SPLIT errors (one GT bubble
    covered by several predicted segments, i.e. over-segmentation, the watershed-on-highlights failure) and MERGE
    errors (one predicted segment covering several GT bubbles, i.e. under-segmentation, the Otsu failure)."""
    iou, cov, pr_ids, gt_ids = _iou_matrix(pred, gt)
    if not gt_ids:
        return dict(pq=None, sq=None, rq=None, tp=0, fp=len(pr_ids), fn=0, merges=0, splits=0)
    matched_g, matched_p, tp, sum_iou = set(), set(), 0, 0.0
    for flat in np.argsort(-iou, axis=None):
        a, b = divmod(int(flat), len(gt_ids))
        if iou[a, b] <= 0.5:
            break
        if a in matched_p or b in matched_g:
            continue
        matched_p.add(a); matched_g.add(b); tp += 1; sum_iou += iou[a, b]
    fp = len(pr_ids) - tp
    fn = len(gt_ids) - tp
    sq = sum_iou / tp if tp else 0.0
    rq = tp / (tp + 0.5 * fp + 0.5 * fn) if (tp + fp + fn) else 0.0
    splits = int(sum((cov[:, b] > cov_thresh).sum() > 1 for b in range(len(gt_ids))))   # >1 pred per GT
    merges = int(sum((cov[a, :] > cov_thresh).sum() > 1 for a in range(len(pr_ids))))   # >1 GT per pred
    return dict(pq=round(sq * rq, 3), sq=round(sq, 3), rq=round(rq, 3),
                tp=tp, fp=fp, fn=fn, merges=merges, splits=splits)
