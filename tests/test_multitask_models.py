import numpy as np
import pytest

from fslab.learning.multitask_models import (
    METHOD_CHANNELS,
    build_model,
    probabilities_to_instances,
    targets,
)
from fslab.learning.evaluate_ensemble import _combine, _tta_probabilities
from fslab.learning.train_multitask import Config, _augment, _training_config


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


def test_lamellastar_center_target_has_one_peak_per_instance():
    labels = np.zeros((32, 32), dtype=np.int32)
    labels[4:14, 4:14] = 1
    labels[17:28, 17:28] = 2
    center = targets(labels, include_centers=True)[3]

    assert np.count_nonzero(center == center.max()) == 2


def test_center_weight_is_a_bounded_calibration_parameter():
    probabilities = np.zeros((4, 8, 8), dtype=np.float32)
    with pytest.raises(ValueError, match="center_weight"):
        probabilities_to_instances(
            probabilities,
            foreground_threshold=0.5,
            boundary_threshold=0.5,
            marker_threshold=0.1,
            min_distance=2,
            center_weight=1.01,
        )


def test_validation_is_default_and_does_not_change_checkpoint_identity():
    validation = Config(method="lamellastar")
    test = Config(method="lamellastar", evaluation_split="test")

    assert validation.evaluation_split == "validation"
    assert _training_config(validation) == _training_config(test)


def test_later_stopping_epoch_remains_checkpoint_compatible():
    assert _training_config(Config(method="lamellastar", epochs=40)) == _training_config(
        Config(method="lamellastar", epochs=80)
    )


def test_paired_augmentation_is_deterministic_and_preserves_target_values():
    import torch

    images = torch.linspace(0, 1, 2 * 1 * 8 * 8).reshape(2, 1, 8, 8)
    truth = torch.zeros((2, 4, 8, 8))
    truth[:, :, 2:6, 1:5] = 1
    first_images, first_truth = _augment(
        images, truth, rng=np.random.default_rng(20260727)
    )
    second_images, second_truth = _augment(
        images, truth, rng=np.random.default_rng(20260727)
    )
    assert torch.equal(first_images, second_images)
    assert torch.equal(first_truth, second_truth)
    assert set(torch.unique(first_truth).tolist()) == {0.0, 1.0}
    assert first_images.min() >= 0
    assert first_images.max() <= 1


def test_probability_and_logit_ensemble_modes_are_distinct_and_bounded():
    members = [
        np.array([[[[0.1, 0.8]]]], dtype=np.float32),
        np.array([[[[0.4, 0.9]]]], dtype=np.float32),
    ]
    probability_mean = _combine(members, "probability-mean")
    logit_mean = _combine(members, "logit-mean")
    assert np.allclose(probability_mean, [[[[0.25, 0.85]]]])
    assert not np.allclose(probability_mean, logit_mean)
    assert np.all((logit_mean > 0) & (logit_mean < 1))


def test_d4_test_time_augmentation_inverse_aligns_predictions():
    import torch

    class PointwiseModel(torch.nn.Module):
        def forward(self, image):
            return torch.cat((image, image * 2, image * 3, image * 4), dim=1)

    images = torch.linspace(0, 1, 2 * 1 * 8 * 8).reshape(2, 1, 8, 8)
    model = PointwiseModel()
    plain = _tta_probabilities(
        model, images, device=torch.device("cpu"), batch_size=2, tta="none"
    )
    augmented = _tta_probabilities(
        model, images, device=torch.device("cpu"), batch_size=2, tta="d4"
    )
    assert np.allclose(plain, augmented, atol=1e-7)
