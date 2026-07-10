"""FrothSeg science tests: the synthetic generator (benchmark harness) + the classical floor + scoring."""
import numpy as np

from fslab.science.froth_gen import CASES, generate
from fslab.science.segment import mask_ap, morphometry, watershed_dt


def test_generator_is_deterministic():
    a = generate(CASES[1]); b = generate(CASES[1])
    assert np.array_equal(a["labels"], b["labels"])
    assert np.allclose(a["image"], b["image"])


def test_bsd_tracks_the_target_and_regimes():
    fine = generate(next(c for c in CASES if c.name == "fine-froth"))["bsd"]
    coarse = generate(next(c for c in CASES if c.name == "coarse-froth"))["bsd"]
    mono = generate(next(c for c in CASES if c.name == "mono-clean"))["bsd"]
    # fine froth has many more, smaller bubbles than coarse
    assert fine["count"] > 3 * coarse["count"]
    assert fine["d32"] < coarse["d32"]
    # a near-monodisperse case has d50 close to d32 (a wide BSD pushes them apart)
    assert abs(mono["d50"] - mono["d32"]) < 0.35 * mono["d32"]


def test_empty_control_has_no_bubbles():
    r = generate(next(c for c in CASES if c.name == "empty-control"))
    assert r["bsd"]["count"] == 0
    assert int(r["labels"].max()) == 0


def test_classical_floor_scores_and_glare_degrades_it():
    # a clean polydisperse case: DT-watershed recovers a non-trivial fraction of the bubbles
    poly = generate(next(c for c in CASES if c.name == "poly-normal"))
    ap_clean = mask_ap(watershed_dt(poly["image"]), poly["labels"])["ap"]
    assert ap_clean is not None and ap_clean > 0.2
    # the glare NEGATIVE control must break the classical method (AP collapses) - the honest failure
    glare = generate(next(c for c in CASES if c.name == "glare-storm"))
    ap_glare = mask_ap(watershed_dt(glare["image"]), glare["labels"])["ap"]
    assert ap_glare is not None and ap_glare < ap_clean * 0.6


def test_morphometry_returns_descriptors():
    poly = generate(next(c for c in CASES if c.name == "poly-normal"))
    props = morphometry(poly["labels"])
    assert len(props) > 20
    p = props[0]
    assert {"area", "d_eq", "ecc", "solidity"} <= set(p)
    assert 0.0 <= p["solidity"] <= 1.0
