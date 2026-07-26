from fslab.datasets import SampleRecord, grouped_split, validate_splits


def _sample(sample_id: str, group_id: str) -> SampleRecord:
    return SampleRecord(
        sample_id=sample_id,
        source_id="synthetic-v2",
        group_id=group_id,
        frame_id=sample_id,
        image_uri=f"images/{sample_id}.png",
        mask_uri=f"masks/{sample_id}.json",
        mm_per_px=0.1,
        license="MIT-generated",
        scoreable=True,
        synthetic=True,
    )


def test_grouped_split_is_deterministic_and_blocks_variant_leakage():
    samples = [
        _sample("scene-a-v1", "scene-a"),
        _sample("scene-a-v2", "scene-a"),
        _sample("scene-b-v1", "scene-b"),
        _sample("video-1-f001", "video-1"),
        _sample("video-1-f002", "video-1"),
    ]
    first = grouped_split(samples)
    second = grouped_split(reversed(samples))
    assert first == second
    assert validate_splits(first) == []
    by_id = {row.sample.sample_id: row.split for row in first}
    assert by_id["scene-a-v1"] == by_id["scene-a-v2"]
    assert by_id["video-1-f001"] == by_id["video-1-f002"]


def test_split_validation_rejects_scoreable_sample_without_truth():
    sample = _sample("bad", "bad")
    bad = SampleRecord(**{**sample.__dict__, "mask_uri": None})
    rows = grouped_split([bad])
    assert any("lacks mask" in error for error in validate_splits(rows))
