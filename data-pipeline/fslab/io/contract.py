"""CONTRACT 1 · ingestion (raw froth image -> pipeline). The *bring-your-own-froth* gate.

A froth frame (uploaded by a user or read from a folder) is ACCEPTED iff it is a real, usable image: a 2D
grayscale or 3D RGB array, within a sane size band, numeric, and with enough dynamic range to segment. Unusable
frames are REJECTED with a reason (too small, empty/constant, wrong shape); usable-but-degraded frames are
FLAGGED (accepted, but the manifest records why: heavy glare, very dark, low contrast) so the UI can warn and
the OpenCV deglare/illumination-flatten front-end can kick in. This is what lets the product run on NEW froth
instead of only the baked synthetic benchmark. Documented in data/README.md.

Pure + deterministic + no I/O: it inspects a numpy array. The web mirrors the same thresholds in TypeScript so
the browser rejects a bad upload before spending a SAM inference on it.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from .schema import ImageStats

MIN_SIDE = 64            # below this a froth frame has too few pixels per bubble to segment -> REJECT
MAX_SIDE = 8192          # guard against pathological uploads -> REJECT
DYN_RANGE_MIN = 0.06     # p99-p01 contrast below this is a flat/blank frame -> REJECT
DYN_RANGE_FLAG = 0.15    # low but non-trivial contrast -> FLAG (deglare/flatten recommended)
SAT_FRAC_FLAG = 0.20     # >20% near-saturated pixels => heavy glare -> FLAG
DARK_FRAC_FLAG = 0.55    # >55% near-black => under-exposed / mostly pulp, not froth -> FLAG


def _to_gray01(arr: np.ndarray) -> np.ndarray:
    """Normalize any incoming image to float [0,1] grayscale for the stats (Rec.601 luma for RGB)."""
    a = np.asarray(arr)
    if a.ndim == 3:
        a = a[..., :3]
        a = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    a = a.astype(np.float64)
    if a.size and a.max() > 1.0:      # assume 8-bit (or wider) integer range
        a = a / 255.0 if a.max() <= 255.0 else a / a.max()
    return np.clip(a, 0.0, 1.0)


def image_stats(arr: np.ndarray) -> ImageStats:
    """Descriptive stats + the FLAG list for one froth frame (no accept/reject decision here)."""
    a = np.asarray(arr)
    channels = 1 if a.ndim == 2 else (a.shape[2] if a.ndim == 3 else 0)
    g = _to_gray01(a) if a.ndim in (2, 3) else np.zeros((0, 0))
    if g.size:
        p01, p99 = np.percentile(g, [1, 99])
        dyn = float(p99 - p01)
        sat = float(np.mean(g > 0.97))
        dark = float(np.mean(g < 0.03))
    else:
        dyn = sat = dark = 0.0
    flags: list[str] = []
    if 0 < dyn < DYN_RANGE_FLAG:
        flags.append(f"low contrast (dynamic range {dyn:.3f} < {DYN_RANGE_FLAG})")
    if sat > SAT_FRAC_FLAG:
        flags.append(f"heavy glare ({sat*100:.0f}% saturated > {SAT_FRAC_FLAG*100:.0f}%)")
    if dark > DARK_FRAC_FLAG:
        flags.append(f"under-exposed ({dark*100:.0f}% near-black > {DARK_FRAC_FLAG*100:.0f}%)")
    h, w = (a.shape[0], a.shape[1]) if a.ndim in (2, 3) else (0, 0)
    return ImageStats(h=h, w=w, channels=channels, dtype=str(a.dtype),
                      dyn_range=round(dyn, 4), sat_frac=round(sat, 4), dark_frac=round(dark, 4),
                      flags=tuple(flags))


@dataclass
class ImageContractReport:
    accepted: bool
    stats: ImageStats | None
    rejected_reason: str | None
    flags: tuple[str, ...]

    @property
    def ok(self) -> bool:
        return self.accepted

    def summary(self) -> str:
        if not self.accepted:
            return f"REJECTED: {self.rejected_reason}"
        return "accepted" + (f" (flagged: {'; '.join(self.flags)})" if self.flags else "")


def validate_image(arr: Any) -> ImageContractReport:
    """Apply CONTRACT 1 to one froth frame (a numpy array). Never raises on a bad image, it reports."""
    a = np.asarray(arr)
    if a.ndim not in (2, 3) or (a.ndim == 3 and a.shape[2] not in (1, 3, 4)):
        return ImageContractReport(False, None, f"unsupported shape {a.shape} (need 2D gray or 3D RGB[A])", ())
    if not np.issubdtype(a.dtype, np.number):
        return ImageContractReport(False, None, f"non-numeric dtype {a.dtype}", ())
    if not np.all(np.isfinite(_to_gray01(a))):
        return ImageContractReport(False, None, "NaN/Inf pixel values", ())
    st = image_stats(a)
    if min(st.h, st.w) < MIN_SIDE:
        return ImageContractReport(False, st, f"too small: {st.h}x{st.w} (min side {MIN_SIDE}px)", ())
    if max(st.h, st.w) > MAX_SIDE:
        return ImageContractReport(False, st, f"too large: {st.h}x{st.w} (max side {MAX_SIDE}px)", ())
    if st.dyn_range < DYN_RANGE_MIN:
        return ImageContractReport(False, st, f"blank/flat frame (dynamic range {st.dyn_range} < {DYN_RANGE_MIN})", ())
    return ImageContractReport(True, st, None, st.flags)
