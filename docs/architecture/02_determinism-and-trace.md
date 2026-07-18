# Determinism + the committed artifacts

## The synthetic scene is a pure function of `(spec, seed)`

A benchmark case is fully determined by its `FrothSpec` and seed. All randomness comes from a seeded numpy
`Generator` made in one place (`core/rng.py :: make_rng(seed)`, `numpy.random.default_rng`), never a global or
implicit RNG. `science/froth_gen.py` seeds geometry from `spec.seed` and appearance from `spec.seed + 1`, so the
same `(spec, seed)` produces a **byte-identical** frame, masks, and BSD on any machine. This is what lets the
committed artifact be a trustworthy source-of-truth the SPA merely replays (ADR-0054).

The geometry itself is deterministic maths. Bubble centres are packed by random sequential adsorption with
log-normal radii whose scale is chosen so the target Sauter mean is hit,

$$\mu = \ln d_{32} - \tfrac{5}{2}\,\sigma_{\ln}^2, \qquad d \sim \text{Lognormal}(\mu,\sigma_{\ln}),$$

and each pixel is assigned to the **Laguerre (power) diagram** cell of minimum power distance,

$$\ell(p) = \arg\min_i \big( \lVert p - c_i \rVert^2 - r_i^2 \big),$$

the standard dry-foam tessellation (Aurenhammer 1987; Weaire & Hutzler 1999). The ground-truth BSD is read back
from the rendered instance areas with the equivalent diameter and the Sauter mean,

$$d_{eq} = 2\sqrt{A/\pi}, \qquad d_{32} = \frac{\sum_i d_i^3}{\sum_i d_i^2}.$$

## The committed artifacts (CONTRACT 2)

Per case, `stages/export.py` writes, under `data/derived/synth/<case>/`:

| File | Format | Content |
|---|---|---|
| `frame.png` | 8-bit grayscale PNG (Pillow) | the rendered froth image |
| `masks.json` | COCO-RLE (`pycocotools.mask.encode`) | the exact per-bubble instance ground truth; one record per instance with `counts`, `area`, `bbox` |
| `bsd.csv` | CSV + commented header | per-instance morphometry rows (`id, area_px, d_eq_px, ecc, solidity`) with the BSD summary in the header line |
| `benchmark.json` | JSON | the classical-floor scores (mask AP, AP50, AP75, BSD Wasserstein) per method |
| `card.json` | JSON | the compact web selector card (`core/trace.py :: build_card`) |

The authoritative record is `manifests/<case>.json` (`core/manifest.py`, schema `frothseg.manifest/v1`): the
generator id + spec + seed, an artifact pointer for each file with its **byte size and sha256**, the BSD ground
truth, the classical benchmark, and the lane/gate verdict. A flat `manifests/index.json` inventories every case.
`frontend/src/lib/contract.types.ts` mirrors this schema so a drift fails `tsc`.

The manifest deliberately stores **no wall-clock**: a run must be a pure function of `(spec, seed)`, and a
timestamp would dirty git on every re-run. `python -m fslab.pipeline --check` regenerates each case and asserts
the committed sha256 (and instance count) still match; CI runs it, so a code change that silently alters an
artifact fails.

## Why the SAM live run is model-dependent, and recorded once

The classical floor is byte-reproducible, so it lives inside CONTRACT 2. The SAM-class live segmenter is not.
Its output depends on model weights fetched from the HF Hub at runtime and on device- and backend-specific
floating point (WebGPU vs WASM vs onnxruntime-node), so it is **not** a pure function of `(spec, seed)` and
cannot be sha-pinned. It is therefore a **recorded experiment result**, not a CONTRACT-2 artifact:
`frontend/scripts/verify_sam.ts` runs the exact `frontend/src/sam` module in Node and dumps per-case labels,
then `scripts/bake_sam_benchmark.py` regenerates the ground truth and scores those labels with the same
`fslab.science.segment.mask_ap` and `bsd_wasserstein` the floor uses, writing `data/derived/sam_benchmark.json`
(schema `frothseg.sam_benchmark/v1`) once. That committed record holds the verified numbers the Experiments and
Benchmark pages transcribe: mean SAM AP 0.365 vs floor 0.262 across 13 cases, SAM winning 10 of 13. It is
labelled synthetic and is not claimed as real-plant accuracy.
