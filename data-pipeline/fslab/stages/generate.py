"""Stage: generate · render one synthetic froth SCENE (image + EXACT instance ground truth) from a FrothSpec.

This is the harness that produces known-GT froth so segmenters can be scored with real mask metrics. The
geometry/appearance model (Laguerre power-diagram foam, exact-EDT Plateau borders, jittered specular highlights,
per-case stressors) lives in science/froth_gen.py and uses the proper CV stack (scipy.ndimage / OpenCV).
"""
from __future__ import annotations

import numpy as np

from ..cases.froth_cases import Case
from ..io.schema import FrothScene
from ..science.froth_gen import generate as _generate


def run(case: Case) -> FrothScene:
    r = _generate(case.spec)
    return FrothScene(
        case_id=case.id,
        image=np.asarray(r["image"], dtype=np.float32),
        labels=np.asarray(r["labels"], dtype=np.int32),
        bsd=r["bsd"],
        sites=np.asarray(r["sites"], dtype=np.float64),
    )
