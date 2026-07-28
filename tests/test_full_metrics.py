import numpy as np

from fslab.science.segment import (
    binary_calibration_metrics,
    boundary_fscore,
    diameter_summary,
    full_instance_metrics,
    instance_confidence_calibration,
)


def test_full_instance_metrics_are_exact_for_identical_labels():
    labels = np.zeros((32, 32), dtype=np.int32)
    labels[4:12, 4:12] = 1
    labels[18:28, 17:27] = 2
    metrics = full_instance_metrics(labels, labels, mm_per_px=0.5)
    assert metrics["ap"] == 1.0
    assert metrics["pq"] == 1.0
    assert metrics["boundary_fscore"] == 1.0
    assert metrics["count_error"] == 0
    assert metrics["d32_absolute_error"] == 0.0
    assert metrics["diameter_unit"] == "mm"


def test_boundary_and_calibration_metrics_penalize_bad_predictions():
    truth = np.zeros((16, 16), dtype=np.int32)
    truth[2:8, 2:8] = 1
    shifted = np.zeros_like(truth)
    shifted[8:14, 8:14] = 1
    assert boundary_fscore(shifted, truth, tolerance_px=1)["boundary_fscore"] < 0.2

    probability = np.where(truth > 0, 0.9, 0.1)
    calibration = binary_calibration_metrics(probability, truth > 0)
    assert calibration["brier"] < 0.02
    assert calibration["ece"] < 0.11


def test_empty_diameter_summary_is_explicit():
    summary = diameter_summary(np.zeros((8, 8), dtype=np.int32))
    assert summary == {
        "unit": "px",
        "count": 0,
        "d10": None,
        "d32": None,
        "d50": None,
        "d90": None,
    }


def test_instance_confidence_calibration_uses_iou_match_target():
    truth = np.array([[1, 1, 0, 2, 2]], dtype=np.int32)
    predicted = np.array([[1, 1, 3, 0, 0]], dtype=np.int32)
    result = instance_confidence_calibration(
        predicted,
        truth,
        {1: 0.9, 3: 0.2},
    )
    assert result["n"] == 2
    assert result["brier"] < 0.1
