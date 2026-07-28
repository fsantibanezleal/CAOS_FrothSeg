"""Train and evaluate official Ultralytics YOLO segmentation."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from fslab.learning.train_yolo_seg import train


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=Path("data/cache/learned-v2-192.npz"))
    parser.add_argument("--dataset", type=Path, default=Path("data/cache/yolo-froth-v1"))
    parser.add_argument("--output", type=Path, default=Path("models/yolo-froth-seg-v1"))
    parser.add_argument(
        "--canonical-output",
        type=Path,
        default=Path("data/derived/learned/yolo-froth-seg-v1"),
    )
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--existing-checkpoint", type=Path)
    args = parser.parse_args()
    manifest = train(
        args.cache,
        args.dataset,
        args.output,
        args.canonical_output,
        epochs=args.epochs,
        existing_checkpoint=args.existing_checkpoint,
    )
    print(json.dumps({
        "evaluation": {
            key: manifest["evaluation"][key]
            for key in ("mean_ap", "mean_ap50", "mean_pq")
        },
        "canonical_diagnostic": manifest["canonical_diagnostic"],
        "duration_seconds": manifest["duration_seconds"],
    }, indent=2))


if __name__ == "__main__":
    main()
