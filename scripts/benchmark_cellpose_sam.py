"""Run official Cellpose-SAM cpsam_v2 on the learned test and canonical sets."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from fslab.foundation.cellpose_sam import run


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=Path("data/cache/learned-v2-192.npz"))
    parser.add_argument("--model-output", type=Path, default=Path("models/cellpose-sam-cpsam-v2"))
    parser.add_argument(
        "--canonical-output",
        type=Path,
        default=Path("data/derived/learned/cellpose-sam-cpsam-v2"),
    )
    args = parser.parse_args()
    manifest = run(args.cache, args.model_output, args.canonical_output)
    print(json.dumps({
        "evaluation": {
            key: manifest["evaluation"][key]
            for key in ("mean_ap", "mean_ap50", "mean_pq")
        },
        "canonical_diagnostic": manifest["canonical_diagnostic"],
        "test_duration_seconds": manifest["test_duration_seconds"],
    }, indent=2))


if __name__ == "__main__":
    main()
