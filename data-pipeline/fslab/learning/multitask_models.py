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
    # Pre-registered experiment P-5 / A-1: the scalar distance head replaced by a
    # two-channel centroid-offset field, so 4 - 1 + 2 = 5. Registered as a sibling method
    # rather than as a redefinition of "lamellastar" so that the published four-channel
    # checkpoints, ONNX exports and artifacts keep loading unchanged. Targets and decode
    # live in fslab.learning.offset_head.
    "lamellastar_offset": 5,
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

    class LamellaStarOffset(LamellaStar):
        """LamellaStar with the scalar distance head replaced by a centroid-offset field.

        Identical encoder, bridge, gates and decoder; only the 1x1 output head widens from
        four channels to five. Channel order is
        ``(foreground, boundary, offset_y, offset_x, center)``: the distance channel is
        gone and the two offset channels take its place. Pre-registered as P-5 / A-1.
        """

        def __init__(self) -> None:
            super().__init__()
            self.head = nn.Conv2d(base_channels, METHOD_CHANNELS["lamellastar_offset"], 1)

    constructors = {
        "deep_marker_watershed": DeepMarkerWatershed,
        "gc_fsegnet": GlobalContextFSegNet,
        "lamellastar": LamellaStar,
        "lamellastar_offset": LamellaStarOffset,
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
        center_points = np.zeros_like(distance, dtype=np.float32)
        for instance_id in np.unique(labels):
            if instance_id <= 0:
                continue
            instance = labels == instance_id
            if not np.any(instance):
                continue
            instance_distance = ndi.distance_transform_edt(instance)
            y, x = np.unravel_index(np.argmax(instance_distance), instance_distance.shape)
            center_points[y, x] = 1.0
        center = ndi.gaussian_filter(center_points, sigma=1.25)
        if center.max() > 0:
            center /= center.max()
        channels.append(center.astype(np.float32))
    return np.stack(channels)


@dataclass(frozen=True)
class MultiTaskPrediction:
    labels: np.ndarray
    probabilities: np.ndarray


def marker_coordinates(
    probabilities: np.ndarray,
    *,
    foreground_threshold: float,
    boundary_threshold: float,
    marker_threshold: float,
    min_distance: int,
    center_weight: float = 0.5,
) -> tuple[np.ndarray, np.ndarray]:
    """Return ``(foreground mask, marker coordinates)`` for the watershed decode.

    Split out of :func:`probabilities_to_instances` so a diagnostic can count the markers a
    given probability field yields without re-deriving the seed surface. Both functions share
    this one implementation, so the count a diagnostic reports is by construction the count
    the decode used.
    """
    if not 0.0 <= center_weight <= 1.0:
        raise ValueError("center_weight must be between 0 and 1")
    foreground = probabilities[0] >= foreground_threshold
    boundary = probabilities[1]
    seed_surface = probabilities[2] * (1.0 - boundary)
    if probabilities.shape[0] > 3:
        center = probabilities[3]
        seed_surface = (1.0 - center_weight) * seed_surface + center_weight * center
    seed_surface[~foreground] = 0.0
    seed_surface[boundary >= boundary_threshold] = 0.0
    coords = feature.peak_local_max(
        seed_surface,
        min_distance=min_distance,
        threshold_abs=marker_threshold,
        labels=foreground,
        exclude_border=False,
    )
    return foreground, coords


def probabilities_to_instances(
    probabilities: np.ndarray,
    *,
    foreground_threshold: float,
    boundary_threshold: float,
    marker_threshold: float,
    min_distance: int,
    center_weight: float = 0.5,
) -> np.ndarray:
    foreground, coords = marker_coordinates(
        probabilities,
        foreground_threshold=foreground_threshold,
        boundary_threshold=boundary_threshold,
        marker_threshold=marker_threshold,
        min_distance=min_distance,
        center_weight=center_weight,
    )
    boundary = probabilities[1]
    learned_distance = probabilities[2]
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
