# Framework card, `@huggingface/transformers` (+ onnxruntime-web)

The browser runtime that carries the live product method. It loads a SAM-family foundation model, runs its
encoder and prompt decoder on the client, and gives back raw logit masks that the auto-mask generator
([`02_sam-method`](../02_sam-method/sam-method.md)) turns into froth-bubble instances. This card documents the
runtime; the method built on top of it is the next card.

This is a frontend npm engine, so its binding pin lives in `frontend/package.json` (not in a
`data-pipeline/requirements-*.txt`, which pins the Python offline stack). The card and the pin are the two
halves of the same contract.

## What & why

`@huggingface/transformers` (Transformers.js) is Hugging Face's JavaScript port of the Python `transformers`
library. It runs transformer models directly in the browser (and in Node) on **ONNX Runtime Web** as its
inference backend, with a **WebGPU** execution provider and a **WASM-SIMD** fallback. It ships `SamModel` and
`AutoProcessor` classes that match the Python API, so a SAM checkpoint exported to ONNX loads with one call.

Why this runtime, and not a hand-rolled ONNX wiring or a server:

- **A real foundation segmenter, live in the browser, is a solved deployment, not a hope.** SAM2 has been run
  fully client-side on WebGPU, and MobileSAM (Tiny-ViT encoder, 5M params, roughly 7x faster than SAM ViT-H)
  exports cleanly to ONNX with working browser demos. Transformers.js is the library that packages that path
  behind a stable API. See the tools-and-data research dossier (Gate 1).
- **Zero-shot is exactly what froth needs.** Public per-bubble froth masks are legally constrained and scarce,
  so a model that segments with no domain training labels is the honest choice. Transformers.js loads the
  pruned/distilled SAM variants (SlimSAM, MobileSAM) that keep that zero-shot behaviour while fitting a browser.
- **One module, two runtimes.** The same TypeScript (`frontend/src/sam/`) runs on onnxruntime-web in the
  browser and on onnxruntime-node in Node, so the offline verification harness scores the exact code the user
  runs. No separate reference implementation to drift.
- **ADR-0055 Pages-first.** FrothSeg is a static SPA on GitHub Pages with no server; all inference is
  client-side. A JS runtime that fetches its own weights from the Hugging Face Hub and runs on the visitor's
  GPU/CPU is what makes a serverless deploy of a foundation model possible.

Refs: Transformers.js (HF) [`transformersjs`], ONNX Runtime Web [`onnxruntimeweb`], WebGPU (W3C) [`webgpu`],
Kirillov et al. 2023 (SAM) [`kirillov2023`], Chen et al. 2023 (SlimSAM) [`chen2023slimsam`], Zhang et al. 2023
(MobileSAM) [`zhang2023mobilesam`].

## Install (exact, verified)

Pinned in `frontend/package.json`:

```json
{
  "dependencies": {
    "@huggingface/transformers": "^3.8.1"
  }
}
```

- **Version**: `@huggingface/transformers` v3.8.1 (the verification run in `sam-verification-2026-07-10.md`
  used this exact version).
- **ONNX Runtime Web is transitive.** It arrives as a dependency of `@huggingface/transformers`; the app never
  pins it directly. The library selects the WebGPU or WASM backend at load time.
- **No weights are committed.** The model checkpoint (`Xenova/slimsam-77-uniform`, ONNX) is fetched at runtime
  from the Hugging Face Hub and held in the browser Cache API. Nothing about the install ships a 40 MB blob in
  git; see the caveats below for the offline-degradation consequence.
- **Node parity** (for the offline harness only): the same package plus `onnxruntime-node` runs the module on
  CPU. That is the verification lane, not the deploy target.

## Usage

The minimal encode-once, decode-per-prompt shape, mirroring `frontend/src/sam/autoMask.ts`:

```ts
import { AutoProcessor, env, SamModel, Tensor } from '@huggingface/transformers';

// Force single-threaded WASM: the multi-threaded backend needs SharedArrayBuffer, which needs COOP/COEP
// headers a static host (GitHub Pages) cannot set. WebGPU (when present) is the fast path and needs neither.
if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = 1;

const model = await SamModel.from_pretrained('Xenova/slimsam-77-uniform', { device: 'webgpu', dtype: 'fp32' });
const processor = await AutoProcessor.from_pretrained('Xenova/slimsam-77-uniform');

// 1) Encode the image once (heavy). This is the only full forward through the ViT encoder.
const inputs = await processor(image); // image = a transformers.js RawImage
const emb = await model.get_image_embeddings(inputs);

// 2) Decode a batch of point prompts against the cached embedding (cheap, repeatable).
//    Points are scaled into SAM's resized frame; labels = 1 mark foreground clicks.
const input_points = new Tensor('float32', pointsXY, [1, K, 1, 2]);
const input_labels = new Tensor('int64', ones, [1, K, 1]);
const out = await model({
  image_embeddings: emb.image_embeddings,
  image_positional_embeddings: emb.image_positional_embeddings,
  input_points,
  input_labels,
});
// out.pred_masks : [1, K, 3, Hl, Wl] logit masks (3 multimask candidates per point)
// out.iou_scores : [1, K, 3]           the decoder's predicted IoU per candidate
```

The device is chosen by probing for a real WebGPU adapter first (`navigator.gpu.requestAdapter()`); loading
with a device that has no adapter succeeds but then fails at inference, so the code only asks for `webgpu` when
an adapter is actually obtainable, otherwise `wasm` in the browser or the library default (CPU) in Node.

## Applying it here

- **Stage**: the live `segment` stage. Input is a decoded RGB frame (a sample, an uploaded real froth image,
  or a synthetic case); output is the cached image embedding plus the per-prompt logit masks and predicted
  IoU scores that the auto-mask generator consumes.
- **What runs on this runtime**: only the SAM encoder and decoder forward passes. Everything after the logits
  (stability, filtering, NMS, label paint, BSD reduction) is plain typed-array TypeScript in
  `frontend/src/sam/`, so it is identical across WebGPU, WASM, and Node.
- **Contract it satisfies**: the live-lane inference contract. The encoder runs once per image; the decoder is
  called in batches over the prompt grid (`pointBatch` default 64), which keeps memory bounded and lets the UI
  report progress. On the reference synthetic set this live core beats the classical floor on average (mean
  mask AP 0.365 vs 0.262, wins 10 of 13 cases, and 0.407 vs 0.081 under the glare control); the floor stays
  complementary on heavy motion-blur and defocus. Full per-case numbers live in the Experiments and Benchmark
  pages, transcribed from the committed `data/derived/sam_benchmark.json`.
- **Swapping the model**: the module is model-agnostic. `MobileSAM` (or another SAM student exported to ONNX)
  loads by changing the model id passed to `from_pretrained`; nothing downstream changes.

## Caveats / license

- **Model license**: `Xenova/slimsam-77-uniform` and the MobileSAM checkpoints are **Apache-2.0**, which
  permits redistribution and commercial use with attribution. The About page records provenance and license.
- **Weights are fetched at runtime, so first use needs the network.** The checkpoint is pulled from the
  Hugging Face Hub over CORS and cached by the browser; a cold, offline visit cannot load the model. This is a
  deliberate trade (no large blob in git) and is documented as the offline-degradation behaviour.
- **Single-thread WASM on Pages.** The multi-threaded WASM backend needs `SharedArrayBuffer`, which needs
  cross-origin isolation (COOP/COEP) headers a static host cannot set; without them the threaded backend
  stalls. The app forces `numThreads = 1`. WASM is therefore the slow, always-works floor; WebGPU is the fast
  path and needs no special headers.
- **WebGPU availability is not universal.** Where `navigator.gpu` is absent or has no adapter, inference falls
  back to single-threaded WASM, which is markedly slower (the 1024-prompt Node CPU run takes roughly 24 s
  total after a roughly 1 s encode; the browser WebGPU path is far faster, and the SAM2/MobileSAM WebGPU demos
  run interactively). Both latencies are reported honestly in the App, never hidden.
- **`fp32` by default.** The verification used `fp32`; quantised (`q8`/`fp16`) weights are a documented speed
  tier, not the default, because they trade mask fidelity for latency and that trade must be measured, not
  assumed.
- **Not a training runtime.** Transformers.js here is inference-only. Any model export or distillation is an
  offline Python step; this card is strictly the browser/Node inference engine.
