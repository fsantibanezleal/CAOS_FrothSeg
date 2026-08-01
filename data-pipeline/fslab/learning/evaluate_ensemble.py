"""Validation/test evaluator for probability ensembles of multitask checkpoints."""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import time
from pathlib import Path

import numpy as np

from .data_cache import load_cache, select_split
from .multitask_models import build_model
from .train_multitask import _calibrate, _evaluate, _probabilities, method_decode


def _load_member(model_dir: Path, *, device):
    import torch

    manifest = json.loads((model_dir / "run.json").read_text(encoding="utf-8"))
    config = manifest["config"]
    weights_path = model_dir / manifest["inference_weights"]["path"]
    actual_hash = hashlib.sha256(weights_path.read_bytes()).hexdigest()
    if actual_hash != manifest["inference_weights"]["sha256"]:
        raise ValueError(f"checkpoint checksum mismatch: {model_dir}")
    model = build_model(config["method"], int(config["base_channels"]))
    archive = np.load(weights_path)
    model.load_state_dict({
        name: torch.from_numpy(archive[name]) for name in archive.files
    })
    return model.to(device).eval(), manifest, actual_hash


def _combine(member_probabilities: list[np.ndarray], mode: str) -> np.ndarray:
    stacked = np.stack(member_probabilities)
    if mode == "probability-mean":
        return np.mean(stacked, axis=0)
    if mode == "logit-mean":
        clipped = np.clip(stacked, 1e-6, 1.0 - 1e-6)
        logits = np.log(clipped / (1.0 - clipped))
        mean_logits = np.mean(logits, axis=0)
        return 1.0 / (1.0 + np.exp(-mean_logits))
    raise ValueError(f"unsupported ensemble mode: {mode}")


def _tta_probabilities(model, images, *, device, batch_size: int, tta: str) -> np.ndarray:
    import torch

    if tta == "none":
        return _probabilities(model, images, device=device, batch_size=batch_size)
    if tta != "d4":
        raise ValueError(f"unsupported test-time augmentation: {tta}")
    aligned = []
    for turns in range(4):
        for reflect in (False, True):
            transformed = torch.rot90(images, turns, dims=(2, 3))
            if reflect:
                transformed = torch.flip(transformed, dims=(3,))
            probabilities = _probabilities(
                model,
                transformed,
                device=device,
                batch_size=batch_size,
            )
            restored = torch.from_numpy(probabilities)
            if reflect:
                restored = torch.flip(restored, dims=(3,))
            restored = torch.rot90(restored, -turns, dims=(2, 3))
            aligned.append(restored.numpy())
    return np.mean(np.stack(aligned), axis=0)


def run(
    model_dirs: list[Path],
    cache_path: Path,
    output: Path,
    *,
    mode: str,
    tta: str = "none",
    evaluation_split: str = "validation",
    device_name: str = "cuda",
) -> dict:
    import torch

    if len(model_dirs) < 2 and tta == "none":
        raise ValueError("a single model requires test-time augmentation")
    if evaluation_split not in {"validation", "test"}:
        raise ValueError("evaluation_split must be validation or test")
    if device_name.startswith("cuda") and not torch.cuda.is_available():
        raise RuntimeError("CUDA requested but unavailable; CPU fallback is forbidden")

    started = time.perf_counter()
    device = torch.device(device_name)
    cache = load_cache(cache_path)
    calibration_cache = select_split(cache, "calibration")
    evaluation_cache = select_split(cache, evaluation_split)
    calibration_images = torch.from_numpy(
        calibration_cache["images"].astype(np.float32)[:, None] / 255.0
    )
    evaluation_images = torch.from_numpy(
        evaluation_cache["images"].astype(np.float32)[:, None] / 255.0
    )

    member_reports = []
    calibration_probabilities = []
    evaluation_probabilities = []
    expected_method = None
    expected_dataset_hash = None
    for model_dir in model_dirs:
        model, manifest, weights_hash = _load_member(model_dir, device=device)
        config = manifest["config"]
        dataset_hash = manifest["dataset"]["cache_sha256"]
        expected_method = expected_method or config["method"]
        expected_dataset_hash = expected_dataset_hash or dataset_hash
        if config["method"] != expected_method:
            raise ValueError("ensemble members must implement the same method")
        if dataset_hash != expected_dataset_hash:
            raise ValueError("ensemble members must use the same dataset")
        calibration_probabilities.append(
            _tta_probabilities(
                model,
                calibration_images,
                device=device,
                batch_size=8,
                tta=tta,
            )
        )
        evaluation_probabilities.append(
            _tta_probabilities(
                model,
                evaluation_images,
                device=device,
                batch_size=8,
                tta=tta,
            )
        )
        member_reports.append({
            "path": model_dir.as_posix(),
            "seed": config["seed"],
            "epochs": config["epochs"],
            "base_channels": config["base_channels"],
            "weights_sha256": weights_hash,
        })
        del model
        torch.cuda.empty_cache()

    combined_calibration = _combine(calibration_probabilities, mode)
    combined_evaluation = _combine(evaluation_probabilities, mode)
    decode = method_decode(expected_method)
    calibration = _calibrate(combined_calibration, calibration_cache, decode=decode)
    evaluation = _evaluate(
        combined_evaluation,
        evaluation_cache,
        calibration,
        split=evaluation_split,
        decode=decode,
    )
    props = torch.cuda.get_device_properties(device)
    report = {
        "schema": "frothseg.multitask-ensemble/v1",
        "method": expected_method,
        "mode": mode,
        "test_time_augmentation": tta,
        "members": member_reports,
        "dataset": {
            "cache_sha256": expected_dataset_hash,
            "samples": int(len(cache["images"])),
        },
        "environment": {
            "python": platform.python_version(),
            "torch": torch.__version__,
            "cuda_runtime": torch.version.cuda,
            "device": props.name,
            "device_total_vram_mib": round(props.total_memory / 1024**2),
            "peak_allocated_mib": round(
                torch.cuda.max_memory_allocated(device) / 1024**2, 1
            ),
        },
        "duration_seconds": round(time.perf_counter() - started, 3),
        "calibration": calibration,
        "evaluation": evaluation,
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / "run.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, action="append", required=True)
    parser.add_argument(
        "--cache",
        type=Path,
        default=Path("data/cache/learned-v2-192.npz"),
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--mode",
        choices=("probability-mean", "logit-mean"),
        required=True,
    )
    parser.add_argument(
        "--evaluation-split",
        choices=("validation", "test"),
        default="validation",
    )
    parser.add_argument("--tta", choices=("none", "d4"), default="none")
    parser.add_argument("--device", default="cuda")
    args = parser.parse_args()
    report = run(
        args.model,
        args.cache,
        args.output,
        mode=args.mode,
        tta=args.tta,
        evaluation_split=args.evaluation_split,
        device_name=args.device,
    )
    print(json.dumps({
        key: report["evaluation"][key]
        for key in ("split", "n", "mean_ap", "mean_ap50", "mean_pq")
    }, indent=2))


if __name__ == "__main__":
    main()
