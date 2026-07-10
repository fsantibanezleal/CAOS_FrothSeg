# Frameworks

One card per research-chosen engine/library, **the deep research, made binding**. Every engine FrothSeg uses
gets a card here AND an exact pin in the matching `requirements-*.txt` (Python offline stack) or
`frontend/package.json` (the live segmenter). No hand-rolled toy substitute for a SOTA engine the research
prescribed: the classical floor is scikit-image, the foam geometry is scipy, the masks are pycocotools, the
segmenter is a real SAM-family model via transformers.js.

- [01, `@huggingface/transformers` (+ onnxruntime-web)](frameworks/01_transformers-js/transformers-js.md), the browser runtime that carries the live SAM model (WebGPU, WASM fallback); pinned in `frontend/package.json`, and the same runtime in Node for the offline verification.
- [02, the SAM automatic mask generator](frameworks/02_sam-method/sam-method.md), the product method built on that runtime: encode once, dense point grid, best-of-3 by predicted IoU, stability/area filter, greedy IoU NMS, BSD reduction. Zero-shot, SlimSAM-77 default, MobileSAM alternate.
- [03, scikit-image](frameworks/03_scikit-image/scikit-image.md), the classical floor and morphometry: marker-controlled watershed (distance-transform and highlight-seeded), SLIC superpixels, and `regionprops` for per-bubble equivalent diameter, eccentricity, solidity.
- [04, scipy](frameworks/04_scipy/scipy.md), `scipy.ndimage` for the exact Euclidean distance transform, Gaussian defocus and connected components in the synthetic generator, and `scipy.stats.wasserstein_distance` for the BSD fidelity metric.
- [05, OpenCV](frameworks/05_opencv/opencv.md), the real-froth front-end and stressors: specular deglare and inpaint, illumination flatten, the motion-blur kernel, and optical-flow froth velocity.
- [06, pycocotools](frameworks/06_pycocotools/pycocotools.md), COCO-RLE encode/decode for the exact instance masks; the committed `masks.json` uses the standard compact format every eval toolkit reads, and the CONTRACT-2 round-trip check rebuilds the label map from it.
- [00, card TEMPLATE](frameworks/00_TEMPLATE.md), copy per engine to `frameworks/<NN>_<tool>/<tool>.md`.

*(The live segmenter is a frontend npm engine, so its binding pin lives in `frontend/package.json`. The Python
offline stack, scikit-image / scipy / OpenCV / onnxruntime / pycocotools, is pinned in the
`data-pipeline/requirements-*.txt` files.)*
