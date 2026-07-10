# Architecture overview

FrothSeg is an instance of the **CAOS product-repo archetype** ([ADR-0057]): offline-pipeline-heavy,
backend-optional, deployed as a static SPA on GitHub Pages (ADR-0055 Pages-first). The base is **frozen**
(instantiated, never re-litigated); per-product rework lives only in the **core**, which for FrothSeg is the
science: the live SAM-class segmenter, the synthetic-froth benchmark harness, the visualizations, and the
content.

One thing is deliberately unlike the plain archetype. The archetype's "live" lane means small pure-Python
recompute in Pyodide. FrothSeg's flagship live capability is a **SAM-family foundation model running in
JavaScript** (`@huggingface/transformers` on onnxruntime-web + WebGPU), which is a *different* kind of live and
sits outside the Pyodide gate entirely. Both notions coexist; see [the gate](03_the-gate.md) and
[the live lane](04_live-lane-pyodide.md).

## The lanes (and what runs where)

| Lane | Where | Deps | Notes |
|---|---|---|---|
| **Live, flagship (client-side SAM)** | `frontend/src/sam/` (`autoMask.ts`) | `@huggingface/transformers` (onnxruntime-web, WebGPU, WASM fallback) | the real product: a zero-shot SAM-class auto-mask generator segments the shipped froth frame or a user upload, in the browser, with NO froth training labels; the model is fetched from the HF Hub at runtime, not committed |
| **Live, base (Pyodide reducer)** | `frontend/src/pyodide` + `fslab/live.py` | numpy only (Pyodide-safe) | the archetype's small live lane: `bsd_from_labels()` turns an instance-label map into the bubble-size distribution; shares the offline BSD math so live and baked numbers are comparable |
| **Precompute (synthetic benchmark)** | `data-pipeline/` (`fslab`), `.venv-pipeline` | scikit-image, scipy, OpenCV, pycocotools | bakes the committed benchmark artifacts (`frame.png` / `masks.json` / `bsd.csv` / `benchmark.json` / `card.json` + manifest); these libraries are not Pyodide-safe, so this is always offline |
| **Replay** | `frontend/` | none | always present; the ADR-0054 fallback the SPA paints on first load |
| **API (backend)** | `app/` (FastAPI) | `requirements-api.txt` | DORMANT; the Pages-first deploy has no server |

A measured **[gate](03_the-gate.md)** records the lane per case. Every synthetic case is `precompute` (the
classical floor uses scikit-image/scipy/OpenCV on full images); the SAM live run is measured separately, in the
browser.

## The flow

1. `data/raw` froth frame, either a shipped sample or a **user upload** (bring-your-own froth).
2. **[CONTRACT 1](08_data-contracts.md)** image gate (`io/contract.py :: validate_image`): accept a usable
   frame, **reject with a reason** (too small, blank/flat, wrong shape, non-numeric, NaN/Inf), or **flag** a
   degraded-but-usable frame (heavy glare, under-exposed, low contrast) so the UI can warn and the OpenCV
   deglare/illumination front-end can help.
3. Staged pipeline (`fslab/pipeline.py`): **generate** the synthetic scene (image + exact instance ground
   truth), **benchmark** the classical floor against that ground truth, **export** the artifacts.
4. **[CONTRACT 2](08_data-contracts.md)** artifact (`core/manifest.py`): a compact, sha256-pinned manifest per
   case.
5. `data/derived/synth/<case>/` (committed), which the `frontend/` replays. The live SAM segmenter runs on
   `frame.png` or the upload directly in the browser; it does not go through the pipeline.

## Frozen base vs rework

- **Frozen:** the folder layout, the two contracts, the staged pipeline (`ingest` · `generate` · `benchmark` ·
  `export`), the gate, the manifest with per-artifact sha256, the two-environment split (`.venv-pipeline` for
  Python precompute, the Node/browser toolchain for the frontend), the cases-by-category registry, and the CI
  guards. Any area may be **dormant** (with a README): the FastAPI `app/` is.
- **Rework (the only per-product surface):** the live segmenter in `frontend/src/sam/`, the synthetic-froth
  science in `data-pipeline/fslab/science/` (`froth_gen.py` geometry/appearance, `segment.py` classical floor),
  the `frontend/` visualizations, and the cases + content + honesty notes.

## What FrothSeg is, and is not

- It **is** a live in-browser bubble-instance segmenter for flotation froth, reducing per-bubble masks to the
  bubble-size distribution (BSD) and a froth-state read-out, with a classical CV floor as the cited baseline and
  a synthetic harness that measures mask quality against exact ground truth.
- It **is not** a calibrated plant soft sensor, and the benchmark numbers are **not** real-plant accuracy.
  Public per-bubble froth masks are legally request-only (see [the data reality](08_data-contracts.md) and the
  About page), so the only source of exact ground truth is the labelled-synthetic Laguerre-foam set. Real-froth
  claims are qualitative; the froth-state layer is a documented heuristic proxy (Aldrich et al. 2010), not a
  setpoint.

[ADR-0057]: ../../../conventions/architecture/0-archetype/ADR-0057-product-repo-archetype.md
