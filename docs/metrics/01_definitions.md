# Metric definitions and failure accounting

Every number this repository publishes is defined here against the code that computes it, in
`data-pipeline/fslab/science/segment.py` and `data-pipeline/fslab/temporal.py`. Where a name is
used differently elsewhere in the literature, the difference is stated rather than glossed.

## Instance agreement

### Average precision, and which AP this is

The headline `mean_ap` is **not COCO AP**. COCO ranks detections by confidence and integrates
precision over recall. This repository has no confidence ranking for most of its methods (a
watershed does not score its regions), so it uses the definition standard in cell and
instance-segmentation work, the one Cellpose and StarDist report:

$$\mathrm{AP}(\tau) = \frac{TP(\tau)}{TP(\tau) + FP(\tau) + FN(\tau)}$$

Predicted and ground-truth instances are matched greedily by descending IoU, one to one, and a
pair counts as a true positive when its IoU exceeds the threshold. The reported `mean_ap`
averages this over ten thresholds from 0.50 to 0.95 in steps of 0.05, the COCO sweep:

$$\mathrm{AP} = \frac{1}{10}\sum_{\tau=0.50}^{0.95} \mathrm{AP}(\tau)$$

`ap50` and `ap75` are the single-threshold values at 0.50 and 0.75.

This quantity is bounded by 1 and penalises false positives and false negatives symmetrically.
It is the Jaccard index of the instance matching. **Numbers here are therefore not comparable
to a COCO leaderboard**, and a paper reporting COCO AP on froth is measuring something else.

Implementation: `mask_ap`, with the overlap table built by `_iou_matrix` as a vectorised
contingency count, order (pixels + labels squared) rather than (labels squared x pixels).

### Panoptic quality, and the two froth failure modes

$$\mathrm{PQ} = \mathrm{SQ} \times \mathrm{RQ}, \qquad
\mathrm{SQ} = \frac{\sum_{(p,g) \in TP} \mathrm{IoU}(p,g)}{|TP|}, \qquad
\mathrm{RQ} = \frac{|TP|}{|TP| + \tfrac{1}{2}|FP| + \tfrac{1}{2}|FN|}$$

Segments match uniquely at IoU strictly greater than 0.5, the threshold at which the matching
becomes unique. SQ answers "when it found a bubble, how well did it outline it"; RQ answers
"did it find the right number of bubbles". Splitting them matters because the two failures have
different causes and different fixes.

Alongside PQ the evaluator retains the two error modes that actually characterise froth
segmentation, using a coverage threshold of 0.2:

- **splits** (over-segmentation): one ground-truth bubble covered by more than one predicted
  segment. This is the watershed-on-highlights failure, where specular glare inside a single
  large bubble seeds two markers.
- **merges** (under-segmentation): one predicted segment covering more than one ground-truth
  bubble. This is the Otsu failure, where touching bubbles share a bright region and no lamella
  is detected between them.

A method can hold a respectable AP while being useless for a size distribution if its errors
concentrate in one mode, which is why both counts are published per image.

Implementation: `panoptic_quality`. Reference: Kirillov et al. (2019),
[doi:10.1109/CVPR.2019.00963](https://doi.org/10.1109/CVPR.2019.00963).

### Boundary F-score

Precision and recall over boundary pixels within a declared tolerance, then their harmonic
mean. The tolerance is a physical distance when a calibration exists and a pixel distance
otherwise; it is always reported next to the score, because a boundary F-score without its
tolerance is not interpretable. Implementation: `boundary_fscore`.

## Physical descriptors

Instance area converts to an equivalent diameter

$$d_{eq} = 2\sqrt{A/\pi}$$

the diameter of the disc with the same area. From the set of diameters the evaluator reports the
percentiles D10, D50 and D90, and the Sauter mean

$$d_{32} = \frac{\sum d^3}{\sum d^2}$$

the surface-area-weighted mean diameter, which is the standard bubble-size summary in flotation
because interfacial area per unit volume scales with it. Values are in millimetres when a
`px_per_mm` calibration is supplied and in pixels otherwise; the unit travels with the number,
and scale is never estimated from the image.

Reference for BSD as a flotation soft sensor: Aldrich et al. (2010), *International Journal of
Mineral Processing* 96(1-4),
[doi:10.1016/j.minpro.2010.04.005](https://doi.org/10.1016/j.minpro.2010.04.005).

### Distribution distance

Comparing D50 alone hides shape error, so full distributions are compared with the
1-Wasserstein (earth mover's) distance

$$W_1(P, Q) = \int |F_P(x) - F_Q(x)| \, dx$$

in the same physical units as the diameters. It is the mass that must be moved to turn the
predicted size distribution into the true one, so it reads directly as "the typical diameter
error, weighted by how many bubbles are wrong". Implementation: `bsd_wasserstein`.

## Calibration and uncertainty

Reported only for methods that expose probabilities. A method that does not is recorded with a
`calibration_status` rationale rather than given a fabricated value.

- **Brier score**, the mean squared error of the probability against the binary outcome. Lower
  is better; it is a proper scoring rule, so it cannot be improved by misreporting confidence.
- **Expected calibration error**, the bin-weighted average gap between confidence and observed
  accuracy. It answers a different question from Brier: whether a stated 0.9 really means 0.9.

Implementation: `binary_calibration_metrics` for probability maps,
`instance_confidence_calibration` for detectors that score whole instances.

## Temporal

Defined in [tracking and event evaluation](../temporal/01_tracking-and-events.md) and applied
across the whole ladder in [the full method matrix](../temporal/02_the-full-method-matrix.md).

- **IDF1**, the identity F1 of Ristani et al. (2016),
  [doi:10.1007/978-3-319-48881-3_2](https://doi.org/10.1007/978-3-319-48881-3_2).
- **HOTA**, which factorises detection and association rather than mixing them: Luiten et al.
  (2021), [doi:10.1007/s11263-020-01375-2](https://doi.org/10.1007/s11263-020-01375-2).
- **ID switches** and **track fragmentations**, read together with frame coverage. A method
  that finds almost nothing has few identities to lose, so a low switch count next to low
  coverage is not a good result.
- **Flow endpoint error**, per-instance centroid displacement error over valid persistent
  matches only.

## Aggregation rules

These are properties of the evaluator, not conventions a reader has to assume:

1. **No silent drops.** A method-case cell that fails to produce a result is an error, not a
   missing row. The release gate fails when any required cell is absent.
2. **Counts travel with aggregates.** Every mean carries the sample count it came from.
3. **Empty controls stay negative tests.** The `empty-control` case has zero ground-truth
   instances, so AP is undefined there by construction (`ap: null`). It is excluded from the
   ranking rather than scored as a perfect or a zero.
4. **Conditions are reported separately.** `robustness_by_condition` keeps all 16 condition
   families apart, because a mean over conditions hides exactly the failure a practitioner
   cares about.
5. **Protocols are never mixed.** Framewise identity metrics and prompted video-propagation
   identity metrics measure different things and are never averaged or ranked together.

## Scope

Every number in the published benchmark comes from the synthetic generator. They are controlled
algorithm evidence: they support statements about how methods compare under known, reproducible
conditions, and they support no statement about accuracy on a real flotation cell. No licensed
real held-out source has been accepted into the scored lane, and the release report carries that
as a blocking error rather than a footnote.
