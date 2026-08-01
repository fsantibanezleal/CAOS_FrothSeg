"""Classical froth segmentation methods (the honest cited FLOOR) + morphometry + benchmark scoring.

The PRODUCT method is a live SAM-class model in the browser (onnxruntime-web + WebGPU); these classical
methods are the baselines it must beat, implemented with the proper CV stack (scikit-image / scipy /
OpenCV), never hand-rolled. Each is tagged with its froth-vision provenance.

The classical ladder (C1..C7, plan section 1.1), each with its froth-vision provenance:
  * C1 `otsu_cc`             Otsu threshold + connected components. Under-segments (touching bubbles merge).
  * C2 `watershed_immersion` immersion watershed seeded at gradient minima. Over-segments (a basin per
                             highlight/dip). Exhibit.
  * C3 `watershed_hmax`      highlight-seeded h-maxima markers flooding the NEGATED IMAGE, the classic industrial
                             froth trick as its own source publishes it. Fails on glare. 0.2196 AP on the 64-image
                             held-out split, and the tier's best d32 relative error at 0.1907.
  * C4 `watershed_dt`        distance-transform markers + marker-controlled watershed (Meyer). The generic floor.
  * C5 `watershed_hmin`      H-minima (extended-minima) suppression before flooding; the single knob h.
  * C6 `slic_merge`          SLIC superpixels + region-adjacency mean-intensity merge, texture-aware.
  * C7 `valley_edge`         dark-seam / valley detector (Wang) grown back to the seam ridge by a constrained
                             watershed (Meyer), the domain-specific froth method. On the 64-image held-out split
                             C7 leads the tier on AP (0.2326) and on count error (114.2), C3 is second at 0.2196
                             and C4 third at 0.1977; C4 still leads on BSD Wasserstein-1 (2.590), and C7 has the
                             WORST d32 relative error of the three leaders (1.4371, against C4's 1.1555 and C3's
                             tier-best 0.1907), the stated cost of growing the caps back. C5 1.9224 and C1 5.0063
                             are worse still on d32, but neither is in contention on AP.

Morphometry uses skimage.regionprops (equivalent diameter, eccentricity, solidity). Scoring: greedy IoU matching
-> per-image mask AP@[.5:.95], Panoptic Quality (PQ = SQ x RQ) with its merge/split decomposition, and the BSD
Wasserstein-1 distance vs the known GT diameters. All run offline as the pre-validated Benchmark references.
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage as ndi
from skimage import feature, filters, graph, measure, morphology, segmentation


# --------------------------------------------------------------------------------------------------
# Published defaults for the classical tier.
#
# Every constant below is the value the committed benchmark artifacts were produced with
# (data/derived/classical-heldout.json, data/derived/method-benchmark.json). They are exposed as named
# module constants and as keyword arguments so a constant can be SWEPT without editing the engine, and
# so a change of default is always visible as a change of one named value rather than of a literal
# buried in a call. Phase 1 of plans/frothseg/research-2026-07-31 sweeps four of them and records the
# sweeps under data/derived/phase1/; the ledger of which constant is swept, which is sourced and which
# is still undefended is data/derived/phase1/classical-constant-ledger.json.
#
# TWO defaults were moved on 2026-08-01, both of them because the code was not implementing the source
# the registry already cites for that method, and NEITHER of them because a sweep score was higher.
# Recorded with their before/after on an unobserved reserve slice in verification/phase1-adoption.json.
#
#   C3_FLOODING_SURFACE  "neg_edt"  -> "neg_gray"  Sadr-Kazemi and Cilliers 1997,
#                                                  10.1016/S0892-6875(97)00094-0
#   C7_MODE              "subtract" -> "watershed" Meyer 1994, 10.1016/0165-1684(94)90060-4
#
# Nothing else moved. C4_COMPACTNESS stays 0.0 and FOREGROUND_OTSU_FACTOR stays 0.75: both are best or
# unbeaten on their own sweeps, and C7_SEAM_RADIUS stays 3 because radius 4 or 5 buys about 0.01 AP on
# the observed test split, which is test-split selection rather than a finding.
# --------------------------------------------------------------------------------------------------

FOREGROUND_OTSU_FACTOR = 0.75        # SWEPT, Phase 1 item 1.2. Common-mode across C1, C2, C3, C4, C5, C6, C7.
FOREGROUND_HOLE_MAX_SIZE = 16        # SWEPT, Phase 1 item 1.2b (remove_small_holes, area in px).
FOREGROUND_OBJECT_MAX_SIZE = 12      # SWEPT, Phase 1 item 1.2b (remove_small_objects, area in px).

C2_MIN_DISTANCE = 2                  # peak_local_max separation for the negated-gradient seeds.
C2_GRADIENT_RADIUS = 1               # rank-gradient disk radius, in px.

C4_MIN_DISTANCE = 4                  # peak_local_max separation for the EDT markers.
C4_COMPACTNESS = 0.0                 # SWEPT, Phase 1 item 1.1. 0.0 == plain watershed, the published behaviour.
C4_WATERSHED_LINE = False            # SWEPT, Phase 1 item 1.1.

C3_H_MAXIMA = 0.06                   # highlight seed depth, in units of the [0, 1] intensity image.
C3_FLOODING_SURFACE = "neg_gray"     # ADOPTED 2026-08-01, was "neg_edt". See verification/phase1-adoption.json.

C5_H_MINIMA = 0.08                   # fraction of the per-image EDT maximum, see watershed_hmin docstring.

C7_SEAM_RADIUS = 3                   # black-tophat disk radius, in px; sets the widest seam that is detected.
C7_MIN_CAP_SIZE = 8                  # caps of this area or fewer are dropped (skimage removes <= max_size).
C7_MODE = "watershed"                # ADOPTED 2026-08-01, was "subtract". See verification/phase1-adoption.json.
C7_WATERSHED_LINE = False            # SWEPT, Phase 1 item 1.3, NOT moved by the adoption. Kept at False.

FLOODING_SURFACES = ("neg_edt", "gray", "neg_gray", "gradient")


def _foreground(
    gray: np.ndarray,
    *,
    otsu_factor: float = FOREGROUND_OTSU_FACTOR,
    hole_max_size: int = FOREGROUND_HOLE_MAX_SIZE,
    object_max_size: int = FOREGROUND_OBJECT_MAX_SIZE,
) -> np.ndarray:
    """Froth foreground (bubbles vs dark Plateau borders/junctions) by Otsu, then small-hole cleanup.

    `otsu_factor` scales Otsu's threshold DOWN before the cut, so what runs is not Otsu 1979's threshold
    (`10.1109/TSMC.1979.4310076`) but a deliberately more permissive one. It is common-mode: five of the
    seven scored methods consume this one mask. Phase 1 item 1.2 sweeps it on all five."""
    thr = filters.threshold_otsu(gray)
    fg = gray > thr * otsu_factor
    fg = morphology.remove_small_holes(fg, max_size=hole_max_size)
    return morphology.remove_small_objects(fg, max_size=object_max_size)


def _flooding_surface(gray: np.ndarray, foreground: np.ndarray, kind: str) -> np.ndarray:
    """The topographic surface a marker-controlled watershed floods.

    `neg_edt` is the distance-transform surface: the negated Euclidean distance transform of the
    foreground, whose valleys are object centres. It is what C4 floods and it was C3's default until
    2026-08-01, which made C3 and C4 differ only in their markers. `neg_gray` floods the negated image,
    which is the surface Sadr-Kazemi & Cilliers 1997 (`10.1016/S0892-6875(97)00094-0`) describe for
    highlight-seeded froth watershed and which the C3 registry entry already cites; it is C3's default
    now. Phase 1 item 1.4 measured all four against C3's markers."""
    if kind == "neg_edt":
        return -ndi.distance_transform_edt(foreground)
    if kind == "gray":
        return gray
    if kind == "neg_gray":
        return -gray
    if kind == "gradient":
        return ndi.morphological_gradient(gray, size=3)
    raise ValueError(f"unknown flooding surface: {kind!r}, expected one of {FLOODING_SURFACES}")


def watershed_dt(
    gray: np.ndarray,
    *,
    min_distance: int = C4_MIN_DISTANCE,
    compactness: float = C4_COMPACTNESS,
    watershed_line: bool = C4_WATERSHED_LINE,
    **foreground_kwargs,
) -> np.ndarray:
    """Distance-transform marker-controlled watershed (Meyer): the generic classical floor.

    `compactness` > 0 selects the compact watershed of Neubert & Protzel 2014 (`10.1109/ICPR.2014.181`),
    which the pinned scikit-image 0.26.0 `watershed` docstring cites for that exact parameter; it biases
    basins toward regular shapes, which is the froth prior. Published default is 0.0 (plain watershed)."""
    fg = _foreground(gray, **foreground_kwargs)
    dist = ndi.distance_transform_edt(fg)
    coords = feature.peak_local_max(dist, min_distance=min_distance, labels=fg)
    markers = np.zeros(dist.shape, dtype=np.int32)
    for j, (y, x) in enumerate(coords, start=1):
        markers[y, x] = j
    markers = ndi.label(markers)[0]
    return segmentation.watershed(
        -dist, markers, mask=fg, compactness=compactness, watershed_line=watershed_line,
    )


def watershed_hmax(
    gray: np.ndarray,
    *,
    h: float = C3_H_MAXIMA,
    surface: str = C3_FLOODING_SURFACE,
    watershed_line: bool = False,
    **foreground_kwargs,
) -> np.ndarray:
    """Highlight-seeded watershed: bright specular spots (h-maxima) are the bubble markers, the canonical
    industrial froth method. Robust on clean specular froth, degrades under glare (the honest failure).

    `surface` selects what those markers flood. The default is `neg_gray`, the negated image, adopted on
    2026-08-01 because that is the surface the method's own cited source floods; the previous default
    `neg_edt` is the distance transform C4 already uses, which made C3 and C4 differ only in their
    markers. Phase 1 item 1.4 separated marker failure from surface failure over all four surfaces and
    verification/phase1-adoption.json confirms the change on a reserve slice no sweep observed."""
    fg = _foreground(gray, **foreground_kwargs)
    hmax = morphology.h_maxima(gray, h=h)
    markers = ndi.label(hmax)[0]
    if markers.max() == 0:                              # no clean highlights -> fall back to DT markers
        return watershed_dt(gray, **foreground_kwargs)
    return segmentation.watershed(
        _flooding_surface(gray, fg, surface), markers, mask=fg, watershed_line=watershed_line,
    )


def slic_merge(gray: np.ndarray, **foreground_kwargs) -> np.ndarray:
    """SLIC superpixels + actual region-adjacency merging.

    The former implementation merely sorted label ids by mean intensity; it did
    not merge anything. Here adjacent regions are cut by RAG mean-color distance,
    masked to froth foreground, and disconnected components are made unique.
    """
    rgb = np.dstack([gray] * 3)
    sp = segmentation.slic(
        rgb, n_segments=400, compactness=8, sigma=1,
        channel_axis=-1, start_label=1,
    )
    rag = graph.rag_mean_color(rgb, sp, mode="distance")
    merged = graph.cut_threshold(sp, rag, thresh=0.08, in_place=False).astype(np.int32)
    merged[~_foreground(gray, **foreground_kwargs)] = 0
    return _split_disconnected_labels(merged)


def otsu_cc(gray: np.ndarray, **foreground_kwargs) -> np.ndarray:
    """C1, Otsu threshold + connected components. The naive baseline: it labels each connected bright region
    as ONE instance, so touching bubbles merge into a single blob. The 'why we need more' under-segmentation
    exhibit (Otsu 1979). No boundary reasoning at all."""
    return ndi.label(_foreground(gray, **foreground_kwargs))[0].astype(np.int32)


def watershed_immersion(
    gray: np.ndarray,
    *,
    min_distance: int = C2_MIN_DISTANCE,
    gradient_radius: int = C2_GRADIENT_RADIUS,
    **foreground_kwargs,
) -> np.ndarray:
    """C2, morphological-gradient immersion watershed (Vincent-Soille 1991) seeded at the minima of the gradient
    itself rather than at chosen object markers. The seeds are the local maxima of the negated gradient with a
    minimum separation of 2 px, taken inside the froth foreground only, so this is an approximation to the
    marker-less flooding of the reference algorithm and not a flood from every regional minimum: minima closer
    than 2 px to a stronger one, and every minimum outside the foreground mask, are dropped. It still seeds a
    basin at each specular highlight and texture dip that survives that filter, which is what makes it the
    canonical OVER-segmentation exhibit on froth (one bubble fragments into many basins: 71,918 predicted
    instances against 17,846 true ones over the 64-image held-out split)."""
    fg = _foreground(gray, **foreground_kwargs)
    grad = filters.rank.gradient(_as_ubyte(gray), morphology.disk(gradient_radius)) \
        if hasattr(filters, "rank") else ndi.morphological_gradient(gray, size=3)
    grad_float = grad.astype(np.float32)
    peak_coords = feature.peak_local_max(
        -grad_float, min_distance=min_distance, labels=fg, exclude_border=False,
    )
    markers = np.zeros_like(grad, dtype=np.int32)
    for index, (y, x) in enumerate(peak_coords, start=1):
        markers[y, x] = index
    if markers.max() == 0:
        return np.zeros_like(markers)
    ws = segmentation.watershed(grad, markers=markers, mask=fg)
    return ws.astype(np.int32)


def watershed_hmin(gray: np.ndarray, h: float = C5_H_MINIMA, **foreground_kwargs) -> np.ndarray:
    """C5, H-minima (extended-minima) marker-controlled watershed (Soille 2004). Suppress the shallow minima of
    the flooding surface before flooding, so shallow highlight/noise dips collapse and only genuine bubble-valley
    basins remain. Directly cuts the C2 over-segmentation.

    `h` IS NOT A DEPTH IN PIXELS. The surface flooded here is the distance map negated AND divided by its own
    maximum, so it lives in [-1, 0] and h is a FRACTION of the deepest EDT value in that image: at the default
    h = 0.08 and a frame whose largest bubble carries an EDT maximum of 20 px, the suppressed depth is 1.6 px,
    and the same h suppresses a different physical depth on the next frame. That per-image normalization is what
    the constant means today and it is deliberate here only in the sense that it is what was measured; the
    unnormalized alternative, in which h would be an EDT depth in pixels, is a different engine and would move
    every C5 number, so it is a Phase 1 sweep and not a docstring fix."""
    fg = _foreground(gray, **foreground_kwargs)
    dist = ndi.distance_transform_edt(fg)
    if dist.max() <= 0:
        return np.zeros_like(fg, dtype=np.int32)
    # Per-image normalization: h is therefore a fraction of this frame's maximum EDT depth, not a pixel depth.
    surface = -(dist / dist.max())                       # valleys of -dist are the bubble centres
    markers = ndi.label(morphology.h_minima(surface, h))[0]
    if markers.max() == 0:
        return watershed_dt(gray, **foreground_kwargs)
    return segmentation.watershed(surface, markers, mask=fg).astype(np.int32)


def valley_edge(
    gray: np.ndarray,
    *,
    seam_radius: int = C7_SEAM_RADIUS,
    min_cap_size: int = C7_MIN_CAP_SIZE,
    mode: str = C7_MODE,
    watershed_line: bool = C7_WATERSHED_LINE,
    **foreground_kwargs,
) -> np.ndarray:
    """C7, lamella-valley constrained watershed, the domain-specific froth classical (Wang 2003; Wang & Chen
    2015) with Meyer 1994 flooding. Froth bubbles are delineated by the darkish inter-bubble VALLEYS (Plateau
    borders), not by the bright specular spots, so gradient/edge detectors that lock onto highlights fail. Here
    the dark seams are found by a black-top-hat (dark structures thinner than the structuring element) and the
    enclosed bright caps are cleaned; since 2026-08-01 those caps are then MARKERS that flood the seam response
    back to its ridge, rather than the instances themselves. Robust to highlights by construction.

    `mode` selects what happens after the caps are cleaned.

    * `"subtract"` was the default until 2026-08-01: the caps ARE the instances, so every seam pixel is
      lost from every bubble and each mask stops short of the seam centreline.
    * `"watershed"` is the default now, and is the constrained watershed the registry name already claims
      (Meyer 1994, `10.1016/0165-1684(94)90060-4`): the cleaned caps become markers and flood the
      black-top-hat response itself, so caps grow back across the seam until they meet on its ridge. No
      new dependency; the `watershed` primitive is the same pinned scikit-image one C3, C4 and C5 use.

    Phase 1 item 1.3 measured the two modes over the 64-image test split, at four seam radii, and every
    watershed row beat every subtract row at every radius. The honest cost of the change, which must be
    stated wherever it is described: d32 relative error moves the WRONG way, 1.2584 to 1.4371 on the
    test split and 1.3160 to 1.4972 on the reserve slice. Growing caps back to the seam ridge enlarges
    every bubble, and the Sauter mean diameter is what notices."""
    seams = morphology.black_tophat(gray, morphology.disk(seam_radius))
    seam_mask = seams > filters.threshold_otsu(seams) if seams.max() > 0 else np.zeros_like(gray, bool)
    fg = _foreground(gray, **foreground_kwargs)
    caps = np.logical_and(fg, ~seam_mask)
    caps = morphology.remove_small_objects(caps, max_size=min_cap_size)
    if mode == "subtract":
        return ndi.label(caps)[0].astype(np.int32)
    if mode != "watershed":
        raise ValueError(f"unknown valley_edge mode: {mode!r}, expected 'subtract' or 'watershed'")
    markers = ndi.label(caps)[0]
    if markers.max() == 0:                              # no cap survives, nothing to flood from
        return markers.astype(np.int32)
    return segmentation.watershed(
        seams, markers, mask=fg, watershed_line=watershed_line,
    ).astype(np.int32)


def _as_ubyte(gray: np.ndarray) -> np.ndarray:
    from skimage.util import img_as_ubyte
    return img_as_ubyte(np.clip(gray, 0, 1))


def _split_disconnected_labels(labels: np.ndarray) -> np.ndarray:
    """Give disconnected islands unique ids while preserving region boundaries."""
    out = np.zeros_like(labels, dtype=np.int32)
    next_id = 1
    for label_id in np.unique(labels):
        if label_id == 0:
            continue
        components, count = ndi.label(labels == label_id)
        for component_id in range(1, count + 1):
            out[components == component_id] = next_id
            next_id += 1
    return out


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


def diameter_summary(labels: np.ndarray, *, mm_per_px: float | None = None) -> dict:
    """Number-weighted BSD summaries in pixels or calibrated millimetres."""
    scale = 1.0 if mm_per_px is None else float(mm_per_px)
    if scale <= 0:
        raise ValueError("mm_per_px must be positive")
    diameters = _diams(labels) * scale
    unit = "px" if mm_per_px is None else "mm"
    if not diameters.size:
        return {
            "unit": unit,
            "count": 0,
            "d10": None,
            "d32": None,
            "d50": None,
            "d90": None,
        }
    d32 = np.sum(diameters**3) / np.sum(diameters**2)
    return {
        "unit": unit,
        "count": int(diameters.size),
        "d10": round(float(np.quantile(diameters, 0.10)), 4),
        "d32": round(float(d32), 4),
        "d50": round(float(np.quantile(diameters, 0.50)), 4),
        "d90": round(float(np.quantile(diameters, 0.90)), 4),
    }


def boundary_fscore(
    pred: np.ndarray,
    gt: np.ndarray,
    *,
    tolerance_px: float = 2.0,
) -> dict:
    """Symmetric boundary precision/recall/F-score at an explicit tolerance."""
    if tolerance_px <= 0:
        raise ValueError("tolerance_px must be positive")
    pred_boundary = segmentation.find_boundaries(pred, mode="inner")
    gt_boundary = segmentation.find_boundaries(gt, mode="inner")
    pred_count = int(pred_boundary.sum())
    gt_count = int(gt_boundary.sum())
    if pred_count == 0 and gt_count == 0:
        return {
            "boundary_precision": 1.0,
            "boundary_recall": 1.0,
            "boundary_fscore": 1.0,
            "boundary_tolerance_px": float(tolerance_px),
        }
    if pred_count == 0 or gt_count == 0:
        return {
            "boundary_precision": 0.0,
            "boundary_recall": 0.0,
            "boundary_fscore": 0.0,
            "boundary_tolerance_px": float(tolerance_px),
        }
    distance_to_gt = ndi.distance_transform_edt(~gt_boundary)
    distance_to_pred = ndi.distance_transform_edt(~pred_boundary)
    precision = float(np.mean(distance_to_gt[pred_boundary] <= tolerance_px))
    recall = float(np.mean(distance_to_pred[gt_boundary] <= tolerance_px))
    fscore = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "boundary_precision": round(precision, 4),
        "boundary_recall": round(recall, 4),
        "boundary_fscore": round(fscore, 4),
        "boundary_tolerance_px": float(tolerance_px),
    }


def morphometry_error(
    pred: np.ndarray,
    gt: np.ndarray,
    *,
    mm_per_px: float | None = None,
) -> dict:
    """Count and BSD-summary error using the same physical calibration."""
    predicted = diameter_summary(pred, mm_per_px=mm_per_px)
    truth = diameter_summary(gt, mm_per_px=mm_per_px)
    count_error = predicted["count"] - truth["count"]
    count_relative_error = (
        abs(count_error) / truth["count"] if truth["count"] else (0.0 if not predicted["count"] else None)
    )
    errors = {}
    for metric in ("d10", "d32", "d50", "d90"):
        pred_value = predicted[metric]
        truth_value = truth[metric]
        errors[f"{metric}_absolute_error"] = (
            None if pred_value is None or truth_value is None else round(abs(pred_value - truth_value), 4)
        )
        errors[f"{metric}_relative_error"] = (
            None
            if pred_value is None or truth_value in (None, 0)
            else round(abs(pred_value - truth_value) / truth_value, 4)
        )
    return {
        "diameter_unit": predicted["unit"],
        "predicted_bsd": predicted,
        "truth_bsd": truth,
        "count_error": int(count_error),
        "count_absolute_error": int(abs(count_error)),
        "count_relative_error": (
            None if count_relative_error is None else round(float(count_relative_error), 4)
        ),
        **errors,
    }


def binary_calibration_metrics(
    probability: np.ndarray,
    target: np.ndarray,
    *,
    bins: int = 10,
) -> dict:
    """Pixel-level Brier score and expected calibration error."""
    if probability.shape != target.shape:
        raise ValueError("probability and target shapes differ")
    if bins < 2:
        raise ValueError("bins must be at least two")
    confidence = np.clip(np.asarray(probability, dtype=np.float64).ravel(), 0.0, 1.0)
    outcome = np.asarray(target, dtype=bool).ravel().astype(np.float64)
    brier = float(np.mean((confidence - outcome) ** 2))
    edges = np.linspace(0.0, 1.0, bins + 1)
    ece = 0.0
    calibration_bins = []
    for index in range(bins):
        upper_inclusive = index == bins - 1
        selector = (confidence >= edges[index]) & (
            confidence <= edges[index + 1] if upper_inclusive else confidence < edges[index + 1]
        )
        count = int(selector.sum())
        if not count:
            calibration_bins.append({
                "lower": round(float(edges[index]), 4),
                "upper": round(float(edges[index + 1]), 4),
                "count": 0,
                "confidence": None,
                "accuracy": None,
            })
            continue
        mean_confidence = float(confidence[selector].mean())
        mean_accuracy = float(outcome[selector].mean())
        ece += count / confidence.size * abs(mean_confidence - mean_accuracy)
        calibration_bins.append({
            "lower": round(float(edges[index]), 4),
            "upper": round(float(edges[index + 1]), 4),
            "count": count,
            "confidence": round(mean_confidence, 4),
            "accuracy": round(mean_accuracy, 4),
        })
    return {
        "brier": round(brier, 6),
        "ece": round(float(ece), 6),
        "bins": calibration_bins,
    }


def full_instance_metrics(
    pred: np.ndarray,
    gt: np.ndarray,
    *,
    mm_per_px: float | None = None,
    boundary_tolerance_px: float = 2.0,
) -> dict:
    """The complete still-image metric contract shared by every method."""
    wasserstein = bsd_wasserstein(pred, gt)
    return {
        **mask_ap(pred, gt),
        **panoptic_quality(pred, gt),
        **boundary_fscore(pred, gt, tolerance_px=boundary_tolerance_px),
        **morphometry_error(pred, gt, mm_per_px=mm_per_px),
        "bsd_wasserstein": wasserstein,
        "bsd_w": wasserstein,
    }


def summarize_metric_rows(rows: list[dict], *, split: str) -> dict:
    """Aggregate the shared still-image contract without dropping failed rows."""
    metric_names = (
        "ap",
        "ap50",
        "ap75",
        "pq",
        "sq",
        "rq",
        "boundary_precision",
        "boundary_recall",
        "boundary_fscore",
        "bsd_wasserstein",
        "count_absolute_error",
        "count_relative_error",
        "d10_relative_error",
        "d32_relative_error",
        "d50_relative_error",
        "d90_relative_error",
    )
    aggregate = {}
    for name in metric_names:
        values = [float(row[name]) for row in rows if row.get(name) is not None]
        aggregate[f"mean_{name}"] = None if not values else float(np.mean(values))
    by_condition = {}
    for condition in sorted({str(row.get("condition_id")) for row in rows if row.get("condition_id")}):
        condition_rows = [row for row in rows if row.get("condition_id") == condition]
        values = [float(row["ap"]) for row in condition_rows if row.get("ap") is not None]
        by_condition[condition] = {
            "n": len(condition_rows),
            "mean_ap": None if not values else float(np.mean(values)),
            "delta_ap_from_global": (
                None
                if not values or aggregate["mean_ap"] is None
                else float(np.mean(values) - aggregate["mean_ap"])
            ),
        }
    return {
        "split": split,
        "n": len(rows),
        **aggregate,
        "robustness_by_condition": by_condition,
        "cases": rows,
    }


def mask_ap(pred: np.ndarray, gt: np.ndarray, thresholds=np.arange(0.5, 1.0, 0.05)) -> dict:
    """Per-image instance mask AP: greedy IoU matching of predicted vs GT instances, averaged over IoU
    thresholds .5:.05:.95.

    NOT COCO AP. COCO ranks detections by confidence and integrates precision over recall; most
    methods here produce no confidence (a watershed does not score its regions), so this uses the
    definition Cellpose and StarDist report, AP(t) = TP / (TP + FP + FN) at each threshold. Only
    the threshold sweep is COCO-style. Numbers are not comparable to a COCO leaderboard; see
    docs/metrics/01_definitions.md. Returns AP, AP50, AP75, and the instance counts."""
    iou, _, pr_ids, gt_ids = _iou_matrix(pred, gt)
    if not gt_ids:
        return dict(ap=None, ap50=None, ap75=None, nGt=0, nPred=len(pr_ids))
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
    """Vectorized contingency-table overlap, O(pixels + labels²), not O(labels² × pixels)."""
    pr_values, pr_inverse = np.unique(pred, return_inverse=True)
    gt_values, gt_inverse = np.unique(gt, return_inverse=True)
    shape = (len(pr_values), len(gt_values))
    joint = np.bincount(
        pr_inverse.ravel() * shape[1] + gt_inverse.ravel(),
        minlength=shape[0] * shape[1],
    ).reshape(shape)
    pr_keep = np.flatnonzero(pr_values > 0)
    gt_keep = np.flatnonzero(gt_values > 0)
    pr_ids = pr_values[pr_keep].astype(int).tolist()
    gt_ids = gt_values[gt_keep].astype(int).tolist()
    if not pr_ids or not gt_ids:
        empty = np.zeros((len(pr_ids), len(gt_ids)), dtype=np.float64)
        return empty, empty.copy(), pr_ids, gt_ids
    inter = joint[np.ix_(pr_keep, gt_keep)].astype(np.float64)
    pr_area = joint[pr_keep, :].sum(axis=1)[:, None]
    gt_area = joint[:, gt_keep].sum(axis=0)[None, :]
    union = pr_area + gt_area - inter
    iou = np.divide(inter, union, out=np.zeros_like(inter), where=union > 0)
    cov = np.divide(inter, gt_area, out=np.zeros_like(inter), where=gt_area > 0)
    return iou, cov, pr_ids, gt_ids


def instance_confidence_calibration(
    pred: np.ndarray,
    gt: np.ndarray,
    confidence_by_instance: dict[int, float],
    *,
    match_iou: float = 0.5,
    bins: int = 10,
) -> dict:
    """Calibrate detector/foundation scores against held-out instance matches."""
    iou, _, pred_ids, _ = _iou_matrix(pred, gt)
    confidences = []
    outcomes = []
    for row, pred_id in enumerate(pred_ids):
        confidences.append(float(confidence_by_instance.get(int(pred_id), 0.0)))
        outcomes.append(bool(iou.shape[1] and float(iou[row].max()) >= match_iou))
    if not confidences:
        return {
            "brier": 0.0,
            "ece": 0.0,
            "bins": [],
            "n": 0,
            "target": f"predicted instance has IoU >= {match_iou}",
        }
    result = binary_calibration_metrics(
        np.asarray(confidences),
        np.asarray(outcomes),
        bins=bins,
    )
    result["n"] = len(confidences)
    result["target"] = f"predicted instance has IoU >= {match_iou}"
    return result


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
        matched_p.add(a)
        matched_g.add(b)
        tp += 1
        sum_iou += iou[a, b]
    fp = len(pr_ids) - tp
    fn = len(gt_ids) - tp
    sq = sum_iou / tp if tp else 0.0
    rq = tp / (tp + 0.5 * fp + 0.5 * fn) if (tp + fp + fn) else 0.0
    splits = int(sum((cov[:, b] > cov_thresh).sum() > 1 for b in range(len(gt_ids))))   # >1 pred per GT
    merges = int(sum((cov[a, :] > cov_thresh).sum() > 1 for a in range(len(pr_ids))))   # >1 GT per pred
    return dict(pq=round(sq * rq, 3), sq=round(sq, 3), rq=round(rq, 3),
                tp=tp, fp=fp, fn=fn, merges=merges, splits=splits)
