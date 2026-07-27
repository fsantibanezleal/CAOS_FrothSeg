# Docs, the FrothSeg product wiki

SimLab-style navigable wiki (ADR-0056), authored **as the product is built**, not at the end. The science
(the SAM-class segmenter, the classical floor, the synthetic benchmark harness) plus its validation plus
these docs are the primary product; the web app is a projection of a validated subset.

## What FrothSeg is (in one paragraph)

FrothSeg is a complete offline scientific repository plus a companion web
application. It implements seven classical methods, CUDA-trained learned
segmenters, and official Cellpose-SAM/StarDist/YOLO/SAM-family integrations
behind one instance-mask and bubble-size-distribution contract. The offline
pipeline owns generation, split-safe training, calibration, inference,
evaluation, export, and benchmark baking; the website reads those artifacts and
offers only bounded live interaction. A synthetic Laguerre-foam generator with
exact masks supplies the controlled benchmark because redistributable,
per-bubble industrial froth ground truth is not publicly available.

## Map

- **[architecture/](architecture.md)**, how the repo works: the frozen base, the offline / live lanes, the
  two data contracts, determinism, the staged pipeline (generate the synthetic scene, benchmark the floor,
  export the artifacts), model evaluation, deploy.
- **[frameworks/](frameworks.md)**, one card per research-chosen engine (transformers.js, the SAM auto-mask
  method, scikit-image, scipy, OpenCV, pycocotools). The deep research, made binding; each is pinned in a
  `requirements-*.txt` or `package.json`, no hand-rolled toy substitute for a SOTA engine.
- **[guides/](guides.md)**, runnable how-tos for the complete offline data,
  GPU, evaluation, export, and bounded browser lanes.
- **[cases/](cases.md)**, the synthetic coverage matrix (one case per froth stressor axis) plus the
  positive / negative controls; the App shows one case, Experiments and Benchmark summarize across them.
- **[data-contract/](data-contract/data-contract.md)**, source, record, calibration, and grouped-split rules.
- **[metrics/](metrics/metrics.md)**, instance, boundary, morphometry, uncertainty, and compute definitions.
- **[temporal/](temporal/temporal.md)**, IDF1/HOTA, events, fragmentation, and flow evaluation,
  plus [the full 15-method x 5-sequence matrix](temporal/02_the-full-method-matrix.md) and why
  the framewise and prompted-video lanes are never ranked against each other.
- **[benchmark/](benchmark/benchmark.md)**, the complete held-out matrix and acceptance boundaries.
- **[problem-types/](problem-types/problem-types.md)**, domain failure modes and method assumptions.
- **[use-cases/](use-cases/use-cases.md)**, operational uses, non-goals, and deployment boundaries.
- **[security/](security/security.md)**, static-surface threat boundary, dependency audit decisions,
  raw-data handling, and release behavior.

## Honesty + data policy

FrothSeg's numbers come from the engine and the committed artifacts, never from a claim. Two rules follow
from the data reality of this domain (see `research-tools-and-data`, `sam-verification`):

- **Synthetic AP is not real-plant AP.** The mask-AP and BSD-Wasserstein numbers are measured on the
  synthetic Laguerre-foam harness where the per-bubble ground truth is exact by construction. It is a
  controlled harness, clearly labelled synthetic; it is never reported as concentrator accuracy. The
  glare / motion-blur / defocus cases are deliberate negative controls where methods are supposed to fail,
  and SAM is run at its standard auto-generator defaults (it is not tuned to the synthetic set).
- **Real froth is governed separately.** FrothSeg ships no real images in git.
  The source registry includes the public, CC-BY-NC-SA-4.0 Roboflow Froth
  instance dataset as a fetchable candidate. Its export requires a Roboflow API
  key, and its annotations do not establish physical scale, acquisition groups,
  or independent review. The release lane therefore requires a local fetch,
  traceable `mm_per_px`, leakage-safe grouping, and accepted annotation review
  before any real held-out claim. User uploads remain qualitative unless they
  enter that governed lane.

**What is committed vs fetched vs kept out of git:**

- **Committed** (`data/derived/`): the synthetic scenes only, in real formats, a grayscale PNG frame,
  the exact instance masks as COCO-RLE (`masks.json`), a per-bubble morphometry `bsd.csv`, and a manifest
  recording params, seed, engine version and each file's sha256 (CONTRACT 2, CI-checked, byte-identical on
  re-run). Plus the baked SAM verification results.
- **Fetched for offline model execution** (not duplicated in git): large
  official foundation checkpoints such as Cellpose `cpsam_v2` and SAM 2.1.
  Their exact ids, sizes, hashes, licenses, devices, and parameters are captured
  in run manifests. Compact in-repo checkpoints and ONNX exports are versioned
  with their evaluation evidence.
- **Kept out of git** (`data/raw/`, gitignored): any raw or uploaded froth frames. Uploaded froth is
  processed in-browser and never leaves the client.
