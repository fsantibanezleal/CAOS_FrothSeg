"""Stage: ingest — apply CONTRACT 1 (the froth-image gate) to a raw frame. The bring-your-own-froth entry point.

Reads an image file (or takes an array) and returns an ImageContractReport (accepted + stats + flags, or a
reject reason). The offline pipeline runs on synthetic scenes that are GT by construction, so it does not need
this; it exists so the product can validate a REAL uploaded frame before spending a SAM inference, with the same
thresholds the browser mirrors in TypeScript.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

from ..io.contract import ImageContractReport, validate_image


def run_array(arr: np.ndarray) -> ImageContractReport:
    return validate_image(arr)


def run(image_path: str | Path) -> ImageContractReport:
    with Image.open(image_path) as im:
        arr = np.asarray(im)
    return validate_image(arr)
