# The live lane: SAM in the browser

FrothSeg's flagship live capability is a **SAM-family foundation model running client-side**, not Pyodide
recompute. `frontend/src/sam/` is one portable TypeScript module (`autoMask.ts`, `morphometry.ts`, `score.ts`,
`frothState.ts`, `types.ts`) that depends only on `@huggingface/transformers` and typed arrays, never the DOM, so
the same code runs in the browser (onnxruntime-web) and in Node (onnxruntime-node) for the offline verification.
It segments the shipped froth frame or a user upload with no froth training labels (zero-shot).

## The device path: WebGPU, with a single-threaded WASM fallback

`FrothSegmenter.load('auto')` **probes for a real GPU adapter before committing to WebGPU**. Loading with a
device that has no adapter succeeds but then fails at inference, so `pickDevice()` calls
`navigator.gpu.requestAdapter()` and only returns `'webgpu'` when an adapter is actually obtainable; otherwise it
falls back to the WASM backend in the browser (and lets onnxruntime-node pick CPU in Node). There is a further
retry: if a non-WASM device fails to load, it reloads on WASM, which is always available in the browser.

The WASM backend is forced **single-threaded** (`env.backends.onnx.wasm.numThreads = 1`). The multi-threaded WASM
backend needs `SharedArrayBuffer`, which requires cross-origin isolation (COOP/COEP response headers) that a
static host like GitHub Pages cannot set; without them the threaded backend stalls. Single-threaded is slower but
works everywhere. WebGPU, when present, is the fast path and needs no `SharedArrayBuffer` either. This is why the
[deploy is Pages-first](01_overview.md) yet still ships a real foundation model. (ONNX Runtime Web; WebGPU, W3C.)

## The automatic mask generator

The algorithm is the standard `SamAutomaticMaskGenerator` (Kirillov et al. 2023, SAM, DOI
10.1109/ICCV51070.2023.00371), reimplemented in `autoMask.ts`:

1. **Encode once.** The image is passed through the SAM encoder a single time; the resulting embeddings are
   reused for every prompt, which is what makes a dense grid affordable.
2. **Point grid.** A regular `gridSize x gridSize` grid of foreground point prompts (default 32, so 1024 points),
   inset from the border by `cropMarginFrac`. Points are decoded in batches (`pointBatch`, default 64) so the UI
   can report progress.
3. **Best of three.** SAM's multimask head returns three candidate masks per point; the one with the highest
   predicted IoU is kept, and dropped if that predicted IoU is below `predIouThresh` (0.86).
4. **Stability filter.** The chosen mask is scored by SAM's stability metric, the IoU of the logit mask
   thresholded at a high vs a low offset (the high set is a subset of the low set):

   $$s = \frac{\lvert \{ x : \ell(x) > +\delta \} \rvert}{\lvert \{ x : \ell(x) > -\delta \} \rvert},$$

   with $\delta$ = `stabilityOffset` (1.0). Masks below `stabilityThresh` (0.90) are dropped.
5. **Upscale and measure.** The logit mask is bilinearly upscaled to the original resolution, thresholded at 0,
   and its area/bbox measured; specks (`minAreaPx`, 25) and near-whole-frame blobs (`maxAreaFrac`, 0.5) are
   dropped.
6. **Greedy IoU NMS.** Surviving masks are ordered by `predIou * stability` and duplicates above `nmsIou` (0.7)
   are suppressed.
7. **Paint labels + BSD.** Kept masks are painted into a disjoint instance-label map (best owner wins each pixel),
   then reduced to the bubble-size distribution with the same maths the offline ground truth uses,
   $d_{eq} = 2\sqrt{A/\pi}$ and the Sauter mean $d_{32} = \sum_i d_i^3 / \sum_i d_i^2$ (`morphometry.ts`).

Every threshold in steps 2 to 6 is exposed as a live control in the App, so the user sees the tradeoff directly:
a denser grid and looser thresholds recover more small bubbles at more cost; under motion blur or defocus the
promptable structure is gone and SAM's confident-mask count collapses (25 and 37 masks on those controls in the
offline verification), which the read-out makes visible rather than hiding.

## The model

The default is **SlimSAM-77-uniform** (`Xenova/slimsam-77-uniform`; Chen et al. 2023), a uniformly-pruned and
distilled SAM tiny enough to run in-browser via transformers.js. The module is model-agnostic (`modelId` in the
constructor): **MobileSAM** (Zhang et al. 2023, a 5M Tiny-ViT encoder, roughly 7x faster than SAM ViT-H) is the
documented alternate, and **EfficientSAM** (Xiong et al. 2024) and **SAM 2** (Ravi et al. 2024, shown running
fully in-browser on WebGPU) are further candidates. The weights are fetched at runtime from the Hugging Face Hub
(CORS-ok, cached by the browser Cache API), **not committed** (no large blob in git); the About page records the
provenance, the Apache-2.0 license, and the offline-degradation behaviour.

## Verified with the same module in Node

Because `frontend/src/sam` has no DOM dependency, `frontend/scripts/verify_sam.ts` runs the exact segmenter under
onnxruntime-node and dumps per-case labels, which `scripts/bake_sam_benchmark.py` scores against the exact
synthetic ground truth using `fslab.science.segment.mask_ap` and `bsd_wasserstein`, the same functions the
classical floor is scored with (COCO-style AP over IoU 0.5:0.05:0.95; Lin et al. 2014). This is why the live
browser numbers and the committed benchmark are comparable, and why the product's headline (mean SAM AP 0.365 vs
floor 0.262 across 13 cases, SAM winning 10 of 13, and dramatically under glare, 0.407 vs 0.081) is a measured
result, not a claim.

## Applying it to other data (the real capability)

The synthetic cases exist only to measure mask quality against known ground truth. The real use is **live SAM
segmentation of froth the user uploads**. Any frame that passes **CONTRACT 1**
(`io/contract.py :: validate_image`, mirrored in TypeScript so the browser rejects a bad upload before spending a
SAM inference) is segmented by the same module; the OpenCV deglare / illumination-flatten front-end helps real
glare, and CONTRACT 1 flags degraded frames (heavy glare, under-exposed, low contrast) so the UI can warn. The
froth-state read-out on top (`frothState.ts`) is a heuristic proxy from the BSD (Aldrich et al. 2010), always
labelled as a proxy, never a calibrated setpoint.

Honest boundary: motion blur and defocus are the classical floor's territory, not SAM's, so the App offers both
methods and reports where each wins. The two-line message on the About page: synthetic mask AP is not real-plant
AP, and the real froth capability is the live segmenter on uploads.

## Replay is still the fallback

A case the archetype gate marks `precompute` is replayed from its committed artifact ([the gate](03_the-gate.md)),
so the site is fully functional even before any model loads (ADR-0054). The base Pyodide lane also still exists as
a numpy-only BSD reducer (`fslab/live.py :: bsd_from_labels`), Pyodide-safe and sharing the offline BSD maths; it
is the small "live" the archetype describes, distinct from the JS SAM segmenter that is the product.
