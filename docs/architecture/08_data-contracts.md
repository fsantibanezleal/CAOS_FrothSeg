# The two data contracts

A product is only real if data flows through two enforced contracts. Both are CI-checked. CONTRACT 1 is what lets
a third party point the tool at THEIR froth; CONTRACT 2 is what keeps the web from drifting away from what the
pipeline produced.

## CONTRACT 1: ingestion (raw froth image to pipeline), the bring-your-own-froth gate

`data-pipeline/fslab/io/contract.py :: validate_image`. A froth frame (uploaded by a user or read from a folder)
is ACCEPTED iff it is a real, usable image. Unusable frames are REJECTED with a reason, never silently coerced.
Usable-but-degraded frames are ACCEPTED but FLAGGED, and the flag is recorded so the UI can warn and the OpenCV
deglare and illumination-flatten front-end can engage. The check is pure and deterministic (it inspects a numpy
array, no I/O), and it never raises on a bad image, it reports.

| Check | Rule | Verdict |
|---|---|---|
| shape | 2D grayscale or 3D RGB[A] (channels in {1,3,4}) | else reject |
| dtype | numeric, finite (no NaN/Inf after luma conversion) | else reject |
| size | min side at least `MIN_SIDE = 64` px, max side at most `MAX_SIDE = 8192` px | else reject |
| contrast | dynamic range (p99 minus p01) at least `DYN_RANGE_MIN = 0.06` | else reject (blank/flat frame) |
| low contrast | dynamic range in [0.06, `DYN_RANGE_FLAG = 0.15`) | flag (deglare/flatten recommended) |
| glare | more than `SAT_FRAC_FLAG = 20%` near-saturated (>0.97) pixels | flag (heavy glare) |
| under-exposure | more than `DARK_FRAC_FLAG = 55%` near-black (<0.03) pixels | flag (mostly pulp, not froth) |

`image_stats` computes the descriptive stats (height, width, channels, dtype, dynamic range, saturated fraction,
dark fraction) and the flag list; `validate_image` adds the accept/reject decision and returns an
`ImageContractReport`. RGB is reduced to grayscale by Rec.601 luma, and integer images are normalised to `[0,1]`
before the stats.

**The browser mirrors it.** `frontend/src/lib/imageGate.ts` reimplements the same thresholds and logic in
TypeScript on a row-major grayscale `Float32Array`, so a bad upload is rejected before a SAM inference is spent
and the glare or low-contrast flags drive the deglare front-end. Keeping the two in lock-step is deliberate: the
same rule decides ingestion offline and in the browser.

The offline all-cases pipeline does not run this gate, because synthetic scenes are ground truth by construction;
`stages/ingest.py` exists precisely so the product can validate a REAL frame the same way the browser does. The
full table is also in [`data/README.md`](../../data/README.md).

## CONTRACT 2: artifact (pipeline to web)

`data-pipeline/fslab/io/froth_io.py` (encoders) and `data-pipeline/fslab/core/manifest.py` (the record). Each
pipeline run encodes a scene into standard on-disk formats, never a bespoke blob, and records an authoritative
manifest.

Per case, under `data/derived/synth/<case>/`:

- `frame.png`: 8-bit grayscale PNG of the froth image (Pillow).
- `masks.json`: the EXACT instance ground truth as COCO-style RLE (`pycocotools.mask.encode`), schema
  `frothseg.masks/v1`. RLE is the standard compact instance-mask format every eval toolkit reads; a round-trip
  decoder (`coco_rle_to_labels`) rebuilds the label map for the consistency check.
- `bsd.csv`: per-instance morphometry rows (id, area, equivalent diameter, eccentricity, solidity) with the BSD
  summary as a self-describing commented header, written with LF line endings so the committed bytes and sha256
  are identical on Windows and Linux CI.
- `benchmark.json`: the classical-floor method scores (mask AP plus BSD Wasserstein).
- `card.json`: the compact web selector card.

The authoritative record is `data/derived/manifests/<case>.json` (schema `frothseg.manifest/v1`, generator
`laguerre-power-diagram/v1`): the generator spec and seed, each artifact's `path`, `format`, byte size AND
`sha256`, the BSD summary, the benchmark scores, and the lane/gate verdict. The manifest is a pure function of
`(spec, seed)`, with no wall-clock, so a re-run does not dirty git. A flat `manifests/index.json` inventories
every case.

**Enforcement.**

- `frontend/src/lib/contract.types.ts` mirrors these schemas; a drift there fails `tsc`, so the web cannot ship
  reading a shape the pipeline does not produce.
- `scripts/check_artifacts.py` (run in `ci.yml`, stdlib only) walks index to manifests to artifacts and verifies
  each artifact exists, is non-empty, matches the recorded byte size AND sha256, that `manifest.lane` equals the
  gate verdict, and that `masks.json`'s instance count agrees with the manifest. Any drift exits non-zero.
- `python -m fslab.pipeline --check` is a lighter self-check: it regenerates each case and confirms the committed
  `frame.png` sha256 and the masks instance count still match.

The web loads ONLY these committed artifacts for the baked benchmark and the synthetic samples; it never
recomputes them. Live segmentation of an uploaded frame runs in the browser (`frontend/src/sam`, onnxruntime-web
with WebGPU), not here.

**One recorded result sits outside CONTRACT 2.** `data/derived/sam_benchmark.json` (schema
`frothseg.sam_benchmark/v1`) is the offline SAM-vs-floor sweep. Because the SAM run is model-dependent, it is a
RECORDED experiment result written once by `scripts/bake_sam_benchmark.py`, not a sha-checked deterministic
artifact. Its numbers are transcribed in [model evaluation](06_model-evaluation.md).

## Why this matters

Without CONTRACT 1 the app cannot be applied to new froth: it would be a demo that only replays baked cases. Without
CONTRACT 2 the web could silently drift from what the pipeline produced. The two contracts are the seam that makes
FrothSeg a tool, not a slideshow.
