# Framework card, `scikit-image`

The classical segmentation FLOOR and all per-bubble morphometry run on scikit-image. This is the transparent,
cited baseline the live SAM-class foundation model must beat, plus the `regionprops` descriptors every downstream
layer (BSD, froth-state) consumes. It is a precompute-lane library: it runs in the `.venv-pipeline` locally and
in CI, never in the browser.

Code of record: `data-pipeline/fslab/science/segment.py` (the three floor methods + morphometry) and
`data-pipeline/fslab/io/froth_io.py` (`regionprops` rows in `bsd.csv`).

## What and why

scikit-image is the standard, peer-reviewed Python image-processing library. FrothSeg uses four of its algorithms,
each the canonical tool for its job, so the floor is honest and reproducible rather than a hand-tuned numpy
substitute:

- **Marker-controlled watershed (Meyer)**, `skimage.segmentation.watershed`. The generic distance-transform floor
  method `watershed_dt`: Otsu foreground, exact Euclidean distance transform (via scipy, see the `04_scipy` card),
  markers at the distance maxima, then a marker-controlled flood. This is the textbook froth baseline.
- **Highlight-seeded watershed**, using `skimage.morphology.h_maxima`. The method `watershed_hmax`: the bright
  specular spots (one per bubble) are the markers, which is the classic industrial froth trick (the Aldrich line
  of work). It is robust on clean specular froth and degrades under glare, and that failure is measured, not hidden.
- **SLIC superpixels**, `skimage.segmentation.slic`. The texture-aware baseline `slic_merge`: SLIC oversegments the
  image into compact superpixels, then a mean-intensity region merge groups them.
- **Region morphometry**, `skimage.measure.regionprops`. Per-instance area, equivalent diameter, eccentricity and
  solidity, computed identically for the classical labels, the SAM labels, and the synthetic ground truth.

Why scikit-image over rolling our own: watershed, SLIC, h-maxima and regionprops are subtle to implement correctly
(tie-breaking on plateaus, connectivity, the region-adjacency merge, the correct equivalent-diameter formula). The
research (`research-tools-and-data-2026-07-09.md`) is binding on this point: proper CV libraries, no hand-rolled
numpy for things these libraries do correctly.

## What it is NOT

- It is NOT the product method. The live core is a SAM-family foundation model in the browser; scikit-image is the
  baseline it is compared against. On the synthetic harness the foundation model beats this floor on average
  (mean mask AP 0.365 vs 0.262 over the 13 cases in the committed `data/derived/sam_benchmark.json`), and by a wide
  margin under glare (0.407 vs 0.081), while the floor stays complementary on heavy motion blur and defocus.
- It does NOT run in the browser. There is no scikit-image build for the web; these methods are precompute only.
  The browser has its own light front-end (`frontend/src/preprocess/deglare.ts`) and the live segmenter.
- It is NOT trained on froth. Every method here is unsupervised classical CV, which is exactly why it is a fair,
  label-free baseline for a domain where labelled data is scarce.

## Theory and equations

**Marker-controlled watershed (Meyer).** Treat the (negated) distance map as a topographic surface and flood it
from the markers; a watershed line forms where two basins meet. Meyer's formulation floods along the topographic
distance, the geodesic path cost that accumulates the grey-level gradient:

$$ T_f(p, q) = \min_{\gamma \in [p \rightsquigarrow q]} \int_{\gamma} \lVert \nabla f \rVert \, d\ell $$

Each pixel is assigned to the marker of minimum topographic distance. Seeding the markers well is the whole game:
`watershed_dt` seeds them at the peaks of the distance transform (bubble centres), `watershed_hmax` seeds them at
the specular highlights.

**h-maxima (highlight seeding).** The h-maxima transform suppresses every regional maximum shallower than a
contrast height $h$, keeping only the salient bright spots as markers:

$$ \mathrm{HMAX}_h(f) = R_f^{\delta}\!\left(f - h\right) $$

where $R_f^{\delta}$ is morphological reconstruction by dilation under the mask $f$. In `segment.py` this runs with
$h = 0.06$ on the grayscale image; if no clean highlight survives, the method falls back to the distance-transform
seeding, an honest guard for glare frames.

**SLIC distance.** SLIC is a local k-means in a 5-D space (Lab colour plus $x, y$). A pixel is assigned to the
nearest cluster centre under a distance that trades off colour proximity against spatial compactness:

$$ D = \sqrt{ d_c^{\,2} + \left(\tfrac{d_s}{S}\right)^{2} m^{2} } $$

with $d_c$ the colour distance, $d_s$ the spatial distance, $S$ the grid interval and $m$ the compactness (8 here).

**Equivalent diameter.** Every downstream size number starts from the region area $A$ via the diameter of the
circle of equal area, the same formula the browser and the synthetic ground truth use:

$$ d_{\mathrm{eq}} = 2\sqrt{A / \pi} $$

## Install (exact, verified)

Pinned in `data-pipeline/requirements.txt`, verified on Python 3.12/3.13 (2026-07-10):

```
scikit-image==0.26.0
```

```bash
python -m venv .venv-pipeline
.venv-pipeline/Scripts/activate            # Windows; on Linux/macOS: source .venv-pipeline/bin/activate
pip install scikit-image==0.26.0
```

It pulls numpy and scipy (also pinned in the same file); no system libraries beyond a working numpy/scipy stack.

## Usage

The floor and morphometry, straight from `segment.py`:

```python
import numpy as np
from scipy import ndimage as ndi
from skimage import feature, filters, measure, morphology, segmentation

def watershed_dt(gray: np.ndarray) -> np.ndarray:
    thr = filters.threshold_otsu(gray)
    fg = gray > thr * 0.75
    fg = morphology.remove_small_holes(fg, max_size=16)
    fg = morphology.remove_small_objects(fg, max_size=12)
    dist = ndi.distance_transform_edt(fg)                  # scipy, exact EDT
    coords = feature.peak_local_max(dist, min_distance=4, labels=fg)
    markers = np.zeros(dist.shape, dtype=np.int32)
    for j, (y, x) in enumerate(coords, start=1):
        markers[y, x] = j
    markers = ndi.label(markers)[0]
    return segmentation.watershed(-dist, markers, mask=fg)  # Meyer flood on -distance

# per-instance froth morphometry the BSD + froth-state layers consume
for p in measure.regionprops(labels):
    if p.area < 8:                                          # drop specks
        continue
    d_eq = p.equivalent_diameter_area                       # 2*sqrt(area/pi)
    ecc, sol = p.eccentricity, p.solidity
```

SLIC + merge (the `slic_merge` baseline) uses `segmentation.slic(rgb, n_segments=400, compactness=8, sigma=1,
channel_axis=-1, start_label=1)` followed by a `scipy.ndimage.mean` region-intensity merge.

## Applying it here

- **Stage**: `benchmark` (`data-pipeline/fslab/stages/benchmark.py`) runs `METHODS = {watershed_dt, watershed_hmax,
  slic_merge}` on each synthetic scene, then scores the labels with `mask_ap` and `bsd_wasserstein`.
- **Stage**: `generate` / IO. `froth_io.py` uses `measure.regionprops` to write the per-instance rows of `bsd.csv`
  (id, area_px, d_eq_px, ecc, solidity) for the exact ground-truth masks.
- **Inputs**: a grayscale float image in [0, 1] (H, W). **Outputs**: an int32 instance-label map (0 = background),
  and the morphometry rows. The label map satisfies the same instance contract as the SAM output and the RLE ground
  truth, so all three are scored by one function.

## Applying it to OTHER data

These methods are generic instance-segmentation and shape-measurement tools, not froth-specific:

- **Any packed, roughly-convex objects on a darker boundary network**: cell nuclei, sprayed droplets, sintered
  grains, foam or emulsion micrographs, sediment particles. `watershed_dt` is the default; where each object carries
  a bright specular dot (glossy spheres, wet grains under a ringlight), `watershed_hmax` is the stronger seed.
- **To port to your images**: the only froth-specific choices are the Otsu factor (`thr * 0.75`), the marker
  `min_distance` (4 px, the smallest resolvable object radius) and the h-maxima height (0.06, the highlight contrast).
  Retune those three to your object scale and contrast; everything else is scale-free.
- **regionprops** is fully domain-agnostic: any int label map in, per-instance area, `equivalent_diameter_area`,
  eccentricity, solidity, orientation, and more out. If you need Feret diameter or perimeter instead of the
  equivalent diameter, they are properties on the same `RegionProperties` object.

## Data contract and outliers

- **Input dtype**: float grayscale in [0, 1]. `threshold_otsu` assumes a bimodal-ish histogram; a flat frame
  (empty cell) gives a meaningless threshold, so the empty-control case is expected to yield near-zero instances,
  and that is the correct behaviour, not a bug.
- **Small-object floor**: `remove_small_objects(max_size=12)` and the `p.area < 8` guard in morphometry drop specks
  below the resolvable bubble size; sub-8-pixel blobs are not counted. Set these to your own minimum object area.
- **Glare degradation is real and measured**: under the glare-storm control `watershed_dt` mask AP collapses to
  0.081 (from ~0.39 on clean coarse froth). Do not treat the floor as robust to specular saturation; that is
  precisely the failure the foundation model is brought in to fix.
- **h-maxima fallback**: when `h_maxima` finds no marker (`markers.max() == 0`) `watershed_hmax` silently falls
  back to `watershed_dt`, so a highlight-free frame does not crash but also does not benefit from highlight seeding.
- **SLIC is not instance-exact**: `slic_merge` produces a texture partition, not clean bubble instances; it is the
  weakest, most texture-oriented baseline and is reported as such.

## Caveats and license

- **License**: scikit-image is BSD-3-Clause, freely redistributable. It is a build/precompute dependency; nothing
  from it ships in the browser bundle.
- **Determinism**: `slic` and `peak_local_max` are deterministic for fixed inputs and parameters; the benchmark is
  reproducible because the scenes are a pure function of (spec, seed). No randomness is introduced by these calls.
- **Performance**: watershed and SLIC are O(pixels) and run in milliseconds on the 256x256 synthetic frames; on
  megapixel real frames budget accordingly (this is why the floor is a precompute baseline, not a live method).

## References

`meyer1994` (marker-controlled watershed), `vincent1991` (watershed by immersion), `achanta2012slic` (SLIC
superpixels), `aldrich2010` (froth machine vision and the highlight-seeding tradition). All resolve from
`frontend/src/data/citations.ts`.
