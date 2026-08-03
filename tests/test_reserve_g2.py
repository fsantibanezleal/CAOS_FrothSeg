"""Guards on reserve generation 2: sizing, disjointness, and one-read-per-slice.

Generation 1 sized every slice at 64 because that is the size of the burned test split. Sizing a
confirmation surface by the surface it replaces rather than by the effect it must resolve was
wrong in both directions, and these tests pin the property that replaces it: every slice states
what it can resolve, and that statement is arithmetic rather than assertion.

They also pin the thing that makes a reserve a reserve. A slice is only held-out while it is
unread and while its rows are the rows that were reserved, so both are checked before any study
is allowed to consult one.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.datasets import (  # noqa: E402
    RESERVE_G2_SEED_BASE,
    RESERVE_G2_SLICES,
    RESERVE_SEED_BASE,
)

PREREGISTRATION = ROOT / "verification/reserve-g2-preregistration.json"
GEN1_PREREGISTRATION = ROOT / "verification/phase2-data-preregistration.json"
LEDGER = ROOT / "verification/reserve-slice-ledger.json"

# The same conservative sigma the builder used, above every per-image SD observed on the three
# generation-1 confirmations. Restated here so the test recomputes rather than trusts.
SIGMA = 0.10
Z_ALPHA, Z_BETA = 1.96, 0.84


def _document() -> dict:
    if not PREREGISTRATION.exists():
        pytest.skip("reserve generation 2 has not been built here")
    return json.loads(PREREGISTRATION.read_text(encoding="utf-8"))


def test_every_slice_states_a_resolvable_effect_that_matches_its_size() -> None:
    """The whole point of the redesign: n is derived from the effect, so it must reproduce."""
    document = _document()
    for slice_id, meta in document["per_slice"].items():
        expected = (Z_ALPHA + Z_BETA) * SIGMA / np.sqrt(meta["n_groups"])
        assert meta["resolvable_paired_delta"] == pytest.approx(expected, abs=5e-5), (
            f"{slice_id}: claims it resolves {meta['resolvable_paired_delta']} at "
            f"{meta['n_groups']} groups, arithmetic says {expected:.4f}"
        )


def test_resolution_is_stated_in_groups_and_not_in_images() -> None:
    """The defect this pins: sizing on images when the two variants of a group share geometry.

    Each group is rendered twice, so an image count overstates the independent sample size by a
    factor of two and every tier's resolution by sqrt(2). The first version of the generation-2
    pre-registration did exactly that. This asserts the corrected basis is what is published, and
    fails loudly if anyone reverts to the image count.
    """
    document = _document()
    for slice_id, meta in document["per_slice"].items():
        assert meta["n_groups"] < meta["n_samples"], (
            f"{slice_id}: groups and images are equal, so the clustering assumption changed and "
            "the sizing basis has to be re-derived rather than inherited"
        )
        image_based = (Z_ALPHA + Z_BETA) * SIGMA / np.sqrt(meta["n_samples"])
        assert meta["resolvable_paired_delta"] > image_based, (
            f"{slice_id}: the published resolution matches the image count, which is the "
            "optimistic value this test exists to reject"
        )
    assert document["sizing_basis"]["unit_of_replication"] == "latent geometry group, not image"


def test_the_tiers_cover_the_effects_this_repository_actually_adopts() -> None:
    """A tier ladder with a hole in it is worse than none: the hole is where you improvise.

    The three adoptions on record measured +0.115, +0.079 and +0.064, and the open Otsu-factor
    question is about +0.019. Every one of those must be resolvable by some tier, and the
    smallest must be resolvable by the largest.
    """
    document = _document()
    resolvable = sorted(meta["resolvable_paired_delta"] for meta in document["per_slice"].values())
    for effect in (0.1147, 0.0785, 0.0643, 0.0489, 0.019):
        assert any(delta <= effect for delta in resolvable), (
            f"no slice can resolve an effect of {effect}; smallest resolvable is {resolvable[0]}"
        )
    # 0.019 is the finest effect the ladder has to serve and it clears the floor by a thin margin.
    # Pinning the floor below it keeps that margin honest rather than letting it erode silently.
    assert resolvable[0] <= 0.0175, (
        "the largest tier must still resolve the open Otsu-factor question, or the one thing "
        "generation 2 was built to settle has nowhere to go"
    )


def test_the_archive_is_the_one_that_was_reserved() -> None:
    document = _document()
    archive = ROOT / document["archive"]
    if not archive.exists():
        pytest.skip("reserve generation 2 archive is not materialised here")
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == document["archive_sha256"], (
        "the generation 2 archive does not match its pre-registration hash; it is not the "
        "surface that was reserved"
    )


def test_slice_rows_match_their_registered_hashes() -> None:
    document = _document()
    archive = ROOT / document["archive"]
    if not archive.exists():
        pytest.skip("reserve generation 2 archive is not materialised here")
    data = np.load(archive, allow_pickle=True)
    studies = [str(value) for value in data["reserve_studies"]]
    sample_ids = [str(value) for value in data["sample_ids"]]
    group_ids = [str(value) for value in data["group_ids"]]

    def id_hash(values) -> str:
        return hashlib.sha256("\n".join(sorted(values)).encode("utf-8")).hexdigest()

    for slice_id, meta in document["per_slice"].items():
        rows = [i for i, study in enumerate(studies) if study == slice_id]
        assert len(rows) == meta["n_samples"], slice_id
        assert id_hash(sample_ids[i] for i in rows) == meta["sample_ids_sha256"], slice_id
        assert id_hash(group_ids[i] for i in rows) == meta["group_ids_sha256"], slice_id


def test_generation_2_cannot_collide_with_anything_already_observed() -> None:
    """A reserve row sharing a latent geometry with the working matrix is not held out at all."""
    document = _document()
    assert RESERVE_G2_SEED_BASE > RESERVE_SEED_BASE, "generation 2 must sit above generation 1"
    for key, value in document["disjoint_from"].items():
        assert value == 0, f"generation 2 overlaps the {key}: {value}"
    total_groups = sum(groups for _, groups in RESERVE_G2_SLICES)
    assert total_groups <= 99, (
        f"{total_groups} groups per condition exceeds the seed stride headroom of 99"
    )


def test_generation_1_is_untouched_by_the_redesign() -> None:
    """Four of its five slices are spent. Rebuilding or renumbering it would void them."""
    if not GEN1_PREREGISTRATION.exists():
        pytest.skip("generation 1 pre-registration not present")
    gen1 = json.loads(GEN1_PREREGISTRATION.read_text(encoding="utf-8"))
    archive = ROOT / "data/cache/learned-v2-192-reserve.npz"
    if not archive.exists():
        pytest.skip("generation 1 archive is not materialised here")
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == (
        gen1["synthetic"]["reserve_matrix"]["cache_sha256"]
    ), "the generation 1 archive changed; every slice it already spent is void"


def test_no_slice_is_recorded_as_spent_twice() -> None:
    """The ledger is the only thing that makes a slice consumable rather than reusable."""
    if not LEDGER.exists():
        pytest.skip("ledger not present")
    ledger = json.loads(LEDGER.read_text(encoding="utf-8"))
    spent = [entry["reserve_study"] for entry in ledger["entries"]]
    assert len(spent) == len(set(spent)), (
        f"a slice appears twice in the ledger, so it was observed twice and its guarantee is "
        f"void: {sorted({s for s in spent if spent.count(s) > 1})}"
    )
    assert ledger["slices_spent"] == len(ledger["entries"])
