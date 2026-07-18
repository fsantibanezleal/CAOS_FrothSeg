# Guide, run the API (dormant for FrothSeg)

**FrothSeg has no backend API. The `app/` FastAPI backend stays dormant. There is nothing to run here.**

FrothSeg is a static SPA on GitHub Pages (ADR-0055), fully client-side:

- All inference runs in the browser: the SAM-class segmenter via onnxruntime-web + WebGPU (WASM-SIMD fallback).
  There is no server-side compute to gate behind an API.
- All heavy results are committed artifacts under `data/derived/` (the synthetic benchmark cases + the baked
  `sam_benchmark.json`), served as static files, not generated on request.
- The model weights are fetched at runtime from the Hugging Face Hub (CORS-ok, cached via the browser Cache API),
  not served by us, so no blob is committed and no backend proxies them.

The App's live capability is the browser SAM on real uploaded froth ([02_bring-your-own-data.md](02_bring-your-own-data.md)),
which needs no server. So the ADR-0002 backend triggers (server-side processing of uploaded data, auth-gated
private data, paid heavy compute) do not apply. If one ever does, activate `app/` then, per the template's
dormant backend scaffolding, and have it serve the same committed `data/derived` artifacts read-only. Until then,
ignore this lane.
