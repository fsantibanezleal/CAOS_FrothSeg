"""CUDA trainer/evaluator for L2, L3, and N1 FrothSeg methods."""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import random
import time
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from ..science.segment import (
    binary_calibration_metrics,
    full_instance_metrics,
    mask_ap,
    summarize_metric_rows,
)
from . import domain_randomization, offset_head
from .data_cache import load_cache, select_split
from .multitask_models import (
    METHOD_CHANNELS,
    build_model,
    probabilities_to_instances,
    targets,
)

#: Methods whose third and fourth channels are a centroid-offset field instead of a scalar
#: distance channel (pre-registered experiment P-5 / A-1). Their targets, loss composition
#: and marker derivation come from :mod:`fslab.learning.offset_head`; every other method
#: keeps the scalar path unchanged.
OFFSET_FIELD_METHODS = frozenset({"lamellastar_offset"})

#: Augmentation modes the trainer accepts. ``domain-randomization`` is the P-2 regime, fixed in
#: CAOS_MANAGE ``plans/frothseg/research-2026-07-31/
#: p2-domain-randomization-preregistration-2026-08-01.md`` section 5 before any run.
AUGMENTATION_MODES = ("none", "geometric-photometric", "domain-randomization")

#: Modes that transform frame geometry, and therefore cannot be applied to a vector-field target
#: stack without also permuting and negating its components.
GEOMETRIC_AUGMENTATION_MODES = frozenset({"geometric-photometric", "domain-randomization"})


def method_targets(method: str):
    """Return the target builder for a method: scalar distance stack or offset stack."""
    if method in OFFSET_FIELD_METHODS:
        return offset_head.targets
    include_centers = method == "lamellastar"
    return lambda labels: targets(labels, include_centers=include_centers)


def method_decode(method: str):
    """Return the probability-to-instance decode for a method."""
    if method in OFFSET_FIELD_METHODS:
        return offset_head.probabilities_to_instances
    return probabilities_to_instances


@dataclass(frozen=True)
class Config:
    method: str
    seed: int = 20260725
    epochs: int = 16
    learning_rate: float = 8e-4
    base_channels: int = 16
    batch_size: int = 8
    device: str = "cuda"
    evaluation_split: str = "validation"
    augmentation: str = "none"
    # Which epoch's weights leave this function. "best" takes the lowest validation
    # loss on the curve this loop already computes; "last" takes the final epoch and
    # reproduces the pre-2026-08-01 behaviour, kept so an old run can be re-derived.
    selection: str = "best"
    # Stop after this many epochs with no validation improvement. 0 disables it, which
    # is the default: the full schedule still runs and "best" simply picks off its curve,
    # so enabling selection never shortens a pre-registered schedule on its own.
    early_stop_patience: int = 0


def _training_config(config: Config) -> dict:
    """Return fields that affect optimization and checkpoint compatibility."""
    values = asdict(config)
    values.pop("evaluation_split")
    # Epochs is a stopping point, not part of the optimizer trajectory. A run
    # may therefore continue a compatible checkpoint to a later stopping point.
    values.pop("epochs")
    # Neither of these touches the trajectory either: they choose which point ON the
    # trajectory is exported, so a checkpoint stays compatible across both settings.
    values.pop("selection")
    values.pop("early_stop_patience")
    return values


def _seed(seed: int) -> None:
    import torch

    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.use_deterministic_algorithms(True)
    torch.backends.cudnn.benchmark = False


def _tensor_data(cache_split: dict[str, np.ndarray], *, method: str):
    import torch

    build_targets = method_targets(method)
    images = torch.from_numpy(cache_split["images"].astype(np.float32)[:, None] / 255.0)
    target_array = np.stack([
        build_targets(label.astype(np.int32)) for label in cache_split["labels"]
    ])
    return images, torch.from_numpy(target_array)


def _augment(images, truth, *, rng: np.random.Generator):
    """Apply deterministic paired geometry plus image-only photometric jitter."""
    import torch

    augmented_images = []
    augmented_truth = []
    for image, target in zip(images, truth, strict=True):
        turns = int(rng.integers(0, 4))
        image = torch.rot90(image, turns, dims=(1, 2))
        target = torch.rot90(target, turns, dims=(1, 2))
        if bool(rng.integers(0, 2)):
            image = torch.flip(image, dims=(2,))
            target = torch.flip(target, dims=(2,))
        if bool(rng.integers(0, 2)):
            image = torch.flip(image, dims=(1,))
            target = torch.flip(target, dims=(1,))
        gain = float(rng.uniform(0.85, 1.15))
        bias = float(rng.uniform(-0.08, 0.08))
        noise = torch.from_numpy(
            rng.normal(0.0, 0.02, size=tuple(image.shape)).astype(np.float32)
        )
        augmented_images.append(torch.clamp(image * gain + bias + noise, 0.0, 1.0))
        augmented_truth.append(target)
    return torch.stack(augmented_images), torch.stack(augmented_truth)


def _loss(logits, truth, *, offset_field: bool = False):
    """Multitask loss.

    ``offset_field`` swaps the scalar distance term for a two-channel offset regression at
    the SAME weight (2.0) and moves the center term from channel 3 to channel 4. The
    foreground, boundary and center terms and their weights are untouched, which is what
    the P-5 / A-1 pre-registration means by holding everything else fixed.
    """
    import torch
    from torch.nn import functional as functional

    foreground_probability = torch.sigmoid(logits[:, 0])
    foreground_bce = functional.binary_cross_entropy_with_logits(logits[:, 0], truth[:, 0])
    foreground_dice = 1.0 - (
        (2.0 * (foreground_probability * truth[:, 0]).sum(dim=(1, 2)) + 1.0)
        / (foreground_probability.sum(dim=(1, 2)) + truth[:, 0].sum(dim=(1, 2)) + 1.0)
    ).mean()
    foreground = foreground_bce + foreground_dice
    boundary_raw = functional.binary_cross_entropy_with_logits(
        logits[:, 1], truth[:, 1], reduction="none",
    )
    boundary_weight = 1.0 + 4.0 * truth[:, 1]
    boundary = (boundary_raw * boundary_weight).mean()
    if offset_field:
        offsets = functional.smooth_l1_loss(torch.sigmoid(logits[:, 2:4]), truth[:, 2:4])
        total = foreground + boundary + 2.0 * offsets
        center_raw = functional.binary_cross_entropy_with_logits(
            logits[:, 4], truth[:, 4], reduction="none",
        )
        return total + (center_raw * (1.0 + 6.0 * truth[:, 4])).mean()
    distance = functional.smooth_l1_loss(torch.sigmoid(logits[:, 2]), truth[:, 2])
    total = foreground + boundary + 2.0 * distance
    if logits.shape[1] > 3:
        center_raw = functional.binary_cross_entropy_with_logits(
            logits[:, 3], truth[:, 3], reduction="none",
        )
        total = total + (center_raw * (1.0 + 6.0 * truth[:, 3])).mean()
    return total


def _probabilities(model, images, *, device, batch_size: int) -> np.ndarray:
    import torch

    model.eval()
    out = []
    with torch.inference_mode():
        for start in range(0, len(images), batch_size):
            logits = model(images[start:start + batch_size].to(device))
            out.append(torch.sigmoid(logits).cpu().numpy())
    return np.concatenate(out)


def _calibrate(probabilities, cache_split, *, decode=probabilities_to_instances) -> dict:
    # One appearance realization per latent group is enough for threshold
    # selection and prevents duplicate views from dominating calibration.
    _, indices = np.unique(cache_split["group_ids"], return_index=True)
    indices = np.sort(indices)
    best = {"mean_ap": -1.0}
    center_weights = (0.0,) if probabilities.shape[1] == 3 else (0.0, 0.25, 0.5, 0.75, 1.0)
    for foreground_threshold in (0.4, 0.5, 0.6):
        for boundary_threshold in (0.35, 0.5, 0.65):
            for marker_threshold in (0.15, 0.25, 0.35):
                for min_distance in (1, 2, 3):
                    for center_weight in center_weights:
                        values = []
                        for index in indices:
                            labels = decode(
                                probabilities[index],
                                foreground_threshold=foreground_threshold,
                                boundary_threshold=boundary_threshold,
                                marker_threshold=marker_threshold,
                                min_distance=min_distance,
                                center_weight=center_weight,
                            )
                            score = mask_ap(labels, cache_split["labels"][index])["ap"]
                            if score is not None:
                                values.append(score)
                        mean_ap = float(np.mean(values))
                        if mean_ap > best["mean_ap"]:
                            best = {
                                "split": "calibration",
                                "n_groups": len(indices),
                                "mean_ap": mean_ap,
                                "foreground_threshold": foreground_threshold,
                                "boundary_threshold": boundary_threshold,
                                "marker_threshold": marker_threshold,
                                "min_distance": min_distance,
                                "center_weight": center_weight,
                            }
    return best


def _evaluate(
    probabilities,
    cache_split,
    calibration,
    *,
    split: str,
    decode=probabilities_to_instances,
) -> dict:
    rows = []
    for index, probability in enumerate(probabilities):
        labels = decode(
            probability,
            foreground_threshold=calibration["foreground_threshold"],
            boundary_threshold=calibration["boundary_threshold"],
            marker_threshold=calibration["marker_threshold"],
            min_distance=calibration["min_distance"],
            center_weight=calibration.get("center_weight", 0.5),
        )
        truth = cache_split["labels"][index]
        pixel_calibration = binary_calibration_metrics(probability[0], truth > 0)
        rows.append({
            "sample_id": str(cache_split["sample_ids"][index]),
            "condition_id": str(cache_split["conditions"][index]),
            "group_id": str(cache_split["group_ids"][index]),
            **full_instance_metrics(labels, truth),
            "brier": pixel_calibration["brier"],
            "ece": pixel_calibration["ece"],
            "pixel_calibration": pixel_calibration,
        })
    summary = summarize_metric_rows(rows, split=split)
    summary["mean_brier"] = float(np.mean([row["brier"] for row in rows]))
    summary["mean_ece"] = float(np.mean([row["ece"] for row in rows]))
    return summary


def train(
    config: Config,
    cache_path: Path,
    output: Path,
    *,
    resume: bool = True,
    variant_bank_path: Path | None = None,
) -> dict:
    """Train one multitask model.

    ``variant_bank_path`` is a cache location for the domain-randomization scale-variant bank,
    not a hyperparameter: the bank is a deterministic function of the training labels and the
    fixed ladder, so it is deliberately kept out of :class:`Config` and out of the checkpoint
    compatibility check. Its key is recorded in the run manifest instead.
    """
    import torch

    if config.method not in METHOD_CHANNELS:
        raise ValueError(f"unsupported method: {config.method}")
    if config.device.startswith("cuda") and not torch.cuda.is_available():
        raise RuntimeError("CUDA requested but unavailable; CPU fallback is forbidden")
    _seed(config.seed)
    device = torch.device(config.device)
    cache = load_cache(cache_path)
    train_cache = select_split(cache, "train")
    validation_cache = select_split(cache, "validation")
    calibration_cache = select_split(cache, "calibration")
    if config.evaluation_split not in {"validation", "test"}:
        raise ValueError("evaluation_split must be validation or test")
    if config.augmentation not in AUGMENTATION_MODES:
        raise ValueError(f"augmentation must be one of {AUGMENTATION_MODES}")
    offset_field = config.method in OFFSET_FIELD_METHODS
    if offset_field and config.augmentation in GEOMETRIC_AUGMENTATION_MODES:
        # _augment rotates and flips the target stack as if every channel were a scalar
        # map. That is wrong for a vector field, whose components must also be permuted
        # and negated. Refusing is honest; silently training on corrupted targets is not.
        raise ValueError(
            "geometric augmentation is not implemented for centroid-offset targets: "
            "rotating or flipping the frame must also transform the offset components"
        )
    evaluation_cache = select_split(cache, config.evaluation_split)
    decode = method_decode(config.method)
    train_images, train_truth = _tensor_data(train_cache, method=config.method)
    validation_images, validation_truth = _tensor_data(
        validation_cache, method=config.method,
    )

    variant_bank = None
    if config.augmentation == "domain-randomization":
        variant_bank = domain_randomization.load_or_build_bank(
            train_cache["images"],
            train_cache["labels"],
            include_centers=config.method == "lamellastar",
            path=variant_bank_path,
            progress=True,
        )
        print(
            f"domain-randomization variant bank key={variant_bank['key'][:16]} "
            f"ladder={list(variant_bank['ladder'])}",
            flush=True,
        )

    output.mkdir(parents=True, exist_ok=True)
    checkpoint_path = output / "checkpoint.pt"
    model = build_model(config.method, config.base_channels).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=config.learning_rate)
    history = []
    start_epoch = 0
    if resume and checkpoint_path.exists():
        checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
        checkpoint_config = dict(checkpoint["config"])
        # Strip exactly the fields _training_config strips, or a checkpoint written by this same
        # trainer can never match the config that produced it: the stored asdict(config) carries
        # `selection` and `early_stop_patience`, so leaving them here made every NEW checkpoint
        # unresumable while old ones (written before those fields existed) still worked.
        for field in ("evaluation_split", "epochs", "selection", "early_stop_patience"):
            checkpoint_config.pop(field, None)
        checkpoint_config.setdefault("augmentation", "none")
        if checkpoint_config != _training_config(config):
            raise RuntimeError(
                "checkpoint configuration mismatch: "
                f"stored {sorted(checkpoint_config.items())} vs "
                f"requested {sorted(_training_config(config).items())}"
            )
        model.load_state_dict(checkpoint["model"])
        optimizer.load_state_dict(checkpoint["optimizer"])
        for state in optimizer.state.values():
            for key, value in state.items():
                if isinstance(value, torch.Tensor):
                    state[key] = value.to(device)
        history = checkpoint["history"]
        start_epoch = checkpoint["epoch"] + 1

    best_path = output / "best.pt"
    best = {"epoch": -1, "validation_loss": float("inf"), "train_loss": float("nan")}
    best_state = None
    # A resumed run inherits the minimum already on the curve, so continuing a schedule
    # cannot silently promote a worse epoch than one an earlier leg had already reached.
    for row in history:
        if row["validation_loss"] < best["validation_loss"]:
            best = {
                "epoch": row["epoch"],
                "validation_loss": row["validation_loss"],
                "train_loss": row["train_loss"],
            }
    if history and best_path.exists():
        restored = torch.load(best_path, map_location="cpu", weights_only=False)
        if restored.get("epoch") == best["epoch"]:
            best_state = restored["model"]

    started = time.perf_counter()
    for epoch in range(start_epoch, config.epochs):
        model.train()
        order = np.random.default_rng(config.seed + epoch).permutation(len(train_images))
        losses = []
        for start in range(0, len(order), config.batch_size):
            indices = order[start:start + config.batch_size]
            image = train_images[indices]
            truth = train_truth[indices]
            if config.augmentation == "geometric-photometric":
                image, truth = _augment(
                    image,
                    truth,
                    rng=np.random.default_rng(
                        config.seed * 1_000_003 + epoch * 10_007 + start
                    ),
                )
            elif config.augmentation == "domain-randomization":
                image, truth = domain_randomization.augment_batch(
                    image,
                    truth,
                    bank=variant_bank,
                    indices=indices,
                    rng=np.random.default_rng(
                        config.seed * 1_000_003 + epoch * 10_007 + start
                    ),
                )
            image = image.to(device)
            truth = truth.to(device)
            optimizer.zero_grad(set_to_none=True)
            loss = _loss(model(image), truth, offset_field=offset_field)
            loss.backward()
            optimizer.step()
            losses.append(float(loss.detach()))
        model.eval()
        validation_losses = []
        with torch.inference_mode():
            for start in range(0, len(validation_images), config.batch_size):
                image = validation_images[start:start + config.batch_size].to(device)
                truth = validation_truth[start:start + config.batch_size].to(device)
                validation_losses.append(
                    float(_loss(model(image), truth, offset_field=offset_field))
                )
        row = {
            "epoch": epoch,
            "train_loss": float(np.mean(losses)),
            "validation_loss": float(np.mean(validation_losses)),
        }
        history.append(row)
        # .clone() is load-bearing, not defensive. `.detach().cpu()` returns the SAME tensor when
        # the model is already on CPU, so without it best_state would alias the live parameters and
        # AdamW would keep mutating them in place: "best" would silently export the final epoch on
        # any CPU run, while the manifest reported the best epoch's number.
        epoch_state = {
            key: value.detach().cpu().clone() for key, value in model.state_dict().items()
        }
        torch.save({
            "schema": "frothseg.checkpoint/multitask-v1",
            "method": config.method,
            "epoch": epoch,
            "model": epoch_state,
            "optimizer": optimizer.state_dict(),
            "config": asdict(config),
            "history": history,
        }, checkpoint_path)
        # The loop has always computed this validation loss and always thrown it away:
        # checkpoint.pt is rewritten every epoch, so the file ends holding the LAST epoch
        # whatever the curve did. On the published lamellastar members that discarded the
        # epoch-51..57 minimum and shipped weights 25-31% worse in validation loss. Keep
        # the best point as it goes past, because it cannot be recovered afterwards.
        improved = row["validation_loss"] < best["validation_loss"]
        if improved:
            best = {
                "epoch": epoch,
                "validation_loss": row["validation_loss"],
                "train_loss": row["train_loss"],
            }
            best_state = epoch_state
            torch.save({
                "schema": "frothseg.checkpoint/multitask-best-v1",
                "method": config.method,
                "epoch": epoch,
                "model": best_state,
                "config": asdict(config),
                "validation_loss": row["validation_loss"],
            }, best_path)
        print(
            f"method={config.method} epoch={epoch + 1}/{config.epochs} "
            f"train_loss={row['train_loss']:.5f} "
            f"validation_loss={row['validation_loss']:.5f}"
            f"{' *best' if improved else ''}",
            flush=True,
        )
        if config.early_stop_patience > 0 and epoch - best["epoch"] >= config.early_stop_patience:
            print(
                f"early stop: {config.early_stop_patience} epochs without improvement "
                f"since epoch {best['epoch'] + 1}",
                flush=True,
            )
            break

    # Everything below this line reads `model`: the exported weights, the decode
    # calibration and the evaluation. Put the SELECTED epoch in it, or all three
    # would keep describing the last one.
    # A resumed leg can reach here with best_state None: `best` is recomputed from the loaded
    # history, but the weights for it only exist if best.pt survived AND matches that epoch. Asking
    # for "best" and silently getting the last epoch, while the manifest still says policy "best"
    # and final_vs_selected_pct 0.0, would be indistinguishable from a run where the last epoch
    # genuinely was the best. Refuse instead: the weights being asked for are not on disk.
    if config.selection == "best" and best_state is None and history:
        raise RuntimeError(
            f"selection='best' but no weights exist for the minimum-validation epoch "
            f"{best['epoch'] + 1}. best.pt is missing or holds a different epoch, which happens "
            f"when resuming a run trained before best-epoch tracking existed. Re-run with "
            f"--no-resume to regenerate the trajectory, or pass --selection last to export the "
            f"final epoch deliberately."
        )
    applied_best = config.selection == "best" and best_state is not None
    if applied_best:
        model.load_state_dict(best_state)
        model.to(device)
    selected_epoch = best["epoch"] if applied_best else (history[-1]["epoch"] if history else -1)
    selected = {
        "policy": config.selection,
        "policy_applied": "best" if applied_best else "last",
        "epoch": selected_epoch,
        "epochs_ran": len(history),
        "epochs_requested": config.epochs,
        "validation_loss": next(
            (row["validation_loss"] for row in history if row["epoch"] == selected_epoch), None,
        ),
        "final_epoch_validation_loss": history[-1]["validation_loss"] if history else None,
        "early_stopped": bool(
            config.early_stop_patience > 0 and len(history) < config.epochs
        ),
    }
    if selected["validation_loss"] and selected["final_epoch_validation_loss"]:
        selected["final_vs_selected_pct"] = round(
            (selected["final_epoch_validation_loss"] / selected["validation_loss"] - 1) * 100, 2,
        )
    model.eval()

    weights_path = output / "weights.npz"
    np.savez_compressed(
        weights_path,
        **{name: tensor.detach().cpu().numpy() for name, tensor in model.state_dict().items()},
    )
    calibration_images = (
        torch.from_numpy(calibration_cache["images"].astype(np.float32)[:, None] / 255.0)
    )
    evaluation_images = torch.from_numpy(
        evaluation_cache["images"].astype(np.float32)[:, None] / 255.0
    )
    calibration_probabilities = _probabilities(
        model, calibration_images, device=device, batch_size=config.batch_size,
    )
    calibration = _calibrate(calibration_probabilities, calibration_cache, decode=decode)
    evaluation_probabilities = _probabilities(
        model, evaluation_images, device=device, batch_size=config.batch_size,
    )
    evaluation = _evaluate(
        evaluation_probabilities,
        evaluation_cache,
        calibration,
        split=config.evaluation_split,
        decode=decode,
    )
    props = torch.cuda.get_device_properties(device)
    cache_report = json.loads(cache_path.with_suffix(".json").read_text(encoding="utf-8"))
    manifest = {
        "schema": "frothseg.training-run/v2",
        "method": config.method,
        "config": asdict(config),
        "dataset": {
            "schema": cache_report["dataset_schema"],
            "cache_sha256": cache_report["sha256"],
            "samples": cache_report["samples"],
        },
        "environment": {
            "python": platform.python_version(),
            "torch": torch.__version__,
            "cuda_runtime": torch.version.cuda,
            "device": props.name,
            "device_total_vram_mib": round(props.total_memory / 1024**2),
            "peak_allocated_mib": round(torch.cuda.max_memory_allocated(device) / 1024**2, 1),
        },
        "duration_seconds": round(time.perf_counter() - started, 3),
        "inference_weights": {
            "path": weights_path.name,
            "bytes": weights_path.stat().st_size,
            "sha256": hashlib.sha256(weights_path.read_bytes()).hexdigest(),
        },
        "history": history,
        "selected_checkpoint": selected,
        "calibration": calibration,
        "evaluation": evaluation,
    }
    if variant_bank is not None:
        manifest["augmentation_detail"] = {
            "mode": config.augmentation,
            "preregistration": (
                "CAOS_MANAGE plans/frothseg/research-2026-07-31/"
                "p2-domain-randomization-preregistration-2026-08-01.md section 5"
            ),
            "scale_ladder": [float(value) for value in variant_bank["ladder"]],
            "variant_bank_key": str(variant_bank["key"]),
            "variant_bank_path": (
                variant_bank_path.as_posix() if variant_bank_path is not None else None
            ),
        }
    with (output / "run.json").open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(manifest, indent=2))
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--method", choices=sorted(METHOD_CHANNELS), required=True)
    parser.add_argument("--cache", type=Path, default=Path("data/cache/learned-v2-192.npz"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=20260725)
    parser.add_argument("--epochs", type=int, default=16)
    parser.add_argument("--learning-rate", type=float, default=8e-4)
    parser.add_argument("--base-channels", type=int, default=16)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--device", default="cuda")
    parser.add_argument(
        "--evaluation-split",
        choices=("validation", "test"),
        default="validation",
    )
    parser.add_argument(
        "--augmentation",
        choices=AUGMENTATION_MODES,
        default="none",
    )
    parser.add_argument(
        "--selection",
        choices=("best", "last"),
        default="best",
        help="which epoch's weights to export: the validation minimum, or the final epoch",
    )
    parser.add_argument(
        "--early-stop-patience",
        type=int,
        default=0,
        help="stop after N epochs with no validation improvement (0 disables)",
    )
    parser.add_argument(
        "--variant-bank",
        type=Path,
        default=None,
        help=(
            "cache path for the domain-randomization scale-variant bank; deterministic from "
            "the training labels, so it is a cache location and not a hyperparameter"
        ),
    )
    parser.add_argument("--no-resume", action="store_true")
    args = parser.parse_args()
    config = Config(
        method=args.method,
        seed=args.seed,
        epochs=args.epochs,
        learning_rate=args.learning_rate,
        base_channels=args.base_channels,
        batch_size=args.batch_size,
        device=args.device,
        evaluation_split=args.evaluation_split,
        augmentation=args.augmentation,
        selection=args.selection,
        early_stop_patience=args.early_stop_patience,
    )
    manifest = train(
        config,
        args.cache,
        args.output,
        resume=not args.no_resume,
        variant_bank_path=args.variant_bank,
    )
    print(json.dumps(manifest["evaluation"], indent=2))


if __name__ == "__main__":
    main()
