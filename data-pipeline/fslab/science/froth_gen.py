"""Synthetic froth generator, the mask-VALIDATION harness (FrothSeg, not the product).

Public per-bubble froth masks are legally request-only (research-tools-and-data-2026-07-09), so this renders
physically-flavoured synthetic froth whose instance masks are known EXACTLY, in the same format a real loader
consumes (PNG frame + COCO-RLE masks + BSD ground-truth). It exists ONLY to score segmenters with real mask
metrics on known GT; the product is live SAM-class segmentation of REAL (uploaded) froth.

Model, using the proper CV stack (scipy.ndimage / scikit-image / OpenCV), no hand-rolled numpy:
  * GEOMETRY, Laguerre (power-diagram) foam tessellation. Centres packed by random sequential adsorption with
    log-normal radii so the Sauter mean d32 is controllable; each pixel is assigned to the site of minimum
    POWER distance |p-c|^2 - r^2. The power diagram is the standard dry-foam model (Plateau's laws): cells
    meet at curved Plateau borders, the dark junctions real froth shows. (Weaire & Hutzler, Physics of Foams.)
  * APPEARANCE, base grey + Plateau-border darkening from the EXACT Euclidean distance transform
    (scipy.ndimage.distance_transform_edt) + per-bubble specular HIGHLIGHT (deliberately jittered / sometimes
    missing so highlight-seeded watershed cannot win artificially) + per-case stressors: glare, motion blur
    (cv2), Gaussian defocus (scipy.ndimage.gaussian_filter), sensor noise.

Determinism: a case is a pure function of (spec, seed); all randomness from a seeded numpy Generator.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np
from scipy import ndimage as ndi


@dataclass(frozen=True)
class FrothSpec:
    """One synthetic froth case, a coverage-axis point with a fixed seed (plan section 3e)."""
    name: str
    seed: int
    h: int = 256
    w: int = 256
    d32_px: float = 26.0
    sigma_ln: float = 0.45
    glare: float = 0.0
    motion_blur: int = 0
    defocus: float = 0.0
    noise: float = 0.03
    load: float = 0.5
    highlight_jitter: float = 0.25
    watery: float = 0.0
    empty: bool = False
    labels: tuple[str, ...] = field(default_factory=tuple)


def _lognormal_radii(rng: np.random.Generator, d32_px: float, sigma_ln: float, n: int) -> np.ndarray:
    """Radii [px] from a log-normal chosen so the Sauter mean diameter d32 = <d^3>/<d^2> = exp(mu + 2.5 s^2)
    matches the target, so mu = ln(d32) - 2.5 s^2."""
    mu = np.log(d32_px) - 2.5 * sigma_ln ** 2
    d = rng.lognormal(mean=mu, sigma=sigma_ln, size=n)
    return np.clip(d, 4.0, None) * 0.5


def pack_bubbles(spec: FrothSpec) -> np.ndarray:
    """Random sequential adsorption -> (N,3) sites (cx, cy, r); a 28% overlap is allowed so cells touch."""
    if spec.empty:
        return np.zeros((0, 3), dtype=np.float64)
    rng = np.random.default_rng(spec.seed)
    mean_r = spec.d32_px * 0.5
    n_target = int(1.6 * spec.h * spec.w / (np.pi * mean_r ** 2))
    radii = _lognormal_radii(rng, spec.d32_px, spec.sigma_ln, n_target * 3)
    sites: list[tuple[float, float, float]] = []
    for r in radii:
        if len(sites) >= n_target:
            break
        for _ in range(6):
            cx = rng.uniform(-r * 0.3, spec.w + r * 0.3)
            cy = rng.uniform(-r * 0.3, spec.h + r * 0.3)
            if all((cx - ox) ** 2 + (cy - oy) ** 2 >= (0.72 * (r + orr)) ** 2 for (ox, oy, orr) in sites):
                sites.append((cx, cy, float(r)))
                break
    return np.asarray(sites, dtype=np.float64).reshape(-1, 3)


def laguerre_labels(spec: FrothSpec, sites: np.ndarray) -> np.ndarray:
    """Per-pixel Laguerre label argmin_i(|p-c_i|^2 - r_i^2); 0 = background. int32 (H,W)."""
    h, w = spec.h, spec.w
    if len(sites) == 0:
        return np.zeros((h, w), dtype=np.int32)
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    best = np.full((h, w), np.inf)
    lab = np.zeros((h, w), dtype=np.int32)
    inside = np.zeros((h, w), dtype=bool)
    for i, (cx, cy, r) in enumerate(sites, start=1):
        d2 = (xs - cx) ** 2 + (ys - cy) ** 2
        power = d2 - r ** 2
        take = power < best
        best = np.where(take, power, best)
        lab = np.where(take, i, lab)
        inside |= d2 <= (1.35 * r) ** 2
    lab[~inside] = 0
    return lab


def render(spec: FrothSpec, sites: np.ndarray, lab: np.ndarray) -> np.ndarray:
    """Grey froth [0,1] (H,W): base + Plateau-border darkening (EXACT EDT) + specular highlights + stressors."""
    rng = np.random.default_rng(spec.seed + 1)
    h, w = spec.h, spec.w
    img = np.full((h, w), 0.62 - 0.18 * spec.load, dtype=np.float64)
    if len(sites):
        # distance to the nearest cell boundary via the exact Euclidean distance transform of the interiors
        edge = np.zeros((h, w), bool)
        edge[:, :-1] |= lab[:, :-1] != lab[:, 1:]
        edge[:-1, :] |= lab[:-1, :] != lab[1:, :]
        bd = ndi.distance_transform_edt(~edge)
        border = np.exp(-bd / (1.6 + 3.0 * spec.watery))
        img -= 0.32 * (1.0 - spec.watery * 0.6) * border
        img[lab == 0] *= 0.5
        ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
        for (cx, cy, r) in sites:
            if rng.uniform() < 0.12 * spec.highlight_jitter:
                continue
            hx = cx - 0.35 * r + rng.normal(0, spec.highlight_jitter * r)
            hy = cy - 0.35 * r + rng.normal(0, spec.highlight_jitter * r)
            s = 0.22 * r
            img += (0.5 - 0.2 * spec.watery) * np.exp(-((xs - hx) ** 2 + (ys - hy) ** 2) / (2 * s ** 2))
    if spec.glare > 0:
        gx, gy = rng.uniform(0, w), rng.uniform(0, h)
        gr = spec.glare * 0.6 * min(h, w)
        ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
        img += spec.glare * np.exp(-((xs - gx) ** 2 + (ys - gy) ** 2) / (2 * gr ** 2))
    if spec.motion_blur > 1:
        k = np.zeros((spec.motion_blur, spec.motion_blur)); k[spec.motion_blur // 2, :] = 1.0 / spec.motion_blur
        img = cv2.filter2D(img, -1, k)
    if spec.defocus > 0:
        img = ndi.gaussian_filter(img, spec.defocus)
    img = img + rng.normal(0, spec.noise, img.shape)
    return np.clip(img, 0.0, 1.0)


def bsd(lab: np.ndarray) -> dict:
    """BSD ground truth from the RENDERED instance areas: equivalent diameter d_eq = 2*sqrt(area/pi), then
    D10/D50/D90, the Sauter mean d32 = sum d^3 / sum d^2, count, and % small (< D50/2)."""
    ids = np.unique(lab[lab > 0])
    if ids.size == 0:
        return dict(count=0, d10=None, d50=None, d90=None, d32=None, pctSmall=None)
    counts = ndi.sum(np.ones_like(lab), lab, index=ids)
    d = np.sort(2.0 * np.sqrt(np.asarray(counts) / np.pi))
    d50 = float(np.percentile(d, 50))
    return dict(count=int(d.size),
                d10=round(float(np.percentile(d, 10)), 2), d50=round(d50, 2),
                d90=round(float(np.percentile(d, 90)), 2),
                d32=round(float((d ** 3).sum() / (d ** 2).sum()), 2),
                pctSmall=round(float(np.mean(d < d50 / 2)), 3))


def generate(spec: FrothSpec) -> dict:
    """Render one case: {spec, sites, labels(int32 HxW), image([0,1] HxW), bsd}."""
    sites = pack_bubbles(spec)
    lab = laguerre_labels(spec, sites)
    img = render(spec, sites, lab)
    return dict(spec=spec, sites=sites, labels=lab, image=img, bsd=bsd(lab))


CASES: tuple[FrothSpec, ...] = (
    FrothSpec("mono-clean", seed=101, d32_px=30, sigma_ln=0.12, labels=("monodisperse", "positive-control")),
    FrothSpec("poly-normal", seed=102, d32_px=26, sigma_ln=0.5, labels=("polydisperse",)),
    FrothSpec("fine-froth", seed=103, d32_px=15, sigma_ln=0.45, labels=("fine",)),
    FrothSpec("coarse-froth", seed=104, d32_px=44, sigma_ln=0.4, labels=("coarse",)),
    FrothSpec("glare-storm", seed=105, d32_px=26, sigma_ln=0.5, glare=0.8, highlight_jitter=0.6, labels=("glare", "negative-control")),
    FrothSpec("watery", seed=106, d32_px=24, sigma_ln=0.5, watery=0.9, load=0.35, labels=("watery",)),
    FrothSpec("motion-fast", seed=107, d32_px=26, sigma_ln=0.5, motion_blur=11, labels=("motion-blur",)),
    FrothSpec("defocus", seed=108, d32_px=28, sigma_ln=0.5, defocus=2.4, labels=("defocus",)),
    FrothSpec("high-load", seed=109, d32_px=24, sigma_ln=0.5, load=0.9, labels=("high-load", "dark")),
    FrothSpec("low-light-noise", seed=110, d32_px=26, sigma_ln=0.5, noise=0.09, load=0.7, labels=("noise",)),
    FrothSpec("bursting", seed=111, d32_px=30, sigma_ln=0.6, highlight_jitter=0.5, labels=("bursting", "transient")),
    FrothSpec("edge-framing", seed=112, d32_px=22, sigma_ln=0.55, glare=0.3, labels=("edge",)),
    FrothSpec("empty-control", seed=113, empty=True, labels=("empty", "negative-control")),
)
