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
