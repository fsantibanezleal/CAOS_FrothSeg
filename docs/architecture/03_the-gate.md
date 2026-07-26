# Compute gate: live, offline, and replay

The gate protects scientific validity. A workload is live only when the browser
can execute the same method within bounded download, memory, runtime, and
dependency constraints. Otherwise it runs offline and the web replays compact
evidence.

## Offline-only workloads

- dataset generation and materialization;
- C1-C7 authoritative Python benchmarks;
- CUDA training and calibration;
- official Cellpose-SAM, StarDist, Ultralytics, and SAM2 research runtimes;
- untouched-test and canonical evaluation;
- ONNX export, temporal sweeps, and release inventory.

These require Python CV wheels, large model assets, filesystem access, or GPU
capacity that a static browser cannot guarantee.

## Valid live workloads

- seven TypeScript classical twins for exploratory single-frame inference;
- legacy SlimSAM via transformers.js with WebGPU and WASM fallback;
- image validation, lightweight deglare, morphometry, BSD reduction, and plots.

The TypeScript methods share semantics with the authoritative Python methods but
are not claimed bit-identical. SlimSAM is bounded interaction, not the strongest
method and not the offline benchmark.

## Replay

The web copies `data/derived` during build and reads those artifacts without
recomputing them. It exposes selected cases, the full method matrix, held-out
and canonical results, provenance, and honest negative findings even when no
accelerator or model hub is available.

`core/gate.py` retains the archetype's measured Pyodide classification for
individual artifacts. FrothSeg also applies these product-level rules to
research workloads outside Pyodide's scope.
