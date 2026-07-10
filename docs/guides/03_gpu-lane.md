# Guide, the GPU lane (DORMANT for FrothSeg)

**FrothSeg has no GPU precompute lane. There is nothing to run here.**

The template keeps a GPU lane for products whose offline engine genuinely needs CUDA (large DEM, big Monte-Carlo,
heavy model training). FrothSeg does not:

- The offline pipeline is a pure-CPU synthetic generator + classical floor (scipy, scikit-image, OpenCV) that
  runs in seconds per case. No CUDA is involved. See [01_precompute-pipeline.md](01_precompute-pipeline.md).
- The only heavy compute is the SAM-class segmenter, and it runs **in the browser on the user's GPU** via WebGPU
  (onnxruntime-web, WASM-SIMD fallback), not on a server or a precompute box. The offline SAM verification even
  runs on CPU (onnxruntime-node). See [03_verify-sam.md](03_verify-sam.md).

So `requirements-gpu.txt` stays a dormant, commented placeholder. If a future FrothSeg method ever needs an
offline CUDA step (for example distilling a custom student), activate this lane then and document the engine
under `docs/frameworks/<tool>/`. Until then, ignore it.
