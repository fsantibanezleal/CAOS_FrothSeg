# Framework card, `opencv` (opencv-python-headless)

OpenCV is the offline image-operations library. In the shipped pipeline its wired role is narrow and honest: it
applies the **motion-blur stressor** to the synthetic generator (`cv2.filter2D`). It also names the intent of the
browser real-froth front-end (deglare and illumination flatten), but that front-end is a deliberately lightweight
canvas/typed-array port, not OpenCV.js. This card is explicit about what runs where, so the docs never overclaim a
10 MB WASM OpenCV that is not in the bundle.

Code of record: `data-pipeline/fslab/science/froth_gen.py` (`cv2.filter2D` motion blur) and, for the browser
front-end this mirrors in spirit, `frontend/src/preprocess/deglare.ts` (pure canvas, no OpenCV).

## What and why

- **Offline (wired)**: `cv2.filter2D` convolves the rendered frame with a horizontal line kernel to simulate froth
  moving under the camera during exposure. This is the `motion-fast` stress case, a coverage axis that is meant to
  be hard (blur removes the promptable structure SAM needs).
- **Browser front-end (intent, not OpenCV)**: real froth frames carry uneven lighting and bright specular glare
  that wash out bubble borders. The offline OpenCV playbook for this is illumination flatten plus specular
  attenuation. Rather than ship a ~10 MB `opencv.js` WASM blob just for a preprocessing step, the browser does the
  same intent at a fraction of the weight in pure canvas/typed arrays: retinex-style illumination division and a
  soft-clip glare attenuation (`deglare.ts`). It is honest to call this an OpenCV-flavoured port, not OpenCV.

Why OpenCV for the offline stressor: `filter2D` is the standard, correct separable convolution; using it (rather
than a hand-rolled kernel loop) keeps the generator on the proper CV stack the research mandates.

## What it is not

- It is not in the browser bundle. There is no `opencv.js` shipped. Anything the live app does for glare/lighting is
  the canvas port in `deglare.ts`, which is smaller and good enough as a pre-segmentation normaliser, not a full
  OpenCV replacement.
- It is not a segmentation method. OpenCV here only degrades the synthetic image (motion blur) and, conceptually,
  normalises real frames; the segmentation is scikit-image (floor) or the SAM-class model (product).
- **unverified / intended, not wired**: the research plan and the `requirements.txt` comment also list OpenCV for
  specular inpaint and for optical-flow froth velocity. As of this build those are not implemented in the pipeline;
  the only `cv2` call in the code is the motion-blur `filter2D`. Treat optical-flow velocity and inpaint as planned
  roles, and do not present them as shipped.

## Theory and equations

**Motion blur as a line convolution.** A linear camera-froth motion during exposure is modelled by convolving the
frame with a normalised line (box) kernel oriented along the motion direction. For a horizontal motion of length
$L$:

$$ I_{\text{blur}} = K * I, \qquad K_{ij} = \frac{1}{L}\,\big[\, i = \lfloor L/2 \rfloor \,\big] $$

that is, a single bright row of length $L$ normalised to sum 1 (here $L = \texttt{spec.motion\_blur}$, 11 px for the
motion-fast case).

**Illumination flatten (browser port, retinex-style).** Divide the frame by a large-kernel blurred background
estimate $B$ and rescale to preserve mean brightness, so a slow lighting gradient is removed while bubble texture
survives:

$$ I_{\text{flat}}(p) = \operatorname{clip}_{[0,1]}\!\left( \frac{I(p)}{B(p)} \cdot \bar{B} \right), \qquad B = \text{box-blur}_r(I) $$

**Glare soft-clip (browser port).** Pixels above a saturation threshold $h$ are pulled toward the local background
$B$ by how saturated they are, softening specular highlights without hard-clipping the whole image:

$$ I_{\text{deglare}}(p) = \begin{cases} (1-t)\,I(p) + t\,B(p), & I(p) > h,\; t = \dfrac{I(p)-h}{1-h} \\[4pt] I(p), & \text{otherwise} \end{cases} $$

Both browser operations use an O(n) separable running-sum box blur (two passes), so they are cheap enough to run
before every live segmentation. Glare is the froth-camera failure mode where highlight-seeded watershed and
white-blob SAM prompts both struggle; attenuating it helps the real-frame path.

## Install (exact, verified)

Pinned in `data-pipeline/requirements.txt`, verified on Python 3.12/3.13 (2026-07-10):

```
opencv-python-headless==5.0.0.93
```

```bash
pip install opencv-python-headless==5.0.0.93     # into the .venv-pipeline
```

Use the **headless** wheel deliberately: CI and the generator never open a GUI window, and the headless build drops
the GTK/Qt system dependencies (no `libGL` needed on a bare Linux runner). The browser needs nothing from this
package; the canvas port has zero third-party dependencies.

## Usage

The wired offline use (from `froth_gen.py`):

```python
import cv2
import numpy as np

if spec.motion_blur > 1:                        # linear motion-blur stressor
    k = np.zeros((spec.motion_blur, spec.motion_blur))
    k[spec.motion_blur // 2, :] = 1.0 / spec.motion_blur
    img = cv2.filter2D(img, -1, k)
```

The browser front-end intent (from `deglare.ts`, pure canvas, no OpenCV):

```ts
export function preprocess(gray: Float32Array, w: number, h: number, o: DeglareOptions = {}): Float32Array {
  let out = gray;
  if (o.flatten) out = flattenIllumination(out, w, h, o.flattenRadius ?? 24);  // retinex-style divide
  if (o.deglare) out = attenuateGlare(out, w, h, o.glareHi ?? 0.9);            // soft-clip highlights
  return out;
}
```

## Applying it here

- **Stage `generate`** (`froth_gen.render`): `cv2.filter2D` produces the motion-blur case. **Input**: the rendered
  grayscale frame. **Output**: the blurred grayscale frame. Purely a stressor; the ground-truth masks are unchanged
  (the blur is on the appearance, not the geometry), which is what makes it a fair "hard case" for the segmenters.
- **Browser (front-end)**: `deglare.ts` runs before the live segmenter on real, uploaded frames; the flatten and
  deglare toggles are user-visible, and the CONTRACT-1 flags decide when to apply them. This helps the real-glare
  path; motion and defocus remain the classical floor's territory (see the SAM verification).

## Applying it to other data

- **`cv2.filter2D`** is a generic linear filter: any custom kernel (motion, emboss, sharpen, edge) over any image.
  The line-kernel motion blur generalises to any camera-motion simulation for data augmentation or robustness tests.
- **The illumination-flatten and glare soft-clip** (whether via OpenCV offline or the canvas port) apply to any
  imagery with a lighting gradient and specular highlights: microscopy under uneven illumination, glossy-surface
  inspection, wet mineral or foam under a ringlight. Retune the blur radius to the scale of the lighting gradient
  and the glare threshold to your sensor's saturation point.
- **If you do want full OpenCV in the browser**, `opencv.js` exists, but for a single pre-normalisation step the
  canvas port is the right weight tradeoff; reach for `opencv.js` only when you need contours, optical flow, or
  feature matching client-side.

## Data contract and outliers

- **Motion blur is a stressor, not a correction**: it makes the image harder on purpose. On the motion-fast case
  the SAM confident-mask count drops to 25 (vs ~197 GT), so mask AP falls to 0.016 while the classical floor edges
  ahead (0.104); that is the intended, reported behaviour of a deliberately degraded case.
- **Headless wheel only**: do not swap in the GUI `opencv-python` wheel in CI; it drags in system GL/Qt libraries
  the runner does not have. The pinned `opencv-python-headless` is the contract.
- **Browser port is approximate**: the canvas flatten/deglare are simple, cheap normalisers (box-blur division and
  a soft-clip), not OpenCV's full retinex or inpaint. They reduce glare and lighting drift enough to help the
  segmenter; they do not reconstruct saturated-out detail. State this to users, do not imply full deglare.
- **unverified roles**: optical-flow froth velocity and specular inpaint are named in the plan but not wired; any
  doc or UI must not present them as available until the code exists.

## Caveats and license

- **License**: OpenCV is Apache-2.0, freely redistributable. It is a precompute dependency; nothing from it ships
  in the browser bundle (the live glare/lighting handling is the dependency-free canvas port).
- **Determinism**: `cv2.filter2D` is a deterministic convolution; the motion-blur case is byte-reproducible under
  the manifest sha256 gate for a fixed (spec, seed).
- **Honesty note carried into the app**: the About/Methods pages must say the browser deglare is a lightweight port
  of OpenCV's intent, not OpenCV.js, and that motion/defocus are honestly the classical floor's territory.

## References

`aldrich2010` (froth machine vision, why glare and lighting matter for froth soft sensors). The generator's other
operators (exact EDT borders, Gaussian defocus) are on the `04_scipy` card; the geometry model is the foam-physics
references (`weaire1999foams`, `aurenhammer1987`). All ids resolve from `frontend/src/data/citations.ts`.
