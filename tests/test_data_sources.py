import json
from pathlib import Path

import pytest

from fslab.data_sources import DataSource, import_coco_records, load_source_registry


def test_committed_source_registry_is_valid():
    sources = load_source_registry(Path("manifests/source-registry.json"))
    assert sources["frothseg-synthetic-v2"].scoreable is True
    assert sources["kaggle-froth-bubbles"].access == "blocked-license-unknown"


def test_real_coco_import_requires_grouping_and_calibration(tmp_path):
    image_root = tmp_path / "images"
    image_root.mkdir()
    (image_root / "frame.png").write_bytes(b"not-decoded-by-record-import")
    annotation_path = tmp_path / "instances.json"
    annotation_path.write_text(json.dumps({
        "images": [{"id": 1, "file_name": "frame.png", "video_id": "video-a", "mm_per_px": 0.25}],
        "annotations": [{"id": 1, "image_id": 1, "segmentation": {"size": [1, 1], "counts": "0"}}],
    }), encoding="utf-8")
    source = DataSource(
        source_id="real-a",
        title="Real A",
        kind="real-instance",
        license="CC-BY-4.0",
        access="local",
        redistribution="link-only",
        url="https://example.test/dataset",
        scoreable=True,
        calibration_required=True,
    )
    rows = import_coco_records(annotation_path, image_root, source)
    assert len(rows) == 1
    assert rows[0].sample.synthetic is False
    assert rows[0].sample.mm_per_px == 0.25
    assert rows[0].sample.group_id == "real-a-video-a"

    document = json.loads(annotation_path.read_text(encoding="utf-8"))
    document["images"][0].pop("mm_per_px")
    annotation_path.write_text(json.dumps(document), encoding="utf-8")
    with pytest.raises(ValueError, match="mm_per_px"):
        import_coco_records(annotation_path, image_root, source)


def test_real_coco_import_accepts_reviewed_metadata_overlay(tmp_path):
    image_root = tmp_path / "images"
    image_root.mkdir()
    (image_root / "frame.png").write_bytes(b"not-decoded-by-record-import")
    annotation_path = tmp_path / "instances.json"
    annotation_path.write_text(json.dumps({
        "images": [{"id": 1, "file_name": "frame.png"}],
        "annotations": [{"id": 1, "image_id": 1, "segmentation": {"size": [1, 1], "counts": "0"}}],
    }), encoding="utf-8")
    metadata_path = tmp_path / "metadata.json"
    metadata_path.write_text(json.dumps({
        "schema": "frothseg.real-metadata/v1",
        "source_id": "real-a",
        "annotation_review": {"state": "accepted", "reviewer": "reviewer-a"},
        "images": [{"file_name": "frame.png", "group_id": "campaign-a", "mm_per_px": 0.25}],
    }), encoding="utf-8")
    source = DataSource(
        source_id="real-a",
        title="Real A",
        kind="real-instance",
        license="CC-BY-4.0",
        access="local",
        redistribution="link-only",
        url="https://example.test/dataset",
        scoreable=True,
        calibration_required=True,
    )
    rows = import_coco_records(
        annotation_path,
        image_root,
        source,
        metadata_path=metadata_path,
    )
    assert rows[0].sample.group_id == "real-a-campaign-a"
    assert rows[0].sample.mm_per_px == 0.25
