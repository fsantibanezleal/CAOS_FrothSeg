"""Distribution-free split conformal prediction for the quantities this product reports.

The product output is a bubble size distribution and a count, not a mask. Nothing in the
benchmark carries a guarantee on either. This module supplies the guarantee machinery: split
conformal intervals (Vovk, Gammerman and Shafer 2005; Lei et al. 2018) and conformal risk
control for a bounded non-binary loss (Angelopoulos, Bates, Fisch, Lei and Schuster,
`arXiv:2208.02814`, ICLR 2024).

Everything here is pure numerics on score vectors. No model, no image, no split policy. The
policy lives in the pre-registered study script that calls this, which is what keeps the
guarantee auditable: this file cannot silently choose a favourable calibration set.

Validity conditions, stated because they are easy to break
----------------------------------------------------------

1. The calibration scores and the evaluation scores must be exchangeable. A calibration split
   that was already used to FIT the predictor, including to fit a decode threshold grid, is not
   exchangeable with the evaluation split and the resulting interval carries no guarantee.
2. The score must be computable at prediction time from the prediction alone. ``absolute_residual``
   gives a constant half width; ``relative_residual`` normalizes by the point estimate, which is
   known at prediction time, so the resulting interval is still legitimate.
3. The guarantee is MARGINAL over the draw, not conditional on the condition label. Per-group
   coverage can be far from nominal even when the marginal coverage is exact, which is what the
   Mondrian helpers here are for.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np


def absolute_residual(prediction: np.ndarray, truth: np.ndarray) -> np.ndarray:
    """Plain split-conformal score. Interval half width is constant across frames."""
    return np.abs(np.asarray(prediction, dtype=float) - np.asarray(truth, dtype=float))


def relative_residual(prediction: np.ndarray, truth: np.ndarray) -> np.ndarray:
    """Scale-normalized score. Interval half width is proportional to the point estimate.

    The normalizer is the prediction, which is available at prediction time, so this is a
    legitimate conformal score and not a peek at the label. Predictions of zero are rejected
    rather than silently clamped, because a zero point estimate has no proportional interval.
    """
    prediction = np.asarray(prediction, dtype=float)
    if np.any(prediction <= 0.0):
        raise ValueError("relative_residual needs strictly positive point estimates")
    return np.abs(prediction - np.asarray(truth, dtype=float)) / prediction


def conformal_rank(n: int, alpha: float) -> int:
    """The order statistic index, 1-based, that split conformal uses: ceil((n+1)(1-alpha))."""
    if n < 1:
        raise ValueError("conformal calibration needs at least one score")
    if not 0.0 < alpha < 1.0:
        raise ValueError("alpha must lie strictly between 0 and 1")
    return int(math.ceil((n + 1) * (1.0 - alpha)))


def conformal_quantile(scores: np.ndarray, alpha: float) -> tuple[float, int, bool]:
    """Return (threshold, 1-based rank, feasible).

    Infeasible means the calibration set is too small for the target level: the required rank
    exceeds ``n``, and the only interval with the guarantee is the infinite one. Reporting that
    honestly is the point; returning the maximum score instead would advertise a level the
    sample cannot support.
    """
    values = np.sort(np.asarray(scores, dtype=float))
    rank = conformal_rank(len(values), alpha)
    if rank > len(values):
        return float("inf"), rank, False
    return float(values[rank - 1]), rank, True


@dataclass(frozen=True)
class IntervalReport:
    """A fitted interval and its measured behaviour on an evaluation set."""

    score: str
    alpha: float
    calibration_n: int
    rank: int
    feasible: bool
    threshold: float
    evaluation_n: int
    covered: int
    coverage: float
    half_widths: np.ndarray = field(repr=False)
    lower: np.ndarray = field(repr=False)
    upper: np.ndarray = field(repr=False)
    median_half_width: float
    median_relative_half_width: float
    mean_relative_half_width: float

    def summary(self) -> dict:
        return {
            "score": self.score,
            "alpha": self.alpha,
            "target_coverage": round(1.0 - self.alpha, 6),
            "calibration_n": self.calibration_n,
            "conformal_rank": self.rank,
            "feasible": self.feasible,
            "threshold": None if math.isinf(self.threshold) else round(self.threshold, 6),
            "evaluation_n": self.evaluation_n,
            "covered": self.covered,
            "empirical_coverage": round(self.coverage, 6),
            "median_half_width": (
                None if math.isinf(self.median_half_width) else round(self.median_half_width, 6)
            ),
            "median_relative_half_width": (
                None
                if math.isinf(self.median_relative_half_width)
                else round(self.median_relative_half_width, 6)
            ),
            "mean_relative_half_width": (
                None
                if math.isinf(self.mean_relative_half_width)
                else round(self.mean_relative_half_width, 6)
            ),
        }


def fit_and_apply(
    *,
    score: str,
    calibration_prediction: np.ndarray,
    calibration_truth: np.ndarray,
    evaluation_prediction: np.ndarray,
    evaluation_truth: np.ndarray,
    alpha: float,
    clip_lower: float | None = 0.0,
) -> IntervalReport:
    """Fit the threshold on calibration, apply it once to the evaluation set, measure coverage.

    ``clip_lower`` truncates the published lower bound at a physical floor (a diameter and a
    count are both non-negative). Truncation at a value the truth can never fall below cannot
    lose coverage, so the guarantee survives it; coverage is measured from the score anyway.
    """
    scorer = {"absolute": absolute_residual, "relative": relative_residual}[score]
    calibration_scores = scorer(calibration_prediction, calibration_truth)
    evaluation_scores = scorer(evaluation_prediction, evaluation_truth)
    threshold, rank, feasible = conformal_quantile(calibration_scores, alpha)

    evaluation_prediction = np.asarray(evaluation_prediction, dtype=float)
    if score == "absolute":
        half_widths = np.full(evaluation_prediction.shape, threshold, dtype=float)
    else:
        half_widths = threshold * evaluation_prediction
    lower = evaluation_prediction - half_widths
    if clip_lower is not None:
        lower = np.maximum(lower, clip_lower)
    upper = evaluation_prediction + half_widths
    covered = int(np.sum(evaluation_scores <= threshold))
    relative = half_widths / evaluation_prediction
    return IntervalReport(
        score=score,
        alpha=alpha,
        calibration_n=int(len(calibration_scores)),
        rank=rank,
        feasible=feasible,
        threshold=threshold,
        evaluation_n=int(len(evaluation_scores)),
        covered=covered,
        coverage=covered / len(evaluation_scores),
        half_widths=half_widths,
        lower=lower,
        upper=upper,
        median_half_width=float(np.median(half_widths)),
        median_relative_half_width=float(np.median(relative)),
        mean_relative_half_width=float(np.mean(relative)),
    )


def _log_beta(a: float, b: float) -> float:
    return math.lgamma(a) + math.lgamma(b) - math.lgamma(a + b)


def beta_binomial_pmf(m: int, a: float, b: float) -> np.ndarray:
    """Probability of each covered count 0..m when coverage itself is Beta(a, b) distributed.

    Conditional on the calibration draw, the coverage of a split-conformal interval built from
    the ``rank``-th order statistic is Beta(rank, n + 1 - rank) (Vovk 2012). Counting how many
    of ``m`` exchangeable evaluation points fall inside therefore gives a beta-binomial, not a
    binomial: the extra spread is the calibration draw's own randomness, and ignoring it is what
    makes naive coverage bands too tight to be honest.
    """
    counts = np.arange(m + 1)
    log_pmf = np.array([
        math.lgamma(m + 1)
        - math.lgamma(x + 1)
        - math.lgamma(m - x + 1)
        + _log_beta(x + a, m - x + b)
        - _log_beta(a, b)
        for x in counts
    ])
    pmf = np.exp(log_pmf)
    return pmf / pmf.sum()


def coverage_band(
    *, calibration_n: int, evaluation_n: int, alpha: float, mass: float = 0.95
) -> dict:
    """The equal-tailed finite-sample band an honest empirical coverage should land in.

    This is the bar's operational definition. It is fixed before any result is seen: given the
    calibration size, the evaluation size and the target level, exchangeability alone pins the
    distribution of the observed coverage, and the band is its central ``mass`` interval.
    """
    rank = conformal_rank(calibration_n, alpha)
    if rank > calibration_n:
        raise ValueError("no finite interval exists at this level and calibration size")
    a = float(rank)
    b = float(calibration_n + 1 - rank)
    pmf = beta_binomial_pmf(evaluation_n, a, b)
    cdf = np.cumsum(pmf)
    tail = (1.0 - mass) / 2.0
    low_count = int(np.searchsorted(cdf, tail, side="left"))
    high_count = int(np.searchsorted(cdf, 1.0 - tail, side="left"))
    return {
        "definition": (
            "equal-tailed central interval of BetaBinomial(m, rank, n + 1 - rank), the exact "
            "law of the covered count under exchangeability with an i.i.d. evaluation draw"
        ),
        "mass": mass,
        "calibration_n": calibration_n,
        "evaluation_n": evaluation_n,
        "conformal_rank": rank,
        "beta_a": a,
        "beta_b": b,
        "expected_coverage": round(a / (a + b), 6),
        "coverage_sd": round(
            math.sqrt(a * b / ((a + b) ** 2 * (a + b + 1))), 6
        ),
        "lower_count": low_count,
        "upper_count": high_count,
        "lower_coverage": round(low_count / evaluation_n, 6),
        "upper_coverage": round(high_count / evaluation_n, 6),
    }


def smallest_calibration_size(alpha: float) -> int:
    """Fewest calibration points that admit a finite interval at this level."""
    if not 0.0 < alpha < 1.0:
        raise ValueError("alpha must lie strictly between 0 and 1")
    return int(math.ceil(1.0 / alpha)) - 1


def mondrian_feasibility(group_sizes: dict[str, int], alpha: float) -> dict:
    """Whether a per-group (Mondrian) scheme can hold the level with the groups it has.

    A Mondrian scheme fits one threshold per group, so each group pays the finite-sample cost on
    its own. Below ``smallest_calibration_size`` the only valid interval is infinite, and saying
    so is the useful answer: it names the calibration size the conditional scheme would need.
    """
    minimum = smallest_calibration_size(alpha)
    per_group = {
        name: {
            "calibration_n": size,
            "conformal_rank": conformal_rank(size, alpha) if size >= 1 else None,
            "feasible": size >= minimum,
        }
        for name, size in sorted(group_sizes.items())
    }
    infeasible = sorted(name for name, row in per_group.items() if not row["feasible"])
    return {
        "alpha": alpha,
        "minimum_calibration_size_per_group": minimum,
        "groups": per_group,
        "infeasible_groups": infeasible,
        "feasible": not infeasible,
    }


def conditional_coverage(
    scores: np.ndarray, threshold: float, labels: np.ndarray
) -> dict[str, dict]:
    """Coverage of one marginal threshold, broken out per label. The diagnostic, not a guarantee."""
    scores = np.asarray(scores, dtype=float)
    labels = np.asarray(labels)
    out = {}
    for label in sorted({str(value) for value in labels}):
        selector = labels.astype(str) == label
        covered = int(np.sum(scores[selector] <= threshold))
        total = int(np.sum(selector))
        out[label] = {
            "n": total,
            "covered": covered,
            "coverage": round(covered / total, 6) if total else None,
        }
    return out


def conformal_risk_control(
    losses_by_lambda: dict, alpha: float, *, loss_upper_bound: float = 1.0
) -> dict:
    """Pick the smallest set-size parameter whose risk is controlled (arXiv:2208.02814).

    ``losses_by_lambda`` maps each candidate lambda, in increasing order of set size, to the
    per-calibration-point loss vector. The selection rule is the paper's: the smallest lambda
    with ``(n * mean_loss + B) / (n + 1) <= alpha``, where B bounds the loss. The plus-B term is
    the finite-sample price; dropping it, which is the common shortcut, voids the guarantee.

    The loss must be non-increasing in lambda for the guarantee to hold. That is checked, and a
    violation is reported rather than assumed away.
    """
    lambdas = sorted(losses_by_lambda)
    n = None
    rows = []
    previous = None
    monotone = True
    for value in lambdas:
        losses = np.asarray(losses_by_lambda[value], dtype=float)
        if n is None:
            n = len(losses)
        elif len(losses) != n:
            raise ValueError("every lambda needs the same number of calibration losses")
        risk = float(np.mean(losses))
        if previous is not None and risk > previous + 1e-12:
            monotone = False
        previous = risk
        bounded = (n * risk + loss_upper_bound) / (n + 1)
        rows.append({
            "lambda": value,
            "calibration_risk": round(risk, 6),
            "finite_sample_bound": round(bounded, 6),
            "controls": bool(bounded <= alpha),
        })
    selected = next((row["lambda"] for row in rows if row["controls"]), None)
    return {
        "alpha": alpha,
        "loss_upper_bound": loss_upper_bound,
        "calibration_n": n,
        "risk_is_non_increasing_in_lambda": monotone,
        "grid": rows,
        "selected_lambda": selected,
        "controlled": selected is not None,
    }
