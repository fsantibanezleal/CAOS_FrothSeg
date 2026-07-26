# FrothSeg · full flotation-froth instance-segmentation product

[![CI](https://img.shields.io/github/actions/workflow/status/fsantibanezleal/CAOS_FrothSeg/ci.yml?branch=develop&label=CI)](https://github.com/fsantibanezleal/CAOS_FrothSeg/actions)
[![License](https://img.shields.io/github/license/fsantibanezleal/CAOS_FrothSeg)](LICENSE)

FrothSeg is an offline-first scientific repository for flotation-froth bubble
instance segmentation and bubble-size distribution analysis. It contains the
data generator and split contracts, seven classical methods, seven
learned/foundation methods, one frontier experiment, CUDA training, calibration,
inference, evaluation, ONNX export, temporal tracking, artifact validation,
internal wiki, and a companion web workbench.

The website is not the whole product. It replays selected precomputed evidence
and provides bounded live evaluation through seven TypeScript classical methods
and a legacy lightweight SlimSAM lane. Full training and research inference stay
offline, where the required runtimes and GPU are available.

## Release evidence

Version 0.04.000 implements all 15 registered methods:

| Tier | IDs | Implementations |
|---|---|---|
| Classical | C1-C7 | Otsu+CC, immersion watershed, marker watershed, distance watershed, H-minima watershed, SLIC+RAG, lamella-valley watershed |
| Domain learned | L1-L4, L6 | boundary U-Net, deep-marker watershed, GC-FSegNet, official StarDist 2D, official Ultralytics YOLO segmentation |
| Foundation | L5, L7 | official Cellpose-SAM `cpsam_v2`, official SAM 2.1 image and video |
| Frontier | N1 | LamellaStar four-head research model |

The primary comparison uses 64 untouched test images whose latent geometry
groups are isolated from training, validation, and calibration. Cellpose-SAM is
the current leader at mask AP 0.4336, AP50 0.7462, and PQ 0.6553. Boundary U-Net
is second at AP 0.4153. LamellaStar did not beat the accepted leader, so there is
no beyond-SOTA claim. The repository preserves that negative result.

All numbers are synthetic controlled-benchmark results, not plant accuracy.
See `data/derived/method-benchmark.json` and
`data/derived/release-report.json` for the machine-readable evidence.

## Data and compute pipeline

The learned-data manifest defines 384 samples across 16 condition families:
192 training, 64 validation, 64 calibration, and 64 untouched test samples.
Each latent geometry group has two independently rendered appearance variants;
group isolation prevents appearance twins from leaking across splits.

The complete flow is:

1. generate exact labelled stills or persistent-ID temporal sequences;
2. materialize a checksum-pinned local dataset cache;
3. train or load the method's official pretrained checkpoint;
4. calibrate post-processing only on the calibration split;
5. evaluate once on the untouched test split;
6. run the separate 13-case canonical diagnostic;
7. export checkpoints, portable ONNX where applicable, masks, run manifests,
   temporal evidence, and the unified release report;
8. copy only compact evidence into the static companion website.

## Reproduce

```powershell
./scripts/setup.ps1
./.venv-gpu/Scripts/python.exe scripts/check_cuda.py
./.venv-gpu/Scripts/python.exe scripts/build_learned_manifest.py
./.venv-gpu/Scripts/python.exe scripts/build_learned_cache.py

./.venv-gpu/Scripts/python.exe -m fslab.learning.train_unet --help
./.venv-gpu/Scripts/python.exe -m fslab.learning.train_multitask --help
./.venv-gpu/Scripts/python.exe scripts/train_yolo_seg.py --help

./.venv-gpu/Scripts/python.exe scripts/build_method_benchmark.py
./.venv-gpu/Scripts/python.exe scripts/build_release_report.py

./.venv-gpu/Scripts/python.exe -m pytest
./.venv-gpu/Scripts/python.exe -m ruff check .
./.venv-gpu/Scripts/python.exe scripts/check_artifacts.py
./.venv-gpu/Scripts/python.exe scripts/check_product_completeness.py --profile release
Set-Location frontend
npm test
npm run build
```

Detailed commands, method provenance, limitations, architecture, contracts, and
result interpretation are indexed in [docs/](docs/README.md). The product plan
of record remains in the CAOS management repository.

## Honest limits

- No public, redistributable, per-bubble real-froth ground truth is included.
  Exact metrics therefore use a controlled synthetic harness.
- Cellpose-SAM and SAM2 checkpoints are checksum-recorded external model assets;
  their very large upstream weights are not duplicated in git.
- Native Windows TensorFlow does not expose CUDA for StarDist. Its official
  graph trained on CPU; WSL2/Linux is the supported GPU path.
- The lightweight browser SlimSAM result is retained as a legacy interactive
  lane and is not presented as the strongest method.
- Froth-state readouts remain literature-based proxies, not calibrated plant
  setpoints.

## License

The in-repository code is MIT. Individual engines and checkpoints retain their
upstream licenses; consult [ATTRIBUTION.md](ATTRIBUTION.md) and each framework
card before redistribution or deployment.
