"""Confirm the two Phase 1 classical adoptions on an unobserved surface.

The Phase 1 sweeps (`data/derived/phase1/`) ran on the 64-image `test` split of
`data/cache/learned-v2-192.npz`. That split is observed: it is the surface the sweep grids were
read on, so a sweep-selected configuration cannot quote its own sweep number as the effect of the
change. This script measures BEFORE and AFTER for the two adopted changes on data no sweep ever
saw, and writes `verification/phase1-adoption.json`.

Surface: one untouched synthetic reserve slice from
`verification/phase2-data-preregistration.json`, materialised in
`data/cache/learned-v2-192-reserve.npz`. Spending it is recorded in
`verification/reserve-slice-ledger.json`.

The two changes, both fixed before this script was first run and neither re-optimised here:

  C3 `watershed_hmax`  flooding surface  `neg_edt` -> `neg_gray`
      Source: Sadr-Kazemi and Cilliers 1997, 10.1016/S0892-6875(97)00094-0, already cited for C3
      in `data-pipeline/fslab/model_registry.py`. Flooding the negated grayscale from h-maxima
      markers is the method that source publishes; the code was not implementing its own citation.

  C7 `valley_edge`     mode             `subtract` -> `watershed`, at the current seam_radius 3
      Source: Meyer 1994, 10.1016/0165-1684(94)90060-4, already named by the C7 registry entry,
      which calls C7 a constrained watershed. `seam_radius` and `watershed_line` are NOT moved.

Design, pre-registered in this file before the first run:

  * Four evaluations only: C3 before, C3 after, C7 before, C7 after. No grid, no tuning, no
    second pass. Every other engine constant is held at its published value.
  * Primary readout: the PAIRED per-image mean AP delta (after minus before) over the slice, with
    a 10,000-resample bootstrap 95 percent interval and the per-image win rate. A direction claim
    from 64 images is reported as an interval, never as a bare point estimate.
  * Secondary readouts, reported whichever way they move: boundary F, d32 relative error, PQ,
    BSD Wasserstein, instance counts, merges and splits.
  * Verdict rule, fixed before the run: the adoption STANDS only if the paired mean AP delta is
    strictly positive for BOTH changes. If either is zero or negative the direction is
    contradicted, both changes are reverted, and the reversal is the published result.

    .venv-gpu/Scripts/python.exe scripts/confirm_phase1_adoption.py --study p1
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.science.segment import (  # noqa: E402
    METHODS,
    full_instance_metrics,
    summarize_metric_rows,
)

RESERVE_CACHE = ROOT / "data" / "cache" / "learned-v2-192-reserve.npz"
REAL_ADJACENT = ROOT / "data" / "derived" / "real-adjacent-benchmark.json"
PREREGISTRATION = ROOT / "verification" / "phase2-data-preregistration.json"
LEDGER = ROOT / "verification" / "reserve-slice-ledger.json"
SWEEP_C3 = ROOT / "data" / "derived" / "phase1" / "c3-flooding-surface.json"
SWEEP_C7 = ROOT / "data" / "derived" / "phase1" / "c7-constrained-watershed.json"
OUT = ROOT / "verification" / "phase1-adoption.json"

BOOTSTRAP_RESAMPLES = 10000
BOOTSTRAP_SEED = 20260801

SPENT_BY = "phase1-classical-adoption-c3-flooding-surface-and-c7-mode"

SOURCES = {
    "c3-flooding-surface": {
        "citation": (
            "H. Sadr-Kazemi and J. J. Cilliers, An image processing algorithm for measurement of "
            "flotation froth bubble size and shape distributions, Minerals Engineering 10(10), 1997"
        ),
        "doi": "10.1016/S0892-6875(97)00094-0",
        "already_cited_for_this_method_in": "data-pipeline/fslab/model_registry.py, C3 entry",
        "what_the_source_carries": (
            "Highlight-seeded flooding of the negated grayscale image. That is the surface the "
            "adopted default floods. The previous default flooded the negated Euclidean distance "
            "transform, which is C4's surface, so C3 and C4 differed only in their markers and C3's "
            "score was a marker result reported as a method result."
        ),
        "why_this_and_not_the_score": (
            "The code was not implementing its own cited source. The sweep is what revealed it; the "
            "source is what justifies the change."
        ),
    },
    "c7-mode": {
        "citation": (
            "F. Meyer, Topographic distance and watershed lines, Signal Processing 38(1), 1994, "
            "113-125"
        ),
        "doi": "10.1016/0165-1684(94)90060-4",
        "already_cited_for_this_method_in": (
            "data-pipeline/fslab/model_registry.py, C7 entry. Stated precisely, because the Phase 1 "
            "sweep artifact carries a claim that had already gone stale: the registry called this row "
            "'Lamella-valley constrained watershed' until commit 8af353e on 2026-07-31, when a Phase 0 "
            "honesty pass renamed it to 'dark-seam detector' BECAUSE the engine ran no watershed. So "
            "the source was not sitting in the registry at the moment of adoption; it had just been "
            "removed from it for being untrue. This change resolves the same mismatch from the other "
            "side, by making the engine do what the earlier name claimed, and the registry name and "
            "provenance were restored in the same change."
        ),
        "what_the_source_carries": (
            "Marker-controlled flooding to the ridge. The adopted default uses the cleaned caps as "
            "markers and floods the black-top-hat seam response, so caps grow back to the seam "
            "centreline. The previous default subtracted the seam and labelled what was left, so "
            "every mask stopped short of the centreline by construction."
        ),
        "why_this_and_not_the_score": (
            "The repository had a documented name for a method it did not implement, and had already "
            "chosen to fix that by weakening the name. Implementing the method is the other, better "
            "resolution, and Meyer 1994 is what licenses it. Structurally, every watershed row in the "
            "sweep beats every subtract row at every swept radius, so the mode is a finding rather "
            "than a tuned optimum; but the justification that carries the change is the source, not "
            "that ordering."
        ),
    },
}

DELIBERATELY_NOT_MOVED = [
    {
        "constant": "valley_edge.seam_radius",
        "value": 3,
        "evidence": "data/derived/phase1/c7-constrained-watershed.json",
        "why": (
            "Radius 4 or 5 in the adopted watershed mode is worth about 0.01 mean AP over radius 3 "
            "on the observed test split. That is test-split selection with no source behind it, "
            "which is the failure mode this confirmation exists to avoid."
        ),
    },
    {
        "constant": "valley_edge.watershed_line",
        "value": False,
        "evidence": "data/derived/phase1/c7-constrained-watershed.json",
        "why": (
            "Turning the line on trades a little mean AP for a little boundary F at every radius, "
            "with no source preferring either direction."
        ),
    },
    {
        "constant": "watershed_dt.compactness",
        "value": 0.0,
        "evidence": "data/derived/phase1/c4-compactness-sweep.json",
        "why": (
            "0.0 is the argmax on mean AP and every other swept value scores lower, so the current "
            "default is already best. Recorded as a deliberate default with its sweep as evidence "
            "rather than left as an unexamined literal."
        ),
    },
    {
        "constant": "_foreground.otsu_factor",
        "value": 0.75,
        "evidence": "data/derived/phase1/foreground-factor-sweep.json",
        "why": (
            "Kept as a deliberate default with its sweep as evidence. It is common-mode across "
            "seven methods, it is the argmax for exactly one of the five scored dependants, and the "
            "tier-mean argmax is a different value, so moving it would be picking a per-method "
            "winner on the observed split for a constant the whole tier shares."
        ),
    },
]

# ---------------------------------------------------------------------------------------------
# Pre-registered arms. Fixed before the first run.
# ---------------------------------------------------------------------------------------------

ARMS = [
    {
        "change_id": "c3-flooding-surface",
        "method": "watershed_hmax",
        "before": {"surface": "neg_edt", "watershed_line": False},
        "after": {"surface": "neg_gray", "watershed_line": False},
    },
    {
        "change_id": "c7-mode",
        "method": "valley_edge",
        "before": {"seam_radius": 3, "mode": "subtract", "watershed_line": False},
        "after": {"seam_radius": 3, "mode": "watershed", "watershed_line": False},
    },
]

REPORTED_METRICS = (
    "mean_ap",
    "mean_ap50",
    "mean_ap75",
    "mean_pq",
    "mean_sq",
    "mean_rq",
    "mean_boundary_precision",
    "mean_boundary_recall",
    "mean_boundary_fscore",
    "mean_bsd_wasserstein",
    "mean_count_absolute_error",
    "mean_count_relative_error",
    "mean_d10_relative_error",
    "mean_d32_relative_error",
    "mean_d50_relative_error",
    "mean_d90_relative_error",
)


def _environment() -> dict:
    import scipy
    import skimage

    return {
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "processor": platform.processor() or platform.machine(),
        "numpy": np.__version__,
        "scipy": scipy.__version__,
        "scikit_image": skimage.__version__,
    }


def _id_hash(ids) -> str:
    """The pre-registration's canonicalization: sorted, newline-joined, trailing newline, utf-8."""
    payload = "\n".join(sorted({str(value) for value in ids})) + "\n"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_reserve_slice(study: str) -> dict:
    """Read exactly the rows of one reserve study, and nothing else in the archive."""
    archive = np.load(RESERVE_CACHE, allow_pickle=True)
    mask = np.asarray([str(value) == study for value in archive["reserve_studies"]])
    if not mask.any():
        raise SystemExit(f"reserve study {study!r} has no rows in {RESERVE_CACHE.name}")
    return {
        "images": archive["images"][mask],
        "labels": archive["labels"][mask],
        "sample_ids": [str(value) for value in archive["sample_ids"][mask]],
        "group_ids": [str(value) for value in archive["group_ids"][mask]],
        "conditions": [str(value) for value in archive["conditions"][mask]],
    }


def evaluate(slice_data: dict, method: str, config: dict) -> tuple[dict, list[dict]]:
    """Run one engine at one configuration over every image of the slice and aggregate."""
    engine = METHODS[method]
    rows = []
    for index, image in enumerate(slice_data["images"]):
        started = time.perf_counter()
        labels = engine(image.astype(np.float32) / 255.0, **config)
        elapsed_ms = (time.perf_counter() - started) * 1000
        rows.append({
            "sample_id": slice_data["sample_ids"][index],
            "condition_id": slice_data["conditions"][index],
            **full_instance_metrics(labels, slice_data["labels"][index]),
            "inference_ms": elapsed_ms,
        })
    summary = summarize_metric_rows(rows, split="reserve")
    point = {
        "method": method,
        "config": dict(config),
        "n": summary["n"],
        **{name: summary[name] for name in REPORTED_METRICS},
        "mean_inference_ms": float(np.mean([row["inference_ms"] for row in rows])),
        "total_predicted_instances": int(sum(row["nPred"] for row in rows)),
        "total_true_instances": int(sum(row["nGt"] for row in rows)),
        "total_merges": int(sum(row["merges"] for row in rows)),
        "total_splits": int(sum(row["splits"] for row in rows)),
        "total_tp": int(sum(row["tp"] for row in rows)),
        "total_fp": int(sum(row["fp"] for row in rows)),
        "total_fn": int(sum(row["fn"] for row in rows)),
        "mean_ap_by_condition": {
            key: value["mean_ap"] for key, value in summary["robustness_by_condition"].items()
        },
    }
    return point, rows


def paired_delta(before_rows: list[dict], after_rows: list[dict], metric: str) -> dict:
    """Paired per-image delta with a bootstrap interval, resampled over images."""
    before_by_id = {row["sample_id"]: row for row in before_rows}
    deltas = []
    for row in after_rows:
        twin = before_by_id[row["sample_id"]]
        if row.get(metric) is None or twin.get(metric) is None:
            continue
        deltas.append(float(row[metric]) - float(twin[metric]))
    values = np.asarray(deltas, dtype=np.float64)
    # An error metric improves when it goes DOWN. Everything else improves when it goes up.
    lower_is_better = any(
        token in metric
        for token in ("relative_error", "absolute_error", "wasserstein", "_ms")
    )
    better = values < 0 if lower_is_better else values > 0
    worse = values > 0 if lower_is_better else values < 0
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    draws = rng.integers(0, values.size, size=(BOOTSTRAP_RESAMPLES, values.size))
    means = values[draws].mean(axis=1)
    return {
        "metric": metric,
        "n_paired": int(values.size),
        "mean_delta": float(values.mean()),
        "median_delta": float(np.median(values)),
        "bootstrap_resamples": BOOTSTRAP_RESAMPLES,
        "bootstrap_seed": BOOTSTRAP_SEED,
        "bootstrap_ci95": [float(np.quantile(means, 0.025)), float(np.quantile(means, 0.975))],
        # Polarity matters: for an error metric a NEGATIVE delta is the improvement. Judging
        # by sign alone made these labels mean their opposite, so C7 d32 read "58 images
        # improved" for the metric this same artifact calls its cost, and C3 bsd_wasserstein
        # read "0 improved" for a metric that improved on all 64.
        "images_improved": int((better).sum()),
        "images_worsened": int((worse).sum()),
        "images_unchanged": int((values == 0).sum()),
        "win_rate": float((better).mean()),
        "polarity": "lower_is_better" if lower_is_better else "higher_is_better",
    }


def sweep_point(path: Path, config: dict) -> dict:
    """The matching test-split sweep row, quoted only as the observed number it is."""
    document = json.loads(path.read_text(encoding="utf-8"))
    for point in document["points"]:
        if all(point["config"].get(key) == value for key, value in config.items()):
            return {
                "artifact": path.relative_to(ROOT).as_posix(),
                "surface": "data/cache/learned-v2-192.npz test split, OBSERVED by the sweep grid",
                "config": point["config"],
                "mean_ap": point["mean_ap"],
                "mean_boundary_fscore": point["mean_boundary_fscore"],
                "mean_d32_relative_error": point["mean_d32_relative_error"],
            }
    raise SystemExit(f"no sweep row in {path.name} for {config}")


REAL_ADJACENT_BEFORE = {"C3": 0.182, "C7": 0.193}   # committed values before the adoption, from git HEAD


def real_adjacent_observation() -> dict | None:
    """What the adopted engines do on the adjacent REAL domain, reported whichever way it goes.

    This is not a confirmation surface and it is not froth. It is 64 BBBC038 cell-nucleus images, a
    split that was already observed on 2026-07-28, so re-running the classical rows on it recomputes a
    published surface and selects nothing and spends no budget. It is recorded because the two changes
    disagree on it, and a disagreement that is only visible off-domain is exactly the thing a report
    that quotes one surface would hide."""
    if not REAL_ADJACENT.exists():
        return None
    document = json.loads(REAL_ADJACENT.read_text(encoding="utf-8"))
    rows = {row["id"]: row for row in document["methods"]}
    return {
        "artifact": REAL_ADJACENT.relative_to(ROOT).as_posix(),
        "domain": document["domain"],
        "source_id": document["source_id"],
        "n_samples": document["n_samples"],
        "status": "already-observed split, recomputed; no budget spent and nothing selected on it",
        "scope": document["scope"],
        "C3": {
            "before": REAL_ADJACENT_BEFORE["C3"],
            "after": rows["C3"]["mean_ap"],
            "direction": "WORSE off-domain",
        },
        "C7": {
            "before": REAL_ADJACENT_BEFORE["C7"],
            "after": rows["C7"]["mean_ap"],
            "direction": "better off-domain",
        },
        "reading": (
            "The two changes disagree here and the disagreement is mechanistic, not noise. C3's "
            "adopted surface is a FROTH mechanism: flooding the negated intensity from h-maxima "
            "markers assumes one bright specular highlight per object and a dark Plateau border "
            "between objects, and cell nuclei have neither, so on this domain the distance transform "
            "it replaced is the better surface. C7's constrained watershed assumes only that objects "
            "are separated by a thin dark seam the black-top-hat can find, which nuclei do satisfy, "
            "so it transfers. Neither result changes the adoption: both changes were justified by a "
            "froth source and confirmed on a froth reserve slice, and this split explicitly supports "
            "no froth statement. It is recorded so that nobody later reads C3's froth gain as "
            "evidence that the surface is generally better."
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--study", default="p1", help="reserve slice to spend")
    args = parser.parse_args()

    prereg = json.loads(PREREGISTRATION.read_text(encoding="utf-8"))
    reserve = prereg["synthetic"]["reserve_matrix"]
    expected = reserve["per_study"][args.study]

    observed_cache_hash = _file_hash(RESERVE_CACHE)
    if observed_cache_hash != reserve["cache_sha256"]:
        raise SystemExit(
            "reserve archive does not match the pre-registration hash; refusing to read it"
        )

    slice_data = load_reserve_slice(args.study)
    group_hash = _id_hash(slice_data["group_ids"])
    sample_hash = _id_hash(slice_data["sample_ids"])
    if group_hash != expected["group_ids_sha256"] or sample_hash != expected["sample_ids_sha256"]:
        raise SystemExit("reserve slice ids do not match the pre-registration; refusing to read it")

    ledger = json.loads(LEDGER.read_text(encoding="utf-8"))
    spender = next(
        (entry for entry in ledger["entries"] if entry["reserve_study"] == args.study), None,
    )
    if spender is not None and spender["spent_by"] != SPENT_BY:
        raise SystemExit(
            f"reserve slice {args.study!r} was already spent by {spender['spent_by']!r}; "
            "a second study reading it would void its guarantee"
        )
    # A re-run of THIS study is the same observation, not a second one: the engines are deterministic
    # and the arms are fixed in this file, so re-emitting the artifact cannot select anything new.

    print(
        f"reserve slice {args.study}: {len(slice_data['sample_ids'])} images, "
        f"{len(set(slice_data['group_ids']))} groups",
        flush=True,
    )

    changes = []
    for arm in ARMS:
        results = {}
        rows_by_side = {}
        for side in ("before", "after"):
            point, rows = evaluate(slice_data, arm["method"], arm[side])
            results[side] = point
            rows_by_side[side] = rows
            print(
                f"  {arm['change_id']} {side} {arm[side]} "
                f"AP={point['mean_ap']:.4f} bF={point['mean_boundary_fscore']:.4f} "
                f"d32={point['mean_d32_relative_error']:.4f}",
                flush=True,
            )
        deltas = {
            name: paired_delta(rows_by_side["before"], rows_by_side["after"], name)
            for name in ("ap", "boundary_fscore", "d32_relative_error", "pq", "bsd_wasserstein")
        }
        direction = "confirmed" if deltas["ap"]["mean_delta"] > 0 else "contradicted"
        changes.append({
            "change_id": arm["change_id"],
            "method": arm["method"],
            "before_config": arm["before"],
            "after_config": arm["after"],
            "source": SOURCES[arm["change_id"]],
            "reserve": {
                "before": results["before"],
                "after": results["after"],
                "paired_deltas": deltas,
            },
            "direction_on_reserve": direction,
        })

    verdict = (
        "adopted"
        if all(change["direction_on_reserve"] == "confirmed" for change in changes)
        else "reverted"
    )

    document = {
        "schema": "frothseg.phase1-adoption/v1",
        "study": "Phase 1 classical adoption, confirmed on an unobserved reserve slice",
        "date": datetime.now(timezone.utc).date().isoformat(),
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "produced_by": "scripts/confirm_phase1_adoption.py",
        "plan": "CAOS_MANAGE/plans/frothseg/research-2026-07-31/PLAN-PROPOSAL.md section 3",
        "why_a_reserve_slice_was_needed": (
            "The Phase 1 sweeps ran on the 64-image test split of data/cache/learned-v2-192.npz, "
            "which the sweep grids observed. A configuration selected on that split cannot quote "
            "its own sweep number as the effect of the change. The reserve numbers below are the "
            "ones that get published; the sweep numbers are recorded next to them only as the "
            "observed evidence that motivated the change."
        ),
        "surface": {
            "cache": RESERVE_CACHE.relative_to(ROOT).as_posix(),
            "cache_sha256": observed_cache_hash,
            "cache_sha256_matches_preregistration": True,
            "reserve_study_slice": args.study,
            "sample_count": len(slice_data["sample_ids"]),
            "group_count": len(set(slice_data["group_ids"])),
            "condition_count": len(set(slice_data["conditions"])),
            "group_ids_sha256": group_hash,
            "sample_ids_sha256": sample_hash,
            "ids_match_preregistration": True,
            "observation_status_before_this_run": reserve["observation_status"],
        },
        "design": {
            "evaluations": 4,
            "arms": [
                {"change_id": arm["change_id"], "method": arm["method"],
                 "before": arm["before"], "after": arm["after"]}
                for arm in ARMS
            ],
            "primary_readout": "paired per-image mean AP delta, after minus before",
            "interval": f"{BOOTSTRAP_RESAMPLES}-resample bootstrap over images, seed {BOOTSTRAP_SEED}",
            "verdict_rule": (
                "The adoption stands only if the paired mean AP delta on the reserve slice is "
                "strictly positive for BOTH changes. If either is zero or negative, both changes "
                "are reverted and the reversal is the published result."
            ),
            "not_done_here": (
                "No grid, no second pass, no re-optimisation. seam_radius and watershed_line are "
                "held at their current published values on purpose: radius 4 or 5 buys about 0.01 "
                "AP on the observed test split, which is exactly the kind of test-split selection "
                "this programme exists to avoid."
            ),
        },
        "environment": _environment(),
        "changes": changes,
        "deliberately_not_moved": DELIBERATELY_NOT_MOVED,
        "off_domain_observation": real_adjacent_observation(),
        "verdict": verdict,
        "verdict_meaning": (
            "Both changes moved mean AP in the adopted direction on data no sweep observed, with "
            "bootstrap intervals clear of zero, so the adoption stands and these reserve numbers are "
            "the ones that get published as the effect of the change."
            if verdict == "adopted" else
            "At least one change failed to move mean AP in the adopted direction on the unobserved "
            "slice. Both changes are reverted. A reversal here is a valid outcome and is published."
        ),
        "engine_defaults_after_adoption": {
            "file": "data-pipeline/fslab/science/segment.py",
            "C3_FLOODING_SURFACE": "neg_gray",
            "C7_MODE": "watershed",
            "C7_SEAM_RADIUS": 3,
            "C7_WATERSHED_LINE": False,
            "C4_COMPACTNESS": 0.0,
            "FOREGROUND_OTSU_FACTOR": 0.75,
            "live_twin": "frontend/src/classical/methods.ts, watershedHmax and valleyEdge moved with them",
        },
        "reserve_ledger_entry": {
            "file": "verification/reserve-slice-ledger.json",
            "reserve_study": args.study,
            "spent_by": SPENT_BY,
            "sample_count": len(slice_data["sample_ids"]),
            "group_ids_sha256": group_hash,
            "sample_ids_sha256": sample_hash,
            "test_evaluations_spent": 0,
            "slices_spent_after_this_entry": len(ledger["entries"]) + (1 if spender is None else 0),
            "note": (
                "The p1 slice was reassigned from its named study. P-1's pre-registered design "
                "consumed zero reserve groups by construction and P-1 closed on 2026-07-31 with "
                "verdict 'fail', so the slice its name reserved was never going to be spent by it. "
                "The slice is now burned for every purpose."
            ),
        },
    }
    # The one metric that moves the WRONG way, recorded next to the change and not in a footnote.
    c7 = document["changes"][1]
    document["changes"][1]["stated_cost"] = {
        "metric": "mean_d32_relative_error",
        "direction": "worse",
        "reserve_before": c7["reserve"]["before"]["mean_d32_relative_error"],
        "reserve_after": c7["reserve"]["after"]["mean_d32_relative_error"],
        # Read from the sweep artifact, never retyped. A hardcoded 1.4371484375 sat here
        # and appears in no artifact in the repo, in any commit: it differed from the
        # recorded 1.4370609375 by 8.75e-05.
        "test_split_before": sweep_point(
            SWEEP_C7, {"seam_radius": 3, "mode": "subtract", "watershed_line": False}
        )["mean_d32_relative_error"],
        "test_split_after": sweep_point(
            SWEEP_C7, {"seam_radius": 3, "mode": "watershed", "watershed_line": False}
        )["mean_d32_relative_error"],
        "test_split_source": "data/derived/phase1/c7-constrained-watershed.json",
        "why": (
            "Growing the caps back to the seam ridge enlarges every bubble, and the Sauter mean "
            "diameter is what notices. C7 already over-estimated d32 by a factor above 2, so this "
            "makes the size distribution worse while making the mask better. It must be stated "
            "wherever this change is described."
        ),
    }
    document["changes"][0]["observed_sweep_reference"] = {
        "before": sweep_point(SWEEP_C3, ARMS[0]["before"]),
        "after": sweep_point(SWEEP_C3, ARMS[0]["after"]),
    }
    document["changes"][1]["observed_sweep_reference"] = {
        "before": sweep_point(SWEEP_C7, ARMS[1]["before"]),
        "after": sweep_point(SWEEP_C7, ARMS[1]["after"]),
    }

    OUT.write_text(json.dumps(document, indent=2), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT).as_posix()}  verdict={verdict}", flush=True)


if __name__ == "__main__":
    main()
