# Model evaluation and claim gates

## Primary protocol

The primary comparison is the 64-image untouched test split from
`frothseg.learned-dataset/v2`. Training, validation, and calibration do not
share latent geometry groups with test. Parameters and post-processing
thresholds are fixed before test evaluation.

Metrics:

- mask AP averaged over IoU thresholds 0.50:0.05:0.95;
- AP50 for accessible localization quality;
- panoptic quality (PQ), with segmentation and recognition components;
- merge, split, false-positive, and false-negative counts per sample;
- BSD Wasserstein-1 and D32/count error on every held-out cell;
- macro means, pooled micro TP/FP/FN/precision/recall/F1, runtime, peak memory,
  model size, and hardware lane.

The separate 13-case suite is a diagnostic visualization surface. Classical
methods retain those canonical scores and are also evaluated on the same
untouched 64-image test split as every learned/foundation method. The committed
matrix therefore contains exactly 960 comparable held-out cells. Canonical
scores remain a separate diagnostic and are never mixed into the test ranking.

## Held-out results

| ID | Method | AP | AP50 | PQ | Current bar |
|---|---|---:|---:|---:|---|
| N1 | LamellaStar (three-seed logit-mean ensemble) | 0.5186 | 0.8279 | 0.7359 | pass |
| L5 | Cellpose-SAM, fine-tuned from `cpsam_v2` | 0.5099 | 0.8238 | 0.7227 | pass |
| L1 | Boundary U-Net + watershed | 0.4153 | 0.6987 | 0.6559 | pass |
| L2 | Deep-marker watershed | 0.3247 | 0.5990 | 0.5694 | pass |
| L3 | GC-FSegNet | 0.3190 | 0.5958 | 0.5582 | pass |
| L6 | YOLO froth segmentation | 0.2930 | 0.5766 | 0.5326 | below |
| L7 | SAM2.1 automatic masks | 0.1352 | 0.1821 | 0.2391 | below |
| L4 | StarDist 2D | 0.1119 | 0.3473 | 0.3242 | below |

The predeclared comparison threshold is test AP 0.30. It is a controlled
synthetic-benchmark threshold, not a claim of plant readiness.

## Temporal evidence

L1 predictions are associated with Hungarian IoU matching over five exact-ID
sequences and 40 frames. Mean ID-switch rate is 0.0093 and mean frame coverage
is 0.9076.

Official SAM2.1 video propagation is measured separately. Twelve
size-stratified objects receive exact masks only on the first frame of an
eight-frame motion sequence. Later frames are untouched. Mean identity IoU is
0.8014 and identity recall@0.5 is 0.9583. This is a propagation result, not
automatic object discovery.

## Claim policy

Implementation completeness does not imply quality success. All 15 methods are
implemented, and five learned/research methods clear the present AP bar.
The three-seed LamellaStar ensemble leads the controlled synthetic test at AP
0.5186 against Cellpose-SAM at 0.5099. That margin, +0.0087, is
SMALLER than the measured ensemble-to-ensemble spread of 0.0118
(`verification/p1-ensemble-spread.json`), so the two are not distinguishable at that
spread and the evidence supports no superiority claim. `beyond_sota_claim` stays false.

Synthetic metrics are not real-plant accuracy. A plant claim requires a
separately governed, representative, expert-labelled real-froth dataset and a
locked external test protocol.
