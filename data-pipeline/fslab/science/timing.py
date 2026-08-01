"""Repeated, load-checked wall-clock timing.

Why this module exists. `mean_inference_ms` is one of the two axes of the published Pareto
frontier, and until 2026-08-01 it was produced by a single sequential pass with no warmup and
no repeats: one `perf_counter` around each of 64 calls, averaged. Whatever else the machine was
doing during that pass went straight into the number. Comparing the committed bakes shows what
that cost, per method, across runs of *identical* code on *identical* inputs:

    C1 x1.80   C2 x1.28   C3 x1.43   C4 x1.66   C5 x1.46   C6 x1.26   C7 x2.74

Every method inflated together in the newest bake, which is the signature of machine load and not
of an algorithm. A frontier computed on that axis is not a measurement of the algorithms.

What this module does instead:

*Warmup.* One discarded pass. First-call costs (import-time lazy compilation, allocator warmup,
cold caches) belong to the process, not to the method.

*Repeats.* `repeats` timed passes over the whole set. The statistic per image is the MEDIAN across
passes, not the mean, so a single transient spike on one pass cannot move it. The reported
`mean_inference_ms` is then the mean over images of those per-image medians, which keeps the same
meaning as the old field (average cost of one image) while no longer being a sample of size one.

*A load canary.* A fixed, deterministic reference workload is timed before and after the repeats.
It measures the machine, not the method. Two bakes are only comparable when their canaries agree,
and `canary_drift_ratio` says whether they do. This is what makes a timing from one day answerable
against a timing from another, and it is recorded in the artifact rather than assumed.

*A stability verdict.* `inter_repeat_cv` is the coefficient of variation of the per-pass totals. A
run above `CV_UNSTABLE` is reported as `stable: false` and is not fit to be published as a compute
axis; the caller decides whether to fail or to re-run, but it cannot be unaware.
"""

from __future__ import annotations

import platform
import statistics
import time
from collections.abc import Callable, Sequence
from typing import Any

import numpy as np

# Above this coefficient of variation across repeats the machine moved enough during the run
# that the number describes the machine. Chosen as a round 10 percent: the drift actually
# observed between historical bakes was 26 to 174 percent, an order of magnitude clear of it.
CV_UNSTABLE = 0.10

# The canary must be big enough to be immune to timer granularity and small enough to be
# negligible next to the run. A fixed-size float64 matmul is deterministic, uses the same BLAS
# every method here ultimately leans on, and has no I/O.
_CANARY_N = 320
_CANARY_REPEATS = 7


def canary_ms() -> float:
    """Time a fixed reference workload. Measures the machine, never the method under test."""
    rng = np.random.default_rng(20260801)
    left = rng.standard_normal((_CANARY_N, _CANARY_N))
    right = rng.standard_normal((_CANARY_N, _CANARY_N))
    left @ right  # warm the BLAS path before timing it
    samples = []
    for _ in range(_CANARY_REPEATS):
        started = time.perf_counter()
        left @ right
        samples.append((time.perf_counter() - started) * 1000)
    return float(statistics.median(samples))


def time_over_items(
    call: Callable[[Any], Any],
    items: Sequence[Any],
    *,
    repeats: int = 5,
    warmup: bool = True,
) -> dict:
    """Time `call` over every item, `repeats` times, and return per-image medians plus a verdict.

    Returns a dict carrying `per_image_ms` (the per-image medians, in item order) alongside the
    aggregate fields and the honesty fields: the canary readings, the inter-repeat spread, and
    `stable`. The caller is expected to record all of them, not just the mean.
    """
    if repeats < 1:
        raise ValueError("repeats must be at least 1")
    if not len(items):
        raise ValueError("nothing to time")

    canary_before = canary_ms()
    if warmup:
        for item in items:
            call(item)

    # passes[r][i] is the cost of item i on pass r.
    passes: list[list[float]] = []
    for _ in range(repeats):
        row = []
        for item in items:
            started = time.perf_counter()
            call(item)
            row.append((time.perf_counter() - started) * 1000)
        passes.append(row)
    canary_after = canary_ms()

    matrix = np.asarray(passes, dtype=np.float64)          # (repeats, items)
    per_image = np.median(matrix, axis=0)                  # robust to a spike on one pass
    pass_totals = matrix.sum(axis=1)
    mean_total = float(pass_totals.mean())
    inter_repeat_cv = float(pass_totals.std(ddof=0) / mean_total) if mean_total > 0 else 0.0
    canary_drift = (
        float(max(canary_before, canary_after) / min(canary_before, canary_after))
        if min(canary_before, canary_after) > 0
        else float("inf")
    )

    return {
        "mean_inference_ms": float(per_image.mean()),
        "median_inference_ms": float(np.median(per_image)),
        "p95_inference_ms": float(np.quantile(per_image, 0.95)),
        "per_image_ms": [round(value, 4) for value in per_image.tolist()],
        "timing_method": (
            f"median over {repeats} repeats per image"
            f"{', after one discarded warmup pass' if warmup else ''}"
        ),
        "repeats": repeats,
        "warmup_passes": 1 if warmup else 0,
        "items": int(len(items)),
        "per_pass_total_ms": [round(value, 3) for value in pass_totals.tolist()],
        "inter_repeat_cv": round(inter_repeat_cv, 5),
        "canary_before_ms": round(canary_before, 4),
        "canary_after_ms": round(canary_after, 4),
        "canary_drift_ratio": round(canary_drift, 4),
        "canary_workload": f"float64 {_CANARY_N}x{_CANARY_N} matmul, median of {_CANARY_REPEATS}",
        "stable": bool(inter_repeat_cv <= CV_UNSTABLE),
        "stability_threshold_cv": CV_UNSTABLE,
    }


def environment() -> dict:
    """The machine facts a timing is only interpretable against."""
    import scipy
    import skimage

    return {
        "platform": platform.platform(),
        "processor": platform.processor() or platform.machine(),
        "python": platform.python_version(),
        "numpy": np.__version__,
        "scipy": scipy.__version__,
        "scikit_image": skimage.__version__,
        "canary_ms": round(canary_ms(), 4),
    }
