"""Do the published weights still produce the published evaluation under today's code?

R-1 bar B1 required a retrain to reproduce each committed training curve to 1e-6. Four models
reproduced exactly (0.000e+00 over 120, 120, 120 and 24 epochs). Two did not, and not marginally:
`gc_fsegnet` and `deep_marker_watershed` diverge from EPOCH 0, by 0.31 and 0.37 in validation loss.

Divergence at epoch 0 rules out accumulated non-determinism. The training data is not the cause
either: `verification/phase2-working-cache-regeneration.json` shows the cache archive is
byte-identical, all 384 arrays. Something in the training path changed after those two were baked
on 2026-07-26, and their `config` blocks confirm they predate the current schema (no
`evaluation_split`, no `augmentation`).

B1 says: do not swap weights, report the finding. But B1 is about the TRAINING path, and the
question that actually matters for the product is narrower and separate: the shipped artifacts
quote `gc_fsegnet` at test AP 0.319047 and `deep_marker_watershed` at 0.324703. Are those numbers
still true of the weights that ship, under the code that ships?

This script answers exactly that and changes nothing. It loads each published `weights.npz`, runs
today's forward pass and today's decode at the published calibration point, and compares per case
against the published evaluation. A match means the published numbers are sound and only the
training path drifted. A mismatch means the published numbers describe an engine that no longer
exists, which is a much more serious finding and one the release would have to carry.
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
TARGETS = [
    ("gc_fsegnet", "models/gc-fsegnet-v1"),
    ("deep_marker_watershed", "models/deep-marker-watershed-v1"),
]
# unet_watershed is deliberately NOT checked here, and the reason is worth recording because the
# first version of this script did include it and reported a spurious mismatch of -3.44e-04 on
# 51 of 64 cases. That was a defect in the CHECK, not in the model. train_unet.evaluate scores by
# REGENERATING each scene from its synthetic spec (`generate(sample.spec)`) and running its own
# `predict`, whereas this script feeds the cached 192px arrays. Two different inputs cannot be
# expected to agree to 1e-9. The multitask models genuinely do evaluate from the cache, which is
# why the comparison below is like for like for them and reproduces exactly.
# Reproducing the U-Net's published number would mean replaying its scene generation, which is a
# different check and is not claimed here.
EXCLUDED = {
    "unet_watershed": (
        "evaluates by regenerating scenes from their synthetic spec, not from the cached arrays "
        "this check reads, so it is not comparable under this protocol"
    ),
}
TOLERANCE = 1e-9


def probabilities(model, images, device: str, batch_size: int = 8) -> np.ndarray:
    import torch

    tensor = torch.from_numpy(images.astype(np.float32)[:, None] / 255.0)
    out = []
    with torch.inference_mode():
        for start in range(0, len(tensor), batch_size):
            logits = model(tensor[start:start + batch_size].to(device))
            out.append(torch.sigmoid(logits).cpu().numpy())
    return np.concatenate(out)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--device", default="cuda")
    parser.add_argument(
        "--output", type=Path, default=ROOT / "verification/r1-published-weight-check.json",
    )
    args = parser.parse_args()

    import torch

    rows = []
    for method, directory in TARGETS:
        model_dir = ROOT / directory
        manifest = json.loads((model_dir / "run.json").read_text(encoding="utf-8"))
        evaluation = manifest["evaluation"]
        calibration = manifest["calibration"]
        split = select_split(load_cache(CACHE), evaluation["split"])

        config = manifest["config"]
        # unet_watershed is not a multitask method and has its own builder, taking only the width.
        if method == "unet_watershed":
            from fslab.learning.unet_watershed import build_model as build_unet

            model = build_unet(int(config["base_channels"]))
        else:
            model = build_model(method, int(config["base_channels"]))
        archive = np.load(model_dir / "weights.npz")
        model.load_state_dict({key: torch.from_numpy(archive[key]) for key in archive.files})
        model.to(args.device).eval()

        fields = model(torch.zeros(1, 1, 192, 192, device=args.device)).shape[1]
        probs = probabilities(model, split["images"], args.device)
        # The two-channel U-Net decode takes no marker or centre term; the multitask decode does.
        if method == "unet_watershed":
            from fslab.learning.unet_watershed import probabilities_to_instances as decode

            def to_instances(field):
                return decode(
                    field[0],
                    field[1],
                    foreground_threshold=calibration["foreground_threshold"],
                    boundary_threshold=calibration["boundary_threshold"],
                    min_distance=calibration["min_distance"],
                )
        else:
            def to_instances(field):
                return probabilities_to_instances(
                    field,
                    foreground_threshold=calibration["foreground_threshold"],
                    boundary_threshold=calibration["boundary_threshold"],
                    marker_threshold=calibration["marker_threshold"],
                    min_distance=calibration["min_distance"],
                    center_weight=calibration.get("center_weight", 0.5),
                )

        scored = []
        for index in range(len(split["images"])):
            scored.append(
                full_instance_metrics(to_instances(probs[index]), split["labels"][index])
            )

        recomputed = float(np.mean([row["ap"] for row in scored]))
        published = float(evaluation["mean_ap"])
        published_cases = {
            str(row.get("sample_id") or row.get("case_id")): row
            for row in evaluation.get("cases", [])
        }
        case_ids = [str(value) for value in split["sample_ids"]]
        mismatched = 0
        worst_case_delta = 0.0
        for case_id, row in zip(case_ids, scored):
            reference = published_cases.get(case_id)
            if reference is None or reference.get("ap") is None:
                continue
            delta = abs(float(reference["ap"]) - float(row["ap"]))
            worst_case_delta = max(worst_case_delta, delta)
            if delta > TOLERANCE:
                mismatched += 1

        reproduced = abs(recomputed - published) <= TOLERANCE
        rows.append({
            "method": method,
            "directory": directory,
            "output_channels": int(fields),
            "split": evaluation["split"],
            "n": len(scored),
            "published_mean_ap": published,
            "recomputed_mean_ap": recomputed,
            "delta": recomputed - published,
            "reproduced": bool(reproduced),
            "cases_compared": len(published_cases),
            "cases_mismatched": mismatched,
            "worst_case_ap_delta": worst_case_delta,
        })
        print(
            f"{method:<24} published {published:.6f}  recomputed {recomputed:.6f}  "
            f"delta {recomputed - published:+.2e}  cases off {mismatched}/{len(published_cases)}"
            f"  {'OK' if reproduced else 'MISMATCH'}",
            flush=True,
        )
        del model
        torch.cuda.empty_cache()

    document = {
        "schema": "frothseg.r1-published-weight-check/v1",
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "question": (
            "Two models failed R-1 bar B1: their training curves do not reproduce from their "
            "recorded config. Does that also mean their PUBLISHED evaluation numbers are stale "
            "under today's code, or did only the training path drift?"
        ),
        "method": (
            "Load each published weights.npz, run today's forward pass and today's decode at the "
            "published calibration point, compare per case against the published evaluation. "
            "Nothing is retrained and nothing is written back into any model directory."
        ),
        "tolerance": TOLERANCE,
        "all_reproduced": all(row["reproduced"] for row in rows),
        "excluded": EXCLUDED,
        "results": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, indent=2), encoding="utf-8")
    print(f"\nwrote {args.output.relative_to(ROOT).as_posix()}")
    print(f"all_reproduced: {document['all_reproduced']}")


if __name__ == "__main__":
    main()
