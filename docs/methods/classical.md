# Classical segmentation tier (C1..C7)

> Correction 2026-07-31: earlier revisions of the canonical per-method numbers in this file came from a seed-42 bake that no longer exists. The shipped canonical case is seed 102; every canonical figure here now comes from data/derived/synth/poly-normal/benchmark.json (C1 otsu_cc 76 predictions AP 0.137 · C2 watershed_immersion 1519 basins AP 0.005 · C4 watershed_dt 177 predictions AP 0.401, the classical leader on this scene · C7 valley_edge 166 predictions AP 0.364).

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
| C3 | `watershed_hmax` | Highlight-seeded: h-maxima of the bright specular spots are the markers (each bubble usually carries one reflection); flood only from markers. The canonical industrial froth trick; degrades under glare. Two provenances, both real: the marker choice is the froth method, the flooding it feeds is marker-controlled watershed. | markers: Sadr-Kazemi & Cilliers (1997), [doi:10.1016/S0892-6875(97)00094-0](https://doi.org/10.1016/S0892-6875(97)00094-0); flooding: Meyer (1994), [doi:10.1016/0165-1684(94)90060-4](https://doi.org/10.1016/0165-1684(94)90060-4) |
| C4 | `watershed_dt` | Distance-transform markers (peaks of the EDT) + marker-controlled watershed (Meyer). The generic classical floor; strong on well-separated convex bubbles. | Meyer (1994), [doi:10.1016/0165-1684(94)90060-4](https://doi.org/10.1016/0165-1684(94)90060-4) |
| C5 | `watershed_hmin` | H-minima (extended-minima) suppression of shallow minima before flooding; cuts the C2 over-segmentation. The flooded surface is the distance map negated AND divided by its own per-image maximum, so `h` (default 0.08) is a FRACTION of that frame's deepest EDT value, not a depth in pixels: on a frame whose EDT maximum is 20 px it suppresses 1.6 px, and it suppresses a different physical depth on the next frame. | Soille (2004), [doi:10.1007/978-3-662-05088-0](https://doi.org/10.1007/978-3-662-05088-0) |
| C6 | `slic_merge` | SLIC superpixels + region-adjacency mean-intensity merge. A non-watershed over-segmentation primitive; superpixels snap to highlights more than to true seams. | Achanta et al. (2012), [doi:10.1109/TPAMI.2012.120](https://doi.org/10.1109/TPAMI.2012.120) |
| C7 | `valley_edge` | Dark-seam / valley detector: bubbles are delineated by the dark inter-bubble valleys, not the bright spots, so a black-top-hat isolates the seams, they are removed, and the enclosed caps are labelled. Robust to highlights by construction; the domain-specific froth method. | Wang, Bergholm & Yang (2003), [doi:10.1016/j.mineng.2003.07.014](https://doi.org/10.1016/j.mineng.2003.07.014); Wang & Chen (2015), [doi:10.3390/min5020142](https://doi.org/10.3390/min5020142) |

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
| watershed_hmax (C3) | 300 | 0.201 | 0.365 | 0.215 | 6.361 |
| **watershed_dt (C4)** | 177 | **0.401** | 0.685 | **0.433** | **1.205** |
| watershed_hmin (C5) | 145 | 0.289 | 0.562 | 0.262 | 2.021 |
| slic_merge (C6) | 945 | 0.035 | 0.101 | 0.017 | 11.803 |
| valley_edge (C7) | 166 | 0.364 | **0.754** | 0.301 | 1.406 |

## What the ladder shows, aggregated (64-image held-out test split)

Read from `data/derived/method-benchmark.json` (`methods[].test` and `methods[].compute`), which is the aggregate
any tier-level claim has to be made on. One scene is not the tier.

| method | AP | PQ | boundary F | count abs. err. | BSD W1 | ms/image |
|---|---|---|---|---|---|---|
| otsu_cc (C1) | 0.0652 | 0.1706 | 0.8113 | 220.1 | 10.164 | 3.4 |
| watershed_immersion (C2) | 0.0173 | 0.0635 | 0.7424 | 849.3 | 7.393 | 80.8 |
| watershed_hmax (C3) | 0.1031 | 0.2490 | 0.8323 | 178.9 | 6.032 | 27.9 |
| **watershed_dt (C4)** | **0.1977** | **0.4022** | 0.8344 | 139.8 | **2.590** | 22.1 |
| watershed_hmin (C5) | 0.1330 | 0.2845 | 0.7968 | 176.5 | 16.568 | 27.5 |
| slic_merge (C6) | 0.0186 | 0.0721 | 0.7864 | 451.9 | 8.383 | 536.0 |
| valley_edge (C7) | 0.1673 | 0.3632 | **0.8628** | **114.2** | 3.564 | **9.6** |

The numbers match the froth literature on the two exhibits: the naive Otsu baseline under-segments (76
predictions for 197 bubbles on the canonical scene) and the gradient immersion watershed grossly over-segments
(1519 basins for 197 bubbles on the canonical scene, 71,918 predicted instances against 17,846 true ones over the
held-out split). The head of
the tier is a split decision and is stated as one: **C4 leads on AP (0.1977 against C7's 0.1673) and on BSD
Wasserstein-1, while C7 leads on boundary F (0.8628) and on count error (114.2) at 9.6 ms per image, less than
half C4's 22.1 ms.** Neither is "the strongest classical" outright; which one is preferable depends on whether
the consumer is the mask or the size distribution. Both are the references the learned tier (StarDist,
U-Net+watershed, Deep-Watershed, and the novel LamellaStar) must beat; see the learned-tier docs.

## The tier's constants, swept and recorded (2026-08-01)

Every classical engine carried undocumented literals, and five of the seven consumed one shared
`_foreground` mask built with a `threshold_otsu(gray) * 0.75` cut that Otsu 1979 does not supply. This
section records what happens when each of those constants is moved. It changes no default: the engines
were parameterised so that a constant can be swept without editing a call, and `verification/phase1-classical-sweeps.json`
carries the proof that all seven engines at their published values still reproduce
`data/derived/classical-heldout.json` to within 1e-12 on AP, PQ, boundary F, BSD W1, count error and d32.

Surface for every table below: the same untouched 64-image test split the committed aggregate uses. The
`ms` columns are this session's timings on this machine and run lower than `method-benchmark.json`; the
accuracy columns are what the reading rests on. Full grids and per-condition breakdowns are in
`data/derived/phase1/`, and the row-per-constant summary is `data/derived/phase1/classical-constant-ledger.json`.

### C4 `compactness`: the published 0.0 is defended on AP, and buys a worse d32

Compact watershed (Neubert & Protzel 2014, [doi:10.1109/ICPR.2014.181](https://doi.org/10.1109/ICPR.2014.181),
the reference the pinned `skimage.segmentation.watershed` docstring itself gives for this parameter)
biases basins toward regular shapes, which is the froth prior. Twelve values, from
`data/derived/phase1/c4-compactness-sweep.json`:

| compactness | AP | PQ | boundary F | BSD W1 | count abs. err. | d32 rel. err. |
|---|---|---|---|---|---|---|
| **0.0 (published)** | **0.1977** | 0.4022 | 0.8344 | 2.590 | 139.8 | 1.1555 |
| 0.0001 | 0.1959 | **0.4042** | 0.8360 | **2.522** | 139.8 | 1.0586 |
| 0.01 | 0.1950 | 0.4024 | **0.8382** | 2.611 | 139.8 | 0.9181 |
| 0.1 | 0.1846 | 0.3888 | 0.8339 | 2.809 | 139.8 | 0.6984 |
| 1.0 | 0.1706 | 0.3702 | 0.8262 | 3.077 | 139.8 | 0.4633 |
| 100.0 | 0.1701 | 0.3699 | 0.8258 | 3.078 | 139.8 | **0.4626** |

AP falls monotonically once compactness is switched on, so the absent keyword is now a measured choice
rather than an unexamined one. Two secondary readings are worth keeping: a compactness of 0.0001 is
better than the published setting on PQ, boundary F and BSD W1 while costing 0.0018 AP, and pushing
compactness up cuts the Sauter-diameter relative error by 60 percent (1.1555 to 0.4626) at a cost of
0.0276 AP. The marker set never changes, so the count error is identical at 139.8 across the entire grid.

**Library behaviour, measured not assumed:** in the pinned scikit-image 0.26.0, `watershed_line=True` is
silently ignored whenever `compactness > 0`. Probed over all 64 images at compactness 0.0, 0.01 and 1.0:
at 0.0 the flag leaves foreground pixels at label 0, and at both non-zero values the output is
bit-identical to `watershed_line=False` and no foreground pixel is left at label 0. Evidence is the
`library_behaviour_probe` block of the same artifact. At compactness 0 the flag costs AP (0.1935 against
0.1977) and buys boundary F (0.8372 against 0.8344).

### `_foreground`'s `0.75`: common-mode, and optimal for exactly one of the five methods

Thirteen values from 0.50 to 1.10, each evaluated on all five scored dependants
(`data/derived/phase1/foreground-factor-sweep.json`, 65 points):

| method | AP at the published 0.75 | argmax factor | AP at the argmax | delta |
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

### `_foreground`'s hole filling: the largest single effect measured in the tier

`remove_small_holes(fg, max_size=16)` fills dark enclosed regions of up to 16 px inside the froth
foreground. Dark enclosed regions between bubbles are Plateau borders, which is the signal the whole
tier separates instances with. Sweeping it (`data/derived/phase1/foreground-cleanup-sweep.json`) gives a
monotone response for all five methods, best at 0, meaning no hole filling at all:

| method | AP at the published 16 | AP at 0 | delta | BSD W1 16 to 0 | boundary F 16 to 0 | count abs. err. 16 to 0 |
|---|---|---|---|---|---|---|
| otsu_cc (C1) | 0.0652 | 0.1417 | +0.0765 | 10.164 to 7.408 | 0.8113 to 0.8925 | 220.1 to 177.3 |
| watershed_hmax (C3) | 0.1031 | 0.1930 | +0.0899 | 6.032 to 5.056 | 0.8323 to 0.8849 | 178.9 to 170.9 |
| watershed_dt (C4) | 0.1977 | 0.2932 | +0.0955 | 2.590 to 1.553 | 0.8344 to 0.9008 | 139.8 to 99.5 |
| watershed_hmin (C5) | 0.1330 | 0.2365 | +0.1036 | 16.568 to 6.930 | 0.7968 to 0.8686 | 176.5 to 99.5 |
| valley_edge (C7) | 0.1673 | 0.1700 | +0.0027 | 3.564 to 3.767 | 0.8628 to 0.8661 | 114.2 to 113.3 |

C7 is nearly indifferent, which is consistent with its mechanism: it re-detects the seams with a
black-top-hat and subtracts them again, so a filled seam is partly recovered. The other four are not.

The third constant in the same function, `remove_small_objects(fg, max_size=12)`, is the one that
survives its sweep: 12 is the argmax on mean AP for all five methods.

### C7 as a real constrained watershed: a large AP gain, and a refuted d32 hypothesis

C7 subtracts the detected seam from the foreground and labels what is left, so every cap stops short of
the seam centreline. The alternative is the constrained watershed `model_registry.py` already names
(Meyer 1994): use the cleaned caps as markers and flood the black-top-hat response, so caps grow back
until they meet on the seam ridge. Same pinned primitive, no new dependency.
From `data/derived/phase1/c7-constrained-watershed.json`:

| seam radius | mode | AP | PQ | boundary F | BSD W1 | count abs. err. | d32 rel. err. |
|---|---|---|---|---|---|---|---|
| 2 | subtract | 0.1770 | 0.3610 | 0.8632 | 3.916 | 122.8 | 1.7009 |
| **3 (published)** | **subtract** | **0.1673** | **0.3632** | **0.8628** | **3.564** | **114.2** | **1.2584** |
| 4 | subtract | 0.1494 | 0.3457 | 0.8454 | 3.357 | 117.5 | 1.0948 |
| 3 | watershed | 0.2326 | 0.4382 | 0.8837 | 3.542 | 114.2 | 1.4371 |
| 4 | watershed | **0.2430** | **0.4566** | 0.8935 | 3.265 | 117.5 | 1.2438 |
| 5 | watershed | 0.2409 | 0.4553 | **0.8948** | **3.059** | 123.4 | 1.2540 |

At the published radius the mode swap is worth +0.0653 AP (0.1673 to 0.2326) and +0.0750 PQ, with the
count error unchanged at 114.2 because the marker set is untouched. At radius 4 no condition of the
sixteen regresses against the published configuration.

**The mechanism the change was proposed for is refuted.** The proposal expected seam subtraction to bias
diameters downward, and the committed record says the opposite: C7 already over-estimates d32 by a
factor of about 2.2 (predicted mean 36.74 px against a truth mean 16.85 px, computed from the per-case
records in `data/derived/classical-heldout.json`). Growing the caps back makes that worse, not better:
d32 relative error goes 1.2584 to 1.4371 at the published radius. Only by also widening the seam radius
to 4 does it come back to 1.2438, marginally under the published value. The AP, PQ and boundary-F gains
are real; the d32 argument for them is not, and is recorded here as a null.

### C3 floods the wrong surface, and the fix beats C4

C3 and C4 flood the same negated distance transform and differ only in their markers, so C3's 0.1031
against C4's 0.1977 has been read as a marker result. Holding C3's h-maxima markers fixed and swapping
the surface (`data/derived/phase1/c3-flooding-surface.json`) shows it is not:

| flooded surface | AP | PQ | boundary F | BSD W1 | d32 rel. err. | merges | splits |
|---|---|---|---|---|---|---|---|
| **neg_edt (published)** | 0.1031 | 0.2490 | 0.8323 | 6.032 | 0.4311 | 3009 | 2666 |
| gray | 0.0413 | 0.1120 | 0.8089 | 9.605 | 2.7066 | 1862 | 968 |
| **neg_gray** | **0.2196** | **0.4409** | **0.8817** | **3.626** | **0.1907** | **1142** | 2003 |
| gradient | 0.0818 | 0.2081 | 0.8371 | 6.411 | 0.5204 | 3258 | 2466 |
| C4 on neg_edt, for reference | 0.1977 | 0.4022 | 0.8344 | 2.590 | 1.1555 | 3110 | 1009 |

Flooding the inverted intensity, so the dark Plateau borders are ridges rather than a distance field,
more than doubles C3's AP and takes it past C4 on AP, PQ, boundary F and d32, on identical markers and
an identical instance count. Flooding `gray` un-inverted is much worse, as the flooding order predicts,
and the morphological gradient is worse than the published surface. Two of the sixteen conditions
regress against the published surface (`dark-defocus-compound` 0.0097 to 0.0085, `low-light-noise`
0.0170 to 0.0112), so this is a large win and not a uniform one.

The isolation the study was run for: C3's deficit against C4 is not marker failure alone. On the EDT
surface C4's markers are better; on the intensity surface C3's markers are better than C4 on its own
best surface. Markers and surface interact, and reporting C3 as a weak-marker method was reading one
half of that interaction.

### The remaining per-method constants

One 1-D sweep each, everything else held at published values
(`data/derived/phase1/residual-constants-sweep.json`). Mean AP only; the full metric set is in the artifact.

| constant | published | grid and mean AP | published is the argmax |
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

### Nothing above is applied

No default in `segment.py` moved. Two reasons, both fixed before the sweeps were read:

1. Every number here was measured on the 64-image test split. Adopting a value because it is the argmax
   on that split is selection on that surface, and the resulting gain would not be quotable. Any adoption
   needs a confirmation on a surface that was not used to choose the value.
2. C1, C3 and C4 have TypeScript twins under the AP-delta parity gate, so a default change is a two-lane
   change plus a re-bake of `classical-heldout.json`, `method-benchmark.json`, the real-adjacent
   benchmark, the temporal bakes and every showcase artifact that carries a classical number.

The sweeps also did not measure interactions: the three `_foreground` constants were moved one at a time,
so the joint argmax is unknown, and the C4, C3 and C7 studies were all run at the published foreground.

## C6 slic_merge: rebuild attempted, bar missed, demotion recommended

C6 is the worst value on the tier: **0.0186 AP for 536.0 ms per image**, roughly 158 times C1's 3.4 ms
for a lower score. Before recommending anything, the two variants the pinned
`skimage.segmentation.slic` docstring cites itself were measured: maskSLIC (`mask=`, docstring
reference [3], Irving 2016, arXiv:1606.09518) and SLICO (`slic_zero=True`, docstring reference [2]).

The bar and the decision rule were fixed before any arm was run, in the module docstring of
`scripts/evaluate_c6_rebuild.py`: keep and rebuild only if the best variant reaches **test mean AP
>= 0.0652** at no more than 536.0 ms, 0.0652 being C1's AP on the same split at 3.4 ms. Below that
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
machine class and runs lower than the 536.0 ms in `method-benchmark.json`; the AP column is what the
decision rests on. Validation reproduces the ordering (A0 0.0173, A1 0.0419, A2 0.0185, A3 0.0505).

**Result: NULL against the pre-registered bar.** The best rebuild, A3, is a real gain in its own terms:
2.6 times the AP, count absolute error down from 451.9 to 150.3, BSD Wasserstein-1 down from 8.383 to
3.038, at no extra cost. It is still 0.0479 against a bar of 0.0652. SLICO alone is inside noise of the
baseline and slightly worse; the whole gain comes from restricting the superpixels to the froth
foreground.

**Recommendation, for Felipe to accept or reject: demote C6 from the scored ladder.** Its 0.0479 ceiling
at ~400 ms is dominated on every axis by C1 at 3.4 ms, and the row consumes more benchmark compute than
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
silently patched.

**What this tier is and is not:** it is a set of pre/post fixes bolted onto watershed or valley-tracing to survive
highlights and low-gradient valleys; it has no learned prior for the faint lamellae, so its quality is bounded by
marker/threshold tuning. It is the floor, not the product.
