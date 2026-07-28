"""Licensed source registry and real/synthetic ingestion contract."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from .datasets import SampleRecord, SplitRecord, grouped_split, validate_splits


@dataclass(frozen=True)
class DataSource:
    source_id: str
    title: str
    kind: str
    license: str
    access: str
    redistribution: str
    url: str
    scoreable: bool
    calibration_required: bool
    #: What was checked, when, and what it settled. Present once a licence claim has been
    #: verified against the publisher rather than assumed, so the question is not reopened.
    license_verification: dict | None = None
    #: The one external input a source is waiting on, named precisely. "Needs real data" is
    #: not actionable; "needs ROBOFLOW_API_KEY" is.
    blocked_on: dict | None = None


def load_source_registry(path: Path) -> dict[str, DataSource]:
    document = json.loads(path.read_text(encoding="utf-8"))
    if document.get("schema") != "frothseg.source-registry/v1":
        raise ValueError("source registry schema mismatch")
    sources: dict[str, DataSource] = {}
    for raw in document.get("sources", []):
        source = DataSource(**raw)
        if source.source_id in sources:
            raise ValueError(f"duplicate source_id: {source.source_id}")
        if not source.license or not source.url:
            raise ValueError(f"incomplete source provenance: {source.source_id}")
        sources[source.source_id] = source
    if not sources:
        raise ValueError("source registry is empty")
    return sources


def import_coco_records(
    annotation_path: Path,
    image_root: Path,
    source: DataSource,
    *,
    metadata_path: Path | None = None,
    split_seed: int = 20260725,
) -> list[SplitRecord]:
    """Import COCO instance records without copying restricted source data.

    Each image must define a grouping key through ``group_id``, ``video_id``, or
    ``site_id``. A calibrated source also requires positive ``mm_per_px`` on
    every image. The returned records use local URIs and can be materialized by
    downstream loaders.
    """
    document = json.loads(annotation_path.read_text(encoding="utf-8"))
    metadata_by_file: dict[str, dict] = {}
    if metadata_path is not None:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if metadata.get("schema") != "frothseg.real-metadata/v1":
            raise ValueError("real metadata schema mismatch")
        if metadata.get("source_id") != source.source_id:
            raise ValueError("real metadata source_id mismatch")
        for row in metadata.get("images", []):
            file_name = str(row.get("file_name", ""))
            if not file_name:
                raise ValueError("real metadata row lacks file_name")
            if file_name in metadata_by_file:
                raise ValueError(f"duplicate real metadata file_name: {file_name}")
            metadata_by_file[file_name] = row
    annotations_by_image: dict[int, list[dict]] = {}
    for annotation in document.get("annotations", []):
        annotations_by_image.setdefault(int(annotation["image_id"]), []).append(annotation)
    samples: list[SampleRecord] = []
    for image in document.get("images", []):
        image_id = int(image["id"])
        file_name = str(image["file_name"])
        overlay = metadata_by_file.get(file_name, {})
        group_value = overlay.get(
            "group_id",
            image.get("group_id", image.get("video_id", image.get("site_id"))),
        )
        if group_value is None:
            raise ValueError(f"image {image_id} lacks group_id/video_id/site_id")
        mm_per_px = overlay.get("mm_per_px", image.get("mm_per_px"))
        if source.calibration_required and (mm_per_px is None or float(mm_per_px) <= 0):
            raise ValueError(f"image {image_id} lacks positive mm_per_px calibration")
        image_path = (image_root / file_name).resolve()
        if not image_path.is_file():
            raise FileNotFoundError(image_path)
        has_instances = bool(annotations_by_image.get(image_id))
        sample_id = f"{source.source_id}-{image_id}"
        samples.append(SampleRecord(
            sample_id=sample_id,
            source_id=source.source_id,
            group_id=f"{source.source_id}-{group_value}",
            frame_id=str(image.get("frame_id", image_id)),
            image_uri=image_path.as_uri(),
            mask_uri=f"coco://{annotation_path.resolve().as_posix()}#image_id={image_id}" if has_instances else None,
            mm_per_px=None if mm_per_px is None else float(mm_per_px),
            license=source.license,
            scoreable=source.scoreable and has_instances,
            synthetic=False,
        ))
    rows = grouped_split(samples, seed=split_seed)
    errors = validate_splits(rows)
    if errors:
        raise ValueError("invalid imported dataset: " + "; ".join(errors))
    return rows
