"""Build the Phase 1 constant ledger and the Phase 1 verification roll-up.

Every classical constant that sits in the scored critical path gets one row saying, for that constant:
what value the committed benchmark artifacts were produced with, which methods consume it, whether it was
swept in Phase 1 and where the sweep is, what the sweep's argmax was, and, if it was not swept, what
documented and sourced reason it has for being what it is.

Reads only artifacts on disk (`data/derived/phase1/*.json` and `data/derived/classical-heldout.json`) so
that every number in the ledger has a file behind it. Writes:

  data/derived/phase1/classical-constant-ledger.json
  verification/phase1-classical-sweeps.json
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PHASE1 = ROOT / "data" / "derived" / "phase1"
HELDOUT = ROOT / "data" / "derived" / "classical-heldout.json"
VERIFICATION = ROOT / "verification" / "phase1-classical-sweeps.json"

METHOD_CODE = {
    "otsu_cc": "C1",
    "watershed_immersion": "C2",
    "watershed_hmax": "C3",
    "watershed_dt": "C4",
    "watershed_hmin": "C5",
    "slic_merge": "C6",
    "valley_edge": "C7",
}


def _load(name: str) -> dict:
    return json.loads((PHASE1 / name).read_text(encoding="utf-8"))


def _points(document: dict, method: str | None = None, **fixed) -> list[dict]:
    out = []
    for point in document["points"]:
        if method is not None and point["method"] != method:
            continue
        if any(point["config"].get(key) != value for key, value in fixed.items()):
            continue
        out.append(point)
    return out


def _best(points: list[dict], metric: str = "mean_ap", maximise: bool = True) -> dict:
    return (max if maximise else min)(points, key=lambda point: point[metric])


def _row(point: dict, *extra_config: str) -> dict:
    row = {
        "config": point["config"],
        "mean_ap": point["mean_ap"],
        "mean_pq": point["mean_pq"],
        "mean_boundary_fscore": point["mean_boundary_fscore"],
        "mean_bsd_wasserstein": point["mean_bsd_wasserstein"],
        "mean_count_absolute_error": point["mean_count_absolute_error"],
        "mean_d32_relative_error": point["mean_d32_relative_error"],
        "mean_inference_ms": point["mean_inference_ms"],
    }
    for key in extra_config:
        row[key] = point.get(key)
    return row


def build_ledger() -> dict:
    factor = _load("foreground-factor-sweep.json")
    cleanup = _load("foreground-cleanup-sweep.json")
    compact = _load("c4-compactness-sweep.json")
    c7 = _load("c7-constrained-watershed.json")
    c3 = _load("c3-flooding-surface.json")
    residual = _load("residual-constants-sweep.json")

    dependants = ["otsu_cc", "watershed_hmax", "watershed_dt", "watershed_hmin", "valley_edge"]

    rows: list[dict] = []

    # ---- _foreground.otsu_factor -------------------------------------------------------------
    per_method = {}
    for method in dependants:
        best = _best(_points(factor, method))
        published = next(
            point for point in _points(factor, method) if point["config"]["otsu_factor"] == 0.75
        )
        per_method[METHOD_CODE[method]] = {
            "argmax_otsu_factor": best["config"]["otsu_factor"],
            "argmax_mean_ap": best["mean_ap"],
            "published_mean_ap": published["mean_ap"],
            "delta_mean_ap": best["mean_ap"] - published["mean_ap"],
        }
    tier_means = {}
    for value in factor["pre_registered_grid"]["otsu_factor"]:
        selected = [
            point for point in factor["points"]
            if point["config"]["otsu_factor"] == value and point["method"] in dependants
        ]
        tier_means[str(value)] = sum(point["mean_ap"] for point in selected) / len(selected)
    tier_argmax = max(tier_means, key=lambda key: tier_means[key])
    rows.append({
        "constant": "_foreground.otsu_factor",
        "published_value": 0.75,
        "consumed_by": ["C1", "C2", "C3", "C4", "C5", "C6", "C7"],
        "scored_dependants_swept": [METHOD_CODE[m] for m in dependants],
        "status": "swept",
        "sweep_artifact": "data/derived/phase1/foreground-factor-sweep.json",
        "published_is_argmax_for": [
            code for code, entry in per_method.items() if entry["argmax_otsu_factor"] == 0.75
        ],
        "per_method": per_method,
        "tier_mean_ap_by_value": tier_means,
        "tier_argmax": float(tier_argmax),
        "source": {
            "doi": "10.1109/TSMC.1979.4310076",
            "note": (
                "Otsu 1979 supplies the threshold. The 0.75 multiplier is not part of Otsu's method, "
                "so the citation defends the threshold and not the constant."
            ),
        },
        "decision": "kept, deliberate",
        "decision_evidence": "data/derived/phase1/foreground-factor-sweep.json",
        "verdict": (
            "Swept and recorded, and KEPT at 0.75 as a deliberate default with that sweep as its "
            "evidence. 0.75 is the argmax for exactly one of the five scored dependants and the "
            "tier-mean argmax is a different value, so moving it would be picking a per-method winner "
            "on the observed test split for a constant that five methods share. It is common-mode: a "
            "change here moves C1, C2, C3, C4, C5, C6 and C7 at once, which is why the sweep is the "
            "record and the value does not move on it."
        ),
    })

    # ---- _foreground.hole_max_size and object_max_size -----------------------------------------
    for constant, published_value, grid_key in (
        ("hole_max_size", 16, "hole_max_size"),
        ("object_max_size", 12, "object_max_size"),
    ):
        per_method = {}
        for method in dependants:
            candidates = [
                point for point in cleanup["points"]
                if point["method"] == method and constant in point["config"]
            ]
            best = _best(candidates)
            published = next(
                point for point in candidates if point["config"][constant] == published_value
            )
            per_method[METHOD_CODE[method]] = {
                f"argmax_{constant}": best["config"][constant],
                "argmax_mean_ap": best["mean_ap"],
                "published_mean_ap": published["mean_ap"],
                "delta_mean_ap": best["mean_ap"] - published["mean_ap"],
            }
        rows.append({
            "constant": f"_foreground.{constant}",
            "published_value": published_value,
            "consumed_by": ["C1", "C2", "C3", "C4", "C5", "C6", "C7"],
            "scored_dependants_swept": [METHOD_CODE[m] for m in dependants],
            "status": "swept",
            "sweep_artifact": "data/derived/phase1/foreground-cleanup-sweep.json",
            "grid": cleanup["pre_registered_grid"][grid_key],
            "published_is_argmax_for": [
                code for code, entry in per_method.items()
                if entry[f"argmax_{constant}"] == published_value
            ],
            "per_method": per_method,
            "source": None,
            "verdict": "Swept and recorded.",
        })

    # ---- C4 compactness and watershed_line -----------------------------------------------------
    plain = _points(compact, "watershed_dt", watershed_line=False)
    best_ap = _best(plain)
    best_d32 = _best(plain, "mean_d32_relative_error", maximise=False)
    published = next(point for point in plain if point["config"]["compactness"] == 0.0)
    rows.append({
        "constant": "watershed_dt.compactness",
        "published_value": 0.0,
        "consumed_by": ["C4"],
        "status": "swept",
        "sweep_artifact": "data/derived/phase1/c4-compactness-sweep.json",
        "grid": compact["pre_registered_grid"]["compactness"],
        "argmax_mean_ap": _row(best_ap),
        "argmin_d32_relative_error": _row(best_d32),
        "published": _row(published),
        "published_is_argmax_on_mean_ap": best_ap["config"]["compactness"] == 0.0,
        "source": compact["source"],
        "decision": "kept, deliberate",
        "decision_evidence": "data/derived/phase1/c4-compactness-sweep.json",
        "swept_values_worse_than_published": [
            point["config"]["compactness"]
            for point in plain
            if point["mean_ap"] < published["mean_ap"]
        ],
        "verdict": (
            "Swept and recorded, and KEPT at 0.0 as a deliberate default with that sweep as its "
            "evidence. 0.0 is the argmax on mean AP and every other swept value scores lower, so the "
            "absence of compactness is a measured choice and not an unexamined one. Compactness buys a "
            "large reduction in d32 relative error at a cost in AP, PQ and BSD Wasserstein; that "
            "trade is recorded here and is available if a later cycle decides the size distribution "
            "matters more than the mask, but it is not taken on this sweep."
        ),
    })
    rows.append({
        "constant": "watershed_dt.watershed_line",
        "published_value": False,
        "consumed_by": ["C4"],
        "status": "swept",
        "sweep_artifact": "data/derived/phase1/c4-compactness-sweep.json",
        "published": _row(published),
        "alternative": _row(
            next(
                point for point in _points(compact, "watershed_dt", watershed_line=True)
                if point["config"]["compactness"] == 0.0
            )
        ),
        "library_behaviour": compact["library_behaviour_probe"]["answer"],
        "source": None,
        "verdict": (
            "Swept and recorded. False is the argmax on mean AP at compactness 0, and at every "
            "compactness above 0 the flag has no effect at all in the pinned scikit-image."
        ),
    })

    # ---- C4 min_distance ------------------------------------------------------------------------
    candidates = [
        point for point in residual["points"]
        if point["method"] == "watershed_dt" and point.get("swept_parameter") == "min_distance"
    ]
    best = _best(candidates)
    rows.append({
        "constant": "watershed_dt.min_distance",
        "published_value": 4,
        "consumed_by": ["C4"],
        "status": "swept",
        "sweep_artifact": "data/derived/phase1/residual-constants-sweep.json",
        "grid": [point["config"]["min_distance"] for point in candidates],
        "argmax_mean_ap": _row(best),
        "published_is_argmax_on_mean_ap": best["config"]["min_distance"] == 4,
        "source": None,
        "verdict": "Swept and recorded. The published 4 is the argmax on mean AP.",
    })

    # ---- C3 flooding surface and h ---------------------------------------------------------------
    surface_points = _points(c3, "watershed_hmax", watershed_line=False)
    best_surface = _best(surface_points)
    previous_surface = next(
        point for point in surface_points if point["config"]["surface"] == "neg_edt"
    )
    adopted_surface = next(
        point for point in surface_points if point["config"]["surface"] == "neg_gray"
    )
    rows.append({
        "constant": "watershed_hmax.surface",
        "published_value": "neg_gray",
        "previous_value": "neg_edt",
        "consumed_by": ["C3"],
        "status": "swept",
        "sweep_artifact": "data/derived/phase1/c3-flooding-surface.json",
        "grid": c3["pre_registered_grid"]["surface"],
        "argmax_mean_ap": _row(best_surface),
        "published": _row(adopted_surface),
        "previous": _row(previous_surface),
        "c4_same_surface_reference": _row(c3["c4_reference_same_surface"]),
        "published_is_argmax_on_mean_ap": best_surface["config"]["surface"] == "neg_gray",
        "source": c3["source"],
        "decision": "ADOPTED 2026-08-01, neg_edt to neg_gray",
        "decision_evidence": "verification/phase1-adoption.json",
        "decision_basis": (
            "The primary source, not the sweep score. Flooding the negated grayscale from h-maxima "
            "markers IS the method Sadr-Kazemi and Cilliers 1997 (10.1016/S0892-6875(97)00094-0) "
            "publish, and that source is what the C3 registry entry already cites. The code was not "
            "implementing its own citation: it flooded the negated distance transform, which is C4's "
            "surface, so C3 and C4 differed only in their markers. The sweep is the observed evidence "
            "that motivated the correction and its numbers are NOT the published effect; the effect is "
            "measured on the untouched reserve slice in verification/phase1-adoption.json."
        ),
        "verdict": "Swept, sourced and adopted.",
    })
    candidates = [
        point for point in residual["points"]
        if point["method"] == "watershed_hmax" and point.get("swept_parameter") == "h"
    ]
    best = _best(candidates)
    rows.append({
        "constant": "watershed_hmax.h",
        "published_value": 0.06,
        "consumed_by": ["C3"],
        "status": "swept",
        "sweep_artifact": "data/derived/phase1/residual-constants-sweep.json",
        "grid": [point["config"]["h"] for point in candidates],
        "argmax_mean_ap": _row(best),
        "published_is_argmax_on_mean_ap": best["config"]["h"] == 0.06,
        "source": None,
        "verdict": "Swept and recorded.",
    })

    # ---- C5 h -------------------------------------------------------------------------------------
    candidates = [
        point for point in residual["points"]
        if point["method"] == "watershed_hmin" and point.get("swept_parameter") == "h"
    ]
    best = _best(candidates)
    rows.append({
        "constant": "watershed_hmin.h",
        "published_value": 0.08,
        "consumed_by": ["C5"],
        "status": "swept",
        "sweep_artifact": "data/derived/phase1/residual-constants-sweep.json",
        "grid": [point["config"]["h"] for point in candidates],
        "argmax_mean_ap": _row(best),
        "published_is_argmax_on_mean_ap": best["config"]["h"] == 0.08,
        "source": {
            "citation": "P. Soille, Morphological Image Analysis, 2nd ed., Springer 2004, extended minima",
            "note": (
                "The h-minima transform is sourced; the per-image normalization by the frame's maximum "
                "EDT, which makes h a fraction rather than a pixel depth, is not, and is recorded in the "
                "engine docstring as what was measured rather than as what is correct."
            ),
        },
        "verdict": "Swept and recorded.",
    })

    # ---- C7 -----------------------------------------------------------------------------------------
    subtract = [point for point in c7["points"] if point["config"]["mode"] == "subtract"]
    watershed = [point for point in c7["points"] if point["config"]["mode"] == "watershed"]
    previous_c7 = next(point for point in subtract if point["config"]["seam_radius"] == 3)
    adopted_c7 = next(
        point for point in watershed
        if point["config"]["seam_radius"] == 3 and point["config"]["watershed_line"] is False
    )
    rows.append({
        "constant": "valley_edge.mode",
        "published_value": "watershed",
        "previous_value": "subtract",
        "consumed_by": ["C7"],
        "status": "swept",
        "sweep_artifact": "data/derived/phase1/c7-constrained-watershed.json",
        "grid": c7["pre_registered_grid"]["mode"],
        "published": _row(adopted_c7),
        "previous": _row(previous_c7),
        "best_watershed_point": _row(_best(watershed)),
        "published_is_argmax_on_mean_ap": _best(c7["points"])["config"] == adopted_c7["config"],
        "every_watershed_row_beats_every_subtract_row_on_mean_ap": (
            min(point["mean_ap"] for point in watershed)
            > max(point["mean_ap"] for point in subtract)
        ),
        "source": c7["source"],
        "decision": "ADOPTED 2026-08-01, subtract to watershed, at the unchanged seam_radius 3",
        "decision_evidence": "verification/phase1-adoption.json",
        "decision_basis": (
            "The registry called this row a constrained watershed until 2026-07-31, when a Phase 0 "
            "honesty pass renamed it to 'dark-seam detector' because the engine ran no watershed: it "
            "subtracted the seam and labelled what was left, so every mask stopped short of the seam "
            "centreline by construction. This adoption resolves the same mismatch from the other side "
            "by implementing the method, on Meyer 1994 (10.1016/0165-1684(94)90060-4), and the "
            "registry name and provenance were restored in the same change. The structural result "
            "on the sweep is that EVERY watershed row beats EVERY subtract row at every swept radius, "
            "so the mode is a finding and not a tuned optimum. seam_radius and watershed_line are NOT "
            "moved with it. Honest cost, stated wherever this change is described: d32 relative error "
            "moves the WRONG way at radius 3, 1.2584 to 1.4371 on the observed test split and 1.3160 "
            "to 1.4972 on the untouched reserve slice."
        ),
        "cost_of_the_change": {
            "metric": "mean_d32_relative_error",
            "direction": "worse",
            "test_split_before": previous_c7["mean_d32_relative_error"],
            "test_split_after": adopted_c7["mean_d32_relative_error"],
            "test_split_source": "data/derived/phase1/c7-constrained-watershed.json",
            "reserve_source": "verification/phase1-adoption.json",
        },
        "verdict": "Swept, sourced and adopted, with a stated cost.",
    })
    rows.append({
        "constant": "valley_edge.seam_radius",
        "published_value": 3,
        "consumed_by": ["C7"],
        "status": "swept",
        "sweep_artifact": "data/derived/phase1/c7-constrained-watershed.json",
        "grid": c7["pre_registered_grid"]["seam_radius"],
        "argmax_mean_ap_within_previous_mode": _row(_best(subtract)),
        "argmax_mean_ap_within_published_mode": _row(_best(watershed)),
        "published_is_argmax_within_published_mode": _best(watershed)["config"]["seam_radius"] == 3,
        "source": None,
        "decision": "kept, deliberate, NOT moved with the mode",
        "decision_evidence": "data/derived/phase1/c7-constrained-watershed.json",
        "verdict": (
            "Swept and recorded, and KEPT at 3. Radius 4 or 5 in the adopted watershed mode is worth "
            "about 0.01 mean AP over radius 3 on the observed test split, which is exactly the "
            "test-split selection this programme exists to avoid: the mode change is defended by its "
            "primary source, a radius change would be defended by nothing but the score on the surface "
            "the score was read on. The measurement stays on record for a later cycle that can confirm "
            "it on an unobserved surface."
        ),
    })
    candidates = [
        point for point in residual["points"]
        if point["method"] == "valley_edge" and point.get("swept_parameter") == "min_cap_size"
    ]
    best = _best(candidates)
    rows.append({
        "constant": "valley_edge.min_cap_size",
        "published_value": 8,
        "consumed_by": ["C7"],
        "status": "swept",
        "sweep_artifact": "data/derived/phase1/residual-constants-sweep.json",
        "grid": [point["config"]["min_cap_size"] for point in candidates],
        "argmax_mean_ap": _row(best),
        "published_is_argmax_on_mean_ap": best["config"]["min_cap_size"] == 8,
        "source": None,
        "verdict": "Swept and recorded. The published 8 is the argmax on mean AP.",
    })
    rows.append({
        "constant": "valley_edge.watershed_line",
        "published_value": False,
        "consumed_by": ["C7"],
        "status": "swept",
        "sweep_artifact": "data/derived/phase1/c7-constrained-watershed.json",
        "note": (
            "Reachable now that the watershed mode is the default; under the previous subtract mode "
            "the engine never flooded and the flag was dead."
        ),
        "source": None,
        "decision": "kept, deliberate, NOT moved with the mode",
        "decision_evidence": "data/derived/phase1/c7-constrained-watershed.json",
        "verdict": (
            "Swept and recorded, and KEPT at False. Turning the line on trades a little mean AP for a "
            "little boundary F at every radius; neither direction is defended by a source, so the flag "
            "stays where it was rather than moving on a test-split preference."
        ),
    })

    # ---- C2 -----------------------------------------------------------------------------------------
    candidates = [
        point for point in residual["points"]
        if point["method"] == "watershed_immersion" and point.get("swept_parameter") == "min_distance"
    ]
    best = _best(candidates)
    rows.append({
        "constant": "watershed_immersion.min_distance",
        "published_value": 2,
        "consumed_by": ["C2"],
        "status": "swept",
        "sweep_artifact": "data/derived/phase1/residual-constants-sweep.json",
        "grid": [point["config"]["min_distance"] for point in candidates],
        "argmax_mean_ap": _row(best),
        "published_is_argmax_on_mean_ap": best["config"]["min_distance"] == 2,
        "source": {
            "citation": "L. Vincent and P. Soille, IEEE TPAMI 13(6), 1991",
            "doi": "10.1109/34.87344",
        },
        "verdict": (
            "Swept and recorded, and separately defended as a deliberate choice: C2's declared role in "
            "the ladder is the over-segmentation exhibit, so the value that maximises its AP is not the "
            "value that serves its purpose. Raising it monotonically improves AP and monotonically "
            "destroys the exhibit."
        ),
    })
    rows.append({
        "constant": "watershed_immersion.gradient_radius",
        "published_value": 1,
        "consumed_by": ["C2"],
        "status": "not-swept",
        "sweep_artifact": None,
        "source": None,
        "verdict": (
            "NOT swept and NOT sourced. Deliberately left: C2 is an exhibit, not a competitor, and the "
            "constant is exposed as a named keyword so a later cycle can sweep it without an engine edit."
        ),
    })

    # ---- C6 -----------------------------------------------------------------------------------------
    for constant, value in (
        ("slic_merge.n_segments", 400),
        ("slic_merge.compactness", 8),
        ("slic_merge.sigma", 1),
        ("slic_merge.rag_threshold", 0.08),
    ):
        rows.append({
            "constant": constant,
            "published_value": value,
            "consumed_by": ["C6"],
            "status": "not-swept",
            "sweep_artifact": None,
            "source": None,
            "verdict": (
                "NOT swept and NOT sourced. Out of Phase 1 scope by cost and by plan: C6 costs 536 ms per "
                "image for 0.0186 mean AP and is a Phase 5 rebuild-or-demote item, so sweeping its "
                "constants would be tuning a row that is a candidate for removal."
            ),
        })

    swept = [row for row in rows if row["status"] == "swept"]
    unswept = [row for row in rows if row["status"] != "swept"]
    return {
        "schema": "frothseg.classical-constant-ledger/v1",
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "plan": "CAOS_MANAGE/plans/frothseg/research-2026-07-31/PLAN-PROPOSAL.md section 3",
        "acceptance": (
            "Every constant that survives is swept-and-recorded, or documented as a deliberate choice "
            "with its source."
        ),
        "constant_count": len(rows),
        "swept_count": len(swept),
        "not_swept_count": len(unswept),
        "not_swept": [row["constant"] for row in unswept],
        "acceptance_met_for_scored_methods_c1_c3_c4_c5_c7": all(
            row["status"] == "swept"
            for row in rows
            if set(row["consumed_by"]) & {"C1", "C3", "C4", "C5", "C7"}
        ),
        "constants": rows,
    }


def _c7_d32_direction(heldout: dict, c7: dict) -> dict:
    """Does C7 under-estimate or over-estimate the Sauter diameter?

    The plan proposed the constrained watershed on the reading that seam subtraction biases diameters
    DOWN. That is a testable statement, so it is tested here rather than repeated: it is checked
    against the per-case records the benchmark stores, plus the two sweep rows for the mode.

    The check outlived its own premise, which is the point of keeping it. The mode WAS adopted, on the
    primary source rather than on this hypothesis, and `heldout` is now the watershed mode. The
    direction the refutation predicted is exactly what the adoption paid: d32 relative error got worse,
    not better, because growing caps back to the seam ridge enlarges bubbles that were already too
    large."""
    cases = heldout["valley_edge"]["cases"]
    predicted = [case["predicted_bsd"]["d32"] for case in cases if case["predicted_bsd"]["d32"]]
    truth = [case["truth_bsd"]["d32"] for case in cases if case["truth_bsd"]["d32"]]
    mean_predicted = sum(predicted) / len(predicted)
    mean_truth = sum(truth) / len(truth)
    at_radius_3 = {
        point["config"]["mode"]: point["mean_d32_relative_error"]
        for point in c7["points"]
        if point["config"]["seam_radius"] == 3 and point["config"]["watershed_line"] is False
    }
    return {
        "source": "data/derived/classical-heldout.json, valley_edge cases (adopted watershed mode)",
        "n_cases": len(cases),
        "mean_predicted_d32_px": mean_predicted,
        "mean_truth_d32_px": mean_truth,
        "ratio_predicted_over_truth": mean_predicted / mean_truth,
        "proposal_hypothesis": "seam subtraction biases the diameter downward",
        "sweep_d32_relative_error_at_seam_radius_3": {
            "subtract": at_radius_3.get("subtract"),
            "watershed": at_radius_3.get("watershed"),
            "source": "data/derived/phase1/c7-constrained-watershed.json",
        },
        "verdict": (
            "REFUTED, and the refutation was paid for. C7 over-estimates d32 by a factor above 2, so "
            "the seam-subtraction bias was never the source of its d32 relative error and growing the "
            "caps back could not fix it by that mechanism. The mode was adopted anyway, on Meyer 1994 "
            "and on mask quality, and d32 relative error duly got WORSE. That cost is stated in the "
            "constant ledger, in the engine docstring and in verification/phase1-adoption.json."
        ),
    }


def _condition_regressions(baseline: dict, candidate: dict) -> dict:
    worse = {
        condition: {
            "baseline": baseline["mean_ap_by_condition"][condition],
            "candidate": value,
            "delta": value - baseline["mean_ap_by_condition"][condition],
        }
        for condition, value in candidate["mean_ap_by_condition"].items()
        if value < baseline["mean_ap_by_condition"][condition]
    }
    return {
        "baseline_config": baseline["config"],
        "candidate_config": candidate["config"],
        "n_conditions": len(candidate["mean_ap_by_condition"]),
        "n_regressed": len(worse),
        "regressed": worse,
    }


def build_verification(ledger: dict) -> dict:
    baseline = _load("baseline-reproduction.json")
    heldout = {
        entry["method"]: entry
        for entry in json.loads(HELDOUT.read_text(encoding="utf-8"))["methods"]
    }
    factor = _load("foreground-factor-sweep.json")
    cleanup = _load("foreground-cleanup-sweep.json")
    compact = _load("c4-compactness-sweep.json")
    c7 = _load("c7-constrained-watershed.json")
    c3 = _load("c3-flooding-surface.json")
    residual = _load("residual-constants-sweep.json")

    studies = {
        "1.1": ("c4-compactness-sweep.json", compact),
        "1.2": ("foreground-factor-sweep.json", factor),
        "1.2b": ("foreground-cleanup-sweep.json", cleanup),
        "1.3": ("c7-constrained-watershed.json", c7),
        "1.4": ("c3-flooding-surface.json", c3),
        "1.5": ("residual-constants-sweep.json", residual),
    }

    def headline(document: dict, method: str, **fixed) -> dict:
        points = _points(document, method, **fixed)
        best = _best(points)
        return _row(best)

    return {
        "schema": "frothseg.phase1-classical-sweeps/v1",
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "phase": "Phase 1, classical lane measured",
        "plan": "CAOS_MANAGE/plans/frothseg/research-2026-07-31/PLAN-PROPOSAL.md section 3",
        "surface": {
            "cache": "data/cache/learned-v2-192.npz",
            "split": "test",
            "n_images": 64,
            "learned_lane_test_evaluations_spent": 0,
            "note": (
                "Phase 1 contains no model-selection experiment and trains nothing. It spends none of "
                "the learned-lane test-evaluation budget."
            ),
        },
        "published_defaults_changed": [
            {
                "constant": "C3_FLOODING_SURFACE",
                "engine": "data-pipeline/fslab/science/segment.py watershed_hmax",
                "from": "neg_edt",
                "to": "neg_gray",
                "adopted": "2026-08-01",
                "basis": "primary source, Sadr-Kazemi and Cilliers 1997, 10.1016/S0892-6875(97)00094-0",
                "confirmed_on": "verification/phase1-adoption.json",
                "live_twin_updated": "frontend/src/classical/methods.ts watershedHmax",
            },
            {
                "constant": "C7_MODE",
                "engine": "data-pipeline/fslab/science/segment.py valley_edge",
                "from": "subtract",
                "to": "watershed",
                "adopted": "2026-08-01",
                "basis": "primary source, Meyer 1994, 10.1016/0165-1684(94)90060-4",
                "confirmed_on": "verification/phase1-adoption.json",
                "live_twin_updated": "frontend/src/classical/methods.ts valleyEdge",
            },
        ],
        "baseline_reproduction": {
            "artifact": "data/derived/phase1/baseline-reproduction.json",
            "all_seven_engines_identical_to_committed_artifact": baseline["all_identical"],
            "tolerance": baseline["tolerance"],
            "reference": baseline["reference_artifact"],
        },
        "committed_baseline_for_reference": {
            code: {
                "method": method,
                "mean_ap": heldout[method]["mean_ap"],
                "mean_pq": heldout[method]["mean_pq"],
                "mean_boundary_fscore": heldout[method]["mean_boundary_fscore"],
                "mean_bsd_wasserstein": heldout[method]["mean_bsd_wasserstein"],
                "mean_count_absolute_error": heldout[method]["mean_count_absolute_error"],
                "mean_d32_relative_error": heldout[method]["mean_d32_relative_error"],
                "source": "data/derived/classical-heldout.json",
            }
            for method, code in METHOD_CODE.items()
        },
        "studies": {
            name: {
                "study": document["study"],
                "artifact": f"data/derived/phase1/{filename}",
                "point_count": document["point_count"],
                "grid": document["pre_registered_grid"],
                "baseline_config": document["baseline_config"],
            }
            for name, (filename, document) in studies.items()
        },
        "study_artifacts": {
            "1.1": "data/derived/phase1/c4-compactness-sweep.json",
            "1.2": "data/derived/phase1/foreground-factor-sweep.json",
            "1.2b": "data/derived/phase1/foreground-cleanup-sweep.json",
            "1.3": "data/derived/phase1/c7-constrained-watershed.json",
            "1.4": "data/derived/phase1/c3-flooding-surface.json",
            "1.5": "data/derived/phase1/residual-constants-sweep.json",
            "ledger": "data/derived/phase1/classical-constant-ledger.json",
        },
        "best_points_recorded": {
            "1.1 C4 best mean AP over the compactness grid": headline(
                compact, "watershed_dt", watershed_line=False,
            ),
            "1.3 C7 best mean AP over mode and seam radius": _row(_best(c7["points"])),
            "1.4 C3 best mean AP over the flooding surfaces": headline(
                c3, "watershed_hmax", watershed_line=False,
            ),
        },
        "constant_ledger": {
            "artifact": "data/derived/phase1/classical-constant-ledger.json",
            "constant_count": ledger["constant_count"],
            "swept_count": ledger["swept_count"],
            "not_swept": ledger["not_swept"],
            "acceptance_met_for_scored_methods_c1_c3_c4_c5_c7":
                ledger["acceptance_met_for_scored_methods_c1_c3_c4_c5_c7"],
        },
        "hypothesis_checks": {
            "c7_d32_bias_direction": _c7_d32_direction(heldout, c7),
            "c7_best_watershed_condition_regressions": _condition_regressions(
                next(
                    point for point in c7["points"]
                    if point["config"] == {"seam_radius": 3, "mode": "subtract", "watershed_line": False}
                ),
                _best(c7["points"]),
            ),
            "c3_neg_gray_condition_regressions": _condition_regressions(
                next(
                    point for point in c3["points"]
                    if point["config"] == {"surface": "neg_edt", "watershed_line": False}
                ),
                next(
                    point for point in c3["points"]
                    if point["config"] == {"surface": "neg_gray", "watershed_line": False}
                ),
            ),
        },
        "adoption_status": {
            "defaults_changed": "two, C3_FLOODING_SURFACE and C7_MODE",
            "date": "2026-08-01",
            "evidence": "verification/phase1-adoption.json",
            "what_qualified_them": (
                "Neither was adopted for winning its sweep. Each was adopted because the engine was not "
                "implementing the source the registry already cites for that method: C3 floods the "
                "negated grayscale per Sadr-Kazemi and Cilliers 1997, and C7 is a constrained "
                "watershed per Meyer 1994. A sweep score alone was explicitly not sufficient, which is "
                "why C7's seam_radius, C7's watershed_line, C4's compactness and the 0.75 Otsu factor "
                "did not move: their only argument would have been the score on the surface the score "
                "was read on."
            ),
            "how_the_two_blockers_were_cleared": {
                "observed_surface": (
                    "Every sweep above was measured on the 64-image test split, so a sweep number is "
                    "not quotable as the effect of the change. One untouched reserve slice from "
                    "verification/phase2-data-preregistration.json was spent to measure BEFORE and "
                    "AFTER on data the sweeps never saw, and the spend is recorded in "
                    "verification/reserve-slice-ledger.json. The reserve numbers are the published "
                    "effect; the sweep numbers are the motivation."
                ),
                "two_lane_change": (
                    "The JavaScript twins in frontend/src/classical/methods.ts were moved to the same "
                    "surface and the same mode in the same change, and every committed classical "
                    "artifact was re-baked from the new defaults."
                ),
            },
            "decision_owner": "Felipe",
        },
    }


def main() -> None:
    ledger = build_ledger()
    (PHASE1 / "classical-constant-ledger.json").write_text(
        json.dumps(ledger, indent=2), encoding="utf-8",
    )
    verification = build_verification(ledger)
    VERIFICATION.parent.mkdir(parents=True, exist_ok=True)
    VERIFICATION.write_text(json.dumps(verification, indent=2), encoding="utf-8")
    print(f"constants: {ledger['constant_count']}, swept: {ledger['swept_count']}")
    print(f"not swept: {ledger['not_swept']}")
    print(f"wrote {(PHASE1 / 'classical-constant-ledger.json').relative_to(ROOT).as_posix()}")
    print(f"wrote {VERIFICATION.relative_to(ROOT).as_posix()}")
    if not verification["baseline_reproduction"]["all_seven_engines_identical_to_committed_artifact"]:
        sys.exit("baseline reproduction failed")


if __name__ == "__main__":
    main()
