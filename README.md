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

Version 0.06.001 implements all 15 registered methods:

| Tier | IDs | Implementations |
|---|---|---|
| Classical | C1-C7 | Otsu+CC, immersion watershed, marker watershed, distance watershed, H-minima watershed, SLIC+RAG, lamella-valley constrained watershed |
| Domain learned | L1-L4, L6 | boundary U-Net, deep-marker watershed, GC-FSegNet, official StarDist 2D, official Ultralytics YOLO segmentation |
| Foundation | L5, L7 | official Cellpose-SAM `cpsam_v2`, official SAM 2.1 image and video |
| Research | N1 | LamellaStar four-head research model, published as a three-seed logit-mean ensemble |

The primary comparison uses 64 untouched test images whose latent geometry
groups are isolated from training, validation, and calibration.

| rank | id | method | mean AP | AP50 | PQ |
|---|---|---|---|---|---|
| 1 | N1 | LamellaStar (three-seed ensemble) | **0.5186** | 0.8279 | 0.7359 |
| 2 | L5 | Cellpose-SAM | 0.5099 | 0.8238 | 0.7227 |
| 3 | L1 | Boundary/distance U-Net + watershed | 0.4153 | 0.6987 | 0.6559 |
| 4 | L2 | Deep-marker watershed | 0.3247 | 0.5990 | 0.5694 |
| 5 | L3 | GC-FSegNet | 0.3190 | 0.5958 | 0.5582 |

LamellaStar is a logit-mean ensemble of three independently seeded members, selected
on validation under a protocol fixed before any run and confirmed with a single
evaluation on the untouched test split (`verification/n1-preregistered-ablation.json`).

**This is a leaderboard result, not a state-of-the-art claim, and the repository does
not make one.** Four reasons, all recorded with the evidence rather than omitted:

1. The margin over Cellpose-SAM (+0.0087) is smaller than the measured
   ensemble-to-ensemble spread: pre-registered P-1 trained three further seeds and
   evaluated a second disjoint three-seed ensemble on validation only, measuring a
   spread of 0.0118 mean AP (verification/p1-ensemble-spread.json). The N1 and
   Cellpose-SAM results are not distinguishable at that spread.
2. Every case is synthetic.
3. Cellpose-SAM is a generic pretrained checkpoint given two fine-tuning passes. Beating
   a lightly tuned baseline is not beating the method.
4. `beyond_sota_claim` is `false` and stays `false`; it is a claim about the domain, not
   about this table.

**A real-domain transfer test qualifies this table further, first run on 2026-07-28 and
re-run on 2026-08-01 after the C3 and C7 engine defaults were adopted.** Run unchanged
over 64 real photographs of dense touching instances (BBBC038, CC0), N1 falls from 0.519
to 0.125 while Cellpose-SAM rises from 0.510 to 0.709. Every in-repo trained model
degrades (mean -0.243, unchanged by the adoptions, which moved only classical rows); five
of the seven classical methods improve, at a tier mean of +0.071. The two that do not are
named rather than averaged away: C2 gradient immersion watershed was already at 0.017 on
froth and scores exactly 0.000 on all 64 real samples, and C3 falls from 0.297 to 0.216
because its adopted negated-intensity flooding surface assumes a specular highlight per
bubble and a dark Plateau border between bubbles, and cell nuclei have neither. That is
recorded, not repaired: the change was adopted on a froth source and confirmed on a froth
reserve slice (`verification/phase1-adoption.json`), and this split supports no froth
statement. C7 moves the other way, 0.233 to 0.301. The froth ranking
is therefore substantially a property of the generator. That test is adjacent-domain and
plays to Cellpose-SAM's pretraining, so it does not show Cellpose-SAM is better on froth,
only that N1's lead does not survive a change of domain. See
`docs/benchmark/02_real-domain-transfer.md`.

The study that produced the ensemble also refuted its own hypothesis. The gap was
supposed to be an under-training deficit; it is not. Averaged over seeds, training from
80 to 120 epochs is worth about 0.002. What works is ensembling, because it suppresses
the seed variance that made the earlier single-run comparisons unreliable.

All numbers are synthetic controlled-benchmark results, not plant accuracy.
See `data/derived/method-benchmark.json` and
`data/derived/release-report.json` for the machine-readable evidence.

### The sequence lane

Every registered method is also run over five eight-frame sequences with exact,
persistent instance ids: 75 published (method, sequence) pairs and 600 prediction
frames, with no cell allowed to be missing. Framewise methods segment each frame
independently and receive identities afterwards by IoU association; SAM 2.1 carries
its own memory and is prompted once with the exact first-frame masks.

Those two protocols answer different questions and are never ranked against each
other. SAM 2.1 scores IDF1 and HOTA of 1.000 on every sequence because it is handed
twelve identities and asked whether it still has twelve; its honest number is the mean
identity IoU, 0.898. Framewise leader on nominal transport is Cellpose-SAM at HOTA
0.965, then LamellaStar 0.961 and boundary U-Net 0.923, down to marker-less immersion
watershed at 0.153 with 370 identity switches over eight frames. C3 now sits at 0.917 on
that sequence, fourth overall and within 0.006 of the boundary U-Net, and C7 at 0.829.
Across all five sequences C3's mean HOTA rose from 0.435 to 0.653 with the flooding-surface
adoption and then to 0.761 with the depth correction, while C7's went from 0.597 to 0.601
and has not moved since (`data/derived/temporal/`). Identity association is driven by
instance count, which is why a method that stopped over-segmenting by 64 percent gains
this much on a tracking metric it was never tuned against.

There is no video anywhere in this repository and no module decodes video. A sequence
is a stack of PNG frames. See `docs/temporal/02_the-full-method-matrix.md`.

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

- No real FROTH images exist here, and none are publicly available. Verified
  2026-07-28 against primary sources: every public froth candidate is unlicensed,
  non-commercial, or paywalled, and Zenodo has none. A real froth claim therefore
  needs owned, annotated frames. The adjacent-domain BBBC038 (CC0) lane measures
  generalisation only, and the release gate cannot be cleared by it.
  Current exact metrics therefore use the controlled synthetic harness.
- Cellpose-SAM and SAM2 checkpoints are checksum-recorded external model assets;
  their very large upstream weights are not duplicated in git.
- Native Windows TensorFlow does not expose CUDA for StarDist. Its official
  graph trained on CPU; WSL2/Linux is the supported GPU path.
- The lightweight browser SlimSAM result is retained as a legacy interactive
  lane and is not presented as the strongest method.
- Froth-state readouts remain literature-based proxies, not calibrated plant
  setpoints.

## License

The in-repository code is MIT licensed (the CAOS product-line standard). Individual engines and checkpoints retain their
upstream licenses; consult [ATTRIBUTION.md](ATTRIBUTION.md) and each framework
card before redistribution or deployment.
