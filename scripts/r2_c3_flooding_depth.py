"""R-2: re-derive C3's h-maxima depth for the surface C3 actually floods.

Pre-registered in `CAOS_MANAGE/plans/frothseg/research-2026-07-31/
r2-c3-flooding-depth-preregistration-2026-08-01.md`. Read it before this file; every bar below was
fixed there.

This study was originally justified as fixing a UNIT ERROR: `C3_H_MAXIMA` is a depth, and the
argument ran that a depth carries the units of the surface it is measured on, so the flooding-surface
adoption had left this one in the wrong units.

THAT JUSTIFICATION IS FALSE and is withdrawn, 2026-08-02: `h` is applied to the
INTENSITY image by `morphology.h_maxima(gray, h=h)`, and the flooding surface enters separately as
the first argument of `segmentation.watershed`. No depth is ever applied to the flooding surface, in
any commit of segment.py, so the neg_edt -> neg_gray change cannot have altered this constant's
units. The 29248-against-17846 over-count quoted as proof is identical on all four flooding surfaces
at h=0.06 (data/derived/phase1/c3-flooding-surface.json): it was C3's marker count, not a surface
effect.

What this script actually does is select the argmax of validation mean AP over a pre-registered
grid. That is TUNING. It is disciplined tuning, because the selection surface is a split no
classical sweep had observed and the effect is confirmed on an untouched reserve slice, and the
measurement stands. The stated reason for it did not. Full account: CAOS_MANAGE
plans/frothseg/research-2026-07-31/r2-correction-2026-08-02.md.

Selection happens on the `validation` split, which no classical constant sweep has ever touched.
It is deliberately NOT the test split where the gap was first seen. Confirmation is one
non-iterated pass over reserve slice p4, before and after, and the reserve is what gets published
as the effect.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))
sys.path.insert(0, str(ROOT / "scripts"))

from fslab.learning.data_cache import load_cache, select_split  # noqa: E402
from fslab.science.segment import (  # noqa: E402
    METHODS,
    full_instance_metrics,
    summarize_metric_rows,
)

from confirm_phase1_adoption import (  # noqa: E402
    LEDGER,
    PREREGISTRATION,
    RESERVE_CACHE,
    _environment,
    _file_hash,
    _id_hash,
    load_reserve_slice,
    paired_delta,
)

CACHE = ROOT / "data/cache/learned-v2-192.npz"
OUT = ROOT / "verification/r2-c3-flooding-depth.json"

METHOD = "watershed_hmax"
PARAMETER = "h"
GRID = [0.02, 0.04, 0.06, 0.08, 0.12, 0.20]   # exactly the pre-registered Phase 1 grid
DECISION_METRIC = "mean_ap"                    # bar S2
SELECTION_SPLIT = "validation"                 # bar S1
RESERVE_STUDY = "p4"                           # bar S4
SHIPPED = 0.06

REPORTED = (
    "mean_ap", "mean_ap50", "mean_ap75", "mean_pq", "mean_sq", "mean_rq",
    "mean_boundary_precision", "mean_boundary_recall", "mean_boundary_fscore",
    "mean_bsd_wasserstein", "mean_count_absolute_error", "mean_count_relative_error",
    "mean_d10_relative_error", "mean_d32_relative_error", "mean_d50_relative_error",
    "mean_d90_relative_error",
)
# Metrics where a LOWER number is the better one. Judging these by sign alone is how an earlier
# adoption artifact came to label its own cost an improvement.
LOWER_IS_BETTER = (
    "wasserstein", "absolute_error", "relative_error",
)


def lower_is_better(metric: str) -> bool:
    return any(token in metric for token in LOWER_IS_BETTER)


def evaluate(images, labels, sample_ids, conditions, split: str, **kwargs):
    engine = METHODS[METHOD]
    rows = []
    for index, image in enumerate(images):
        predicted = engine(image.astype(np.float32) / 255.0, **kwargs)
        rows.append({
            "sample_id": str(sample_ids[index]),
            "condition_id": str(conditions[index]),
            **full_instance_metrics(predicted, labels[index]),
        })
    summary = summarize_metric_rows(rows, split=split)
    point = {
        "config": dict(kwargs),
        "n": summary["n"],
        **{name: summary[name] for name in REPORTED},
        "total_predicted_instances": int(sum(row["nPred"] for row in rows)),
        "total_true_instances": int(sum(row["nGt"] for row in rows)),
    }
    return point, rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=OUT)
    args = parser.parse_args()

    # ---- S1/S2: selection on the clean validation split -------------------------------------
    split = select_split(load_cache(CACHE), SELECTION_SPLIT)
    print(f"selection on the {SELECTION_SPLIT} split, {len(split['images'])} images", flush=True)
    selection_points = []
    for value in GRID:
        point, _ = evaluate(
            split["images"], split["labels"], split["sample_ids"], split["conditions"],
            SELECTION_SPLIT, **{PARAMETER: value},
        )
        point["config_value"] = value
        selection_points.append(point)
        print(
            f"  h={value:<5} {DECISION_METRIC}={point[DECISION_METRIC]:.4f}  "
            f"PQ={point['mean_pq']:.4f}  nPred={point['total_predicted_instances']}"
            f" (true {point['total_true_instances']})",
            flush=True,
        )

    scores = [point[DECISION_METRIC] for point in selection_points]
    best = max(scores)
    # S2 tie-break: the smaller h, the more conservative move away from the shipped value.
    selected = min(
        GRID[index] for index, score in enumerate(scores) if score == best
    )
    print(f"\nvalidation argmax: h={selected} ({DECISION_METRIC}={best:.4f})", flush=True)

    if selected == SHIPPED:
        print("S3: validation selects the shipped value. Nothing is adopted.", flush=True)

    # ---- S4: confirmation on reserve slice p4, before and after, one pass each ---------------
    # The same three guards confirm_phase1_adoption.main applies before it reads a slice. Importing
    # load_reserve_slice without them would let this study read an archive that had drifted from
    # the pre-registration, or read a slice another study had already burned, and the artifact
    # would record hashes it never checked anything against.
    prereg = json.loads(PREREGISTRATION.read_text(encoding="utf-8"))
    reserve_matrix = prereg["synthetic"]["reserve_matrix"]
    expected_slice = reserve_matrix["per_study"][RESERVE_STUDY]
    if _file_hash(RESERVE_CACHE) != reserve_matrix["cache_sha256"]:
        raise SystemExit(
            "reserve archive does not match the pre-registration hash; refusing to read it"
        )
    reserve = load_reserve_slice(RESERVE_STUDY)
    if (
        _id_hash(reserve["group_ids"]) != expected_slice["group_ids_sha256"]
        or _id_hash(reserve["sample_ids"]) != expected_slice["sample_ids_sha256"]
    ):
        raise SystemExit(
            "reserve slice ids do not match the pre-registration; refusing to read it"
        )
    ledger = json.loads(LEDGER.read_text(encoding="utf-8"))
    spender = next(
        (entry for entry in ledger["entries"] if entry["reserve_study"] == RESERVE_STUDY), None,
    )
    if spender is not None and spender["spent_by"] != "r2-c3-flooding-depth":
        raise SystemExit(
            f"reserve slice {RESERVE_STUDY!r} was already spent by {spender['spent_by']!r}; "
            "a second study reading it would void its guarantee"
        )
    print(
        f"\nreserve slice {RESERVE_STUDY}: {len(reserve['images'])} images, "
        "one non-iterated pass before and after",
        flush=True,
    )
    before_point, before_rows = evaluate(
        reserve["images"], reserve["labels"], reserve["sample_ids"], reserve["conditions"],
        "reserve", **{PARAMETER: SHIPPED},
    )
    after_point, after_rows = evaluate(
        reserve["images"], reserve["labels"], reserve["sample_ids"], reserve["conditions"],
        "reserve", **{PARAMETER: selected},
    )

    # paired_delta reads PER-IMAGE row keys, which are named without the "mean_" prefix the
    # aggregate summary uses ("ap", not "mean_ap"). Passing the aggregate names silently produced
    # n_paired=0 and a NaN mean/CI/win-rate for all 16 metrics: the aggregates looked fine while
    # the paired statistics, which the pre-registration calls its primary readout, were empty.
    deltas = {}
    for metric in REPORTED:
        row_key = metric[len("mean_"):] if metric.startswith("mean_") else metric
        if row_key not in before_rows[0]:
            raise SystemExit(f"metric {metric!r} has no per-image key {row_key!r} to pair on")
        deltas[metric] = paired_delta(before_rows, after_rows, row_key)
    print(
        f"  reserve {DECISION_METRIC}: {before_point[DECISION_METRIC]:.4f} -> "
        f"{after_point[DECISION_METRIC]:.4f}",
        flush=True,
    )

    # S5: name every metric that got worse, in the artifact, next to the gains.
    costs, gains = [], []
    for metric in REPORTED:
        change = after_point[metric] - before_point[metric]
        if change == 0:
            continue
        improved = change < 0 if lower_is_better(metric) else change > 0
        record = {
            "metric": metric,
            "before": before_point[metric],
            "after": after_point[metric],
            "change": change,
            "polarity": "lower_is_better" if lower_is_better(metric) else "higher_is_better",
        }
        (gains if improved else costs).append(record)

    reserve_confirms = (
        (after_point[DECISION_METRIC] > before_point[DECISION_METRIC])
        if selected != SHIPPED else True
    )
    document = {
        "schema": "frothseg.r2-adoption/v1",
        "study": "r2-c3-flooding-depth",
        "preregistration": (
            "CAOS_MANAGE plans/frothseg/research-2026-07-31/"
            "r2-c3-flooding-depth-preregistration-2026-08-01.md"
        ),
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "constant": "C3_H_MAXIMA",
        "justification": (
            "SELECTION ON A SCORE: 0.12 is the argmax of validation mean AP over the "
            "pre-registered 6-point grid, selected on a split no classical sweep had observed "
            "and confirmed on untouched reserve slice p4"
        ),
        "withdrawn_justification": {
            "text": (
                "unit error, not tuning: h is a depth in the units of the flooding surface, and "
                "the surface was adopted from neg_edt to neg_gray while the depth was carried over"
            ),
            "why_false": (
                "h is applied to the intensity image by morphology.h_maxima(gray, h=h); the "
                "flooding surface enters separately and no depth is ever applied to it, in any "
                "commit of segment.py. The 29248-against-17846 over-count quoted as proof is "
                "identical on all four flooding surfaces at h=0.06."
            ),
            "withdrawn_on": "2026-08-02",
            "record": (
                "CAOS_MANAGE plans/frothseg/research-2026-07-31/r2-correction-2026-08-02.md"
            ),
        },
        "grid": GRID,
        "decision_metric": DECISION_METRIC,
        "shipped_value": SHIPPED,
        "selected_value": selected,
        "adopted": selected != SHIPPED and reserve_confirms,
        "selection": {
            "split": SELECTION_SPLIT,
            "n": selection_points[0]["n"],
            "why_not_test": (
                "the test split is where the gap was first seen; selecting there would be "
                "selection on an observed surface. No classical constant sweep has used the "
                "validation split."
            ),
            "points": selection_points,
        },
        "confirmation": {
            "reserve_study": RESERVE_STUDY,
            "observation_note": (
                "One pre-registered observation of slice p4. The two configurations compared were "
                "fixed before the slice was read, and the passes are deterministic, so recomputing "
                "these statistics does not constitute a second look: no decision is re-made on new "
                "information. The first computation of this artifact paired on the aggregate metric "
                "names and produced n_paired=0 with NaN throughout; only the pairing code changed."
            ),
            "n": before_point["n"],
            "sample_ids_sha256": _id_hash(reserve["sample_ids"]),
            "before": before_point,
            "after": after_point,
            "paired_deltas": deltas,
            "confirms_selection": reserve_confirms,
        },
        "gains": gains,
        "costs": costs,
        "costs_note": (
            "Every metric that got worse is listed here and is repeated in "
            "docs/methods/classical.md in the same sentence as the gain, per bar S5."
        ),
        "environment": _environment(),
        "cache_sha256": _file_hash(CACHE),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, indent=2), encoding="utf-8")

    print("\n" + "=" * 78)
    print(f"selected h={selected} (shipped {SHIPPED}); reserve confirms: {reserve_confirms}")
    print(f"gains: {len(gains)} metrics, costs: {len(costs)} metrics")
    for record in costs:
        print(f"   COST {record['metric']}: {record['before']:.4f} -> {record['after']:.4f}")
    print(f"\nwrote {args.output.relative_to(ROOT).as_posix()}")
    print(
        f"\nreserve slice {RESERVE_STUDY} is now SPENT. Record it in "
        f"{LEDGER.relative_to(ROOT).as_posix()} before any further use."
    )


if __name__ == "__main__":
    main()
