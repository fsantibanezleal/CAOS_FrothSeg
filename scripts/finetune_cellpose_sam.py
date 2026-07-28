"""Fine-tune official Cellpose-SAM and evaluate the resulting checkpoint."""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import time
from pathlib import Path

import numpy as np

from fslab.foundation.cellpose_sam import run
from fslab.learning.data_cache import load_cache, select_split


def main() -> None:
    import cellpose
    import torch
    from cellpose import models, train

    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=Path("data/cache/learned-v2-192.npz"))
    parser.add_argument("--output", type=Path, default=Path("models/cellpose-sam-cpsam-v2"))
    parser.add_argument(
        "--canonical-output",
        type=Path,
        default=Path("data/derived/learned/cellpose-sam-cpsam-v2"),
    )
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--learning-rate", type=float, default=1e-5)
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("Cellpose-SAM fine-tuning requires CUDA; CPU fallback is forbidden")

    cache = load_cache(args.cache)
    train_split = select_split(cache, "train")
    validation_split = select_split(cache, "validation")
    train_images = [image.astype(np.float32) / 255.0 for image in train_split["images"]]
    train_labels = [label.astype(np.int32) for label in train_split["labels"]]
    validation_images = [
        image.astype(np.float32) / 255.0 for image in validation_split["images"]
    ]
    validation_labels = [
        label.astype(np.int32) for label in validation_split["labels"]
    ]

    model = models.CellposeModel(
        gpu=True,
        pretrained_model="cpsam_v2",
        use_bfloat16=True,
    )
    weights_dir = args.output / "weights"
    weights_dir.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()
    checkpoint, train_losses, validation_losses = train.train_seg(
        model.net,
        train_data=train_images,
        train_labels=train_labels,
        test_data=validation_images,
        test_labels=validation_labels,
        channel_axis=None,
        load_files=False,
        batch_size=args.batch_size,
        learning_rate=args.learning_rate,
        n_epochs=args.epochs,
        weight_decay=0.1,
        normalize=True,
        compute_flows=False,
        save_path=weights_dir,
        save_every=max(1, min(5, args.epochs)),
        save_each=False,
        nimg_per_epoch=len(train_images),
        nimg_test_per_epoch=len(validation_images),
        model_name="frothseg-cpsam-v2",
    )
    checkpoint_path = Path(checkpoint)
    fine_tuning = {
        "state": "completed",
        "base_model": "cpsam_v2",
        "engine_version": cellpose.version,
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "learning_rate": args.learning_rate,
        "train_samples": len(train_images),
        "validation_samples": len(validation_images),
        "split_unit": "latent geometry group",
        "duration_seconds": round(time.perf_counter() - started, 3),
        "checkpoint": {
            "path": str(checkpoint_path),
            "bytes": checkpoint_path.stat().st_size,
            "sha256": hashlib.sha256(checkpoint_path.read_bytes()).hexdigest(),
            "committed": False,
        },
        "loss": {
            "train": [float(value) for value in np.asarray(train_losses).ravel()],
            "validation": [
                float(value) for value in np.asarray(validation_losses).ravel()
            ],
        },
        "environment": {
            "python": platform.python_version(),
            "torch": torch.__version__,
            "cuda_runtime": torch.version.cuda,
            "device": torch.cuda.get_device_name(0),
        },
    }
    manifest = run(
        args.cache,
        args.output,
        args.canonical_output,
        pretrained_model=checkpoint_path,
        fine_tuning=fine_tuning,
    )
    print(json.dumps({
        "fine_tuning": fine_tuning,
        "evaluation": {
            key: manifest["evaluation"][key]
            for key in ("mean_ap", "mean_ap50", "mean_pq", "mean_brier", "mean_ece")
        },
    }, indent=2))


if __name__ == "__main__":
    main()
