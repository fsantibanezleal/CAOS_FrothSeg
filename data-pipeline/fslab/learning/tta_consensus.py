"""Marker-space D4 test-time-augmentation consensus for the multitask decode.

Field-averaged D4 TTA averages the probability FIELDS and decodes once. It was measured three
times on this pipeline and lost three times. This module implements the other operation, the
one pre-registered as P-4 in CAOS_MANAGE
``plans/frothseg/research-2026-07-31/PLAN-PROPOSAL.md``: decode instances independently inside
each of the eight D4 frames, invert the transform on the LABEL maps, and fuse in marker space
by instance-level voting.

The fusion is deliberately parameter-poor. Exactly one quantity, the support threshold ``k``,
is tuned, and the pre-registration fixes that it is tuned on the calibration split only.
Everything else in :data:`CONSENSUS_CONSTANTS` is fixed here in code, was fixed before any
result was seen, and is reported next to every number this module produces.
"""

from __future__ import annotations

import numpy as np
from scipy import ndimage as ndi

from .multitask_models import probabilities_to_instances

#: The eight elements of D4 as ``(quarter turns, mirror)``, in the order
#: :func:`fslab.learning.evaluate_ensemble._tta_probabilities` uses. Keeping the order
#: identical means the two lanes see the same eight views, so a difference between them is a
#: difference in the FUSION and nothing else.
D4_VIEWS: tuple[tuple[int, bool], ...] = tuple(
    (turns, reflect) for turns in range(4) for reflect in (False, True)
)

#: Fixed implementation constants of the fusion. Not tuned, not selected on any split.
CONSENSUS_CONSTANTS = {
    "match_radius_fraction_of_equivalent_radius": 0.5,
    "match_radius_floor_px": 2.0,
    "one_instance_per_view_per_cluster": True,
    "cluster_seed_order": "descending area, then view index, then label id",
    "mask_rule": "pixel kept when its member-mask vote count reaches ceil(support / 2)",
    "conflict_rule": (
        "higher vote count wins; ties go to the larger support, then to the earlier "
        "(larger-area) cluster"
    ),
    "post_rule": "largest connected component per fused instance",
}


def apply_d4(array: np.ndarray, turns: int, reflect: bool) -> np.ndarray:
    """Map an array into a D4 frame, on the trailing two axes."""
    out = np.rot90(array, turns, axes=(-2, -1))
    if reflect:
        out = out[..., ::-1]
    return np.ascontiguousarray(out)


def invert_d4(array: np.ndarray, turns: int, reflect: bool) -> np.ndarray:
    """Map an array back out of a D4 frame. Exact inverse of :func:`apply_d4`."""
    out = array
    if reflect:
        out = out[..., ::-1]
    out = np.rot90(out, -turns, axes=(-2, -1))
    return np.ascontiguousarray(out)


def view_label_maps(
    probabilities_by_view: list[np.ndarray],
    *,
    foreground_threshold: float,
    boundary_threshold: float,
    marker_threshold: float,
    min_distance: int,
    center_weight: float,
) -> list[np.ndarray]:
    """Decode each D4 view in its OWN frame, then invert the transform on the label map.

    ``probabilities_by_view[i]`` must already be expressed in the frame of ``D4_VIEWS[i]``,
    which is what the network actually saw. Decoding before inverting is the whole point of
    the experiment: no field is ever averaged.
    """
    if len(probabilities_by_view) != len(D4_VIEWS):
        raise ValueError(f"expected {len(D4_VIEWS)} views, got {len(probabilities_by_view)}")
    maps = []
    for probabilities, (turns, reflect) in zip(probabilities_by_view, D4_VIEWS, strict=True):
        labels = probabilities_to_instances(
            probabilities,
            foreground_threshold=foreground_threshold,
            boundary_threshold=boundary_threshold,
            marker_threshold=marker_threshold,
            min_distance=min_distance,
            center_weight=center_weight,
        )
        maps.append(invert_d4(labels, turns, reflect).astype(np.int32))
    return maps


def _instances(label_map: np.ndarray) -> list[dict]:
    ids = np.unique(label_map)
    ids = ids[ids > 0]
    if ids.size == 0:
        return []
    objects = ndi.find_objects(label_map)
    out = []
    for instance_id in ids:
        window = objects[int(instance_id) - 1]
        if window is None:
            continue
        local = label_map[window] == instance_id
        area = int(local.sum())
        if area == 0:
            continue
        ys, xs = np.nonzero(local)
        centroid = (
            float(ys.mean() + window[0].start),
            float(xs.mean() + window[1].start),
        )
        out.append({
            "id": int(instance_id),
            "area": area,
            "centroid": centroid,
            "window": window,
            "local": local,
        })
    return out


def cluster_instances(label_maps: list[np.ndarray]) -> list[dict]:
    """Cluster instance centroids across the views into one cluster per candidate bubble.

    Greedy, deterministic, and seeded by descending area so that a large bubble claims its own
    views before a small neighbour can. A cluster takes at most one instance per view: the
    nearest unclaimed centroid inside a scale-aware radius. ``support`` is the number of views
    that agreed, so it lies in 1..8 and is the quantity ``k`` thresholds.
    """
    per_view = [_instances(label_map) for label_map in label_maps]
    centroids = [
        np.asarray([item["centroid"] for item in view], dtype=np.float64).reshape(-1, 2)
        for view in per_view
    ]
    claimed = [np.zeros(len(view), dtype=bool) for view in per_view]

    order = sorted(
        (-view[index]["area"], view_index, view[index]["id"], index)
        for view_index, view in enumerate(per_view)
        for index in range(len(view))
    )
    radius_fraction = CONSENSUS_CONSTANTS["match_radius_fraction_of_equivalent_radius"]
    radius_floor = CONSENSUS_CONSTANTS["match_radius_floor_px"]

    clusters = []
    for _, seed_view, _, seed_index in order:
        if claimed[seed_view][seed_index]:
            continue
        seed = per_view[seed_view][seed_index]
        claimed[seed_view][seed_index] = True
        members = [(seed_view, seed_index)]
        equivalent_radius = float(np.sqrt(seed["area"] / np.pi))
        radius = max(radius_floor, radius_fraction * equivalent_radius)
        seed_centroid = np.asarray(seed["centroid"], dtype=np.float64)
        for view_index in range(len(per_view)):
            if view_index == seed_view or len(per_view[view_index]) == 0:
                continue
            free = ~claimed[view_index]
            if not free.any():
                continue
            distances = np.linalg.norm(centroids[view_index] - seed_centroid, axis=1)
            distances = np.where(free, distances, np.inf)
            best = int(np.argmin(distances))
            if distances[best] <= radius:
                claimed[view_index][best] = True
                members.append((view_index, best))
        clusters.append({
            "support": len(members),
            "area": seed["area"],
            "members": [per_view[v][i] for v, i in members],
        })
    return clusters


def fuse_clusters(clusters: list[dict], shape: tuple[int, int], *, k: int) -> np.ndarray:
    """Keep clusters supported by at least ``k`` views and resolve masks by pixel majority."""
    if not 1 <= k <= len(D4_VIEWS):
        raise ValueError(f"k must lie in 1..{len(D4_VIEWS)}")
    kept = [cluster for cluster in clusters if cluster["support"] >= k]
    labels = np.zeros(shape, dtype=np.int32)
    best_vote = np.zeros(shape, dtype=np.int16)
    best_support = np.zeros(shape, dtype=np.int16)
    next_id = 0
    for cluster in kept:
        support = cluster["support"]
        votes = np.zeros(shape, dtype=np.int16)
        for member in cluster["members"]:
            window = member["window"]
            votes[window][member["local"]] += 1
        required = (support + 1) // 2
        candidate = votes >= required
        if not candidate.any():
            continue
        better = candidate & (
            (votes > best_vote) | ((votes == best_vote) & (support > best_support))
        )
        if not better.any():
            continue
        next_id += 1
        labels[better] = next_id
        best_vote[better] = votes[better]
        best_support[better] = support
    return _largest_component_per_label(labels)


def _largest_component_per_label(labels: np.ndarray) -> np.ndarray:
    """Reduce each fused instance to its largest connected component and renumber densely.

    The watershed decode this lane is compared against always returns connected instances, so
    leaving a fused instance in two pieces would compare two different object conventions.
    """
    out = np.zeros_like(labels)
    next_id = 0
    for instance_id in np.unique(labels):
        if instance_id <= 0:
            continue
        mask = labels == instance_id
        components, count = ndi.label(mask)
        if count == 0:
            continue
        if count > 1:
            sizes = ndi.sum_labels(mask, components, index=np.arange(1, count + 1))
            mask = components == (int(np.argmax(sizes)) + 1)
        next_id += 1
        out[mask] = next_id
    return out


def consensus_labels_by_k(
    label_maps: list[np.ndarray], *, k_values: tuple[int, ...]
) -> dict[int, np.ndarray]:
    """Cluster once, then materialize the fused label map for each ``k``."""
    clusters = cluster_instances(label_maps)
    shape = label_maps[0].shape
    return {k: fuse_clusters(clusters, shape, k=k) for k in k_values}
