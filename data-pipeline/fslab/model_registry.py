"""Authoritative FrothSeg method registry.

A row is advertising metadata only until ``state == "accepted"``. Release
validation requires an accepted method to point at executable inference,
evaluation evidence, documentation, and (for learned models) a real checkpoint.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal

Tier = Literal["classical", "domain-sota", "foundation", "frontier"]
Lane = Literal["offline", "offline+live-candidate", "offline+live"]
State = Literal["partial", "planned", "accepted"]


@dataclass(frozen=True)
class MethodSpec:
    id: str
    slug: str
    name: str
    tier: Tier
    lane: Lane
    engine: str
    provenance: str
    license: str
    learned: bool
    checkpoint_required: bool
    state: State
    docs_path: str


METHODS: tuple[MethodSpec, ...] = (
    MethodSpec("C1", "otsu_cc", "Otsu + connected components", "classical", "offline+live",
               "scikit-image/SciPy", "Otsu 1979, DOI 10.1109/TSMC.1979.4310076", "BSD-3-Clause",
               False, False, "accepted", "docs/methods/classical.md"),
    MethodSpec("C2", "watershed_immersion", "Gradient immersion watershed", "classical", "offline",
               "scikit-image", "Vincent and Soille 1991, DOI 10.1109/34.87344", "BSD-3-Clause",
               False, False, "accepted", "docs/methods/classical.md"),
    # Until 2026-08-01 this row cited Sadr-Kazemi and Cilliers for its markers while flooding the negated
    # distance transform, which is C4's surface and not the one that source publishes. The engine now
    # floods the negated image, so the citation covers the whole method and not only half of it
    # (verification/phase1-adoption.json).
    MethodSpec("C3", "watershed_hmax", "Marker-controlled watershed", "classical", "offline+live",
               "scikit-image",
               "markers and negated-intensity flooding surface: Sadr-Kazemi and Cilliers 1997, "
               "DOI 10.1016/S0892-6875(97)00094-0; "
               "marker-controlled flooding: Meyer 1994, DOI 10.1016/0165-1684(94)90060-4",
               "BSD-3-Clause",
               False, False, "accepted", "docs/methods/classical.md"),
    MethodSpec("C4", "watershed_dt", "Distance-transform watershed", "classical", "offline+live",
               "SciPy/scikit-image", "Meyer 1994; exact EDT via SciPy", "BSD-3-Clause",
               False, False, "accepted", "docs/methods/classical.md"),
    MethodSpec("C5", "watershed_hmin", "H-minima watershed", "classical", "offline",
               "scikit-image", "Soille 2004, DOI 10.1007/978-3-662-05088-0", "BSD-3-Clause",
               False, False, "accepted", "docs/methods/classical.md"),
    MethodSpec("C6", "slic_merge", "SLIC + RAG merge", "classical", "offline",
               "scikit-image", "Achanta et al. 2012, DOI 10.1109/TPAMI.2012.120", "BSD-3-Clause",
               False, False, "accepted", "docs/methods/classical.md"),
    # This row was called "Lamella-valley constrained watershed" until 2026-07-31, when a Phase 0 honesty
    # pass renamed it to "dark-seam detector" because the engine ran no watershed: it subtracted the
    # black-top-hat seam from the foreground and labelled the enclosed caps with scipy.ndimage.label.
    # On 2026-08-01 the mismatch was resolved from the other side. The engine now IS a constrained
    # watershed (C7_MODE = "watershed"): the cleaned caps are markers and they flood the black-top-hat
    # response until they meet on the seam ridge, so the name is restored and Meyer 1994 is now a real
    # provenance for this row rather than an aspirational one. Adoption evidence, including the honest
    # cost that d32 relative error got worse: verification/phase1-adoption.json.
    # Still no OpenCV. The watershed primitive is the pinned scikit-image one C3, C4 and C5 already use.
    MethodSpec("C7", "valley_edge", "Lamella-valley constrained watershed", "classical", "offline",
               "scikit-image/SciPy",
               "domain valley/ridge baseline, exact citation gated; constrained flooding: Meyer 1994, "
               "DOI 10.1016/0165-1684(94)90060-4",
               "BSD-3-Clause",
               False, False, "accepted", "docs/methods/classical.md"),
    MethodSpec("L1", "unet_watershed", "Boundary/distance U-Net + watershed", "domain-sota",
               "offline+live-candidate", "PyTorch/ONNX Runtime",
               "Ronneberger et al. 2015, DOI 10.1007/978-3-319-24574-4_28", "BSD-3-Clause/MIT",
               True, True, "accepted", "docs/frameworks/07_unet-watershed/README.md"),
    MethodSpec("L2", "deep_marker_watershed", "Deep-marker watershed", "domain-sota", "offline",
               "PyTorch", "Chemical Engineering Research and Design 2024, DOI 10.1016/j.cherd.2024.07.041",
               "clean-room in-repo implementation: MIT", True, True, "accepted",
               "docs/frameworks/08_deep-marker-watershed/README.md"),
    MethodSpec("L3", "gc_fsegnet", "GC-FSegNet", "domain-sota", "offline", "PyTorch",
               "Minerals 2025, DOI 10.3390/min15121301", "clean-room in-repo implementation: MIT",
               True, True, "accepted", "docs/frameworks/09_gc-fsegnet/README.md"),
    MethodSpec("L4", "stardist_2d", "StarDist 2D", "domain-sota", "offline+live-candidate",
               "official stardist", "Schmidt et al. 2018, DOI 10.1007/978-3-030-00934-2_30", "BSD-3-Clause",
               True, True, "accepted", "docs/frameworks/10_stardist/README.md"),
    # BSD-3-Clause is correct and is NOT to be "corrected" to GPL-3.0. MouseLand/cellpose ships the
    # BSD 3-Clause text in LICENSE and the GitHub API reports spdx_id BSD-3-Clause; only the README's
    # shields.io badge carries the stale alt-text "Licence: GPL v3". Evidence and the CC-BY-NC
    # training-data caveat: ATTRIBUTION.md, "Upstream licence provenance, L5 Cellpose-SAM".
    MethodSpec("L5", "cellpose_sam", "Cellpose-SAM", "foundation", "offline", "official cellpose",
               "Pachitariu et al. 2025, DOI 10.1101/2025.04.28.651001",
               "BSD-3-Clause; pretrained checkpoint provenance recorded", True, True, "accepted",
               "docs/frameworks/11_cellpose-sam/README.md"),
    MethodSpec("L6", "yolo_froth_seg", "YOLO froth instance segmentation", "domain-sota", "offline",
               "Ultralytics", "Flow Measurement and Instrumentation 2026, DOI 10.1016/j.flowmeasinst.2026.103507",
               "AGPL-3.0; deployment must preserve license obligations", True, True, "accepted",
               "docs/frameworks/12_yolo-seg/README.md"),
    MethodSpec("L7", "sam2_1", "SAM 2.1 prompt/video", "foundation", "offline",
               "official facebookresearch/sam2", "Ravi et al. 2024, arXiv:2408.00714", "Apache-2.0",
               True, True, "accepted", "docs/frameworks/13_sam2/README.md"),
    MethodSpec("N1", "lamellastar", "LamellaStar", "frontier", "offline+live-candidate",
               "in-repo PyTorch", "FrothSeg research model; claim requires ablation", "MIT",
               True, True, "accepted", "docs/frameworks/14_lamellastar/README.md"),
)

BY_SLUG = {method.slug: method for method in METHODS}


def registry_document() -> dict:
    return {
        "schema": "frothseg.method-registry/v1",
        "required_count": len(METHODS),
        "methods": [asdict(method) for method in METHODS],
    }


def validate_registry() -> list[str]:
    errors: list[str] = []
    ids = [method.id for method in METHODS]
    slugs = [method.slug for method in METHODS]
    if len(ids) != len(set(ids)):
        errors.append("duplicate method id")
    if len(slugs) != len(set(slugs)):
        errors.append("duplicate method slug")
    if len(METHODS) < 10:
        errors.append("method ladder has fewer than 10 entries")
    if sum(method.learned for method in METHODS) < 2:
        errors.append("method ladder has fewer than two learned methods")
    for method in METHODS:
        if not all((method.engine, method.provenance, method.license, method.docs_path)):
            errors.append(f"{method.id}: incomplete registry metadata")
    return errors
