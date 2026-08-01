"""Contract of the centroid-offset head (pre-registered experiment P-5 / A-1).

The head only earns its place if the field it regresses actually carries the separation
evidence the scalar distance channel does not. These tests pin that mechanism (a negative
divergence inside an instance, a positive ridge exactly on a seam between two touching
instances) rather than only the tensor shapes, and they pin that registering the sibling
method left every existing method's path untouched.
"""

import numpy as np
import pytest

from fslab.learning import offset_head
from fslab.learning.multitask_models import (
    METHOD_CHANNELS,
    build_model,
    probabilities_to_instances,
)
from fslab.learning.multitask_models import targets as scalar_targets
from fslab.learning.train_multitask import method_decode, method_targets


def _two_touching_squares() -> np.ndarray:
    labels = np.zeros((40, 40), dtype=np.int32)
    labels[8:32, 6:20] = 1
    labels[8:32, 20:34] = 2
    return labels


def test_offset_targets_have_five_channels_and_a_centered_encoding():
    labels = _two_touching_squares()
    truth = offset_head.targets(labels)

    assert truth.shape == (METHOD_CHANNELS["lamellastar_offset"], 40, 40)
    assert set(np.unique(truth[0])) == {0.0, 1.0}
    background = labels == 0
    # A zero offset encodes to 0.5, so the background is not confusable with an extreme.
    assert np.allclose(truth[2][background], offset_head.OFFSET_ENCODING_CENTER)
    assert np.allclose(truth[3][background], offset_head.OFFSET_ENCODING_CENTER)
    assert truth[2].min() >= 0.0 and truth[2].max() <= 1.0
    assert truth[3].min() >= 0.0 and truth[3].max() <= 1.0


def test_offset_field_points_inward_so_its_divergence_marks_the_seam():
    labels = _two_touching_squares()
    truth = offset_head.targets(labels).astype(np.float64)
    offset_y, offset_x = offset_head.decode_offsets(truth)
    divergence = offset_head.field_divergence(offset_y, offset_x)

    # Interior of the left instance, away from the shared edge at column 20.
    interior = np.zeros(labels.shape, dtype=bool)
    interior[14:26, 9:17] = True
    assert divergence[interior].max() < 0.0

    # The seam column carries a positive ridge: the two fields point at each other.
    seam = divergence[14:26, 19:21]
    assert seam.max() > 0.0
    assert seam.max() > abs(divergence[interior].mean())


def test_divergence_markers_separate_two_touching_instances():
    labels = _two_touching_squares()
    truth = offset_head.targets(labels).astype(np.float64)

    predicted = offset_head.probabilities_to_instances(
        truth,
        foreground_threshold=0.5,
        boundary_threshold=0.65,
        marker_threshold=0.15,
        min_distance=2,
        center_weight=0.0,
    )
    assert len(np.unique(predicted[predicted > 0])) == 2


def test_min_distance_never_admits_markers_closer_than_itself():
    labels = _two_touching_squares()
    truth = offset_head.targets(labels).astype(np.float64)

    for min_distance in (1, 2, 3):
        _, coordinates = offset_head.marker_coordinates(
            truth,
            foreground_threshold=0.5,
            boundary_threshold=0.65,
            marker_threshold=0.15,
            min_distance=min_distance,
            center_weight=0.5,
        )
        for first in range(len(coordinates)):
            for second in range(first + 1, len(coordinates)):
                separation = np.abs(coordinates[first] - coordinates[second]).max()
                assert separation >= min_distance


def test_marker_coordinates_always_land_inside_the_foreground():
    labels = np.zeros((40, 40), dtype=np.int32)
    # A crescent, whose centroid falls outside the instance itself.
    grid_y, grid_x = np.ogrid[:40, :40]
    outer = (grid_y - 20) ** 2 + (grid_x - 20) ** 2 <= 15**2
    inner = (grid_y - 20) ** 2 + (grid_x - 26) ** 2 <= 11**2
    labels[outer & ~inner] = 1
    truth = offset_head.targets(labels).astype(np.float64)

    foreground, coordinates = offset_head.marker_coordinates(
        truth,
        foreground_threshold=0.5,
        boundary_threshold=0.65,
        marker_threshold=0.15,
        min_distance=1,
        center_weight=0.0,
    )
    assert len(coordinates) >= 1
    assert foreground[coordinates[:, 0], coordinates[:, 1]].all()


def test_center_weight_and_min_distance_stay_bounded_calibration_parameters():
    probabilities = np.full((5, 8, 8), 0.5, dtype=np.float64)
    with pytest.raises(ValueError, match="center_weight"):
        offset_head.marker_coordinates(
            probabilities,
            foreground_threshold=0.5,
            boundary_threshold=0.5,
            marker_threshold=0.1,
            min_distance=2,
            center_weight=1.01,
        )
    with pytest.raises(ValueError, match="min_distance"):
        offset_head.marker_coordinates(
            probabilities,
            foreground_threshold=0.5,
            boundary_threshold=0.5,
            marker_threshold=0.1,
            min_distance=0,
        )


def test_an_empty_marker_surface_returns_an_empty_label_map():
    probabilities = np.zeros((5, 16, 16), dtype=np.float64)
    predicted = offset_head.probabilities_to_instances(
        probabilities,
        foreground_threshold=0.5,
        boundary_threshold=0.5,
        marker_threshold=0.1,
        min_distance=2,
    )
    assert predicted.max() == 0


def test_the_offset_head_is_a_sibling_method_and_leaves_the_others_untouched():
    labels = _two_touching_squares()

    assert METHOD_CHANNELS["lamellastar"] == 4
    assert METHOD_CHANNELS["lamellastar_offset"] == 5
    assert build_model("lamellastar_offset", base_channels=4).head.out_channels == 5

    assert method_decode("lamellastar") is probabilities_to_instances
    assert method_decode("gc_fsegnet") is probabilities_to_instances
    assert method_decode("lamellastar_offset") is offset_head.probabilities_to_instances

    assert np.array_equal(
        method_targets("lamellastar")(labels), scalar_targets(labels, include_centers=True)
    )
    assert np.array_equal(
        method_targets("gc_fsegnet")(labels), scalar_targets(labels, include_centers=False)
    )
    assert np.array_equal(method_targets("lamellastar_offset")(labels), offset_head.targets(labels))
