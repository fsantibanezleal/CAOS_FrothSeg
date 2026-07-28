# Metric definitions and failure accounting

Mask AP averages assignment accuracy over IoU thresholds 0.50 through 0.95.
Panoptic quality is `PQ = SQ × RQ`, separating matched-mask quality from
recognition quality. Boundary F-score uses a declared pixel or physical
tolerance. Merge, split, miss, and spurious counts are retained per image.

Equivalent diameter is `2 sqrt(A/pi)`. D10, D50, D90, and Sauter D32 are
compared in physical units when calibration exists, otherwise pixels.
Wasserstein distance compares complete bubble-size distributions. Learned
probability maps report Brier score and expected calibration error when the
engine exposes probabilities.

Every aggregate retains its sample count and condition deltas. Failed cells
remain explicit; evaluators do not silently drop them. Synthetic scores are
controlled algorithm evidence, not plant-accuracy claims.
