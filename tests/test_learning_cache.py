from pathlib import Path

from fslab.learning.data_cache import build_cache, load_cache, select_split


def test_learned_cache_round_trip(tmp_path: Path):
    path = tmp_path / "learned.npz"
    report = build_cache(path, image_size=64, appearance_variants=1)
    assert report["samples"] == 16 * 12
    cache = load_cache(path)
    assert cache["images"].shape == (192, 64, 64)
    assert cache["labels"].shape == (192, 64, 64)
    assert select_split(cache, "test")["images"].shape[0] == 16 * 2
