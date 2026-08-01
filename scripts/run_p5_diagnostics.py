"""Execute pre-registered experiment P-5, diagnostics leg: A-2 then W-1, then the A-1 gate.

The pre-registration (CAOS_MANAGE `plans/frothseg/research-2026-07-31/PLAN-PROPOSAL.md`,
section P-5) fixes the purpose, the order and the A-1 bar BEFORE any run. This script only
executes it. Nothing here is adjusted after a result is seen.

P-5 as written:

    Purpose: decide whether a new field head is even aimed at the dominant error term,
    before spending training runs on one.

    A-2, free: from the per-case records already in `models/lamellastar-v1/run.json`,
    compute the correlation between AP loss and (merges, splits, marker count error) per
    condition. No GPU.

    W-1, cheap and mandatory before ranking: recompute boundary F at 1 px tolerance and
    report it per condition. The current 0.9876 is at `boundary_tolerance_px: 2.0` on
    192x192 frames where fine-froth objects are about 9 px across, so a 2 px tolerance is
    over 20 percent of an object's diameter and is close to uninformative exactly where
    the merges happen. The "contours are solved, only markers are broken" reading, which
    is what currently demotes the boundary-loss direction, rests on it.

    A-1, only if A-2 and W-1 justify it.

WHAT THIS SCRIPT SPENDS
-----------------------
Test evaluations: ZERO.

A-2 reads records that already exist on disk. W-1 needs predicted label maps, which the
repository does not store, so it reproduces them from the three committed member weight
files with the committed calibration thresholds on the committed working cache. No model
is trained, no arm is selected, no threshold is fitted, and no number is compared across
candidates. The reproduction is verified case by case against the committed `run.json`
(ap, pq, merges, splits, nPred, nGt and boundary F at 2.0 px) before any new tolerance is
read, so W-1 is a re-scoring of an evaluation that was already spent, not a new one.

THE A-1 JUSTIFICATION RULE
--------------------------
P-5 fixes the A-1 pass bar but does not spell out an arithmetic gate for "A-2 and W-1
justify it". The gate below is therefore written into this file BEFORE the script is run
for the first time, in the spirit of the section, and it is not adjustable afterwards. The
thresholds (0.50 and 0.90) are chosen, not derived; they are fixed in advance and that is
what makes them usable.

Both legs must pass.

    LEG 1 (A-2) - marker-space failures are the dominant error term.
      1a. The condition-demeaned pooled Spearman rho between AP loss and at least one of
          {merges, splits, absolute marker count error} is at least +0.50, in the expected
          direction (more marker-space error, more AP loss). Condition-demeaning is the
          per-condition reading pooled with equal weight; it is the only pooling with
          enough samples for a stable estimate, since each condition holds 4 cases.
      1b. For that same variable, the per-condition Spearman rho is positive in at least
          10 of the 16 conditions. A majority-of-conditions consistency check, because a
          single n=4 correlation is uninformative on its own.

    LEG 2 (W-1) - contours really are solved at an informative tolerance.
      2a. Mean boundary F over the 64 test cases at 1 px tolerance is at least 0.90.
      2b. Boundary F at 1 px on `fine-froth`, the condition where the merges happen, is at
          least 0.90.
      If either fails, the "contours are solved, only markers are broken" reading is
      overturned. A-1 changes how markers are derived and is then not aimed at the
      dominant error term, so it is NOT run and the boundary direction is re-promoted.

    python scripts/run_p5_diagnostics.py --device cuda
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
import time
from pathlib import Path

import numpy as np
from scipy import stats

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.learning.data_cache import load_cache, select_split  # noqa: E402
from fslab.learning.evaluate_ensemble import _combine  # noqa: E402
from fslab.learning.multitask_models import build_model, probabilities_to_instances  # noqa: E402
from fslab.learning.train_multitask import _probabilities  # noqa: E402
from fslab.science.segment import boundary_fscore  # noqa: E402

PUBLISHED_RUN = ROOT / "models" / "lamellastar-v1" / "run.json"
WORKING_CACHE = ROOT / "data" / "cache" / "learned-v2-192.npz"
OUTPUT = ROOT / "verification" / "p5-diagnostics.json"

#: A-2 predictors. Names are the per-case record keys in the committed run.json.
MARKER_VARIABLES = ("merges", "splits", "marker_count_error_absolute")

#: W-1: the mandated tolerance plus the published one (reproduction check) plus two
#: context points. Nothing is selected on the context points.
BOUNDARY_TOLERANCES_PX = (0.5, 1.0, 1.5, 2.0, 3.0)
MANDATED_TOLERANCE_PX = 1.0
PUBLISHED_TOLERANCE_PX = 2.0
PUBLISHED_MEAN_BOUNDARY_FSCORE_AT_2PX = 0.987625

#: Pre-registered A-1 gate constants. Fixed before the first run of this script.
LEG1_MIN_POOLED_SPEARMAN = 0.50
LEG1_MIN_CONDITIONS_AGREEING = 10
LEG2_MIN_MEAN_BOUNDARY_F_AT_1PX = 0.90
LEG2_MERGE_CONDITION = "fine-froth"
LEG2_MIN_MERGE_CONDITION_BOUNDARY_F_AT_1PX = 0.90

#: Pre-registered A-1 pass bar, quoted from P-5 verbatim. Recorded here so it travels with
#: the artifact even when A-1 is not run.
A1_BAR = (
    "must beat the published ensemble's validation mean AP by more than 0.03744 in a "
    "three-seed paired comparison, and must reduce merges on fine-froth and splits on "
    "coarse-froth at the same time. Reducing one at the cost of the other is a null, "
    "because the current operating point already trades them."
)


def _round(value, digits: int = 6):
    if value is None:
        return None
    value = float(value)
    if not np.isfinite(value):
        return None
    return round(value, digits)


def _correlations(x: np.ndarray, y: np.ndarray) -> dict:
    """Pearson and Spearman with two-sided p-values, or an explicit reason for null."""
    n = int(x.size)
    if n < 3:
        return {"n": n, "pearson_r": None, "pearson_p": None, "spearman_rho": None,
                "spearman_p": None, "null_reason": "fewer than three samples"}
    if np.ptp(x) == 0 or np.ptp(y) == 0:
        constant = "predictor is constant" if np.ptp(x) == 0 else "response is constant"
        return {"n": n, "pearson_r": None, "pearson_p": None, "spearman_rho": None,
                "spearman_p": None, "null_reason": constant}
    pearson = stats.pearsonr(x, y)
    spearman = stats.spearmanr(x, y)
    return {
        "n": n,
        "pearson_r": _round(pearson.statistic),
        "pearson_p": _round(pearson.pvalue),
        "spearman_rho": _round(spearman.statistic),
        "spearman_p": _round(spearman.pvalue),
        "null_reason": None,
    }


def _demean_by_group(values: np.ndarray, groups: np.ndarray) -> np.ndarray:
    out = np.array(values, dtype=np.float64)
    for group in np.unique(groups):
        selector = groups == group
        out[selector] = out[selector] - out[selector].mean()
    return out


def run_a2(published: dict) -> dict:
    """A-2: correlation between AP loss and marker-space error, per condition. No GPU."""
    cases = published["evaluation"]["cases"]
    condition = np.array([case["condition_id"] for case in cases])
    columns = {
        "ap": np.array([float(case["ap"]) for case in cases]),
        "merges": np.array([float(case["merges"]) for case in cases]),
        "splits": np.array([float(case["splits"]) for case in cases]),
        "marker_count_error_signed": np.array([float(case["count_error"]) for case in cases]),
        "marker_count_error_absolute": np.array(
            [float(case["count_absolute_error"]) for case in cases]
        ),
    }
    ap_loss = 1.0 - columns["ap"]

    per_condition = {}
    for name in sorted(set(condition)):
        selector = condition == name
        block = {
            "n": int(selector.sum()),
            "mean_ap": _round(columns["ap"][selector].mean()),
            "mean_ap_loss": _round(ap_loss[selector].mean()),
            "mean_merges": _round(columns["merges"][selector].mean()),
            "mean_splits": _round(columns["splits"][selector].mean()),
            "mean_marker_count_error_signed": _round(
                columns["marker_count_error_signed"][selector].mean()
            ),
            "mean_marker_count_error_absolute": _round(
                columns["marker_count_error_absolute"][selector].mean()
            ),
            "correlations_with_ap_loss": {
                variable: _correlations(columns[variable][selector], ap_loss[selector])
                for variable in ("merges", "splits", "marker_count_error_signed",
                                 "marker_count_error_absolute")
            },
        }
        per_condition[name] = block

    pooled = {
        variable: _correlations(columns[variable], ap_loss)
        for variable in ("merges", "splits", "marker_count_error_signed",
                         "marker_count_error_absolute")
    }
    demeaned_ap_loss = _demean_by_group(ap_loss, condition)
    pooled_demeaned = {
        variable: _correlations(_demean_by_group(columns[variable], condition), demeaned_ap_loss)
        for variable in ("merges", "splits", "marker_count_error_signed",
                         "marker_count_error_absolute")
    }

    # Condition-level view: n=16 over condition means, far more stable than any n=4 block.
    names = sorted(set(condition))
    condition_mean_ap_loss = np.array([per_condition[name]["mean_ap_loss"] for name in names])
    condition_level = {
        variable: _correlations(
            np.array([per_condition[name][f"mean_{variable}"] for name in names]),
            condition_mean_ap_loss,
        )
        for variable in ("merges", "splits", "marker_count_error_signed",
                         "marker_count_error_absolute")
    }

    sign_agreement = {}
    for variable in MARKER_VARIABLES:
        positive, negative, undefined = [], [], []
        for name in names:
            rho = per_condition[name]["correlations_with_ap_loss"][variable]["spearman_rho"]
            if rho is None:
                undefined.append(name)
            elif rho > 0:
                positive.append(name)
            else:
                negative.append(name)
        sign_agreement[variable] = {
            "positive": positive,
            "non_positive": negative,
            "undefined": undefined,
            "positive_count": len(positive),
            "conditions": len(names),
        }

    return {
        "what": (
            "correlation between AP loss and marker-space error, per condition, from the "
            "per-case records already in models/lamellastar-v1/run.json"
        ),
        "source_records": "models/lamellastar-v1/run.json evaluation.cases",
        "split": published["evaluation"]["split"],
        "cases": len(cases),
        "conditions": len(names),
        "cases_per_condition": int(len(cases) / len(names)),
        "definitions": {
            "ap_loss": "1 - case ap (higher is worse)",
            "merges": "committed per-case merge count",
            "splits": "committed per-case split count",
            "marker_count_error_signed": "committed per-case count_error, nPred minus nGt",
            "marker_count_error_absolute": "committed per-case count_absolute_error",
            "marker_count_equals_nPred": (
                "asserted and checked in the W-1 leg of this same artifact"
            ),
        },
        "sample_size_caveat": (
            "each condition holds 4 cases, so a single per-condition correlation cannot "
            "reach two-sided significance below |rho| near 1.0 and is reported as a "
            "direction, not as a measurement. The pooled, condition-demeaned and "
            "condition-level readings carry the weight."
        ),
        "per_condition": per_condition,
        "pooled_over_all_cases": pooled,
        "pooled_condition_demeaned": pooled_demeaned,
        "condition_level_over_condition_means": condition_level,
        "per_condition_spearman_sign_agreement": sign_agreement,
    }


def _load_members(published: dict, *, device):
    import torch

    models = []
    root = PUBLISHED_RUN.parent
    for member in published["members"]:
        weights_path = root / member["weights"]["path"]
        digest = hashlib.sha256(weights_path.read_bytes()).hexdigest()
        if digest != member["weights"]["sha256"]:
            raise ValueError(f"member checkpoint checksum mismatch: {weights_path}")
        model = build_model(member["config"]["method"], int(member["config"]["base_channels"]))
        archive = np.load(weights_path)
        model.load_state_dict({name: torch.from_numpy(archive[name]) for name in archive.files})
        models.append((member, model.to(device).eval(), digest))
    return models


def _marker_count(probabilities: np.ndarray, calibration: dict) -> int:
    """Independent re-derivation of the marker count, mirroring probabilities_to_instances.

    Written out rather than imported so that the claim "nPred is the marker count" is
    checked against a second expression of the same rule instead of assumed.
    """
    from skimage import feature

    foreground = probabilities[0] >= calibration["foreground_threshold"]
    boundary = probabilities[1]
    learned_distance = probabilities[2]
    seed_surface = learned_distance * (1.0 - boundary)
    if probabilities.shape[0] > 3:
        center_weight = calibration["center_weight"]
        seed_surface = (1.0 - center_weight) * seed_surface + center_weight * probabilities[3]
    seed_surface = seed_surface.copy()
    seed_surface[~foreground] = 0.0
    seed_surface[boundary >= calibration["boundary_threshold"]] = 0.0
    coords = feature.peak_local_max(
        seed_surface,
        min_distance=calibration["min_distance"],
        threshold_abs=calibration["marker_threshold"],
        labels=foreground,
        exclude_border=False,
    )
    return int(len(coords))


def run_w1(published: dict, *, device_name: str) -> dict:
    """W-1: recompute boundary F at 1 px tolerance, per condition. Zero test evaluations."""
    import torch

    if device_name.startswith("cuda") and not torch.cuda.is_available():
        raise RuntimeError("CUDA requested but unavailable; CPU fallback is forbidden")
    started = time.perf_counter()
    device = torch.device(device_name)

    cache = load_cache(WORKING_CACHE)
    cache_digest = hashlib.sha256(WORKING_CACHE.read_bytes()).hexdigest()
    test = select_split(cache, published["evaluation"]["split"])
    images = torch.from_numpy(test["images"].astype(np.float32)[:, None] / 255.0)

    members = _load_members(published, device=device)
    member_probabilities = []
    for member, model, digest in members:
        member_probabilities.append(_probabilities(model, images, device=device, batch_size=8))
        del model
        torch.cuda.empty_cache()
    combined = _combine(member_probabilities, published["config"]["ensemble_mode"])

    calibration = published["calibration"]
    committed = {case["sample_id"]: case for case in published["evaluation"]["cases"]}

    rows = []
    for index, probability in enumerate(combined):
        sample_id = str(test["sample_ids"][index])
        labels = probabilities_to_instances(
            probability,
            foreground_threshold=calibration["foreground_threshold"],
            boundary_threshold=calibration["boundary_threshold"],
            marker_threshold=calibration["marker_threshold"],
            min_distance=calibration["min_distance"],
            center_weight=calibration["center_weight"],
        )
        truth = test["labels"][index].astype(np.int32)
        n_pred = int(np.unique(labels[labels > 0]).size)
        markers = _marker_count(probability, calibration)
        row = {
            "sample_id": sample_id,
            "condition_id": str(test["conditions"][index]),
            "n_pred": n_pred,
            "n_gt": int(np.unique(truth[truth > 0]).size),
            "marker_count": markers,
            "marker_count_equals_n_pred": markers == n_pred,
            "boundary_by_tolerance_px": {},
        }
        for tolerance in BOUNDARY_TOLERANCES_PX:
            scores = boundary_fscore(labels, truth, tolerance_px=tolerance)
            row["boundary_by_tolerance_px"][f"{tolerance:g}"] = {
                "precision": scores["boundary_precision"],
                "recall": scores["boundary_recall"],
                "fscore": scores["boundary_fscore"],
            }
        rows.append(row)

    # Reproduction check: the committed record must be recovered before any new tolerance
    # is read off these same predictions.
    checks = []
    for row in rows:
        record = committed[row["sample_id"]]
        published_f = float(record["boundary_fscore"])
        recomputed_f = row["boundary_by_tolerance_px"][f"{PUBLISHED_TOLERANCE_PX:g}"]["fscore"]
        checks.append({
            "sample_id": row["sample_id"],
            "condition_id": row["condition_id"],
            "published_boundary_fscore_2px": published_f,
            "recomputed_boundary_fscore_2px": recomputed_f,
            "boundary_fscore_2px_identical": abs(recomputed_f - published_f) < 1e-9,
            "published_n_pred": int(record["nPred"]),
            "recomputed_n_pred": row["n_pred"],
            "n_pred_identical": int(record["nPred"]) == row["n_pred"],
            "published_n_gt": int(record["nGt"]),
            "recomputed_n_gt": row["n_gt"],
            "n_gt_identical": int(record["nGt"]) == row["n_gt"],
        })
    identical_f = sum(1 for check in checks if check["boundary_fscore_2px_identical"])
    identical_pred = sum(1 for check in checks if check["n_pred_identical"])
    identical_gt = sum(1 for check in checks if check["n_gt_identical"])
    max_abs_delta = max(
        abs(check["recomputed_boundary_fscore_2px"] - check["published_boundary_fscore_2px"])
        for check in checks
    )
    recomputed_mean_2px = float(np.mean([
        row["boundary_by_tolerance_px"][f"{PUBLISHED_TOLERANCE_PX:g}"]["fscore"] for row in rows
    ]))

    by_tolerance = {}
    for tolerance in BOUNDARY_TOLERANCES_PX:
        key = f"{tolerance:g}"
        by_tolerance[key] = {
            "mean_boundary_precision": _round(np.mean([
                row["boundary_by_tolerance_px"][key]["precision"] for row in rows
            ])),
            "mean_boundary_recall": _round(np.mean([
                row["boundary_by_tolerance_px"][key]["recall"] for row in rows
            ])),
            "mean_boundary_fscore": _round(np.mean([
                row["boundary_by_tolerance_px"][key]["fscore"] for row in rows
            ])),
        }

    conditions = sorted({row["condition_id"] for row in rows})
    per_condition = {}
    for name in conditions:
        block_rows = [row for row in rows if row["condition_id"] == name]
        block = {
            "n": len(block_rows),
            "mean_merges": _round(np.mean([
                float(committed[row["sample_id"]]["merges"]) for row in block_rows
            ])),
            "mean_splits": _round(np.mean([
                float(committed[row["sample_id"]]["splits"]) for row in block_rows
            ])),
            "mean_ap": _round(np.mean([
                float(committed[row["sample_id"]]["ap"]) for row in block_rows
            ])),
            "by_tolerance_px": {},
        }
        for tolerance in BOUNDARY_TOLERANCES_PX:
            key = f"{tolerance:g}"
            block["by_tolerance_px"][key] = {
                "mean_boundary_precision": _round(np.mean([
                    row["boundary_by_tolerance_px"][key]["precision"] for row in block_rows
                ])),
                "mean_boundary_recall": _round(np.mean([
                    row["boundary_by_tolerance_px"][key]["recall"] for row in block_rows
                ])),
                "mean_boundary_fscore": _round(np.mean([
                    row["boundary_by_tolerance_px"][key]["fscore"] for row in block_rows
                ])),
            }
        per_condition[name] = block

    # W-1 is mandated "before any ranking claim", so the artifact also records how much
    # ranking signal boundary F carries about the error term A-2 identifies. If merges do
    # not move boundary F at any tolerance, the metric cannot rank methods on the failure
    # that dominates AP, and that is a property of the metric, not of this model.
    case_merges = np.array([float(committed[row["sample_id"]]["merges"]) for row in rows])
    case_ap_loss = np.array([1.0 - float(committed[row["sample_id"]]["ap"]) for row in rows])
    sensitivity = {}
    for tolerance in BOUNDARY_TOLERANCES_PX:
        key = f"{tolerance:g}"
        case_f = np.array([row["boundary_by_tolerance_px"][key]["fscore"] for row in rows])
        sensitivity[key] = {
            "spearman_rho_boundary_f_vs_merges": _correlations(case_merges, case_f)["spearman_rho"],
            "spearman_rho_boundary_f_vs_ap_loss": (
                _correlations(case_ap_loss, case_f)["spearman_rho"]
            ),
        }

    props = torch.cuda.get_device_properties(device)
    return {
        "what": (
            "boundary precision/recall/F recomputed at 1 px tolerance and reported per "
            "condition, against the published 2.0 px reading"
        ),
        "boundary_f_sensitivity_over_the_64_cases": {
            "note": (
                "Spearman rho of per-case boundary F against per-case merges and against "
                "per-case AP loss, at each tolerance. A rho near zero or of the wrong sign "
                "means boundary F does not track the failure that costs AP."
            ),
            "by_tolerance_px": sensitivity,
        },
        "split": published["evaluation"]["split"],
        "cases": len(rows),
        "test_evaluations_spent": 0,
        "budget_note": (
            "no model trained, no arm selected, no threshold fitted. The committed member "
            "weights, the committed calibration thresholds and the committed working cache "
            "reproduce the already-spent test evaluation, and only the boundary tolerance "
            "is varied on those same predictions."
        ),
        "reproduction_of_the_published_evaluation": {
            "cache_path": "data/cache/learned-v2-192.npz",
            "cache_sha256": cache_digest,
            "member_weight_sha256": [digest for _, _, digest in members],
            "calibration_used": calibration,
            "cases_with_identical_boundary_fscore_at_2px": identical_f,
            "cases_with_identical_n_pred": identical_pred,
            "cases_with_identical_n_gt": identical_gt,
            "max_abs_delta_boundary_fscore_at_2px": _round(max_abs_delta, 9),
            "published_mean_boundary_fscore_at_2px": PUBLISHED_MEAN_BOUNDARY_FSCORE_AT_2PX,
            "recomputed_mean_boundary_fscore_at_2px": _round(recomputed_mean_2px),
            "reproduction_exact": (
                identical_f == len(rows)
                and identical_pred == len(rows)
                and identical_gt == len(rows)
            ),
        },
        "marker_count_equals_n_pred_in_all_cases": all(
            row["marker_count_equals_n_pred"] for row in rows
        ),
        "cases_where_marker_count_differs_from_n_pred": [
            {"sample_id": row["sample_id"], "marker_count": row["marker_count"],
             "n_pred": row["n_pred"]}
            for row in rows if not row["marker_count_equals_n_pred"]
        ],
        "object_scale_note": (
            "192x192 frames; the published fine-froth objects are about 9 px across, so "
            "2.0 px is over 20 percent of an object diameter and 1.0 px is about 11 percent"
        ),
        "aggregate_by_tolerance_px": by_tolerance,
        "per_condition": per_condition,
        "per_case": rows,
        "environment": {
            "python": platform.python_version(),
            "torch": torch.__version__,
            "cuda_runtime": torch.version.cuda,
            "device": props.name,
            "device_total_vram_mib": round(props.total_memory / 1024**2),
        },
        "duration_seconds": round(time.perf_counter() - started, 3),
    }


def decide_a1(a2: dict, w1: dict) -> dict:
    """Apply the justification gate fixed in this file's docstring. No adjustment."""
    leg1_variables = {}
    for variable in MARKER_VARIABLES:
        rho = a2["pooled_condition_demeaned"][variable]["spearman_rho"]
        agreement = a2["per_condition_spearman_sign_agreement"][variable]
        criterion_a = rho is not None and rho >= LEG1_MIN_POOLED_SPEARMAN
        criterion_b = agreement["positive_count"] >= LEG1_MIN_CONDITIONS_AGREEING
        leg1_variables[variable] = {
            "pooled_condition_demeaned_spearman_rho": rho,
            "meets_1a_pooled_rho_at_least_0_50": criterion_a,
            "conditions_with_positive_spearman": agreement["positive_count"],
            "meets_1b_at_least_10_of_16_positive": criterion_b,
            "variable_passes_leg1": bool(criterion_a and criterion_b),
        }
    leg1_pass = any(block["variable_passes_leg1"] for block in leg1_variables.values())

    key = f"{MANDATED_TOLERANCE_PX:g}"
    mean_f = w1["aggregate_by_tolerance_px"][key]["mean_boundary_fscore"]
    merge_condition_f = (
        w1["per_condition"][LEG2_MERGE_CONDITION]["by_tolerance_px"][key]["mean_boundary_fscore"]
    )
    criterion_2a = mean_f is not None and mean_f >= LEG2_MIN_MEAN_BOUNDARY_F_AT_1PX
    criterion_2b = (
        merge_condition_f is not None
        and merge_condition_f >= LEG2_MIN_MERGE_CONDITION_BOUNDARY_F_AT_1PX
    )
    leg2 = {
        "mean_boundary_fscore_at_1px": mean_f,
        "meets_2a_mean_at_least_0_90": criterion_2a,
        "merge_condition": LEG2_MERGE_CONDITION,
        "merge_condition_boundary_fscore_at_1px": merge_condition_f,
        "meets_2b_merge_condition_at_least_0_90": criterion_2b,
        "leg2_passes": bool(criterion_2a and criterion_2b),
    }

    return {
        "gate": (
            "both legs must pass for A-1 to be implemented and trained; the rule and its "
            "thresholds were written into scripts/run_p5_diagnostics.py before the first run"
        ),
        "leg1_a2_markers_dominate": {
            "rule": (
                "condition-demeaned pooled Spearman rho with AP loss at least +0.50 for at "
                "least one of merges, splits, absolute marker count error, AND that same "
                "variable positive in at least 10 of the 16 per-condition Spearman rhos"
            ),
            "variables": leg1_variables,
            "leg1_passes": bool(leg1_pass),
        },
        "leg2_w1_contours_are_solved": {
            "rule": (
                "mean boundary F at 1 px at least 0.90 over the 64 test cases AND at least "
                "0.90 on fine-froth; failing either overturns the reading that demotes the "
                "boundary direction, and A-1 is then not aimed at the dominant error term"
            ),
            **leg2,
        },
        "a1_justified": bool(leg1_pass and leg2["leg2_passes"]),
        "a1_bar_if_run": A1_BAR,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--device", default="cuda")
    args = parser.parse_args()

    published = json.loads(PUBLISHED_RUN.read_text(encoding="utf-8"))
    print("A-2: correlations from the committed per-case records (no GPU)")
    a2 = run_a2(published)
    print("W-1: recomputing boundary F at 1 px on reproduced predictions")
    w1 = run_w1(published, device_name=args.device)
    decision = decide_a1(a2, w1)

    report = {
        "experiment": "p5-diagnostics-before-architecture",
        "preregistration": (
            "CAOS_MANAGE plans/frothseg/research-2026-07-31/PLAN-PROPOSAL.md section P-5"
        ),
        "date": time.strftime("%Y-%m-%d"),
        "produced_by": "scripts/run_p5_diagnostics.py",
        "order_executed": ["A-2", "W-1", "A-1 gate"],
        "trained": "nothing",
        "test_evaluations_spent": 0,
        "published_model_under_diagnosis": {
            "path": "models/lamellastar-v1/run.json",
            "study": published["provenance"]["study"],
            "config": published["config"],
            "test_mean_ap": published["evaluation"]["mean_ap"],
            "test_mean_boundary_fscore": published["evaluation"]["mean_boundary_fscore"],
            "test_boundary_tolerance_px": PUBLISHED_TOLERANCE_PX,
        },
        "a2": a2,
        "w1": w1,
        "a1_decision": decision,
    }
    OUTPUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "reproduction_exact": w1["reproduction_of_the_published_evaluation"]["reproduction_exact"],
        "mean_boundary_fscore_at_1px": w1["aggregate_by_tolerance_px"]["1"]["mean_boundary_fscore"],
        "mean_boundary_fscore_at_2px": w1["aggregate_by_tolerance_px"]["2"]["mean_boundary_fscore"],
        "leg1_passes": decision["leg1_a2_markers_dominate"]["leg1_passes"],
        "leg2_passes": decision["leg2_w1_contours_are_solved"]["leg2_passes"],
        "a1_justified": decision["a1_justified"],
    }, indent=2))
    print(f"\nWrote {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
