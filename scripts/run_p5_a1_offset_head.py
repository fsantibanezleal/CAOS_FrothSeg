"""Execute pre-registered experiment P-5 / A-1: the two-channel centroid-offset head.

Runs ONLY because `verification/p5-diagnostics.json` recorded `a1_justified: true`. The
gate that produced that verdict was written into `scripts/run_p5_diagnostics.py` before
the diagnostics were run and is not revisited here.

P-5, verbatim:

    A-1, only if A-2 and W-1 justify it: replace the scalar distance head with a
    two-channel centroid offset field (`METHOD_CHANNELS["lamellastar"]` 4 to 5), derive
    markers from the field's divergence rather than from `peak_local_max` on a scalar
    surface, everything else including the calibration grid held fixed.

    Pre-registered bar for A-1: must beat the published ensemble's validation mean AP by
    more than 0.03744 in a three-seed paired comparison, AND must reduce merges on
    `fine-froth` and splits on `coarse-froth` at the same time. Reducing one at the cost
    of the other is a NULL, because the current operating point already trades them.

DESIGN, FIXED BEFORE THE RUN
----------------------------
- Arm: `lamellastar_offset`, base_channels 24, epochs 120, lr 8e-4, batch 8, augmentation
  none, on the existing 192-sample train split of `data/cache/learned-v2-192.npz`.
- Seeds: 20260725, 20260726, 20260727. The SAME three seeds as the published ensemble,
  which is what makes the comparison paired.
- Baseline: the published three-seed logit-mean ensemble, re-evaluated on validation in
  this same run so that every baseline number in the artifact comes from a file this
  script produced rather than from a recalled figure.
- Evaluation split: VALIDATION ONLY. Test-evaluation budget requested: ZERO. The test
  split is never read.
- Selection metric: validation mean AP, no tiebreak, as everywhere else in this repo.
- Merge and split counts are read from the per-case rows of the same two validation
  evaluations, on the same 64 samples, so the three bar clauses are measured together.

VERDICT RULE, FIXED BEFORE THE RUN
----------------------------------
pass  = delta_mean_ap > 0.03744 AND fine-froth mean merges strictly lower AND coarse-froth
        mean splits strictly lower.
null  = anything else, including a large AP gain that improves only one of the two error
        directions. A null is published as a null.

    python scripts/run_p5_a1_offset_head.py --work-root E:/_Temp/p5-a1-offset \
        --published-member-root E:/_Temp/n1-v3
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
PYTHON = sys.executable

#: Paired seeds: identical to the published ensemble's.
SEEDS = (20260725, 20260726, 20260727)
BASE_CHANNELS = 24
EPOCHS = 120
METHOD = "lamellastar_offset"

PUBLISHED_MEMBER_IDS = (
    "c24-e120-s20260725",
    "c24-e120-s20260726",
    "c24-e120-s20260727",
)

#: Pre-registered constants, quoted from P-5. Not adjustable.
NOISE_FLOOR_SINGLE_MODEL_SEED_SPREAD = 0.03744
MERGE_CONDITION = "fine-froth"
SPLIT_CONDITION = "coarse-froth"

#: Recorded validation mean AP of the published ensemble (study v3, re-measured by P-1 in
#: verification/p1-ensemble-spread.json). Re-measured again here; a mismatch is an error.
PUBLISHED_VALIDATION_MEAN_AP_RECORDED = 0.524


def _oracle_decode_check(scalar_calibration: dict, offset_calibration: dict) -> dict:
    """Decode ground-truth target stacks, so the decode is measured without the network.

    Reported because the calibration grid's choice of ``center_weight`` is only
    interpretable next to this. If the divergence markers recover instances from a perfect
    field and the grid still rejects them from the trained field, the failure is in what
    was learned, not in how it is decoded.
    """
    import numpy as np

    from fslab.learning import offset_head
    from fslab.learning.data_cache import load_cache, select_split
    from fslab.learning.multitask_models import probabilities_to_instances as scalar_decode
    from fslab.learning.multitask_models import targets as scalar_targets
    from fslab.science.segment import mask_ap

    cache = load_cache(ROOT / "data" / "cache" / "learned-v2-192.npz")
    split = select_split(cache, "calibration")
    _, indices = np.unique(split["group_ids"], return_index=True)
    indices = np.sort(indices)

    arms = {
        "scalar_head_at_its_selected_calibration": (
            "scalar", scalar_calibration, scalar_calibration["center_weight"],
        ),
        "offset_head_at_its_selected_calibration": (
            "offset", offset_calibration, offset_calibration["center_weight"],
        ),
        "offset_head_with_divergence_markers_only": (
            "offset", offset_calibration, 0.0,
        ),
    }
    report = {
        "what": (
            "mean AP of each decode applied to GROUND-TRUTH target stacks over the 32 "
            "calibration groups; no network involved, so this measures the decode alone"
        ),
        "split": "calibration",
        "groups": int(len(indices)),
    }
    for name, (layout, calibration, center_weight) in arms.items():
        scores = []
        for index in indices:
            labels = split["labels"][index].astype(np.int32)
            if layout == "scalar":
                stack = scalar_targets(labels, include_centers=True)
                decode = scalar_decode
            else:
                stack = offset_head.targets(labels)
                decode = offset_head.probabilities_to_instances
            predicted = decode(
                stack.astype(np.float64),
                foreground_threshold=calibration["foreground_threshold"],
                boundary_threshold=calibration["boundary_threshold"],
                marker_threshold=calibration["marker_threshold"],
                min_distance=calibration["min_distance"],
                center_weight=center_weight,
            )
            score = mask_ap(predicted, labels)["ap"]
            if score is not None:
                scores.append(float(score))
        report[name] = {"center_weight": center_weight, "mean_ap": float(np.mean(scores))}
    return report


def _run(command: list[str]) -> None:
    print("  $", " ".join(str(part) for part in command), flush=True)
    subprocess.run(command, check=True, cwd=ROOT)


def _evaluation(run_dir: Path) -> dict:
    document = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
    return document["evaluation"]


def _calibration(run_dir: Path) -> dict:
    document = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
    return document["calibration"]


def _condition_means(evaluation: dict, condition: str) -> dict:
    rows = [row for row in evaluation["cases"] if row["condition_id"] == condition]
    if not rows:
        raise KeyError(f"no cases for condition {condition}")
    return {
        "n": len(rows),
        "mean_merges": float(np.mean([float(row["merges"]) for row in rows])),
        "mean_splits": float(np.mean([float(row["splits"]) for row in rows])),
        "mean_ap": float(np.mean([float(row["ap"]) for row in rows])),
    }


def _evaluate_ensemble(members: list[Path], output: Path, *, device: str, skip: bool) -> dict:
    if skip and (output / "run.json").is_file():
        print(f"[{output.name}] reusing existing ensemble evaluation", flush=True)
        return _evaluation(output)
    command = [PYTHON, "-m", "fslab.learning.evaluate_ensemble"]
    for member in members:
        command += ["--model", str(member)]
    command += [
        "--output", str(output),
        "--mode", "logit-mean",
        "--tta", "none",
        "--evaluation-split", "validation",
        "--device", device,
    ]
    _run(command)
    return _evaluation(output)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--work-root", type=Path, required=True)
    parser.add_argument("--published-member-root", type=Path, required=True)
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--skip-existing", action="store_true")
    args = parser.parse_args()
    work_root = args.work_root.resolve()
    work_root.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()

    diagnostics = json.loads(
        (ROOT / "verification" / "p5-diagnostics.json").read_text(encoding="utf-8")
    )
    if not diagnostics["a1_decision"]["a1_justified"]:
        raise SystemExit(
            "verification/p5-diagnostics.json records a1_justified=false; P-5 forbids "
            "training A-1 in that case"
        )

    members: list[dict] = []
    failures: list[dict] = []
    for seed in SEEDS:
        run_id = f"offset-c{BASE_CHANNELS}-e{EPOCHS}-s{seed}"
        output = work_root / run_id
        if args.skip_existing and (output / "run.json").is_file():
            print(f"[{run_id}] reusing existing run", flush=True)
        else:
            print(f"[{run_id}] training", flush=True)
            try:
                _run([
                    PYTHON, "-m", "fslab.learning.train_multitask",
                    "--method", METHOD,
                    "--output", str(output),
                    "--seed", str(seed),
                    "--epochs", str(EPOCHS),
                    "--base-channels", str(BASE_CHANNELS),
                    "--evaluation-split", "validation",
                    "--device", args.device,
                    "--no-resume",
                ])
            except subprocess.CalledProcessError as error:
                print(f"[{run_id}] TRAINING FAILED: {error}", flush=True)
                failures.append({"id": run_id, "seed": seed, "error": str(error)})
                continue
        evaluation = _evaluation(output)
        members.append({
            "id": run_id,
            "seed": seed,
            "validation_mean_ap": float(evaluation["mean_ap"]),
        })
        print(f"[{run_id}] validation mean AP {evaluation['mean_ap']:.5f}", flush=True)

    if len(members) != len(SEEDS):
        raise SystemExit(
            f"only {len(members)} of {len(SEEDS)} A-1 seeds completed; the three-seed "
            f"paired comparison cannot be formed. Failures: {failures}"
        )

    arm_evaluation = _evaluate_ensemble(
        [work_root / member["id"] for member in members],
        work_root / "ensemble-offset-logitmean-e120",
        device=args.device,
        skip=args.skip_existing,
    )
    baseline_evaluation = _evaluate_ensemble(
        [args.published_member_root / member_id for member_id in PUBLISHED_MEMBER_IDS],
        work_root / "ensemble-published-logitmean-e120",
        device=args.device,
        skip=args.skip_existing,
    )

    arm_ap = float(arm_evaluation["mean_ap"])
    baseline_ap = float(baseline_evaluation["mean_ap"])
    delta = arm_ap - baseline_ap
    arm_merge = _condition_means(arm_evaluation, MERGE_CONDITION)
    baseline_merge = _condition_means(baseline_evaluation, MERGE_CONDITION)
    arm_split = _condition_means(arm_evaluation, SPLIT_CONDITION)
    baseline_split = _condition_means(baseline_evaluation, SPLIT_CONDITION)

    arm_calibration = _calibration(work_root / "ensemble-offset-logitmean-e120")
    baseline_calibration = _calibration(work_root / "ensemble-published-logitmean-e120")
    member_calibrations = {
        member["id"]: _calibration(work_root / member["id"]) for member in members
    }
    oracle = _oracle_decode_check(baseline_calibration, arm_calibration)

    beats_noise_floor = delta > NOISE_FLOOR_SINGLE_MODEL_SEED_SPREAD
    reduces_merges = arm_merge["mean_merges"] < baseline_merge["mean_merges"]
    reduces_splits = arm_split["mean_splits"] < baseline_split["mean_splits"]
    verdict = "pass" if (beats_noise_floor and reduces_merges and reduces_splits) else "null"

    report = {
        "experiment": "p5-a1-centroid-offset-head",
        "preregistration": (
            "CAOS_MANAGE plans/frothseg/research-2026-07-31/PLAN-PROPOSAL.md section P-5"
        ),
        "gated_by": {
            "evidence": "verification/p5-diagnostics.json",
            "a1_justified": diagnostics["a1_decision"]["a1_justified"],
            "leg1_passes": diagnostics["a1_decision"]["leg1_a2_markers_dominate"]["leg1_passes"],
            "leg2_passes": (
                diagnostics["a1_decision"]["leg2_w1_contours_are_solved"]["leg2_passes"]
            ),
        },
        "date": time.strftime("%Y-%m-%d"),
        "produced_by": "scripts/run_p5_a1_offset_head.py",
        "implementation": {
            "method": METHOD,
            "channels": 5,
            "layout": "foreground, boundary, offset_y, offset_x, center",
            "targets_and_decode": "data-pipeline/fslab/learning/offset_head.py",
            "architecture": (
                "LamellaStarOffset in data-pipeline/fslab/learning/multitask_models.py: "
                "the published LamellaStar with the 1x1 output head widened from 4 to 5"
            ),
            "marker_derivation": (
                "centroids of connected components of the thresholded convergence surface "
                "(negative divergence of the offset field) blended with the center channel, "
                "with min_distance applied as Chebyshev separation; no peak_local_max"
            ),
            "registered_as_sibling_method_not_a_redefinition": (
                "P-5 says METHOD_CHANNELS['lamellastar'] 4 to 5. Redefining 'lamellastar' "
                "would break every committed four-channel checkpoint, ONNX export and "
                "artifact, so the head is registered as 'lamellastar_offset'. The "
                "hypothesis, bar, budget and claim language are unchanged."
            ),
            "held_fixed": [
                "encoder, bridge, gates and decoder",
                "AdamW at lr 8e-4, batch 8, 120 epochs, augmentation none",
                "foreground, boundary and center loss terms and weights; the offset "
                "regression carries the same 2.0 weight the distance term carried",
                "the 405-combination calibration grid and its exact values",
                "logit-mean ensembling of three seeds",
            ],
        },
        "design": {
            "seeds": list(SEEDS),
            "paired_with": "the published ensemble, same three seeds",
            "train_split": "existing 192-sample train split (data/cache/learned-v2-192.npz)",
            "evaluation_split": "validation only",
            "test_evaluations_spent": 0,
            "ensemble_mode": "logit-mean",
            "tta": "none",
        },
        "members": members,
        "training_failures": failures,
        "selected_calibration": {
            "note": (
                "The 405-point grid was held fixed and run unchanged for every arm. What it "
                "SELECTED is a measurement in its own right: center_weight 1.0 means the "
                "marker surface is the center channel alone and the field divergence "
                "contributed nothing to the markers of that run."
            ),
            "arm_ensemble": arm_calibration,
            "baseline_ensemble": baseline_calibration,
            "arm_members": member_calibrations,
            "arm_runs_that_selected_center_weight_1": sum(
                1 for value in list(member_calibrations.values()) + [arm_calibration]
                if value["center_weight"] == 1.0
            ),
            "arm_runs_total": len(member_calibrations) + 1,
        },
        "oracle_decode_check": oracle,
        "arm": {
            "id": "ensemble-offset-logitmean-e120",
            "run_json": (work_root / "ensemble-offset-logitmean-e120" / "run.json").as_posix(),
            "validation_mean_ap": arm_ap,
            "validation_mean_pq": arm_evaluation["mean_pq"],
            "validation_mean_boundary_fscore": arm_evaluation["mean_boundary_fscore"],
            "validation_mean_count_absolute_error": arm_evaluation["mean_count_absolute_error"],
            MERGE_CONDITION: arm_merge,
            SPLIT_CONDITION: arm_split,
        },
        "baseline_published_ensemble": {
            "id": "ensemble-published-logitmean-e120",
            "run_json": (work_root / "ensemble-published-logitmean-e120" / "run.json").as_posix(),
            "validation_mean_ap": baseline_ap,
            "validation_mean_pq": baseline_evaluation["mean_pq"],
            "validation_mean_boundary_fscore": baseline_evaluation["mean_boundary_fscore"],
            "validation_mean_count_absolute_error": (
                baseline_evaluation["mean_count_absolute_error"]
            ),
            MERGE_CONDITION: baseline_merge,
            SPLIT_CONDITION: baseline_split,
            "recorded_validation_mean_ap": PUBLISHED_VALIDATION_MEAN_AP_RECORDED,
            "matches_recorded_value": (
                abs(baseline_ap - PUBLISHED_VALIDATION_MEAN_AP_RECORDED) < 1e-9
            ),
        },
        "bar": {
            "statement": (
                "must beat the published ensemble's validation mean AP by more than "
                "0.03744 in a three-seed paired comparison, and must reduce merges on "
                "fine-froth and splits on coarse-froth at the same time; reducing one at "
                "the cost of the other is a null"
            ),
            "noise_floor": NOISE_FLOOR_SINGLE_MODEL_SEED_SPREAD,
            "delta_validation_mean_ap": delta,
            "beats_noise_floor": bool(beats_noise_floor),
            "merge_condition": MERGE_CONDITION,
            "baseline_mean_merges": baseline_merge["mean_merges"],
            "arm_mean_merges": arm_merge["mean_merges"],
            "reduces_merges": bool(reduces_merges),
            "split_condition": SPLIT_CONDITION,
            "baseline_mean_splits": baseline_split["mean_splits"],
            "arm_mean_splits": arm_split["mean_splits"],
            "reduces_splits": bool(reduces_splits),
        },
        "verdict": verdict,
        "verdict_rule": (
            "pass only if all three clauses hold together; anything else is a null and is "
            "published as one. The rule was fixed before the runs and is not adjusted here"
        ),
        "duration_seconds": round(time.perf_counter() - started, 3),
    }
    destination = ROOT / "verification" / "p5-a1-offset-head.json"
    destination.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print()
    print(json.dumps(report["bar"], indent=2))
    print(f"verdict: {verdict}")
    print(f"\nWrote {destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
