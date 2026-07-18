# Framework card, the SAM automatic mask generator (the product method)

The live core of FrothSeg. It runs a SAM-family foundation model as an **automatic mask generator**: no user
clicks, no froth training labels. A dense grid of point prompts sweeps the image, the confident and stable
masks survive a filter, duplicates are removed by non-maximum suppression, and the kept masks become a disjoint
instance-label map plus a bubble-size distribution (BSD). This card is the algorithm; the runtime it sits on is
[`01_transformers-js`](../01_transformers-js/transformers-js.md).

Source of truth: `frontend/src/sam/autoMask.ts` (the exact code this card describes), with the reduction in
`morphometry.ts` and the scoring in `score.ts`.

## What it is, and what it is not

**It is** the standard `SamAutomaticMaskGenerator` of Kirillov et al. 2023, applied zero-shot to flotation
froth: encode once, prompt with a grid, keep best-of-3 masks by predicted IoU, filter on predicted-IoU /
stability / area, dedupe by greedy IoU NMS. It runs the same in the browser (onnxruntime-web, WebGPU with a
WASM fallback) and in Node (onnxruntime-node) for the offline verification harness.

**It is not**:

- **Not a froth-trained model.** SlimSAM/MobileSAM were trained on general images, never on flotation froth.
  There is no froth fine-tuning here; the generality is the point, because public per-bubble froth labels are
  legally constrained and scarce.
- **Not a real-plant accuracy claim.** The only place mask accuracy is measured is the synthetic Laguerre-foam
  harness, where exact ground-truth masks exist. Synthetic AP is a controlled measurement, not plant AP. The
  real capability is live segmentation of froth the user uploads.
- **Not infallible on blur.** Even a foundation model merges and splits touching translucent bubbles, and when
  motion blur or defocus removes the promptable structure the confident-mask count collapses (25 and 37 masks
  on the motion-fast and defocus controls, against roughly 197 and 170 ground-truth instances). On those cases
  the classical floor is complementary; the App ships both and says so.
- **Not a fixed black box.** The grid density and all filter thresholds are live controls, so the user sees the
  precision/recall and speed/quality trade-offs directly.

## The algorithm, term by term

Let the input frame be $W \times H$. The SAM encoder is heavy; the decoder is light. The whole method is built
so the encoder runs **once**.

**1. Encode once.** The image passes through the ViT encoder a single time to produce an embedding
$E$ and its positional embedding, together with the resized frame size $(H_r, W_r)$ SAM works in and the
original size $(H, W)$. Every prompt afterwards reuses $E$; nothing re-encodes.

**2. Dense point grid.** A grid of $n \times n$ foreground points (default $n = 32$, so 1024 prompts) is laid
over the frame, inset from the border by a small margin (`cropMarginFrac`, default 0.02). Point $(i_x, i_y)$
sits at the cell centre

$$ x = m_x + \frac{i_x + 0.5}{n}\,(W - 2 m_x), \qquad y = m_y + \frac{i_y + 0.5}{n}\,(H - 2 m_y), $$

with margins $m_x = \text{cropMarginFrac}\cdot W$, $m_y = \text{cropMarginFrac}\cdot H$. Each point is scaled
into SAM's resized frame ($x_r = x\,W_r/W$, $y_r = y\,H_r/H$) and labelled foreground.

**3. Decode, best of 3.** Points are decoded in batches (`pointBatch`, default 64) against the cached
embedding. For each point SAM's multimask head returns three candidate logit masks with a predicted IoU each;
the method keeps the single candidate with the highest predicted IoU $\hat{\imath}$, then drops it if
$\hat{\imath} < \text{predIouThresh}$ (default 0.86). Decoding a batch reuses $E$, so this loop is the cheap,
repeatable part.

**4. Stability filter.** A mask is stable if thresholding its logits a little higher versus a little lower
barely changes it. With logit field $\ell(p)$ and offset $\delta$ (default 1.0), the high set is a subset of
the low set, so their IoU is simply the ratio of sizes:

$$ \mathrm{stability} = \frac{\bigl|\{\, \ell(p) > +\delta \,\}\bigr|}{\bigl|\{\, \ell(p) > -\delta \,\}\bigr|}. $$

Masks below `stabilityThresh` (default 0.90) are discarded. This is the filter that rejects the wispy,
threshold-sensitive masks glare and translucency produce.

**5. Binarize and measure geometry.** The chosen logit mask is upscaled bilinearly to the original resolution
and thresholded at 0 to a binary mask; its area (pixel count) and bounding box are measured in the same pass.
Masks with area below `minAreaPx` (default 25, specks) or above `maxAreaFrac` of the frame (default 0.5,
runaway masks) are dropped.

**6. Greedy IoU NMS.** Many grid points land inside the same bubble, so candidates are sorted by
$\hat{\imath}\cdot\mathrm{stability}$ (highest first) and a duplicate is suppressed if its IoU with an
already-kept mask exceeds `nmsIou` (default 0.7), where

$$ \mathrm{IoU}(A,B) = \frac{|A \cap B|}{|A \cup B|}. $$

A bounding-box overlap test rejects most pairs before the pixel intersection is counted, keeping NMS fast.

**7. Paint labels.** The kept masks, highest score first, are painted into an $H\times W$ integer label map;
a pixel keeps its first (best) owner, so overlapping SAM masks resolve into clean, disjoint instances (0 =
background).

**8. BSD reduction.** Each instance area $A$ gives an equivalent diameter (the diameter of the circle of equal
area),

$$ d_{\mathrm{eq}} = 2\sqrt{A/\pi}, $$

and the distribution is summarised by the D10/D50/D90 percentiles and the Sauter (surface-weighted) mean, the
standard flotation summary,

$$ d_{32} = \frac{\sum_i d_i^{\,3}}{\sum_i d_i^{\,2}}. $$

This exact reduction (`morphometry.ts`) mirrors the Python `fslab` code, so the live browser numbers are
directly comparable to the baked synthetic ground truth. A large $d_{32}$ with few bubbles reads as coarse or
collapsing froth; a small $d_{32}$ with many bubbles reads as fine, stable froth (`frothState.ts`, a labelled
heuristic proxy, not a calibrated setpoint).

### How it is scored (synthetic only)

On the synthetic harness the method and the classical floor are scored with the same metrics. Instance mask AP
uses greedy IoU matching averaged over IoU thresholds 0.5 to 0.95:

$$ \mathrm{AP} = \frac{1}{|\mathcal{T}|}\sum_{t \in \mathcal{T}} \frac{\mathrm{TP}(t)}{\mathrm{TP}(t) + \mathrm{FP}(t) + \mathrm{FN}(t)}, \qquad \mathcal{T} = \{0.5, 0.55, \dots, 0.95\}. $$

Distribution fidelity is the Wasserstein-1 distance between the predicted and true diameter CDFs (0 =
perfect):

$$ W_1(P, Q) = \int_{-\infty}^{\infty} \bigl| F_P(x) - F_Q(x) \bigr|\, dx. $$

The synthetic geometry itself is a power (Laguerre) diagram, the standard dry-foam tessellation: each pixel is
assigned to the site of minimum power distance,

$$ \mathrm{cell}(p) = \arg\min_i \bigl(\,\lVert p - c_i \rVert^2 - r_i^2\,\bigr), $$

which is why exact per-bubble masks exist for it. That harness is documented in the Methodology page and the
`fslab.science.froth_gen` engine; here it matters only as the source of the ground truth this method is scored
against.

## Default parameters (from `autoMask.ts`)

| Parameter | Default | Role |
|---|---|---|
| `gridSize` | 32 | points per side (32x32 = 1024 prompts); the recall/latency dial |
| `pointBatch` | 64 | points decoded per forward pass; bounds memory, drives progress |
| `predIouThresh` | 0.86 | drop masks the decoder is unsure about |
| `stabilityThresh` | 0.90 | drop threshold-sensitive masks |
| `stabilityOffset` | 1.0 | the $\delta$ in the stability ratio |
| `minAreaPx` | 25 | drop specks |
| `maxAreaFrac` | 0.5 | drop masks covering more than half the frame |
| `nmsIou` | 0.7 | suppress duplicates above this IoU |
| `cropMarginFrac` | 0.02 | inset the grid from the border |

These are the standard SAM auto-generator values, not tuned to the synthetic set (which is part of why the
benchmark is honest). Grid density and the thresholds are exposed as live App controls, so the blur trade-off
(a denser grid or looser thresholds recover more small bubbles but cost latency and admit noise) is
user-visible.

## Applying it to other froth

- **Uploads are the real capability.** Point the segmenter at any froth image or extracted frame the user
  brings; nothing about the method assumes a shipped case. The OpenCV deglare and illumination-flatten
  front-end helps real glare before the grid is decoded, which is exactly where SAM already beats the floor.
- **Set a pixel/mm scale for physical sizes.** The BSD is in pixels by default; entering a px/mm scale
  converts $d_{\mathrm{eq}}$, $d_{32}$, and the percentiles to millimetres (`frothState.ts`). Without a scale,
  values stay in pixels and are labelled as such.
- **Tune for your froth regime.** Fine, dense froth wants a denser grid and a smaller `minAreaPx`; coarse
  froth tolerates a coarser grid and runs faster. Heavy glare wants the deglare front-end plus the stability
  filter doing its job; heavy motion blur or defocus is honestly the classical floor's territory, so compare
  both on your own frames.
- **Domain shift is real.** Froth appearance varies by ore, cell, camera, and lighting. A zero-shot foundation
  model transfers far better than a site-tuned supervised net, but it is not immune; validate on your own
  frames and read the synthetic AP as a controlled lower-bound signal, not a promise.
- **Data contract.** Input: an RGB frame (any size; the encoder resizes internally). Output: an $H\times W$
  `Int32` label map (0 = background), the per-instance masks with area/bbox/predIoU/stability, and the BSD
  summary. Outliers handled explicitly: zero bubbles yields an "empty / no froth" state (not a crash);
  degenerate masks are removed by the area and stability filters; overlaps are resolved deterministically by
  the paint order.

## Refs

Kirillov et al. 2023 (SAM, the automatic mask generator) [`kirillov2023`], Chen et al. 2023 (SlimSAM, the
default live model) [`chen2023slimsam`], Xiong et al. 2024 (EfficientSAM, the alternate lightweight student)
[`xiong2024efficientsam`], Ravi et al. 2024 (SAM 2, streaming/video, browser-WebGPU proven)
[`ravi2024sam2`]. The mask-AP protocol is COCO (Lin et al. 2014) [`lin2014coco`]; the BSD summary follows the
froth-vision review (Aldrich et al. 2010) [`aldrich2010`] and the Sauter mean [`sauter1928`].
