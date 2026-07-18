# The live-vs-precompute gate

`data-pipeline/fslab/core/gate.py :: classify_lane()`. The archetype's gate asks whether a case can run **live in
Pyodide**: it does iff, by measurement and never by hand-wave, it is pure-Python, its wheels are a subset of the
Pyodide-safe set (`LIVE_WHEELS = {numpy}`), its runtime is within the interaction budget
(`run_ms <= RUN_MS_GATE`, 1500 ms), and its artifact is small (`trace_bytes <= TRACE_BYTES_GATE`, 256 KiB).
Otherwise the case is **precompute** and the SPA replays the committed artifact. Either way a committed artifact
always exists, so the site paints instantly on first load (ADR-0054). The verdict plus the measured numbers go
into each manifest (`gate` field), and CI fails if `manifest.lane` disagrees with the gate, so a heavy case can
never be mislabelled live.

## For FrothSeg, every synthetic case is precompute

`stages/export.py` classifies the synthetic benchmark with `pure_python=False` and
`wheels = {numpy, scipy, scikit-image, opencv-python}`. Those wheels are not Pyodide-safe, and the frames are
full images, so the gate returns `precompute` for every case. That is the honest reason the benchmark is baked
offline in `.venv-pipeline`: the classical floor (`science/segment.py`) is real scikit-image / scipy / OpenCV
(marker-controlled watershed, highlight-seeded watershed, SLIC + merge; Meyer 1994, Achanta et al. 2012), not a
hand-rolled numpy substitute, and none of that runs in the browser Python sandbox. The gate's `run_ms` is used
for the decision but deliberately not stored (it would dirty a manifest that must be a pure function of
`(spec, seed)`); the committed manifest keeps the verdict and the fixed budgets instead.

## FrothSeg has a second, different "live"

The gate above is the archetype's Pyodide question. FrothSeg's real live capability is not a Pyodide case at all:
it is the **JavaScript SAM-class segmenter** in `frontend/src/sam/` (`@huggingface/transformers` on
onnxruntime-web + WebGPU, WASM fallback), which segments the shipped frame or a user upload in the browser with
no Python involved. It is outside the Pyodide gate by construction, so its cost is measured **live, in JS**, and
its accuracy is recorded once in `data/derived/sam_benchmark.json` (see
[determinism + the committed artifacts](02_determinism-and-trace.md)), not scored by `classify_lane`. Details:
[the live lane](04_live-lane-pyodide.md).

The archetype's Pyodide lane still exists in a minimal form: `fslab/live.py :: bsd_from_labels()` is numpy-only,
Pyodide-safe, and reduces any instance-label map (from SAM or from a classical method) to the BSD with the same
maths the offline ground truth uses ($d_{eq} = 2\sqrt{A/\pi}$, $d_{32} = \sum d_i^3 / \sum d_i^2$), so the live
and baked numbers are directly comparable.

## The honest summary

- The **classical floor** cannot run in Pyodide (skimage/scipy/opencv wheels), so it is precompute. Baked, sha-
  pinned, reproducible.
- The **SAM foundation model** runs live in JS/WebGPU, which the Pyodide gate does not describe. Measured live;
  its offline verification is a recorded (not sha-pinned) result because a SAM run is model- and device-
  dependent.
- The **BSD reduction** is the one genuinely Pyodide-safe piece, and it is shared byte-for-byte between the live
  and offline paths.
