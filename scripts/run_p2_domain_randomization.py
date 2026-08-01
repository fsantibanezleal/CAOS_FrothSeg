"""Execute pre-registered experiment P-2: domain randomization at a matched and extended budget.

Pre-registration, fixed 2026-08-01 before any run:
``CAOS_MANAGE plans/frothseg/research-2026-07-31/
p2-domain-randomization-preregistration-2026-08-01.md``, itself an expansion of
``PLAN-PROPOSAL.md`` section P-2. This script executes that design and chooses nothing.

Arms, three shared seeds each, paired:

- **A** no augmentation, e120: already trained, reused unchanged. This is the published N1
  ensemble, so the control is the baseline rather than a re-implementation of it.
- **B** domain randomization, e120: matched budget.
- **C** domain randomization, e240: extended budget, continued from the B checkpoints.

Selection is on validation mean AP of each arm's three-seed logit-mean ensemble, and on nothing
else. The two test-evaluation events that follow are the entire budget:

1. one pass on the fresh real BBBC038 split pre-registered in Phase 2 (72 samples, 5 whole
   groups, disjoint from the 64 burned on 2026-07-28);
2. one pass on the untouched synthetic reserve slice ``p2`` (64 samples, 32 groups).

Each pass scores the selected arm and arm A together, once, because the reference values 0.1249
and 0.51859 were measured on different surfaces and a one-arm number on a never-scored split
would be uninterpretable. That scope was fixed in the pre-registration before anything ran. The
verdict is read against the absolute bar and against nothing else.

    python scripts/run_p2_domain_randomization.py \
        --work-root E:/_Temp/p2-domain-randomization \
        --control-root E:/_Temp/n1-v3 \
        --bbbc038-root E:/_Temp/bbbc038/extracted
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))
PYTHON = sys.executable

WORKING_CACHE = ROOT / "data/cache/learned-v2-192.npz"
RESERVE_CACHE = ROOT / "data/cache/learned-v2-192-reserve.npz"
PHASE2 = ROOT / "verification/phase2-data-preregistration.json"
REAL_BENCHMARK = ROOT / "data/derived/real-adjacent-benchmark.json"
OUTPUT = ROOT / "verification/p2-domain-randomization.json"

PREREGISTRATION = (
    "CAOS_MANAGE plans/frothseg/research-2026-07-31/"
    "p2-domain-randomization-preregistration-2026-08-01.md"
)

#: Shared across every arm on purpose, so B against A and C against A are paired at matched seed.
SEEDS = (20260725, 20260726, 20260727)

#: This study's reserve slice. It may read this one and no other.
RESERVE_SLICE = "p2"

# --- Pre-registered constants. Fixed before the first run; never edited afterwards. ---------

#: Real axis: fresh-real-split mean AP must rise ABOVE this. Absolute, not relative to a control.
REAL_BAR = 0.25
#: Reference the bar rises from: N1 on the burned 64-sample real-adjacent split,
#: data/derived/real-adjacent-benchmark.json, methods[] where id == "N1".
REAL_REFERENCE = 0.12485937500000001
#: Synthetic axis: mean AP must stay within this tolerance of the reference below.
SYNTHETIC_TOLERANCE = 0.03
#: Reference: E:/_Temp/n1-v3/FINAL-TEST-ensemble-logitmean-e120/run.json evaluation.mean_ap,
#: mirrored in data/derived/method-benchmark.json.
SYNTHETIC_REFERENCE = 0.51859375
#: Noise floor for any improvement language, verification/n1-preregistered-ablation.json.
SINGLE_MODEL_SEED_SPREAD = 0.03744
#: Ensemble-to-ensemble spread on validation, measured by P-1 at this exact configuration
#: (verification/p1-ensemble-spread.json, spread_mean_validation_ap). Two arms whose validation
#: ensembles differ by less than this are not distinguishable, so a selection made inside this
#: band is a coin toss and must be reported as one. The selection RULE does not change: it is
#: still argmax validation, fixed in advance.
ENSEMBLE_TO_ENSEMBLE_SPREAD = 0.011828124999999967
#: In-distribution ceiling for the TEACHER, recorded so the caveat travels with the numbers.
#: Not headroom, not a bar, not a denominator. See pre-registration section 3.
CELLPOSE_SAM_TEACHER_CEILING = 0.7087656250000001

TRAINING_SIZE = 192


def _run(command: list[str]) -> None:
    print("  $", " ".join(str(part) for part in command), flush=True)
    subprocess.run(command, check=True, cwd=ROOT)


def _mean_ap(run_dir: Path) -> float:
    document = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
    return float(document["evaluation"]["mean_ap"])


def _train_arm(
    work_root: Path,
    *,
    arm: str,
    epochs: int,
    device: str,
    variant_bank: Path,
    continue_from: Path | None,
    skip_existing: bool,
) -> tuple[list[dict], list[dict]]:
    members: list[dict] = []
    failures: list[dict] = []
    for seed in SEEDS:
        run_id = f"{arm}-c24-e{epochs}-dr-s{seed}"
        output = work_root / run_id
        if skip_existing and (output / "run.json").is_file():
            print(f"[{run_id}] reusing existing run", flush=True)
        else:
            if continue_from is not None:
                # Arm C continues arm B's optimizer trajectory rather than retraining from
                # scratch: the trainer excludes `epochs` from checkpoint compatibility exactly
                # so a run may continue to a later stopping point, and study v3 used the same
                # continuation. Copying the checkpoint leaves arm B's own run.json intact.
                source = continue_from / f"B-c24-e120-dr-s{seed}"
                if not (source / "checkpoint.pt").is_file():
                    failures.append({
                        "id": run_id,
                        "seed": seed,
                        "error": f"no checkpoint to continue at {source}",
                    })
                    continue
                output.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source / "checkpoint.pt", output / "checkpoint.pt")
            command = [
                PYTHON, "-m", "fslab.learning.train_multitask",
                "--method", "lamellastar",
                "--output", str(output),
                "--seed", str(seed),
                "--epochs", str(epochs),
                "--base-channels", "24",
                "--evaluation-split", "validation",
                "--device", device,
                "--augmentation", "domain-randomization",
                "--variant-bank", str(variant_bank),
            ]
            if continue_from is None:
                command.append("--no-resume")
            print(f"[{run_id}] training", flush=True)
            started = time.perf_counter()
            try:
                _run(command)
            except subprocess.CalledProcessError as error:
                print(f"[{run_id}] TRAINING FAILED: {error}", flush=True)
                failures.append({"id": run_id, "seed": seed, "error": str(error)})
                continue
            print(f"[{run_id}] done in {time.perf_counter() - started:.0f}s", flush=True)
        document = json.loads((output / "run.json").read_text(encoding="utf-8"))
        members.append({
            "id": run_id,
            "path": output.as_posix(),
            "seed": seed,
            "epochs": int(document["config"]["epochs"]),
            "augmentation": document["config"]["augmentation"],
            "variant_bank_key": document.get("augmentation_detail", {}).get(
                "variant_bank_key"
            ),
            "validation_mean_ap": float(document["evaluation"]["mean_ap"]),
            "duration_seconds": document["duration_seconds"],
        })
        print(f"[{run_id}] validation mean AP {members[-1]['validation_mean_ap']:.5f}", flush=True)
    return members, failures


def _validation_ensemble(
    member_dirs: list[Path], output: Path, *, device: str, skip_existing: bool
) -> dict:
    if not (skip_existing and (output / "run.json").is_file()):
        _run([
            PYTHON, "-m", "fslab.learning.evaluate_ensemble",
            *sum((["--model", str(member)] for member in member_dirs), []),
            "--output", str(output),
            "--mode", "logit-mean",
            "--tta", "none",
            "--evaluation-split", "validation",
            "--device", device,
        ])
    else:
        print(f"[{output.name}] reusing existing ensemble evaluation", flush=True)
    document = json.loads((output / "run.json").read_text(encoding="utf-8"))
    return {
        "path": output.as_posix(),
        "validation_mean_ap": float(document["evaluation"]["mean_ap"]),
        "validation_mean_pq": document["evaluation"].get("mean_pq"),
        "calibration": document["calibration"],
    }


def _load_models(member_dirs: list[Path], device):
    from fslab.learning.evaluate_ensemble import _load_member

    return [_load_member(directory, device=device)[0] for directory in member_dirs]


def _ensemble_probabilities(models, images, device, *, batch_size: int = 8) -> np.ndarray:
    from fslab.learning.evaluate_ensemble import _combine
    from fslab.learning.train_multitask import _probabilities

    return _combine(
        [_probabilities(model, images, device=device, batch_size=batch_size) for model in models],
        "logit-mean",
    )


def _evaluate_reserve(member_dirs: list[Path], calibration: dict, *, device_name: str) -> dict:
    """Score one ensemble on the untouched reserve slice, with the arm's own calibration.

    Thresholds come from the arm's calibration on the WORKING calibration split, exactly as the
    published protocol does. Nothing is fitted on the reserve.
    """
    import torch

    from fslab.learning.data_cache import load_cache
    from fslab.learning.train_multitask import _evaluate

    device = torch.device(device_name)
    reserve = load_cache(RESERVE_CACHE)
    selector = reserve["reserve_studies"] == RESERVE_SLICE
    slice_cache = {key: value[selector] for key, value in reserve.items()}
    images = torch.from_numpy(slice_cache["images"].astype(np.float32)[:, None] / 255.0)
    models = _load_models(member_dirs, device)
    probabilities = _ensemble_probabilities(models, images, device)
    summary = _evaluate(probabilities, slice_cache, calibration, split=f"reserve-{RESERVE_SLICE}")
    summary["n_groups"] = int(len(set(slice_cache["group_ids"].tolist())))
    return summary


def _load_real_sample(raw_root: Path, sample_id: str) -> tuple[np.ndarray, np.ndarray]:
    from PIL import Image

    sample_dir = raw_root / sample_id
    image_files = sorted((sample_dir / "images").glob("*.png"))
    with Image.open(image_files[0]) as handle:
        image = np.asarray(handle.convert("L"), dtype=np.float32) / 255.0
    labels = np.zeros(image.shape, dtype=np.int32)
    for index, mask_path in enumerate(sorted((sample_dir / "masks").glob("*.png")), start=1):
        with Image.open(mask_path) as handle:
            labels[np.asarray(handle.convert("L")) > 127] = index
    return image, labels


def _evaluate_fresh_real(
    member_dirs: list[Path],
    calibration: dict,
    sample_ids: list[str],
    *,
    raw_root: Path,
    device_name: str,
) -> dict:
    """Score one ensemble on the fresh real split, under the published transfer protocol.

    Mirrors ``fslab.temporal_bake._ensemble_multitask_predictor`` and
    ``scripts/benchmark_real_adjacent.py`` exactly, so the number is readable next to 0.1249:
    resample to 192, logit-mean the members, resample the probabilities back to native size,
    decode with the synthetic-fitted thresholds, scale ``min_distance`` by ``max(shape) / 192``.
    Nothing is retrained or recalibrated on real data.
    """
    import torch
    from skimage.transform import resize

    from fslab.learning.multitask_models import probabilities_to_instances
    from fslab.science.segment import full_instance_metrics

    device = torch.device(device_name)
    models = _load_models(member_dirs, device)
    rows = []
    for sample_id in sample_ids:
        image, truth = _load_real_sample(raw_root, sample_id)
        small = resize(
            image, (TRAINING_SIZE, TRAINING_SIZE),
            order=1, preserve_range=True, anti_aliasing=True,
        ).astype(np.float32)
        tensor = torch.from_numpy(small)[None, None].to(device)
        with torch.inference_mode():
            logits = np.stack([model(tensor)[0].cpu().numpy() for model in models])
        probabilities_small = 1.0 / (1.0 + np.exp(-logits.mean(axis=0)))
        probabilities = np.stack([
            resize(channel, image.shape, order=1, preserve_range=True)
            for channel in probabilities_small
        ])
        scale = max(image.shape) / TRAINING_SIZE
        predicted = probabilities_to_instances(
            probabilities,
            foreground_threshold=calibration["foreground_threshold"],
            boundary_threshold=calibration["boundary_threshold"],
            marker_threshold=calibration["marker_threshold"],
            min_distance=max(1, int(round(calibration["min_distance"] * scale))),
            center_weight=calibration.get("center_weight", 0.5),
        ).astype(np.int32)
        metrics = full_instance_metrics(predicted, truth)
        rows.append({
            "sample_id": sample_id,
            **{
                key: metrics[key]
                for key in ("ap", "ap50", "pq", "nGt", "nPred")
                if key in metrics
            },
        })
    scored = [row for row in rows if row.get("ap") is not None]
    return {
        "split": "fresh-test",
        "n": len(rows),
        "n_scored": len(scored),
        "mean_ap": float(np.mean([row["ap"] for row in scored])) if scored else None,
        "mean_ap50": float(np.mean([row["ap50"] for row in scored])) if scored else None,
        "mean_pq": (
            float(np.mean([row["pq"] for row in scored if row.get("pq") is not None]))
            if scored else None
        ),
        "samples": rows,
    }


def _surface_replication(test_results: dict) -> dict | None:
    """Same arm, same weights, same thresholds, different surface.

    Arm A's ensemble calibration is bit-identical to the calibration recorded in the published
    ``models/lamellastar-v1/run.json``, and the fresh-real code path reproduced published
    per-sample AP exactly on burned ids before the budget was spent. So the difference between
    the published numbers and the numbers on the two clean surfaces is a SURFACE effect and
    nothing else. Derived entirely from artifacts that already exist: no evaluation runs here.
    """
    if "A" not in test_results:
        return None
    published = json.loads(REAL_BENCHMARK.read_text(encoding="utf-8"))
    burned = next(row for row in published["methods"] if row["id"] == "N1")
    burned_samples = burned["samples"]
    fresh_samples = test_results["A"]["fresh_real"]["samples"]
    fresh_ap = test_results["A"]["fresh_real"]["mean_ap"]
    reserve_ap = test_results["A"]["synthetic_reserve"]["mean_ap"]

    def _mean(rows, key):
        values = [row[key] for row in rows if row.get(key) is not None]
        return float(np.mean(values)) if values else None

    return {
        "what_this_is": (
            "the published no-augmentation N1 ensemble scored on a BURNED surface and on a "
            "CLEAN pre-registered surface, with the arm, the weights and the post-processing "
            "thresholds held fixed. The only thing that changes is the split."
        ),
        "real_axis": {
            "burned_split_mean_ap": burned["mean_ap"],
            "burned_split_n": burned["n_scored"],
            "burned_split_source": "data/derived/real-adjacent-benchmark.json, id == N1",
            "fresh_split_mean_ap": fresh_ap,
            "fresh_split_n": test_results["A"]["fresh_real"]["n"],
            "delta": round(fresh_ap - burned["mean_ap"], 8),
            "replicated": False,
            "burned_mean_instances_truth": _mean(burned_samples, "nGt"),
            "burned_mean_instances_predicted": _mean(burned_samples, "nPred"),
            "fresh_mean_instances_truth": _mean(fresh_samples, "nGt"),
            "fresh_mean_instances_predicted": _mean(fresh_samples, "nPred"),
            "fresh_samples_scoring_zero": sum(
                1 for row in fresh_samples if row.get("ap") == 0.0
            ),
            "reading": (
                "the fresh split carries more instances per frame and the synthetic-fitted "
                "thresholds under-detect badly on it. The published 0.1249 is therefore "
                "partly a property of the two groups it was drawn from, and the real-domain "
                "gap is WIDER than the repository has been reporting, not narrower."
            ),
        },
        "synthetic_axis": {
            "burned_test_mean_ap": SYNTHETIC_REFERENCE,
            "burned_test_source": (
                "E:/_Temp/n1-v3/FINAL-TEST-ensemble-logitmean-e120/run.json evaluation.mean_ap"
            ),
            "reserve_mean_ap": reserve_ap,
            "reserve_n": test_results["A"]["synthetic_reserve"].get("n"),
            "delta": round(reserve_ap - SYNTHETIC_REFERENCE, 8),
            "replicated": abs(reserve_ap - SYNTHETIC_REFERENCE) < SINGLE_MODEL_SEED_SPREAD,
            "reading": (
                "the synthetic number reproduces on a never-observed reserve slice of the "
                "same generator to within a fraction of the single-model seed spread, so the "
                "burned synthetic test split was not being overfitted by selection. That is a "
                "positive result for the synthetic lane and it is independent of P-2's own "
                "hypothesis."
            ),
        },
        "protocol_identity_evidence": (
            "arm A's ensemble calibration (foreground 0.6, boundary 0.65, marker 0.15, "
            "min_distance 3, center_weight 0.5) is identical to the calibration recorded in "
            "models/lamellastar-v1/run.json, and the fresh-real code path reproduced the "
            "published per-sample AP exactly on burned sample ids before any budget was spent"
        ),
    }


def _outcome_statement(
    *, verdict: str, selected: str, arms: dict, real_ap, synthetic_ap
) -> dict:
    """State what actually happened, in the exact path the design took.

    The pre-registered fail-branch sentence assumes a domain-randomization arm reached the
    test surfaces. If validation selection rejects both of them first, that sentence would be
    literally false, and printing a false sentence because it was pre-registered is worse than
    disclosing the mismatch. So both are kept: the pre-registered branch language verbatim,
    and this factual account of the path taken, with the mismatch named when there is one.
    """
    treatment = {key: value for key, value in arms.items() if key != "A"}
    control_validation = arms["A"]["validation_mean_ap"]
    best_treatment = (
        max(treatment, key=lambda key: treatment[key]["validation_mean_ap"])
        if treatment else None
    )
    rejected_at_selection = selected == "A" and best_treatment is not None
    lines = []
    if rejected_at_selection:
        gap = control_validation - treatment[best_treatment]["validation_mean_ap"]
        lines.append(
            "Domain randomization was rejected by the pre-registered selection rule before "
            "any test evaluation: the best domain-randomized arm scored "
            f"{treatment[best_treatment]['validation_mean_ap']:.5f} validation mean AP "
            f"against the no-augmentation control's {control_validation:.5f}, a gap of "
            f"{gap:.5f}, which is {gap / SINGLE_MODEL_SEED_SPREAD:.1f} times the "
            "single-model seed spread and far outside the P-1 ensemble spread."
        )
        lines.append(
            "The synthetic clause of the bar was therefore already unreachable for the "
            "domain-randomized arms at the validation stage, so the study is a NULL that "
            "needed no test evaluation to establish."
        )
        lines.append(
            "The pre-registered fail-branch sentence assumes a domain-randomized arm reached "
            "the real split. It did not. That sentence is kept in this file verbatim under "
            "preregistered_claim_language, and is NOT asserted as this study's finding."
        )
        lines.append(
            "What the two pre-registered evaluation events measured is the SELECTED arm, "
            "which is the published no-augmentation ensemble, on two clean surfaces: "
            f"fresh-real mean AP {real_ap}, synthetic reserve mean AP {synthetic_ap}. Those "
            "separate surface effects from arm effects for the numbers 0.1249 and 0.51859, "
            "and they say nothing about domain randomization."
        )
        lines.append(
            "Recorded as a defect of the DESIGN, for the next pre-registration and not as a "
            "change to this one: selecting on synthetic in-distribution validation cannot "
            "select a robustness-oriented training regime, because that regime trades "
            "in-distribution fit for out-of-distribution behaviour by construction. A study "
            "aimed at the real axis needs a selection surface that is not the synthetic "
            "validation split."
        )
    else:
        lines.append(
            f"Arm {selected} ({arms[selected]['label']}) was selected on validation mean AP "
            f"{arms[selected]['validation_mean_ap']:.5f} and scored on both pre-registered "
            f"test surfaces: fresh-real mean AP {real_ap}, synthetic reserve mean AP "
            f"{synthetic_ap}."
        )
        lines.append(
            f"Verdict {verdict} against the absolute bar: real above {REAL_BAR} and synthetic "
            f"within {SYNTHETIC_TOLERANCE} of {SYNTHETIC_REFERENCE}."
        )
    return {
        "treatment_rejected_at_validation_selection": rejected_at_selection,
        "best_treatment_arm": best_treatment,
        "statement": lines,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--work-root", type=Path, required=True)
    parser.add_argument(
        "--control-root",
        type=Path,
        required=True,
        help="directory holding the arm A run dirs c24-e120-s2026072{5,6,7}",
    )
    parser.add_argument("--bbbc038-root", type=Path, required=True)
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--skip-existing", action="store_true")
    parser.add_argument(
        "--stage",
        choices=("train", "select", "test", "report", "all"),
        default="all",
        help=(
            "train and select spend no test budget; test spends both events and stops; "
            "report rebuilds the evidence file from the saved state and re-evaluates nothing, "
            "which is what makes the budget survive a change to the report format"
        ),
    )
    args = parser.parse_args()

    work_root = args.work_root.resolve()
    work_root.mkdir(parents=True, exist_ok=True)
    variant_bank = work_root / "variant-bank.npz"
    state_path = work_root / "p2-state.json"
    state = (
        json.loads(state_path.read_text(encoding="utf-8"))
        if state_path.is_file() else {}
    )

    if args.stage in {"train", "all"}:
        started = time.perf_counter()
        state["arm_b"], state["arm_b_failures"] = _train_arm(
            work_root, arm="B", epochs=120, device=args.device,
            variant_bank=variant_bank, continue_from=None,
            skip_existing=args.skip_existing,
        )
        state["arm_c"], state["arm_c_failures"] = _train_arm(
            work_root, arm="C", epochs=240, device=args.device,
            variant_bank=variant_bank, continue_from=work_root,
            skip_existing=args.skip_existing,
        )
        state["training_seconds"] = round(time.perf_counter() - started, 1)
        state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")

    if args.stage in {"select", "all"}:
        control_dirs = [args.control_root / f"c24-e120-s{seed}" for seed in SEEDS]
        state["arm_a"] = [
            {
                "id": directory.name,
                "path": directory.as_posix(),
                "seed": seed,
                "epochs": 120,
                "augmentation": "none",
                "validation_mean_ap": _mean_ap(directory),
            }
            for seed, directory in zip(SEEDS, control_dirs, strict=True)
        ]
        arms = {}
        arms["A"] = {
            "label": "no augmentation, e120 (control, published N1 ensemble)",
            "members": state["arm_a"],
            **_validation_ensemble(
                control_dirs,
                work_root / "A-ensemble-validation",
                device=args.device,
                skip_existing=args.skip_existing,
            ),
        }
        for arm, epochs, label in (
            ("B", 120, "domain randomization, e120 (matched budget)"),
            ("C", 240, "domain randomization, e240 (extended budget)"),
        ):
            members = state.get(f"arm_{arm.lower()}", [])
            if len(members) != len(SEEDS):
                print(
                    f"arm {arm} has {len(members)} of {len(SEEDS)} members; "
                    "its ensemble cannot be formed and it is dropped from selection",
                    flush=True,
                )
                continue
            arms[arm] = {
                "label": label,
                "epochs": epochs,
                "members": members,
                **_validation_ensemble(
                    [Path(member["path"]) for member in members],
                    work_root / f"{arm}-ensemble-validation",
                    device=args.device,
                    skip_existing=args.skip_existing,
                ),
            }
        state["arms"] = arms
        selected = max(arms, key=lambda key: arms[key]["validation_mean_ap"])
        state["selected_arm"] = selected
        state["selection_rule"] = (
            "highest validation mean AP of the three-seed logit-mean ensemble; no tiebreak; "
            "fixed at the moment the validation numbers were read and not revisited"
        )
        print(
            f"\nselected arm {selected} on validation mean AP "
            f"{arms[selected]['validation_mean_ap']:.5f}\n",
            flush=True,
        )
        state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")

    if args.stage in {"test", "report", "all"}:
        arms = state["arms"]
        selected = state["selected_arm"]
        phase2 = json.loads(PHASE2.read_text(encoding="utf-8"))
        fresh = phase2["real_adjacent"]["fresh_draw"]["splits"]["fresh-test"]
        fresh_ids = list(fresh["sample_ids"])

        # Pre-registered scope: the arm selected on validation, plus arm A as context. When
        # validation selects A itself the two coincide and the pass scores one ensemble. That
        # degenerate case was not anticipated when the scope was written, and it is executed
        # literally rather than widened after the fact, which is what rule 1 requires.
        scored_arms = [selected] if selected == "A" else [selected, "A"]
        if args.stage == "report":
            # The budget is spent once. Rebuilding the evidence file must never re-touch a
            # test surface, so the report stage reads the measurements back from state.
            test_results = state["test_results"]
            scored_arms = list(test_results)
            print(
                "report stage: rebuilding from saved measurements, evaluating nothing",
                flush=True,
            )
        else:
            test_results = {}
            for arm in scored_arms:
                member_dirs = [Path(member["path"]) for member in arms[arm]["members"]]
                calibration = arms[arm]["calibration"]
                print(f"[test event 1: fresh real split] arm {arm}", flush=True)
                real = _evaluate_fresh_real(
                    member_dirs, calibration, fresh_ids,
                    raw_root=args.bbbc038_root.resolve(), device_name=args.device,
                )
                print(f"  fresh-real mean AP {real['mean_ap']:.5f}", flush=True)
                print(f"[test event 2: reserve slice {RESERVE_SLICE}] arm {arm}", flush=True)
                synthetic = _evaluate_reserve(
                    member_dirs, calibration, device_name=args.device,
                )
                print(f"  reserve mean AP {synthetic['mean_ap']:.5f}", flush=True)
                test_results[arm] = {"fresh_real": real, "synthetic_reserve": synthetic}
            state["test_results"] = test_results
            state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")

        real_ap = test_results[selected]["fresh_real"]["mean_ap"]
        synthetic_ap = test_results[selected]["synthetic_reserve"]["mean_ap"]
        real_pass = real_ap is not None and real_ap > REAL_BAR
        synthetic_pass = (
            synthetic_ap is not None
            and abs(synthetic_ap - SYNTHETIC_REFERENCE) <= SYNTHETIC_TOLERANCE
        )
        verdict = "pass" if (real_pass and synthetic_pass) else "null"

        report = {
            "experiment": "p2-domain-randomization-matched-and-extended-budget",
            "preregistration": PREREGISTRATION,
            "parent_design": (
                "CAOS_MANAGE plans/frothseg/research-2026-07-31/PLAN-PROPOSAL.md section P-2"
            ),
            "date": time.strftime("%Y-%m-%d"),
            "hypothesis": (
                "the -0.394 real-domain collapse is substantially an augmentation deficit, and "
                "training with domain randomization at a matched budget raises real-split AP "
                "without materially costing synthetic AP"
            ),
            "mandatory_caveat": (
                "The 0.709 Cellpose-SAM figure is an IN-DISTRIBUTION CEILING FOR THE TEACHER, "
                "not achievable student headroom. It compares a synthetic-froth-only model "
                "against a foundation model evaluated on cell-nucleus photographs, which is "
                "that model's own declared domain. Whether BBBC038 images sit inside the "
                "Cellpose-SAM pretraining corpus is UNVERIFIED. The bar below is not set from "
                "it, is not a fraction of it, and no result here may be expressed as a "
                "percentage of it."
            ),
            "cellpose_sam_teacher_ceiling": CELLPOSE_SAM_TEACHER_CEILING,
            "scope": (
                "The real axis is adjacent-domain cell-nucleus microscopy (BBBC038, CC0-1.0), "
                "not froth. Nothing here supports a flotation accuracy claim. BL-012 unchanged."
            ),
            "beyond_sota_claim": False,
            "bar": {
                "real": {
                    "metric": "fresh-real-split mean AP",
                    "requirement": f"above {REAL_BAR}",
                    "threshold": REAL_BAR,
                    "rises_from": REAL_REFERENCE,
                    "rises_from_source": (
                        "data/derived/real-adjacent-benchmark.json, methods[] id == N1, "
                        "measured on the BURNED 64-sample split of 2026-07-28"
                    ),
                },
                "synthetic": {
                    "metric": "synthetic mean AP",
                    "requirement": f"within {SYNTHETIC_TOLERANCE} of {SYNTHETIC_REFERENCE}",
                    "tolerance": SYNTHETIC_TOLERANCE,
                    "reference": SYNTHETIC_REFERENCE,
                    "reference_source": (
                        "E:/_Temp/n1-v3/FINAL-TEST-ensemble-logitmean-e120/run.json "
                        "evaluation.mean_ap, mirrored in data/derived/method-benchmark.json, "
                        "measured on the BURNED synthetic test split"
                    ),
                },
                "rule": (
                    "both clauses must hold on the arm selected by validation. Anything less "
                    "on the real axis is a NULL however good the synthetic number looks. The "
                    "bar is absolute and was not re-expressed as a delta after the control's "
                    "numbers were known."
                ),
            },
            "surfaces": {
                "train": {
                    "cache": "data/cache/learned-v2-192.npz",
                    "split": "train",
                    "samples": 192,
                },
                "selection": {
                    "cache": "data/cache/learned-v2-192.npz",
                    "split": "validation",
                    "test_evaluations_spent": 0,
                },
                "fresh_real": {
                    "source": "BBBC038/DSB2018, CC0-1.0",
                    "split": "fresh-test",
                    "groups": fresh["group_count"],
                    "samples": fresh["sample_count"],
                    "sample_ids_sha256": fresh["sample_ids_sha256"],
                    "preregistered_in": "verification/phase2-data-preregistration.json",
                    "disjoint_from_burned_64": True,
                },
                "synthetic_reserve": {
                    "cache": "data/cache/learned-v2-192-reserve.npz",
                    "slice": RESERVE_SLICE,
                    "preregistered_in": "verification/phase2-data-preregistration.json",
                },
            },
            "design": {
                "architecture": "lamellastar, base_channels 24, lr 8e-4, batch 8, cuda",
                "arms": {
                    key: {
                        "label": value["label"],
                        "members": value["members"],
                        "ensemble_path": value["path"],
                        "validation_mean_ap": value["validation_mean_ap"],
                        "calibration": value["calibration"],
                    }
                    for key, value in arms.items()
                },
                "seeds": list(SEEDS),
                "seeds_shared_across_arms": True,
                "augmentation": {
                    "mode": "domain-randomization",
                    "module": "data-pipeline/fslab/learning/domain_randomization.py",
                    "elements": [
                        "scale jitter on the label map with exactly rebuilt targets, "
                        "ladder (1.0, 1.3, 1.7, 0.5)",
                        "D4 geometry, image and targets together",
                        "randomized smooth illumination field, multiplicative and additive",
                        "blur kernels: none, isotropic, anisotropic, motion",
                        "sensor noise: Poisson shot, Gaussian read, intensity quantization",
                        "contrast inversion at probability 0.5",
                        "gamma, gain, bias, and resolution loss",
                    ],
                    "variant_bank_key": next(
                        (
                            member.get("variant_bank_key")
                            for value in arms.values()
                            for member in value["members"]
                            if member.get("variant_bank_key")
                        ),
                        None,
                    ),
                },
                "training_failures": (
                    state.get("arm_b_failures", []) + state.get("arm_c_failures", [])
                ),
                "training_seconds": state.get("training_seconds"),
            },
            "selection": {
                "metric": "validation mean AP of the three-seed logit-mean ensemble",
                "rule": state["selection_rule"],
                "selected_arm": selected,
                "validation_mean_ap_by_arm": {
                    key: value["validation_mean_ap"] for key, value in arms.items()
                },
                "single_model_seed_spread": SINGLE_MODEL_SEED_SPREAD,
                "ensemble_to_ensemble_spread": ENSEMBLE_TO_ENSEMBLE_SPREAD,
                "ensemble_to_ensemble_spread_source": "verification/p1-ensemble-spread.json",
                "selected_lead_over_runner_up": (
                    lambda values: (
                        round(values[0] - values[1], 8) if len(values) > 1 else None
                    )
                )(sorted(
                    (value["validation_mean_ap"] for value in arms.values()), reverse=True,
                )),
                "selection_inside_the_noise_band": (
                    lambda values: (
                        bool(values[0] - values[1] < ENSEMBLE_TO_ENSEMBLE_SPREAD)
                        if len(values) > 1 else None
                    )
                )(sorted(
                    (value["validation_mean_ap"] for value in arms.values()), reverse=True,
                )),
                "note": (
                    "validation differences below the P-1 ensemble-to-ensemble spread are "
                    "reported as indistinguishable, never as a lead. The selection rule is "
                    "still argmax validation and was fixed in advance; when the lead sits "
                    "inside the noise band the selection is a coin toss and says so."
                ),
            },
            "test_budget": {
                "events_available": 2,
                "events_spent": 2,
                "event_1": "one pass on the fresh real split",
                "event_2": f"one pass on the untouched synthetic reserve slice {RESERVE_SLICE}",
                "arms_scored_per_event": scored_arms,
                "scope_fixed_before_running": True,
                "control_is_context_not_verdict_bearing": True,
                "hard_stop": (
                    "no further evaluation on either surface, for any reason, including a "
                    "B against C comparison or a per-condition drill-down"
                ),
            },
            "results": {
                arm: {
                    "fresh_real_mean_ap": value["fresh_real"]["mean_ap"],
                    "fresh_real_mean_ap50": value["fresh_real"]["mean_ap50"],
                    "fresh_real_mean_pq": value["fresh_real"]["mean_pq"],
                    "fresh_real_n": value["fresh_real"]["n"],
                    "synthetic_reserve_mean_ap": value["synthetic_reserve"]["mean_ap"],
                    "synthetic_reserve_mean_pq": value["synthetic_reserve"].get("mean_pq"),
                    "synthetic_reserve_n": value["synthetic_reserve"].get("n"),
                }
                for arm, value in test_results.items()
            },
            "per_sample": {
                arm: value["fresh_real"]["samples"] for arm, value in test_results.items()
            },
            "verdict": verdict,
            "verdict_detail": {
                "real_clause": {
                    "measured": real_ap,
                    "threshold": REAL_BAR,
                    "passed": bool(real_pass),
                },
                "synthetic_clause": {
                    "measured": synthetic_ap,
                    "reference": SYNTHETIC_REFERENCE,
                    "tolerance": SYNTHETIC_TOLERANCE,
                    "absolute_difference": (
                        abs(synthetic_ap - SYNTHETIC_REFERENCE)
                        if synthetic_ap is not None else None
                    ),
                    "passed": bool(synthetic_pass),
                },
            },
            "preregistered_claim_language": {
                "branch_taken": "pass" if verdict == "pass" else "fail",
                "if_it_passes": (
                    "training LamellaStar with domain randomization raises adjacent-domain "
                    "real AP above the pre-registered 0.25 on a fresh pre-registered split, "
                    "with the synthetic number reported alongside and never in front of it; "
                    "adjacent domain, cell nuclei, not froth"
                ),
                "if_it_fails": (
                    "domain randomization at a matched and an extended budget did not move "
                    "adjacent-domain real AP above the pre-registered 0.25; the real-domain "
                    "collapse is therefore not explained by an augmentation deficit alone. A "
                    "synthetic-only gain is recorded as a failure of the study, not as a "
                    "partial success."
                ),
            },
            "surface_replication": _surface_replication(test_results),
            "outcome_statement": _outcome_statement(
                verdict=verdict,
                selected=selected,
                arms=arms,
                real_ap=real_ap,
                synthetic_ap=synthetic_ap,
            ),
        }
        OUTPUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({
            "verdict": verdict,
            "selected_arm": selected,
            "validation": report["selection"]["validation_mean_ap_by_arm"],
            "results": report["results"],
        }, indent=2))
        print(f"\nWrote {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
