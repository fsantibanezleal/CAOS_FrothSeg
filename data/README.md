# data/ · the data contract + layout

This folder is governed by the **two data contracts** of ADR-0057, instantiated for FrothSeg (flotation-froth
bubble segmentation). The synthetic cases here are the mask-metric BENCHMARK harness (the only source of exact
per-bubble ground truth); the product's real capability is live SAM-class segmentation of REAL (uploaded) froth.

## Layout

| Path | What | Git |
|---|---|---|
| `raw/` | private/large source frames (e.g. requested real froth datasets) | **git-ignored** (never committed) |
| `examples/` | a tiny froth frame that PASSES Contract 1 (`froth_sample.png`, clone-verify) | committed |
| `derived/synth/<case>/` | the compact per-case artifacts the web loads (frame.png · masks.json · bsd.csv · benchmark.json · card.json) | committed |
| `derived/manifests/` | per-case `<case>.json` (Contract 2) + the flat `index.json` inventory | committed |
| `demo/` | small deterministic payload for smoke | committed |

## CONTRACT 1 · ingestion (raw froth image → pipeline) · the *bring-your-own-froth* gate

Defined in `data-pipeline/fslab/io/contract.py` (`validate_image`). A froth frame is **accepted** iff it is a
real, usable image; **rejected** with a reason otherwise (never silently coerced); usable-but-degraded frames are
**flagged** (accepted, warning recorded) so the UI warns and the OpenCV deglare/illumination-flatten front-end
can kick in. The browser mirrors these thresholds in TypeScript so a bad upload is rejected before a SAM inference.

| Check | Rule | Verdict |
|---|---|---|
| shape | 2D grayscale or 3D RGB[A] | else reject |
| dtype | numeric, finite (no NaN/Inf) | else reject |
| size | min side ≥ 64 px, max side ≤ 8192 px | else reject |
| contrast | dynamic range (p99−p01) ≥ 0.06 | else reject (blank/flat frame) |
| low contrast | 0.06 ≤ dynamic range < 0.15 | **flag** (deglare/flatten recommended) |
| glare | > 20% near-saturated pixels | **flag** (heavy glare) |
| under-exposure | > 55% near-black pixels | **flag** (mostly pulp, not froth) |

## CONTRACT 2 · artifact (pipeline → web)

Each pipeline run writes, under `derived/synth/<case>/`: `frame.png` (8-bit grayscale froth image), `masks.json`
(the EXACT instance ground truth as COCO-RLE, schema `frothseg.masks/v1`), `bsd.csv` (per-instance morphometry +
BSD summary), `benchmark.json` (classical-floor method scores: mask AP + BSD Wasserstein), and `card.json` (the
compact web selector card). The authoritative record is `derived/manifests/<case>.json` (schema
`frothseg.manifest/v1`) recording the generator spec + seed, each artifact's byte size AND **sha256**, the BSD
summary, the benchmark, and the **lane/gate** verdict. `scripts/check_artifacts.py` re-verifies every sha256 in
CI so a code change that silently alters an artifact fails. `frontend/src/lib/contract.types.ts` mirrors these
schemas so any drift fails the web build. The web loads ONLY these committed artifacts for the baked benchmark;
live segmentation of an uploaded frame runs in the browser (onnxruntime-web + WebGPU), not here.

## Provenance / license

The committed cases are **synthetic** (Laguerre power-diagram foam generator, `data-pipeline/fslab/science/
froth_gen.py`): physically-flavoured froth whose instance masks are known exactly, the sole way to score a
segmenter with real mask metrics without hand-labelled froth. Synthetic mask AP is **not** real-plant AP and is
labelled synthetic everywhere. Public per-bubble froth ground truth is legally request-only (see
`wip/.../frothseg/research-tools-and-data-2026-07-09.md` in the management repo); real froth enters the product
only through the user-upload lane, never redistributed here.
