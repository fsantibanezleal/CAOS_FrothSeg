"""Execute pre-registered experiment P-1: ensemble-to-ensemble spread on validation.

The pre-registration (CAOS_MANAGE `plans/frothseg/research-2026-07-31/PLAN-PROPOSAL.md`,
section P-1) fixes the hypothesis, the refutation condition, the budget and the claim
language BEFORE any run. This script only executes it; it does not choose anything.

Design, fixed in advance:

- Train 3 additional seeds at c24-e120 on the existing 192-sample train split, with the
  exact study v3 configuration (`scripts/run_n1_study_v3.py`), changing only the seed.
- Form 2 disjoint three-seed logit-mean ensembles: one from the new seeds (which share
  no seed with the published ensemble) plus the published one (seeds 25-26-27), and
  evaluate each on VALIDATION ONLY. Test budget: zero. The test split is never touched.
- Compute the ensemble-to-ensemble spread (max minus min) of mean validation AP.
- Hypothesis, refutable: spread below 0.01 mean AP.
- Refutation condition: spread comparable to the single-model seed spread 0.03744; in
  that case the published N1 claim language must be weakened.

    python scripts/run_p1_ensemble_spread.py --work-root E:/_Temp/p1-ensemble-spread \
        --published-member-root E:/_Temp/n1-v3 --skip-existing
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PYTHON = sys.executable

#: New seeds, continuing the study v3 seed sequence. None appears in the published
#: ensemble (20260725, 20260726, 20260727), so the two ensembles are disjoint.
NEW_TRAIN_RUNS = (
    ("c24-e120-s20260728", {"base_channels": 24, "epochs": 120, "seed": 20260728}),
    ("c24-e120-s20260729", {"base_channels": 24, "epochs": 120, "seed": 20260729}),
    ("c24-e120-s20260730", {"base_channels": 24, "epochs": 120, "seed": 20260730}),
)

PUBLISHED_MEMBER_IDS = (
    "c24-e120-s20260725",
    "c24-e120-s20260726",
    "c24-e120-s20260727",
)

#: Study v3 record for the published ensemble on validation (E:/_Temp/n1-v3
#: study-v3-validation.json). Re-measured here through the same code path; a mismatch
#: beyond numerical noise is an error, not something to paper over.
PUBLISHED_VALIDATION_MEAN_AP_RECORDED = 0.524

#: Pre-registered constants. Fixed before any result was seen.
HYPOTHESIS_SPREAD_BELOW = 0.01
SINGLE_MODEL_SEED_SPREAD = 0.03744

#: The published test margin of N1 over the measured Cellpose-SAM baseline
#: (verification/n1-preregistered-ablation.json studies[2].outcome). Reported here because
#: the fail-branch claim language compares the margin against the measured spread.
PUBLISHED_TEST_MARGIN_OVER_BASELINE = 0.008703


def _run(command: list[str]) -> None:
    print("  $", " ".join(str(part) for part in command))
    subprocess.run(command, check=True, cwd=ROOT)


def _mean_ap(run_dir: Path) -> float:
    document = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
    for key in ("validation", "evaluation"):
        block = document.get(key)
        if isinstance(block, dict) and "mean_ap" in block:
            return float(block["mean_ap"])
    raise KeyError(f"{run_dir}: no validation mean_ap in run.json")


def _evaluate_ensemble(
    member_dirs: list[Path], output: Path, *, device: str, skip_existing: bool
) -> float:
    if skip_existing and (output / "run.json").is_file():
        print(f"[{output.name}] reusing existing ensemble evaluation")
        return _mean_ap(output)
    command = [PYTHON, "-m", "fslab.learning.evaluate_ensemble"]
    for member in member_dirs:
        command += ["--model", str(member)]
    command += [
        "--output", str(output),
        "--mode", "logit-mean",
        "--tta", "none",
        "--evaluation-split", "validation",
        "--device", device,
    ]
    _run(command)
    return _mean_ap(output)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--work-root", type=Path, required=True)
    parser.add_argument(
        "--published-member-root",
        type=Path,
        required=True,
        help="directory holding the study v3 member run dirs (c24-e120-s2026072{5,6,7})",
    )
    parser.add_argument("--device", default="cuda")
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="reuse a run directory that already carries a run.json",
    )
    args = parser.parse_args()
    work_root = args.work_root.resolve()
    work_root.mkdir(parents=True, exist_ok=True)

    training_failures: list[dict] = []
    new_members: list[dict] = []
    for run_id, config in NEW_TRAIN_RUNS:
        output = work_root / run_id
        if args.skip_existing and (output / "run.json").is_file():
            print(f"[{run_id}] reusing existing run")
        else:
            print(f"[{run_id}] training")
            started = time.perf_counter()
            try:
                _run([
                    PYTHON, "-m", "fslab.learning.train_multitask",
                    "--method", "lamellastar",
                    "--output", str(output),
                    "--seed", str(config["seed"]),
                    "--epochs", str(config["epochs"]),
                    "--base-channels", str(config["base_channels"]),
                    "--evaluation-split", "validation",
                    "--device", args.device,
                    "--no-resume",
                ])
            except subprocess.CalledProcessError as error:
                # Per the pre-registration: record the failure and continue with what
                # completed. Never silently substitute a checkpoint.
                print(f"[{run_id}] TRAINING FAILED: {error}")
                training_failures.append({"id": run_id, **config, "error": str(error)})
                continue
            print(f"[{run_id}] done in {time.perf_counter() - started:.0f}s")
        mean_ap = _mean_ap(output)
        new_members.append({"id": run_id, **config, "validation_mean_ap": mean_ap})
        print(f"[{run_id}] validation mean AP {mean_ap:.5f}")

    ensembles: list[dict] = []
    if len(new_members) == 3:
        new_id = "ensemble-logitmean-e120-seeds-28-29-30"
        new_ap = _evaluate_ensemble(
            [work_root / member["id"] for member in new_members],
            work_root / new_id,
            device=args.device,
            skip_existing=args.skip_existing,
        )
        ensembles.append({
            "id": new_id,
            "members": [member["id"] for member in new_members],
            "seeds": [member["seed"] for member in new_members],
            "published": False,
            "validation_mean_ap": new_ap,
        })
        print(f"[{new_id}] validation mean AP {new_ap:.5f}")
    else:
        print(
            f"Only {len(new_members)} of 3 new seeds completed; the new ensemble "
            "cannot be formed. Failures are recorded in the output."
        )

    published_member_dirs = [
        args.published_member_root / member_id for member_id in PUBLISHED_MEMBER_IDS
    ]
    published_id = "ensemble-logitmean-e120-seeds-25-26-27"
    published_ap = _evaluate_ensemble(
        published_member_dirs,
        work_root / published_id,
        device=args.device,
        skip_existing=args.skip_existing,
    )
    ensembles.append({
        "id": published_id,
        "members": PUBLISHED_MEMBER_IDS,
        "seeds": [20260725, 20260726, 20260727],
        "published": True,
        "validation_mean_ap": published_ap,
        "study_v3_recorded_validation_mean_ap": PUBLISHED_VALIDATION_MEAN_AP_RECORDED,
        "matches_study_v3_record": abs(
            published_ap - PUBLISHED_VALIDATION_MEAN_AP_RECORDED
        ) < 1e-9,
    })
    print(f"[{published_id}] validation mean AP {published_ap:.5f}")

    aps = [ensemble["validation_mean_ap"] for ensemble in ensembles]
    spread = max(aps) - min(aps) if len(aps) >= 2 else None
    verdict = None
    if spread is not None:
        verdict = "pass" if spread < HYPOTHESIS_SPREAD_BELOW else "fail"

    report = {
        "experiment": "p1-ensemble-to-ensemble-spread",
        "preregistration": (
            "CAOS_MANAGE plans/frothseg/research-2026-07-31/PLAN-PROPOSAL.md section P-1"
        ),
        "date": time.strftime("%Y-%m-%d"),
        "design": {
            "configuration": "lamellastar c24-e120, lr 8e-4, batch 8, augmentation none",
            "train_split": "existing 192-sample train split (data/cache/learned-v2-192.npz)",
            "evaluation_split": "validation only",
            "test_evaluations_spent": 0,
            "ensemble_mode": "logit-mean",
            "tta": "none",
        },
        "seeds": {
            "published_ensemble": [20260725, 20260726, 20260727],
            "new_ensemble": [config["seed"] for _, config in NEW_TRAIN_RUNS],
        },
        "new_members": new_members,
        "training_failures": training_failures,
        "ensembles": ensembles,
        "spread_mean_validation_ap": spread,
        "hypothesis": (
            "the published N1 leaderboard position is stable across ensemble draws: "
            "the ensemble-to-ensemble spread at c24-e120 is below 0.01 mean AP on "
            "validation"
        ),
        "hypothesis_threshold": HYPOTHESIS_SPREAD_BELOW,
        "refutation_condition": (
            "spread comparable to the single-model seed spread (0.03744); in that case "
            "the N1 result is not distinguishable from noise and the published claim "
            "language must be weakened"
        ),
        "single_model_seed_spread": SINGLE_MODEL_SEED_SPREAD,
        "spread_over_single_model_seed_spread": (
            spread / SINGLE_MODEL_SEED_SPREAD if spread is not None else None
        ),
        "published_test_margin_over_baseline": PUBLISHED_TEST_MARGIN_OVER_BASELINE,
        "spread_exceeds_published_margin": (
            spread > PUBLISHED_TEST_MARGIN_OVER_BASELINE if spread is not None else None
        ),
        "verdict": verdict,
        "verdict_rule": (
            "pass if the measured spread is below the pre-registered 0.01 threshold, "
            "fail otherwise; the rule was fixed before the runs and is not adjusted here"
        ),
    }
    destination = ROOT / "verification" / "p1-ensemble-spread.json"
    destination.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print()
    print(json.dumps(report, indent=2))
    print(f"\nWrote {destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
