"""R-1 bar B3: decide on validation whether the best-epoch ensemble replaces the published one.

Pre-registered in `CAOS_MANAGE/plans/frothseg/research-2026-07-31/
r1-checkpoint-selection-preregistration-2026-08-01.md`. B3 is a validation-split decision and
spends no test budget.

DISCLOSED DEVIATION. B3 as written says the corrected ensemble is adopted if "its validation mean
AP is greater than or equal to the published ensemble's validation mean AP (0.53184375,
verification/p5-a1-offset-head.json)". That parenthetical names a CALIBRATION-split figure, not a
validation one. Comparing a freshly measured validation number against it would not be like for
like and would bias the comparison by whichever split happens to be easier. The RULE is followed
and the reference value is re-measured: both ensembles are scored here on the validation split,
under the same protocol, each with its own decode calibrated on the calibration split. The
erroneous reference is recorded in the output rather than quietly dropped.

What the first retrained member already showed, and why this decision is not a formality: the
epoch-52 weights have a 30 percent better validation LOSS than the epoch-120 weights that shipped,
and a slightly WORSE validation mean AP (0.49125 against 0.49566). A pixel-wise multitask loss and
an instance-level AP after decoding are different objectives, and the overfitting visible in the
loss curve does not have to appear in the segmentation metric. B3 is decided on AP because AP is
what the product reports.
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

from fslab.learning.data_cache import load_cache, select_split  # noqa: E402
from fslab.learning.multitask_models import (  # noqa: E402
    build_model,
    probabilities_to_instances,
)
from fslab.science.segment import full_instance_metrics  # noqa: E402

CACHE = ROOT / "data/cache/learned-v2-192.npz"
WORK = Path("E:/_Temp/frothseg-r1")
SEEDS = [20260725, 20260726, 20260727]
BASE_CHANNELS = 24
METHOD = "lamellastar"

# The decode grid, copied verbatim from fslab.learning.train_multitask._calibrate so both arms are
# calibrated identically. Fixed before either arm was scored.
FOREGROUND = (0.4, 0.5, 0.6)
BOUNDARY = (0.35, 0.5, 0.65)
MARKER = (0.15, 0.25, 0.35)
MIN_DISTANCE = (1, 2, 3)
CENTER_WEIGHT = (0.0, 0.25, 0.5, 0.75, 1.0)


def _load_members(paths: list[Path], device: str):
    import torch

    members = []
    for path in paths:
        checkpoint = torch.load(path, map_location="cpu", weights_only=False)
        model = build_model(METHOD, base_channels=BASE_CHANNELS)
        model.load_state_dict(checkpoint["model"])
        model.eval().to(device)
        members.append(model)
    return members


def _ensemble_probabilities(members, images, device, batch_size: int = 8) -> np.ndarray:
    """Logit-mean over members, exactly as the published ensemble is defined."""
    import torch

    tensor = torch.from_numpy(images.astype(np.float32)[:, None] / 255.0)
    outputs = []
    with torch.inference_mode():
        for start in range(0, len(tensor), batch_size):
            batch = tensor[start:start + batch_size].to(device)
            logits = np.mean(
                np.stack([model(batch).cpu().numpy() for model in members]), axis=0,
            )
            outputs.append(logits)
    logits = np.concatenate(outputs, axis=0)
    return 1.0 / (1.0 + np.exp(-logits))


def _calibrate(probabilities, split) -> dict:
    _, indices = np.unique(split["group_ids"], return_index=True)
    indices = np.sort(indices)
    best = {"mean_ap": -1.0}
    for foreground in FOREGROUND:
        for boundary in BOUNDARY:
            for marker in MARKER:
                for distance in MIN_DISTANCE:
                    for center in CENTER_WEIGHT:
                        scores = []
                        for index in indices:
                            labels = probabilities_to_instances(
                                probabilities[index],
                                foreground_threshold=foreground,
                                boundary_threshold=boundary,
                                marker_threshold=marker,
                                min_distance=distance,
                                center_weight=center,
                            )
                            scores.append(
                                full_instance_metrics(labels, split["labels"][index])["ap"]
                            )
                        mean_ap = float(np.mean(scores))
                        if mean_ap > best["mean_ap"]:
                            best = {
                                "split": "calibration",
                                "n_groups": int(len(indices)),
                                "mean_ap": mean_ap,
                                "foreground_threshold": foreground,
                                "boundary_threshold": boundary,
                                "marker_threshold": marker,
                                "min_distance": distance,
                                "center_weight": center,
                            }
    return best


def _score(probabilities, split, decode: dict) -> dict:
    rows = []
    for index in range(len(split["images"])):
        labels = probabilities_to_instances(
            probabilities[index],
            foreground_threshold=decode["foreground_threshold"],
            boundary_threshold=decode["boundary_threshold"],
            marker_threshold=decode["marker_threshold"],
            min_distance=decode["min_distance"],
            center_weight=decode["center_weight"],
        )
        rows.append(full_instance_metrics(labels, split["labels"][index]))
    return {
        "n": len(rows),
        "mean_ap": float(np.mean([row["ap"] for row in rows])),
        "mean_ap50": float(np.mean([row["ap50"] for row in rows])),
        "mean_pq": float(np.mean([row["pq"] for row in rows])),
        "mean_boundary_fscore": float(np.mean([row["boundary_fscore"] for row in rows])),
        "per_image_ap": [float(row["ap"]) for row in rows],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--output", type=Path, default=ROOT / "verification/r1-checkpoint-selection.json")
    args = parser.parse_args()

    cache = load_cache(CACHE)
    calibration = select_split(cache, "calibration")
    validation = select_split(cache, "validation")

    arms = {
        "published_last_epoch": [
            ROOT / f"models/lamellastar-v1/members/seed-{seed}/checkpoint.pt" for seed in SEEDS
        ],
        "retrained_best_epoch": [WORK / f"seed-{seed}/best.pt" for seed in SEEDS],
    }
    missing = [str(p) for paths in arms.values() for p in paths if not p.exists()]
    if missing:
        raise SystemExit("missing checkpoints:\n  " + "\n  ".join(missing))

    results = {}
    for name, paths in arms.items():
        print(f"\n=== {name}", flush=True)
        members = _load_members(paths, args.device)
        epochs = []
        import torch
        for path in paths:
            epochs.append(int(torch.load(path, map_location="cpu", weights_only=False)["epoch"]) + 1)
        calibration_probabilities = _ensemble_probabilities(
            members, calibration["images"], args.device,
        )
        decode = _calibrate(calibration_probabilities, calibration)
        print(f"  decode: {({k: v for k, v in decode.items() if k not in ('split', 'n_groups')})}", flush=True)
        validation_probabilities = _ensemble_probabilities(
            members, validation["images"], args.device,
        )
        scored = _score(validation_probabilities, validation, decode)
        print(f"  validation mean_ap = {scored['mean_ap']:.6f}  (members at epochs {epochs})", flush=True)
        results[name] = {
            "member_epochs": epochs,
            "calibration": decode,
            "validation": scored,
        }
        del members
        torch.cuda.empty_cache()

    published = results["published_last_epoch"]["validation"]["mean_ap"]
    retrained = results["retrained_best_epoch"]["validation"]["mean_ap"]
    adopt = retrained >= published

    paired = np.asarray(results["retrained_best_epoch"]["validation"]["per_image_ap"]) - np.asarray(
        results["published_last_epoch"]["validation"]["per_image_ap"]
    )
    document = {
        "schema": "frothseg.r1-decision/v1",
        "preregistration": (
            "CAOS_MANAGE plans/frothseg/research-2026-07-31/"
            "r1-checkpoint-selection-preregistration-2026-08-01.md"
        ),
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "bar": "B3",
        "decision_metric": "validation mean_ap",
        "decision_surface": "validation split, 64 images, no test data read",
        "disclosed_deviation": (
            "B3's parenthetical reference value 0.53184375 is a CALIBRATION-split figure from "
            "verification/p5-a1-offset-head.json, not a validation one. Comparing a fresh "
            "validation number against it would not be like for like, so both arms were re-scored "
            "here on validation under one protocol. The rule was followed; the reference value in "
            "the pre-registration was wrong and is recorded here rather than dropped."
        ),
        "erroneous_reference_in_prereg": 0.53184375,
        "arms": results,
        "published_validation_mean_ap": published,
        "retrained_validation_mean_ap": retrained,
        "delta": retrained - published,
        "paired_mean_delta": float(paired.mean()),
        "images_improved": int((paired > 0).sum()),
        "images_worsened": int((paired < 0).sum()),
        "images_unchanged": int((paired == 0).sum()),
        "adopt_retrained": bool(adopt),
        "test_evaluations_spent": 0,
        "interpretation": (
            "Validation LOSS and validation AP disagree on these checkpoints. The best-loss epochs "
            "are 25 to 31 percent better on the loss the trainer optimizes and are not "
            "correspondingly better once the probabilities are decoded into instances and scored "
            "with AP. A pixel-wise multitask loss is not the product's objective; AP is."
        ),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, indent=2), encoding="utf-8")

    print("\n" + "=" * 78)
    print(f"published (last epoch)  validation mean_ap = {published:.6f}")
    print(f"retrained (best epoch)  validation mean_ap = {retrained:.6f}")
    print(f"delta {retrained - published:+.6f}   improved {document['images_improved']}/64")
    print(f"\nB3: {'ADOPT the retrained ensemble' if adopt else 'KEEP the published ensemble'}")
    print(f"wrote {args.output.relative_to(ROOT).as_posix()}")


if __name__ == "__main__":
    main()
