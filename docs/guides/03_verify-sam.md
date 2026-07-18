# Guide, verify the live SAM core offline

This is how the product's value is measured, not asserted. The live segmenter is a SAM-class foundation model
(`frontend/src/sam/`). This harness runs the same module in Node over synthetic froth with exact ground truth,
scores it with the same metrics the classical floor is scored with, and bakes the result into a committed
artifact the web reads. Because the segmenter code is identical in the browser and in Node, the number you verify
here is the number the App produces.

## What this is, and what it is not

- It **is** an honest, reproducible measurement: the live core runs against exact GT and is compared to the tuned
  classical floor on identical metrics (mask AP, BSD Wasserstein).
- It is **not** real-plant accuracy. It scores against synthetic ground truth (labelled synthetic everywhere).
  The negative controls (`glare-storm`, `motion-fast`, `defocus`) are exactly where methods are supposed to fail.
- It is **not** a CONTRACT-2 artifact. The SAM run is model-dependent (weights, backend), so the baked benchmark
  is a recorded experiment result, written once and committed, not a sha256-checked regenerate-and-compare
  artifact like the pipeline's `frame.png`.

## The three steps

The loop is: generate the exact GT (the pipeline), run the live core over it in Node, score it against the
floor, then bake the summary.

### 1. Run the live segmenter in Node

`frontend/scripts/verify_sam.ts` imports `FrothSegmenter` from `frontend/src/sam/autoMask.ts`, the exact module
the browser uses, and runs it on onnxruntime-node over the committed synthetic frames. It dumps the predicted
instance-label map (plus the BSD and timings) to the gitignored `verification/sam/<case>.json`.

```bash
# from frontend/
npx tsx scripts/verify_sam.ts mono-clean poly-normal fine-froth coarse-froth glare-storm \
  watery motion-fast defocus high-load low-light-noise bursting edge-framing empty-control --grid 32
```

Arguments are case ids (default `poly-normal`); `--grid N` sets the point-grid density (default 32, so 1024
prompts); `--model <hf-id>` swaps the model (default `Xenova/slimsam-77-uniform`). It reads
`data/derived/synth/<case>/frame.png`, so run the pipeline first ([01_precompute-pipeline.md](01_precompute-pipeline.md)).

### 2. Score SAM vs the floor

`scripts/score_sam.py` reads each dump, regenerates the exact GT, and scores it with
`fslab.science.segment.mask_ap` + `bsd_wasserstein`, the same functions the classical floor uses, then prints a
SAM-vs-floor table.

```bash
PYTHONPATH=data-pipeline .venv-pipeline/Scripts/python.exe scripts/score_sam.py   # Windows
PYTHONPATH=data-pipeline .venv-pipeline/bin/python        scripts/score_sam.py    # bash
```

### 3. Bake the committed benchmark

`scripts/bake_sam_benchmark.py` writes `data/derived/sam_benchmark.json` (schema `frothseg.sam_benchmark/v1`),
the artifact the web Experiments + Benchmark pages load.

```bash
PYTHONPATH=data-pipeline .venv-pipeline/Scripts/python.exe scripts/bake_sam_benchmark.py
```

It records, per case: `sam_ap`, `sam_ap50`, `sam_bsd_w`, `sam_n`, `gt_n`, `sam_d32`, `gt_d32`, the floor method +
its AP, timings, and device; plus a summary (mean SAM AP, mean floor AP, delta, SAM wins), the model id, and the
grid.

## The measured result

Model `Xenova/slimsam-77-uniform`, grid 32x32 (1024 prompts), onnxruntime-node CPU, scored vs exact synthetic GT
with the same `mask_ap` the classical floor uses. Transcribed from `data/derived/sam_benchmark.json`:

| case | SAM AP | SAM AP50 | floor AP | floor method | SAM n | GT n | SAM d32 | GT d32 | BSD-W |
|---|---|---|---|---|---|---|---|---|---|
| mono-clean | **0.741** | 0.974 | 0.329 | watershed_dt | 113 | 114 | 27.04 | 28.41 | 1.39 |
| coarse-froth | **0.651** | 0.861 | 0.394 | watershed_dt | 79 | 68 | 37.8 | 39.51 | 2.948 |
| poly-normal | **0.457** | 0.747 | 0.401 | watershed_dt | 212 | 197 | 22.29 | 22.96 | 0.501 |
| bursting | **0.449** | 0.756 | 0.361 | watershed_dt | 147 | 148 | 26.68 | 26.0 | 0.578 |
| high-load | **0.42** | 0.75 | 0.415 | watershed_dt | 245 | 231 | 20.76 | 21.04 | 0.474 |
| edge-framing | **0.412** | 0.777 | 0.309 | watershed_dt | 261 | 274 | 19.16 | 19.27 | 0.318 |
| glare-storm | **0.407** | 0.717 | 0.081 | watershed_dt | 179 | 197 | 23.9 | 21.96 | 0.5 |
| fine-froth | **0.335** | 0.692 | 0.266 | watershed_dt | 446 | 593 | 12.77 | 12.92 | 0.377 |
| low-light-noise | **0.302** | 0.633 | 0.263 | watershed_dt | 142 | 196 | 21.97 | 22.55 | 0.673 |
| watery | **0.172** | 0.287 | 0.155 | watershed_dt | 128 | 231 | 21.92 | 21.25 | 1.686 |
| defocus | 0.016 | 0.056 | **0.066** | watershed_dt | 37 | 170 | 17.73 | 28.46 | 5.428 |
| motion-fast | 0.016 | 0.052 | **0.104** | watershed_dt | 25 | 197 | 16.37 | 23.95 | 3.622 |
| empty-control | n/a | n/a | n/a | n/a | 0 | 0 | n/a | n/a | n/a |
| **mean** | **0.365** | | **0.262** | | | | | | |

Summary: mean SAM AP **0.365** vs floor **0.262**, delta **+0.103**, SAM wins **10/13**.

The story the numbers tell:

- SAM beats the tuned classical floor on average and wins the clean, coarse, nominal, and stressed-but-structured
  cases outright.
- The win that matters operationally is `glare-storm`: **0.407 vs 0.081**. Under a saturated glare lobe the
  highlight/distance-transform watershed collapses, which is the realistic froth-camera failure mode; the
  zero-shot foundation model degrades gracefully instead.
- The floor stays complementary on `motion-fast` and `defocus`, where the blur removes the promptable structure
  and SAM's confident-mask count drops (25 and 37 masks against ~170-200 true bubbles). This is honest: the App
  offers both methods for exactly this reason.
- `empty-control` yields 0 bubbles and a `null` AP for both, the correct behaviour on a no-froth frame.

Timing: the encoder runs once (~1 s on Node CPU) and the full 1024-prompt sweep is ~24 to 31 s per case on CPU;
the browser WebGPU path is far faster (SAM2 / MobileSAM WebGPU demos run interactively).

## The maths (same as the floor)

The auto-mask generator keeps a candidate mask only if its stability is high, where stability is the IoU of the
logit mask thresholded at $+\delta$ and $-\delta$,

$$\mathrm{stability} = \frac{\bigl|\{\ell(p) > +\delta\}\bigr|}{\bigl|\{\ell(p) > -\delta\}\bigr|}, \qquad \delta = 1.0.$$

Scoring is the identical COCO-style mask AP and the BSD Wasserstein-1 distance the pipeline uses, so SAM and the
floor are directly comparable,

$$\mathrm{AP} = \frac{1}{|\mathcal{T}|}\sum_{t \in \mathcal{T}} \frac{\mathrm{TP}(t)}{\mathrm{TP}(t) + \mathrm{FP}(t) + \mathrm{FN}(t)}, \quad \mathcal{T} = \{0.5, \dots, 0.95\}, \qquad W_1(P, Q) = \int_{-\infty}^{\infty} \bigl| F_P(x) - F_Q(x) \bigr|\, dx.$$

## Why the shared-module design matters

`verify_sam.ts` does not re-implement the segmenter; it imports the browser's `autoMask.ts`. The types
(`frontend/src/sam/types.ts`) depend only on `@huggingface/transformers` + typed arrays, never on the DOM, so the
exact same code path runs in Node (onnxruntime-node) and in the browser (onnxruntime-web + WebGPU). That closes
the usual gap where an offline benchmark measures a different implementation than the one shipped: here the
measured core and the shipped core are the same file.

## Honesty caveats (carried into the App About / Methods)

- Synthetic mask AP is not real-plant AP; it is a controlled harness with exact GT.
- The generator is not tuned to favour SAM: the defaults are the standard SAM auto-generation values, and the
  glare/blur negative controls are where methods are supposed to fail.
- The predicted-IoU, stability, and grid thresholds are exposed as live controls in the App, so the recall vs
  precision tradeoff (visible as the low mask counts on blurred cases) is user-inspectable.

## Applying this to other data or other models

- **Other model:** pass `--model <hf-id>` (for example a MobileSAM export) to `verify_sam.ts`, re-run steps 2-3,
  and you get a fresh baked benchmark for that model. The module is model-agnostic; the default is documented in
  `autoMask.ts` (`DEFAULT_MODEL`).
- **Other regime:** add a `FrothSpec` case to the pipeline (exact GT), re-run the pipeline, then re-run this
  harness on the new case.
- **Real (uploaded) froth:** there is no GT, so there is no AP; use the live App upload lane
  ([02_bring-your-own-data.md](02_bring-your-own-data.md)). This harness exists precisely because real froth
  cannot be scored, so the synthetic set carries the measurement.
