"""FrothSeg science tests: the synthetic generator (benchmark harness) + the classical floor + scoring."""
import numpy as np

from fslab.science.froth_gen import CASES, generate
from fslab.science.segment import mask_ap, morphometry, watershed_dt


def test_generator_is_deterministic():
    a = generate(CASES[1])
    b = generate(CASES[1])
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


def test_classical_ladder_has_seven_methods_and_all_run():
    # the full C1..C7 classical ladder (plan section 1.1); each returns a labelled image on a real froth frame.
    from fslab.science.segment import METHODS
    assert set(METHODS) == {
        "otsu_cc", "watershed_immersion", "watershed_hmax",
        "watershed_dt", "watershed_hmin", "slic_merge", "valley_edge",
    }
    poly = generate(next(c for c in CASES if c.name == "poly-normal"))
    gray = poly["image"]
    for name, fn in METHODS.items():
        lab = fn(gray)
        assert lab.shape == gray.shape and lab.dtype.kind in "iu", name


def test_over_and_under_segmentation_exhibits_have_the_expected_sign():
    # C1 Otsu under-segments (far FEWER instances than GT); C2 immersion watershed over-segments (far MORE).
    import numpy as np
    from fslab.science.segment import otsu_cc, watershed_immersion, valley_edge, watershed_dt, mask_ap
    poly = generate(next(c for c in CASES if c.name == "poly-normal"))
    gray, gt = poly["image"], poly["labels"]
    n_gt = len(np.unique(gt)) - 1
    assert len(np.unique(otsu_cc(gray))) - 1 < n_gt * 0.5           # under-segments
    assert len(np.unique(watershed_immersion(gray))) - 1 > n_gt * 2  # over-segments
    # the domain-specific valley-edge (C7) and DT-watershed (C4) are the strong classical methods
    assert mask_ap(valley_edge(gray), gt)["ap"] > 0.25
    assert mask_ap(watershed_dt(gray), gt)["ap"] > 0.25


def test_panoptic_quality_decomposition():
    # PQ = SQ x RQ in [0,1]; a good method has PQ well above the under/over-segmenting baselines.
    from fslab.science.segment import panoptic_quality, watershed_dt, otsu_cc, watershed_immersion
    poly = generate(next(c for c in CASES if c.name == "poly-normal"))
    gray, gt = poly["image"], poly["labels"]
    pq = panoptic_quality(watershed_dt(gray), gt)
    assert 0.0 <= pq["pq"] <= 1.0 and 0.0 <= pq["sq"] <= 1.0 and 0.0 <= pq["rq"] <= 1.0
    assert abs(pq["pq"] - pq["sq"] * pq["rq"]) < 2e-3   # PQ = SQ x RQ (within the 3-decimal rounding)
    assert pq["pq"] > panoptic_quality(otsu_cc(gray), gt)["pq"]            # beats under-seg
    assert pq["pq"] > panoptic_quality(watershed_immersion(gray), gt)["pq"] # beats over-seg
    assert panoptic_quality(otsu_cc(gray), gt)["merges"] > 0               # Otsu merges bubbles
