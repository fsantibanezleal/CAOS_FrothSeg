# Deploy

Default deployment is static GitHub Pages: the companion SPA plus compact
committed artifacts are served with no backend at
request time. Bounded live inference is client-side; full research inference is
precomputed offline. See
[`deploy/pages.md`](../../deploy/pages.md) for the one-time enablement.

## The deploy workflow

`.github/workflows/deploy-pages.yml` runs on push to `main`:

1. Verify the committed scientific artifacts with `python -m fslab.pipeline
   --check`, `scripts/check_artifacts.py`, and
   `scripts/check_product_completeness.py`. Deployment does not train, infer,
   tune, or regenerate the canonical benchmark.
2. Build the SPA: `cd frontend && npm ci && npm run build`. The `frontend/copy-data.mjs` prebuild overlays
   `data/derived` (the per-case `frame.png`, `masks.json`, `bsd.csv`, `benchmark.json`, `card.json`, the
   `manifests/`, `method-benchmark.json`, the 15-by-13 showcase, and the baked
   model evidence) into
   `frontend/public/data` so the static site serves them.
   The canonical copies live in `data/`; `public/data` is a git-ignored build-time overlay.
3. Upload `frontend/dist` and deploy to Pages.

Custom domain: set it via the API, since the CNAME file alone does not set the domain on Actions deploys:
`gh api PUT repos/<owner>/<repo>/pages -f cname=<sub>.fasl-work.com` (cname-only, no `https_enforced`), then
redeploy.

## The optional browser model is fetched at runtime

The legacy browser SAM-class weights are not in git (no multi-tens-of-MB blob; the base-integrity guards in
[`ci.yml`](../../.github/workflows/ci.yml) reject tracked `.pt`/`.pth` and native binaries). At load time
`frontend/src/sam/autoMask.ts` fetches the default model (`Xenova/slimsam-77-uniform`) from the Hugging Face Hub
via `@huggingface/transformers`, which caches it in the browser Cache API, so only the first visit pays the
download. Provenance and the Apache-2.0 license are documented in the
Methodology and Implementation pages. If the Hub is unavailable the
segmenter cannot load, and the app degrades gracefully: the baked benchmark, the synthetic samples, the BSD math,
and all deep pages are served from the committed artifacts and work with no model at all; only the live-inference
lane is affected, and it surfaces a load error rather than blocking the page.

## The single-thread WASM requirement for Pages

The multi-threaded onnxruntime-web WASM backend needs `SharedArrayBuffer`, which requires cross-origin isolation
(COOP and COEP response headers). A static host like GitHub Pages cannot set those headers, so the threaded
backend would stall. `autoMask.ts` therefore forces `env.backends.onnx.wasm.numThreads = 1`. Single-threaded WASM
is slower but works everywhere. WebGPU is the fast path and does not need `SharedArrayBuffer` either: `pickDevice`
probes for a real GPU adapter and only selects WebGPU when inference will actually succeed, falling back to
single-threaded WASM otherwise. Encoder is roughly one second once, then the grid of prompts decodes; the browser
WebGPU path is far faster than the Node CPU timing in the [benchmark](06_model-evaluation.md).

## CI keeps the product honest

`.github/workflows/ci.yml` runs on push and pull request: ruff lint, pytest, a pipeline smoke (regenerate one
case), and `scripts/check_artifacts.py` (the CONTRACT-2 sha256 re-verification, see
[the two data contracts](08_data-contracts.md)). A separate guards job fails the build on a tracked real `.env`, a
tracked venv or native or heavy model binary, raw or heavy data files, or a leaked local machine path.

## The VPS path is dormant

The systemd and nginx templates under `deploy/` remain available when an API
deployment is required. The default public surface is the static companion web;
the offline product remains fully usable without it.
