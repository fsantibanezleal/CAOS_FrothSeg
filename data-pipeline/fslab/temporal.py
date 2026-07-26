"""Temporal association and consistency metrics for froth instance sequences."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.optimize import linear_sum_assignment


def _overlap(previous: np.ndarray, current: np.ndarray):
    previous_ids = np.unique(previous[previous > 0])
    current_ids = np.unique(current[current > 0])
    if not len(previous_ids) or not len(current_ids):
        return previous_ids, current_ids, np.zeros((len(previous_ids), len(current_ids)))
    previous_index = {value: index for index, value in enumerate(previous_ids)}
    current_index = {value: index for index, value in enumerate(current_ids)}
    intersection = np.zeros((len(previous_ids), len(current_ids)), dtype=np.int64)
    valid = (previous > 0) & (current > 0)
    for left, right in zip(previous[valid], current[valid]):
        intersection[previous_index[left], current_index[right]] += 1
    previous_area = np.asarray([(previous == value).sum() for value in previous_ids])
    current_area = np.asarray([(current == value).sum() for value in current_ids])
    union = previous_area[:, None] + current_area[None, :] - intersection
    return previous_ids, current_ids, intersection / np.maximum(union, 1)


def track_by_iou(frames: list[np.ndarray], *, threshold: float = 0.25) -> list[np.ndarray]:
    """Associate frame-local labels into persistent ids with Hungarian IoU matching."""
    if not frames:
        return []
    tracked = [frames[0].astype(np.int32, copy=True)]
    next_id = int(tracked[0].max()) + 1
    for current in frames[1:]:
        previous = tracked[-1]
        previous_ids, current_ids, iou = _overlap(previous, current)
        mapping: dict[int, int] = {}
        if iou.size:
            rows, columns = linear_sum_assignment(-iou)
            for row, column in zip(rows, columns):
                if iou[row, column] >= threshold:
                    mapping[int(current_ids[column])] = int(previous_ids[row])
        result = np.zeros(current.shape, dtype=np.int32)
        for current_id in current_ids:
            persistent_id = mapping.get(int(current_id))
            if persistent_id is None:
                persistent_id = next_id
                next_id += 1
            result[current == current_id] = persistent_id
        tracked.append(result)
    return tracked


@dataclass(frozen=True)
class TemporalMetrics:
    frames: int
    matched_gt_instances: int
    id_switches: int
    id_switch_rate: float
    mean_frame_coverage: float


def temporal_metrics(predicted: list[np.ndarray], truth: list[np.ndarray]) -> TemporalMetrics:
    if len(predicted) != len(truth) or not predicted:
        raise ValueError("predicted and truth must contain the same non-zero number of frames")
    previous_assignment: dict[int, int] = {}
    switches = 0
    matched = 0
    coverage = []
    for predicted_frame, truth_frame in zip(predicted, truth):
        truth_ids, predicted_ids, iou = _overlap(truth_frame, predicted_frame)
        assignment: dict[int, int] = {}
        if iou.size:
            rows, columns = linear_sum_assignment(-iou)
            for row, column in zip(rows, columns):
                if iou[row, column] >= 0.25:
                    truth_id = int(truth_ids[row])
                    predicted_id = int(predicted_ids[column])
                    assignment[truth_id] = predicted_id
                    if truth_id in previous_assignment and previous_assignment[truth_id] != predicted_id:
                        switches += 1
                    matched += 1
        coverage.append(len(assignment) / max(len(truth_ids), 1))
        previous_assignment = assignment
    return TemporalMetrics(
        frames=len(truth),
        matched_gt_instances=matched,
        id_switches=switches,
        id_switch_rate=switches / max(matched, 1),
        mean_frame_coverage=float(np.mean(coverage)),
    )
