# Changelog

All notable changes to this product. Format: `X.XX.XXX` (display) · see `fslab.__version__`. Keep `0.x`
while on mock/synthetic data. Tag every release.

## [0.03.000] · 2026-07-11

### Added (rebuild P2-live: the App becomes a multi-model workbench)
- live classical tier C1..C7 in the browser (`frontend/src/classical/`): pure-TypeScript twins of the offline
  Python floor, a method selector in the App runs any of them live on the selected frame in milliseconds with no
  model download: C1 Otsu+CC (under-segmentation baseline, Otsu 1979), C2 marker-less immersion watershed
  (over-segmentation exhibit, Vincent-Soille 1991), C3 highlight-seeded h-maxima watershed (Sadr-Kazemi &
  Cilliers 1997), C4 distance-transform watershed (Meyer 1994), C5 H-minima watershed (Soille 2004), C6 SLIC
  superpixels (Achanta 2012), C7 valley-edge dark-seam detector (Wang 2003; Wang & Chen 2015).
- The toolbox implements the cited standards from scratch: Otsu with argmax-plateau midpoint, exact Euclidean
  distance transform (Felzenszwalb-Huttenlocher), priority-flood marker-controlled watershed, morphological
  reconstruction h-extrema, black top-hat, SLIC k-means. 8 vitest tests: EDT vs brute force, watershed splits
  touching blobs, and the tier reproduces the offline signs on a synthetic frame (C1 under-segments to 1, C2
  over-segments to 1000+, C3/C4/C5/C7 recover the exact true bubble count 16).
- Browser-verified end-to-end: C4 on the poly-normal sample runs in 28 ms, 340 instances vs 197 GT, live AP50
  0.424 scored against the exact synthetic ground truth; engine line reads "cpu, classical, live".

### Honesty
- The live TS twins share each method's semantics and provenance with the offline Python floor but not bit-exact
  numerics (scikit-image internals differ in details), so live numbers can differ from the baked benchmark (live
  C4 AP 0.240 vs offline 0.402 on poly-normal); the offline bake remains the pre-validated reference and the
  benchmark comparison stays offline-vs-offline.

## [0.02.002] - 2026-07-11

### Fixed
- App robustness: the froth frame is now always visible. Previously the image only rendered as part of a
  successful segmentation (the MaskOverlay was gated on a result), so a failed live run, or simply switching
  cases, left the panel blank and looked dead. A new effect loads and shows the selected frame as a base preview
  on every source/case change, and clears any stale result/error so a case switch no longer shows the previous
  case's masks.
- Live-segmentation recovery: if a non-wasm device (WebGPU) loads the SAM model but then fails at inference, the
  run now transparently reloads on wasm and retries once instead of dying; and any run error drops the cached
  segmenter so the next attempt reloads a fresh model / GPU context. This fixes "failed after running
  segmentation, then no image shown even on another case" on GPUs where WebGPU inference fails.

## [0.02.001] · 2026-07-11

### Fixed
- Reference integrity: corrected two misattributed citations. `wang2016` cited a DOI
  (10.1016/j.mineng.2016.05.002) that resolves to a different paper (Tabosa et al.); the real Wang froth
  working-condition paper is Minerals Engineering 128, 17-26 (2018), doi 10.1016/j.mineng.2018.08.017 (id renamed
  wang2016 -> wang2018). `sauter1928` reused Aldrich 2010's DOI under a 1928-implying key; relabelled to "Sauter
  mean d32 (Aldrich et al. 2010)" so the key matches the resolving DOI (id -> sautermean).
- Docs wiki: plain-text `doi:` / `DOI` citations in `docs/architecture/06` and `docs/cases/01_coverage.md` now
  render as clickable `doi.org` links.

### Changed
- Content standards (ADR-0067): swept 107 em-dashes (U+2014) to the approved middot across the UI (Tool /
  Implementation pages, the tech SVG labels), docs and code comments, including the visible case-selector label
  and the CONTRACT headings. Added `scripts/check_content_standards.py` (mirrored from the archetype) and wired
  it into the CI `guards` job so em-dash / emoji cannot regress.

## [0.02.000] · 2026-07-10

### Added
- **IO layer + froth artifacts (CONTRACT 2):** each case emits, under `data/derived/synth/<case>/`, `frame.png`
  (8-bit grayscale), `masks.json` (exact instance ground truth as COCO-RLE via pycocotools), `bsd.csv`
  (per-instance morphometry + BSD summary), `benchmark.json` (classical-floor scores), and `card.json` (compact
  web card). Manifest (`frothseg.manifest/v1`) records the generator spec, seed, each artifact's byte size and
  **sha256**, the BSD summary, the benchmark, and the lane/gate verdict.
- **CONTRACT 1 rewritten as the bring-your-own-froth image gate** (`validate_image`): shape/dtype/size/contrast
  accept-reject + glare / low-contrast / under-exposure flags; the OpenCV front-end reacts to the flags.
- `pipeline --check` + stdlib `scripts/check_artifacts.py` re-verify every artifact sha256 (drift fails CI).
- Pyodide-safe `live.bsd_from_labels` reduces a SAM/classical label map to the BSD summary (live == baked).

### Changed
- **Replaced the example SIR domain** with the froth domain end to end: stages are now `generate -> benchmark ->
  export` (plus `ingest` = the image gate); registry serves the 13 synthetic froth cases by category; example
  input is a froth frame (`data/examples/froth_sample.png`).
- Pinned the real CV stack in `data-pipeline/requirements.txt` (scipy, scikit-image, opencv, pillow, pycocotools).

### Removed
- SIR engine + surrogate stages (`model/sir.py`, `train`, `feature_extraction`, `infer`, `evaluate`,
  `preprocess`, `example_case`) and the SIR-era derived artifacts.

## [0.01.000] · 2026-07-03

### Added
- Initial instantiation from the CAOS product-repo template (ADR-0057).
- Offline `data-pipeline/` (`fslab`): the two data contracts (ingestion + artifact), the named staged
  pipeline (preprocess → feature_extraction → train → infer → evaluate → export), the seeded RNG, the compact
  trace, the manifest, and the measured live-vs-precompute gate.
- EXAMPLE engine: a deterministic SIR epidemic (numpy-only, Pyodide-safe) · **replace with the product's
  research-chosen SOTA engine**.
- Cases-by-category registry (4 regimes + 1 degenerate control); a live-lane entrypoint (`live.py`); tests for
  both contracts + pipeline determinism.
