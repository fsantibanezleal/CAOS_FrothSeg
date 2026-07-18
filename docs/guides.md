# Guides

Runnable how-tos for FrothSeg: segment your own froth (the real capability), reproduce the offline synthetic
benchmark, verify the live SAM core, and the archetype-standard chrome.

## The froth workflow

- [Segment your own froth](guides/02_bring-your-own-data.md), the real capability: upload a real froth frame in
  the App and the live SAM segmenter runs on it in-browser (helped by the lightweight canvas deglare and
  illumination-flatten front-end); or add a documented case through CONTRACT 1.
- [Run the precompute pipeline](guides/01_precompute-pipeline.md), `python -m fslab.pipeline` generates every
  synthetic froth case (image plus exact instance ground truth), benchmarks the scikit-image floor against that
  ground truth, and exports the committed artifacts plus manifest; `--check` re-verifies the sha256s (CONTRACT 2).
- [Verify the live SAM core offline](guides/03_verify-sam.md), how the product value is measured not asserted:
  `frontend/scripts/verify_sam.ts` runs the same segmenter module in Node, `scripts/score_sam.py` scores it with
  the floor's `mask_ap` and `bsd_wasserstein`, and `scripts/bake_sam_benchmark.py` bakes
  `data/derived/sam_benchmark.json` (mean SAM AP 0.365 vs floor 0.262, wins 10 of 13).

## Reference and dormant lanes

- [How the CAOS archetype is instantiated as FrothSeg](guides/00_instantiate.md), the frozen base versus the
  FrothSeg core (the SAM segmenter, the classical floor, the synthetic generator, the pages).
- [The GPU / WebGPU lane](guides/03_gpu-lane.md), FrothSeg needs no offline CUDA lane; its acceleration is WebGPU
  in the browser (the device auto-probes for a real adapter, falling back to single-threaded WASM), and the
  offline SAM verification runs the same code in Node.
- [The backend API (dormant)](guides/04_run-the-api.md), FrothSeg is a static SPA (ADR-0055), so the `app/`
  FastAPI backend stays dormant; this documents when and how it would be activated.
- [The in-app Architecture modal](guides/05_architecture-modal.md), the mandatory How-it-works modal (ADR-0058):
  the themed SVG diagrams and copy that prove FrothSeg is a real, complete system.
