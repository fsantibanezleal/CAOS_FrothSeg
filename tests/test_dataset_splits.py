from dataclasses import replace

from fslab.datasets import (
    RESERVE_GROUPS_PER_CONDITION,
    RESERVE_STUDIES,
    SampleRecord,
    grouped_split,
    learned_dataset_matrix,
    reserve_dataset_matrix,
    validate_learned_matrix,
    validate_reserve_matrix,
    validate_splits,
)


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


def test_learned_matrix_is_stratified_and_keeps_appearance_variants_grouped():
    samples = learned_dataset_matrix(image_size=128, appearance_variants=2)
    assert validate_learned_matrix(samples) == []
    assert len(samples) == 16 * 12 * 2
    assert {sample.split for sample in samples} == {
        "train", "validation", "calibration", "test",
    }
    groups: dict[str, set[str]] = {}
    for sample in samples:
        groups.setdefault(sample.record.group_id, set()).add(sample.split)
    assert all(len(splits) == 1 for splits in groups.values())
    first_group = [
        sample for sample in samples
        if sample.record.group_id == samples[0].record.group_id
    ]
    assert len({sample.spec.seed for sample in first_group}) == 1
    assert len({sample.spec.appearance_seed for sample in first_group}) == 2


def test_reserve_matrix_gives_every_planned_study_a_stratified_untouched_slice():
    working = learned_dataset_matrix(image_size=128, appearance_variants=2)
    reserve = reserve_dataset_matrix(image_size=128, appearance_variants=2)
    assert validate_reserve_matrix(reserve, working) == []
    assert len(reserve) == 16 * len(RESERVE_STUDIES) * RESERVE_GROUPS_PER_CONDITION * 2
    assert {sample.split for sample in reserve} == {"reserve"}
    for study in RESERVE_STUDIES:
        slice_rows = [row for row in reserve if row.reserve_study == study]
        # Same shape as the burned test split: every condition, two latent groups each.
        assert len({row.condition_id for row in slice_rows}) == 16
        assert len({row.record.group_id for row in slice_rows}) == (
            16 * RESERVE_GROUPS_PER_CONDITION
        )


def test_reserve_is_disjoint_from_the_working_matrix_on_ids_groups_and_seeds():
    working = learned_dataset_matrix(image_size=128, appearance_variants=2)
    reserve = reserve_dataset_matrix(image_size=128, appearance_variants=2)
    for extract in (
        lambda row: row.record.sample_id,
        lambda row: row.record.group_id,
        lambda row: row.spec.seed,
    ):
        assert not {extract(row) for row in reserve} & {extract(row) for row in working}


def test_reserve_validation_rejects_a_reused_geometry_seed():
    working = learned_dataset_matrix(image_size=128, appearance_variants=2)
    reserve = reserve_dataset_matrix(image_size=128, appearance_variants=2)
    # A reserve row that re-renders an observed scene under a fresh name is worthless without
    # looking worthless, so the seed check has to catch it.
    leaked = replace(reserve[0], spec=replace(reserve[0].spec, seed=working[0].spec.seed))
    errors = validate_reserve_matrix([leaked, *reserve[1:]], working)
    assert any("geometry_seed" in error for error in errors)


def test_working_matrix_validation_rejects_a_reserve_row():
    working = learned_dataset_matrix(image_size=128, appearance_variants=2)
    reserve = reserve_dataset_matrix(image_size=128, appearance_variants=2)
    errors = validate_learned_matrix([*working, reserve[0]])
    assert any("not a working split" in error for error in errors)
