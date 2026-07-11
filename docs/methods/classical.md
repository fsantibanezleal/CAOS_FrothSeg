# Classical segmentation tier (C1..C7)

The classical ladder is the honest, no-training FLOOR that the learned tier must beat. Every method runs offline
in `data-pipeline/fslab/science/segment.py` (the pre-validated Benchmark references) and has a JS/WASM twin in the
live App. Froth is hard for a specific reason: the boundaries between bubbles are dark, low-gradient valleys
(Plateau borders), while each bubble carries a bright specular highlight with high gradient, so gradient/edge and
threshold methods lock onto the highlight rings and over-segment. The ladder is designed to show this, term by
term.

| ID | Method | Mechanic (froth relevance) | Reference |
|----|--------|----------------------------|-----------|
| C1 | `otsu_cc` | Otsu global threshold, then connected components. Labels each connected bright region as ONE instance, so touching bubbles merge: the under-segmentation exhibit. | Otsu (1979), [doi:10.1109/TSMC.1979.4310076](https://doi.org/10.1109/TSMC.1979.4310076) |
| C2 | `watershed_immersion` | Marker-less immersion watershed on the morphological gradient. Floods from every regional minimum, so each specular highlight and texture dip is a basin: the over-segmentation exhibit. | Vincent & Soille (1991), [doi:10.1109/34.87344](https://doi.org/10.1109/34.87344) |
| C3 | `watershed_hmax` | Highlight-seeded: h-maxima of the bright specular spots are the markers (each bubble usually carries one reflection); flood only from markers. The canonical industrial froth trick; degrades under glare. | Sadr-Kazemi & Cilliers (1997), [doi:10.1016/S0892-6875(97)00094-0](https://doi.org/10.1016/S0892-6875(97)00094-0) |
| C4 | `watershed_dt` | Distance-transform markers (peaks of the EDT) + marker-controlled watershed (Meyer). The generic classical floor; strong on well-separated convex bubbles. | Meyer (1994), [doi:10.1016/0165-1684(94)90060-4](https://doi.org/10.1016/0165-1684(94)90060-4) |
| C5 | `watershed_hmin` | H-minima (extended-minima) suppression of shallow minima of the negated distance map before flooding; the single knob `h` sets the smallest resolvable bubble and cuts the C2 over-segmentation. | Soille (2004), [doi:10.1007/978-3-662-05088-0](https://doi.org/10.1007/978-3-662-05088-0) |
| C6 | `slic_merge` | SLIC superpixels + region-adjacency mean-intensity merge. A non-watershed over-segmentation primitive; superpixels snap to highlights more than to true seams. | Achanta et al. (2012), [doi:10.1109/TPAMI.2012.120](https://doi.org/10.1109/TPAMI.2012.120) |
| C7 | `valley_edge` | Dark-seam / valley detector: bubbles are delineated by the dark inter-bubble valleys, NOT the bright spots, so a black-top-hat isolates the seams, they are removed, and the enclosed caps are labelled. Robust to highlights by construction; the domain-specific froth method. | Wang, Bergholm & Yang (2003), [doi:10.1016/j.mineng.2003.07.014](https://doi.org/10.1016/j.mineng.2003.07.014); Wang & Chen (2015), [doi:10.3390/min5020142](https://doi.org/10.3390/min5020142) |

## Metrics (pre-validated against exact synthetic ground truth)

- **Mask AP / AP50 / AP75** (`mask_ap`): greedy IoU matching of predicted vs GT instances, averaged over IoU
  thresholds 0.5:0.05:0.95 (COCO style).
- **Panoptic Quality** (`panoptic_quality`): PQ = SQ x RQ, where SQ is the mean IoU over true positives (matched
  at IoU > 0.5) and RQ = TP / (TP + 0.5 FP + 0.5 FN). Returns the two froth-relevant error modes: SPLIT errors
  (one GT bubble covered by several predicted segments, over-segmentation) and MERGE errors (one predicted segment
  covering several GT bubbles, under-segmentation). Kirillov et al. (2019), [doi:10.1109/CVPR.2019.00963](https://doi.org/10.1109/CVPR.2019.00963).
- **BSD Wasserstein-1** (`bsd_wasserstein`): earth-mover distance between the predicted and GT bubble-diameter
  distributions, so a method is judged on whether it reproduces the true bubble-size distribution, not only per
  mask IoU.

## What the ladder shows (measured on `poly-normal`, 197 GT bubbles, seed 42)

| method | nPred | AP | PQ | merges | splits |
|---|---|---|---|---|---|
| otsu_cc (C1) | 33 | 0.051 | 0.122 | 20 | 0 |
| watershed_immersion (C2) | 8246 | 0.000 | 0.000 | 0 | 2 |
| watershed_hmax (C3) | 289 | 0.136 | 0.314 | 56 | 13 |
| watershed_dt (C4) | 175 | 0.402 | 0.652 | 39 | 14 |
| watershed_hmin (C5) | 134 | 0.234 | 0.459 | 55 | 13 |
| slic_merge (C6) | 315 | 0.049 | 0.203 | 53 | 99 |
| **valley_edge (C7)** | 166 | **0.438** | **0.681** | 24 | 0 |

The numbers match the froth literature: the naive Otsu baseline under-segments (few instances, many merges), the
marker-less immersion watershed grossly over-segments (8246 basins for 197 bubbles), and the domain-specific
valley-edge detector is the strongest classical method, narrowly ahead of the distance-transform watershed. These
are the references the learned tier (StarDist, U-Net+watershed, Deep-Watershed, and the novel LamellaStar) must
beat; see [../../plans/frothseg](the redesign plan) and the learned-tier docs.

**What this tier is and is NOT:** it is a set of pre/post fixes bolted onto watershed or valley-tracing to survive
highlights and low-gradient valleys; it has no learned prior for the faint lamellae, so its quality is bounded by
marker/threshold tuning. It is the floor, not the product.
