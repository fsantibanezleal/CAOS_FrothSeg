# Changelog

## [0.05.000] · UNRELEASED (work 2026-07-28 to 2026-07-29)

On `develop`. The release gate still reports `complete: false`: BBBC038 satisfies the
real-data lane for the adjacent domain only, and the blocker is specifically a licensed
real **froth** held-out source, which no search has yet found.

### Added (2026-07-29): the App is a single-rail workbench and focus mode exists

- The App route follows ADR-0017 §1.2 again: ONE control rail holding the analysis-source
  switch (still image / temporal sequence), the input and method controls for whichever lane
  is active, and the focus entry. The source switch had been a full-width banner above the
  workbench, which is the layout the ADR forbids.
- New focus route (`/focus/:caseId`, ADR-0070). It renders outside the shell chrome, so the
  stage holds 81% of the viewport at 1280x800 and 87% at 2560x1440 against 46% for the
  documented App route. HUD metrics, an in-stage scenario label, a 240-330px parameter rail,
  keyboard transport (space, arrows, Esc) and progressive disclosure behind "More detail".
- Entry and return are both real controls, per ADR-0070 §8: the rail button opens focus on
  the selected scenario and "Exit focus" returns to the App with that scenario still selected.
  Verified by clicking, not by visiting the URL.
- Sequence tabs are grouped into one row and the still-image tabs into six question-named
  groups, so the App carries one row of nav chrome instead of two (ADR-0071).

### Fixed (2026-07-29): four measured layout defects the build never caught

- The still-lane tab panels render a fragment of siblings into a stage declared with a single
  grid row, so the KPI strip and the instrument were placed in the same cell and drew on top
  of each other. The stage is a flex column now.
- The sequence replay tab rendered six loose siblings that became implicit rows and hung the
  frame 41px past the viewport. Replay is its own grid; the transport and the summary moved
  onto the frame as overlays, which took the instrument from 7.5% of the viewport to 16.5%.
- The focus canvas rendered 1037x1037 in an 800px stage and the bottom quarter of every frame
  was clipped away by the stage overflow.
- The pan/zoom layer spanned the full window, so a square froth frame drew 364px wide inside
  a 1246px bordered box. It follows the frame aspect and centres now, and the window no longer
  carries the border that made the empty panning headroom read as a hollow panel.
- Shell chrome is measured at runtime (`useViewportFit`) rather than hard-coded. The footer
  carries a 48px margin-top that a height-only sum missed, which left the document exactly
  18px past the viewport at every size.

### Added (2026-07-28): a real-domain transfer lane, and what it showed

- BBBC038 (Broad Bioimage Benchmark Collection, CC0) is adopted as the real-image lane: 670
  annotated nuclei fields, imported and calibrated. It is real data with a real licence, and
  it is not froth.
- Transfer measured across the ladder. The result contradicts the expectation: the classical
  methods **gained** on real images (+0.088 mean AP) while the in-repo trained models **lost**
  (-0.243). The froth ranking is a property of the synthetic generator, not of segmentation
  difficulty, and the product now says so.
- Sources carry an explicit `domain` field (`froth` / `adjacent`) and the release gate
  partitions on it. Without that field, adopting nuclei data would have flipped the release to
  `complete: true` with zero froth validation behind it.

### Removed (2026-07-28): Roboflow

- Every Roboflow dependency, credential path and dataset reference is gone. The froth-data
  search that replaced it is recorded with what was checked and why each candidate failed,
  so the next search starts from the result rather than repeating it.

### Added (2026-07-28): per-file inference

- `fslab.infer_file` is a real CLI over one image or one sequence, raising `VideoNotSupported`
  where the format is out of scope. The App had advertised this command before it existed.

### Fixed (2026-07-28)

- Text sources hash line-ending-normalised, so the parity gate gives the same answer on
  Windows and in CI. Editing a Python file with CRLF against a repo that stores LF made the
  gate pass locally and fail in CI as "parity is stale".
- The footer licence correction fails loudly instead of silently reverting.

## [0.04.000] · 2026-07-28

Tagged and merged to `main` (PR #29). The release gate reports `complete: false`, blocked on
"no accepted licensed real held-out source with imported samples and calibration".

### Changed (2026-07-28): LamellaStar ships as a three-seed ensemble and leads the benchmark

- The published N1 is now the logit-mean ensemble of three independently seeded e120
  members, replacing the single e80 checkpoint. Test mean AP moves 0.4904 to **0.5186**,
  ahead of Cellpose-SAM's 0.5099, and it also leads on AP50 (0.8279), PQ (0.7359) and
  boundary F-score (0.9876).
- Every piece of N1 evidence was regenerated from the ensemble rather than inherited:
  canonical 13-case inference (mean AP 0.5353), the temporal bake over all five sequences
  (HOTA 0.843 to 0.917), per-member ONNX with a parity report each, and the
  benchmark/showcase/release rebuild.
- `models/lamellastar-v1/` now holds `members/seed-<n>/` plus `onnx/seed-<n>.onnx`. The
  single-model `checkpoint.pt`, `weights.npz`, `model.onnx` and `onnx-parity.json` are
  removed because they are no longer what the product runs. An ensemble has no single
  inference artifact, so the run manifest records the digest of the member digests.
- Selection followed the study-v3 pre-registration, fixed before any run: winner by
  validation mean AP, three finalist-gate criteria, one evaluation on the untouched test
  split. The study's stated hypothesis was refuted on the way there. The gap was supposed
  to be an under-training deficit; averaged over seeds, 80 to 120 epochs is worth about
  0.002. The seed spread (0.0374) is nearly twice the gap that was being chased, which
  means several single-seed conclusions in studies v1 and v2 were weaker than recorded.
  What works is ensembling, precisely because it suppresses that variance.
- **`beyond_sota_claim` stays `false`.** Leading this table is a leaderboard result on
  synthetic data against a two-pass fine-tuned Cellpose-SAM, with a margin smaller than
  the measured seed spread and only one ensemble draw evaluated. The benchmark now carries
  a `leader_note` saying so at the point of the claim.

### Added (2026-07-27): the temporal lane covers the whole ladder

- Every registered method now has precomputed temporal evidence on every canonical
  sequence: 15 methods x 5 sequences x 8 frames, 75 pairs, 600 prediction frames. It
  was L1 on five sequences and L7 on one; the other thirteen were `not_precomputed`.
- New `fslab/temporal_bake.py` gives each method a per-frame predictor (classical
  callables, the U-Net, the shared multitask head for L2/L3/N1, StarDist, Cellpose-SAM,
  YOLO) and assigns identities by IoU association. The generic path reproduces the
  previously published L1 numbers exactly, which is what validates it.
- SAM 2.1 video propagation now covers all five sequences instead of `motion-fast` alone.
- The two prediction modes are kept apart everywhere. L7 is handed the exact first-frame
  masks and only has to keep them, so its IDF1 and HOTA are 1.000 by construction; its
  honest number is the identity IoU (0.898). The mode travels with every row, the method
  picker groups by it, and the comparison table separates them with the reason stated.
- New Compare methods view: every method on the selected sequence ordered by HOTA with
  ID switches and fragmentations, and a row picker that replays the chosen method.
- Payload: the showcase manifest carried every event log inline (10.4 MB, 97% of its
  weight, downloaded by every visitor). Event logs moved beside their frames and are
  fetched on demand; the manifest went from 22 MB to 321 KB. 600 pre-rendered prediction
  overlays were dropped in favour of compositing source + labels on the canvas, which cut
  63 MB. The derived temporal payload went from 113 MB to 51 MB.
- The three validators that check this contract each held their own copy of the logic,
  which is why only one was updated when the shape changed. They now share
  `fslab.showcase.verify_temporal_prediction`, and the release gate derives its
  expectations from the registry so a new method cannot skip the sequence lane.

### Fixed (2026-07-27 audit)

- The App export panel printed `python -m fslab.pipeline infer --input <image-or-video>
  --method ... --output-root ...`. No such subcommand, no such flags, and the repository
  decodes no video anywhere. The panel now prints the command that exists and states
  plainly that per-file inference does not exist yet and that video is not read.
- Sequence replay started playing on mount. It now starts paused and stops when the tab
  is hidden, so a background tab does not advance frames and decode rasters.
- The sequence stage was 16/9 while the canonical frames are square, so it pillarboxed
  each 256 x 256 frame into a 813 x 459 box and used 56% of its own width. The stage now
  matches the source aspect and the frame fills it.
- Version drift. `VERSION` held the semver form `0.4.0` instead of the display form
  `0.04.000` required by ADR-0068, the release report hardcoded the version instead of
  reading `VERSION`, the footer rendered `v0.4.0`, and `app/__init__.py` still carried
  the template's `0.01.000`. `VERSION` is now the single source and the report fails on
  any disagreement between it, `pyproject.toml`, `frontend/package.json` and
  `fslab.__version__`.
- Added `scripts/check_template_residue.py` (ADR-0057), missing since instantiation, and
  wired it into CI. It caught template text in `.vscode/settings.json`.

### Rebuilt

- Replaced the browser-only product framing with a complete offline-first
  processing, training, inference, calibration, evaluation, export, temporal,
  visualization, and release-evidence pipeline.
- Implemented and evaluated the full C1-C7, L1-L7, N1 method registry.
- Added a leakage-resistant 384-sample v2 dataset with latent-group isolation,
  appearance twins, validation, calibration, and untouched test splits.
- Trained all trainable methods and ran foundation models on the available RTX
  4070 CUDA device; added portable ONNX artifacts and parity reports where
  applicable.
- Added official Cellpose-SAM, StarDist, Ultralytics YOLO segmentation, and
  Meta SAM2.1 image/video integrations with upstream provenance and checksums.
- Added exact-ID temporal tracking and SAM2 video propagation evidence.
- Added a unified method benchmark, release inventory, expanded framework wiki,
  and companion-web comparison matrix. No beyond-SOTA claim is made.

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
