# The staged precompute pipeline

`data-pipeline/fslab/pipeline.py` orchestrates the froth offline pipeline: for each synthetic case it renders a
scene with EXACT per-bubble ground truth, scores the classical floor against that truth, and writes the committed
artifacts plus a manifest. The stage names and signatures are frozen (ADR-0057); the per-product rework is the
science inside them.

**What this is.** The benchmark-harness lane: the only place FrothSeg has exact per-bubble labels, so the only
place a segmenter can be scored with real mask metrics. It bakes the artifacts the web replays and the
classical-floor numbers the live SAM core is compared against.

**What this is NOT.** It is not the product. The product is live SAM-class segmentation of REAL (uploaded) froth,
which runs in the browser and is measured live in JS, never here. Public per-bubble froth masks are legally
request-only, so the committed cases are synthetic and labelled synthetic everywhere; synthetic mask AP is not
real-plant AP.

## The stages

| Stage | Module | Does |
|---|---|---|
| ingest (CONTRACT 1) | `stages/ingest.py` | apply the bring-your-own-froth image gate to a REAL frame (accept / reject with a reason / flag glare and low contrast). Not part of the synthetic all-cases run, since synthetic scenes are ground truth by construction. |
| generate | `stages/generate.py` | render one synthetic froth scene: a grayscale image plus the EXACT `int32` instance map and the BSD ground truth (`science/froth_gen.py`). |
| benchmark | `stages/benchmark.py` | run every classical FLOOR method on the scene and score it against the exact GT: instance mask AP@[.5:.95] plus BSD Wasserstein-1 (`science/segment.py`). |
| export (CONTRACT 2) | `stages/export.py` | encode the scene into `frame.png`, `masks.json` (COCO-RLE), `bsd.csv`, `benchmark.json`, `card.json`, and write the authoritative manifest with per-artifact sha256 and the lane verdict. |

`pipeline.precompute(case_id, seed)` chains generate, then benchmark, then export. `run_all` iterates every case
and writes the flat `data/derived/manifests/index.json` inventory. Run it with:

```
python -m fslab.pipeline              # all cases
python -m fslab.pipeline poly-normal  # one case
python -m fslab.pipeline --check      # re-verify committed artifacts vs a fresh run (CONTRACT-2 check)
```

Outputs land under `data/derived/synth/<case>/` (the five artifacts) and `data/derived/manifests/<case>.json`
plus `index.json`.

## generate: the synthetic froth model

`science/froth_gen.py` renders physically-flavoured froth with the proper CV stack (`scipy.ndimage`,
`scikit-image`, OpenCV), never hand-rolled numpy for operations these libraries do correctly. A case is a pure
function of `(spec, seed)`; all randomness comes from a seeded `numpy.random.Generator`.

**Geometry, the Laguerre (power) diagram.** Centres are packed by random sequential adsorption with log-normal
radii, and each pixel is assigned to the site of minimum power distance:

$$\mathrm{cell}(p) = \arg\min_i \left( \lVert p - c_i \rVert^2 - r_i^2 \right)$$

The power (Laguerre) diagram is the standard dry-foam tessellation: cells meet at curved Plateau borders, the
dark junctions real froth shows (Weaire and Hutzler 1999; Aurenhammer 1987). The radii are drawn log-normal so
the Sauter mean diameter is controllable. Since $d_{32} = \langle d^3\rangle/\langle d^2\rangle = \exp(\mu +
\tfrac{5}{2}\sigma^2)$ for a log-normal, the generator sets $\mu = \ln d_{32} - \tfrac{5}{2}\sigma^2$ to hit a
target $d_{32}$.

**Appearance.** A base grey darkened at cell boundaries using the EXACT Euclidean distance transform
(`scipy.ndimage.distance_transform_edt` of the boundary set), plus a per-bubble specular highlight that is
deliberately jittered and sometimes dropped so highlight-seeded watershed cannot win artificially, plus per-case
stressors: a glare lobe, horizontal motion blur (`cv2.filter2D`), Gaussian defocus (`scipy.ndimage.gaussian_filter`),
and additive sensor noise.

**BSD ground truth.** From the rendered instance areas, each bubble's equivalent diameter is the diameter of the
circle of equal area, and the distribution is summarised by percentiles and the surface-weighted Sauter mean:

$$d_{\mathrm{eq}} = 2\sqrt{A/\pi} \qquad d_{32} = \frac{\sum_i d_i^{\,3}}{\sum_i d_i^{\,2}}$$

The case set is 13 coverage-axis points (`CASES`): a monodisperse and an empty positive/negative control, the
nominal polydisperse case, fine and coarse froth, and the stressors (glare, watery, motion blur, defocus, high
load, sensor noise, bursting, edge framing). Each carries the labels a froth-vision expert should see.

## benchmark: the classical floor

`science/segment.py` implements the honest, cited baselines the foundation model must beat, all in scikit-image:

- `watershed_dt`: Otsu foreground, exact distance-transform markers, marker-controlled watershed (Meyer 1994;
  Vincent and Soille 1991). The generic floor.
- `watershed_hmax`: highlight-seeded, the classic industrial trick (bright specular h-maxima are the markers).
  Robust on clean specular froth, collapses under glare, which is the honest failure the glare control exposes.
- `slic_merge`: SLIC superpixels merged by mean intensity (Achanta et al. 2012), texture-aware.

Each method's prediction is scored against the exact GT with `mask_ap` (greedy IoU matching, mean over IoU
thresholds .5:.05:.95) and `bsd_wasserstein` (Wasserstein-1 between the predicted and true diameter
distributions). The metrics are defined once and reused for the live SAM core, so the comparison is fair. See
[model evaluation](06_model-evaluation.md) for the equations and the verified numbers.

## export: CONTRACT 2 and the lane

`stages/export.py` writes the five artifacts, computes each one's byte size and sha256, and builds the manifest
(`core/manifest.py`, schema `frothseg.manifest/v1`, generator `laguerre-power-diagram/v1`). The manifest is a
pure function of `(spec, seed)`: no wall-clock, so a re-run does not dirty git.

The export stage classifies the case lane by MEASUREMENT (`core/gate.py`). The synthetic GT and classical
benchmark are baked offline because scipy, scikit-image, and OpenCV are not Pyodide-safe and the frames are full
images, so the [gate](03_the-gate.md) marks the case `precompute` and the SPA replays the committed artifact. The
LIVE capability is separate: the browser SAM-class segmenter (`frontend/src/sam`, onnxruntime-web with WebGPU,
WASM fallback) runs on `frame.png` or an upload and is timed live in JS, not in this pipeline.

## Applying it to other data

The synthetic generator is only for exact GT; it is not how you point FrothSeg at real froth. A real frame enters
through `stages/ingest.py` (CONTRACT 1): it is validated, and if accepted the browser SAM core segments it and
computes the same BSD reduction. Because the offline benchmark and the live browser BSD use the identical
`d_{\mathrm{eq}} = 2\sqrt{A/\pi}` reduction, numbers measured live on an upload are directly comparable to the
baked synthetic ground truth. The contracts are documented in [the two data contracts](08_data-contracts.md).
