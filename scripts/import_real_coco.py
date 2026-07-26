"""Validate and register a locally acquired real COCO instance dataset."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.data_sources import import_coco_records, load_source_registry  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--annotations", type=Path, required=True)
    parser.add_argument("--images", type=Path, required=True)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--source-id", default="roboflow-froth-rk6ka")
    parser.add_argument(
        "--registry",
        type=Path,
        default=ROOT / "manifests/source-registry.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "data/derived/real-dataset-manifest.json",
    )
    parser.add_argument("--split-seed", type=int, default=20260725)
    args = parser.parse_args()

    sources = load_source_registry(args.registry)
    if args.source_id not in sources:
        raise SystemExit(f"unknown source_id: {args.source_id}")
    rows = import_coco_records(
        args.annotations,
        args.images,
        sources[args.source_id],
        metadata_path=args.metadata,
        split_seed=args.split_seed,
    )
    metadata = json.loads(args.metadata.read_text(encoding="utf-8"))
    review = metadata.get("annotation_review", {})
    if review.get("state") != "accepted" or not review.get("reviewer"):
        raise ValueError("independent annotation review must be accepted and name a reviewer")
    split_counts = {
        split: sum(row.split == split for row in rows)
        for split in ("train", "validation", "calibration", "test")
    }
    document = {
        "schema": "frothseg.real-dataset/v1",
        "source_id": args.source_id,
        "source_url": sources[args.source_id].url,
        "license": sources[args.source_id].license,
        "split_seed": args.split_seed,
        "split_unit": "source group",
        "sample_count": len(rows),
        "calibrated_sample_count": sum(
            row.sample.mm_per_px is not None for row in rows
        ),
        "scoreable_sample_count": sum(row.sample.scoreable for row in rows),
        "splits": split_counts,
        "annotation_review": review,
        "samples": [
            {**asdict(row.sample), "split": row.split}
            for row in rows
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    print(args.output)


if __name__ == "__main__":
    main()
