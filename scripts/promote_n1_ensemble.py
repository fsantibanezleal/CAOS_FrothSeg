"""Promote the study-v3 three-seed ensemble to be the published N1 LamellaStar.

The published N1 was a single e80 checkpoint scoring 0.4904 test mean AP. Study v3 selected a
three-seed logit-mean ensemble at e120 under a pre-registered protocol; it scores 0.5186 and
leads Cellpose-SAM on mask AP, AP50, PQ and boundary F-score.

Promotion means the ensemble becomes the thing the product ships and reports, so every piece
of N1 evidence has to be regenerated from it rather than inherited from the single model:

1. the three member checkpoints move into `models/lamellastar-v1/members/seed-<n>/`;
2. `run.json` describes the ensemble, its members, and the test evaluation actually spent;
3. canonical diagnostic inference is re-run over the 13 cases with the ensemble;
4. ONNX is exported per member with a parity report per member.

The temporal rebake and the benchmark/showcase/release rebuild run afterwards from their own
entry points, because they read what this script writes.

    python scripts/promote_n1_ensemble.py --work-root E:/_Temp/n1-v3
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import shutil
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.learning.multitask_models import (  # noqa: E402
    build_model,
    probabilities_to_instances,
)
from fslab.registry import list_cases  # noqa: E402
from fslab.science.froth_gen import generate  # noqa: E402
from fslab.science.segment import (  # noqa: E402
    binary_calibration_metrics,
    full_instance_metrics,
    summarize_metric_rows,
)

MODEL_DIR = ROOT / "models/lamellastar-v1"
CANONICAL_OUT = ROOT / "data/derived/learned/lamellastar-v1"
MEMBERS = ("c24-e120-s20260725", "c24-e120-s20260726", "c24-e120-s20260727")
TRAINING_SIZE = 192


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load_members(work: Path, device: str):
    import torch

    members = []
    for name in MEMBERS:
        manifest = json.loads((work / name / "run.json").read_text(encoding="utf-8"))
        weights = work / name / manifest["inference_weights"]["path"]
        model = build_model(
            manifest["config"]["method"], int(manifest["config"]["base_channels"])
        )
        archive = np.load(weights)
        model.load_state_dict(
            {key: torch.from_numpy(archive[key]) for key in archive.files}
        )
        model.to(device).eval()
        members.append({"name": name, "manifest": manifest, "model": model, "weights": weights})
    return members


def _ensemble_probabilities(members, image: np.ndarray, device: str) -> np.ndarray:
    """Logit-mean over members, then sigmoid. Matches fslab.learning.evaluate_ensemble."""
    import torch
    from skimage.transform import resize

    small = resize(
        image, (TRAINING_SIZE, TRAINING_SIZE),
        order=1, preserve_range=True, anti_aliasing=True,
    ).astype(np.float32)
    tensor = torch.from_numpy(small)[None, None].to(device)
    logits = []
    with torch.inference_mode():
        for member in members:
            logits.append(member["model"](tensor)[0].cpu().numpy())
    mean_logits = np.mean(np.stack(logits), axis=0)
    probabilities = 1.0 / (1.0 + np.exp(-mean_logits))
    return np.stack([
        resize(channel, image.shape, order=1, preserve_range=True)
        for channel in probabilities
    ])


def _export_onnx(members, device: str) -> list[dict]:
    """One ONNX per member. An ensemble is not a single graph, so parity is per member."""
    import torch

    exports = []
    onnx_dir = MODEL_DIR / "onnx"
    onnx_dir.mkdir(parents=True, exist_ok=True)
    import onnxruntime as ort

    # Mirrors fslab.learning.export_multitask: dynamo=False keeps the legacy tracer, which is
    # what this environment has; the dynamo path needs onnxscript, which is not installed.
    example = torch.linspace(0, 1, TRAINING_SIZE * TRAINING_SIZE).reshape(
        1, 1, TRAINING_SIZE, TRAINING_SIZE
    )
    for member in members:
        seed = member["manifest"]["config"]["seed"]
        target = onnx_dir / f"seed-{seed}.onnx"
        cpu_model = member["model"].to("cpu").eval()
        torch.onnx.export(
            cpu_model, example, target,
            input_names=["image"], output_names=["logits"],
            dynamic_axes={
                "image": {0: "batch", 2: "height", 3: "width"},
                "logits": {0: "batch", 2: "height", 3: "width"},
            },
            opset_version=18,
            dynamo=False,
        )
        # Parity: the exported graph must reproduce the torch graph it came from.
        with torch.inference_mode():
            reference = cpu_model(example).numpy()
        session = ort.InferenceSession(str(target), providers=["CPUExecutionProvider"])
        exported = session.run(["logits"], {"image": example.numpy()})[0]
        member["model"].to(device).eval()
        max_abs = float(np.max(np.abs(reference - exported)))
        exports.append({
            "member": member["name"],
            "seed": seed,
            "path": f"onnx/seed-{seed}.onnx",
            "sha256": _sha(target),
            "bytes": target.stat().st_size,
            "max_absolute_logit_difference": max_abs,
            "tolerance": 1e-3,
            "passed": bool(max_abs < 1e-3),
        })
    return exports


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--work-root", type=Path, required=True)
    parser.add_argument("--device", default="cuda")
    args = parser.parse_args()
    work = args.work_root.resolve()

    import torch

    if args.device.startswith("cuda") and not torch.cuda.is_available():
        raise RuntimeError("CUDA required; CPU fallback is forbidden")

    members = _load_members(work, args.device)
    calibration = json.loads(
        (work / "ensemble-logitmean-e120-seeds-25-26-27/run.json").read_text(encoding="utf-8")
    )["calibration"]
    test_evaluation = json.loads(
        (work / "FINAL-TEST-ensemble-logitmean-e120/run.json").read_text(encoding="utf-8")
    )["evaluation"]

    # 1. publish the member weights
    members_root = MODEL_DIR / "members"
    if members_root.exists():
        shutil.rmtree(members_root)
    published_members = []
    for member in members:
        seed = member["manifest"]["config"]["seed"]
        target_dir = members_root / f"seed-{seed}"
        target_dir.mkdir(parents=True, exist_ok=True)
        weights_target = target_dir / "weights.npz"
        shutil.copyfile(member["weights"], weights_target)
        checkpoint_source = work / member["name"] / "checkpoint.pt"
        checkpoint_target = target_dir / "checkpoint.pt"
        shutil.copyfile(checkpoint_source, checkpoint_target)
        published_members.append({
            "seed": seed,
            "study_run_id": member["name"],
            "weights": {
                "path": f"members/seed-{seed}/weights.npz",
                "sha256": _sha(weights_target),
                "bytes": weights_target.stat().st_size,
            },
            "checkpoint": {
                "path": f"members/seed-{seed}/checkpoint.pt",
                "sha256": _sha(checkpoint_target),
                "bytes": checkpoint_target.stat().st_size,
            },
            "config": member["manifest"]["config"],
            "validation_mean_ap": member["manifest"]["evaluation"]["mean_ap"],
        })

    # 2. canonical diagnostic inference with the ensemble
    torch.cuda.reset_peak_memory_stats()
    bake_started = time.perf_counter()
    rows = []
    CANONICAL_OUT.mkdir(parents=True, exist_ok=True)
    for case in list_cases():
        scene = generate(case.spec)
        started = time.perf_counter()
        probabilities = _ensemble_probabilities(members, scene["image"], args.device)
        scale = max(scene["image"].shape) / TRAINING_SIZE
        labels = probabilities_to_instances(
            probabilities,
            foreground_threshold=calibration["foreground_threshold"],
            boundary_threshold=calibration["boundary_threshold"],
            marker_threshold=calibration["marker_threshold"],
            min_distance=max(1, int(round(calibration["min_distance"] * scale))),
            center_weight=calibration.get("center_weight", 0.5),
        )
        inference_ms = (time.perf_counter() - started) * 1000
        case_dir = CANONICAL_OUT / "cases" / case.id
        case_dir.mkdir(parents=True, exist_ok=True)
        mask_path = case_dir / "instances.png"
        Image.fromarray(labels.astype(np.uint16)).save(mask_path, optimize=True)
        rows.append({
            "case_id": case.id,
            **full_instance_metrics(labels, scene["labels"]),
            **{
                key: value
                for key, value in binary_calibration_metrics(
                    probabilities[0], scene["labels"] > 0
                ).items()
                if key in {"brier", "ece"}
            },
            "inference_ms": round(inference_ms, 3),
            "mask_path": str(mask_path.relative_to(CANONICAL_OUT)).replace("\\", "/"),
        })
        print(f"  {case.id:22} ap {rows[-1]['ap'] if rows[-1]['ap'] is not None else float('nan'):.4f}")

    scored = [row for row in rows if row["ap"] is not None]
    canonical_report = {
        "schema": "frothseg.learned-benchmark/v1",
        "method": "lamellastar",
        "ensemble": {
            "mode": "logit-mean",
            "members": [member["seed"] for member in published_members],
        },
        "split": "canonical-synthetic-diagnostic",
        "device": args.device,
        "n_cases": len(rows),
        "mean_ap": float(np.mean([row["ap"] for row in scored])),
        "mean_ap50": float(np.mean([row["ap50"] for row in scored])),
        "mean_pq": float(np.mean([row["pq"] for row in scored])),
        "metric_summary": {
            key: value
            for key, value in summarize_metric_rows(
                rows, split="canonical-synthetic-diagnostic"
            ).items()
            if key not in {"cases", "split", "n"}
        },
        "cases": rows,
    }
    with (CANONICAL_OUT / "benchmark.json").open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(canonical_report, indent=2))

    # 3. per-member ONNX with parity
    exports = _export_onnx(members, args.device)

    # 4. the run manifest the benchmark and release gate read
    props = torch.cuda.get_device_properties(0)
    total_bytes = sum(member["weights"]["bytes"] for member in published_members)
    run = {
        "schema": "frothseg.model-run/v2",
        "method": "lamellastar",
        "kind": "ensemble",
        "config": {
            "method": "lamellastar",
            "ensemble_mode": "logit-mean",
            "member_count": len(published_members),
            "base_channels": published_members[0]["config"]["base_channels"],
            "epochs": published_members[0]["config"]["epochs"],
            "seeds": [member["seed"] for member in published_members],
            "learning_rate": published_members[0]["config"]["learning_rate"],
            "batch_size": published_members[0]["config"]["batch_size"],
            "augmentation": "none",
            "device": args.device,
            "evaluation_split": "test",
        },
        "provenance": {
            "study": "n1-long-schedule-and-ensemble-study-v3",
            "preregistration": (
                "CAOS_MANAGE wip/frothseg/n1-study-v3-preregistration-2026-07-27.md"
            ),
            "selection_metric": "validation mean_ap",
            "final_test_evaluations_spent": 3,
            "supersedes": "c24-e80-s20260727 single model, test mean_ap 0.490359375",
        },
        "members": published_members,
        "inference_weights": {
            "kind": "ensemble",
            "path": "members",
            "sha256": hashlib.sha256(
                "".join(member["weights"]["sha256"] for member in published_members).encode()
            ).hexdigest(),
            "bytes": total_bytes,
            "note": (
                "An ensemble has no single inference artifact. The digest is the hash of the "
                "member digests in published order, and the size is their total."
            ),
        },
        "onnx": {
            "per_member": exports,
            "all_passed": all(export["passed"] for export in exports),
            "note": (
                "One graph per member. A logit-mean ensemble is not a single graph, so the "
                "portable lane runs the members and averages their logits."
            ),
        },
        "calibration": calibration,
        "environment": {
            "python": platform.python_version(),
            "torch": torch.__version__,
            "cuda_runtime": torch.version.cuda,
            "device": props.name,
            "device_total_vram_mib": round(props.total_memory / 1024**2),
            # Real measurement over the canonical bake, not a copied constant: three resident
            # members cost more than the single model this replaces, and the benchmark's
            # compute column has to say so.
            "peak_allocated_mib": round(torch.cuda.max_memory_allocated() / 1024**2, 1),
        },
        "duration_seconds": round(time.perf_counter() - bake_started, 3),
        "evaluation": test_evaluation,
        "canonical": {
            "path": "data/derived/learned/lamellastar-v1/benchmark.json",
            "mean_ap": canonical_report["mean_ap"],
        },
    }
    with (MODEL_DIR / "run.json").open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(run, indent=2))

    # the single-model artifacts the ensemble replaces
    for stale in ("checkpoint.pt", "weights.npz", "model.onnx", "onnx-parity.json"):
        path = MODEL_DIR / stale
        if path.exists():
            path.unlink()

    print()
    print(json.dumps({
        "published_members": [member["seed"] for member in published_members],
        "onnx_parity_passed": run["onnx"]["all_passed"],
        "canonical_mean_ap": round(canonical_report["mean_ap"], 5),
        "test_mean_ap": test_evaluation["mean_ap"],
        "total_weight_bytes": total_bytes,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
