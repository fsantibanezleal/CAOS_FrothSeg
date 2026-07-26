import numpy as np

from fslab.learning.multitask_models import (
    METHOD_CHANNELS,
    build_model,
    probabilities_to_instances,
    targets,
)


def test_each_multitask_method_has_a_distinct_real_graph():
    parameter_counts = {}
    for method, channels in METHOD_CHANNELS.items():
        model = build_model(method, base_channels=4)
        parameter_counts[method] = sum(parameter.numel() for parameter in model.parameters())
        assert model.head.out_channels == channels
    assert len(set(parameter_counts.values())) == len(parameter_counts)


def test_targets_and_postprocessing_form_instances():
    labels = np.zeros((32, 32), dtype=np.int32)
    labels[4:14, 4:14] = 1
    labels[17:28, 17:28] = 2
    truth = targets(labels, include_centers=True)
    assert truth.shape == (4, 32, 32)
    predicted = probabilities_to_instances(
        truth,
        foreground_threshold=0.5,
        boundary_threshold=0.5,
        marker_threshold=0.1,
        min_distance=2,
    )
    assert predicted.max() >= 2
