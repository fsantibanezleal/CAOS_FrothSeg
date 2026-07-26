"""Distinct learned instance-segmentation architectures for L2, L3, and N1."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage as ndi
from skimage import feature, segmentation

METHOD_CHANNELS = {
    "deep_marker_watershed": 3,
    "gc_fsegnet": 3,
    "lamellastar": 4,
}


def _conv_block(nn, cin: int, cout: int, *, dilation: int = 1):
    return nn.Sequential(
        nn.Conv2d(cin, cout, 3, padding=dilation, dilation=dilation, bias=False),
        nn.BatchNorm2d(cout),
        nn.SiLU(),
        nn.Conv2d(cout, cout, 3, padding=1, bias=False),
        nn.BatchNorm2d(cout),
        nn.SiLU(),
    )


def build_model(method: str, base_channels: int = 16):
    import torch
    from torch import nn

    if method not in METHOD_CHANNELS:
        raise ValueError(f"unsupported learned method: {method}")

    class DeepMarkerWatershed(nn.Module):
        """U-Net whose distance head supplies learned watershed markers."""

        def __init__(self) -> None:
            super().__init__()
            c = base_channels
            self.e1 = _conv_block(nn, 1, c)
            self.e2 = _conv_block(nn, c, c * 2)
            self.e3 = _conv_block(nn, c * 2, c * 4)
            self.pool = nn.MaxPool2d(2)
            self.up2 = nn.ConvTranspose2d(c * 4, c * 2, 2, 2)
            self.d2 = _conv_block(nn, c * 4, c * 2)
            self.up1 = nn.ConvTranspose2d(c * 2, c, 2, 2)
            self.d1 = _conv_block(nn, c * 2, c)
            self.head = nn.Conv2d(c, 3, 1)

        def forward(self, image):
            e1 = self.e1(image)
            e2 = self.e2(self.pool(e1))
            e3 = self.e3(self.pool(e2))
            d2 = self.d2(torch.cat((self.up2(e3), e2), dim=1))
            return self.head(self.d1(torch.cat((self.up1(d2), e1), dim=1)))

    class GlobalContextFSegNet(nn.Module):
        """Local encoder plus dilated global-context bottleneck and SE fusion."""

        def __init__(self) -> None:
            super().__init__()
            c = base_channels
            self.local1 = _conv_block(nn, 1, c)
            self.local2 = _conv_block(nn, c, c * 2)
            self.pool = nn.MaxPool2d(2)
            self.context2 = _conv_block(nn, c * 2, c * 4, dilation=2)
            self.context4 = _conv_block(nn, c * 4, c * 4, dilation=4)
            self.squeeze = nn.Sequential(
                nn.AdaptiveAvgPool2d(1),
                nn.Conv2d(c * 4, c, 1),
                nn.SiLU(),
                nn.Conv2d(c, c * 4, 1),
                nn.Sigmoid(),
            )
            self.up2 = nn.ConvTranspose2d(c * 4, c * 2, 2, 2)
            self.fuse2 = _conv_block(nn, c * 4, c * 2)
            self.up1 = nn.ConvTranspose2d(c * 2, c, 2, 2)
            self.fuse1 = _conv_block(nn, c * 2, c)
            self.head = nn.Conv2d(c, 3, 1)

        def forward(self, image):
            local1 = self.local1(image)
            local2 = self.local2(self.pool(local1))
            context = self.context4(self.context2(self.pool(local2)))
            context = context * self.squeeze(context)
            decoded2 = self.fuse2(torch.cat((self.up2(context), local2), dim=1))
            decoded1 = self.fuse1(torch.cat((self.up1(decoded2), local1), dim=1))
            return self.head(decoded1)

    class LamellaStar(nn.Module):
        """Lamella-aware gated U-Net with explicit center evidence."""

        def __init__(self) -> None:
            super().__init__()
            c = base_channels
            self.e1 = _conv_block(nn, 1, c)
            self.e2 = _conv_block(nn, c, c * 2)
            self.bridge = nn.Sequential(
                _conv_block(nn, c * 2, c * 4, dilation=2),
                _conv_block(nn, c * 4, c * 4, dilation=3),
            )
            self.pool = nn.MaxPool2d(2)
            self.up2 = nn.ConvTranspose2d(c * 4, c * 2, 2, 2)
            self.gate2 = nn.Sequential(nn.Conv2d(c * 4, c * 2, 1), nn.Sigmoid())
            self.d2 = _conv_block(nn, c * 4, c * 2)
            self.up1 = nn.ConvTranspose2d(c * 2, c, 2, 2)
            self.gate1 = nn.Sequential(nn.Conv2d(c * 2, c, 1), nn.Sigmoid())
            self.d1 = _conv_block(nn, c * 2, c)
            self.head = nn.Conv2d(c, 4, 1)

        def forward(self, image):
            e1 = self.e1(image)
            e2 = self.e2(self.pool(e1))
            bridge = self.bridge(self.pool(e2))
            up2 = self.up2(bridge)
            gated2 = e2 * self.gate2(torch.cat((up2, e2), dim=1))
            d2 = self.d2(torch.cat((up2, gated2), dim=1))
            up1 = self.up1(d2)
            gated1 = e1 * self.gate1(torch.cat((up1, e1), dim=1))
            return self.head(self.d1(torch.cat((up1, gated1), dim=1)))

    constructors = {
        "deep_marker_watershed": DeepMarkerWatershed,
        "gc_fsegnet": GlobalContextFSegNet,
        "lamellastar": LamellaStar,
    }
    return constructors[method]()


def targets(labels: np.ndarray, *, include_centers: bool) -> np.ndarray:
    foreground = labels > 0
    boundary = np.zeros_like(foreground)
    boundary[:, 1:] |= labels[:, 1:] != labels[:, :-1]
    boundary[1:, :] |= labels[1:, :] != labels[:-1, :]
    boundary &= foreground
    boundary = ndi.binary_dilation(boundary, iterations=1) & foreground
    interiors = foreground & ~boundary
    distance = ndi.distance_transform_edt(interiors).astype(np.float32)
    scale = float(np.percentile(distance[distance > 0], 99)) if np.any(distance > 0) else 1.0
    distance = np.clip(distance / max(scale, 1.0), 0.0, 1.0)
    channels = [foreground.astype(np.float32), boundary.astype(np.float32), distance]
    if include_centers:
        maxima = (distance == ndi.maximum_filter(distance, size=5)) & (distance > 0.25)
        center = ndi.gaussian_filter(maxima.astype(np.float32), sigma=1.0)
        if center.max() > 0:
            center /= center.max()
        channels.append(center.astype(np.float32))
    return np.stack(channels)


@dataclass(frozen=True)
class MultiTaskPrediction:
    labels: np.ndarray
    probabilities: np.ndarray


def probabilities_to_instances(
    probabilities: np.ndarray,
    *,
    foreground_threshold: float,
    boundary_threshold: float,
    marker_threshold: float,
    min_distance: int,
) -> np.ndarray:
    foreground = probabilities[0] >= foreground_threshold
    boundary = probabilities[1]
    learned_distance = probabilities[2]
    seed_surface = learned_distance * (1.0 - boundary)
    if probabilities.shape[0] > 3:
        seed_surface *= 0.35 + 0.65 * probabilities[3]
    seed_surface[~foreground] = 0.0
    seed_surface[boundary >= boundary_threshold] = 0.0
    coords = feature.peak_local_max(
        seed_surface,
        min_distance=min_distance,
        threshold_abs=marker_threshold,
        labels=foreground,
        exclude_border=False,
    )
    markers = np.zeros(foreground.shape, dtype=np.int32)
    for index, (y, x) in enumerate(coords, start=1):
        markers[y, x] = index
    if markers.max() == 0:
        return np.zeros(foreground.shape, dtype=np.int32)
    return segmentation.watershed(
        boundary - learned_distance,
        markers=markers,
        mask=foreground,
        watershed_line=True,
    ).astype(np.int32)
