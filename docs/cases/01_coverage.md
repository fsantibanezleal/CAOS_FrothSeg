# Coverage matrix: the 13 synthetic froth cases

This is the full coverage matrix for FrothSeg's benchmark harness: every case, its category, what a froth-vision
expert should see in it, the stressor that defines it, and the VERIFIED live-SAM AP against the classical floor
AP, scored on the exact synthetic ground truth.

## What this is, and what it is NOT

- It **is** a controlled benchmark: 13 synthetic Laguerre-foam frames whose per-bubble instance masks are known
  EXACTLY by construction (they are the render's own labels), so a segmenter can be scored with real
  instance-mask AP and BSD distance against known truth. Public per-bubble froth masks are legally request-only
  (`research-tools-and-data-2026-07-09`), so a synthetic set is the only source of exact GT.
- It **is NOT** real-plant accuracy. A synthetic AP measures a method against a known, controllable target; it
  does not measure how the method does on a real concentrator's froth camera. Never quote a number on this page
  as a plant AP.
- The product's real capability is **live SAM-class segmentation of REAL (uploaded) froth**, which has no ground
  truth, so it reports the BSD and froth-state read-out, not an AP. This harness is how you would validate a NEW
  segmenter (or a re-tuned one) before trusting it on real froth; see "Applying this to other data" below.

## The matrix

Frames are 256x256 grey. Sizes (`d32`) are in pixels on that frame; the App rescales to mm if a px/mm scale is
entered. "What an expert should see" is the case's `expected_band` from `froth_cases.py`. SAM AP and floor AP are
mean instance-mask AP over IoU 0.5:0.05:0.95; higher is better. Winner marks whichever method scores the higher
AP (`n/a` where there is no GT to score).

| case | category | what a froth-vision expert should see | stressor (generator params) | SAM AP | floor AP | winner |
|---|---|---|---|---|---|---|
| `mono-clean` | control: monodisperse | near-single-size bubbles, clean specular highlights; d50 ~ d32 | tight spread `sigma_ln=0.12`, `d32=30px`; positive control | **0.741** | 0.329 | SAM |
| `coarse-froth` | coarse froth | few large bubbles (collapsing/coalescing froth); low count, large d32 | `d32=44px`, `sigma_ln=0.4` | **0.651** | 0.394 | SAM |
| `poly-normal` | polydisperse (nominal) | wide bubble-size range, dark Plateau borders; the nominal operating case | `d32=26px`, `sigma_ln=0.5` | **0.457** | 0.401 | SAM |
| `bursting` | transient: bursting | bubbles bursting: many missing highlights, irregular cells | `highlight_jitter=0.5`, `sigma_ln=0.6` | **0.449** | 0.361 | SAM |
| `high-load` | stress: high load/dark | dense dark froth (high pull); low contrast between bubble and border | `load=0.9` (dark base) | **0.420** | 0.415 | SAM |
| `edge-framing` | stress: framing/glare | off-centre framing with a glare band near the edge | `glare=0.3`, `d32=22px` | **0.412** | 0.309 | SAM |
| `glare-storm` | stress: glare | a saturated glare lobe; highlight-seeded methods must fail here | `glare=0.8`, `highlight_jitter=0.6`; negative control | **0.407** | 0.081 | SAM |
| `fine-froth` | fine froth | many small bubbles (high recovery regime); high count, small d32 | `d32=15px`, `sigma_ln=0.45` | **0.335** | 0.266 | SAM |
| `low-light-noise` | stress: sensor noise | under-lit, noisy sensor; grain competes with true borders | `noise=0.09`, `load=0.7` | **0.302** | 0.263 | SAM |
| `watery` | stress: watery/thin | thin watery froth, weak borders, low load; borders hard to resolve | `watery=0.9`, `load=0.35` | **0.172** | 0.155 | SAM |
| `defocus` | stress: defocus | out-of-focus frame; soft borders, merged bubbles | Gaussian `defocus=2.4` | 0.016 | **0.066** | floor |
| `motion-fast` | stress: motion blur | horizontal motion blur from fast froth travel; smeared borders | motion kernel `motion_blur=11` | 0.016 | **0.104** | floor |
| `empty-control` | control: empty | no froth (launder/empty cell); segmenter must return zero bubbles | `empty=True`; negative control | n/a | n/a | n/a |

**Summary (over the 12 scored cases; the empty control has no GT to score):** mean SAM AP **0.365** vs mean floor
AP **0.262**, delta **+0.103**, SAM wins **10 / 13**. Source: the committed artifact
`data/derived/sam_benchmark.json` (offline verification, onnxruntime-node CPU, SlimSAM-77-uniform,
32x32 = 1024 prompt grid, scored with the same `fslab.science.segment.mask_ap` the classical floor uses).

### Per-case detail (counts, sizes, distribution distance)

`SAM n` / `GT n` are instance counts; `d32` the Sauter-mean bubble diameter (px); `BSD-W` the Wasserstein-1
distance between the predicted and GT bubble-diameter distributions (0 = identical). The floor method is
`watershed_dt` (distance-transform marker-controlled watershed) on every case.

| case | SAM AP50 | SAM n | GT n | SAM d32 | GT d32 | BSD-W |
|---|---|---|---|---|---|---|
| `mono-clean` | 0.974 | 113 | 114 | 27.04 | 28.41 | 1.39 |
| `coarse-froth` | 0.861 | 79 | 68 | 37.80 | 39.51 | 2.95 |
| `poly-normal` | 0.747 | 212 | 197 | 22.29 | 22.96 | 0.50 |
| `bursting` | 0.756 | 147 | 148 | 26.68 | 26.00 | 0.58 |
| `high-load` | 0.750 | 245 | 231 | 20.76 | 21.04 | 0.47 |
| `edge-framing` | 0.777 | 261 | 274 | 19.16 | 19.27 | 0.32 |
| `glare-storm` | 0.717 | 179 | 197 | 23.90 | 21.96 | 0.50 |
| `fine-froth` | 0.692 | 446 | 593 | 12.77 | 12.92 | 0.38 |
| `low-light-noise` | 0.633 | 142 | 196 | 21.97 | 22.55 | 0.67 |
| `watery` | 0.287 | 128 | 231 | 21.92 | 21.25 | 1.69 |
| `defocus` | 0.056 | 37 | 170 | 17.73 | 28.46 | 5.43 |
| `motion-fast` | 0.052 | 25 | 197 | 16.37 | 23.95 | 3.62 |
| `empty-control` | n/a | 0 | 0 | n/a | n/a | n/a |

## Reading the result by bucket

- **Controls.** `mono-clean` is the positive control: near-monodisperse bubbles with clean highlights, and SAM
  scores its highest AP (0.741, AP50 0.974) with counts almost exact (113 vs 114). `empty-control` is the
  negative control: no froth, and SAM returns **0** instances (as it must); AP is undefined because there is no
  GT, and the pipeline handles the null rather than crashing.
- **Size regimes.** SAM leads on `coarse-froth` (0.651), `poly-normal` (0.457) and `fine-froth` (0.335). On the
  fine case it undercounts (446 of 593 GT bubbles), merging some small touching bubbles, yet its `d32` still
  matches GT closely (12.77 vs 12.92): size is nearly unbiased even when the count is short, which is what the
  downstream soft-sensor cares about.
- **Stress.** The headline is glare. `glare-storm` is the realistic froth-camera failure mode where the
  distance-transform floor collapses to AP 0.081, while zero-shot SAM holds at 0.407, a 5x gap. SAM also leads
  on `high-load`, `edge-framing`, `low-light-noise` and `watery`. The honest exceptions are heavy blur:
  `motion-fast` and `defocus` remove the promptable structure, so SAM's confident-mask count collapses (25 and
  37 masks against ~170-200 GT), and the classical floor is complementary there. This is why the App ships both
  SAM and the floor, and why blur is left as the floor's territory rather than hidden.
- **Transient.** `bursting` (missing highlights, irregular cells) is handled well (0.449), because SAM does not
  rely on a highlight-per-bubble cue the way highlight-seeded watershed does.

The measured story is therefore honest and specific: a robust zero-shot foundation model that beats the tuned
classical floor on average (0.365 vs 0.262) and especially under glare, with the floor kept as a complementary,
cited baseline on the blur cases where SAM's mask count drops.

Refs for the live SAM core and the floor: Kirillov et al. 2023 (Segment Anything, [doi:10.1109/ICCV51070.2023.00371](https://doi.org/10.1109/ICCV51070.2023.00371));
Chen et al. 2023 (SlimSAM, arXiv 2312.05284); Meyer 1994 (watershed, [doi:10.1016/0165-1684(94](https://doi.org/10.1016/0165-1684(94))90060-4);
Achanta et al. 2012 (SLIC, [doi:10.1109/TPAMI.2012.120](https://doi.org/10.1109/TPAMI.2012.120)).

## Theory: how a case is built and scored

**Geometry (the exact GT).** Each frame is a power (Laguerre) diagram, the standard dry-foam tessellation
(Plateau's laws): bubble centres $c_i$ are packed by random sequential adsorption with log-normal radii $r_i$
chosen so the target Sauter mean $d_{32}$ is met, and every pixel $p$ is assigned to the site of minimum power
distance,

$$\mathrm{cell}(p) = \arg\min_i \bigl(\, \lVert p - c_i \rVert^2 - r_i^2 \,\bigr).$$

The cell labels ARE the ground-truth instance masks, so there is no annotation error. Appearance adds
distance-transform border darkening, per-bubble specular highlights (deliberately jittered and sometimes dropped,
so a highlight-seeded method cannot win artificially), and the per-case stressor.

**Bubble size.** From each instance mask of area $A$ the equivalent diameter is

$$d_{\mathrm{eq}} = 2\sqrt{A/\pi},$$

and the distribution is summarized by the surface-weighted Sauter mean

$$d_{32} = \frac{\sum_i d_i^{\,3}}{\sum_i d_i^{\,2}},$$

the standard BSD summary in flotation (Aldrich et al. 2010, [doi:10.1016/j.minpro.2010.04.005](https://doi.org/10.1016/j.minpro.2010.04.005)). The same reduction
runs live in the browser and offline in Python, so the App numbers match the baked GT.

**Scoring.** A segmenter's masks are matched to GT by greedy IoU, and the case AP is the mean over IoU thresholds

$$\mathrm{AP} = \frac{1}{|\mathcal{T}|}\sum_{t \in \mathcal{T}} \frac{\mathrm{TP}(t)}{\mathrm{TP}(t) + \mathrm{FP}(t) + \mathrm{FN}(t)}, \qquad \mathcal{T} = \{0.5, 0.55, \dots, 0.95\},$$

the COCO-style summary (Lin et al. 2014, [doi:10.1007/978-3-319-10602-1_48](https://doi.org/10.1007/978-3-319-10602-1_48)). Distribution fidelity is the
Wasserstein-1 distance between the predicted and GT diameter CDFs,

$$W_1(P, Q) = \int_{-\infty}^{\infty} \bigl| F_P(x) - F_Q(x) \bigr| \, dx,$$

which is 0 when the two BSDs are identical. SAM's confident masks are additionally filtered by the SAM stability
score $\mathrm{stability} = |\{\ell(p) > +\delta\}| / |\{\ell(p) > -\delta\}|$ before scoring, which is why the
blur cases (soft logits, unstable masks) yield so few kept masks.

## Applying this to other data

- **Score a new or re-tuned segmenter.** Point any instance segmenter at these frames, dump its label maps, and
  score with `fslab.science.segment.mask_ap` and `bsd_wasserstein` (the exact functions used here). Because the
  GT is exact, the comparison against SAM and the floor is apples-to-apples. This is the intended way to decide
  whether a candidate method is trustworthy before it ever touches real froth.
- **Extend the coverage.** A new coverage axis is one new `FrothSpec` in `science/froth_gen.py` plus a `_META`
  entry (category + expected band) in `cases/froth_cases.py`; it flows into `registry.list_categories()` and the
  Experiments/Benchmark summaries automatically. Keep a fixed seed so it stays reproducible.
- **The real-froth path is different.** For a real (uploaded) froth frame there is no GT, so there is no AP. The
  App runs the SAM core live, reports the BSD (`d10/d50/d90/d32`, % fines) and the froth-state read-out
  (a heuristic proxy, Aldrich et al. 2010), and the OpenCV deglare / illumination front-end helps real glare.
  Motion and defocus remain the floor's territory, so the App offers both engines and exposes the SAM thresholds
  (predicted-IoU, stability, grid density) as live controls so the blur tradeoff is user-visible.

## Data contract and outliers

- **Format.** Each case emits, in the same format a real loader consumes: a grey PNG frame (256x256), COCO-RLE
  instance masks (Lin et al. 2014, [doi:10.1007/978-3-319-10602-1_48](https://doi.org/10.1007/978-3-319-10602-1_48)), and a BSD ground-truth CSV. See
  `data/derived/synth/<case>/` and the per-case manifest under `data/derived/manifests/`.
- **Determinism.** A case is a pure function of `(spec, seed)`; every case has a fixed seed (101-113), so the
  frames, masks and scores regenerate bit-for-bit. The benchmark artifact records the model id, prompt grid and
  provenance.
- **Empty / zero-instance outlier.** `empty-control` has 0 GT instances, so AP and BSD-W are undefined
  (reported as null, not 0) and the segmenter is required to return 0 masks. Downstream code must treat a null
  AP and an empty BSD as valid, not as a failure.
- **Blur outlier region.** On `motion-fast` and `defocus` the confident-mask count collapses (25 and 37 masks),
  and the reported `d32` skews small because only the sharpest bubbles survive filtering. This is expected
  behavior for a promptable model on blurred structure, not a defect; it is why those two cases are the floor's
  and why blur is documented as a known limit rather than smoothed over.

## References

- Kirillov, A., et al. (2023). Segment Anything. ICCV 2023. [doi:10.1109/ICCV51070.2023.00371.](https://doi.org/10.1109/ICCV51070.2023.00371.)
- Chen, Z., Fang, G., Ma, X., Wang, X. (2023). SlimSAM: 0.1% Data Makes Segment Anything Slim. [arXiv:2312.05284](https://arxiv.org/abs/2312.05284).
- Meyer, F. (1994). Topographic distance and watershed lines. Signal Processing 38(1). [doi:10.1016/0165-1684(94](https://doi.org/10.1016/0165-1684(94))90060-4.
- Achanta, R., et al. (2012). SLIC superpixels. IEEE TPAMI 34(11). [doi:10.1109/TPAMI.2012.120.](https://doi.org/10.1109/TPAMI.2012.120.)
- Lin, T.-Y., et al. (2014). Microsoft COCO: Common Objects in Context. ECCV 2014. [doi:10.1007/978-3-319-10602-1_48.](https://doi.org/10.1007/978-3-319-10602-1_48.)
- Aldrich, C., et al. (2010). Online monitoring and control of froth flotation systems with machine vision: A review.
  International Journal of Mineral Processing 96(1-4). [doi:10.1016/j.minpro.2010.04.005](https://doi.org/10.1016/j.minpro.2010.04.005) (BSD + froth class as soft sensors; the Sauter mean d32).
- Weaire, D., Hutzler, S. (1999). The Physics of Foams. Oxford University Press. ISBN 978-0198505518
  (Plateau laws + the power/Laguerre diagram as the dry-foam model).
- Aurenhammer, F. (1987). Power diagrams: properties, algorithms and applications. SIAM J. Computing 16(1). [doi:10.1137/0216006.](https://doi.org/10.1137/0216006.)
