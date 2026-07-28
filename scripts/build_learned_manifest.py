"""Build the committed, leakage-safe learned-model dataset manifest."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from fslab.datasets import write_learned_manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("manifests/learned-dataset-v2.json"),
    )
    parser.add_argument("--image-size", type=int, default=192)
    parser.add_argument("--appearance-variants", type=int, default=2)
    args = parser.parse_args()
    manifest = write_learned_manifest(
        args.output,
        image_size=args.image_size,
        appearance_variants=args.appearance_variants,
    )
    print(json.dumps({key: manifest[key] for key in (
        "schema", "condition_count", "sample_count", "group_count", "splits",
    )}, indent=2))


if __name__ == "__main__":
    main()
