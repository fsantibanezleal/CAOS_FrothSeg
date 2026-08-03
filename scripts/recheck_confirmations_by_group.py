"""Restate the settled confirmations at group level, after the sizing defect was found.

WHAT THIS IS. On 2026-08-03 the reserve sizing was corrected: each latent geometry group is
rendered as two appearance variants sharing one geometry, so the two images of a group are one
observation rendered twice. Every confirmation published before that date reported per-IMAGE
statistics on a 64-image slice and therefore claimed 63 degrees of freedom where the design
supplies 31.

WHAT THIS IS NOT. This re-decides nothing. Each adoption below is already published, each spent its
slice, and each keeps whatever it concluded. Recomputing a deterministic statistic over the same
two fixed configurations on the same fixed rows is not a second look, because no decision depends
on the result: the decision is already on record. What changes is the stated PRECISION of a settled
number, which was optimistic. If a re-check were to show an adoption no longer clearing its
corrected floor, that would be published as a finding against the adoption, not quietly repaired.

    .venv-gpu/Scripts/python.exe scripts/recheck_confirmations_by_group.py
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy import stats

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))
sys.path.insert(0, str(ROOT / "scripts"))

from fslab.science import segment  # noqa: E402
from fslab.science.segment import full_instance_metrics  # noqa: E402

from r3_classical_tier import METHODS, cluster  # noqa: E402

ARCHIVE = ROOT / "data/cache/learned-v2-192-reserve.npz"
OUT = ROOT / "verification/confirmations-group-level-recheck.json"

SIGMA, Z_ALPHA, Z_BETA = 0.10, 1.96, 0.84

# The classical adoptions that spent a generation-1 slice.
#
# Every configuration below is stated IN FULL, at the values in force when that study ran, not at
# today's defaults. This matters: the Phase 1 surface comparison ran while C3_H_MAXIMA was 0.06, and
# R-2 later moved it to 0.12. Letting `h` fall through to the current default silently measures a
# different quantity and reports it as a correction of the published one; the first version of this
# file did exactly that and produced +0.1743 where the record says +0.1147.
#
# `published_before_ap` and `published_after_ap` are the means on record. The run asserts against
# them, so a reconstruction that has drifted fails loudly instead of publishing a plausible number.
STUDIES = [
    {
        "id": "R-2 C3 flooding depth",
        "slice": "p4",
        "method": "watershed_hmax",
        "before": {"h": 0.06, "surface": "neg_gray", "watershed_line": False},
        "after": {"h": 0.12, "surface": "neg_gray", "watershed_line": False},
        "published_before_ap": 0.2190625,
        "published_after_ap": 0.29757812499999997,
        "artifact": "verification/r2-c3-flooding-depth.json",
    },
    {
        "id": "Phase 1 C3 flooding surface",
        "slice": "p1",
        "method": "watershed_hmax",
        "before": {"h": 0.06, "surface": "neg_edt", "watershed_line": False},
        "after": {"h": 0.06, "surface": "neg_gray", "watershed_line": False},
        "published_before_ap": 0.10265625,
        "published_after_ap": 0.21735937499999997,
        "artifact": "verification/phase1-adoption.json",
    },
    {
        # Both Phase 1 changes were confirmed on p1 in one read, not on a slice each. p2 was spent
        # by the domain-randomization study; assuming a slice per change reads the wrong rows and
        # produces a number that looks right.
        "id": "Phase 1 C7 mode",
        "slice": "p1",
        "method": "valley_edge",
        "before": {"seam_radius": 3, "mode": "subtract", "watershed_line": False},
        "after": {"seam_radius": 3, "mode": "watershed", "watershed_line": False},
        "published_before_ap": 0.17003124999999997,
        "published_after_ap": 0.23429687500000002,
        "artifact": "verification/phase1-adoption.json",
    },
]


def per_image_ap(images, labels, method: str, **kwargs) -> np.ndarray:
    engine = METHODS[method]
    return np.array(
        [
            full_instance_metrics(engine(image.astype(np.float32) / 255.0, **kwargs), label)["ap"]
            for image, label in zip(images, labels, strict=True)
        ],
        dtype=np.float64,
    )


def main() -> None:
    data = np.load(ARCHIVE, allow_pickle=True)
    studies = np.array([str(v) for v in data["reserve_studies"]])
    group_ids_all = np.array([str(v) for v in data["group_ids"]])

    results = []
    for study in STUDIES:
        rows = np.flatnonzero(studies == study["slice"])
        images, labels = data["images"][rows], data["labels"][rows]
        groups = [group_ids_all[i] for i in rows]

        before = per_image_ap(images, labels, study["method"], **study["before"])
        after = per_image_ap(images, labels, study["method"], **study["after"])

        # The reconstruction has to land on the published means, or it is measuring something else
        # and any "correction" derived from it is fiction. Tolerance is tight because both sides are
        # deterministic over fixed rows.
        for side, recomputed in (("before", before), ("after", after)):
            published = study[f"published_{side}_ap"]
            if abs(float(recomputed.mean()) - published) > 1e-6:
                raise SystemExit(
                    f"{study['id']}: reconstructed {side} mean AP {recomputed.mean():.8f} does not "
                    f"match the published {published:.8f}. The configuration below is not the one "
                    f"that ran; re-check which constants were in force at the time."
                )

        image_delta = after - before
        image_t, image_p = stats.ttest_rel(after, before)

        grouped = cluster(image_delta, groups)
        group_t, group_p = stats.ttest_rel(
            cluster(after, groups), cluster(before, groups)
        )
        n_groups = len(grouped)
        floor = (Z_ALPHA + Z_BETA) * SIGMA / np.sqrt(n_groups)

        row = {
            "study": study["id"],
            "artifact": study["artifact"],
            "reserve_study": study["slice"],
            "method": study["method"],
            "before": study["before"],
            "after": study["after"],
            "as_published_per_image": {
                "n": int(len(image_delta)),
                "df": int(len(image_delta) - 1),
                "mean_delta": float(image_delta.mean()),
                "sd": float(image_delta.std(ddof=1)),
                "t": float(image_t),
                "p": float(image_p),
                "resolvable_floor": round(float((Z_ALPHA + Z_BETA) * SIGMA / np.sqrt(len(image_delta))), 4),
            },
            "corrected_by_group": {
                "n": n_groups,
                "df": n_groups - 1,
                "mean_delta": float(grouped.mean()),
                "sd": float(grouped.std(ddof=1)),
                "t": float(group_t),
                "p": float(group_p),
                "resolvable_floor": round(float(floor), 4),
            },
            "clears_corrected_floor": bool(abs(grouped.mean()) > floor),
            "conclusion_unchanged": bool(
                (grouped.mean() > 0) == (image_delta.mean() > 0) and group_p < 0.05
            ),
        }
        results.append(row)
        print(
            f"{study['id']:<30} delta {grouped.mean():+.4f}  "
            f"floor {floor:.4f}  p {group_p:.2e}  "
            f"clears: {row['clears_corrected_floor']}"
        )

    document = {
        "schema": "frothseg.confirmations-group-level-recheck/v1",
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "why": (
            "Every confirmation published before 2026-08-03 reported per-image statistics on a "
            "64-image reserve slice. Each latent geometry group is rendered as two appearance "
            "variants sharing one geometry, so those slices supply 32 independent observations, "
            "not 64, and the published tests claimed 63 degrees of freedom where the design "
            "supplies 31."
        ),
        "this_re_decides_nothing": (
            "Each adoption below is already published and already spent its slice. Recomputing a "
            "deterministic statistic over the same two fixed configurations on the same fixed rows "
            "is not a second look, because no decision depends on the outcome. What is corrected "
            "is the stated precision of a settled number."
        ),
        "sigma_used": SIGMA,
        "studies": results,
        "summary": {
            "all_clear_their_corrected_floor": all(r["clears_corrected_floor"] for r in results),
            "any_conclusion_changed": not all(r["conclusion_unchanged"] for r in results),
        },
        "engine_defaults_at_recheck": {
            "C3_H_MAXIMA": segment.C3_H_MAXIMA,
            "FOREGROUND_OTSU_FACTOR": segment.FOREGROUND_OTSU_FACTOR,
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(document, indent=2), encoding="utf-8")
    print(f"\nwrote {OUT.relative_to(ROOT).as_posix()}")
    print(f"all clear corrected floor: {document['summary']['all_clear_their_corrected_floor']}")
    print(f"any conclusion changed:    {document['summary']['any_conclusion_changed']}")


if __name__ == "__main__":
    main()
