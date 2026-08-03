"""R-3: settle the classical tier's residual constants under one protocol, like for like.

Pre-registered 2026-08-03 (CAOS_MANAGE plans/frothseg/r3-classical-tier-like-for-like-
preregistration-2026-08-03.md). Read that first; this script only executes it.

WHY. R-2 selected and confirmed C3's flooding depth and left the other six classical methods
untuned, so the published classical ranking compares one tuned method against six untuned ones.
Tuning C3 alone made the tier LESS like-for-like, not more. Separately, FOREGROUND_OTSU_FACTOR has
an open +0.019 question that no generation-1 reserve slice could resolve. Both are settled here, in
one study, because the Otsu factor is common-mode and cannot be separated from the rest.

A CORRECTION THIS STUDY CARRIES. Phase 1 declared FOREGROUND_DEPENDANTS as five methods. All seven
respond to the constant: C2 moves 1108 -> 922 instances and C6 250 -> 611 across the grid ends on a
single calibration image. The original sweep therefore measured a tier-wide constant on 5/7 of the
tier. Stage A below evaluates all seven.

TWO STAGES, ONE ORDER, NO ITERATION. The common-mode constant is selected first on the tier mean;
the two per-method constants are then selected on the surface it produces. Stage B does not revisit
Stage A. Iterating on a selection surface until it stops moving is how a selection surface gets
overfit.

SELECTION SURFACE. The calibration split, which the pipeline contract designates for calibrating
post-processing and which no classical sweep has consulted. Not test (burned, and where the gap was
first seen). Not validation (R-2 spent it selecting C3's depth).

    .venv-gpu/Scripts/python.exe scripts/r3_classical_tier.py --stage select
    .venv-gpu/Scripts/python.exe scripts/r3_classical_tier.py --stage confirm --slice l1
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy import stats

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))
sys.path.insert(0, str(ROOT / "scripts"))

from fslab.learning.data_cache import load_cache, select_split  # noqa: E402
from fslab.science import segment  # noqa: E402
from fslab.science.segment import full_instance_metrics  # noqa: E402

from phase1_classical_sweeps import CACHE, METHODS, _environment  # noqa: E402

G2_ARCHIVE = ROOT / "data/cache/learned-v2-192-reserve-g2.npz"
G2_PREREG = ROOT / "verification/reserve-g2-preregistration.json"
LEDGER = ROOT / "verification/reserve-slice-ledger.json"
SELECTION_OUT = ROOT / "data/derived/r3/selection.json"
OUT = ROOT / "verification/r3-classical-tier.json"

# Grids exactly as fixed in Phase 1. Widening one after seeing where the optimum sits is selection
# by another name, so an optimum on an endpoint is reported as an unresolved boundary instead.
OTSU_GRID = [0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 1.00, 1.05, 1.10]
C2_GRID = [1, 2, 3, 4, 6]
C5_GRID = [0.02, 0.04, 0.06, 0.08, 0.12, 0.20]

# id -> registry key, in the published order. All seven, per the correction above.
TIER = {
    "C1": "otsu_cc",
    "C2": "watershed_immersion",
    "C3": "watershed_hmax",
    "C4": "watershed_dt",
    "C5": "watershed_hmin",
    "C6": "slic_merge",
    "C7": "valley_edge",
}

# Tier thresholds, applied to the calibration-observed joint effect. AMENDED 2026-08-03, before any
# generation-2 slice was read, when the sizing defect below was found: the thresholds originally
# read 0.050/0.025 from the image-based resolutions, and are restated here against the corrected
# group-based ones. The amendment is recorded in the pre-registration and changes only the mapping
# from effect to slice, never the adoption rule.
TIER_RULE = [(0.070, "s1", 32), (0.035, "m1", 128), (0.0, "l1", 512)]

# The unit of replication is the latent geometry group. Every group is rendered as two appearance
# variants sharing the same geometry, so the two images of a group are not independent observations
# and a per-image t-test claims about twice the degrees of freedom it has earned. The confirmation
# averages the paired delta within group and tests across groups.
CLUSTER_BY_GROUP = True


def shipped() -> dict:
    """The engine as it ships. Read from the module, never retyped, so this cannot drift."""
    return {
        "otsu_factor": segment.FOREGROUND_OTSU_FACTOR,
        "c2_min_distance": segment.C2_MIN_DISTANCE,
        "c5_h_minima": segment.C5_H_MINIMA,
    }


def per_image_ap(cache: dict, method: str, **kwargs) -> np.ndarray:
    """AP for every image, in cache order. Pairing happens on this vector, not on an aggregate."""
    engine = METHODS[method]
    out = np.empty(len(cache["images"]), dtype=np.float64)
    for index, image in enumerate(cache["images"]):
        labels = engine(image.astype(np.float32) / 255.0, **kwargs)
        out[index] = full_instance_metrics(labels, cache["labels"][index])["ap"]
    return out


def engine_kwargs(config: dict, method_id: str) -> dict:
    """Translate a three-constant configuration into this method's call kwargs."""
    kwargs: dict = {"otsu_factor": config["otsu_factor"]}
    if method_id == "C2":
        kwargs["min_distance"] = config["c2_min_distance"]
    elif method_id == "C5":
        kwargs["h"] = config["c5_h_minima"]
    return kwargs


def tier_matrix(cache: dict, config: dict) -> dict[str, np.ndarray]:
    """Per-image AP for every classical method at one configuration."""
    return {
        method_id: per_image_ap(cache, key, **engine_kwargs(config, method_id))
        for method_id, key in TIER.items()
    }


def tier_mean_per_image(matrix: dict[str, np.ndarray]) -> np.ndarray:
    """The primary statistic's per-image vector: mean over C1-C7 for each image."""
    return np.mean(np.stack([matrix[m] for m in TIER], axis=0), axis=0)


def _log(label: str, value: float, extra: str = "") -> None:
    print(f"  {label:<34}{value:>9.4f}  {extra}", flush=True)


def stage_select(args: argparse.Namespace) -> None:
    cache = select_split(load_cache(CACHE), "calibration")
    base = shipped()
    print(f"selection surface: calibration, n={len(cache['images'])}")
    print(f"shipped: {base}\n")

    print("Stage A  FOREGROUND_OTSU_FACTOR, criterion = classical tier mean AP over all seven")
    stage_a = []
    for factor in OTSU_GRID:
        config = {**base, "otsu_factor": factor}
        matrix = tier_matrix(cache, config)
        vector = tier_mean_per_image(matrix)
        row = {
            "otsu_factor": factor,
            "tier_mean_ap": float(vector.mean()),
            "per_method_ap": {m: float(v.mean()) for m, v in matrix.items()},
        }
        stage_a.append(row)
        _log(f"otsu_factor={factor:.2f}", row["tier_mean_ap"])

    best_a = max(stage_a, key=lambda row: row["tier_mean_ap"])
    selected_otsu = best_a["otsu_factor"]
    endpoint = selected_otsu in (OTSU_GRID[0], OTSU_GRID[-1])
    print(f"\n  Stage A argmax: {selected_otsu}  (endpoint: {endpoint})\n")

    print("Stage B  per-method constants, held at the Stage A value")
    stage_b: dict = {}
    for name, grid, method_id, field in (
        ("C2_MIN_DISTANCE", C2_GRID, "C2", "c2_min_distance"),
        ("C5_H_MINIMA", C5_GRID, "C5", "c5_h_minima"),
    ):
        rows = []
        for value in grid:
            config = {**base, "otsu_factor": selected_otsu, field: value}
            vector = per_image_ap(cache, TIER[method_id], **engine_kwargs(config, method_id))
            rows.append({field: value, "mean_ap": float(vector.mean())})
            _log(f"{name}={value}", rows[-1]["mean_ap"])
        best = max(rows, key=lambda row: row["mean_ap"])
        stage_b[name] = {
            "field": field,
            "grid": grid,
            "points": rows,
            "selected": best[field],
            "on_endpoint": best[field] in (grid[0], grid[-1]),
        }
        print(f"  {name} argmax: {best[field]}\n")

    proposed = {
        "otsu_factor": selected_otsu,
        "c2_min_distance": stage_b["C2_MIN_DISTANCE"]["selected"],
        "c5_h_minima": stage_b["C5_H_MINIMA"]["selected"],
    }

    # The joint effect on the selection surface. This sizes the confirmation and nothing else.
    shipped_vector = tier_mean_per_image(tier_matrix(cache, base))
    proposed_vector = tier_mean_per_image(tier_matrix(cache, proposed))
    joint = float(proposed_vector.mean() - shipped_vector.mean())

    slice_id, slice_n = next((sid, n) for threshold, sid, n in TIER_RULE if joint >= threshold)

    document = {
        "schema": "frothseg.r3-selection/v1",
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "preregistration": (
            "CAOS_MANAGE plans/frothseg/r3-classical-tier-like-for-like-preregistration-2026-08-03.md"
        ),
        "selection_surface": {
            "split": "calibration",
            "n": len(cache["images"]),
            "why": (
                "The pipeline contract designates the calibration split for calibrating "
                "post-processing, which is exactly what these three constants are. No classical "
                "constant sweep has consulted it. Test is burned and is where the gap was first "
                "seen; validation was spent by R-2 selecting C3's depth."
            ),
        },
        "phase1_dependant_list_was_incomplete": (
            "Phase 1 declared FOREGROUND_DEPENDANTS as five methods and swept the constant on "
            "those. All seven respond: on one calibration image, C2 moves 1108 -> 922 instances "
            "and C6 250 -> 611 across the grid ends. Stage A here evaluates all seven, so its "
            "tier mean is over the full tier the constant actually moves."
        ),
        "shipped": base,
        "stage_a": {
            "constant": "FOREGROUND_OTSU_FACTOR",
            "common_mode": True,
            "criterion": "classical tier mean AP, unweighted over C1-C7",
            "grid": OTSU_GRID,
            "points": stage_a,
            "selected": selected_otsu,
            "on_endpoint": endpoint,
        },
        "stage_b": stage_b,
        "proposed": proposed,
        "joint_effect_on_selection_surface": round(joint, 5),
        "confirmation_slice": {
            "slice": slice_id,
            "n": slice_n,
            "chosen_by": (
                "the tier rule fixed in the pre-registration, applied to the joint effect observed "
                "on the calibration split, before the reserve was touched"
            ),
        },
        "environment": _environment(),
    }
    SELECTION_OUT.parent.mkdir(parents=True, exist_ok=True)
    SELECTION_OUT.write_text(json.dumps(document, indent=2), encoding="utf-8")

    print(f"proposed: {proposed}")
    print(f"joint effect on calibration: {joint:+.4f}")
    print(f"confirmation slice by the fixed rule: {slice_id} (n={slice_n})")
    print(f"\nwrote {SELECTION_OUT.relative_to(ROOT).as_posix()}")


def _load_slice(slice_id: str) -> dict:
    """Load one generation-2 slice, checking it is the surface that was reserved."""
    prereg = json.loads(G2_PREREG.read_text(encoding="utf-8"))
    if hashlib.sha256(G2_ARCHIVE.read_bytes()).hexdigest() != prereg["archive_sha256"]:
        raise SystemExit("generation 2 archive does not match its pre-registration hash")
    ledger = json.loads(LEDGER.read_text(encoding="utf-8"))
    if slice_id in {entry["reserve_study"] for entry in ledger["entries"]}:
        raise SystemExit(f"slice {slice_id} is already spent; its guarantee is void")

    data = np.load(G2_ARCHIVE, allow_pickle=True)
    studies = np.array([str(v) for v in data["reserve_studies"]])
    rows = np.flatnonzero(studies == slice_id)
    meta = prereg["per_slice"][slice_id]
    if len(rows) != meta["n_samples"]:
        raise SystemExit(f"{slice_id}: {len(rows)} rows, pre-registration says {meta['n_samples']}")

    sample_ids = [str(data["sample_ids"][i]) for i in rows]
    id_hash = hashlib.sha256("\n".join(sorted(sample_ids)).encode("utf-8")).hexdigest()
    if id_hash != meta["sample_ids_sha256"]:
        raise SystemExit(f"{slice_id}: sample ids do not match the pre-registration")

    return {
        "images": data["images"][rows],
        "labels": data["labels"][rows],
        "sample_ids": sample_ids,
        "group_ids": [str(data["group_ids"][i]) for i in rows],
        "resolvable": meta["resolvable_paired_delta"],
        "n": len(rows),
        "n_groups": meta["n_groups"],
    }


def cluster(vector: np.ndarray, group_ids: list[str]) -> np.ndarray:
    """Collapse a per-image vector to one value per latent geometry group.

    A group's two appearance variants share their geometry, so they are one observation rendered
    twice, not two observations. Testing across images would claim about double the degrees of
    freedom the design supplies. Averaging within group first is the conservative reading, and it
    is the basis the reserve tiers are sized against.
    """
    order: list[str] = []
    buckets: dict[str, list[float]] = {}
    for value, group in zip(vector, group_ids, strict=True):
        if group not in buckets:
            buckets[group] = []
            order.append(group)
        buckets[group].append(float(value))
    return np.array([float(np.mean(buckets[group])) for group in order], dtype=np.float64)


def _holm(pvalues: dict[str, float], alpha: float = 0.05) -> dict[str, dict]:
    """Holm-Bonferroni over the seven per-method tests. Step-down, monotone-enforced."""
    order = sorted(pvalues, key=lambda key: pvalues[key])
    total = len(order)
    out: dict[str, dict] = {}
    running = 0.0
    for rank, key in enumerate(order):
        adjusted = min(1.0, (total - rank) * pvalues[key])
        running = max(running, adjusted)  # Holm-adjusted p values must be non-decreasing
        out[key] = {
            "p_raw": round(pvalues[key], 6),
            "p_holm": round(running, 6),
            "significant": bool(running < alpha),
        }
    return out


def stage_confirm(args: argparse.Namespace) -> None:
    selection = json.loads(SELECTION_OUT.read_text(encoding="utf-8"))
    expected = selection["confirmation_slice"]["slice"]
    if args.slice != expected:
        raise SystemExit(
            f"the fixed tier rule selected {expected}; refusing to read {args.slice}. "
            "Choosing a different n after selection is sizing on the result."
        )

    data = _load_slice(args.slice)
    base, proposed = selection["shipped"], selection["proposed"]
    print(f"confirmation: slice {args.slice}, n={data['n']}, resolves {data['resolvable']}")
    print(f"  shipped:  {base}")
    print(f"  proposed: {proposed}\n")

    before = tier_matrix(data, base)
    after = tier_matrix(data, proposed)
    groups = data["group_ids"]

    # Cluster to one observation per latent geometry group BEFORE any test. See cluster().
    before_tier = cluster(tier_mean_per_image(before), groups)
    after_tier = cluster(tier_mean_per_image(after), groups)
    delta = after_tier - before_tier
    t_stat, p_value = stats.ttest_rel(after_tier, before_tier)

    per_method: dict[str, dict] = {}
    raw_p: dict[str, float] = {}
    for method_id in TIER:
        method_before = cluster(before[method_id], groups)
        method_after = cluster(after[method_id], groups)
        method_delta = method_after - method_before
        if np.allclose(method_delta, 0.0):
            # An unmoved method has no test; scipy would return NaN and Holm would propagate it.
            raw_p[method_id] = 1.0
        else:
            raw_p[method_id] = float(stats.ttest_rel(method_after, method_before)[1])
        per_method[method_id] = {
            "before_mean_ap": float(method_before.mean()),
            "after_mean_ap": float(method_after.mean()),
            "paired_delta": float(method_delta.mean()),
            "paired_sd": float(method_delta.std(ddof=1)),
        }
    holm = _holm(raw_p)
    for method_id in TIER:
        per_method[method_id].update(holm[method_id])

    # The two pre-registered clauses. Adopt all three values or none.
    primary_pass = bool(delta.mean() > 0 and p_value < 0.05)
    regressors = {
        method_id: row["paired_delta"]
        for method_id, row in per_method.items()
        if row["paired_delta"] < -data["resolvable"]
    }
    adopted = bool(primary_pass and not regressors)

    for method_id in TIER:
        row = per_method[method_id]
        _log(
            f"{method_id} {TIER[method_id]}",
            row["paired_delta"],
            f"{row['before_mean_ap']:.4f} -> {row['after_mean_ap']:.4f}  p_holm={row['p_holm']:.4f}",
        )
    print(f"\n  tier mean paired delta: {delta.mean():+.5f}  p={p_value:.2e}  t={t_stat:.3f}")
    print(f"  primary clause: {'PASS' if primary_pass else 'FAIL'}")
    print(f"  regression clause: {'PASS' if not regressors else f'FAIL {regressors}'}")
    print(f"\n  ADOPTED: {adopted}")

    document = {
        "schema": "frothseg.r3-classical-tier/v1",
        "study": "R-3 classical tier like-for-like constant selection",
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "preregistration": selection["preregistration"],
        "motivation": (
            "R-2 tuned C3's flooding depth and left six classical methods untuned, so the "
            "published classical ranking compared one tuned method against six untuned ones. This "
            "study gives every affected constant the same treatment under one protocol. The open "
            "FOREGROUND_OTSU_FACTOR question is settled as part of it, not as its purpose."
        ),
        "selection": selection,
        "confirmation": {
            "reserve_study": args.slice,
            "generation": 2,
            "n_images": data["n"],
            "n_independent": data["n_groups"],
            "unit_of_replication": (
                "latent geometry group. Each group is rendered as two appearance variants sharing "
                "one geometry, so the paired delta is averaged within group before it is tested. "
                "Testing across images would claim about twice the degrees of freedom the design "
                "supplies."
            ),
            "resolvable_paired_delta": data["resolvable"],
            "sample_ids_sha256": hashlib.sha256(
                "\n".join(sorted(data["sample_ids"])).encode("utf-8")
            ).hexdigest(),
            "primary": {
                "statistic": "paired per-image delta in classical tier mean AP over C1-C7",
                "before_mean": float(before_tier.mean()),
                "after_mean": float(after_tier.mean()),
                "paired_delta": float(delta.mean()),
                "paired_sd": float(delta.std(ddof=1)),
                "t": float(t_stat),
                "p": float(p_value),
                "n_paired": int(len(delta)),
            },
            "per_method": per_method,
            "multiplicity": "Holm-Bonferroni across the seven per-method tests, alpha 0.05",
        },
        "decision": {
            "adopted": adopted,
            "primary_clause_passed": primary_pass,
            "regression_clause_passed": not regressors,
            "regressors": regressors,
            "rule": (
                "Adopt all three values or none. Primary paired delta > 0 with p < 0.05, and no "
                "individual method regresses by more than the slice's own resolvable delta, which "
                "is the strongest no-regression claim this surface supports."
            ),
            "shipped": base,
            "proposed": proposed,
        },
        "environment": _environment(),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(document, indent=2), encoding="utf-8")
    print(f"\nwrote {OUT.relative_to(ROOT).as_posix()}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", choices=["select", "confirm"], required=True)
    parser.add_argument("--slice", default=None)
    args = parser.parse_args()
    if args.stage == "select":
        stage_select(args)
    else:
        if not args.slice:
            raise SystemExit("--slice is required for the confirmation stage")
        stage_confirm(args)


if __name__ == "__main__":
    main()
