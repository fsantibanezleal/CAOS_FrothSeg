"""Execute the pre-registered N1 study v3 on the validation split.

The pre-registration (CAOS_MANAGE `wip/frothseg/n1-study-v3-preregistration-2026-07-27.md`)
fixes the seven configurations, the selection rule, and the single permitted test evaluation
BEFORE any run. This script only executes it; it does not choose anything.

It never touches the test split. Selection is validation mean AP; post-processing thresholds
are fitted on calibration inside the training/ensemble code, as in studies v1 and v2.

    python scripts/run_n1_study_v3.py --work-root E:/_Temp/n1-v3
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

#: id -> training arguments. Order matters: the epoch probe runs first because the
#: pre-registered kill criterion depends on its result.
TRAIN_RUNS = (
    ("c24-e120-s20260727", {"base_channels": 24, "epochs": 120, "seed": 20260727}),
    ("c24-e160-s20260727", {"base_channels": 24, "epochs": 160, "seed": 20260727}),
    ("c24-e120-s20260725", {"base_channels": 24, "epochs": 120, "seed": 20260725}),
    ("c24-e120-s20260726", {"base_channels": 24, "epochs": 120, "seed": 20260726}),
    ("c32-e120-s20260727", {"base_channels": 32, "epochs": 120, "seed": 20260727}),
)

ENSEMBLE_RUNS = (
    (
        "ensemble-logitmean-e120-seeds-25-26-27",
        {
            "members": ("c24-e120-s20260725", "c24-e120-s20260726", "c24-e120-s20260727"),
            "mode": "logit-mean",
            "tta": "none",
        },
    ),
    (
        "ensemble-logitmean-tta-d4-e120-seeds-25-26-27",
        {
            "members": ("c24-e120-s20260725", "c24-e120-s20260726", "c24-e120-s20260727"),
            "mode": "logit-mean",
            "tta": "d4",
        },
    ),
)

#: The v2 winner. The pre-registered finalist gate requires strictly beating it.
V2_WINNER_VALIDATION_MEAN_AP = 0.49982812500000007


def _run(command: list[str]) -> None:
    print("  $", " ".join(str(part) for part in command))
    subprocess.run(command, check=True, cwd=ROOT)


def _validation_mean_ap(model_dir: Path) -> float:
    document = json.loads((model_dir / "run.json").read_text(encoding="utf-8"))
    for key in ("validation", "evaluation"):
        block = document.get(key)
        if isinstance(block, dict) and "mean_ap" in block:
            return float(block["mean_ap"])
    raise KeyError(f"{model_dir}: no validation mean_ap in run.json")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--work-root", type=Path, required=True)
    parser.add_argument("--device", default="cuda")
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="reuse a run directory that already carries a run.json",
    )
    args = parser.parse_args()
    work_root = args.work_root.resolve()
    work_root.mkdir(parents=True, exist_ok=True)

    results: list[dict] = []
    stopped_early = False
    for run_id, config in TRAIN_RUNS:
        output = work_root / run_id
        if args.skip_existing and (output / "run.json").is_file():
            print(f"[{run_id}] reusing existing run")
        else:
            print(f"[{run_id}] training")
            started = time.perf_counter()
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
            print(f"[{run_id}] done in {time.perf_counter() - started:.0f}s")
        mean_ap = _validation_mean_ap(output)
        results.append({"id": run_id, **config, "mean_ap": mean_ap})
        print(f"[{run_id}] validation mean AP {mean_ap:.5f}")

        # Pre-registered kill criterion: if the first longer run does not beat e80, the epoch
        # trend has turned over and the longer schedules are not worth the machine time.
        if run_id == "c24-e120-s20260727" and mean_ap <= V2_WINNER_VALIDATION_MEAN_AP:
            print(
                "KILL CRITERION MET: e120 did not beat e80 "
                f"({mean_ap:.5f} <= {V2_WINNER_VALIDATION_MEAN_AP:.5f}). "
                "Stopping the longer schedules; record the deviation."
            )
            stopped_early = True
            break

    if not stopped_early:
        for run_id, config in ENSEMBLE_RUNS:
            output = work_root / f"{run_id}.json"
            print(f"[{run_id}] evaluating ensemble")
            command = [PYTHON, "-m", "fslab.learning.evaluate_ensemble"]
            for member in config["members"]:
                command += ["--model", str(work_root / member)]
            command += [
                "--output", str(output),
                "--mode", str(config["mode"]),
                "--tta", str(config["tta"]),
                "--evaluation-split", "validation",
                "--device", args.device,
            ]
            _run(command)
            document = json.loads(output.read_text(encoding="utf-8"))
            mean_ap = float(document["mean_ap"])
            results.append({"id": run_id, **{
                key: value for key, value in config.items() if key != "members"
            }, "members": list(config["members"]), "mean_ap": mean_ap})
            print(f"[{run_id}] validation mean AP {mean_ap:.5f}")

    results.sort(key=lambda row: -row["mean_ap"])
    winner = results[0]
    clears_gate = winner["mean_ap"] > V2_WINNER_VALIDATION_MEAN_AP
    summary = {
        "study": "n1-long-schedule-study-v3",
        "selection_metric": "validation mean_ap",
        "v2_winner_validation_mean_ap": V2_WINNER_VALIDATION_MEAN_AP,
        "validation_results": results,
        "winner": winner,
        "clears_finalist_threshold": clears_gate,
        "stopped_early": stopped_early,
    }
    (work_root / "study-v3-validation.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    print()
    print(json.dumps(summary, indent=2))
    if not clears_gate:
        print(
            "\nThe winner does not beat the v2 configuration on validation. "
            "Per the pre-registration, no test evaluation is spent."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
