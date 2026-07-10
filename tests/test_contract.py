"""CONTRACT 1 (froth-image ingestion) tests: a real froth frame validates; unusable frames are rejected with a
reason; degraded-but-usable frames (glare / low contrast) are accepted AND flagged."""
import numpy as np

from fslab.io.contract import validate_image
from fslab.science.froth_gen import CASES, generate


def _scene(name):
    return generate(next(c for c in CASES if c.name == name))["image"]


def test_real_froth_frame_accepted_clean():
    rep = validate_image(_scene("poly-normal"))
    assert rep.ok and rep.rejected_reason is None
    assert rep.stats.channels == 1 and rep.stats.dyn_range > 0.15
    assert not rep.flags  # a clean nominal frame carries no warning


def test_unusable_frames_rejected_with_reason():
    tiny = np.zeros((32, 32), dtype=np.float32)                 # too small AND flat
    blank = np.full((256, 256), 0.5, dtype=np.float32)          # no contrast
    wrong = np.zeros((8, 256, 256), dtype=np.float32)           # unsupported shape
    for img in (tiny, blank, wrong):
        rep = validate_image(img)
        assert not rep.ok and rep.rejected_reason


def test_glare_frame_accepted_but_flagged():
    rep = validate_image(_scene("glare-storm"))
    assert rep.ok, "a glare frame is still usable (deglare front-end handles it), must not be rejected"
    assert any("glare" in f for f in rep.flags)


def test_rgb_is_reduced_to_luma_and_accepted():
    g = _scene("poly-normal")
    rgb = np.dstack([g, g, g])
    rep = validate_image(rgb)
    assert rep.ok and rep.stats.channels == 3
