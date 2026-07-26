"""Materialize the shared learned-model dataset once for all GPU methods."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from fslab.learning.data_cache import build_cache


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/cache/learned-v2-192.npz"),
    )
    parser.add_argument("--image-size", type=int, default=192)
    parser.add_argument("--appearance-variants", type=int, default=2)
    args = parser.parse_args()
    print(json.dumps(build_cache(
        args.output,
        image_size=args.image_size,
        appearance_variants=args.appearance_variants,
    ), indent=2))


if __name__ == "__main__":
    main()
