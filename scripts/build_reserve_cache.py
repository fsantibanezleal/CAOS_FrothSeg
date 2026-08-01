"""Materialize the untouched synthetic reserve slices (Phase 2 of the 2026-07-31 plan proposal).

One slice per pre-registered study (P-1 to P-5), stratified over all 16 conditions and drawn
from a seed range disjoint from the working matrix. The working cache
(``data/cache/learned-v2-192.npz``) is not touched: every published learned-model number was
selected on it and P-1 reads its train split, so Phase 2 enlarges the dataset by adding reserve
groups rather than by moving the surface every existing number stands on.

    .venv-gpu/Scripts/python.exe scripts/build_reserve_cache.py
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.learning.data_cache import build_reserve_cache  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "data/cache/learned-v2-192-reserve.npz",
    )
    parser.add_argument("--image-size", type=int, default=192)
    parser.add_argument("--appearance-variants", type=int, default=2)
    args = parser.parse_args()
    print(json.dumps(build_reserve_cache(
        args.output,
        image_size=args.image_size,
        appearance_variants=args.appearance_variants,
    ), indent=2))


if __name__ == "__main__":
    main()
