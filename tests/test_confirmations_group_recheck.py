"""Guards on the group-level re-check of the settled confirmations.

The re-check reconstructs three historical adoptions from the engine as it stands today and asserts
each reconstruction against its published mean. Those assertions only fire when the script RUNS. If
an engine constant it depended on moves and nobody re-runs it, the committed artifact silently
becomes a record of an engine that no longer exists, and it would still read as current.

Re-running the reconstruction here would cost minutes. Pinning the constants it depended on costs
nothing and catches the same regression, by failing the moment the ground it stands on shifts.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.science import segment  # noqa: E402

ARTIFACT = ROOT / "verification/confirmations-group-level-recheck.json"


def _document() -> dict:
    if not ARTIFACT.exists():
        pytest.skip("the group-level re-check has not been run here")
    return json.loads(ARTIFACT.read_text(encoding="utf-8"))


def test_the_engine_it_reconstructed_against_has_not_moved() -> None:
    """A stale reconstruction reads exactly like a current one. This is what tells them apart."""
    document = _document()
    for name, recorded in document["engine_defaults_at_recheck"].items():
        assert getattr(segment, name) == recorded, (
            f"{name} is now {getattr(segment, name)} but the re-check ran against {recorded}. "
            "Re-run scripts/recheck_confirmations_by_group.py; its published-mean assertions are "
            "the only thing that proves the reconstruction is faithful."
        )


def test_every_settled_adoption_still_clears_its_corrected_floor() -> None:
    """The whole point of the re-check. If one stopped clearing, that is a finding, not a tidy-up."""
    document = _document()
    assert document["studies"], "no studies recorded"
    for study in document["studies"]:
        corrected = study["corrected_by_group"]
        assert study["clears_corrected_floor"] is True, (
            f"{study['study']} no longer clears its floor: delta {corrected['mean_delta']:.4f} "
            f"against {corrected['resolvable_floor']}. That is published as a finding against the "
            "adoption, never quietly repaired."
        )
        assert study["conclusion_unchanged"] is True, f"{study['study']} changed conclusion"
    assert document["summary"]["all_clear_their_corrected_floor"] is True
    assert document["summary"]["any_conclusion_changed"] is False


def test_the_correction_actually_reduced_the_claimed_precision() -> None:
    """Clustering must cost degrees of freedom. If it did not, it was not applied.

    A re-check that reports the same n before and after has silently kept testing across images,
    which is the defect it exists to correct.
    """
    document = _document()
    for study in document["studies"]:
        published, corrected = study["as_published_per_image"], study["corrected_by_group"]
        assert corrected["n"] < published["n"], (
            f"{study['study']}: the corrected n equals the per-image n, so no clustering happened"
        )
        assert corrected["resolvable_floor"] > published["resolvable_floor"], (
            f"{study['study']}: the corrected floor is not coarser than the per-image one, which "
            "is arithmetically impossible under clustering"
        )
