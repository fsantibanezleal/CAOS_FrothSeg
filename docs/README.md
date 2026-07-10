# Docs, the FrothSeg product wiki

SimLab-style navigable wiki (ADR-0056), authored **as the product is built**, not at the end. The science
(the SAM-class segmenter, the classical floor, the synthetic benchmark harness) plus its validation plus
these docs are the primary product; the web app is a projection of a validated subset.

## What FrothSeg is (in one paragraph)

FrothSeg segments every bubble in a flotation-froth image with a **SAM-family foundation model**
(SlimSAM / MobileSAM) run **zero-shot**, with no froth training labels, entirely in the browser via
`@huggingface/transformers` on `onnxruntime-web` (WebGPU, WASM fallback). Run as an automatic mask generator
(a dense grid of point prompts, predicted-IoU and stability filtering, greedy-IoU NMS), it yields per-bubble
instance masks, the **bubble-size distribution** (D10/D50/D90, the Sauter mean d32) and a **froth-state**
read-out. A classical floor (scikit-image marker-controlled watershed and SLIC) is the honest cited baseline
the foundation model must beat. A **synthetic Laguerre-foam generator with exact masks** is the ONLY
benchmark harness, because per-bubble froth ground truth does not exist publicly.

## Map

- **[architecture/](architecture.md)**, how the repo works: the frozen base, the offline / live lanes, the
  two data contracts, determinism, the staged pipeline (generate the synthetic scene, benchmark the floor,
  export the artifacts), model evaluation, deploy.
- **[frameworks/](frameworks.md)**, one card per research-chosen engine (transformers.js, the SAM auto-mask
  method, scikit-image, scipy, OpenCV, pycocotools). The deep research, made binding; each is pinned in a
  `requirements-*.txt` or `package.json`, no hand-rolled toy substitute for a SOTA engine.
- **[guides/](guides.md)**, runnable how-tos: segment your own froth (the real capability), run the offline
  synthetic pipeline, bake and score the SAM verification, the WebGPU lane, the in-app Architecture modal.
- **[cases/](cases.md)**, the synthetic coverage matrix (one case per froth stressor axis) plus the
  positive / negative controls; the App shows one case, Experiments and Benchmark summarize across them.

## Honesty + data policy

FrothSeg's numbers come from the engine and the committed artifacts, never from a claim. Two rules follow
from the data reality of this domain (see `research-tools-and-data`, `sam-verification`):

- **Synthetic AP is not real-plant AP.** The mask-AP and BSD-Wasserstein numbers are measured on the
  synthetic Laguerre-foam harness where the per-bubble ground truth is exact by construction. It is a
  controlled harness, clearly labelled synthetic; it is never reported as concentrator accuracy. The
  glare / motion-blur / defocus cases are deliberate negative controls where methods are supposed to fail,
  and SAM is run at its standard auto-generator defaults (it is not tuned to the synthetic set).
- **Real froth is upload-only, because it is request-only.** Industrial froth photographs are legally not
  publicly redistributable (data-protection constraints; the field's known blocker is the scarcity of
  labelled froth data). So FrothSeg ships **no** real froth dataset with masks. The real capability is
  live SAM segmentation of the froth the **user uploads**, helped by the OpenCV deglare / illumination
  front-end; any individually permissively-licensed sample frames are attributed on the About page.

**What is committed vs fetched vs kept out of git:**

- **Committed** (`data/derived/`): the synthetic scenes only, in real formats, a grayscale PNG frame,
  the exact instance masks as COCO-RLE (`masks.json`), a per-bubble morphometry `bsd.csv`, and a manifest
  recording params, seed, engine version and each file's sha256 (CONTRACT 2, CI-checked, byte-identical on
  re-run). Plus the baked SAM verification results.
- **Fetched at runtime** (not committed): the SAM model weights, pulled from the Hugging Face Hub
  (Apache-2.0) on first use and cached by the browser; no multi-megabyte model blob lives in git.
- **Kept out of git** (`data/raw/`, gitignored): any raw or uploaded froth frames. Uploaded froth is
  processed in-browser and never leaves the client.
