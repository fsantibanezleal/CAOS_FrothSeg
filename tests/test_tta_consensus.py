import numpy as np
import pytest

from fslab.learning.multitask_models import (
    marker_coordinates,
    probabilities_to_instances,
    targets,
)
from fslab.learning.tta_consensus import (
    D4_VIEWS,
    apply_d4,
    cluster_instances,
    consensus_labels_by_k,
    fuse_clusters,
    invert_d4,
    view_label_maps,
)


def _two_squares(size: int = 32) -> np.ndarray:
    labels = np.zeros((size, size), dtype=np.int32)
    labels[4:14, 4:14] = 1
    labels[17:28, 17:28] = 2
    return labels


def test_d4_has_eight_distinct_views():
    assert len(D4_VIEWS) == 8
    assert len(set(D4_VIEWS)) == 8


def test_every_d4_transform_inverts_exactly():
    array = np.arange(6 * 6).reshape(6, 6)
    for turns, reflect in D4_VIEWS:
        assert np.array_equal(invert_d4(apply_d4(array, turns, reflect), turns, reflect), array)


def test_unanimous_views_survive_every_support_threshold():
    labels = _two_squares()
    fused = consensus_labels_by_k([labels.copy() for _ in D4_VIEWS], k_values=(1, 4, 8))
    for k, result in fused.items():
        assert result.max() == 2, k
        assert np.count_nonzero(result) == np.count_nonzero(labels), k


def test_an_instance_seen_by_too_few_views_is_dropped():
    labels = _two_squares()
    dissenting = labels.copy()
    dissenting[dissenting == 2] = 0
    maps = [labels.copy()] * 5 + [dissenting.copy()] * 3
    fused = consensus_labels_by_k(maps, k_values=(5, 6))
    assert fused[5].max() == 2
    assert fused[6].max() == 1


def test_fused_instances_are_disjoint_and_connected():
    from scipy import ndimage as ndi

    rng = np.random.default_rng(20260801)
    labels = _two_squares()
    maps = []
    for _ in D4_VIEWS:
        jittered = np.zeros_like(labels)
        shift = rng.integers(-1, 2, size=2)
        jittered[
            max(0, shift[0]) : labels.shape[0] + min(0, shift[0]),
            max(0, shift[1]) : labels.shape[1] + min(0, shift[1]),
        ] = labels[
            max(0, -shift[0]) : labels.shape[0] + min(0, -shift[0]),
            max(0, -shift[1]) : labels.shape[1] + min(0, -shift[1]),
        ]
        maps.append(jittered)
    fused = consensus_labels_by_k(maps, k_values=(4,))[4]
    for instance_id in np.unique(fused):
        if instance_id <= 0:
            continue
        _, count = ndi.label(fused == instance_id)
        assert count == 1


def test_support_threshold_is_bounded():
    clusters = cluster_instances([_two_squares() for _ in D4_VIEWS])
    with pytest.raises(ValueError, match="k must lie"):
        fuse_clusters(clusters, (32, 32), k=0)
    with pytest.raises(ValueError, match="k must lie"):
        fuse_clusters(clusters, (32, 32), k=9)


def test_cluster_support_never_exceeds_the_number_of_views():
    clusters = cluster_instances([_two_squares() for _ in D4_VIEWS])
    assert clusters
    assert all(1 <= cluster["support"] <= len(D4_VIEWS) for cluster in clusters)


def test_view_label_maps_requires_one_field_per_view():
    truth = targets(_two_squares(), include_centers=True)
    with pytest.raises(ValueError, match="expected 8 views"):
        view_label_maps(
            [truth, truth],
            foreground_threshold=0.5,
            boundary_threshold=0.5,
            marker_threshold=0.1,
            min_distance=2,
            center_weight=0.5,
        )


def test_per_view_decode_returns_maps_in_the_original_frame():
    truth = targets(_two_squares(), include_centers=True)
    decode = {
        "foreground_threshold": 0.5,
        "boundary_threshold": 0.5,
        "marker_threshold": 0.1,
        "min_distance": 2,
        "center_weight": 0.5,
    }
    fields = [apply_d4(truth, turns, reflect) for turns, reflect in D4_VIEWS]
    maps = view_label_maps(fields, **decode)
    reference = probabilities_to_instances(truth, **decode)
    for label_map in maps:
        assert label_map.shape == reference.shape
        assert np.array_equal(label_map > 0, reference > 0)


def test_marker_count_matches_the_decode_that_uses_it():
    truth = targets(_two_squares(), include_centers=True)
    decode = {
        "foreground_threshold": 0.5,
        "boundary_threshold": 0.5,
        "marker_threshold": 0.1,
        "min_distance": 2,
        "center_weight": 0.5,
    }
    _, coords = marker_coordinates(truth, **decode)
    labels = probabilities_to_instances(truth, **decode)
    assert len(coords) == labels.max()
