# Model evaluation: how a segmenter is scored

Every method, the classical floor and the live SAM-class core alike, is scored with the SAME two metrics on the
synthetic froth where the per-bubble ground truth is exact. Scoring the foundation model with the identical
functions the floor is scored with is what makes the head-to-head fair, not an assertion.

**What this measures.** Segmentation quality against known truth on a controlled harness: instance mask AP and
BSD fidelity, per case.

**What this does NOT measure.** Real-plant accuracy. There is no public per-bubble froth ground truth, so the AP
here is on labelled synthetic froth only. It is reported as synthetic everywhere and must never be quoted as a
plant number.

## The two metrics

**Instance mask AP@[.5:.95].** Predicted instances are matched to ground-truth instances by greedy IoU: pairs are
sorted by IoU and taken highest-first, each prediction and each GT used at most once. At an IoU threshold $t$, a
matched pair above $t$ is a true positive; unmatched predictions are false positives and unmatched GT are false
negatives. AP is the mean of the true-positive fraction over the ten COCO-style thresholds:

$$\mathrm{IoU}(A,B) = \frac{|A \cap B|}{|A \cup B|} \qquad \mathrm{AP} = \frac{1}{|\mathcal{T}|}\sum_{t \in \mathcal{T}} \frac{\mathrm{TP}(t)}{\mathrm{TP}(t) + \mathrm{FP}(t) + \mathrm{FN}(t)}, \quad \mathcal{T} = \{0.5, 0.55, \dots, 0.95\}$$

This is the COCO instance-mask protocol (Lin et al. 2014). `mask_ap` in `science/segment.py` also returns AP50
and AP75.

**BSD Wasserstein-1.** Segmentation is a means to the bubble-size distribution, so distribution fidelity is
scored directly: the Wasserstein-1 distance between the predicted and true diameter sets (0 is perfect),
computed as the integrated absolute difference of their CDFs:

$$W_1(P, Q) = \int_{-\infty}^{\infty} \bigl| F_P(x) - F_Q(x) \bigr|\, dx$$

Both sides use the same equivalent-diameter reduction $d_{\mathrm{eq}} = 2\sqrt{A/\pi}$ and the same Sauter mean
$d_{32} = \sum_i d_i^{\,3} / \sum_i d_i^{\,2}$, so a live number on an upload is directly comparable to a baked
one.

## The harness

The classical floor is scored offline inside the benchmark stage (`stages/benchmark.py` calling
`science/segment.mask_ap` and `bsd_wasserstein`) and committed to each case's `benchmark.json`.

The live SAM core is scored with the EXACT same functions so the comparison is apples to apples. The one portable
module `frontend/src/sam/{autoMask,morphometry,score}.ts` runs both in the browser (onnxruntime-web, WebGPU with
WASM fallback) and in Node (onnxruntime-node). `frontend/scripts/verify_sam.ts` runs the segmenter in Node and
dumps the instance labels to `verification/sam/<case>.json`; `scripts/score_sam.py` and
`scripts/bake_sam_benchmark.py` regenerate the exact GT and score those dumps with `fslab.science.segment.mask_ap`
and `bsd_wasserstein`, writing the committed `data/derived/sam_benchmark.json` (schema
`frothseg.sam_benchmark/v1`). In the App itself, `frontend/src/sam/score.ts` mirrors the Python `mask_ap`, so on a
synthetic sample the browser shows a live SAM-vs-GT agreement next to the baked benchmark. The SAM result is a
RECORDED, model-dependent experiment result, not a sha-checked CONTRACT-2 artifact.

## The verified result

Full offline sweep, SlimSAM-77-uniform (`Xenova/slimsam-77-uniform`) via `@huggingface/transformers`, a 32x32
prompt grid (1024 points), onnxruntime-node CPU, scored against the exact synthetic GT with the same `mask_ap`
the classical floor uses. Floor AP is the best classical method per case (`watershed_dt` throughout). Transcribed
verbatim from `data/derived/sam_benchmark.json`.

| case | category | SAM AP | SAM AP50 | floor AP | SAM n | GT n | SAM d32 | GT d32 | SAM BSD-W |
|---|---|---|---|---|---|---|---|---|---|
| mono-clean | control: monodisperse | **0.741** | 0.974 | 0.329 | 113 | 114 | 27.04 | 28.41 | 1.39 |
| coarse-froth | coarse froth | **0.651** | 0.861 | 0.394 | 79 | 68 | 37.8 | 39.51 | 2.948 |
| poly-normal | polydisperse (nominal) | **0.457** | 0.747 | 0.401 | 212 | 197 | 22.29 | 22.96 | 0.501 |
| bursting | transient: bursting | **0.449** | 0.756 | 0.361 | 147 | 148 | 26.68 | 26.0 | 0.578 |
| high-load | stress: high load/dark | **0.420** | 0.750 | 0.415 | 245 | 231 | 20.76 | 21.04 | 0.474 |
| edge-framing | stress: framing/glare | **0.412** | 0.777 | 0.309 | 261 | 274 | 19.16 | 19.27 | 0.318 |
| glare-storm | stress: glare | **0.407** | 0.717 | 0.081 | 179 | 197 | 23.9 | 21.96 | 0.500 |
| fine-froth | fine froth | **0.335** | 0.692 | 0.266 | 446 | 593 | 12.77 | 12.92 | 0.377 |
| low-light-noise | stress: sensor noise | **0.302** | 0.633 | 0.263 | 142 | 196 | 21.97 | 22.55 | 0.673 |
| watery | stress: watery/thin | **0.172** | 0.287 | 0.155 | 128 | 231 | 21.92 | 21.25 | 1.686 |
| defocus | stress: defocus | 0.016 | 0.056 | **0.066** | 37 | 170 | 17.73 | 28.46 | 5.428 |
| motion-fast | stress: motion blur | 0.016 | 0.052 | **0.104** | 25 | 197 | 16.37 | 23.95 | 3.622 |
| empty-control | control: empty | n/a | n/a | n/a | 0 | 0 | n/a | n/a | n/a |

**Summary (13 cases): mean SAM AP 0.365 vs mean floor AP 0.262, advantage +0.103, SAM wins 10 of 13.** The means
are over the twelve cases with a defined AP; the empty control has no bubbles and both methods correctly return
zero.

Reading it honestly:

- SAM wins decisively where the classical floor is meant to be strong (the clean monodisperse control, 0.741 vs
  0.329) and where it is meant to be weak (glare, 0.407 vs 0.081, the realistic froth-camera failure mode where
  highlight and distance-transform watershed collapse). It also leads on coarse froth (0.651 vs 0.394).
- The classical floor stays complementary on heavy motion blur (0.104 vs 0.016) and defocus (0.066 vs 0.016).
  Blur removes the promptable structure, so SAM's confident-mask count drops sharply (25 and 37 masks against a
  GT of 197 and 170), and the large BSD-W there (3.6, 5.4) reflects the missed bubbles. The App exposes the
  predicted-IoU, stability, and grid controls so this tradeoff is user-visible, and offers both methods.

## Honesty

- Synthetic mask AP is not real-plant AP. It is a controlled harness with exact GT, labelled synthetic
  everywhere.
- The generator's self-fulfilling risk is mitigated: the glare and blur cases are negative controls where methods
  are supposed to fail, and SAM is not tuned to the synthetic set (the standard SAM automatic-mask-generator
  defaults are used). The specular highlights are deliberately jittered and sometimes dropped so highlight-seeded
  watershed cannot win artificially.
- The real capability is live SAM segmentation of REAL (uploaded) froth; the OpenCV deglare and
  illumination-flatten front-end helps real glare, and motion or defocus are honestly the floor's territory.

Refs: Kirillov et al. 2023 (SAM, doi:10.1109/ICCV51070.2023.00371), Chen et al. 2023 (SlimSAM), Meyer 1994
(doi:10.1016/0165-1684(94)90060-4), Achanta et al. 2012 (SLIC, doi:10.1109/TPAMI.2012.120), Lin et al. 2014
(COCO, doi:10.1007/978-3-319-10602-1_48), Aldrich et al. 2010 (doi:10.1016/j.minpro.2010.04.005).
