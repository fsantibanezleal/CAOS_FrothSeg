# Changelog

## [0.06.004] · 2026-08-03

Evidence and correction. No engine constant, weight, artifact value or published metric changed.

### R-3: the classical tier's residual constants were studied, and the answer is a null

R-2 selected and confirmed C3's flooding depth and left the other six classical methods untuned,
so the published classical ranking compared one tuned method against six untuned ones. R-3 gave
every affected constant the same treatment under one protocol: `FOREGROUND_OTSU_FACTOR` (common
mode, all seven methods), `C2_MIN_DISTANCE` and `C5_H_MINIMA`. Selection ran on the calibration
split, which the pipeline contract designates for calibrating post-processing and which no
classical sweep had consulted. Confirmation was one read of generation-2 slice `l1` (512 images,
256 latent geometry groups).

**Not adopted.** The two clauses fixed before the read split:

| clause | result |
|---|---|
| primary: tier mean improves, p < 0.05 | PASS, +0.02172, t=20.4, p=1.2e-55 |
| no method regresses detectably | FAIL, C3 loses 0.0211 against a floor of 0.0175 |

`FOREGROUND_OTSU_FACTOR` stays 0.75, `C2_MIN_DISTANCE` stays 2, `C5_H_MINIMA` stays 0.08.

The reason is worth more than the adoption would have been. An unweighted tier mean is the wrong
criterion for a common-mode constant over a heterogeneous tier. C3 leads the tier at 0.30 and peaks
at an Otsu factor of 0.60; the tier mean peaks at 0.80 only because C5 (0.15) and C2 (0.02) are
still climbing there. Optimising the average bought gains on methods out of contention by moving
past the optimum of the method the tier is judged on. C3's configuration was identical in both
arms, so its regression is attributable to the Otsu move by the design of the comparison rather
than by any further read.

Three further findings, recorded rather than repaired:

- Phase 1 declared five foreground dependants and swept this common-mode constant on those. **All
  seven respond**: across the grid ends on one calibration image, C2 moves 1108 to 922 instances
  and C6 moves 250 to 611.
- `C2_MIN_DISTANCE` and `C5_H_MINIMA` both select onto a **grid endpoint** with a monotone trend,
  so the Phase 1 grids do not bracket their optima. Reported as unresolved boundaries, not extended
  after the fact.
- The calibration surface independently agrees with the burned test split that C3 prefers 0.60.
  Resolving its +0.0163 needs **295 independent groups**; the largest reserved slice has 256. No
  existing surface can settle it, and adopting 0.60 for C3 alone would mean per-method foreground
  thresholds, an architecture change rather than a constant move.

### Reserve slices are sized by geometry group, not by image (supersedes 0.06.003)

Each latent geometry group is rendered as two appearance variants that share one geometry, so the
two images of a group are one observation rendered twice. Generation 2 computed each slice's
advertised resolution from its image count, overstating every tier by sqrt(2), and a per-image
paired t-test claims about twice the degrees of freedom the design supplies.

| tier | groups | images | resolves | 0.06.003 claimed |
|---|---|---|---|---|
| S | 16 | 32 | 0.0700 | 0.0495 |
| M | 64 | 128 | 0.0350 | 0.0247 |
| L | 256 | 512 | 0.0175 | 0.0124 |

The samples were never wrong; only the claim about what they could resolve was. No generation-2
slice had been read, so nothing was voided, and the archive rebuilds byte-identical from the same
seeds. The ladder still covers every effect on record, but the fine end is now a thin margin rather
than a comfortable one.

### The settled confirmations were re-checked at group level, and all survive

| study | delta | corrected floor | margin | p |
|---|---|---|---|---|
| Phase 1 C3 flooding surface | +0.1147 | 0.0495 | 2.3x | 2.3e-07 |
| R-2 C3 flooding depth | +0.0785 | 0.0495 | 1.6x | 2.2e-06 |
| Phase 1 C7 mode | +0.0643 | 0.0495 | 1.3x | 1.4e-09 |

No conclusion changes. The margins are 1.3x to 2.3x rather than the comfortable multiples the
image-based sizing implied. This re-decides nothing: each adoption is already published and already
spent its slice, and recomputing a deterministic statistic over the same fixed configurations on
the same fixed rows is not a second look.

Each reconstruction is asserted against its published mean to 1e-6, and that assertion caught two
defects that would each have produced a believable wrong number: letting `h` fall through to
today's 0.12 measured the C3 surface question on an engine the original study never ran (+0.1743
against a record of +0.1147), and assuming one slice per change read `p2` for C7 when both Phase 1
changes were confirmed together on `p1`.

### Guards

Six on the R-3 null, all mutation-tested, because a null has no failing number to notice if the
record drifts. One on the sizing basis, which fails if a published resolution ever matches the
image count again. Fixes a generation-1 ledger guard that raised a KeyError the moment a
generation-2 slice was spent, and that would have applied generation 1's budget to entries it never
reserved.

## [0.06.003] · 2026-08-03

Infrastructure. No engine, weight, artifact value or published number changed.

> **The resolution figures in this entry are superseded by 0.06.004.** They were computed from
> image counts; the independent unit is the latent geometry group, of which each slice holds half
> as many. Every figure below is optimistic by a factor of sqrt(2).

### Reserve slices are now sized by the effect they must resolve

The five generation-1 slices were 64 samples each because that is the size of the burned
test split. Sizing a confirmation surface by the surface it REPLACES rather than by the
effect it must RESOLVE was wrong in both directions.

Per-image SD of the paired AP delta, measured on the three confirmations that actually
spent a slice: 0.0426, 0.0774, 0.0965. At a conservative sigma of 0.10, 80 percent power,
alpha 0.05 two-sided:

| n | resolves |
|---|---|
| 32 | 0.050 |
| 64 | 0.035 |
| 128 | 0.025 |
| 512 | 0.012 |

Those three adoptions measured +0.115, +0.079 and +0.064, needing n of **6, 13 and 19**.
Each was given 64, so each was three to ten times over-powered. The one question left open,
`FOREGROUND_OTSU_FACTOR` at about +0.019 on C3, needs **n=218** while the single unspent
generation-1 slice holds 64: **it cannot settle the question it would be spent on.**
Over-powering wastes compute; under-powering is worse, because a slice that cannot resolve
the effect returns "not confirmed" for a real change and "confirmed" only when noise
cooperates.

**The scarce resource was never samples.** These scenes are synthetic and seed-addressable
and the archive is gitignored and rebuilt from seeds, so supply constrained nothing; the
five-slice cap simply tied the budget to a study count guessed in advance. What is limited
is how many times a surface may be consulted before a false positive is likely, which is an
alpha budget and belongs in the ledger. Minting a fresh slice because the last one
disappointed is exactly the failure this machinery exists to prevent, and free disk does not
stop it. The pre-registration does.

**Generation 2: 14 slices, 1792 samples, three tiers.**

| tier | count | n | resolves | use |
|---|---|---|---|---|
| S | 8 | 32 | 0.050 | direction and sanity checks |
| M | 4 | 128 | 0.025 | the DEFAULT for adopting an engine default |
| L | 2 | 512 | 0.012 | required below 0.025; needing it is itself a finding |

Every slice stays stratified over all 16 conditions, so it is read on the same footing as
the split it stands in for. The tier is chosen from the pre-registered EXPECTED effect,
before the read; choosing n afterwards is selection by another name. A confirmation on a
slice whose resolvable delta exceeds the observed effect is reported inconclusive, never as
a refutation.

Generation 1 is untouched: separate archive, seed base 3,000,000 against its 2,000,000
block, with zero overlap verified on seeds AND on latent geometry groups against both the
working matrix and generation 1. p5 remains unspent and usable for anything at or above
0.035.

`tests/test_reserve_g2.py` recomputes every claimed resolution from n rather than trusting
it, checks the archive and per-slice id hashes, asserts the tier ladder has no hole between
the largest effect adopted and the smallest still open, and pins that generation 1 is
byte-identical. Mutation-tested against four ways of getting it wrong.

## [0.06.002] · 2026-08-02

A six-dimension adversarial validation of the whole product raised 44 findings and
confirmed 40 after per-finding refutation. This release acts on all of them. The most
serious was a **false scientific justification that had shipped in a tagged, deployed
release**, and it was mine.

### The R-2 justification was false and is withdrawn

`C3_H_MAXIMA` was changed 0.06 to 0.12 on 2026-08-01 and published as a **unit error**: a
depth supposedly left in pixels of distance transform after C3's flooding surface moved
from `neg_edt` to `neg_gray`. On that basis the change was declared exempt from this
repository's own rule that classical constants are not re-selected on scores, and the
deployed Methodology page stated, in both languages, "None of the three changes was
adopted for winning a sweep."

**That justification is false, three independent ways.**

1. The depth is applied to the INTENSITY image and always has been.
   `segment.py:184` is `morphology.h_maxima(gray, h=h)`; the flooding surface enters one
   line later as the first argument of `segmentation.watershed`. No depth is ever applied
   to the flooding surface, in any commit that has touched that file. The surface change
   cannot have altered a constant whose units it never set.
2. The evidence quoted as proof is surface-invariant. "29248 predicted against 17846 true,
   a 64 percent over-segmentation" is what `data/derived/phase1/c3-flooding-surface.json`
   records at h=0.06 for ALL FOUR surfaces, identically. That was C3's marker count.
3. The supporting anecdote was backwards. The claim that the comment "had even been
   corrected to say intensity while the number still described the distance transform" is
   contradicted by the last commit before the surface adoption, which already read "in
   units of the [0, 1] intensity image". The comment was never wrong.

**What R-2 actually is:** `best = max(scores)` over validation mean AP. Selection on a
score. It is disciplined tuning, because the selection surface is a split no classical
sweep had observed and the effect was confirmed on an untouched reserve slice, and
**every measurement stands unchanged**: AP 0.2191 to 0.2976 on reserve p4, paired +0.0785,
95 percent interval [+0.0604, +0.0984], 59 of 64 images improved, boundary-recall cost
stated. What does not stand is the stated reason, and the exemption it bought.

**The consequence that matters scientifically: the classical tier is not uniformly tuned.**
C3 is the only classical method whose residual constant was re-selected. C2
`min_distance` 6 scores 0.0998 against the shipped 2's 0.0173, and C5 `h` 0.02 scores
0.1819 against the shipped 0.08's 0.1330, both larger unclaimed gains than the one C3
took. Every place that claims C3 leads the classical tier now says so. Making the
comparison like-for-like is a new study that would spend the last reserve slice and has
not been done. Full account: CAOS_MANAGE
`plans/frothseg/research-2026-07-31/r2-correction-2026-08-02.md`.

### Artifacts that disagreed with the engine

- The **constant ledger** hardcoded `published_value: 0.06` while the engine shipped 0.12,
  in a file regenerated AFTER the change. It now reads every value from the engine, carries
  status `adopted` with `decision_evidence` and `decision_basis`, and a test asserts ledger
  values equal the engine's bound defaults.
- The **baseline-reproduction certificate** recorded only a PATH, so re-baking
  `classical-heldout.json` let a reproduction claim made about different bytes carry over.
  It now pins the reference sha256 and the 13 engine constants it ran under. Re-verified:
  all seven engines identical.
- **`release-report.json` shipped stamped 0.5.0** while the deployed tag was v0.06.001,
  because the rebake driver runs `build_release_report` BEFORE the version bump it reads.
  The driver now warns, and a test fails if the report and VERSION disagree.
- The **adoption record** carried C3's off-domain "after" as 0.1278, superseded since the
  depth correction, beside a hardcoded "WORSE off-domain" verdict. It now carries both
  values and the engine state each was measured under.

### A metric that published "perfect" for measuring nothing

L7 published mean event precision, recall and F1 of **1.000**, from
`event_tp == event_fp == event_fn == 0`: the vacuous branch. It is prompted with the exact
first-frame masks and predicts no births or disappearances, so "no events at all" rendered
as flawless event detection in the same column where fourteen other methods publish
measured values. The metric now returns `None`, means exclude null rows and report how many
sequences had no events, and L7 reads null with 5 such sequences. Its honest number, mean
identity IoU 0.8985, is unchanged.

### Gates that could not catch their target

- `frothseg-focus-flow` measured `canvasPct` and left it out of the pass condition, so a
  focus view with a full-size stage and a canvas that never mounted, a blank stage, passed
  at every viewport in both themes.
- `frothseg-content-depth` computed `captioned` and asserted the raw equation count, so a
  floor documented as ">=3 CAPTIONED equations" was met by bare formulas.
- The timing invariants **skipped silently** when `inference-timing.json` was absent, so
  deleting it disabled the compute-axis provenance and stability checks at once. Now a hard
  failure, with coverage of every published method asserted.
- The twin-constant gate bound 3 constants and omitted the three common-mode FOREGROUND
  constants every method consumes, plus C7's seam radius. Now 7, all four new bindings
  mutation-tested.
- The parity staleness gate hashed 2 files while the twin's actual algorithms live in
  `gray.ts` and `watershed.ts`. Now all four sources.
- `build_method_benchmark` silently kept a per-bake timing when a predictor failed to LOAD.
  It now raises.

### Claims corrected

- The Methodology page published **h = 0.06** as C3's shipping value in seven rendered
  places across both languages, including the KaTeX formula, while the engine ships 0.12.
- Two architecture docs still named **Cellpose-SAM the leader** at 0.5099 with N1 "not
  exceeding" it. N1 leads at 0.5186, and both now carry the caveat that the +0.0087 margin
  is smaller than the 0.0118 ensemble spread, so the two are not distinguishable.
- The benchmark's generated note claimed the replaced `neg_edt` surface "was the better
  surface" off-domain. It held at 0.182 against 0.128; the shipped engine now reaches 0.216
  there, above 0.182, so it is false. The transfer DIRECTION survives, the surface ordering
  does not.
- **"The single method never trained in this repository"** was the causal explanation of the
  entire domain-transfer result, and L5 was fine-tuned here for 2 epochs on the same 192
  samples. The mechanism is a strong external prior lightly adapted, not the absence of
  training.
- The temporal matrix carried C3's pre-correction row and rank; the SAM coverage bullets
  implied wins its own table records as losses; C5's splits are 1.7x fewer than C3's, not
  2.7x; L7 sits below three classical baselines, not two; C3's false-event count is 258,
  not 2292; the showcase is 180 pairs, not 195; L1's ID-switch rate is 0.0084, not 0.0093.

### The process failure worth keeping

An exemption from a discipline was granted on the strength of a mechanism that was never
checked against the code. The measurement that followed was careful: pre-registered,
selected off-surface, confirmed on a reserve slice, costs published. None of that rigour
was applied to the one sentence that authorised it. A justification is a claim about the
code and has to be verified against the code like any other.

## [0.06.001] · 2026-08-02

Patch. No engine, weight or artifact value changed. This corrects prose that was still
asserting pre-correction numbers after 0.06.000, and adds the check that would have caught
it before the release rather than after.

A cross-check of every published metric against the artifact that owns it found 23
suspicious claims. The artifacts all agreed with each other; the prose had lagged.

**Six places still told the reader the SlimSAM prompt grid BEATS the classical floor.**
It loses to it: 0.365 against 0.402, winning 4 of 12 scored cases. That included the
per-case table in `docs/guides/03_verify-sam.md`, now regenerated from the artifact, plus
`docs/guides.md`, the transformers-js and pycocotools framework docs and the Experiments
page in both languages.

Also corrected: C3's AP, PQ, boundary F, BSD W1 and d32 across the Methodology page in
both languages, including a Wasserstein ordering that listed C3 at 3.626 between two
methods it now leads at 2.037, and a sentence still saying C7 leads the classical tier;
L5 at 324.5 ms and N1 at 98.8 ms on the Implementation page, where L7's 972.4 ms is kept
and now carries the reason it is not an inference measurement; and C3's transfer delta in
the Introduction provenance comment.

**One false positive, acted on before it was checked.**
`docs/frameworks/07_unet-watershed` cited 0.351 as the best classical CANONICAL DIAGNOSTIC
mean AP, not the SAM floor, and it was briefly rewritten to say L1 no longer exceeds the
floor. L1 does exceed it, 0.4565 against C3's 0.3506 on that 13-case diagnostic. The
sentence now says so, and says the margin narrowed because C3 improved rather than because
L1 moved.

The flooding-surface sweep table in `docs/methods/classical.md` keeps its h=0.06 numbers,
because holding the depth fixed is what makes the four surfaces comparable, and now carries
an explicit note that none of them is C3's current score.

`tests/test_published_numbers_agree.py` adds six assertions on relationships that hold by
construction rather than pinned literals, so a failure is a real inconsistency and never a
stale expectation: classical-heldout agreeing with the benchmark rows copied from it; the
compute axis being the measured timing; no derived wall-clock division labelled as a
measurement, and any that ships carrying its reason; no unstable timing reaching the
compute axis; the SAM summary matching its own scored cases; and both sides of the
domain-transfer subtraction coming from one engine. Verified non-vacuous by mutation.

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

### C3's flooding depth was re-selected on validation

> **Corrected 2026-08-02.** This section originally described the change as a UNIT ERROR,
> the claim being that the depth had been left in distance-transform units after the
> flooding surface moved. That justification is FALSE and is withdrawn. `h` is applied to
> the intensity image by `morphology.h_maxima(gray, h=h)`; the flooding surface enters
> separately and no depth is ever applied to it, in any commit of `segment.py`. The
> 29248-against-17846 over-count quoted as proof is identical on ALL FOUR flooding surfaces
> at h=0.06, so it was the marker count and not a surface effect. The change is SELECTION ON
> A SCORE: 0.12 is the argmax of validation mean AP. That is disciplined tuning and the
> measurement below stands unchanged; the stated reason for it did not. It also means the
> classical tier is not uniformly tuned, since C2 and C5 keep defaults with larger unclaimed
> gains on their own sweeps. Full account: CAOS_MANAGE
> `plans/frothseg/research-2026-07-31/r2-correction-2026-08-02.md`.

`C3_H_MAXIMA` moved from 0.06 to 0.12.

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
