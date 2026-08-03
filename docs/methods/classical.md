# Classical segmentation tier (C1..C7)

> Correction 2026-07-31: earlier revisions of the canonical per-method numbers in this file came from a seed-42 bake that no longer exists. The shipped canonical case is seed 102; every canonical figure here now comes from data/derived/synth/poly-normal/benchmark.json.
>
> Adoption 2026-08-01: THREE engine defaults changed, so every classical number in this file was re-baked from the new defaults. C3 `watershed_hmax` floods the negated grayscale instead of the negated distance transform (Sadr-Kazemi & Cilliers 1997), and C7 `valley_edge` runs the constrained watershed instead of subtracting the seam (Meyer 1994); each was adopted on its primary source, not on a sweep score, and each was confirmed on an untouched reserve slice in `verification/phase1-adoption.json`. Later the same day C3's h-maxima DEPTH moved 0.06 to 0.12, selected as the argmax of validation mean AP and confirmed on reserve slice p4 (`verification/r2-c3-flooding-depth.json`). That third change was published as a unit correction; the justification was false and is withdrawn (CAOS_MANAGE `plans/frothseg/research-2026-07-31/r2-correction-2026-08-02.md`), and unlike the other two it did turn on a score.
>
> On the canonical scene C3 now leads at AP 0.521 with **202 predictions for 197 bubbles**, ahead of C7 at 0.458 with 166 and C4 at 0.401 with 177. Between the two corrections C3 sat at 0.321 with 300 predictions, so the depth was costing it a 52 percent over-count on this scene. An intermediate revision of this note reported C7 as the canonical leader, which was true of the engine at that hour and is not true now.

The classical ladder is the honest, no-training floor that the learned tier must beat. Every method runs offline
in `data-pipeline/fslab/science/segment.py` (the pre-validated Benchmark references). C1, C3, and C4 also have
validated TypeScript twins in the live App; C2, C5, C6, and C7 remain offline and appear on the web as committed
replay. Froth is hard for a specific reason: the boundaries between bubbles are dark, low-gradient valleys
(Plateau borders), while each bubble carries a bright specular highlight with high gradient, so gradient/edge and
threshold methods lock onto the highlight rings and over-segment. The ladder is designed to show this, term by
term.

| ID | Method | Mechanic (froth relevance) | Reference |
|----|--------|----------------------------|-----------|
| C1 | `otsu_cc` | Otsu global threshold, then connected components. Labels each connected bright region as one instance, so touching bubbles merge: the under-segmentation exhibit. | Otsu (1979), [doi:10.1109/TSMC.1979.4310076](https://doi.org/10.1109/TSMC.1979.4310076) |
| C2 | `watershed_immersion` | Immersion watershed on the morphological gradient, seeded at the gradient's own minima rather than at chosen object markers. It does NOT flood from every regional minimum: the seeds are local maxima of the negated gradient with a 2 px minimum separation, taken inside the froth foreground only, so closely spaced and out-of-mask minima are dropped. Each surviving specular highlight and texture dip is still a basin: the over-segmentation exhibit. | Vincent & Soille (1991), [doi:10.1109/34.87344](https://doi.org/10.1109/34.87344) |
| C3 | `watershed_hmax` | Highlight-seeded: h-maxima of the bright specular spots are the markers (each bubble usually carries one reflection); flood only from markers, and since 2026-08-01 the surface they flood is the NEGATED IMAGE, not the negated distance transform C4 uses. The canonical industrial froth trick; degrades under glare. Two provenances, both real: the markers and the flooded surface are the froth method, the flooding machinery is marker-controlled watershed. | markers and surface: Sadr-Kazemi & Cilliers (1997), [doi:10.1016/S0892-6875(97)00094-0](https://doi.org/10.1016/S0892-6875(97)00094-0); flooding: Meyer (1994), [doi:10.1016/0165-1684(94)90060-4](https://doi.org/10.1016/0165-1684(94)90060-4) |
| C4 | `watershed_dt` | Distance-transform markers (peaks of the EDT) + marker-controlled watershed (Meyer). The generic classical floor; strong on well-separated convex bubbles. | Meyer (1994), [doi:10.1016/0165-1684(94)90060-4](https://doi.org/10.1016/0165-1684(94)90060-4) |
| C5 | `watershed_hmin` | H-minima (extended-minima) suppression of shallow minima before flooding; cuts the C2 over-segmentation. The flooded surface is the distance map negated AND divided by its own per-image maximum, so `h` (default 0.08) is a FRACTION of that frame's deepest EDT value, not a depth in pixels: on a frame whose EDT maximum is 20 px it suppresses 1.6 px, and it suppresses a different physical depth on the next frame. | Soille (2004), [doi:10.1007/978-3-662-05088-0](https://doi.org/10.1007/978-3-662-05088-0) |
| C6 | `slic_merge` | SLIC superpixels + region-adjacency mean-intensity merge. A non-watershed over-segmentation primitive; superpixels snap to highlights more than to true seams. | Achanta et al. (2012), [doi:10.1109/TPAMI.2012.120](https://doi.org/10.1109/TPAMI.2012.120) |
| C7 | `valley_edge` | Lamella-valley constrained watershed: bubbles are delineated by the dark inter-bubble valleys, not the bright spots, so a black-top-hat isolates the seams and the enclosed caps are cleaned. Since 2026-08-01 those caps are MARKERS that flood the black-top-hat response back to the seam ridge (Meyer 1994), rather than being the instances themselves. Robust to highlights by construction; the domain-specific froth method. | Wang, Bergholm & Yang (2003), [doi:10.1016/j.mineng.2003.07.014](https://doi.org/10.1016/j.mineng.2003.07.014); Wang & Chen (2015), [doi:10.3390/min5020142](https://doi.org/10.3390/min5020142); flooding: Meyer (1994), [doi:10.1016/0165-1684(94)90060-4](https://doi.org/10.1016/0165-1684(94)90060-4) |

## Metrics (pre-validated against exact synthetic ground truth)

- **Mask AP / AP50 / AP75** (`mask_ap`): greedy IoU matching of predicted vs GT instances, averaged over IoU
  thresholds 0.5:0.05:0.95 (COCO style).
- **Panoptic Quality** (`panoptic_quality`): PQ = SQ x RQ, where SQ is the mean IoU over true positives (matched
  at IoU > 0.5) and RQ = TP / (TP + 0.5 FP + 0.5 FN). Returns the two froth-relevant error modes: split errors
  (one GT bubble covered by several predicted segments, over-segmentation) and merge errors (one predicted segment
  covering several GT bubbles, under-segmentation). Kirillov et al. (2019), [doi:10.1109/CVPR.2019.00963](https://doi.org/10.1109/CVPR.2019.00963).
- **BSD Wasserstein-1** (`bsd_wasserstein`): earth-mover distance between the predicted and GT bubble-diameter
  distributions, so a method is judged on whether it reproduces the true bubble-size distribution, not only per
  mask IoU.

## What the ladder shows, on the canonical scene (`poly-normal`, 197 GT bubbles)

Every figure in this table is read from `data/derived/synth/poly-normal/benchmark.json`, which carries AP, AP50,
AP75, BSD Wasserstein-1 and the prediction count. It does not carry PQ, merges or splits, so those columns are
not reproduced here rather than being restated from a bake that no longer exists.

| method | nPred | AP | AP50 | AP75 | BSD W1 |
|---|---|---|---|---|---|
| otsu_cc (C1) | 76 | 0.137 | 0.252 | 0.133 | 5.839 |
| watershed_immersion (C2) | 1519 | 0.005 | 0.017 | 0.002 | 10.683 |
| **watershed_hmax (C3)** | 202 | **0.521** | **0.839** | **0.596** | **1.071** |
| watershed_dt (C4) | 177 | 0.401 | 0.685 | 0.433 | 1.205 |
| watershed_hmin (C5) | 145 | 0.289 | 0.562 | 0.262 | 2.021 |
| slic_merge (C6) | 945 | 0.035 | 0.101 | 0.017 | 11.803 |
| valley_edge (C7) | 166 | 0.458 | 0.779 | 0.464 | 1.244 |

## What the ladder shows, aggregated (64-image held-out test split)

Read from `data/derived/method-benchmark.json` (`methods[].test` and `methods[].compute`), which is the aggregate
any tier-level claim has to be made on. One scene is not the tier.

| method | AP | PQ | boundary F | count abs. err. | BSD W1 | ms/image |
|---|---|---|---|---|---|---|
| otsu_cc (C1) | 0.0652 | 0.1706 | 0.8113 | 220.1 | 10.164 | **6.3** |
| watershed_immersion (C2) | 0.0173 | 0.0635 | 0.7424 | 849.3 | 7.393 | 117.7 |
| **watershed_hmax (C3)** | **0.2975** | **0.5423** | **0.9236** | **64.9** | **2.037** | 41.3 |
| watershed_dt (C4) | 0.1977 | 0.4022 | 0.8344 | 139.8 | 2.590 | 36.3 |
| watershed_hmin (C5) | 0.1330 | 0.2845 | 0.7968 | 176.5 | 16.568 | 44.4 |
| slic_merge (C6) | 0.0186 | 0.0721 | 0.7864 | 451.9 | 8.383 | 710.7 |
| valley_edge (C7) | 0.2326 | 0.4382 | 0.8837 | 114.2 | 3.542 | 27.6 |

The numbers match the froth literature on the two exhibits: the naive Otsu baseline under-segments (76
predictions for 197 bubbles on the canonical scene) and the gradient immersion watershed grossly over-segments
(1519 basins for 197 bubbles on the canonical scene, 71,918 predicted instances against 17,846 true ones over the
held-out split).

**The head of the tier moved twice on 2026-08-01, and both times because an engine was corrected rather
than tuned. After the second correction the reading is no longer split: C3 leads every recorded axis.**

| | AP | PQ | boundary F | BSD W1 | count error | d32 rel err |
|---|---|---|---|---|---|---|
| **C3 `watershed_hmax`** | **0.2975** | **0.5423** | **0.9236** | **2.037** | **64.9** | **0.1098** |
| C7 `valley_edge` | 0.2326 | 0.4382 | 0.8837 | 3.542 | 114.2 | 1.4371 |
| C4 `watershed_dt` | 0.1977 | 0.4022 | 0.8344 | 2.590 | 139.8 | 1.1555 |

This section previously reported the head of the tier as split, with C7 holding AP, boundary F and count
error and C4 holding BSD Wasserstein-1. That reading was true of an engine in which C3's flooding depth
was still expressed in the units of a surface C3 had stopped flooding. Correcting it (R-2, below) moved
C3 from 0.2196 to 0.2975 on AP and from 0.1907 to 0.1098 on d32, and took the remaining two axes from C7
and C4 with it. Neither C7 nor C4 changed; only the third row moved.

The full classical d32 ordering is now C3 0.1098, C2 0.5757, C6 0.7748, C4 1.1555, C7 1.4371, C5 1.9224,
C1 5.0063. C7 remains the worst of the methods that are in contention on AP, and that is still the honest
statement of its cost: it grows every cap back to the seam ridge and enlarges bubbles it already
over-estimated. What is no longer true is that the choice between the three depends on whether the
consumer is the mask or the size distribution. On this split it does not. What changed:

- **C3 now floods the negated grayscale**, the surface Sadr-Kazemi & Cilliers (1997) publish and the source
  the C3 registry entry already cited, instead of the negated distance transform, which is C4's surface and
  made C3 differ from C4 only in its markers. AP 0.1031 to 0.2196, PQ 0.2490 to 0.4409, boundary F 0.8323 to
  0.8817, d32 relative error 0.4311 to 0.1907. Better on every recorded axis except one: d90 relative error worsens, 0.1903 to 0.1906 on the test split and 0.1739 to 0.1914 on the reserve slice, which is a 10 percent degradation on the surface this repository publishes as the effect.
- **C7 is now the constrained watershed its registry entry always claimed** (Meyer 1994), so the caps grow
  back to the seam centreline instead of stopping short of it. AP 0.1673 to 0.2326, PQ 0.3632 to 0.4382,
  boundary F 0.8628 to 0.8837. **The honest cost: d32 relative error moves the WRONG way, 1.2584 to 1.4371.**
  Growing every cap back to the ridge enlarges every bubble, and C7 already over-estimated the Sauter mean
  diameter by a factor above 2, so the change makes the mask better and the size distribution worse.

Neither of THESE TWO changes, the flooding surface and the C7 mode, was adopted for winning a sweep. Both
were adopted because the engine was not implementing the source the registry cites for that method, and both were confirmed BEFORE and AFTER on an untouched reserve
slice that no sweep observed, in `verification/phase1-adoption.json`. Constants that only a sweep score would
have justified moving, C7's seam radius and watershed line, C4's compactness and the shared 0.75 Otsu factor,
did not move. The `ms/image` column moves on every re-bake because it times this machine on that day rather
than the algorithm; the column above is the 2026-08-01 re-bake recorded in `data/derived/classical-heldout.json`
and `data/derived/method-benchmark.json` `methods[].compute`, and it is not comparable across bakes. The
accuracy columns are.

All seven remain the references the learned tier (StarDist, U-Net+watershed, Deep-Watershed, and the novel
LamellaStar) must beat; see the learned-tier docs.

## The tier's constants, swept and recorded (2026-08-01)

Every classical engine carried undocumented literals, and five of the seven consumed one shared
`_foreground` mask built with a `threshold_otsu(gray) * 0.75` cut that Otsu 1979 does not supply. This
section records what happens when each of those constants is moved. The engines were parameterised so
that a constant can be swept without editing a call, and `verification/phase1-classical-sweeps.json`
carries the proof that all seven engines at their current defaults reproduce
`data/derived/classical-heldout.json` to within 1e-12 on AP, PQ, boundary F, BSD W1, count error and d32.

**Three of these sweeps ended in an adopted default and the rest did not. For two of them the difference
is not the score; for the third it is, and that was published wrongly and is corrected here.** `watershed_hmax.surface` and `valley_edge.mode` moved because the engine was not implementing
the froth method its own registry entry documents: C3 cited Sadr-Kazemi & Cilliers for markers while
flooding a surface that source does not use, and C7 had just been renamed away from "constrained
watershed" in a Phase 0 honesty pass precisely because it ran no watershed.

`watershed_hmax.h` then moved 0.06 to 0.12, and **this one moved because its score was higher.**

It was published on 2026-08-01 as a "unit error", the claim being that the depth had been left in the
units of the distance transform after the flooding surface changed. **That justification was false and
is withdrawn.** The depth is the `h` of `morphology.h_maxima(gray, h=h)`, applied to the intensity
image; the flooding surface enters separately as the first argument of `segmentation.watershed`, and no
commit in this file's history has ever applied a depth to it. The 29248-against-17846 over-count quoted
as proof is identical on all four flooding surfaces at h=0.06
(`data/derived/phase1/c3-flooding-surface.json`): it was C3's marker count, not a surface effect. Full
account: CAOS_MANAGE `plans/frothseg/research-2026-07-31/r2-correction-2026-08-02.md`.

What R-2 is, correctly described: 0.12 is the argmax of validation mean AP over a pre-registered 6-point
grid. The selection surface is the validation split, which no classical sweep had observed, and the
effect was confirmed on untouched reserve slice p4: mean AP 0.2191 to 0.2976, paired +0.0785 with a 95
percent bootstrap interval of [+0.0604, +0.0984] and 59 of 64 images improved. That is a disciplined way
to tune a constant. It is tuning.

**So the tier is not uniformly tuned, and the table above has to be read with that in mind.** C3 is the
only classical method whose residual constant was re-selected. From
`data/derived/phase1/residual-constants-sweep.json`, C2 `min_distance` 6 scores 0.0998 against the
shipped 2's 0.0173, and C5 `h` 0.02 scores 0.1819 against the shipped 0.08's 0.1330: both larger
unclaimed gains than the one C3 took. Making the comparison like-for-like is a separate study that would
spend the last unspent reserve slice, and it has not been done.
**Its stated cost: boundary RECALL falls 0.9638 to 0.9524, worse on 60 of the 64 images and better on
none, because coarser markers find fewer boundaries.** Boundary precision rises enough that boundary F
still improves by +0.0459. Evidence: `verification/r2-c3-flooding-depth.json`.

Every other constant stayed, including ones whose sweep offers a higher number, because a higher number
measured on the surface the number was read on is not a reason.

**The post-adoption recheck** (`data/derived/phase1b/postadoption-constant-recheck.json`) exists because
adopting a default makes its neighbours' sweeps stale: `watershed_hmax.h` had been swept against a surface
C3 no longer floods, and `valley_edge.min_cap_size` against a mode C7 no longer runs. Re-measured against
the engine that actually ships:

| constant | on | ships | verdict |
|---|---|---|---|
| `C3_H_MAXIMA` | C3 | 0.12 | at the grid optimum |
| `C7_MIN_CAP_SIZE` | C7 | 8 | at the grid optimum |
| `FOREGROUND_OBJECT_MAX_SIZE` | C3, C7 | 12 | at the grid optimum |
| `FOREGROUND_HOLE_MAX_SIZE` | C3, C7 | 16 | 64 scores +0.98 percent, 32 scores +0.43 percent |
| `FOREGROUND_OTSU_FACTOR` | C3 | 0.75 | **0.60 scores +6.42 percent** |
| `FOREGROUND_OTSU_FACTOR` | C7 | 0.75 | 0.65 scores +2.42 percent |

The first row is a RESTATEMENT, not independent evidence. This is the same test-split grid on which the
gap was first noticed and which motivated R-2 in the first place, so its agreement is not a second
opinion. The independent parts of R-2 are the validation split it selected on and the reserve slice it
was confirmed on.

**None of the flagged rows is adopted, and the Otsu factor is the one to be careful about.** That study
runs on the already-burned test split, so promoting 0.60 because it is the maximum there is precisely the
selection-on-an-observed-surface failure the discipline exists to prevent. Unlike the flooding depth, it
has no unit-change argument behind it: 0.75 means the same thing before and after the adoptions, and only
its score moved. It stays a recorded finding, and moving it would need its own pre-registration, its own
justification and its own reserve slice.
The adoption is recorded, with a BEFORE and AFTER on an untouched reserve slice that no sweep observed,
in `verification/phase1-adoption.json`; the slice spend is in `verification/reserve-slice-ledger.json`.

**Read every table below as the PRE-ADOPTION record.** These sweeps were measured on 2026-08-01 before
the two defaults moved, so every row was produced with the other constants at their pre-adoption values:
C3 flooding `neg_edt`, C7 in `subtract` mode. Rows are labelled `(previous)` for a value the adoption
replaced, `(adopted)` for a value it took, and `(kept)` for a value that was deliberately left alone.
Keeping these tables as measured is deliberate. The grids were fixed before the first run and the artifacts are the evidence that motivated
the change, so they are kept as measured rather than re-run against the engine they produced. Where a
table's numbers would differ under the current defaults, it says so.

Surface for every table below: the same untouched 64-image test split the committed aggregate uses. The
`ms` columns are that session's timings on this machine; the accuracy columns are what the reading rests
on. Full grids and per-condition breakdowns are in `data/derived/phase1/`, and the row-per-constant
summary is `data/derived/phase1/classical-constant-ledger.json`.

### C4 `compactness`: the 0.0 default is defended on AP, kept deliberately, and buys a worse d32

Compact watershed (Neubert & Protzel 2014, [doi:10.1109/ICPR.2014.181](https://doi.org/10.1109/ICPR.2014.181),
the reference the pinned `skimage.segmentation.watershed` docstring itself gives for this parameter)
biases basins toward regular shapes, which is the froth prior. Twelve values, from
`data/derived/phase1/c4-compactness-sweep.json`:

| compactness | AP | PQ | boundary F | BSD W1 | count abs. err. | d32 rel. err. |
|---|---|---|---|---|---|---|
| **0.0 (kept)** | **0.1977** | 0.4022 | 0.8344 | 2.590 | 139.8 | 1.1555 |
| 0.0001 | 0.1959 | **0.4042** | 0.8360 | **2.522** | 139.8 | 1.0586 |
| 0.01 | 0.1950 | 0.4024 | **0.8382** | 2.611 | 139.8 | 0.9181 |
| 0.1 | 0.1846 | 0.3888 | 0.8339 | 2.809 | 139.8 | 0.6984 |
| 1.0 | 0.1706 | 0.3702 | 0.8262 | 3.077 | 139.8 | 0.4633 |
| 100.0 | 0.1701 | 0.3699 | 0.8258 | 3.078 | 139.8 | **0.4626** |

AP falls monotonically once compactness is switched on. Every swept value scores below 0.0, so **0.0
is kept as a deliberate default with this sweep as its evidence**, and the absent keyword is a measured
choice rather than an unexamined one. Two secondary readings are worth keeping: a compactness of 0.0001
is better than the kept setting on PQ, boundary F and BSD W1 while costing 0.0018 AP, and pushing
compactness up cuts the Sauter-diameter relative error by 60 percent (1.1555 to 0.4626) at a cost of
0.0276 AP. That trade stays on record for a cycle that decides the size distribution matters more than
the mask; it is not taken here. The marker set never changes, so the count error is identical at 139.8
across the entire grid.

**Library behaviour, measured not assumed:** in the pinned scikit-image 0.26.0, `watershed_line=True` is
silently ignored whenever `compactness > 0`. Probed over all 64 images at compactness 0.0, 0.01 and 1.0:
at 0.0 the flag leaves foreground pixels at label 0, and at both non-zero values the output is
bit-identical to `watershed_line=False` and no foreground pixel is left at label 0. Evidence is the
`library_behaviour_probe` block of the same artifact. At compactness 0 the flag costs AP (0.1935 against
0.1977) and buys boundary F (0.8372 against 0.8344).

### `_foreground`'s `0.75`: common-mode, optimal for exactly one of the five methods, and kept

Thirteen values from 0.50 to 1.10, each evaluated on all five scored dependants
(`data/derived/phase1/foreground-factor-sweep.json`, 65 points):

| method | AP at the kept 0.75 | argmax factor | AP at the argmax | delta |
|---|---|---|---|---|
| otsu_cc (C1) | 0.0652 | 0.90 | 0.0902 | +0.0250 |
| watershed_hmax (C3) | 0.1031 | 0.85 | 0.1155 | +0.0123 |
| watershed_dt (C4) | 0.1977 | 0.80 | 0.2109 | +0.0132 |
| watershed_hmin (C5) | 0.1330 | 0.80 | 0.1494 | +0.0165 |
| valley_edge (C7) | **0.1673** | **0.75** | **0.1673** | +0.0000 |

The five-method mean AP peaks at a factor of 0.80 (0.14381) rather than at the shipped 0.75 (0.13326).
The constant is optimal for exactly one method, C7, the domain-specific one, and every other dependant
wants a stricter cut. At 0.80, C4 is better than at 0.75 on all six recorded axes at once (AP 0.2109,
PQ 0.4291, boundary F 0.8583, BSD W1 2.155, count error 130.5, d32 0.9914).

**0.75 is kept, as a deliberate default with this sweep as its evidence.** It is common-mode: a change
here moves all seven methods at once, and the only argument for moving it would be a tier-mean argmax
read on the same test split the sweep ran on. No source supplies the multiplier, so there is nothing
else to defend a move with. The C3 and C7 rows in this table are pre-adoption, measured with C3 on
`neg_edt` and C7 in `subtract` mode, so their absolute AP values are lower than the tier's current ones;
the shape of each curve is what the reading rests on.

### `_foreground`'s hole filling: the largest single effect measured in the tier

`remove_small_holes(fg, max_size=16)` fills dark enclosed regions of up to 16 px inside the froth
foreground. Dark enclosed regions between bubbles are Plateau borders, which is the signal the whole
tier separates instances with. Sweeping it (`data/derived/phase1/foreground-cleanup-sweep.json`) gives a
monotone response for all five methods, best at 0, meaning no hole filling at all:

| method | AP at the kept 16 | AP at 0 | delta | BSD W1 16 to 0 | boundary F 16 to 0 | count abs. err. 16 to 0 |
|---|---|---|---|---|---|---|
| otsu_cc (C1) | 0.0652 | 0.1417 | +0.0765 | 10.164 to 7.408 | 0.8113 to 0.8925 | 220.1 to 177.3 |
| watershed_hmax (C3) | 0.1031 | 0.1930 | +0.0899 | 6.032 to 5.056 | 0.8323 to 0.8849 | 178.9 to 170.9 |
| watershed_dt (C4) | 0.1977 | 0.2932 | +0.0955 | 2.590 to 1.553 | 0.8344 to 0.9008 | 139.8 to 99.5 |
| watershed_hmin (C5) | 0.1330 | 0.2365 | +0.1036 | 16.568 to 6.930 | 0.7968 to 0.8686 | 176.5 to 99.5 |
| valley_edge (C7) | 0.1673 | 0.1700 | +0.0027 | 3.564 to 3.767 | 0.8628 to 0.8661 | 114.2 to 113.3 |

C7 is nearly indifferent, which is consistent with the mechanism it had when this was measured: it
re-detected the seams with a black-top-hat and subtracted them again, so a filled seam was partly
recovered. The other four are not. C7's indifference should be re-measured under the adopted
watershed mode, where the seam response is flooded rather than removed; it is not re-measured here,
because re-running this grid against the engine it produced would replace the evidence with its own
consequence.

The third constant in the same function, `remove_small_objects(fg, max_size=12)`, is the one that
survives its sweep: 12 is the argmax on mean AP for all five methods.

### C7 as a real constrained watershed: ADOPTED, on Meyer 1994, with a stated d32 cost

C7 used to subtract the detected seam from the foreground and label what was left, so every cap stopped
short of the seam centreline by construction. The alternative is the constrained watershed
`model_registry.py` already named (Meyer 1994): use the cleaned caps as markers and flood the
black-top-hat response, so caps grow back until they meet on the seam ridge. Same pinned primitive, no
new dependency. **This is one of the two changes adopted on 2026-08-01**, at the unchanged seam radius 3
and with the watershed line still off. From `data/derived/phase1/c7-constrained-watershed.json`:

| seam radius | mode | AP | PQ | boundary F | BSD W1 | count abs. err. | d32 rel. err. |
|---|---|---|---|---|---|---|---|
| 2 | subtract | 0.1770 | 0.3610 | 0.8632 | 3.916 | 122.8 | 1.7009 |
| 3 (previous) | subtract | 0.1673 | 0.3632 | 0.8628 | 3.564 | 114.2 | 1.2584 |
| 4 | subtract | 0.1494 | 0.3457 | 0.8454 | 3.357 | 117.5 | 1.0948 |
| **3 (adopted)** | **watershed** | **0.2326** | **0.4382** | **0.8837** | **3.542** | **114.2** | **1.4371** |
| 4 | watershed | **0.2430** | **0.4566** | 0.8935 | 3.265 | 117.5 | 1.2438 |
| 5 | watershed | 0.2409 | 0.4553 | **0.8948** | **3.059** | 123.4 | 1.2540 |

At the seam radius that was kept, the mode swap is worth +0.0653 AP (0.1673 to 0.2326) and +0.0750 PQ,
with the count error unchanged at 114.2 because the marker set is untouched. The structural result is
what makes the mode a finding rather than a tuned optimum: **every watershed row beats every subtract
row, at every swept radius.** The mode was still adopted on its source and not on that ordering, which
is why the radius did not move with it. Radius 4 or 5 is worth about 0.01 further AP, and buying it
would be selection on the split the sweep was read on.

**The mechanism the change was proposed for is refuted, and the refutation was paid for.** The proposal
expected seam subtraction to bias diameters downward; the record says the opposite. C7 over-estimates
d32 by a factor above 2 (predicted mean against truth mean, per-case records in
`data/derived/classical-heldout.json`), so growing the caps back makes the Sauter diameter worse, not
better: **d32 relative error goes 1.2584 to 1.4371 on the test split, and 1.3160 to 1.4972 on the
untouched reserve slice.** The mode was adopted anyway, on Meyer 1994 and on mask quality, and this cost
travels with it everywhere the change is described. Widening the seam radius to 4 would bring it back to
1.2438, marginally under the previous value; that is not a reason to widen it.

### C3 floods the wrong surface: ADOPTED, on Sadr-Kazemi and Cilliers 1997

C3 and C4 used to flood the same negated distance transform and to differ only in their markers, so
C3's 0.1031 against C4's 0.1977 had been read as a marker result. Holding C3's h-maxima markers fixed
and swapping the surface (`data/derived/phase1/c3-flooding-surface.json`) shows it is not. **This is the
other change adopted on 2026-08-01**, because flooding the negated image from highlight markers is the
method Sadr-Kazemi & Cilliers (1997) publish and the source the C3 registry entry already cited:

**Every row of this table was measured at the depth that shipped at the time, `C3_H_MAXIMA = 0.06`.**
It is the record of the surface comparison and is left at that depth, because holding the depth fixed is
what makes the four surfaces comparable to each other. None of these numbers is C3's current score: the
adopted configuration was re-measured after the depth was corrected later the same day and scores AP
**0.2975**, PQ 0.5423, boundary F 0.9236, BSD W1 2.037 and d32 0.1098.

| flooded surface | AP | PQ | boundary F | BSD W1 | d32 rel. err. | merges | splits |
|---|---|---|---|---|---|---|---|
| neg_edt (previous) | 0.1031 | 0.2490 | 0.8323 | 6.032 | 0.4311 | 3009 | 2666 |
| gray | 0.0413 | 0.1120 | 0.8089 | 9.605 | 2.7066 | 1862 | 968 |
| **neg_gray (adopted)** | **0.2196** | **0.4409** | **0.8817** | **3.626** | **0.1907** | **1142** | 2003 |
| gradient | 0.0818 | 0.2081 | 0.8371 | 6.411 | 0.5204 | 3258 | 2466 |
| C4 on neg_edt, for reference | 0.1977 | 0.4022 | 0.8344 | 2.590 | 1.1555 | 3110 | 1009 |

Flooding the inverted intensity, so the dark Plateau borders are ridges rather than a distance field,
more than doubles C3's AP and takes it past C4 on AP, PQ, boundary F and d32, on identical markers and
an identical instance count. C3's cost is much smaller than C7's but it is not zero: d90 relative
error worsens on both surfaces, 0.1903 to 0.1906 on the test split and 0.1739 to 0.1914 on the
reserve, so the coarse tail of the size distribution is slightly less accurate than before. Flooding `gray` un-inverted is much worse, as the flooding order predicts, and the
morphological gradient is worse than the previous surface. Two of the sixteen conditions regress
(`dark-defocus-compound` 0.0097 to 0.0085, `low-light-noise` 0.0170 to 0.0112), so this is a large win
and not a uniform one, and the two regressed conditions are the darkest in the matrix, where inverted
intensity carries least.

The isolation the study was run for: C3's deficit against C4 is not marker failure alone. On the EDT
surface C4's markers are better; on the intensity surface C3's markers are better than C4 on its own
best surface. Markers and surface interact, and reporting C3 as a weak-marker method was reading one
half of that interaction.

### The remaining per-method constants

One 1-D sweep each, everything else held at published values
(`data/derived/phase1/residual-constants-sweep.json`). Mean AP only; the full metric set is in the artifact.

These rows are pre-adoption: `valley_edge.min_cap_size` was swept in `subtract` mode and
`watershed_hmax.h` on the `neg_edt` surface, so their absolute AP values are below the tier's current
ones. Each is kept at its swept value; none of them has a source that would justify moving it.

| constant | kept value | grid and mean AP | kept value is the argmax |
|---|---|---|---|
| `watershed_dt.min_distance` | 4 | 2: 0.1548, 3: 0.1948, **4: 0.1977**, 5: 0.1882, 6: 0.1677, 8: 0.1299 | yes |
| `valley_edge.min_cap_size` | 8 | 0: 0.1295, 4: 0.1655, **8: 0.1673**, 16: 0.1659, 32: 0.1586 | yes |
| `watershed_hmax.h` | 0.06 | 0.02: 0.0423, 0.04: 0.0732, 0.06: 0.1031, 0.08: 0.1174, 0.12: 0.1238, **0.20: 0.1249** | no |
| `watershed_hmin.h` | 0.08 | **0.02: 0.1819**, 0.04: 0.1652, 0.06: 0.1483, 0.08: 0.1330, 0.12: 0.1059, 0.20: 0.0609 | no |
| `watershed_immersion.min_distance` | 2 | 1: 0.0022, 2: 0.0173, 3: 0.0397, 4: 0.0636, **6: 0.0998** | no, deliberately |

C2's value is the one case where the argmax is the wrong answer: C2's declared role in the ladder is the
over-segmentation exhibit, and raising `min_distance` improves its AP by destroying exactly what it is
there to show. It is recorded as a deliberate choice, not as a missed optimum.

Two constants in the tier remain neither swept nor sourced, and are named rather than hidden:
`watershed_immersion.gradient_radius` (C2, an exhibit) and C6's four SLIC constants, which are out of
scope while C6 itself is a demotion candidate.

### What was applied, and what deliberately was not

Exactly two defaults in `segment.py` moved, `C3_FLOODING_SURFACE` and `C7_MODE`, and both moved because
the engine was not implementing the source its registry entry already cites. Everything else on this
page stayed where it was. Two blockers stood in front of any adoption, and both were cleared before it:

1. **The observed surface.** Every number on this page was measured on the 64-image test split, so
   adopting a value because it is the argmax there is selection on that surface and the gain would not be
   quotable. One untouched reserve slice from `verification/phase2-data-preregistration.json` was spent
   to measure BEFORE and AFTER on data no sweep had seen, and the spend is recorded in
   `verification/reserve-slice-ledger.json`. **The reserve numbers are the published effect of the two
   changes**, and both directions were confirmed there: C3 paired mean AP delta +0.1147 with a bootstrap
   95 percent interval of [+0.0919, +0.1391] and 59 of 64 images improved; C7 +0.0643 with [+0.0539,
   +0.0748] and 60 of 64 improved. The sweep numbers on this page are the motivation, not the effect.
2. **The two-lane change.** C1, C3 and C4 have TypeScript twins under the AP-delta parity gate. The
   twins were moved to the same surface and the same mode in the same change, and `classical-heldout.json`,
   `method-benchmark.json`, the canonical per-case bakes, the showcase artifacts and the real-adjacent
   benchmark were all re-baked from the new defaults. Re-running the parity gate on the changed twins
   surfaced a fourth, older twin bug: the browser `watershed` carried marker labels lying outside the
   froth foreground straight into its output, inflating C3's live instance count to 1.2420x the offline
   count in every parity run since the artifact was first committed. Flooding the EDT had merged those
   surplus markers into shared basins and hidden it. It is fixed, and C3 parity is now the best it has
   ever been: AP delta 0.0020 against 0.0193 before, mask IoU agreement 0.9343 against 0.5226,
   instance-count ratio 1.0011 (`verification/classical-live-parity.json`).

What did NOT move, and why it did not: C7's `seam_radius` and `watershed_line`, C4's `compactness` and
the shared `_foreground` `0.75` factor. Each is now recorded as a deliberate default with its sweep as
evidence. Radius 4 or 5 would have bought about 0.01 further AP with nothing but the observed split
behind it, which is the exact move this whole procedure exists to refuse.

The sweeps also did not measure interactions: the three `_foreground` constants were moved one at a time,
so the joint argmax is unknown, and the C4, C3 and C7 studies were all run at the pre-adoption
foreground.

## C6 slic_merge: rebuild attempted, bar missed, demotion recommended

C6 is the worst value on the tier: **0.0186 AP for 710.7 ms per image**, roughly 113 times C1's 6.3 ms
for a lower score. Before recommending anything, the two variants the pinned
`skimage.segmentation.slic` docstring cites itself were measured: maskSLIC (`mask=`, docstring
reference [3], Irving 2016, arXiv:1606.09518) and SLICO (`slic_zero=True`, docstring reference [2]).

The bar and the decision rule were fixed before any arm was run, in the module docstring of
`scripts/evaluate_c6_rebuild.py`: keep and rebuild only if the best variant reaches **test mean AP
>= 0.0652** at no more than the shipped C6 runtime, 0.0652 being C1's AP on the same split. Below that
line, the row's compute buys nothing the cheapest method on the bench does not already give.

Measured on the untouched 64-image test split, all other parameters held at the shipped values
(`verification/c6-rebuild-or-demote.json`):

| arm | AP | AP50 | PQ | boundary F | count abs. err. | BSD W1 | ms/image |
|---|---|---|---|---|---|---|---|
| A0 shipped `slic_merge` | 0.0186 | 0.0653 | 0.0721 | 0.7864 | 451.9 | 8.383 | 415.9 |
| A1 maskSLIC | 0.0405 | 0.1361 | 0.1419 | 0.7583 | 150.9 | 3.537 | 494.5 |
| A2 SLICO | 0.0179 | 0.0643 | 0.0704 | 0.7732 | 438.3 | 7.923 | 231.2 |
| A3 maskSLIC + SLICO | **0.0479** | 0.1496 | 0.1571 | 0.7550 | **150.3** | **3.038** | 409.5 |

A0 reproduces the committed 0.0186 / 0.0721 / 0.7864 / 451.9 / 8.383 exactly, so the surface is the
same one the shipped number was measured on. The ms column is this session's timing on the same
machine class and runs lower than the `method-benchmark.json` figure; both engines are unchanged by the
2026-08-01 adoption, so only their timings moved when the aggregate was re-baked. The AP column is what
the decision rests on. Validation reproduces the ordering (A0 0.0173, A1 0.0419, A2 0.0185, A3 0.0505).

**Result: NULL against the pre-registered bar.** The best rebuild, A3, is a real gain in its own terms:
2.6 times the AP, count absolute error down from 451.9 to 150.3, BSD Wasserstein-1 down from 8.383 to
3.038, at no extra cost. It is still 0.0479 against a bar of 0.0652. SLICO alone is inside noise of the
baseline and slightly worse; the whole gain comes from restricting the superpixels to the froth
foreground.

**Recommendation, for Felipe to accept or reject: demote C6 from the scored ladder.** Its 0.0479 ceiling
at ~400 ms is dominated on every axis by C1, and the row consumes more benchmark compute than
every other classical method combined. The demotion is a recommendation and is not applied here: method
status is not changed by a measurement session. If the row is instead kept, keep it as A3
(`slic(mask=fg, slic_zero=True)`), which is strictly better than what ships today at no extra cost, and
note that adopting it requires re-baking `classical-heldout.json`, `method-benchmark.json` and every
downstream artifact that carries a C6 number.

## Validated live twins and offline replay

C1/C3/C4 run in the browser (`frontend/src/classical/`) with no model download.
Their cross-language gate uses the first untouched-test sample from each of all
16 conditions and requires mean AP delta <= 0.03, browser-vs-offline AP >= 0.50,
boundary F >= 0.95, and mean instance-count ratio in [0.75, 1.25]. The
committed `verification/classical-live-parity.json` accepts all three.

The twins were re-validated after the 2026-08-01 adoption moved `watershedHmax` to the negated-grayscale
surface. C3's numbers improved sharply, but only after the re-validation surfaced a fourth divergence
that had been present since the artifact was first committed and is now FIXED: the browser `watershed`
seeded its output with every marker pixel, including markers outside the froth foreground, and never
cleared them, while `skimage`'s masked watershed returns 0 outside the mask. C3's h-maxima markers sit on
any bright speck in the frame, so C3 carried the whole error at 1.2420x the offline instance count, and
flooding the EDT had hidden it by merging the surplus markers into shared basins. After the fix: C3 mean
AP delta 0.0020 (was 0.0193), browser-vs-offline mask IoU 0.9343 (was 0.5226), instance-count ratio
1.0011 (was 1.2420). A FIFO insertion-order tiebreak was added to the twin's flooding heap in the same
change, which is what decides a plateau and matters far more on an 8-bit intensity surface than on a
distance field; it raised C4's IoU agreement from 0.6625 to 0.7056.

C2/C5/C6/C7 do not run in the browser. Their complete Python implementations,
64-sample evidence, and canonical case replay are still available through the
offline pipeline and benchmark. This separation prevents a simplified web
approximation from being presented as the scientific implementation.

**The twins are not semantically identical, and the parity gate does not certify that they are.** Three
divergences are known and measured, and the AP-delta <= 0.03 acceptance passes through all three, so the
gate certifies agreement on the accepted outputs and nothing stronger:

1. `slicMerge` performs no merging. It runs SLIC and relabels superpixels ordered by mean intensity, while the
   offline `slic_merge` cuts a region-adjacency graph by mean-colour distance, masks to the foreground, and
   splits disconnected components. C6 is offline-replay, so no user-facing lane runs the browser path.
2. `watershedImmersion` is a different algorithm from the offline C2: every regional minimum of the gradient
   inside the foreground is a seed in the browser, while offline the seeds are `peak_local_max` on the negated
   gradient with a 2 px minimum separation, which drops the closely spaced minima the browser keeps.
3. `removeSmall` is off by one against Python. `scikit-image` 0.26 removes objects of area <= `max_size`;
   `removeSmall` keeps area >= `minArea`, so an object of exactly the threshold area survives in the browser
   and is removed offline.

Fixing any of the three moves live outputs and the parity artifact, so they are recorded here rather than
silently patched. A fourth divergence, the out-of-mask marker labels described above, WAS fixed on
2026-08-01 because the adoption made it break the gate; the lesson is recorded with it, since the gate
passed a 24 percent instance-count error for as long as the two lanes were wrong in ways that cancelled.

**What this tier is and is not:** it is a set of pre/post fixes bolted onto watershed or valley-tracing to survive
highlights and low-gradient valleys; it has no learned prior for the faint lamellae, so its quality is bounded by
marker/threshold tuning. It is the floor, not the product.
