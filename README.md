# FrothSeg — flotation-froth bubble segmentation & bubble-size distribution

[![CI](https://img.shields.io/github/actions/workflow/status/fsantibanezleal/CAOS_FrothSeg/ci.yml?branch=main&label=CI)](https://github.com/fsantibanezleal/CAOS_FrothSeg/actions)
[![License](https://img.shields.io/github/license/fsantibanezleal/CAOS_FrothSeg)](LICENSE)
[![Version](https://img.shields.io/github/v/tag/fsantibanezleal/CAOS_FrothSeg?label=version&sort=semver)](https://github.com/fsantibanezleal/CAOS_FrothSeg/tags)

**In-browser bubble segmentation of flotation froth images** — classical watershed variants (distance-transform-,
highlight- and valley-seeded) plus a distilled learned mask head — producing the **bubble-size distribution (BSD)**
and froth descriptors, with a built-in **synthetic-froth benchmark mode** where per-bubble ground truth is known
by construction. Part of the **Faena** mining-analytics hub (flotation lane); the froth-CV flagship.

The froth surface is a fast, non-invasive proxy for metallurgical state (grade/recovery, reagent dosing, air
rate). The hard CV problem is instance segmentation of densely packed, touching, translucent, specular bubbles.
FrothSeg makes the method comparison honest: every mask metric is computed against synthetic ground truth
(Laguerre-packed froth with controlled glare/merge stress), and real-froth results are labelled qualitative.

## Status

**Scaffold** (instantiated 2026-07-03 from the CAOS product-repo archetype, ADR-0057). The pipeline below still
runs the template's example domain; the build order is: synthetic froth generator (the primary GT source) →
shared loader + morphometry/BSD → live classical methods (TS) → offline teachers → distilled ONNX student →
benchmark + froth-state dashboard. Plan of record: the management repo, `wip/mining-analytics-hub/products/frothseg/`.

## The two data contracts

1. **Ingestion contract — `raw → processing`.** `data-pipeline/fslab/io/contract.py` defines the accepted
   input schema (image frames + optional per-frame metadata; masks as COCO-RLE / 16-bit label PNGs) with an
   explicit outlier policy (reject / clip / flag). Bring-your-own-froth passes through this gate.
2. **Artifact contract — `processing → web`.** Every pipeline run writes compact artifacts +
   `manifests/<case>.json` (params, seed, run_ms, bytes, gate verdict, format/version). The web app loads only
   these for the heavy tier; the live tier (watershed/ONNX) computes in the browser. A TS mirror of the manifest
   schema fails the build on drift.

## Quickstart

```bash
# 1. reproducible env (.venv + pinned requirements)
./scripts/setup.sh                 # scripts/setup.ps1 on Windows

# 2. offline pipeline over every case → data/artifacts/ + manifests/
./scripts/precompute.sh            # scripts/precompute.ps1

# 3. tests (determinism, both contracts, gate, TS/Python parity)
.venv/bin/python -m pytest         # .venv/Scripts/python.exe on Windows

# 4. the SPA
cd frontend && npm install && npm run dev
```

## Structure

See [STRUCTURE.md](STRUCTURE.md) for the full tree and [docs/](docs/) for the navigable wiki
(theory, data contract, framework notes). Versioning: `X.XX.XXX` display form, tags per release,
`0.x` while the soft-sensor lane uses proxy labels ([CHANGELOG.md](CHANGELOG.md)).

## Honest limits

No public per-bubble froth ground truth exists — mask metrics are computed on synthetic froth and say so;
real-plant claims are qualitative. The synthetic generator is stress-tested (glare, merges, defocus) so
highlight-seeded methods cannot win artificially. Froth appearance is site-specific; models tuned here do
not transfer without recalibration.

## License

MIT — see [LICENSE](LICENSE) and [ATTRIBUTION.md](ATTRIBUTION.md).
