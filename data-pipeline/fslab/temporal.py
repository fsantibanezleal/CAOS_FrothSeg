"""Temporal association and consistency metrics for froth instance sequences.

This module also holds the constants that define the sequence lane, because both the bake
(:mod:`fslab.temporal_bake`) and the publisher (:mod:`fslab.showcase`) need them and neither may
import the other.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.optimize import linear_sum_assignment

#: The canonical sequences. Each isolates a different way identity breaks over time: nominal
#: transport, dense fine bubbles, moving specular highlights, fast advection, and topological
#: change through bursting and coalescence.
SEQUENCE_IDS: tuple[str, ...] = (
    "poly-normal",
    "fine-froth",
    "glare-storm",
    "motion-fast",
    "bursting",
)

FRAMES = 8

#: Association threshold for the framewise lane.
IOU_ASSOCIATION_THRESHOLD = 0.25

#: A method with no temporal model: it segments each frame independently and identities are
#: assigned afterwards. Identity scores measure mask stability, not a tracker the method owns.
FRAMEWISE_MODE = "framewise_segmentation_with_iou_identity_association"
FRAMEWISE_PROTOCOL = (
    "independent per-frame inference, followed by greedy IoU identity association"
)

#: A method that carries its own memory across frames and is prompted once. It is handed the
#: instance cohort on frame 0 and only has to keep it, so its identity metrics are NOT comparable
#: to the framewise lane and must never be ranked against it.
NATIVE_VIDEO_MODE = "native_prompted_video_propagation"
NATIVE_VIDEO_PROTOCOL = "first-frame ground-truth mask prompts; forward propagation"


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
    false_positive_instances: int
    false_negative_instances: int
    id_switches: int
    id_switch_rate: float
    mean_frame_coverage: float
    id_precision: float
    id_recall: float
    idf1: float
    detection_accuracy: float
    association_accuracy: float
    hota: float
    track_fragmentations: int
    event_true_positives: int
    event_false_positives: int
    event_false_negatives: int
    # None where the sequence contains no events at all: not applicable, never a perfect score.
    event_precision: float | None
    event_recall: float | None
    event_f1: float | None
    flow_epe_px: float | None


def _presence_events(frames: list[np.ndarray]) -> list[tuple[int, str]]:
    """Return frame/type events; identities are deliberately not conflated across trackers."""
    events: list[tuple[int, str]] = []
    previous = set(int(value) for value in np.unique(frames[0]) if value > 0)
    for frame_index, frame in enumerate(frames[1:], start=1):
        current = set(int(value) for value in np.unique(frame) if value > 0)
        events.extend((frame_index, "birth") for _ in current - previous)
        events.extend((frame_index, "disappearance") for _ in previous - current)
        previous = current
    return events


def identity_events(frames: list[np.ndarray]) -> list[dict[str, int | str]]:
    """Return auditable birth/disappearance events with persistent instance ids."""
    if not frames:
        return []
    events: list[dict[str, int | str]] = []
    previous = set(int(value) for value in np.unique(frames[0]) if value > 0)
    for frame_index, frame in enumerate(frames[1:], start=1):
        current = set(int(value) for value in np.unique(frame) if value > 0)
        events.extend(
            {
                "frame_index": frame_index,
                "type": "birth",
                "instance_id": instance_id,
            }
            for instance_id in sorted(current - previous)
        )
        events.extend(
            {
                "frame_index": frame_index,
                "type": "disappearance",
                "instance_id": instance_id,
            }
            for instance_id in sorted(previous - current)
        )
        previous = current
    return events


def _event_counts(
    predicted: list[np.ndarray],
    truth: list[np.ndarray],
) -> tuple[int, int, int]:
    from collections import Counter

    predicted_events = Counter(_presence_events(predicted))
    truth_events = Counter(_presence_events(truth))
    true_positives = sum(
        min(predicted_events[key], truth_events[key])
        for key in predicted_events.keys() | truth_events.keys()
    )
    return (
        true_positives,
        sum(predicted_events.values()) - true_positives,
        sum(truth_events.values()) - true_positives,
    )


def _centroid(frame: np.ndarray, instance_id: int) -> np.ndarray:
    coordinates = np.argwhere(frame == instance_id)
    return coordinates.mean(axis=0)


def _flow_epe(
    predicted: list[np.ndarray],
    truth: list[np.ndarray],
    frame_assignments: list[dict[int, int]],
) -> float | None:
    errors: list[float] = []
    for frame_index in range(1, len(truth)):
        previous = frame_assignments[frame_index - 1]
        current = frame_assignments[frame_index]
        for truth_id in previous.keys() & current.keys():
            previous_predicted_id = previous[truth_id]
            current_predicted_id = current[truth_id]
            if previous_predicted_id != current_predicted_id:
                continue
            truth_flow = (
                _centroid(truth[frame_index], truth_id)
                - _centroid(truth[frame_index - 1], truth_id)
            )
            predicted_flow = (
                _centroid(predicted[frame_index], current_predicted_id)
                - _centroid(predicted[frame_index - 1], previous_predicted_id)
            )
            errors.append(float(np.linalg.norm(predicted_flow - truth_flow)))
    return float(np.mean(errors)) if errors else None


def temporal_metrics(predicted: list[np.ndarray], truth: list[np.ndarray]) -> TemporalMetrics:
    if len(predicted) != len(truth) or not predicted:
        raise ValueError("predicted and truth must contain the same non-zero number of frames")
    previous_assignment: dict[int, int] = {}
    switches = 0
    matched = 0
    false_positives = 0
    false_negatives = 0
    coverage = []
    frame_assignments: list[dict[int, int]] = []
    truth_presence: dict[int, int] = {}
    predicted_presence: dict[int, int] = {}
    pair_counts: dict[tuple[int, int], int] = {}
    matched_presence_by_truth: dict[int, list[bool]] = {}
    for predicted_frame, truth_frame in zip(predicted, truth):
        truth_ids, predicted_ids, iou = _overlap(truth_frame, predicted_frame)
        for truth_id in truth_ids:
            value = int(truth_id)
            truth_presence[value] = truth_presence.get(value, 0) + 1
            matched_presence_by_truth.setdefault(value, [])
        for predicted_id in predicted_ids:
            value = int(predicted_id)
            predicted_presence[value] = predicted_presence.get(value, 0) + 1
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
                    pair = (truth_id, predicted_id)
                    pair_counts[pair] = pair_counts.get(pair, 0) + 1
        false_positives += len(predicted_ids) - len(assignment)
        false_negatives += len(truth_ids) - len(assignment)
        for truth_id in matched_presence_by_truth:
            matched_presence_by_truth[truth_id].append(truth_id in assignment)
        coverage.append(len(assignment) / max(len(truth_ids), 1))
        frame_assignments.append(assignment)
        previous_assignment = assignment

    truth_track_ids = sorted(truth_presence)
    predicted_track_ids = sorted(predicted_presence)
    identity_matrix = np.zeros((len(truth_track_ids), len(predicted_track_ids)), dtype=np.int64)
    truth_index = {value: index for index, value in enumerate(truth_track_ids)}
    predicted_index = {value: index for index, value in enumerate(predicted_track_ids)}
    for (truth_id, predicted_id), count in pair_counts.items():
        identity_matrix[truth_index[truth_id], predicted_index[predicted_id]] = count
    identity_true_positives = 0
    if identity_matrix.size:
        rows, columns = linear_sum_assignment(-identity_matrix)
        identity_true_positives = int(identity_matrix[rows, columns].sum())
    total_truth_detections = sum(truth_presence.values())
    total_predicted_detections = sum(predicted_presence.values())
    identity_false_negatives = total_truth_detections - identity_true_positives
    identity_false_positives = total_predicted_detections - identity_true_positives
    id_precision = identity_true_positives / max(
        identity_true_positives + identity_false_positives, 1,
    )
    id_recall = identity_true_positives / max(
        identity_true_positives + identity_false_negatives, 1,
    )
    idf1 = 2 * identity_true_positives / max(
        2 * identity_true_positives + identity_false_positives + identity_false_negatives,
        1,
    )
    detection_accuracy = matched / max(matched + false_positives + false_negatives, 1)
    association_sum = 0.0
    for (truth_id, predicted_id), count in pair_counts.items():
        denominator = truth_presence[truth_id] + predicted_presence[predicted_id] - count
        association_sum += count * count / max(denominator, 1)
    association_accuracy = association_sum / max(matched, 1)
    hota = float(np.sqrt(detection_accuracy * association_accuracy))
    fragmentations = 0
    for presence in matched_presence_by_truth.values():
        seen = False
        missing_after_seen = False
        for is_matched in presence:
            if is_matched:
                if seen and missing_after_seen:
                    fragmentations += 1
                seen = True
                missing_after_seen = False
            elif seen:
                missing_after_seen = True
    event_tp, event_fp, event_fn = _event_counts(predicted, truth)
    # No events of any kind is NOT a perfect score. Returning 1.0 put "1.000" in the same column
    # where every other method publishes a measured precision, so L7, which is prompted with the
    # exact first-frame masks and predicts no births or disappearances, read as flawless event
    # detection on a sequence where nothing was detected. None means "not applicable" and forces
    # every consumer to say so rather than average it in.
    no_events = event_tp == 0 and event_fp == 0 and event_fn == 0
    event_precision = None if no_events else event_tp / max(event_tp + event_fp, 1)
    event_recall = None if no_events else event_tp / max(event_tp + event_fn, 1)
    event_f1 = None if no_events else 2 * event_tp / max(
        2 * event_tp + event_fp + event_fn, 1,
    )
    return TemporalMetrics(
        frames=len(truth),
        matched_gt_instances=matched,
        false_positive_instances=false_positives,
        false_negative_instances=false_negatives,
        id_switches=switches,
        id_switch_rate=switches / max(matched, 1),
        mean_frame_coverage=float(np.mean(coverage)),
        id_precision=float(id_precision),
        id_recall=float(id_recall),
        idf1=float(idf1),
        detection_accuracy=float(detection_accuracy),
        association_accuracy=float(association_accuracy),
        hota=hota,
        track_fragmentations=fragmentations,
        event_true_positives=event_tp,
        event_false_positives=event_fp,
        event_false_negatives=event_fn,
        event_precision=None if event_precision is None else float(event_precision),
        event_recall=None if event_recall is None else float(event_recall),
        event_f1=None if event_f1 is None else float(event_f1),
        flow_epe_px=_flow_epe(predicted, truth, frame_assignments),
    )
