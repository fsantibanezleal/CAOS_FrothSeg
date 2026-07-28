"""Run official SAM 2.1 automatic masks on test and canonical datasets."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from fslab.foundation.sam2_1 import run


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=Path("data/cache/learned-v2-192.npz"))
    parser.add_argument("--output", type=Path, default=Path("models/sam2-1-hiera-tiny"))
    parser.add_argument(
        "--canonical-output",
        type=Path,
        default=Path("data/derived/learned/sam2-1-hiera-tiny"),
    )
    args = parser.parse_args()
    manifest = run(args.cache, args.output, args.canonical_output)
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
