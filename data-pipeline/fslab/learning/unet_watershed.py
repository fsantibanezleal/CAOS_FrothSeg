"""Compact boundary/foreground U-Net and deterministic instance post-processing."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage as ndi
from skimage import feature, segmentation


def build_model(base_channels: int = 12):
    import torch
    from torch import nn

    def block(cin: int, cout: int) -> nn.Sequential:
        return nn.Sequential(
            nn.Conv2d(cin, cout, 3, padding=1),
            nn.BatchNorm2d(cout),
            nn.SiLU(),
            nn.Conv2d(cout, cout, 3, padding=1),
            nn.BatchNorm2d(cout),
            nn.SiLU(),
        )

    class BoundaryUNet(nn.Module):
        def __init__(self) -> None:
            super().__init__()
            c = base_channels
            self.e1 = block(1, c)
            self.e2 = block(c, c * 2)
            self.bridge = block(c * 2, c * 4)
            self.pool = nn.MaxPool2d(2)
            self.up2 = nn.ConvTranspose2d(c * 4, c * 2, 2, stride=2)
            self.d2 = block(c * 4, c * 2)
            self.up1 = nn.ConvTranspose2d(c * 2, c, 2, stride=2)
            self.d1 = block(c * 2, c)
            self.head = nn.Conv2d(c, 2, 1)

        def forward(self, image):
            e1 = self.e1(image)
            e2 = self.e2(self.pool(e1))
            bridge = self.bridge(self.pool(e2))
            d2 = self.d2(torch.cat((self.up2(bridge), e2), dim=1))
            d1 = self.d1(torch.cat((self.up1(d2), e1), dim=1))
            return self.head(d1)

    return BoundaryUNet()


def load_npz_weights(path, *, base_channels: int = 12):
    """Load the committed, framework-neutral inference checkpoint."""
    import torch

    model = build_model(base_channels)
    archive = np.load(path)
    state = {name: torch.from_numpy(archive[name]) for name in archive.files}
    model.load_state_dict(state, strict=True)
    return model


def targets(labels: np.ndarray) -> np.ndarray:
    """Return [foreground, boundary] targets from an instance map."""
    foreground = labels > 0
    boundary = np.zeros_like(foreground)
    boundary[:, 1:] |= labels[:, 1:] != labels[:, :-1]
    boundary[1:, :] |= labels[1:, :] != labels[:-1, :]
    boundary &= foreground
    boundary = ndi.binary_dilation(boundary, iterations=1) & foreground
    return np.stack((foreground, boundary)).astype(np.float32)


@dataclass(frozen=True)
class Prediction:
    labels: np.ndarray
    foreground_probability: np.ndarray
    boundary_probability: np.ndarray


def probabilities_to_instances(
    foreground_probability: np.ndarray,
    boundary_probability: np.ndarray,
    *,
    foreground_threshold: float = 0.5,
    boundary_threshold: float = 0.45,
    min_distance: int = 3,
) -> np.ndarray:
    foreground = foreground_probability >= foreground_threshold
    distance = ndi.distance_transform_edt(foreground)
    seed_surface = distance * (1.0 - np.clip(boundary_probability, 0.0, 1.0))
    seed_surface[boundary_probability >= boundary_threshold] = 0.0
    coords = feature.peak_local_max(
        seed_surface, min_distance=min_distance, labels=foreground, exclude_border=False,
    )
    markers = np.zeros(foreground.shape, dtype=np.int32)
    for index, (y, x) in enumerate(coords, start=1):
        markers[y, x] = index
    if markers.max() == 0:
        return np.zeros(foreground.shape, dtype=np.int32)
    return segmentation.watershed(
        -seed_surface, markers=markers, mask=foreground,
        watershed_line=True,
    ).astype(np.int32)


def predict_probabilities(model, image: np.ndarray, *, device: str = "cpu") -> np.ndarray:
    import torch

    model.eval()
    tensor = torch.from_numpy(image.astype(np.float32))[None, None].to(device)
    with torch.inference_mode():
        return torch.sigmoid(model(tensor))[0].cpu().numpy()


def predict(
    model,
    image: np.ndarray,
    *,
    device: str = "cpu",
    foreground_threshold: float = 0.5,
    boundary_threshold: float = 0.45,
    min_distance: int = 3,
) -> Prediction:
    probabilities = predict_probabilities(model, image, device=device)
    labels = probabilities_to_instances(
        probabilities[0],
        probabilities[1],
        foreground_threshold=foreground_threshold,
        boundary_threshold=boundary_threshold,
        min_distance=min_distance,
    )
    return Prediction(labels, probabilities[0], probabilities[1])


def predict_at_training_scale(
    model,
    image: np.ndarray,
    *,
    training_size: int,
    device: str = "cpu",
    foreground_threshold: float = 0.5,
    boundary_threshold: float = 0.45,
    min_distance: int = 3,
) -> Prediction:
    """Preserve the physical receptive-field scale used during training."""
    from skimage.transform import resize

    original_shape = image.shape
    scaled = resize(
        image, (training_size, training_size),
        order=1, preserve_range=True, anti_aliasing=True,
    ).astype(np.float32)
    small = predict_probabilities(model, scaled, device=device)
    probabilities = np.stack([
        resize(channel, original_shape, order=1, preserve_range=True, anti_aliasing=False)
        for channel in small
    ]).astype(np.float32)
    scale = max(original_shape) / training_size
    labels = probabilities_to_instances(
        probabilities[0], probabilities[1],
        foreground_threshold=foreground_threshold,
        boundary_threshold=boundary_threshold,
        min_distance=max(1, int(round(min_distance * scale))),
    )
    return Prediction(labels, probabilities[0], probabilities[1])
