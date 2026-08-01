"""Centroid-offset field head for N1, pre-registered as experiment P-5 / A-1.

P-5 (CAOS_MANAGE `plans/frothseg/research-2026-07-31/PLAN-PROPOSAL.md`) specifies:

    A-1, only if A-2 and W-1 justify it: replace the scalar distance head with a
    two-channel centroid offset field (``METHOD_CHANNELS["lamellastar"]`` 4 to 5), derive
    markers from the field's divergence rather than from ``peak_local_max`` on a scalar
    surface, everything else including the calibration grid held fixed.

Channel layout, ``lamellastar_offset``::

    0  foreground
    1  boundary
    2  offset_y   inward, normalized, encoded to [0, 1] with 0.5 meaning zero offset
    3  offset_x   idem
    4  center

WHY THE FIELD POINTS INWARD
---------------------------
The target at pixel ``p`` of instance ``k`` is the vector from ``p`` to the centroid of
``k``, normalized per instance and per axis so its extreme is 1. Inside an instance the
field is smooth and its divergence is uniformly negative (a sink at the centroid). Across a
seam between two touching instances the field flips sign, so the divergence carries a sharp
POSITIVE ridge exactly on the seam, even where the boundary channel is weak. That ridge is
the separation evidence a scalar distance surface does not carry, and it is why the marker
mask below is a divergence threshold rather than a peak search.

WHAT IS HELD FIXED
------------------
Everything the pre-registration says is held fixed is held fixed: the architecture apart
from the output head, the optimizer, the schedule, the loss weights of the foreground,
boundary and center terms, and the 405-combination calibration grid with its exact values
(``foreground_threshold`` 0.4/0.5/0.6, ``boundary_threshold`` 0.35/0.5/0.65,
``marker_threshold`` 0.15/0.25/0.35, ``min_distance`` 1/2/3, ``center_weight``
0/0.25/0.5/0.75/1.0). Each grid axis keeps a monotone effect in the same direction as in
the scalar decode, so the grid is comparable rather than merely reused:

- ``foreground_threshold`` gates the same foreground mask.
- ``boundary_threshold`` removes marker support where the boundary channel is confident.
- ``marker_threshold`` thresholds the marker-support surface, which is the normalized
  convergence blended with the center channel exactly as the scalar decode blends the
  normalized distance with the center channel.
- ``min_distance`` is the minimum separation between marker centroids, exactly the meaning
  ``peak_local_max`` gives it: larger values yield fewer, further-apart markers.
- ``center_weight`` blends the same center channel with the same weights.
"""

from __future__ import annotations

import numpy as np
from scipy import ndimage as ndi
from skimage import segmentation

#: Encoded offsets live in [0, 1] because the trainer applies a sigmoid to every channel;
#: 0.5 is a zero offset. Decoding is o = 2 * (p - 0.5).
OFFSET_ENCODING_CENTER = 0.5

#: Percentile used to normalize the convergence surface into [0, 1] within the frame. The
#: repository's scalar distance target normalizes by its own 99th percentile
#: (`multitask_models.targets`), so the marker-support surface is normalized the same way
#: and the shared `marker_threshold` grid keeps its meaning.
CONVERGENCE_NORMALIZATION_PERCENTILE = 99.0


def targets(labels: np.ndarray) -> np.ndarray:
    """Five-channel target stack for ``lamellastar_offset``.

    Mirrors :func:`fslab.learning.multitask_models.targets` for channels 0, 1 and 4 and
    replaces the scalar distance channel with the two encoded offset channels.
    """
    foreground = labels > 0
    boundary = np.zeros_like(foreground)
    boundary[:, 1:] |= labels[:, 1:] != labels[:, :-1]
    boundary[1:, :] |= labels[1:, :] != labels[:-1, :]
    boundary &= foreground
    boundary = ndi.binary_dilation(boundary, iterations=1) & foreground

    offset_y = np.zeros(labels.shape, dtype=np.float32)
    offset_x = np.zeros(labels.shape, dtype=np.float32)
    center_points = np.zeros(labels.shape, dtype=np.float32)
    for instance_id in np.unique(labels):
        if instance_id <= 0:
            continue
        instance = labels == instance_id
        rows, columns = np.nonzero(instance)
        if rows.size == 0:
            continue
        # Inward offsets: from the pixel toward the centroid.
        delta_y = rows.mean() - rows
        delta_x = columns.mean() - columns
        scale_y = float(np.abs(delta_y).max())
        scale_x = float(np.abs(delta_x).max())
        offset_y[rows, columns] = delta_y / scale_y if scale_y > 0 else 0.0
        offset_x[rows, columns] = delta_x / scale_x if scale_x > 0 else 0.0
        # Same center definition as the scalar head: the deepest interior pixel.
        instance_distance = ndi.distance_transform_edt(instance)
        peak_y, peak_x = np.unravel_index(np.argmax(instance_distance), instance_distance.shape)
        center_points[peak_y, peak_x] = 1.0

    center = ndi.gaussian_filter(center_points, sigma=1.25)
    if center.max() > 0:
        center /= center.max()
    return np.stack([
        foreground.astype(np.float32),
        boundary.astype(np.float32),
        (OFFSET_ENCODING_CENTER * (1.0 + offset_y)).astype(np.float32),
        (OFFSET_ENCODING_CENTER * (1.0 + offset_x)).astype(np.float32),
        center.astype(np.float32),
    ])


def decode_offsets(probabilities: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return the (y, x) offset field in [-1, 1] from the encoded channels."""
    offset_y = 2.0 * (probabilities[2].astype(np.float64) - OFFSET_ENCODING_CENTER)
    offset_x = 2.0 * (probabilities[3].astype(np.float64) - OFFSET_ENCODING_CENTER)
    return offset_y, offset_x


def field_divergence(offset_y: np.ndarray, offset_x: np.ndarray) -> np.ndarray:
    """Divergence of the offset field, central differences on the pixel grid."""
    return np.gradient(offset_y, axis=0) + np.gradient(offset_x, axis=1)


def _normalize(surface: np.ndarray, mask: np.ndarray) -> np.ndarray:
    values = surface[mask]
    if values.size == 0:
        return np.zeros_like(surface)
    scale = float(np.percentile(values, CONVERGENCE_NORMALIZATION_PERCENTILE))
    if scale <= 0:
        return np.zeros_like(surface)
    return np.clip(surface / scale, 0.0, 1.0)


def marker_coordinates(
    probabilities: np.ndarray,
    *,
    foreground_threshold: float,
    boundary_threshold: float,
    marker_threshold: float,
    min_distance: int,
    center_weight: float = 0.5,
) -> tuple[np.ndarray, np.ndarray]:
    """Return ``(foreground mask, marker coordinates)`` derived from the field divergence.

    A marker is the centroid of a connected component of the thresholded marker-support
    surface, not a local maximum of a scalar surface: that is the substitution P-5 asks
    for. The seam ridge in the divergence is what breaks the support surface into one
    component per instance, so the marker positions come from the field, not from a peak
    search. ``min_distance`` then keeps its ``peak_local_max`` meaning as the minimum
    separation between accepted markers, applied greedily in descending support order.
    """
    if not 0.0 <= center_weight <= 1.0:
        raise ValueError("center_weight must be between 0 and 1")
    if min_distance < 1:
        raise ValueError("min_distance must be at least one")
    foreground = probabilities[0] >= foreground_threshold
    boundary = probabilities[1]
    offset_y, offset_x = decode_offsets(probabilities)
    divergence = field_divergence(offset_y, offset_x)
    # Sinks (negative divergence) are instance interiors; the positive ridge is the seam.
    convergence = _normalize(np.clip(-divergence, 0.0, None), foreground)
    center = probabilities[4]
    support = np.asarray(
        (1.0 - center_weight) * convergence + center_weight * center, dtype=np.float64
    )
    support[~foreground] = 0.0
    support[boundary >= boundary_threshold] = 0.0
    mask = support >= marker_threshold
    components, count = ndi.label(mask)
    if count == 0:
        return foreground, np.zeros((0, 2), dtype=np.int64)
    index = np.arange(1, count + 1)
    centroids = np.asarray(ndi.center_of_mass(mask, components, index)).reshape(-1, 2)
    peaks = np.asarray(ndi.maximum(support, components, index)).reshape(-1)
    coordinates = np.rint(centroids).astype(np.int64)
    coordinates[:, 0] = np.clip(coordinates[:, 0], 0, mask.shape[0] - 1)
    coordinates[:, 1] = np.clip(coordinates[:, 1], 0, mask.shape[1] - 1)
    # A centroid can fall outside a crescent-shaped component; move it to a pixel of its
    # own component so the marker never lands inside a neighbour.
    outside = components[coordinates[:, 0], coordinates[:, 1]] != index
    if np.any(outside):
        positions = ndi.maximum_position(support, components, index[outside])
        for slot, position in zip(np.nonzero(outside)[0], np.atleast_2d(positions), strict=True):
            coordinates[slot] = position
    # Greedy Chebyshev suppression on a blocking grid, the same separation rule and the
    # same square footprint peak_local_max applies, at O(n) instead of O(n^2).
    blocked = np.zeros(mask.shape, dtype=bool)
    reach = min_distance - 1
    accepted: list[np.ndarray] = []
    for slot in np.argsort(-peaks, kind="stable"):
        row, column = coordinates[slot]
        if blocked[row, column]:
            continue
        accepted.append(coordinates[slot])
        blocked[
            max(row - reach, 0):row + reach + 1,
            max(column - reach, 0):column + reach + 1,
        ] = True
    if not accepted:
        return foreground, np.zeros((0, 2), dtype=np.int64)
    return foreground, np.asarray(accepted, dtype=np.int64)


def probabilities_to_instances(
    probabilities: np.ndarray,
    *,
    foreground_threshold: float,
    boundary_threshold: float,
    marker_threshold: float,
    min_distance: int,
    center_weight: float = 0.5,
) -> np.ndarray:
    """Instance labels for ``lamellastar_offset``, same signature as the scalar decode.

    The flooding surface substitutes the scalar distance channel with the interior
    evidence the offset field already carries, ``1 - |offset|``, which is 1 at a centroid
    and 0 at an instance extreme. Nothing else about the watershed changes.
    """
    foreground, coordinates = marker_coordinates(
        probabilities,
        foreground_threshold=foreground_threshold,
        boundary_threshold=boundary_threshold,
        marker_threshold=marker_threshold,
        min_distance=min_distance,
        center_weight=center_weight,
    )
    markers = np.zeros(foreground.shape, dtype=np.int32)
    for index, (row, column) in enumerate(coordinates, start=1):
        markers[row, column] = index
    if markers.max() == 0:
        return np.zeros(foreground.shape, dtype=np.int32)
    offset_y, offset_x = decode_offsets(probabilities)
    magnitude = np.clip(np.hypot(offset_y, offset_x), 0.0, 1.0)
    interior = 1.0 - magnitude
    return segmentation.watershed(
        probabilities[1] - interior,
        markers=markers,
        mask=foreground,
        watershed_line=True,
    ).astype(np.int32)
