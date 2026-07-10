# Architecture

How the FrothSeg repo works: an offline pipeline that bakes the synthetic benchmark, a live client-side
segmenter that runs the SAM-class model in the browser, and the two enforced data contracts that join them.

- [01, overview](architecture/01_overview.md), the CAOS product-repo archetype for froth: the frozen base,
  the offline (precompute) and live (client-side) lanes, and the flow (generate the synthetic scene, benchmark
  the classical floor, export committed artifacts) versus what stays frozen.
- [02, determinism + trace](architecture/02_determinism-and-trace.md), a synthetic case is a pure function of
  (spec, seed); every artifact carries a sha256 in the manifest, so a re-run that changes a byte fails the
  CONTRACT-2 check.
- [03, the live / precompute gate](architecture/03_the-gate.md), what runs live in the browser (the SAM
  auto-mask generator, the classical floor, the BSD reduction) versus what is baked offline (the synthetic
  scenes plus their exact ground truth and the floor benchmark), each case with a committed artifact.
- [04, the live client-side lane](architecture/04_live-lane-pyodide.md), how in-browser compute is wired;
  FrothSeg's live segmenter is `@huggingface/transformers` on `onnxruntime-web` (WebGPU, WASM fallback), the
  same TypeScript running in Node for the offline verification.
- [05, the staged precompute pipeline](architecture/05_precompute-pipeline.md), the offline stages: generate
  (synthetic froth scene plus exact instance GT), benchmark (the scikit-image floor scored against that GT),
  export (PNG plus COCO-RLE plus BSD CSV plus manifest), orchestrated by `fslab.pipeline`.
- [06, model evaluation](architecture/06_model-evaluation.md), the shared metrics: instance mask AP over IoU
  0.5:0.05:0.95 and the BSD Wasserstein-1 distance, applied identically to SAM and to the classical floor on
  the synthetic ground truth.
- [07, deploy](architecture/07_deploy.md), a static SPA on GitHub Pages (ADR-0055): all inference is
  client-side, the model is fetched at runtime from the HF Hub, no server, the committed artifacts replay on
  first paint.
- [08, the two data contracts](architecture/08_data-contracts.md), CONTRACT 1 (froth-image ingestion plus the
  outlier policy, the door for bring-your-own froth) and CONTRACT 2 (the artifact contract: PNG, COCO-RLE
  masks, BSD CSV, manifest with sha256), both CI-checked.

Binding decision: [ADR-0057](../../conventions/architecture/0-archetype/ADR-0057-product-repo-archetype.md).
