# Framework card, `pycocotools`

pycocotools encodes the exact synthetic instance ground truth into the standard COCO run-length (RLE) mask format
(`masks.json`), so the committed masks are read by every eval toolkit (COCO, detectron2, mmdet) and, crucially, by
the browser. The web app decodes those same RLE strings with a line-for-line TypeScript port
(`frontend/src/lib/rle.ts`), so "SAM vs ground truth" is overlaid on the real committed masks, not an approximation.
It is a precompute-lane library on the Python side; the TS decoder is its browser counterpart.

Code of record: `data-pipeline/fslab/io/froth_io.py` (`masks_to_coco_rle`, `coco_rle_to_labels`,
`write_masks_json`) and `frontend/src/lib/rle.ts` (`countsFromString`, `decodeInstance`, `decodeLabels`).

## What and why

pycocotools is the reference implementation of the COCO instance-mask format and its AP protocol. FrothSeg uses:

- **`pycocotools.mask.encode`** to turn each int32 instance into a compact ASCII RLE string (`counts`), plus
  `mask.area` and `mask.toBbox` for the per-instance area and bounding box. This is what `masks.json` stores.
- **`pycocotools.mask.decode`** for the Python-side round-trip check (`coco_rle_to_labels`) that CONTRACT-2 uses to
  prove the committed masks rebuild the exact instance map byte-for-byte.

Why the COCO RLE format rather than a bespoke label PNG: RLE is the lingua franca of instance segmentation. Storing
the ground truth as COCO RLE means the masks are portable to any standard evaluator, the file is small (run-length
compressed, column-major), and the same bytes decode identically in Python and in the browser. The mask AP
protocol used to score every method (`segment.mask_ap`) is the COCO AP@[.5:.05:.95] definition.

## What it is not

- It does not run in the browser. pycocotools is a C-extension Python package; the browser uses the pure-TS decode
  port `rle.ts`, which mirrors pycocotools' `maskApi.c` (`rleFrString` + `rleDecode`) exactly.
- It is not the source of the masks. The masks come from the Laguerre generator's exact label map; pycocotools only
  encodes that known ground truth into the transport format. There is no model inference here.
- It is not used for the live SAM masks' storage. The live masks are produced in-browser and compared against the
  decoded GT; only the synthetic ground truth is committed as RLE.

## Theory and equations

**Run-length encoding (COCO).** A binary mask is flattened in column-major (Fortran) order and stored as the
sequence of alternating run lengths, starting with a background run: `counts = [bg0, fg0, bg1, fg1, ...]`. COCO then
delta-encodes and ASCII-compresses those integers into the `counts` string. Decoding walks the runs and toggles
foreground/background, mapping the column-major linear index back to `(y, x)`.

**Instance IoU and mask AP.** Segmentation quality is the intersection-over-union of predicted and ground-truth
instance masks:

$$ \mathrm{IoU}(A, B) = \frac{\lvert A \cap B \rvert}{\lvert A \cup B \rvert} $$

Predicted and GT instances are matched greedily by descending IoU; a match above threshold $t$ is a true positive.
The average precision at threshold $t$ (the count form used by `segment.mask_ap`) and the COCO summary AP averaged
over the IoU sweep are:

$$ \mathrm{AP}(t) = \frac{\mathrm{TP}(t)}{\mathrm{TP}(t) + \mathrm{FP}(t) + \mathrm{FN}(t)}, \qquad
   \mathrm{AP} = \frac{1}{\lvert \mathcal{T} \rvert} \sum_{t \in \mathcal{T}} \mathrm{AP}(t), \quad
   \mathcal{T} = \{0.5, 0.55, \dots, 0.95\} $$

This is the exact protocol behind every number in the benchmark: SAM mean AP 0.365 vs the classical floor 0.262
over the 13 cases (the committed `data/derived/sam_benchmark.json`), both computed on the decoded RLE ground truth.

## Install (exact, verified)

Pinned in `data-pipeline/requirements.txt`, verified on Python 3.12/3.13 (2026-07-10):

```
pycocotools==2.0.11
```

```bash
pip install pycocotools==2.0.11        # into the .venv-pipeline
```

pycocotools builds a small C extension, so a C compiler and numpy headers must be present at install time (numpy is
pinned in the same file). On Windows this means the MSVC build tools; on Linux CI, `build-essential`. The browser
needs nothing; `rle.ts` is dependency-free TypeScript.

## Usage

Encode the exact instance ground truth to COCO RLE (from `froth_io.py`):

```python
import numpy as np
from pycocotools import mask as coco_mask

def masks_to_coco_rle(labels: np.ndarray) -> list[dict]:
    h, w = labels.shape
    out = []
    for i in (int(i) for i in np.unique(labels) if i > 0):
        m = np.asfortranarray(labels == i, dtype=np.uint8)   # RLE needs Fortran (column-major) order
        rle = coco_mask.encode(m)
        out.append({
            "id": i, "size": [h, w],
            "counts": rle["counts"].decode("ascii"),          # JSON-safe string
            "area": int(coco_mask.area(rle)),
            "bbox": [int(v) for v in coco_mask.toBbox(rle)],
        })
    return out
```

Decode the same strings in the browser (from `rle.ts`, a port of pycocotools `maskApi.c`):

```ts
export function decodeInstance(inst: MaskInstance): Uint8Array {
  const [h, w] = inst.size;
  const runs = countsFromString(inst.counts);   // ASCII -> run lengths (delta-decoded)
  const out = new Uint8Array(h * w);
  let idx = 0, v = 0;                            // column-major linear index
  for (const run of runs) {
    for (let i = 0; i < run; i++) {
      if (v) { const y = idx % h, x = Math.floor(idx / h); out[y * w + x] = 1; }  // col-major -> row-major
      idx++;
    }
    v ^= 1;
  }
  return out;
}
```

## Applying it here

- **Stage `export` / IO** (`write_masks_json`): writes `masks.json` = `{schema, case_id, height, width,
  n_instances, encoding:"coco-rle", instances:[...]}`. **Input**: the int32 ground-truth label map. **Output**: the
  committed RLE document, with the byte size and instance count returned for the manifest.
- **CONTRACT-2 round-trip** (`coco_rle_to_labels`): decodes the committed RLE back to an int32 map and checks it
  matches the source, so a single changed byte fails the gate. The masks are therefore provably lossless.
- **Browser overlay** (`rle.ts` `decodeLabels`): decodes `masks.json` into an int32 label map to draw the exact GT
  under the live SAM masks in the App/Experiments. Because the decoder is a faithful port of pycocotools, it
  recovers the same instances (same count) and therefore the same Sauter mean d32 as the Python encode, which is the
  cross-language guarantee the "SAM vs GT" comparison rests on.

## Applying it to other data

- **COCO RLE is the portable instance-mask format for any dataset**: swap the froth labels for cells, parts,
  defects, or any int32 instance map and `masks_to_coco_rle` produces a `masks.json` that detectron2, mmdet, or the
  COCO API can read directly. The `mask_ap` scorer is likewise domain-agnostic (any two label maps in).
- **The TS decoder is reusable as-is**: any web app that needs to overlay COCO RLE ground truth (or model output
  serialised as RLE) in the browser can lift `rle.ts`; it depends only on the `size`/`counts` fields.
- **The AP protocol** (IoU matching over the .5:.05:.95 sweep) is the standard instance-segmentation metric; use it
  whenever you need a single comparable quality number across methods, not just for froth.

## Data contract and outliers

- **Fortran order is mandatory on encode**: `coco_mask.encode` expects a column-major (`np.asfortranarray`) uint8
  mask; a C-ordered array silently produces a transposed RLE. The decoder likewise walks column-major indices, so
  the two must agree, and they do (both follow `maskApi.c`).
- **counts is ASCII, not raw bytes**: the Python side stores `rle["counts"].decode("ascii")`; the TS side reads
  each character as `charCodeAt - 48`. Keep the string ASCII and do not re-encode it (no UTF-8 BOM, no CRLF), which
  is why `masks.json` is written as compact LF-normalised JSON for a stable sha256.
- **Background is not stored**: only instances with id > 0 are encoded; a frame with zero bubbles (empty control)
  yields `n_instances = 0` and an empty `instances` list, which the decoder handles as an all-background map.
- **Overlap on paint**: `decodeLabels` writes each instance's id into the label map; if two committed masks
  overlapped, the last one wins for the shared pixels. The synthetic ground truth is a partition (disjoint Laguerre
  cells), so there is no overlap; for real overlapping annotations, paint order would matter.
- **d32 match depends on exact decode**: the browser d32 equals the Python d32 only because the decode is exact. Do
  not substitute an approximate or downsampled RLE decode; it would shift the instance areas and the reported d32.

## Caveats and license

- **License**: pycocotools is BSD-2-Clause (COCO/FAIR), freely redistributable. It is a precompute/build
  dependency; the browser ships the dependency-free TS port instead.
- **Build requirement**: the C extension needs a compiler at install time; this is the one framework here with a
  non-trivial build step, hence the note above about MSVC / build-essential.
- **Format faithfulness**: `rle.ts` is a direct port of pycocotools' `rleFrString` + `rleDecode`; keep the two in
  lockstep. If pycocotools ever changed its `counts` encoding, the port would need the matching update, and the
  CONTRACT-2 round-trip plus the browser overlay would catch a divergence immediately.

## References

`lin2014coco` (Microsoft COCO: the RLE mask format and the AP@[.5:.05:.95] protocol). The BSD summaries the decoded
masks feed are on the `03_scikit-image` and `04_scipy` cards. All ids resolve from
`frontend/src/data/citations.ts`.
