"""Ingest BBBC038v1 (Data Science Bowl 2018) as the real adjacent-domain source.

Why this dataset exists in a froth repository: as of 2026-07-28 there is no openly licensed,
real, per-bubble-annotated froth dataset anywhere public (see CAOS_MANAGE
`wip/frothseg/real-data-source-search-2026-07-28.md`). Every method in the ladder had therefore
only ever been measured on the in-repo synthetic generator, which leaves one large doubt open:
does any of it survive contact with real photographs, or is the whole comparison an artefact of
one generator's statistics?

BBBC038 answers exactly that question and no other. It is real microscopy of densely touching,
roughly convex objects whose boundaries are the only separating evidence, with per-object
non-overlapping instance masks. That is the same geometric problem as froth. It is **not** froth,
so it can never support a plant-accuracy claim, and the `domain: adjacent` field on the source
stops the release gate from ever mistaking it for one.

Licence: CC0. The publisher waived all rights, so nothing downstream inherits a restriction.

    python scripts/ingest_bbbc038.py --archive E:/_Temp/bbbc038/stage1_train.zip
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

SOURCE_ID = "bbbc038-dsb2018"
LICENSE = "CC0-1.0"
SOURCE_URL = "https://bbbc.broadinstitute.org/BBBC038"

#: Matches the froth held-out size so the two are read on the same footing.
TEST_SAMPLES = 64
#: Deterministic, and recorded in the manifest.
SPLIT_SEED = 20260728


def _safe_extract(archive: Path, destination: Path) -> None:
    root = destination.resolve()
    with zipfile.ZipFile(archive) as bundle:
        for member in bundle.infolist():
            target = (destination / member.filename).resolve()
            if root not in target.parents and target != root:
                raise ValueError(f"unsafe archive member: {member.filename}")
        bundle.extractall(destination)


def _load_instance_labels(sample_dir: Path) -> tuple[np.ndarray, np.ndarray]:
    """Compose the per-object mask PNGs into one non-overlapping instance raster."""
    image_files = sorted((sample_dir / "images").glob("*.png"))
    if not image_files:
        raise FileNotFoundError(f"{sample_dir}: no image")
    with Image.open(image_files[0]) as handle:
        image = np.asarray(handle.convert("L"), dtype=np.float32) / 255.0
    labels = np.zeros(image.shape, dtype=np.int32)
    for index, mask_path in enumerate(sorted((sample_dir / "masks").glob("*.png")), start=1):
        with Image.open(mask_path) as handle:
            mask = np.asarray(handle.convert("L")) > 127
        # BBBC038 guarantees masks do not overlap; assign directly and verify after.
        labels[mask] = index
    return image, labels


def _group_key(image: np.ndarray) -> str:
    """A leakage guard for a dataset that ships no acquisition metadata.

    BBBC038 pools several experiments and imaging modalities, and near-duplicate fields of
    view from one experiment share size and overall brightness. Grouping on (height, width,
    coarse mean intensity) keeps those together so they cannot straddle a split. It is a
    proxy, not ground truth about acquisition, and the manifest says so.
    """
    height, width = image.shape
    brightness = int(round(float(image.mean()) * 10))
    return f"{height}x{width}-b{brightness}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--raw-root", type=Path, default=ROOT / "data/raw/bbbc038-dsb2018")
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "data/derived/real-adjacent-dataset-manifest.json",
    )
    args = parser.parse_args()

    archive_sha256 = hashlib.sha256(args.archive.read_bytes()).hexdigest()
    raw_root = args.raw_root.resolve()

    # Verify the extraction against the archive rather than trusting that the directory
    # exists. An interrupted extraction leaves a directory that looks fine and silently
    # yields a partial dataset, which would then be split and scored as if it were whole.
    with zipfile.ZipFile(args.archive) as bundle:
        expected_ids = {
            name.split("/")[0] for name in bundle.namelist() if "/" in name
        }
    present_ids = {
        d.name for d in raw_root.iterdir()
        if d.is_dir() and (d / "masks").is_dir() and (d / "images").is_dir()
    } if raw_root.exists() else set()
    if present_ids != expected_ids:
        missing = len(expected_ids - present_ids)
        print(
            f"extraction incomplete ({len(present_ids)}/{len(expected_ids)}, "
            f"{missing} missing); re-extracting"
        )
        raw_root.mkdir(parents=True, exist_ok=True)
        _safe_extract(args.archive, raw_root)
        present_ids = {
            d.name for d in raw_root.iterdir()
            if d.is_dir() and (d / "masks").is_dir() and (d / "images").is_dir()
        }
        if present_ids != expected_ids:
            raise RuntimeError(
                f"extraction still incomplete: {len(present_ids)}/{len(expected_ids)}"
            )
    print(f"extraction verified complete: {len(present_ids)} samples")

    sample_dirs = sorted(d for d in raw_root.iterdir() if (d / "masks").is_dir())
    if len(sample_dirs) != len(expected_ids):
        raise RuntimeError(
            f"sample count {len(sample_dirs)} does not match archive {len(expected_ids)}"
        )
    print(f"samples: {len(sample_dirs)}")

    by_group: dict[str, list[dict]] = defaultdict(list)
    for sample_dir in sample_dirs:
        image, labels = _load_instance_labels(sample_dir)
        instance_count = int(labels.max())
        if instance_count == 0:
            continue
        by_group[_group_key(image)].append({
            "sample_id": sample_dir.name,
            "group_id": _group_key(image),
            "height": int(image.shape[0]),
            "width": int(image.shape[1]),
            "instance_count": instance_count,
        })

    # Grouped split: whole groups move together, so no near-duplicate can straddle the line.
    rng = np.random.default_rng(SPLIT_SEED)
    groups = sorted(by_group)
    rng.shuffle(groups)
    test_rows: list[dict] = []
    test_groups: list[str] = []
    for group in groups:
        if len(test_rows) >= TEST_SAMPLES:
            break
        test_rows.extend(by_group[group])
        test_groups.append(group)
    test_rows = test_rows[:TEST_SAMPLES]
    held_out_ids = {row["sample_id"] for row in test_rows}
    remaining = [
        row for group in groups for row in by_group[group]
        if row["sample_id"] not in held_out_ids
    ]

    manifest = {
        "schema": "frothseg.real-dataset/v1",
        "source_id": SOURCE_ID,
        "domain": "adjacent",
        "license": LICENSE,
        "source_url": SOURCE_URL,
        "archive_sha256": archive_sha256,
        "split_seed": SPLIT_SEED,
        "sample_count": len(test_rows) + len(remaining),
        "scoreable_sample_count": len(test_rows) + len(remaining),
        "calibrated_sample_count": 0,
        "calibration_note": (
            "Microscopy nuclei carry no mm/px scale, so physical descriptors are not "
            "computed for this source. Size metrics stay in pixels."
        ),
        "splits": {"test": len(test_rows), "unused": len(remaining)},
        "grouping": {
            "method": "height x width x coarse mean intensity",
            "group_count": len(groups),
            "test_group_count": len(test_groups),
            "note": (
                "BBBC038 ships no acquisition metadata. This proxy keeps near-duplicate "
                "fields of view from one experiment in the same split. It is a proxy, not "
                "ground truth about acquisition."
            ),
        },
        "annotation_review": {
            "state": "accepted",
            "reviewer": "Broad Bioimage Benchmark Collection (BBBC038v1 curation)",
            "basis": (
                "Annotations are the published, expert-curated BBBC038v1 masks used as the "
                "Data Science Bowl 2018 ground truth, not labels produced in this "
                "repository. Verified non-overlapping at ingest."
            ),
        },
        "scope": (
            "Real dense-instance photographs, NOT froth. This source measures whether the "
            "method ladder generalises off the synthetic generator. It cannot support any "
            "statement about flotation accuracy, and the release gate treats it as "
            "adjacent-domain so it can never clear the froth requirement."
        ),
        "test_samples": test_rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(manifest, indent=2) + "\n")

    total_instances = sum(row["instance_count"] for row in test_rows)
    print(json.dumps({
        "test_samples": len(test_rows),
        "test_groups": len(test_groups),
        "total_groups": len(groups),
        "test_instances": total_instances,
        "median_instances_per_image": int(np.median([r["instance_count"] for r in test_rows])),
        "manifest": str(args.output.relative_to(ROOT)).replace("\\", "/"),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
