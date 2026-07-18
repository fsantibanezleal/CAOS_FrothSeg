# Framework card, `scipy`

scipy carries three exact numerical primitives the pipeline depends on: the exact Euclidean distance transform
(used both to darken the synthetic Plateau borders and to seed the watershed markers), the Gaussian filter (the
defocus stressor), and the Wasserstein-1 distance (the bubble-size-distribution fidelity metric). It is a
precompute-lane library: it runs in the `.venv-pipeline` locally and in CI, never in the browser.

Code of record: `data-pipeline/fslab/science/froth_gen.py` (EDT borders, gaussian defocus) and
`data-pipeline/fslab/science/segment.py` (EDT watershed markers, `scipy.stats.wasserstein_distance`,
`ndi.sum`/`ndi.mean`/`ndi.label`).

## What and why

scipy is the standard scientific-computing library; FrothSeg uses two of its subpackages:

- **`scipy.ndimage`** for the exact Euclidean distance transform (`distance_transform_edt`), connected-component
  labelling (`label`), region reductions (`sum`, `mean`), and Gaussian smoothing (`gaussian_filter`).
- **`scipy.stats`** for `wasserstein_distance`, the earth-mover distance between the predicted and true bubble
  diameter distributions.

Why scipy over a hand-rolled version: the EDT is the one place a naive implementation quietly goes wrong. A
chamfer or grid-step approximation gives the wrong border geometry and biases the watershed markers; scipy computes
the exact Euclidean transform (Felzenszwalb-Huttenlocher style separable algorithm). The research dossier is
explicit that the earlier draft's hand-rolled chamfer/blur had to be replaced with scipy.ndimage, so the border
darkening and the marker seeding are geometrically correct.

## What it is not

- It is not a segmentation method. scipy provides the distance transform and the metric; the segmentation itself is
  scikit-image (the floor) or the SAM-class model (the product).
- It does not run in the browser. The live BSD reduction is re-implemented in TypeScript
  (`frontend/src/sam/morphometry.ts`) so the browser numbers match; scipy is precompute only.
- `wasserstein_distance` is not an accuracy score. It measures how close two size histograms are in shape; a method
  can miss individual bubbles yet still land a low Wasserstein if the aggregate distribution is right, which is why
  the benchmark reports it alongside mask AP, not instead of it.

## Theory and equations

**Exact Euclidean distance transform.** For a binary set, the EDT gives every pixel its true Euclidean distance to
the nearest boundary pixel:

$$ D(p) = \min_{q \,\in\, \partial\Omega} \lVert p - q \rVert_2 $$

Two uses in the code. In `froth_gen.py`, `D` is computed on the complement of the inter-cell edge map, so the
darkening term $\exp(-D / \lambda)$ falls off with true distance from the Plateau border (curved dark junctions,
the cue real froth shows). In `segment.py`, `D` is computed inside the froth foreground and its maxima (found by
`peak_local_max`) become the watershed markers, one per bubble.

**Gaussian defocus.** The defocus stressor convolves the frame with an isotropic Gaussian, the standard optical
blur model:

$$ (G_\sigma * I)(x, y), \qquad G_\sigma(x, y) = \frac{1}{2\pi\sigma^{2}} \exp\!\left( -\frac{x^{2}+y^{2}}{2\sigma^{2}} \right) $$

with $\sigma = \texttt{spec.defocus}$ (2.4 px for the defocus case). This is deliberately a place SAM struggles:
blur removes the promptable structure, so the confident-mask count drops (37 masks vs 170 GT on the defocus case)
and the classical floor stays complementary. That tradeoff is reported honestly, not smoothed over.

**Wasserstein-1 (earth-mover) distance.** The BSD fidelity is the L1 distance between the two empirical CDFs of
bubble diameter, which for one-dimensional distributions equals the integral of the absolute CDF difference:

$$ W_1(P, Q) = \int_{-\infty}^{\infty} \bigl| F_P(x) - F_Q(x) \bigr| \, dx $$

where $F_P, F_Q$ are the CDFs of the predicted and ground-truth diameter sets. $W_1 = 0$ means the two size
distributions are identical; the units are pixels of diameter. The diameters themselves come from the instance
areas via $d_{\mathrm{eq}} = 2\sqrt{A/\pi}$ (computed here with `ndi.sum` over the label map).

## Install (exact, verified)

Pinned in `data-pipeline/requirements.txt`, verified on Python 3.12/3.13 (2026-07-10):

```
scipy==1.18.0
```

```bash
pip install scipy==1.18.0        # into the .venv-pipeline
```

It requires numpy (pinned `numpy==2.4.6` in the same file). No extra system libraries.

## Usage

Exact-EDT border darkening and defocus (from `froth_gen.py`):

```python
from scipy import ndimage as ndi
import numpy as np

# darken toward the nearest cell boundary via the exact Euclidean distance transform of the interiors
edge = np.zeros((h, w), bool)
edge[:, :-1] |= lab[:, :-1] != lab[:, 1:]
edge[:-1, :] |= lab[:-1, :] != lab[1:, :]
bd = ndi.distance_transform_edt(~edge)             # true distance to the Plateau border
img -= 0.32 * (1.0 - spec.watery * 0.6) * np.exp(-bd / (1.6 + 3.0 * spec.watery))

if spec.defocus > 0:
    img = ndi.gaussian_filter(img, spec.defocus)   # isotropic optical blur
```

BSD fidelity (from `segment.py`):

```python
from scipy.stats import wasserstein_distance

def _diams(lab):
    ids = np.unique(lab[lab > 0])
    counts = np.asarray(ndi.sum(np.ones_like(lab), lab, index=ids))
    return 2.0 * np.sqrt(counts / np.pi)           # d_eq per instance

W1 = wasserstein_distance(_diams(pred), _diams(gt))  # 0 = distributions match
```

## Applying it here

- **Stage `generate`** (`froth_gen.render`): the EDT builds the Plateau-border darkening; `gaussian_filter`
  applies the defocus stressor. **Inputs**: the int32 Laguerre label map and the base grayscale frame. **Outputs**:
  the rendered grayscale image in [0, 1].
- **Stage `benchmark`** (`segment.bsd_wasserstein`, called from `stages/benchmark.py`): scores each method's BSD
  against the ground-truth diameters. **Inputs**: two int32 label maps (prediction and GT). **Output**: one float
  (rounded to 3 dp), or `None` when either side is empty.
- **In the floor** (`segment.watershed_dt` / `watershed_hmax`): `distance_transform_edt` inside the foreground
  gives the marker seeds; `ndi.label` turns marker points into integer markers; `ndi.mean` drives the SLIC merge.

## Applying it to other data

- **The EDT is a universal geometry primitive**: skeletonisation, morphology, marker seeding for any watershed,
  proximity maps, and physically-flavoured shading of any tessellation. Any binary mask in, exact distances out.
  The border-darkening trick generalises to any cellular texture (foams, cracked mud, Voronoi-like tissue).
- **`wasserstein_distance` compares any two 1-D samples**: particle-size distributions, grain-size curves, pore
  radii, wait-time histograms. It needs no binning and is symmetric and in the data's own units, which makes it a
  better default than a chi-square on arbitrary bins. For weighted samples pass `u_weights`/`v_weights`.
- **`gaussian_filter` and the ndimage reductions** (`sum`, `mean`, `label`) are the generic building blocks for any
  region-wise statistic over a label map; nothing about them is froth-specific.

## Data contract and outliers

- **EDT input is boolean**: `distance_transform_edt` operates on a mask; pass the interior (or its complement) as a
  bool array. A frame with no foreground yields an all-zero (or all-large) distance map, so the empty-control case
  degenerates gracefully to zero markers rather than erroring.
- **Wasserstein needs non-empty samples on both sides**: `bsd_wasserstein` returns `None` when either the predicted
  or the GT diameter set is empty (a method that finds nothing, or an empty frame). Downstream code must treat
  `None` as "not scorable", not as 0. The motion-fast and defocus cases push the predicted count far below GT
  (25 and 37 masks vs ~170-200), inflating the Wasserstein (3.62 and 5.43 px) precisely because whole bubbles are
  missed; that large value is the honest signal, not noise.
- **Diameter definition is fixed**: diameters are the equivalent-circle diameter of the instance area, identical to
  scikit-image's `equivalent_diameter_area` and to the browser `bsdFromAreas`, so the three code paths are directly
  comparable. Do not mix in a Feret or major-axis diameter without changing all three.
- **Gaussian edge handling**: `gaussian_filter` uses reflect boundaries by default; for tiled inference on large
  real frames, blur tile-by-tile can seam at borders. Not an issue on the whole-frame synthetic scenes.

## Caveats and license

- **License**: scipy is BSD-3-Clause, freely redistributable. Precompute dependency only; nothing ships to the web.
- **Exactness**: `distance_transform_edt` is the exact Euclidean transform (not chamfer), which is the whole reason
  it replaced the earlier hand-rolled approximation; the border geometry and marker seeds are geometrically correct.
- **Determinism**: all scipy calls used here are deterministic pure functions of their array inputs, so the
  synthetic scenes and the benchmark scores are byte-reproducible under the manifest sha256 gate.

## References

`aldrich2010` and `sauter1928` (the BSD summaries the Wasserstein metric compares), plus the foam-physics
references on the `04`-adjacent generator card. scikit-image's watershed that consumes the EDT markers is documented
in the `03_scikit-image` card. All ids resolve from `frontend/src/data/citations.ts`.
