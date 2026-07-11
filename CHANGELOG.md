# Changelog

All notable changes to this product. Format: `X.XX.XXX` (display) · see `fslab.__version__`. Keep `0.x`
while on mock/synthetic data. Tag every release.

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
  (8-bit grayscale), `masks.json` (EXACT instance ground truth as COCO-RLE via pycocotools), `bsd.csv`
  (per-instance morphometry + BSD summary), `benchmark.json` (classical-floor scores), and `card.json` (compact
  web card). Manifest (`frothseg.manifest/v1`) records the generator spec, seed, each artifact's byte size AND
  **sha256**, the BSD summary, the benchmark, and the lane/gate verdict.
- **CONTRACT 1 rewritten as the bring-your-own-froth image gate** (`validate_image`): shape/dtype/size/contrast
  accept-reject + glare / low-contrast / under-exposure flags; the OpenCV front-end reacts to the flags.
- `pipeline --check` + stdlib `scripts/check_artifacts.py` re-verify every artifact sha256 (drift fails CI).
- Pyodide-safe `live.bsd_from_labels` reduces a SAM/classical label map to the BSD summary (live == baked).

### Changed
- **Replaced the EXAMPLE SIR domain** with the froth domain end to end: stages are now `generate -> benchmark ->
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
