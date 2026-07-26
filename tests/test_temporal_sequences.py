import numpy as np

from fslab.science.froth_gen import CASES, generate_sequence


def test_temporal_sequence_is_deterministic_and_keeps_instance_ids():
    spec = next(case for case in CASES if case.name == "poly-normal")
    first = generate_sequence(spec, frames=4)
    second = generate_sequence(spec, frames=4)
    assert len(first) == 4
    assert all(np.array_equal(a["labels"], b["labels"]) for a, b in zip(first, second))
    common = set(np.unique(first[0]["labels"])) & set(np.unique(first[1]["labels"]))
    assert len(common - {0}) > 0
    assert not np.array_equal(first[0]["image"], first[1]["image"])
