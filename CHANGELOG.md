# Changelog

## [0.06.000] · 2026-08-02 (work 2026-08-01 to 2026-08-02)

On `develop`. The release gate still reports `complete: false` with the single settled
error: no accepted licensed real **froth** held-out source exists. This cycle changed no
learned weight and corrected three things that were producing invalid numbers.

### Two trainers were discarding the model they had just measured

`train_multitask.py` and `train_unet.py` computed a validation loss every epoch, appended
it to `history`, and rewrote `checkpoint.pt` unconditionally. The file therefore always
ended holding the LAST epoch whatever the curve did, and nothing consulted the curve. The
three published LamellaStar members were exported 67 epochs past their minimum:

| model | epochs | best | exported | penalty |
|---|---|---|---|---|
| lamellastar seed 20260725 | 120 | 53 | 120 | +30.2% validation loss |
| lamellastar seed 20260726 | 120 | 57 | 120 | +30.8% |
| lamellastar seed 20260727 | 120 | 51 | 120 | +25.1% |
| gc-fsegnet-v1 | 16 | 15 | 16 | +15.3% |
| unet-watershed-v2 | 24 | 22 | 24 | +2.0% |

**R-1 retrained all six to recover what was thrown away, and the answer is a NULL.** The
corrected ensemble scores validation mean AP 0.521188 against the published 0.524000,
worse on 37 of 64 images. Per member the effect has no consistent sign: -0.0044, +0.0151,
-0.0109, averaging 0.5019 against 0.5020. A pixel-wise multitask loss and an
instance-level AP after a calibrated watershed decode are different objectives, and the
overfitting visible in the first does not appear in the second. **No published weight
changed.** The trainers are fixed anyway, because a trainer that ignores its own
validation curve could land anywhere on it next run.

Four of six trajectories reproduce bit-for-bit. `gc_fsegnet` and `deep_marker_watershed`
diverge from EPOCH 0, which is code drift rather than randomness: `_loss` gained a
foreground Dice term at 2026-07-26 10:58 and those two were trained at 22:56 and 22:57 the
night before. The U-Net was also trained before it and still reproduces, because it runs a
different trainer whose loss never changed. Their published EVALUATIONS reproduce exactly
under today's code, 0.00e+00 over 64 of 64 cases, so the shipped numbers are sound; only
the path that would regenerate those weights has drifted.

### C3 was flooding one surface with a depth measured on another

`C3_H_MAXIMA` stayed at 0.06 when C3's flooding surface moved from `neg_edt` (pixels of
distance) to `neg_gray` (normalized intensity) earlier the same day. A depth carries the
units of the surface it is measured on. The comment on that line had even been corrected
to say "intensity" while the number still described the distance transform.

Selected on the validation split, which no classical constant sweep had ever touched, and
confirmed on untouched reserve slice p4: mean AP **0.2191 to 0.2976**, paired +0.0785 with
a 95 percent interval of [+0.0604, +0.0984] and 59 of 64 images improved.
**Stated cost: boundary RECALL falls 0.9638 to 0.9524, worse on 60 of 64 images and better
on none.** Precision rises enough that boundary F still gains +0.0459.

Consequences, all re-measured rather than inferred:

- **C3 now leads the classical tier on every recorded axis**: AP 0.2975, PQ 0.5423,
  boundary F 0.9236, BSD W1 2.037, count error 64.9, d32 0.1098. Neither C7 nor C4 moved.
  The "head of the tier is split" reading that ran through the docs, the App and both
  languages of the Methodology page is retired.
- **Canonical scene**: 300 predictions to **202 against 197 true bubbles**, AP 0.321 to
  0.521, and C3 now leads AP, AP50, AP75 and BSD W1 together there.
- **The Pareto frontier gains a member**: C1, C3, C7, L1, L2, N1. C4 leaves, dominated.
- **The SAM comparison REVERSES.** Mean classical floor 0.351 to 0.402; the untuned
  SlimSAM prompt grid goes from +0.014 on 5 of 12 cases to **-0.037 on 4 of 12**. Nothing
  about SAM was re-measured; the thing it is compared against got better.
- **Temporal**: five-sequence mean HOTA 0.653 to 0.761, because identity association is
  driven by instance count.
- **Real adjacent domain**: 0.128 to **0.216**. This is the only evidence here that the
  correction is not a synthetic artefact, since it was selected and confirmed on synthetic
  data and still helps on real photographs it was never fitted to.

The post-adoption recheck independently places the new depth at the grid optimum. It also
flags `FOREGROUND_OTSU_FACTOR`, where 0.60 scores +6.42 percent on C3. **Not adopted**:
that study runs on the burned test split and, unlike the depth, the Otsu factor has no
unit-change argument behind it.

### ms/image was never a measurement

One field carried three different quantities: a single un-repeated pass for the classical
tier, eval-loop per-case timings for the trained rows, and for L5/L6/L7 a wall-clock
division. Across committed bakes of identical code the same method moved by up to x2.74.

`fslab.science.timing` adds a warmup, repeated passes, a per-image median, a fixed matmul
canary that measures the machine, and a stability verdict; `measure_inference_timing.py`
times every method through the same `frame_predictor` the App uses, in one process, with
model loading outside the timed region. Measured on an idle machine (canary 1.762 ms), all
stable, CVs 0.005 to 0.047.

**The two rows that were never measured were wrong in opposite directions:**

| | measured | published | |
|---|---|---|---|
| L6 `yolo_froth_seg` | **140.43 ms** | 300.91 | overstated **2.14x**; the run included its own TRAINING |
| L5 `cellpose_sam` | **486.54 ms** | 324.53 | understated **1.50x** |

Every classical row landed within 0.99x to 1.14x of its previous value, so the protocol
change moved only the rows that were never measured. L7 is recorded as having no
unprompted single-image lane instead of receiving a divided wall-clock.

The module also documents what its controls CANNOT catch: a steadily busy machine produces
LOW inter-repeat variance, so `stable: true` means the machine did not move during the
run, never that it was idle. Within one artifact, method-to-method comparison holds
regardless, which is what makes the frontier valid; across artifacts, absolute ms are only
comparable when the canaries agree.

### The browser twin carried the same stale constant

`frontend/src/classical/methods.ts` passed 0.06 to `hMaxima` as well, so both engines
over-segmented together and `classical-live-parity.json` stayed green throughout: parity
compares the twins to EACH OTHER. `tests/test_classical_twin_constants.py` now reads the
literals out of the TypeScript and asserts them against `fslab.science.segment`, against
the source of truth rather than the other copy. Re-validated after both sides moved: C3
browser 0.3049 against offline 0.3037, boundary F agreement 0.9977.

### Defects found in this cycle's own new code

A five-dimension adversarial audit with per-finding refutation raised 44 findings and
confirmed 30. Eleven were defects in the new code and are fixed, including: the resume
comparison rejecting every checkpoint the fixed trainer wrote; the timing artifact being
written BEFORE the stability gate raised, so a rejected measurement sat on disk as a valid
file; `.detach().cpu()` aliasing live parameters on the CPU path so "best" would export
the last epoch; `repeats=1` yielding `stable: true` from a zero-variance sample of one;
and a rebake plan that omitted four artifacts carrying C3 numbers, which would have turned
a measured -0.081 transfer delta into a fabricated -0.170 while every step reported ok.

Three of the audit's own refutations were overturned on a closer read, including the
steady-load blind spot documented above.

## [0.05.000] · 2026-08-01 (work 2026-07-28 to 2026-08-01)

On `develop`. The release gate still reports `complete: false`: BBBC038 satisfies the
real-data lane for the adjacent domain only, and the blocker is specifically a licensed
real **froth** held-out source, which no search has yet found.

### Adopted (2026-08-01): two classical defaults, both on their primary source

Phase 1 swept every constant in the classical critical path and changed nothing, because every
sweep ran on the observed 64-image test split. Two of those constants have now moved, and neither
moved for winning its sweep. Each moved because the engine was not implementing the froth method its
own registry entry documents, and each was confirmed BEFORE and AFTER on an untouched reserve slice
that no sweep had seen (`verification/phase1-adoption.json`; slice spend in
`verification/reserve-slice-ledger.json`, which now shows 3 of 5 slices burned).

- **C3 `watershed_hmax` floods `neg_gray`, was `neg_edt`.** Flooding the negated grayscale from
  h-maxima markers is the method Sadr-Kazemi & Cilliers 1997 publish
  (`10.1016/S0892-6875(97)00094-0`), the source C3 already cited; it had been flooding the negated
  distance transform, which is C4's surface, so C3 and C4 differed only in their markers. Held-out
  AP 0.1031 to 0.2196, PQ 0.2490 to 0.4409, boundary F 0.8323 to 0.8817, d32 relative error 0.4311
  to 0.1907. On the reserve slice the paired mean AP delta is +0.1147, bootstrap 95 percent interval
  [+0.0919, +0.1391], 59 of 64 images improved.
- **C7 `valley_edge` runs `mode="watershed"`, was `"subtract"`.** The constrained watershed of
  Meyer 1994 (`10.1016/0165-1684(94)90060-4`), at the UNCHANGED seam radius 3. Held-out AP 0.1673 to
  0.2326, PQ 0.3632 to 0.4382, boundary F 0.8628 to 0.8837. Reserve paired mean AP delta +0.0643,
  [+0.0539, +0.0748], 60 of 64 improved. **Stated cost: d32 relative error gets WORSE**, 1.2584 to
  1.4371 on the test split and 1.3160 to 1.4972 on the reserve, because growing every cap back to
  the seam ridge enlarges bubbles C7 already over-estimated.

C7 now leads the classical tier on AP, C3 is second, C4 third. Nothing else moved: C7's seam radius
and watershed line, C4's compactness and the shared 0.75 Otsu factor are all recorded as deliberate
defaults with their sweeps as evidence, because a higher number on the split the number was read on
is not a reason.

Everything downstream was re-baked from the new defaults: `classical-heldout.json`, the 13 canonical
per-case bakes, `method-benchmark.json`, the C3/C7 temporal reports, all 180 showcase artifacts, the
real-adjacent benchmark, `sam_benchmark.json`, `classical-live-parity.json`, `method-registry.json`
and `release-report.json`. `check_artifacts.py`, `validate_classical_live_parity.py` and
`check_product_completeness.py --profile development` all accept.

**`sam_benchmark.json` was the artifact this re-bake nearly missed, and it carried the largest
published change of the whole adoption.** Its `floor_ap` per case is the BEST classical method on
that case, read from `data/derived/synth/<case>/benchmark.json`, so re-baking the per-case files
moved it without touching one SlimSAM prediction. C7 took the floor on 8 of the 12 scored cases and
C3 on 3, leaving `watershed_dt` holding only `mono-clean`. Mean floor AP **0.262 to 0.351**, mean
SAM advantage **+0.103 to +0.014**, SAM wins **10 to 5** of 12. The glare headline, the one
operational win the study was quoted for, goes from 0.407 against 0.081 (a 5x gap) to 0.407 against
0.182 (2.2x). Corrected in `docs/cases/01_coverage.md`, `docs/guides/03_verify-sam.md`,
`docs/guides.md`, `docs/frameworks/01_transformers-js/`, `docs/frameworks/06_pycocotools/`,
`docs/frameworks/03_scikit-image/`, `docs/frameworks/07_unet-watershed/` and the Experiments page.

Two more corrections from the same sweep:

- **The real-domain transfer count changed from six of seven classical methods improving to five**,
  at a tier mean of **+0.070** rather than +0.088, because C3 now falls on that split (0.220 to
  0.128) alongside C2. `current_bar.leader_note` in `build_method_benchmark.py` had also been
  rewritten to say the in-repo trained mean was -0.180; that figure is the mean over all seven
  learned and foundation rows, which do not all degrade. It is back to **-0.243** over the six
  in-repo trained models, which the adoption did not move at all.
- **The classical `ms/image` column is a timing of its bake, not of the algorithm.** It moved again
  on this re-run (C1 6.2, C2 103.5, C3 39.7, C4 36.7, C5 40.2, C6 673.8, C7 26.3) and the docs now
  say so instead of explaining one bake's drift as a machine load story.
- **"C7 has the tier's worst d32 relative error" was false** where the adoption cost was stated. The
  classical d32 ordering is C3 0.1907, C2 0.5757, C6 0.7748, C4 1.1555, C7 1.4371, C5 1.9224, C1
  5.0063, so C7 is the worst of the three methods in contention on AP, not the worst of the tier.
  Corrected in the `segment.py` module docstring, `docs/methods/classical.md` and the Methodology
  page in both languages.

Found and fixed while re-validating the browser twins, older than the adoption:

- **The live `watershed` invented instances outside the froth mask.** It seeded its output with every
  marker pixel and never cleared the ones lying outside the mask, while skimage's masked watershed
  returns 0 there. C3's h-maxima markers sit on any bright speck, so C3 carried the whole error at
  **1.2420x the offline instance count in every parity run since the artifact was first committed**.
  Flooding the EDT had hidden it by merging the surplus markers into shared basins; flooding the
  negated image gave each one a basin and broke the gate. After the fix, C3 parity is the best it has
  ever been: mean AP delta 0.0020 (was 0.0193), browser-vs-offline mask IoU 0.9343 (was 0.5226),
  instance-count ratio 1.0011. A FIFO insertion-order tiebreak was added to the twin's flooding heap
  in the same change, which is what decides a plateau; it took C4's IoU agreement 0.6625 to 0.7056.
- **The C7 registry row is renamed back to "Lamella-valley constrained watershed"** with Meyer 1994
  as a real provenance. It had been renamed to "dark-seam detector" on 2026-07-31 by a Phase 0
  honesty pass *because the engine ran no watershed*; the adoption resolves that mismatch from the
  other side, by implementing the method.
- **The N1 temporal row in `docs/temporal/02_the-full-method-matrix.md` was stale** and unrelated to
  this work: it read 0.926 HOTA against the artifact's 0.961, and a 0.843 five-sequence mean against
  0.917. Found by rebuilding the whole table from the artifacts instead of editing the two rows that
  moved.

Recorded and NOT repaired, because it is a real result: on the adjacent real domain (BBBC038 cell
nuclei) the two changes disagree. C7 improves, 0.193 to 0.301, and C3 gets WORSE, 0.182 to 0.128.
C3's adopted surface is a froth mechanism that assumes a specular highlight per object and a dark
Plateau border between objects, and nuclei have neither. The adoption stands, because it was made on
a froth source and confirmed on a froth surface and that split supports no froth statement, but
nobody should read C3's froth gain as evidence the surface is generally better.

### Rebuilt (2026-07-29, second pass): the App composes the shell instead of re-deriving it

The first pass was built from memory of the ADRs rather than from the ADRs and the reference
app, and it was rejected. ADR-0017 is explicit: "the reference app is CAOS_RotorVitals ...
mirror it, do not re-derive." This pass mirrors it.

- **The shell's `Tabs` primitive replaces the hand-rolled tab strip** in both lanes. ADR-0016
  §6 and ADR-0017 §1.1 say to use the shell primitives and never redefine them; every doc page
  in this repo already imported `SubTabs`, and the App was the one page that did not.
- **The layout is the reference's**: `page-body fs-layout`, `aside` plus `1fr` main, and the five
  CSS rules that make a workbench fill the viewport. The `useViewportFit` hook is deleted. It
  measured the shell header and footer at runtime with a ResizeObserver and a MutationObserver
  to work around a 48px footer margin that the reference simply sets to zero, and it was what
  produced the dead band under the content.
- **Tab groups are named for the question**, not the noun: "What did it find?", "How big are
  they?", "How good is it?", "What state is the froth in?", "Which method wins?", "Where did
  this come from?". Groups holding more than one view render the shell's `SubTabs` inside the
  panel, so only the current group's views appear (ADR-0071 §5).
- **The stage is two panes.** A square frame in a 1220px stage has a ceiling of the stage height
  squared, so it cannot reach the ADR-0071 §8 majority on its own and the remainder was empty
  background. The still lane now shows the mask beside its readouts and its size distribution;
  the replay shows the frame beside its per-frame provenance and sequence metrics.
- **Focus mode corrected to the ADR-0070 style spec**: the HUD is a vertical column at the left
  edge below the label with the value read before its label, the exit control is at the
  top-right of the stage, and the rail runs title and id, mode toggle, controls, provenance note
  naming the models and their sources, then the scenario chips.

Fixed in the same pass, all found by looking at rendered screenshots rather than at gate output:

- In light theme the replay HUD values rendered dark-on-dark and the transport step arrows
  white-on-white. Setting the colour on the KPI wrapper was not enough; the value and label
  elements carry their own theme colours and won.
- The replay's "view" row reported the scenario name, not the view.
- A `display: flex` on `.tabpanel` outranked the shell's `[hidden]`, so all five sequence panels
  rendered stacked at once and the frame was squeezed to 7% of the viewport.

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
