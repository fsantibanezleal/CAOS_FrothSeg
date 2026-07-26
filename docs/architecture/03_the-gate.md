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

- C1, C3, and C4 TypeScript twins for exploratory single-frame inference;
- legacy SlimSAM via transformers.js with WebGPU and WASM fallback, giving
  exactly four upload-only interactive methods;
- image validation, lightweight deglare, morphometry, BSD reduction, and plots.

The three exposed TypeScript methods passed the 16-condition browser and
offline parity checks. SlimSAM is bounded interaction, not the strongest method
and not the offline benchmark. C2, C5, C6, C7, and all learned or foundation
methods remain authoritative offline implementations.

## Replay

The web copies `data/derived` during build and reads those artifacts without
recomputing them. The showcase manifest covers 15 methods by 13 canonical cases,
or 195 precomputed method-case pairs. The workbench exposes those results,
held-out metrics, provenance, and honest negative findings even when no
accelerator or model hub is available.

`core/gate.py` retains the archetype's measured Pyodide classification for
individual artifacts. FrothSeg also applies these product-level rules to
research workloads outside Pyodide's scope.
