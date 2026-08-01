# Bounded browser evaluation

The companion website offers real interaction without misrepresenting it as the
complete product.

## Upload-only method set

`frontend/src/classical` implements C1-C7 in TypeScript: Otsu connected
components, immersion watershed, marker watershed, distance-transform
watershed, H-minima watershed, SLIC, and the lamella-valley constrained watershed. Only C1
Otsu, C3 marker watershed, and C4 distance-transform watershed passed the
current 16-condition parity report, so only those three are exposed for an
uploaded image. SlimSAM is the fourth upload-only interactive method.

C2, C5, C6, and C7 remain available through precomputed canonical replay and
offline job export. The complete method comparison always uses offline evidence.

## Legacy SlimSAM

`frontend/src/sam` contains a lightweight automatic-mask generator using
transformers.js and onnxruntime-web. It encodes once, decodes a point grid,
filters by predicted IoU and stability, removes duplicates, paints a disjoint
label map, and computes morphometry.

WebGPU is selected only after a real adapter probe. WASM is the slower fallback.
Model download or inference failure does not block precomputed results. SlimSAM
is labelled legacy because official Cellpose-SAM leads the held-out comparison
and cannot be reduced to this browser runtime without a separately validated
export.

## Upload contract

Uploaded frames pass the same size, shape, dynamic-range, glare, contrast, and
exposure rules as the Python ingestion gate. Files remain client-side in the
static deployment. Upload outputs are exploratory because no truth labels are
available.

## Ten linked views

Every selected canonical method-case pair populates the same ten-view
workbench: segmentation, boundary/error, size distribution, morphometry,
confidence/calibration, froth state, temporal, provenance, export, and method
comparison. The precomputed selector covers all 15 methods and 13 canonical
cases. An upload can populate only the views supported by its four exploratory
methods and has no ground-truth score.

## Excluded from live compute

The browser never trains, calibrates, runs the complete test, launches official
research environments, or recomputes the release benchmark. Those are offline
repository pipelines with persisted evidence.
