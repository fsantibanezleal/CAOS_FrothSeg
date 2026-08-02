# Guides

Runnable how-tos for FrothSeg's offline data, training, inference, evaluation,
export, and bounded browser workflows.

## The froth workflow

- [Segment your own froth](guides/02_bring-your-own-data.md), exploratory
  browser inference or the governed offline ingestion path through CONTRACT 1.
- [Run the precompute pipeline](guides/01_precompute-pipeline.md), `python -m fslab.pipeline` generates every
  synthetic froth case (image plus exact instance ground truth), benchmarks the scikit-image floor against that
  ground truth, and exports the committed artifacts plus manifest; `--check` re-verifies the sha256s (CONTRACT 2).
- [Verify the legacy browser SAM core](guides/03_verify-sam.md), retained
  traceability for the lightweight interaction lane:
  `frontend/scripts/verify_sam.ts` runs the same segmenter module in Node, `scripts/score_sam.py` scores it with
  the floor's `mask_ap` and `bsd_wasserstein`, and `scripts/bake_sam_benchmark.py` bakes
  `data/derived/sam_benchmark.json` (mean SAM AP 0.365 vs floor 0.402, so the prompt grid LOSES
  by 0.037 and wins 4 of the 12 scored cases; the floor is the best classical method per case and
  rose from 0.262 to 0.351 with the 2026-08-01 surface and mode adoptions, then to 0.402 with the
  C3 depth correction).

## Reference and execution lanes

- [How the CAOS archetype is instantiated as FrothSeg](guides/00_instantiate.md), the frozen base versus the
  FrothSeg core (the SAM segmenter, the classical floor, the synthetic generator, the pages).
- [The offline GPU lane](guides/03_gpu-lane.md), the mandatory CUDA environment for learned-model training,
  foundation-model inference, calibration, export, and benchmark baking. The browser receives compact,
  precomputed artifacts and only exposes bounded live evaluation where the method makes that valid.
- [The backend API (dormant)](guides/04_run-the-api.md), FrothSeg is a static SPA (ADR-0055), so the `app/`
  FastAPI backend stays dormant; this documents when and how it would be activated.
- [The in-app Architecture modal](guides/05_architecture-modal.md), the mandatory How-it-works modal (ADR-0058):
  the themed SVG diagrams and copy that prove FrothSeg is a real, complete system.
