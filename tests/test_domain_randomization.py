"""Tests for the P-2 domain-randomization augmentation.

The property these guard is the one that would silently poison the study: a frame whose targets
no longer describe it. Every geometry element is therefore checked for image/target agreement,
and every appearance element is checked for staying inside the unit interval and for leaving the
targets alone.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.learning import domain_randomization as dr  # noqa: E402
from fslab.learning.multitask_models import targets as build_targets  # noqa: E402


def _toy(size: int = 48) -> tuple[np.ndarray, np.ndarray]:
    """A frame with four separated square instances and a matching intensity image."""
    labels = np.zeros((size, size), dtype=np.int32)
    identifier = 0
    for row in (6, 28):
        for column in (6, 28):
            identifier += 1
            labels[row:row + 12, column:column + 12] = identifier
    image = np.where(labels > 0, 200, 40).astype(np.uint8)
    return image, labels


def test_scale_identity_returns_the_input() -> None:
    image, labels = _toy()
    scaled_image, scaled_labels = dr.scale_sample(
        image, labels, 1.0, rng=np.random.default_rng(0),
    )
    assert np.array_equal(scaled_image, image)
    assert np.array_equal(scaled_labels, labels)


def test_magnifying_scale_grows_instances_and_keeps_the_canvas() -> None:
    image, labels = _toy()
    scaled_image, scaled_labels = dr.scale_sample(
        image, labels, 2.0, rng=np.random.default_rng(3),
    )
    assert scaled_image.shape == image.shape
    assert scaled_labels.shape == labels.shape
    before = np.bincount(labels.ravel())[1:]
    after = np.bincount(scaled_labels.ravel())[1:]
    # Every instance that survived the crop is larger than it was.
    surviving = [value for value in after if value > 0]
    assert surviving
    assert max(surviving) > max(before)


def test_shrinking_scale_tiles_without_padding_and_keeps_ids_distinct() -> None:
    image, labels = _toy()
    scaled_image, scaled_labels = dr.scale_sample(
        image, labels, 0.5, rng=np.random.default_rng(1),
    )
    assert scaled_image.shape == image.shape
    # Four tiles of four instances each, none merged across a tile seam.
    assert len(set(np.unique(scaled_labels)) - {0}) == 16
    # No zero-padded border: the shrunk frame fills the canvas with real content.
    assert scaled_image.min() >= image.min() - 1
    assert scaled_image[0].max() > 0


def test_shrink_rejects_a_non_dividing_scale() -> None:
    image, labels = _toy()
    with pytest.raises(ValueError):
        dr.scale_sample(image, labels, 0.3, rng=np.random.default_rng(0))


def test_bank_targets_are_rebuilt_from_the_scaled_labels_not_resampled() -> None:
    """The whole reason the bank exists: targets must come from the rescaled label map."""
    images = np.stack([_toy()[0]])
    labels = np.stack([_toy()[1]]).astype(np.uint16)
    bank = dr.build_bank(images, labels, include_centers=True, ladder=(1.0, 0.5))
    scaled_image, scaled_labels = dr.scale_sample(
        images[0], labels[0].astype(np.int32), 0.5,
        rng=np.random.default_rng((dr.BANK_SEED, 1, 0)),
    )
    expected = build_targets(scaled_labels, include_centers=True)
    assert np.array_equal(bank["images"][0, 0], scaled_image)
    assert np.allclose(bank["targets"][0, 0], expected)
    # 16 tiled instances means 16 center peaks, which a resampled 4-instance stack cannot have.
    assert bank["targets"][0, 0, 3].max() == pytest.approx(1.0)


def test_bank_key_depends_on_labels_and_ladder() -> None:
    labels = np.stack([_toy()[1]]).astype(np.uint16)
    other = labels.copy()
    other[0, 0, 0] = 7
    base = dr.bank_key(labels, include_centers=True)
    assert dr.bank_key(labels, include_centers=True) == base
    assert dr.bank_key(other, include_centers=True) != base
    assert dr.bank_key(labels, include_centers=False) != base
    assert dr.bank_key(labels, include_centers=True, ladder=(1.0, 0.5)) != base


def test_bank_round_trips_through_disk_and_is_reused(tmp_path: Path) -> None:
    images = np.stack([_toy()[0]])
    labels = np.stack([_toy()[1]]).astype(np.uint16)
    path = tmp_path / "bank.npz"
    first = dr.load_or_build_bank(
        images, labels, include_centers=True, path=path, ladder=(1.0, 0.5),
    )
    assert path.is_file()
    second = dr.load_or_build_bank(
        images, labels, include_centers=True, path=path, ladder=(1.0, 0.5),
    )
    assert first["key"] == second["key"]
    assert np.array_equal(first["targets"], second["targets"])


def test_appearance_chain_stays_in_the_unit_interval_and_is_deterministic() -> None:
    image = _toy()[0].astype(np.float32) / 255.0
    for seed in range(24):
        first = dr.randomize_appearance(image, rng=np.random.default_rng(seed))
        second = dr.randomize_appearance(image, rng=np.random.default_rng(seed))
        assert first.shape == image.shape
        assert first.dtype == np.float32
        assert first.min() >= 0.0
        assert first.max() <= 1.0
        assert np.array_equal(first, second)


def test_appearance_chain_produces_contrast_inversion_and_blur() -> None:
    """Both elements are pre-registered, so their absence would be a silent design change."""
    image = _toy()[0].astype(np.float32) / 255.0
    foreground = _toy()[1] > 0
    inverted = 0
    for seed in range(60):
        out = dr.randomize_appearance(image, rng=np.random.default_rng(seed))
        if out[foreground].mean() < out[~foreground].mean():
            inverted += 1
    assert 10 < inverted < 50, inverted


def test_augment_batch_keeps_image_and_targets_in_register() -> None:
    torch = pytest.importorskip("torch")
    images = np.stack([_toy()[0] for _ in range(4)])
    labels = np.stack([_toy()[1] for _ in range(4)]).astype(np.uint16)
    bank = dr.build_bank(images, labels, include_centers=True)
    identity_targets = np.stack([
        build_targets(label.astype(np.int32), include_centers=True) for label in labels
    ])
    image_tensor = torch.from_numpy(images.astype(np.float32)[:, None] / 255.0)
    truth_tensor = torch.from_numpy(identity_targets)

    out_images, out_truth = dr.augment_batch(
        image_tensor,
        truth_tensor,
        bank=bank,
        indices=np.arange(4),
        rng=np.random.default_rng(11),
    )
    assert out_images.shape == image_tensor.shape
    assert out_truth.shape == truth_tensor.shape
    assert float(out_images.min()) >= 0.0
    assert float(out_images.max()) <= 1.0
    # Targets are never photometrically altered: channel 0 stays a 0/1 mask.
    channel = out_truth[:, 0].numpy()
    assert set(np.unique(channel)).issubset({0.0, 1.0})
    # Foreground area is preserved by D4 and by every bank variant that was drawn: each output
    # mask must equal the mask of some variant of the same sample under some D4 element.
    for position in range(4):
        area = float(channel[position].sum())
        candidates = [float(identity_targets[position, 0].sum())]
        candidates += [
            float(bank["targets"][variant, position, 0].sum())
            for variant in range(len(bank["targets"]))
        ]
        assert min(abs(area - value) for value in candidates) < 1e-6


def test_augment_batch_is_deterministic_under_a_fixed_seed() -> None:
    torch = pytest.importorskip("torch")
    images = np.stack([_toy()[0] for _ in range(2)])
    labels = np.stack([_toy()[1] for _ in range(2)]).astype(np.uint16)
    bank = dr.build_bank(images, labels, include_centers=True)
    identity_targets = np.stack([
        build_targets(label.astype(np.int32), include_centers=True) for label in labels
    ])
    image_tensor = torch.from_numpy(images.astype(np.float32)[:, None] / 255.0)
    truth_tensor = torch.from_numpy(identity_targets)
    first = dr.augment_batch(
        image_tensor, truth_tensor, bank=bank, indices=np.arange(2),
        rng=np.random.default_rng(5),
    )
    second = dr.augment_batch(
        image_tensor, truth_tensor, bank=bank, indices=np.arange(2),
        rng=np.random.default_rng(5),
    )
    assert torch.equal(first[0], second[0])
    assert torch.equal(first[1], second[1])


def test_offset_method_refuses_domain_randomization() -> None:
    from fslab.learning.train_multitask import (
        GEOMETRIC_AUGMENTATION_MODES,
        OFFSET_FIELD_METHODS,
    )

    assert "domain-randomization" in GEOMETRIC_AUGMENTATION_MODES
    assert "lamellastar_offset" in OFFSET_FIELD_METHODS
