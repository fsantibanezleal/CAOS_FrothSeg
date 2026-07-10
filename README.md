# FrothSeg, flotation-froth bubble segmentation and bubble-size distribution

[![CI](https://img.shields.io/github/actions/workflow/status/fsantibanezleal/CAOS_FrothSeg/ci.yml?branch=main&label=CI)](https://github.com/fsantibanezleal/CAOS_FrothSeg/actions)
[![License](https://img.shields.io/github/license/fsantibanezleal/CAOS_FrothSeg)](LICENSE)
[![Version](https://img.shields.io/github/v/tag/fsantibanezleal/CAOS_FrothSeg?label=version&sort=semver)](https://github.com/fsantibanezleal/CAOS_FrothSeg/tags)

**In-browser bubble segmentation of flotation froth.** A SAM-family foundation model (SlimSAM / MobileSAM) runs
zero-shot, with no froth training labels, as an automatic mask generator via transformers.js and onnxruntime-web
(WebGPU when a real GPU is present, single-threaded WASM otherwise), producing the per-bubble instance masks, the
**bubble-size distribution (BSD)** (D10/D50/D90, the Sauter mean d32) and a froth-state read-out. A classical
floor (scikit-image watershed and SLIC) runs as the cited baseline. Part of the **Faena** mining-analytics hub
(flotation lane); the froth-CV flagship.

The froth surface is a fast, non-invasive proxy for metallurgical state (grade, recovery, reagent dosing, air
rate). The hard CV problem is instance segmentation of densely packed, touching, translucent, specular bubbles,
and the field's blocker is the scarcity of labelled froth data. FrothSeg answers both: a zero-shot foundation
segmenter that needs no labels, and an honest benchmark where every mask metric is computed against synthetic
froth whose per-bubble ground truth is known exactly.

## Status

**Live** (v0.2.0). The App is a real workbench: pick a synthetic sample (with exact ground truth) or upload a
real froth photo; the segmenter runs in your browser and reports the masks, the BSD and the froth state, with
live controls (prompt-grid density, predicted-IoU and stability thresholds, an illumination-flatten and deglare
front-end). Deep docs live in [docs/](docs/); the plan of record is the management repo
(`wip/mining-analytics-hub/products/frothseg/`).

Verified offline against the exact synthetic ground truth (grid 32, same mask AP + BSD-Wasserstein the classical
floor uses): mean SAM AP 0.365 vs the classical floor 0.262, SAM winning 10 of 13 cases, dramatically under glare
(0.407 vs 0.081). The classical floor stays complementary under heavy motion or defocus blur, so the App offers
both. Synthetic AP is a controlled benchmark, never reported as real-plant accuracy.

## The two data contracts

1. **Ingestion contract, raw froth image to pipeline.** `data-pipeline/fslab/io/contract.py` (`validate_image`)
   is the bring-your-own-froth gate: a frame is accepted only if it is a real, usable image (size, dynamic range),
   rejected with a reason otherwise, and flagged (glare, low contrast, under-exposure) so the UI and the deglare
   front-end react. The browser mirrors the same thresholds (`frontend/src/lib/imageGate.ts`).
2. **Artifact contract, pipeline to web.** Each synthetic case ships `frame.png`, `masks.json` (COCO-RLE ground
   truth), `bsd.csv`, `benchmark.json` and a manifest recording every artifact's byte size AND sha256, re-verified
   in CI (`scripts/check_artifacts.py`) so a silent drift fails the build. A TS mirror of the schema fails the web
   build on drift.

## Quickstart

```bash
# 1. reproducible pipeline env (.venv-pipeline + pinned CV stack)
./scripts/setup.sh                 # scripts/setup.ps1 on Windows

# 2. bake the synthetic benchmark over every case -> data/derived/synth/ + manifests/
./scripts/precompute.sh            # scripts/precompute.ps1

# 3. tests (determinism, both contracts, mask AP, TS/Python parity)
PYTHONPATH=data-pipeline .venv-pipeline/Scripts/python.exe -m pytest

# 4. the SPA (the live SAM segmenter)
cd frontend && npm install && npm run dev

# 5. (optional) verify the live SAM core offline against the ground truth
cd frontend && npx tsx scripts/verify_sam.ts poly-normal glare-storm --grid 32
PYTHONPATH=data-pipeline .venv-pipeline/Scripts/python.exe scripts/score_sam.py
```

## Structure

See [STRUCTURE.md](STRUCTURE.md) for the full tree and [docs/](docs/) for the navigable wiki (theory, the SAM
auto-mask method, the classical floor, the data contracts, the framework cards). Versioning: `X.XX.XXX` display
form, tags per release, `0.x` while the froth-state layer uses proxy labels ([CHANGELOG.md](CHANGELOG.md)).

## Honest limits

No public per-bubble froth ground truth exists, so mask metrics are computed on synthetic froth and say so;
real-plant claims are qualitative. The synthetic generator is stress-tested (glare, merges, defocus, motion) so
highlight-seeded methods cannot win artificially, and the SAM defaults are the standard auto-generator values
(not tuned to the synthetic set). The froth-state read-out is a heuristic proxy from the literature (Aldrich et
al. 2010), not a calibrated plant setpoint. Real froth enters the product only through the upload lane; the SAM
model is fetched from the Hugging Face hub at runtime (Apache-2.0), not committed.

## License

MIT, see [LICENSE](LICENSE) and [ATTRIBUTION.md](ATTRIBUTION.md).
