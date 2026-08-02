"""R-1: retrain every model whose exported weights were the last epoch rather than the best.

Pre-registered in `CAOS_MANAGE/plans/frothseg/research-2026-07-31/
r1-checkpoint-selection-preregistration-2026-08-01.md`. Read that file before this one; the bars
below were fixed there before any retrain ran.

The defect this repairs is in the trainers, not in the models: `checkpoint.pt` was rewritten every
epoch, so the weights that left `train()` were always the final epoch's, whatever the validation
curve recorded alongside them did. On the three published lamellastar members that discarded the
epoch-51..57 minimum and shipped weights 25 to 31 percent worse in validation loss.

Bar B1 from the pre-registration is enforced here and is checked FIRST: the retrained validation
curve must reproduce the committed one to 1e-6 on every epoch. Without that, a retrain is a new
model rather than a recovery of the discarded one, and the pre-registration says to report the
non-determinism instead of swapping any weights. `_seed()` sets deterministic algorithms and
disables cudnn benchmarking, so the gate is expected to pass; it is checked because "expected" is
not evidence.

Nothing here reads the test split. Selection is by validation loss, per bar B2.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[1]
WORK = Path("E:/_Temp/frothseg-r1")

# Every model trained by a loop with the defect, with the config recorded in its committed
# run.json. Copied from those manifests, not retyped from memory.
TARGETS = [
    {
        "name": "seed-20260725",
        "trainer": "multitask",
        "published": "models/lamellastar-v1/members/seed-20260725/checkpoint.pt",
        "args": ["--method", "lamellastar", "--seed", "20260725", "--epochs", "120",
                 "--base-channels", "24", "--batch-size", "8", "--learning-rate", "0.0008",
                 "--augmentation", "none", "--evaluation-split", "validation"],
    },
    {
        "name": "seed-20260726",
        "trainer": "multitask",
        "published": "models/lamellastar-v1/members/seed-20260726/checkpoint.pt",
        "args": ["--method", "lamellastar", "--seed", "20260726", "--epochs", "120",
                 "--base-channels", "24", "--batch-size", "8", "--learning-rate", "0.0008",
                 "--augmentation", "none", "--evaluation-split", "validation"],
    },
    {
        "name": "seed-20260727",
        "trainer": "multitask",
        "published": "models/lamellastar-v1/members/seed-20260727/checkpoint.pt",
        "args": ["--method", "lamellastar", "--seed", "20260727", "--epochs", "120",
                 "--base-channels", "24", "--batch-size", "8", "--learning-rate", "0.0008",
                 "--augmentation", "none", "--evaluation-split", "validation"],
    },
    {
        "name": "gc-fsegnet-v1",
        "trainer": "multitask",
        "published": "models/gc-fsegnet-v1/checkpoint.pt",
        "args": ["--method", "gc_fsegnet", "--seed", "20260725", "--epochs", "16",
                 "--base-channels", "16", "--batch-size", "8", "--learning-rate", "0.0008",
                 "--evaluation-split", "test"],
    },
    {
        "name": "deep-marker-watershed-v1",
        "trainer": "multitask",
        "published": "models/deep-marker-watershed-v1/checkpoint.pt",
        "args": ["--method", "deep_marker_watershed", "--seed", "20260725", "--epochs", "16",
                 "--base-channels", "16", "--batch-size", "8", "--learning-rate", "0.0008",
                 "--evaluation-split", "test"],
    },
    {
        "name": "unet-watershed-v2",
        "trainer": "unet",
        "published": "models/unet-watershed-v2/checkpoint.pt",
        "args": ["--epochs", "24", "--image-size", "192", "--base-channels", "24",
                 "--batch-size", "8"],
    },
]


def curve(path: Path) -> tuple[np.ndarray, np.ndarray]:
    checkpoint = torch.load(path, map_location="cpu", weights_only=False)
    history = checkpoint["history"]
    return (
        np.array([row["validation_loss"] for row in history], dtype=np.float64),
        np.array([row["train_loss"] for row in history], dtype=np.float64),
    )


def train_one(target: dict) -> dict:
    output = WORK / target["name"]
    module = (
        "fslab.learning.train_multitask" if target["trainer"] == "multitask"
        else "fslab.learning.train_unet"
    )
    if not (output / "run.json").exists():
        command = [
            sys.executable, "-m", module,
            "--output", str(output), "--selection", "best", "--no-resume", *target["args"],
        ]
        print(f"\n=== {target['name']}: {' '.join(command[2:])}", flush=True)
        environment = {"PYTHONPATH": str(ROOT / "data-pipeline")}
        result = subprocess.run(
            command, cwd=ROOT, env={**dict(__import__("os").environ), **environment},
        )
        if result.returncode != 0:
            raise SystemExit(f"{target['name']} training failed with {result.returncode}")
    else:
        print(f"\n=== {target['name']}: already present, not re-run", flush=True)

    # Bar B1, checked before the result is used for anything.
    published = ROOT / target["published"]
    old_validation, old_train = curve(published)
    new_validation, new_train = curve(output / "checkpoint.pt")
    span = min(len(old_validation), len(new_validation))
    validation_drift = float(np.abs(old_validation[:span] - new_validation[:span]).max())
    train_drift = float(np.abs(old_train[:span] - new_train[:span]).max())
    reproduced = max(validation_drift, train_drift) <= 1e-6 and len(old_validation) == len(new_validation)

    best_epoch = int(new_validation.argmin())
    manifest = json.loads((output / "run.json").read_text(encoding="utf-8"))
    return {
        "name": target["name"],
        "trainer": target["trainer"],
        "b1_reproduced": reproduced,
        "b1_max_validation_drift": validation_drift,
        "b1_max_train_drift": train_drift,
        "epochs": int(len(new_validation)),
        "published_epoch": int(len(old_validation)) - 1,
        "published_validation_loss": float(old_validation[-1]),
        "selected_epoch": best_epoch,
        "selected_validation_loss": float(new_validation[best_epoch]),
        "final_vs_selected_pct": round(
            (float(new_validation[-1]) / float(new_validation[best_epoch]) - 1) * 100, 2,
        ),
        "selected_checkpoint": manifest.get("selected_checkpoint"),
        "evaluation_split": manifest.get("evaluation", {}).get("split"),
        "evaluation_mean_ap": manifest.get("evaluation", {}).get("mean_ap"),
        "calibration_mean_ap": manifest.get("calibration", {}).get("mean_ap"),
        "output": str(output),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", action="append", dest="only")
    parser.add_argument(
        "--output", type=Path, default=ROOT / "verification/r1-retrain-runs.json",
    )
    args = parser.parse_args()
    targets = [t for t in TARGETS if not args.only or t["name"] in args.only]

    results = [train_one(target) for target in targets]
    document = {
        "schema": "frothseg.r1-retrain/v1",
        "preregistration": (
            "CAOS_MANAGE plans/frothseg/research-2026-07-31/"
            "r1-checkpoint-selection-preregistration-2026-08-01.md"
        ),
        "b1_all_reproduced": all(row["b1_reproduced"] for row in results),
        "test_evaluations_spent": 0,
        "note": (
            "Selection is by validation loss only. The runs whose evaluation_split is 'test' "
            "inherit that split from the config their published manifest recorded and are not "
            "re-scored here for a decision; bar B3 is decided on validation."
        ),
        "runs": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, indent=2), encoding="utf-8")

    print("\n" + "=" * 78)
    for row in results:
        verdict = "PASS" if row["b1_reproduced"] else "FAIL"
        print(
            f"B1 {verdict}  {row['name']:<26} best epoch {row['selected_epoch'] + 1:>3}"
            f"/{row['epochs']:<4} final was {row['final_vs_selected_pct']:+.1f}% worse"
        )
    print(f"\nwrote {args.output}")
    if not document["b1_all_reproduced"]:
        raise SystemExit("B1 failed: retrain is not a faithful reproduction, no weights adopted")


if __name__ == "__main__":
    main()
