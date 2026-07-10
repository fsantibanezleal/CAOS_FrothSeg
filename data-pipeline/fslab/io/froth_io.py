"""Froth artifact encoders: the standard on-disk formats a froth scene is committed in, so the web (and any
external consumer) reads real formats, never a bespoke blob.

  * frame.png    the froth image, 8-bit grayscale PNG (Pillow).
  * masks.json   the EXACT instance ground truth as COCO-style RLE (pycocotools.mask.encode). RLE is the
                 standard, compact instance-mask format; every eval toolkit (COCO, detectron2, mmdet) reads it.
  * bsd.csv      per-instance morphometry rows (id, area_px, d_eq_px, ecc, solidity) + a BSD summary header.

Determinism: encoders are pure functions of their array inputs; sha256 of each file goes in the manifest so a
re-run that changes a byte fails CONTRACT 2. No wall-clock, no RNG here.
"""
from __future__ import annotations

import csv
import hashlib
import io
from pathlib import Path

import numpy as np
from PIL import Image
from pycocotools import mask as coco_mask
from skimage import measure


def _u8(img: np.ndarray) -> np.ndarray:
    """Float [0,1] (or already-uint8) image -> uint8, clamped."""
    if img.dtype == np.uint8:
        return img
    return np.clip(np.rint(np.asarray(img, dtype=np.float64) * 255.0), 0, 255).astype(np.uint8)


def encode_png_bytes(img: np.ndarray) -> bytes:
    """8-bit grayscale PNG bytes for a float[0,1] or uint8 (H,W) image."""
    buf = io.BytesIO()
    Image.fromarray(_u8(img), mode="L").save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def write_png(path: str | Path, img: np.ndarray) -> int:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    data = encode_png_bytes(img)
    p.write_bytes(data)
    return len(data)


def masks_to_coco_rle(labels: np.ndarray) -> list[dict]:
    """Encode an int32 instance-label map to a list of COCO RLE records, one per instance (id>0).

    Each record: {id, size:[H,W], counts:str, area:int, bbox:[x,y,w,h]}. counts is the ASCII-compressed RLE
    string pycocotools emits (decoded to utf-8 so it is JSON-safe). Background (0) is not encoded.
    """
    h, w = labels.shape
    ids = [int(i) for i in np.unique(labels) if i > 0]
    out: list[dict] = []
    for i in ids:
        m = np.asfortranarray(labels == i, dtype=np.uint8)      # RLE needs Fortran order
        rle = coco_mask.encode(m)
        area = int(coco_mask.area(rle))
        x, y, bw, bh = (int(v) for v in coco_mask.toBbox(rle))
        out.append({
            "id": i,
            "size": [h, w],
            "counts": rle["counts"].decode("ascii"),
            "area": area,
            "bbox": [x, y, bw, bh],
        })
    return out


def coco_rle_to_labels(records: list[dict], h: int, w: int) -> np.ndarray:
    """Inverse of masks_to_coco_rle: rebuild the int32 instance map (used by the CONTRACT-2 round-trip check)."""
    lab = np.zeros((h, w), dtype=np.int32)
    for rec in records:
        rle = {"size": [h, w], "counts": rec["counts"].encode("ascii")}
        m = coco_mask.decode(rle).astype(bool)
        lab[m] = int(rec["id"])
    return lab


def write_masks_json(path: str | Path, case_id: str, labels: np.ndarray) -> tuple[int, int]:
    """Write the COCO-RLE instance masks file. Returns (byte_size, n_instances)."""
    from .formats import write_json
    h, w = labels.shape
    records = masks_to_coco_rle(labels)
    doc = {"schema": "frothseg.masks/v1", "case_id": case_id, "height": h, "width": w,
           "n_instances": len(records), "encoding": "coco-rle", "instances": records}
    return write_json(path, doc), len(records)


def _morphometry_rows(labels: np.ndarray) -> list[dict]:
    rows: list[dict] = []
    for p in measure.regionprops(labels):
        if p.area < 8:
            continue
        rows.append({
            "id": int(p.label),
            "area_px": int(p.area),
            "d_eq_px": round(float(p.equivalent_diameter_area), 3),
            "ecc": round(float(p.eccentricity), 4),
            "solidity": round(float(p.solidity), 4),
        })
    return rows


def write_bsd_csv(path: str | Path, labels: np.ndarray, bsd: dict) -> int:
    """Per-instance morphometry CSV (id, area_px, d_eq_px, ecc, solidity), with the BSD summary as a leading
    commented header so the file is self-describing. Returns byte size."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    rows = _morphometry_rows(labels)
    buf = io.StringIO()
    buf.write(f"# frothseg.bsd/v1 count={bsd.get('count')} d10={bsd.get('d10')} d50={bsd.get('d50')} "
              f"d90={bsd.get('d90')} d32={bsd.get('d32')} pctSmall={bsd.get('pctSmall')}\n")
    wtr = csv.DictWriter(buf, fieldnames=["id", "area_px", "d_eq_px", "ecc", "solidity"])
    wtr.writeheader()
    wtr.writerows(rows)
    data = buf.getvalue().encode("utf-8")
    p.write_bytes(data)
    return len(data)


def sha256_file(path: str | Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()
