"""Unit tests for the distribution-free interval machinery used by study P-3.

The guarantee is the product here, so the tests check the guarantee's arithmetic rather than
the study's numbers: the order-statistic rank, the infeasible-by-sample-size case, the exact
coverage law, and the finite-sample term in conformal risk control.
"""

from __future__ import annotations

import math

import numpy as np
import pytest

from fslab.learning.conformal import (
    absolute_residual,
    beta_binomial_pmf,
    conditional_coverage,
    conformal_quantile,
    conformal_rank,
    conformal_risk_control,
    coverage_band,
    fit_and_apply,
    mondrian_feasibility,
    relative_residual,
    smallest_calibration_size,
)


def test_conformal_rank_is_the_ceiling_of_n_plus_one_times_level():
    assert conformal_rank(64, 0.10) == 59
    assert conformal_rank(9, 0.10) == 9
    assert conformal_rank(4, 0.10) == 5


def test_rank_above_n_reports_an_infinite_threshold_instead_of_the_maximum():
    scores = np.array([1.0, 2.0, 3.0, 4.0])
    threshold, rank, feasible = conformal_quantile(scores, 0.10)
    assert rank == 5
    assert feasible is False
    assert math.isinf(threshold)


def test_smallest_calibration_size_matches_the_feasibility_boundary():
    assert smallest_calibration_size(0.10) == 9
    assert conformal_quantile(np.arange(9.0), 0.10)[2] is True
    assert conformal_quantile(np.arange(8.0), 0.10)[2] is False


def test_quantile_is_the_kth_order_statistic():
    scores = np.array([5.0, 1.0, 3.0, 2.0, 4.0, 6.0, 7.0, 8.0, 9.0])
    threshold, rank, feasible = conformal_quantile(scores, 0.10)
    assert (rank, feasible) == (9, True)
    assert threshold == 9.0


def test_absolute_and_relative_scores_agree_on_which_points_are_covered():
    prediction = np.array([10.0, 20.0])
    truth = np.array([11.0, 22.0])
    assert absolute_residual(prediction, truth).tolist() == [1.0, 2.0]
    assert relative_residual(prediction, truth).tolist() == [0.1, 0.1]


def test_relative_score_refuses_a_zero_point_estimate():
    with pytest.raises(ValueError):
        relative_residual(np.array([0.0]), np.array([1.0]))


def test_split_conformal_covers_at_least_the_nominal_rate_on_exchangeable_draws():
    rng = np.random.default_rng(20260801)
    covered = []
    for _ in range(400):
        truth = rng.normal(20.0, 3.0, 128)
        prediction = truth + rng.normal(0.0, 1.0, 128)
        report = fit_and_apply(
            score="absolute",
            calibration_prediction=prediction[:64],
            calibration_truth=truth[:64],
            evaluation_prediction=prediction[64:],
            evaluation_truth=truth[64:],
            alpha=0.10,
        )
        covered.append(report.coverage)
    assert 0.88 < float(np.mean(covered)) < 0.94


def test_clipping_the_lower_bound_at_zero_never_removes_a_covered_point():
    report = fit_and_apply(
        score="absolute",
        calibration_prediction=np.arange(1.0, 65.0),
        calibration_truth=np.arange(1.0, 65.0) + 0.5,
        evaluation_prediction=np.array([0.2, 5.0]),
        evaluation_truth=np.array([0.0, 5.4]),
        alpha=0.10,
    )
    assert report.lower.min() >= 0.0
    assert report.covered == 2


def test_beta_binomial_pmf_is_normalized_and_centred_on_the_conformal_level():
    pmf = beta_binomial_pmf(64, 59.0, 6.0)
    assert pmf.shape == (65,)
    assert pytest.approx(float(pmf.sum()), abs=1e-12) == 1.0
    mean = float(np.dot(np.arange(65), pmf))
    assert pytest.approx(mean / 64.0, abs=1e-9) == 59.0 / 65.0


def test_coverage_band_brackets_the_nominal_level_and_is_wider_than_a_binomial():
    band = coverage_band(calibration_n=64, evaluation_n=64, alpha=0.10)
    assert band["conformal_rank"] == 59
    assert band["lower_coverage"] < 0.90 < band["upper_coverage"]
    binomial_sd = math.sqrt(0.9 * 0.1 / 64)
    assert band["coverage_sd"] > 0.0
    assert (band["upper_coverage"] - band["lower_coverage"]) > 4 * binomial_sd


def test_mondrian_at_four_points_per_group_cannot_hold_ninety_percent():
    report = mondrian_feasibility({name: 4 for name in ("a", "b", "c")}, 0.10)
    assert report["minimum_calibration_size_per_group"] == 9
    assert report["feasible"] is False
    assert report["infeasible_groups"] == ["a", "b", "c"]


def test_conditional_coverage_splits_by_label():
    scores = np.array([0.1, 0.2, 5.0, 0.3])
    labels = np.array(["x", "x", "y", "y"])
    out = conditional_coverage(scores, 1.0, labels)
    assert out["x"]["coverage"] == 1.0
    assert out["y"]["coverage"] == 0.5


def test_conformal_risk_control_pays_the_finite_sample_term():
    n = 32
    losses = {
        1: np.full(n, 0.30),
        2: np.full(n, 0.09),
        3: np.zeros(n),
    }
    report = conformal_risk_control(losses, 0.10)
    # lambda=2 has risk 0.09 but (32*0.09 + 1) / 33 = 0.1179 > 0.10, so it does NOT control.
    assert report["grid"][1]["controls"] is False
    assert report["selected_lambda"] == 3
    assert report["controlled"] is True
    assert report["risk_is_non_increasing_in_lambda"] is True


def test_conformal_risk_control_flags_a_non_monotone_loss():
    losses = {1: np.zeros(16), 2: np.full(16, 0.5)}
    report = conformal_risk_control(losses, 0.10)
    assert report["risk_is_non_increasing_in_lambda"] is False
