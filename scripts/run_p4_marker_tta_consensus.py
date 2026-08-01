"""Execute pre-registered experiment P-4: marker-space TTA consensus.

Pre-registration: CAOS_MANAGE `plans/frothseg/research-2026-07-31/PLAN-PROPOSAL.md`, section
P-4. It fixes the hypothesis, the bar, the budget and the claim language BEFORE any run. This
script only executes it. Nothing in it is adjusted after a result.

Design, fixed in advance
------------------------

- Hypothesis, refutable: field-averaged D4 TTA fails on this pipeline because of the
  AGGREGATION FUNCTION, not because TTA is useless here. Running instance extraction per D4
  transform and fusing in marker space beats the no-TTA baseline.
- Operation: decode instances independently inside each of the eight D4 frames, invert the
  transform on the LABEL maps, cluster instance centroids across the eight views, keep the
  clusters supported by at least `k` of 8, resolve masks by pixel-wise majority.
- `k` is tuned on the CALIBRATION split only. The test split is never read; the budget is zero.
- Pre-registered bar: validation mean AP must beat 0.52400 by MORE than 0.01, that is, it must
  exceed 0.53400. If it does not, TTA is closed permanently for this pipeline and that sentence
  is written into the evidence JSON and into the narrative.

Selection rule, also fixed in advance
-------------------------------------

The previously measured field-averaged TTA lane was allowed to recalibrate its decode grid on
the calibration split, and it did move (it selected `foreground_threshold` 0.5 where the no-TTA
baseline selected 0.6; see `E:/_Temp/n1-v3/ensemble-logitmean-tta-d4-e120-seeds-25-26-27/run.json`).
Marker-space consensus is given exactly the same freedom, and no more:

- PRIMARY, the pre-registered decision configuration: the point of
  `foreground_threshold x marker_threshold x k` with the highest CALIBRATION mean AP.
  `boundary_threshold`, `min_distance` and `center_weight` are held at the published no-TTA
  operating point. Calibration only; validation is never consulted for selection.
- SECONDARY, reported for transparency, never used to decide: the same fusion with every
  decode threshold pinned to the published no-TTA operating point, `k` alone tuned on
  calibration. This is the strictest "everything else held fixed" reading of the design.

Mechanism test, in the same run
-------------------------------

The dossier's own mechanism story (UNVERIFIED, recorded as a hypothesis and not as a source) is
that averaging over eight transforms smooths the boundary and center channels near lamellae and
so lowers peak separability. Tested here by comparing marker counts and merge/split counts with
and without TTA at MATCHED decode thresholds, plus a direct smoothing measure (total variation
and peak height) on the boundary and center channels.

    python scripts/run_p4_marker_tta_consensus.py --member-root E:/_Temp/n1-v3
"""

from __future__ import annotations

import argparse
import json
import platform
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.learning.data_cache import load_cache, select_split  # noqa: E402
from fslab.learning.evaluate_ensemble import _combine, _load_member  # noqa: E402
from fslab.learning.multitask_models import (  # noqa: E402
    marker_coordinates,
    probabilities_to_instances,
)
from fslab.learning.train_multitask import _probabilities  # noqa: E402
from fslab.learning.tta_consensus import (  # noqa: E402
    CONSENSUS_CONSTANTS,
    D4_VIEWS,
    cluster_instances,
    fuse_clusters,
    invert_d4,
    view_label_maps,
)
from fslab.science.segment import (  # noqa: E402
    full_instance_metrics,
    mask_ap,
    panoptic_quality,
    summarize_metric_rows,
)

#: Pre-registered baseline and bar. Both fixed in the proposal before any run here.
#: 0.52400 is the published validation mean AP of `ensemble-logitmean-e120-seeds-25-26-27`
#: (CAOS_MANAGE wip/frothseg/n1-study-v3-preregistration-2026-07-27.md, and
#: E:/_Temp/n1-v3/ensemble-logitmean-e120-seeds-25-26-27/run.json evaluation.mean_ap).
BASELINE_VALIDATION_MEAN_AP = 0.52400
REQUIRED_MARGIN = 0.01

#: The published no-TTA operating point, selected on the calibration split by the study v3
#: ensemble run (models/lamellastar-v1/run.json `calibration`).
PUBLISHED_DECODE = {
    "foreground_threshold": 0.6,
    "boundary_threshold": 0.65,
    "marker_threshold": 0.15,
    "min_distance": 3,
    "center_weight": 0.5,
}

#: The operating point the field-averaged D4 TTA lane selected for itself on calibration
#: (E:/_Temp/n1-v3/ensemble-logitmean-tta-d4-e120-seeds-25-26-27/run.json `calibration`).
FIELD_TTA_DECODE = {
    "foreground_threshold": 0.5,
    "boundary_threshold": 0.65,
    "marker_threshold": 0.15,
    "min_distance": 3,
    "center_weight": 0.5,
}
FIELD_TTA_PUBLISHED_VALIDATION_MEAN_AP = 0.51271875

#: The calibration-only search for the consensus lane. Same two axes the field-averaged lane
#: was free to move, plus k. Nothing else moves.
FOREGROUND_GRID = (0.4, 0.5, 0.6)
MARKER_GRID = (0.15, 0.25, 0.35)
K_VALUES = tuple(range(1, len(D4_VIEWS) + 1))

MEMBER_IDS = ("c24-e120-s20260725", "c24-e120-s20260726", "c24-e120-s20260727")


def _view_probabilities(
    models, images, *, device, batch_size: int
) -> tuple[list[np.ndarray], np.ndarray]:
    """Ensemble probabilities per D4 view, plus the published field-averaged TTA field.

    Two aggregation ORDERS exist and they do not commute, because the ensemble combiner is a
    logit mean while the TTA combiner is an arithmetic mean:

    - view-first (returned as ``per_view``, and averaged by :func:`_aligned_mean`): combine the
      three members inside each D4 frame, then average the eight aligned fields. This is the
      order the marker-space lane needs, because it decodes exactly these per-view fields.
    - member-first (returned as ``member_first_field_average``): average each member's own
      eight aligned fields, then logit-mean the three members. This is what
      ``fslab.learning.evaluate_ensemble`` does and therefore what the published
      ``ensemble-logitmean-tta-d4-e120-seeds-25-26-27`` number came from.

    Both are computed so the mechanism comparison can be read against the published record
    instead of quietly differing from it.
    """
    import torch

    per_view_members: list[list[np.ndarray]] = []
    for turns, reflect in D4_VIEWS:
        transformed = torch.rot90(images, turns, dims=(2, 3))
        if reflect:
            transformed = torch.flip(transformed, dims=(3,))
        per_view_members.append([
            _probabilities(model, transformed, device=device, batch_size=batch_size)
            for model in models
        ])
    per_view = [_combine(members, "logit-mean") for members in per_view_members]
    member_fields = []
    for member_index in range(len(models)):
        aligned = [
            invert_d4(per_view_members[view_index][member_index], turns, reflect)
            for view_index, (turns, reflect) in enumerate(D4_VIEWS)
        ]
        member_fields.append(np.mean(np.stack(aligned), axis=0))
    return per_view, _combine(member_fields, "logit-mean")


def _aligned_mean(per_view: list[np.ndarray]) -> np.ndarray:
    """The field-averaged D4 lane: invert every view and average the FIELDS."""
    stacked = [
        invert_d4(probabilities, turns, reflect)
        for probabilities, (turns, reflect) in zip(per_view, D4_VIEWS, strict=True)
    ]
    return np.mean(np.stack(stacked), axis=0)


def _total_variation(channel: np.ndarray) -> float:
    return float(
        np.abs(np.diff(channel, axis=0)).mean() + np.abs(np.diff(channel, axis=1)).mean()
    )


def _decode_diagnostics(probabilities: np.ndarray, truth: np.ndarray, decode: dict) -> dict:
    _, coords = marker_coordinates(probabilities, **decode)
    labels = probabilities_to_instances(probabilities, **decode)
    quality = panoptic_quality(labels, truth)
    gt_instances = int(np.unique(truth[truth > 0]).size)
    return {
        "markers": int(len(coords)),
        "instances": int(labels.max()),
        "gt_instances": gt_instances,
        "count_absolute_error": abs(int(labels.max()) - gt_instances),
        "merges": int(quality["merges"]),
        "splits": int(quality["splits"]),
        "ap": mask_ap(labels, truth)["ap"],
        "boundary_total_variation": _total_variation(probabilities[1]),
        "center_total_variation": _total_variation(probabilities[3]),
        "center_peak_p999": float(np.percentile(probabilities[3], 99.9)),
    }


def _mean(values: list) -> float | None:
    kept = [float(value) for value in values if value is not None]
    return float(np.mean(kept)) if kept else None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--member-root", type=Path, default=Path("E:/_Temp/n1-v3"))
    parser.add_argument("--cache", type=Path, default=ROOT / "data/cache/learned-v2-192.npz")
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--batch-size", type=int, default=8)
    args = parser.parse_args()

    import torch

    if args.device.startswith("cuda") and not torch.cuda.is_available():
        raise RuntimeError("CUDA requested but unavailable; CPU fallback is forbidden")
    started = time.perf_counter()
    device = torch.device(args.device)

    cache = load_cache(args.cache)
    splits = {
        name: select_split(cache, name) for name in ("calibration", "validation")
    }

    models = []
    member_reports = []
    for member_id in MEMBER_IDS:
        model, manifest, weights_hash = _load_member(args.member_root / member_id, device=device)
        models.append(model)
        member_reports.append({
            "id": member_id,
            "path": (args.member_root / member_id).as_posix(),
            "seed": manifest["config"]["seed"],
            "epochs": manifest["config"]["epochs"],
            "base_channels": manifest["config"]["base_channels"],
            "weights_sha256": weights_hash,
            "dataset_cache_sha256": manifest["dataset"]["cache_sha256"],
        })
    dataset_hashes = {report["dataset_cache_sha256"] for report in member_reports}
    if len(dataset_hashes) != 1:
        raise ValueError("ensemble members disagree on the dataset cache")

    per_view = {}
    member_first_field = {}
    for name, split in splits.items():
        images = torch.from_numpy(split["images"].astype(np.float32)[:, None] / 255.0)
        per_view[name], member_first_field[name] = _view_probabilities(
            models, images, device=device, batch_size=args.batch_size
        )
        print(f"[{name}] probabilities for {len(D4_VIEWS)} views done", flush=True)
    peak_vram = round(torch.cuda.max_memory_allocated(device) / 1024**2, 1)
    del models
    torch.cuda.empty_cache()

    identity = {name: views[0] for name, views in per_view.items()}
    field_average = {name: _aligned_mean(views) for name, views in per_view.items()}

    # ---- calibration search: k, and the two decode axes the field lane was free to move ----
    calibration = splits["calibration"]
    _, group_index = np.unique(calibration["group_ids"], return_index=True)
    group_index = np.sort(group_index)
    print(f"[calibration] {len(group_index)} groups of {len(calibration['images'])} samples")

    calibration_grid = []
    for foreground_threshold in FOREGROUND_GRID:
        for marker_threshold in MARKER_GRID:
            decode = {
                **PUBLISHED_DECODE,
                "foreground_threshold": foreground_threshold,
                "marker_threshold": marker_threshold,
            }
            scores = {k: [] for k in K_VALUES}
            for index in group_index:
                maps = view_label_maps(
                    [views[index] for views in per_view["calibration"]], **decode
                )
                clusters = cluster_instances(maps)
                truth = calibration["labels"][index]
                for k in K_VALUES:
                    fused = fuse_clusters(clusters, maps[0].shape, k=k)
                    score = mask_ap(fused, truth)["ap"]
                    if score is not None:
                        scores[k].append(score)
            for k in K_VALUES:
                calibration_grid.append({
                    "foreground_threshold": foreground_threshold,
                    "marker_threshold": marker_threshold,
                    "k": k,
                    "calibration_mean_ap": float(np.mean(scores[k])),
                })
            best_here = max(
                (row for row in calibration_grid if row["foreground_threshold"] == foreground_threshold
                 and row["marker_threshold"] == marker_threshold),
                key=lambda row: row["calibration_mean_ap"],
            )
            print(
                f"[calibration] fg={foreground_threshold} mk={marker_threshold} "
                f"best k={best_here['k']} mean AP {best_here['calibration_mean_ap']:.5f}",
                flush=True,
            )

    primary = max(calibration_grid, key=lambda row: row["calibration_mean_ap"])
    secondary = max(
        (
            row
            for row in calibration_grid
            if row["foreground_threshold"] == PUBLISHED_DECODE["foreground_threshold"]
            and row["marker_threshold"] == PUBLISHED_DECODE["marker_threshold"]
        ),
        key=lambda row: row["calibration_mean_ap"],
    )
    print(f"[calibration] primary selection {primary}")
    print(f"[calibration] secondary selection {secondary}")

    # ---- validation ----
    validation = splits["validation"]

    def _consensus_validation(selection: dict) -> dict:
        decode = {
            **PUBLISHED_DECODE,
            "foreground_threshold": selection["foreground_threshold"],
            "marker_threshold": selection["marker_threshold"],
        }
        rows = []
        k_curve = {k: [] for k in K_VALUES}
        for index in range(len(validation["images"])):
            maps = view_label_maps(
                [views[index] for views in per_view["validation"]], **decode
            )
            clusters = cluster_instances(maps)
            truth = validation["labels"][index]
            for k in K_VALUES:
                fused = fuse_clusters(clusters, maps[0].shape, k=k)
                score = mask_ap(fused, truth)["ap"]
                if score is not None:
                    k_curve[k].append(score)
                if k == selection["k"]:
                    quality = panoptic_quality(fused, truth)
                    rows.append({
                        "sample_id": str(validation["sample_ids"][index]),
                        "condition_id": str(validation["conditions"][index]),
                        "group_id": str(validation["group_ids"][index]),
                        "kept_instances": int(fused.max()),
                        "merges": int(quality["merges"]),
                        "splits": int(quality["splits"]),
                        **full_instance_metrics(fused, truth),
                    })
        summary = summarize_metric_rows(rows, split="validation")
        summary["mean_merges"] = _mean([row["merges"] for row in rows])
        summary["mean_splits"] = _mean([row["splits"] for row in rows])
        summary["mean_kept_instances"] = _mean([row["kept_instances"] for row in rows])
        return {
            "decode": decode,
            "k": selection["k"],
            "calibration_mean_ap": selection["calibration_mean_ap"],
            "validation_mean_ap": summary["mean_ap"],
            "validation_k_curve": {
                str(k): float(np.mean(values)) for k, values in k_curve.items() if values
            },
            "summary": summary,
        }

    primary_result = _consensus_validation(primary)
    print(f"[validation] primary mean AP {primary_result['validation_mean_ap']:.5f}", flush=True)
    if (
        secondary["foreground_threshold"] == primary["foreground_threshold"]
        and secondary["marker_threshold"] == primary["marker_threshold"]
    ):
        secondary_result = dict(primary_result)
        secondary_result["k"] = secondary["k"]
        secondary_result["calibration_mean_ap"] = secondary["calibration_mean_ap"]
        secondary_result["validation_mean_ap"] = primary_result["validation_k_curve"][
            str(secondary["k"])
        ]
        secondary_result["summary"] = None
        secondary_result["note"] = (
            "same decode point as the primary; validation mean AP read off the primary k curve"
        )
    else:
        secondary_result = _consensus_validation(secondary)
    print(
        f"[validation] secondary mean AP {secondary_result['validation_mean_ap']:.5f}", flush=True
    )

    # ---- controls and the mechanism test, matched decode thresholds ----
    mechanism = {}
    for name in ("calibration", "validation"):
        split = splits[name]
        lanes = {
            "no_tta_published_decode": (identity[name], PUBLISHED_DECODE),
            "field_average_d4_matched_decode": (field_average[name], PUBLISHED_DECODE),
            "field_average_d4_own_decode": (field_average[name], FIELD_TTA_DECODE),
            "field_average_d4_published_order_own_decode": (
                member_first_field[name],
                FIELD_TTA_DECODE,
            ),
        }
        mechanism[name] = {}
        for lane, (probabilities, decode) in lanes.items():
            rows = [
                _decode_diagnostics(probabilities[index], split["labels"][index], decode)
                for index in range(len(split["images"]))
            ]
            mechanism[name][lane] = {
                "decode": decode,
                "n": len(rows),
                "mean_markers": _mean([row["markers"] for row in rows]),
                "mean_instances": _mean([row["instances"] for row in rows]),
                "mean_gt_instances": _mean([row["gt_instances"] for row in rows]),
                "mean_count_absolute_error": _mean(
                    [row["count_absolute_error"] for row in rows]
                ),
                "mean_merges": _mean([row["merges"] for row in rows]),
                "mean_splits": _mean([row["splits"] for row in rows]),
                "mean_ap": _mean([row["ap"] for row in rows]),
                "mean_boundary_total_variation": _mean(
                    [row["boundary_total_variation"] for row in rows]
                ),
                "mean_center_total_variation": _mean(
                    [row["center_total_variation"] for row in rows]
                ),
                "mean_center_peak_p999": _mean([row["center_peak_p999"] for row in rows]),
            }
            print(f"[{name}] {lane}: {json.dumps(mechanism[name][lane], default=str)}", flush=True)
        mechanism[name]["marker_space_consensus_primary"] = {
            "decode": primary_result["decode"],
            "k": primary_result["k"],
        }
    consensus_validation = mechanism["validation"]["marker_space_consensus_primary"]
    consensus_validation["mean_instances"] = primary_result["summary"]["mean_kept_instances"]
    consensus_validation["mean_count_absolute_error"] = primary_result["summary"][
        "mean_count_absolute_error"
    ]
    consensus_validation["mean_merges"] = primary_result["summary"]["mean_merges"]
    consensus_validation["mean_splits"] = primary_result["summary"]["mean_splits"]
    consensus_validation["mean_ap"] = primary_result["validation_mean_ap"]

    no_tta = mechanism["validation"]["no_tta_published_decode"]
    field_matched = mechanism["validation"]["field_average_d4_matched_decode"]
    marker_delta = field_matched["mean_markers"] - no_tta["mean_markers"]
    merge_delta = field_matched["mean_merges"] - no_tta["mean_merges"]
    split_delta = field_matched["mean_splits"] - no_tta["mean_splits"]
    boundary_tv_delta = (
        field_matched["mean_boundary_total_variation"]
        - no_tta["mean_boundary_total_variation"]
    )
    center_tv_delta = (
        field_matched["mean_center_total_variation"] - no_tta["mean_center_total_variation"]
    )
    smoothing_observed = boundary_tv_delta < 0 and center_tv_delta < 0
    separability_observed = marker_delta < 0 and merge_delta > 0
    if smoothing_observed and separability_observed:
        mechanism_verdict = "supported"
    elif smoothing_observed:
        mechanism_verdict = "partially supported"
    else:
        mechanism_verdict = "not supported"

    achieved = float(primary_result["validation_mean_ap"])
    required = BASELINE_VALIDATION_MEAN_AP + REQUIRED_MARGIN
    passed = achieved > required
    # Hindsight only, never a decision: the best k the validation curve would have chosen if
    # selection had been allowed to read validation, which the pre-registration forbids.
    hindsight_k, hindsight_ap = max(
        primary_result["validation_k_curve"].items(), key=lambda item: item[1]
    )
    closure_sentence = (
        "TTA is closed permanently for this pipeline."
        if not passed
        else "TTA remains open for this pipeline: marker-space consensus cleared the bar."
    )

    report = {
        "experiment": "p4-marker-space-tta-consensus",
        "preregistration": (
            "CAOS_MANAGE plans/frothseg/research-2026-07-31/PLAN-PROPOSAL.md section P-4"
        ),
        "date": time.strftime("%Y-%m-%d"),
        "hypothesis": (
            "field-averaged D4 TTA fails on this pipeline because of the aggregation function, "
            "not because TTA is useless here; running instance extraction per D4 transform and "
            "fusing in marker space beats the no-TTA baseline"
        ),
        "design": {
            "model": "lamellastar c24-e120 three-seed logit-mean ensemble (published N1)",
            "members": member_reports,
            "dataset_cache_sha256": dataset_hashes.pop(),
            "cache_path": args.cache.as_posix(),
            "operation": (
                "decode instances independently in each of the eight D4 frames, invert the "
                "transform on the label maps, cluster instance centroids across views, keep "
                "clusters supported by at least k of 8, resolve masks by pixel-wise majority"
            ),
            "d4_views": [list(view) for view in D4_VIEWS],
            "tuned_on_calibration_only": ["k", "foreground_threshold", "marker_threshold"],
            "held_fixed": {
                key: PUBLISHED_DECODE[key]
                for key in ("boundary_threshold", "min_distance", "center_weight")
            },
            "fusion_constants": CONSENSUS_CONSTANTS,
            "training_runs": 0,
            "test_evaluations_spent": 0,
            "test_split_read": False,
        },
        "baseline": {
            "id": "ensemble-logitmean-e120-seeds-25-26-27",
            "validation_mean_ap": BASELINE_VALIDATION_MEAN_AP,
            "source": (
                "CAOS_MANAGE wip/frothseg/n1-study-v3-preregistration-2026-07-27.md; "
                "E:/_Temp/n1-v3/ensemble-logitmean-e120-seeds-25-26-27/run.json"
            ),
            "in_session_recheck_validation_mean_ap": no_tta["mean_ap"],
            "in_session_recheck_matches": abs(
                float(no_tta["mean_ap"]) - BASELINE_VALIDATION_MEAN_AP
            )
            < 1e-9,
        },
        "calibration_grid": calibration_grid,
        "primary": primary_result,
        "secondary_all_thresholds_fixed": secondary_result,
        "bar": {
            "baseline_validation_mean_ap": BASELINE_VALIDATION_MEAN_AP,
            "required_margin": REQUIRED_MARGIN,
            "required_validation_mean_ap": required,
            "achieved_validation_mean_ap": achieved,
            "delta_from_baseline": achieved - BASELINE_VALIDATION_MEAN_AP,
            "passed": passed,
            "hindsight_best_k_on_validation": int(hindsight_k),
            "hindsight_best_validation_mean_ap": float(hindsight_ap),
            "hindsight_would_pass": bool(float(hindsight_ap) > required),
            "hindsight_note": (
                "reported only to show how far the lane is from the bar; selecting k on "
                "validation is forbidden by the pre-registration and was not done"
            ),
        },
        "verdict": "pass" if passed else "null",
        "verdict_rule": (
            "pass only if validation mean AP exceeds 0.52400 by more than 0.01; the rule was "
            "fixed in the pre-registration before any run and is not adjusted here"
        ),
        "consequence": closure_sentence,
        "mechanism_test": {
            "claim": (
                "UNVERIFIED dossier hypothesis: averaging over eight transforms smooths the "
                "boundary and center channels near lamellae, lowering peak separability"
            ),
            "claim_status_before_this_run": "UNVERIFIED, recorded as the dossier's own "
            "hypothesis and not as a source",
            "comparison": "matched decode thresholds (the published no-TTA operating point)",
            "by_split": mechanism,
            "validation_deltas_field_average_minus_no_tta": {
                "mean_markers": marker_delta,
                "mean_merges": merge_delta,
                "mean_splits": split_delta,
                "mean_boundary_total_variation": boundary_tv_delta,
                "mean_center_total_variation": center_tv_delta,
                "mean_ap": field_matched["mean_ap"] - no_tta["mean_ap"],
            },
            "smoothing_observed": bool(smoothing_observed),
            "lower_peak_separability_observed": bool(separability_observed),
            "verdict": mechanism_verdict,
            "field_average_published_validation_mean_ap": (
                FIELD_TTA_PUBLISHED_VALIDATION_MEAN_AP
            ),
            "field_average_published_order_recheck_validation_mean_ap": mechanism["validation"][
                "field_average_d4_published_order_own_decode"
            ]["mean_ap"],
            "field_average_published_order_recheck_matches": abs(
                float(
                    mechanism["validation"]["field_average_d4_published_order_own_decode"][
                        "mean_ap"
                    ]
                )
                - FIELD_TTA_PUBLISHED_VALIDATION_MEAN_AP
            )
            < 1e-9,
            "aggregation_order_note": (
                "the ensemble combiner is a logit mean and the TTA combiner is an arithmetic "
                "mean, so the two orders do not commute; the marker-space lane is paired with "
                "the view-first order because it decodes exactly those per-view fields, and "
                "the published member-first order is re-measured here so the two records can "
                "be read against each other"
            ),
        },
        "environment": {
            "python": platform.python_version(),
            "torch": torch.__version__,
            "cuda_runtime": torch.version.cuda,
            "device": torch.cuda.get_device_properties(device).name,
            "peak_allocated_mib": peak_vram,
        },
        "duration_seconds": round(time.perf_counter() - started, 3),
    }
    destination = ROOT / "verification" / "p4-marker-tta-consensus.json"
    destination.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["bar"], indent=2))
    print(json.dumps(report["mechanism_test"]["validation_deltas_field_average_minus_no_tta"], indent=2))
    print(f"\nWrote {destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
