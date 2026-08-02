"""Re-sweep, against the engine as it is now, the constants whose grids went stale on adoption.

The problem this closes. `scripts/phase1_classical_sweeps.py` swept every classical constant while
holding the OTHER defaults at their then-published values. On 2026-08-01 two of those defaults
changed:

    C3 `watershed_hmax.surface`   neg_edt   ->  neg_gray
    C7 `valley_edge.mode`         subtract  ->  watershed

Any constant that interacts with those two was therefore swept on an engine that no longer exists.
`watershed_hmax.h` is a flooding depth measured against the negated DISTANCE TRANSFORM; C3 now
floods the negated IMAGE, where a depth of 0.06 is a different physical quantity entirely.
`valley_edge.min_cap_size` filtered caps that were then labelled directly; those caps are now
watershed markers. The Otsu factor and the two cleanup areas feed both.

The pre-adoption artifacts under `data/derived/phase1/` are the historical record of WHY the
adoption happened and are deliberately not re-run: replacing them would replace the evidence with
its own consequence. This study is the other half, and it is a different question. Not "was the
change justified" but "is each surviving constant still defensible on the engine that shipped".

This study ADOPTS NOTHING. It is measured on the already-burned classical test split, so choosing a
new value from a maximum here would be selection on an observed surface, which is exactly what the
repository's adoption discipline exists to prevent. The output records, per constant, whether the
published value is still at or near its grid optimum. A constant that has clearly moved is a
FINDING, and promoting it needs its own pre-registration, its own primary-source justification and
its own reserve confirmation, as C3 and C7 got.
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
from fslab.science import segment  # noqa: E402

from phase1_classical_sweeps import (  # noqa: E402
    CACHE,
    FOREGROUND_FACTOR_GRID,
    HOLE_MAX_SIZE_GRID,
    OBJECT_MAX_SIZE_GRID,
    _environment,
    evaluate,
)

OUT = ROOT / "data/derived/phase1b/postadoption-constant-recheck.json"

# The constants whose pre-adoption grid is stale, why, and the value the engine ships today.
# `published` is read from the engine at runtime rather than retyped, so this file cannot drift
# from the code the way the sweeps drifted from the engine.
STALE = [
    {
        "constant": "C3_H_MAXIMA",
        "method": "watershed_hmax",
        "parameter": "h",
        "grid": [0.02, 0.04, 0.06, 0.08, 0.12, 0.20],
        "why_stale": (
            "swept while C3 flooded neg_edt; C3 now floods neg_gray, where a flooding depth is "
            "a fraction of image intensity rather than of distance-transform depth"
        ),
    },
    {
        "constant": "C7_MIN_CAP_SIZE",
        "method": "valley_edge",
        "parameter": "min_cap_size",
        "grid": [0, 4, 8, 16, 32],
        "why_stale": (
            "swept while C7 subtracted the seam and labelled the enclosed caps; those caps are "
            "now watershed markers, so the filter feeds a different downstream stage"
        ),
    },
]

# The two shared foreground constants, re-measured on the two dependants whose engines changed.
SHARED = [
    {
        "constant": "FOREGROUND_OTSU_FACTOR",
        "parameter": "otsu_factor",
        "grid": FOREGROUND_FACTOR_GRID,
        "dependants": ["watershed_hmax", "valley_edge"],
    },
    {
        "constant": "FOREGROUND_HOLE_MAX_SIZE",
        "parameter": "hole_max_size",
        "grid": HOLE_MAX_SIZE_GRID,
        "dependants": ["watershed_hmax", "valley_edge"],
    },
    {
        "constant": "FOREGROUND_OBJECT_MAX_SIZE",
        "parameter": "object_max_size",
        "grid": OBJECT_MAX_SIZE_GRID,
        "dependants": ["watershed_hmax", "valley_edge"],
    },
]

# The decision metric is fixed here, before any point is run, so a maximum cannot be picked
# post hoc on whichever metric happens to favour a value.
DECISION_METRIC = "mean_ap"


def _published_default(method: str, parameter: str):
    """Read the shipped value out of the engine's own signature rather than restating it here.

    Taken from the bound default of the engine callable, so this study cannot drift from the code
    the way the pre-adoption sweeps drifted from it.
    """
    import inspect

    signature = inspect.signature(segment.METHODS[method])
    if parameter in signature.parameters:
        default = signature.parameters[parameter].default
        if default is not inspect.Parameter.empty:
            return default
    # The foreground constants reach the engines through **foreground_kwargs, so they are not in
    # the engine signature; they carry their defaults on _foreground itself.
    foreground = inspect.signature(segment._foreground)
    if parameter in foreground.parameters:
        return foreground.parameters[parameter].default
    raise KeyError(f"no default found for {method}.{parameter}")


def _summarize(points: list[dict], published) -> dict:
    values = [point["config_value"] for point in points]
    scores = [point[DECISION_METRIC] for point in points]
    best_index = int(np.argmax(scores))
    published_index = values.index(published) if published in values else None
    published_score = scores[published_index] if published_index is not None else None
    return {
        "decision_metric": DECISION_METRIC,
        "published_value": published,
        "published_in_grid": published_index is not None,
        "published_score": published_score,
        "grid_best_value": values[best_index],
        "grid_best_score": scores[best_index],
        "published_is_grid_best": published_index == best_index,
        "gap_to_grid_best": (
            round(scores[best_index] - published_score, 6)
            if published_score is not None else None
        ),
        "relative_gap_pct": (
            round((scores[best_index] / published_score - 1) * 100, 3)
            if published_score else None
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=OUT)
    args = parser.parse_args()

    cache = select_split(load_cache(CACHE), "test")
    studies = []

    for item in STALE:
        published = _published_default(item["method"], item["parameter"])
        print(f"\n=== {item['constant']} (ships {published})", flush=True)
        points = []
        for value in item["grid"]:
            point = evaluate(cache, item["method"], **{item["parameter"]: value})
            point["config_value"] = value
            points.append(point)
            print(
                f"  {item['parameter']}={value!r:>8}  AP={point['mean_ap']:.4f}  "
                f"PQ={point['mean_pq']:.4f}  d32={point['mean_d32_relative_error']:.4f}",
                flush=True,
            )
        studies.append({
            **{k: v for k, v in item.items() if k != "grid"},
            "grid": item["grid"],
            "verdict": _summarize(points, published),
            "points": points,
        })

    for item in SHARED:
        for method in item["dependants"]:
            published = _published_default(method, item["parameter"])
            print(f"\n=== {item['constant']} on {method} (ships {published})", flush=True)
            points = []
            for value in item["grid"]:
                point = evaluate(cache, method, **{item["parameter"]: value})
                point["config_value"] = value
                points.append(point)
                print(
                    f"  {item['parameter']}={value!r:>8}  AP={point['mean_ap']:.4f}  "
                    f"PQ={point['mean_pq']:.4f}",
                    flush=True,
                )
            studies.append({
                "constant": item["constant"],
                "method": method,
                "parameter": item["parameter"],
                "why_stale": (
                    f"shared foreground constant feeding {method}, whose engine changed on "
                    "2026-08-01; the pre-adoption sweep measured it against the old one"
                ),
                "grid": item["grid"],
                "verdict": _summarize(points, published),
                "points": points,
            })

    moved = [
        study for study in studies
        if not study["verdict"]["published_is_grid_best"]
        and (study["verdict"]["relative_gap_pct"] or 0) > 1.0
    ]
    document = {
        "schema": "frothseg.phase1b-postadoption/v1",
        "study": "postadoption-constant-recheck",
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "question": (
            "Is each constant that survived Phase 1 still defensible on the engine that shipped, "
            "given that C3's flooding surface and C7's mode both changed after it was swept?"
        ),
        "adopts_nothing": True,
        "why_it_adopts_nothing": (
            "Measured on the already-burned classical test split. Selecting a value from a maximum "
            "on an observed surface is the failure mode the adoption discipline exists to prevent. "
            "A constant flagged here is a finding, and promoting it needs its own pre-registration, "
            "primary-source justification and reserve confirmation."
        ),
        "supersedes_nothing": (
            "The pre-adoption artifacts in data/derived/phase1/ stay as the record of why C3 and C7 "
            "changed. This study answers a different question and does not replace them."
        ),
        "decision_metric": DECISION_METRIC,
        "surface": {"cache": CACHE.relative_to(ROOT).as_posix(), "split": "test", "n_images": 64},
        "environment": _environment(),
        # Recorded because adopting one constant makes the others' verdicts stale in exactly the
        # way this study exists to catch: the first run of it was measured with C3_H_MAXIMA at
        # 0.06, and R-2 then moved that to 0.12, so the foreground verdicts on watershed_hmax had
        # to be re-measured against the engine that shipped.
        "engine_defaults_at_run": {
            "C3_FLOODING_SURFACE": getattr(segment, "C3_FLOODING_SURFACE", None),
            "C3_H_MAXIMA": getattr(segment, "C3_H_MAXIMA", None),
            "C7_MODE": getattr(segment, "C7_MODE", None),
            "C7_MIN_CAP_SIZE": getattr(segment, "C7_MIN_CAP_SIZE", None),
            "FOREGROUND_OTSU_FACTOR": getattr(segment, "FOREGROUND_OTSU_FACTOR", None),
            "FOREGROUND_HOLE_MAX_SIZE": getattr(segment, "FOREGROUND_HOLE_MAX_SIZE", None),
            "FOREGROUND_OBJECT_MAX_SIZE": getattr(segment, "FOREGROUND_OBJECT_MAX_SIZE", None),
        },
        "constants_checked": len(studies),
        "constants_moved": [study["constant"] + "@" + study["method"] for study in moved],
        "studies": studies,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, indent=2), encoding="utf-8")

    print("\n" + "=" * 78)
    for study in studies:
        verdict = study["verdict"]
        state = "at grid best" if verdict["published_is_grid_best"] else (
            f"grid best is {verdict['grid_best_value']!r} "
            f"({verdict['relative_gap_pct']:+.2f}% {DECISION_METRIC})"
        )
        print(f"{study['constant']:<28} {study['method']:<16} ships {verdict['published_value']!r:>8}  {state}")
    print(f"\nwrote {args.output.relative_to(ROOT).as_posix()}")


if __name__ == "__main__":
    main()
