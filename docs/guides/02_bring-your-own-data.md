# Guide, bring your own froth

Bring-your-own data is one input route into the full product, not the whole
product.
FrothSeg does not commit third-party real images. A licensed public instance
dataset exists in Roboflow Universe, while site data is commonly private. Both
enter through the same governed offline contract; an ad-hoc upload remains a
bounded qualitative path. The door is **CONTRACT 1**, the image gate.

## What this is, and what it is not

- It **is** a bounded exploratory path: upload a froth image, select any C1-C7
  TypeScript method or legacy SlimSAM, and inspect masks and BSD client-side.
- It is **not** a place to obtain a mask-AP number for your image. AP requires per-bubble ground truth, which a
  real froth photo does not have. The AP read-out only exists for the synthetic samples, where the exact GT is
  known (`frontend/src/sam/score.ts`, mirrored to `fslab.science.segment.mask_ap`).
- It is **not** the training or release path. Governed datasets are ingested
  offline, assigned splits, trained, calibrated, evaluated, and exported there.

## Acquire and register the public real candidate

The source `roboflow-froth-rk6ka` contains 88 real froth images with bubble
instance annotations under CC-BY-NC-SA-4.0. Roboflow requires an account API key
for dataset export. Keep that key outside the repository:

```powershell
$env:ROBOFLOW_API_KEY = '<scoped key>'
./.venv-gpu/Scripts/python.exe scripts/fetch_roboflow_froth.py
```

The fetcher writes only to ignored `data/raw/`, rejects overwrite, verifies the
archive hash, blocks path-traversal members, and records source/license
provenance without persisting the credential.

Roboflow annotations alone are not release evidence. Create a
`frothseg.real-metadata/v1` JSON overlay keyed by `file_name`; every row must
provide a leakage-safe `group_id` and a traceable positive `mm_per_px`. The
document must also contain an independently accepted `annotation_review` with a
named reviewer. Then validate and export the derived manifest:

```powershell
./.venv-gpu/Scripts/python.exe scripts/import_real_coco.py `
  --annotations data/raw/roboflow-froth-rk6ka/train/_annotations.coco.json `
  --images data/raw/roboflow-froth-rk6ka/train `
  --metadata data/local/roboflow-froth-metadata.json
```

Raw images and local review material stay out of git; the derived manifest
contains local URIs, split assignments, counts, provenance, and review state.
The release gate remains closed until this evidence exists.

## CONTRACT 1: the image gate (accept / reject / flag)

Before spending a SAM inference, the frame is validated. The gate is defined once in Python
(`data-pipeline/fslab/io/contract.py`, `validate_image`) and mirrored byte-for-byte in the browser
(`frontend/src/lib/imageGate.ts`, `validateImage`) so a bad upload is rejected in the browser first. Both operate
on a grayscale image normalised to $[0,1]$ (Rec.601 luma for RGB).

It computes three statistics: the dynamic range (the 1st-to-99th percentile spread), the saturated fraction
(pixels above 0.97), and the dark fraction (pixels below 0.03),

$$\mathrm{dyn} = p_{99} - p_{01}, \qquad \mathrm{sat} = \tfrac{1}{N}\bigl|\{g > 0.97\}\bigr|, \qquad \mathrm{dark} = \tfrac{1}{N}\bigl|\{g < 0.03\}\bigr|,$$

and applies these thresholds:

| threshold | value | verdict |
|---|---|---|
| min side | 64 px | below this a frame has too few pixels per bubble, reject |
| max side | 8192 px | guard against pathological uploads, reject |
| dynamic range (reject) | < 0.06 | a blank / flat / constant frame, reject |
| dynamic range (flag) | < 0.15 | low contrast, flag (recommend deglare / flatten) |
| saturated fraction (flag) | > 0.20 | heavy glare, flag |
| dark fraction (flag) | > 0.55 | under-exposed / mostly pulp, flag |

Plus structural rejects: unsupported shape (must be 2D gray or 3D RGB/RGBA), non-numeric dtype, or NaN/Inf
pixels. Nothing is silently coerced: a bad frame is rejected with a reason; a usable-but-degraded frame is
accepted but flagged so the UI can warn and the front-end can react.

## The deglare / illumination-flatten front-end

The FLAGs drive the pre-processing. When the gate flags heavy glare or low contrast, the lightweight front-end
(glare soft-clip attenuation and retinex-style illumination flattening, a dependency-free canvas port in
`frontend/src/preprocess/deglare.ts`, not OpenCV.js inpaint) can be applied before segmentation, exactly the real
froth-camera failure mode where the classical highlight-seeded methods collapse. This is why the App exposes the
deglare/flatten step: it is not decoration, it is what lets SAM survive real glare. Motion blur and defocus
are honestly the classical floor's territory (the smear removes the promptable structure SAM needs), so the App
offers both methods and lets you compare.

## What runs live vs what needs ground truth

| capability | on a real upload | on a synthetic sample |
|---|---|---|
| SAM instance segmentation (masks, count) | yes, live in-browser | yes, live in-browser |
| BSD (d10 / d50 / d90 / d32, % fines) | yes | yes |
| froth-state read-out (class + health gauge) | yes, a labelled heuristic proxy | yes |
| mask AP / BSD Wasserstein vs GT | no (no ground truth exists) | yes (exact GT known) |

The froth-state read-out (`frontend/src/sam/frothState.ts`) is a heuristic proxy grounded in the froth-vision
literature (Aldrich et al. 2010: BSD + froth class as soft sensors), not a calibrated plant setpoint. It is
always shown as an interpretation of what the segmenter measured, labelled as a proxy.

## Live controls

The auto-mask thresholds are exposed as live controls, so you can trade recall against precision on your own
image: predicted-IoU (default 0.86), stability (default 0.90), the point-grid density (default 32x32), the NMS
IoU (default 0.7), and the min/max area filters. The stability score is the SAM definition,

$$\mathrm{stability} = \frac{\bigl|\{\ell(p) > +\delta\}\bigr|}{\bigl|\{\ell(p) > -\delta\}\bigr|}, \qquad \delta = 1.0,$$

the IoU of the mask thresholded at logit $+\delta$ and $-\delta$; a stable mask barely changes as the threshold
moves. Lower the thresholds to recover more (but noisier) bubbles on a hard frame; raise them to keep only
confident masks.

## Data contract and outliers

- **Provide froth, framed on the froth surface.** A crop off the froth (launder water, cell wall) reads as
  `empty` and returns near-zero bubbles, which is the correct behaviour, not a bug.
- **Scale.** Sizes are reported in pixels unless you enter a pixel-per-mm scale, after which the read-out converts
  to mm. Without a scale the BSD is still valid, just in pixel units.
- **Domain shift is real.** Froth appearance varies by ore, cell, camera and lighting; a read-out calibrated on
  one site does not transfer to another. The froth-state class is a proxy, not a site setpoint.
- **Extending the gate.** If your froth legitimately does not fit (for example a much larger sensor), extend
  CONTRACT 1 and its tests deliberately, in both the Python source and the TS mirror so they stay in lockstep;
  never loosen it just to make a bad frame pass.
- **To score a method with real metrics you still need the synthetic harness** (exact GT), see
  [01_precompute-pipeline.md](01_precompute-pipeline.md) and the offline SAM verification in
  [03_verify-sam.md](03_verify-sam.md).
