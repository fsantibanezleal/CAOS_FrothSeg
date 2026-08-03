"""Materialize reserve generation 2 and pre-register it, hashes first.

Generation 1 gave every study a uniform 64 samples because that is the size of the burned test
split. Sizing a confirmation surface by the surface it replaces, rather than by the effect it has
to resolve, got it wrong in both directions: the three adoptions that spent a slice measured
+0.115, +0.079 and +0.064 and needed n of 6, 13 and 19, so each was over-powered three to ten
times over, while the one open question (FOREGROUND_OTSU_FACTOR, about +0.019 on C3) needs n=218
against the 64 the last unspent slice holds. It cannot settle the question it would be spent on.

Generation 2 sizes each slice by its resolvable effect. See `fslab.datasets.RESERVE_G2_SLICES`
for the tiers and the power arithmetic.

Generation 1 is not touched. Its archive is pinned by sha256 in
`verification/phase2-data-preregistration.json` and four of its five slices are spent, so it stays
byte-identical and its guards keep passing. This writes a separate archive from a disjoint seed
block.

WHAT THIS SCRIPT DOES NOT DO: observe anything. It renders scenes, hashes their ids, and writes
the hashes down. No metric is computed here and no engine is run over a reserve row. That
separation is the entire point: the pre-registration has to exist before anyone can be tempted by
a result.

    .venv-gpu/Scripts/python.exe scripts/build_reserve_g2.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.datasets import (  # noqa: E402
    RESERVE_G2_SEED_BASE,
    RESERVE_G2_SLICES,
    learned_dataset_matrix,
    reserve_dataset_matrix,
    reserve_g2_matrix,
)
from fslab.learning.data_cache import materialize  # noqa: E402

ARCHIVE = ROOT / "data/cache/learned-v2-192-reserve-g2.npz"
PREREGISTRATION = ROOT / "verification/reserve-g2-preregistration.json"

# Conservative per-image SD of the paired AP delta, taken ABOVE the largest value observed on the
# three generation-1 confirmations (0.0426, 0.0774, 0.0965). Used only to state what each tier
# resolves; nothing selects on it.
SIGMA = 0.10
Z_ALPHA, Z_BETA = 1.96, 0.84


def resolvable_delta(n: int) -> float:
    """Smallest paired mean delta this n detects at 80 percent power, alpha 0.05 two-sided."""
    return (Z_ALPHA + Z_BETA) * SIGMA / np.sqrt(n)


def _id_hash(values) -> str:
    joined = "\n".join(sorted(str(value) for value in values))
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, default=ARCHIVE)
    parser.add_argument("--output", type=Path, default=PREREGISTRATION)
    parser.add_argument("--image-size", type=int, default=192)
    args = parser.parse_args()

    matrix = reserve_g2_matrix(image_size=args.image_size)

    # Disjointness is asserted, not assumed. A reserve row that shares a latent geometry with the
    # working matrix is not a held-out surface at all, and the failure would be invisible in every
    # downstream number.
    working_seeds = {s.spec.seed for s in learned_dataset_matrix(image_size=args.image_size)}
    gen1_seeds = {s.spec.seed for s in reserve_dataset_matrix(image_size=args.image_size)}
    g2_seeds = {s.spec.seed for s in matrix}
    for name, other in (("working matrix", working_seeds), ("reserve generation 1", gen1_seeds)):
        overlap = g2_seeds & other
        if overlap:
            raise SystemExit(f"generation 2 shares {len(overlap)} seeds with the {name}")
    working_groups = {s.record.group_id for s in learned_dataset_matrix(image_size=args.image_size)}
    g2_groups = {s.record.group_id for s in matrix}
    if g2_groups & working_groups:
        raise SystemExit("generation 2 shares latent geometry groups with the working matrix")

    images, labels = materialize(matrix, args.image_size)
    args.archive.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        args.archive,
        images=images,
        labels=labels,
        sample_ids=np.array([s.record.sample_id for s in matrix]),
        splits=np.array([s.split for s in matrix]),
        conditions=np.array([s.condition_id for s in matrix]),
        group_ids=np.array([s.record.group_id for s in matrix]),
        reserve_studies=np.array([s.reserve_study for s in matrix]),
    )
    archive_sha256 = hashlib.sha256(args.archive.read_bytes()).hexdigest()

    per_slice = {}
    for slice_id, groups in RESERVE_G2_SLICES:
        rows = [s for s in matrix if s.reserve_study == slice_id]
        n = len(rows)
        per_slice[slice_id] = {
            "tier": slice_id[0].upper(),
            "groups_per_condition": groups,
            "n_samples": n,
            "n_groups": len({s.record.group_id for s in rows}),
            "conditions": len({s.condition_id for s in rows}),
            "resolvable_paired_delta": round(float(resolvable_delta(n)), 4),
            "sample_ids_sha256": _id_hash(s.record.sample_id for s in rows),
            "group_ids_sha256": _id_hash(s.record.group_id for s in rows),
        }

    document = {
        "schema": "frothseg.reserve-g2-preregistration/v1",
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "generation": 2,
        "supersedes_nothing": (
            "Generation 1 (verification/phase2-data-preregistration.json) is untouched. Its "
            "archive stays byte-identical, four of its five slices are spent, and p5 remains "
            "unspent and usable for any effect at or above 0.035."
        ),
        "why_generation_2": (
            "Generation 1 sized every slice at 64 to match the burned test split. Sizing by the "
            "surface replaced rather than by the effect to be resolved was wrong in both "
            "directions: the three adoptions that spent a slice needed n of 6, 13 and 19 and each "
            "got 64, while the open FOREGROUND_OTSU_FACTOR question needs n=218 and the last "
            "unspent generation-1 slice holds 64."
        ),
        "sizing_basis": {
            "statistic": "paired per-image mean AP delta, before vs after, on the same images",
            "sigma_used": SIGMA,
            "sigma_justification": (
                "above the largest per-image SD observed on the three generation-1 "
                "confirmations: 0.0426 (C7 mode), 0.0774 (C3 depth), 0.0965 (C3 surface)"
            ),
            "power": 0.80,
            "alpha": 0.05,
            "two_sided": True,
        },
        "the_scarce_resource_is_not_samples": (
            "These scenes are synthetic and seed-addressable and the archive is gitignored and "
            "rebuilt from seeds, so supply never constrained anything; the five-slice cap simply "
            "tied the budget to a study count guessed in advance. What is limited is how many "
            "times a surface may be consulted before a false positive is likely. That is an alpha "
            "budget and it lives in the ledger. Minting a fresh slice because the last one "
            "disappointed is the failure this mechanism exists to prevent, and no amount of free "
            "disk prevents it: the pre-registration does."
        ),
        "tier_meaning": {
            "S": "n=32, resolves 0.050. Direction and sanity checks, or an effect already "
                 "measured above 0.10 on another surface.",
            "M": "n=128, resolves 0.025. The DEFAULT for adopting an engine default.",
            "L": "n=512, resolves 0.012. Required when the pre-registered expected effect is "
                 "below 0.025. Needing this tier is itself a finding.",
        },
        "rules": [
            "A slice is read at most once, by the study that pre-registered it, and the read is "
            "recorded in verification/reserve-slice-ledger.json before any other use.",
            "The tier is chosen from the pre-registered EXPECTED effect, before the read. "
            "Choosing n after seeing the effect is selection by another name.",
            "A confirmation on a slice whose resolvable delta exceeds the observed effect is "
            "reported as inconclusive, never as a refutation.",
            "The archive sha256 and the per-slice id hashes below are checked before any read; a "
            "mismatch means the surface is not the one that was reserved.",
        ],
        "archive": args.archive.relative_to(ROOT).as_posix(),
        "archive_sha256": archive_sha256,
        "seed_base": RESERVE_G2_SEED_BASE,
        "disjoint_from": {
            "working_matrix_seeds": 0,
            "reserve_generation_1_seeds": 0,
            "working_matrix_groups": 0,
        },
        "slice_count": len(RESERVE_G2_SLICES),
        "total_samples": len(matrix),
        "per_slice": per_slice,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, indent=2), encoding="utf-8")

    print(f"wrote {args.archive.relative_to(ROOT).as_posix()}  sha256 {archive_sha256[:16]}")
    print(f"wrote {args.output.relative_to(ROOT).as_posix()}")
    print(f"\n{'slice':<6}{'tier':>5}{'n':>7}{'groups':>8}{'resolves':>11}")
    for slice_id, meta in per_slice.items():
        print(
            f"{slice_id:<6}{meta['tier']:>5}{meta['n_samples']:>7}{meta['n_groups']:>8}"
            f"{meta['resolvable_paired_delta']:>11.4f}"
        )
    print(f"\n{len(matrix)} samples across {len(RESERVE_G2_SLICES)} slices, none observed.")


if __name__ == "__main__":
    main()
