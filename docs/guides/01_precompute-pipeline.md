# Guide, run the precompute pipeline (the synthetic froth benchmark harness)

## What this is, and what it is not

This offline pipeline bakes the **synthetic froth benchmark harness**: for each case it renders a physically
flavoured froth image whose per-bubble instance masks are known exactly (by construction), scores the classical
floor against that exact ground truth, and commits the artifacts + a sha256 manifest.

- It **is** the only source of per-bubble ground truth in this product, so it is the harness that measures mask
  quality with real metrics (mask AP, BSD Wasserstein).
- It is **not** the product's live method. The product's live segmenter is a SAM-class foundation model that runs
  in the browser (`frontend/src/sam/`, onnxruntime-web + WebGPU); it is measured by a separate harness, see
  [03_verify-sam.md](03_verify-sam.md).
- It is **not** real-plant data. Public per-bubble froth masks are legally request-only
  (`research-tools-and-data-2026-07-09`), so every case here is labelled synthetic and its AP is never reported as
  real-plant accuracy. The real-froth capability is the upload lane, see [02_bring-your-own-data.md](02_bring-your-own-data.md).

The engine lives under `data-pipeline/fslab/`: geometry + appearance in `science/froth_gen.py`, the classical
floor + scoring in `science/segment.py`, the artifact encoders in `io/froth_io.py`, and the staged orchestrator
in `pipeline.py` (generate, benchmark, export).

## One-time setup (the offline lane venv)

The offline lane uses an isolated `.venv-pipeline` with the proper CV stack (scipy, scikit-image, OpenCV,
pycocotools, Pillow). Create it once:

```bash
./scripts/setup.sh        # bash (macOS/Linux/Git-Bash)
./scripts/setup.ps1       # Windows PowerShell
```

`setup` builds `.venv-pipeline`, installs `data-pipeline/requirements.txt` + `requirements-dev.txt`, and does an
editable `pip install -e .` so the `fslab` package is importable from the repo root. It never touches a global
Python (per the isolated-envs rule).

## Run it

The wrapper script is the recommended, cross-platform entry point (it locates the venv Python and passes your
arguments straight through to the module):

```bash
./scripts/precompute.ps1              # all 13 cases (Windows)
./scripts/precompute.sh               # all 13 cases (bash)
./scripts/precompute.ps1 poly-normal  # one case
./scripts/precompute.ps1 --check      # re-verify the committed artifact sha256s (CONTRACT 2), then exit
```

The raw module form is equivalent (the wrapper just calls this):

```bash
PYTHONPATH=data-pipeline .venv-pipeline/Scripts/python.exe -m fslab.pipeline all          # Windows
PYTHONPATH=data-pipeline .venv-pipeline/bin/python        -m fslab.pipeline poly-normal   # bash
```

The positional argument is a case id or `all` (default); `--check` re-verifies the committed sha256s and exits.
There is no run-level seed flag: each synthetic frame is a pure function of the case's fixed `FrothSpec.seed`
(101 to 113), so it is byte-identical on every run and the manifest records that generation seed. After the
editable install, `PYTHONPATH=data-pipeline` is redundant but harmless; keep it if you run the module without
having installed the package.

## The 13 cases

Every case is one point on a coverage axis (`data-pipeline/fslab/cases/froth_cases.py`), with a pinned per-case
seed so it is reproducible in isolation:

| id | category | what a froth-vision expert should see |
|---|---|---|
| `mono-clean` | control: monodisperse | near-single-size bubbles, clean highlights (positive control) |
| `poly-normal` | polydisperse (nominal) | wide size range, dark Plateau borders; the nominal case |
| `fine-froth` | fine froth | many small bubbles, high count, small d32 |
| `coarse-froth` | coarse froth | few large bubbles, low count, large d32 |
| `glare-storm` | stress: glare (negative control) | a saturated glare lobe; highlight methods must fail |
| `watery` | stress: watery/thin | thin froth, weak borders, low load |
| `motion-fast` | stress: motion blur | horizontal smear from fast froth travel |
| `defocus` | stress: defocus | out-of-focus, soft borders, merged bubbles |
| `high-load` | stress: high load/dark | dense dark froth, low bubble-to-border contrast |
| `low-light-noise` | stress: sensor noise | under-lit, grainy sensor |
| `bursting` | transient: bursting | bursting bubbles, missing highlights, irregular cells |
| `edge-framing` | stress: framing/glare | off-centre framing with an edge glare band |
| `empty-control` | control: empty | no froth; the segmenter must return zero bubbles |

## What it emits

Per case, under `data/derived/synth/<case>/`:

| file | format | contents |
|---|---|---|
| `frame.png` | 8-bit grayscale PNG | the rendered froth image |
| `masks.json` | COCO-RLE (`frothseg.masks/v1`) | the exact instance ground truth, one RLE record per bubble |
| `bsd.csv` | CSV (`frothseg.bsd/v1`) | per-instance morphometry (`id, area_px, d_eq_px, ecc, solidity`) + a BSD summary header |
| `benchmark.json` | JSON (`frothseg.benchmark/v1`) | the classical-floor method scores (mask AP, AP50/75, BSD Wasserstein) |
| `card.json` | JSON | the compact web selector card |

And the authoritative record per case at `data/derived/manifests/<case>.json` (the FrothSpec, the seed, each
artifact's byte size + sha256, the benchmark, and the lane verdict), plus `data/derived/manifests/index.json`
inventorying every case.

The COCO-RLE masks are read by the standard eval toolchain (COCO, detectron2, mmdet) and by the web
(`frontend/src/lib/rle.ts`), never a bespoke blob. The `bsd.csv` header is a self-describing comment so the file
is legible on its own.

## Determinism and the CONTRACT-2 check

A case is a pure function of `(spec, seed)`: all randomness comes from a seeded NumPy `Generator`, so the same
seed yields a byte-identical `frame.png`, hence a stable sha256. That is what makes the committed artifacts
checkable. Two guards enforce it:

```bash
# 1. In-pipeline regenerate-and-compare (used in CI): regenerate every case and confirm the committed
#    frame.png sha256 + masks instance count still match the manifest.
PYTHONPATH=data-pipeline .venv-pipeline/Scripts/python.exe -m fslab.pipeline --check

# 2. On-disk manifest audit (stdlib only, no package install needed): index references every case, every
#    artifact exists, is non-empty, and matches the recorded byte size and sha256; lane matches the gate.
./scripts/smoke.ps1        # runs scripts/check_artifacts.py
```

`--check` exits non-zero on any drift (a code change that silently alters an artifact fails the build).
`check_artifacts.py` prints `CONTRACT 2 OK` when the manifests and artifacts on disk agree.

## The maths baked here

The geometry is a power (Laguerre) diagram, the standard dry-foam tessellation (Plateau laws): centres are packed
with log-normal radii to control the Sauter mean, and each pixel is assigned to the site of minimum power
distance,

$$\mathrm{cell}(p) = \arg\min_i \bigl(\lVert p - c_i \rVert^2 - r_i^2\bigr).$$

From each instance mask the pipeline derives the equivalent diameter (the diameter of the circle of equal area)
and summarises the bubble-size distribution by the surface-weighted Sauter mean,

$$d_{\mathrm{eq}} = 2\sqrt{A/\pi}, \qquad d_{32} = \frac{\sum_i d_i^{\,3}}{\sum_i d_i^{\,2}}.$$

The classical floor is scored against the exact masks with the COCO-style instance mask AP (greedy IoU matching,
averaged over IoU thresholds $\mathcal{T} = \{0.5, 0.55, \dots, 0.95\}$),

$$\mathrm{IoU}(A,B) = \frac{|A \cap B|}{|A \cup B|}, \qquad \mathrm{AP} = \frac{1}{|\mathcal{T}|}\sum_{t \in \mathcal{T}} \frac{\mathrm{TP}(t)}{\mathrm{TP}(t) + \mathrm{FP}(t) + \mathrm{FN}(t)},$$

and the distribution fidelity by the Wasserstein-1 distance between the predicted and true diameter CDFs (0 is
perfect),

$$W_1(P, Q) = \int_{-\infty}^{\infty} \bigl| F_P(x) - F_Q(x) \bigr|\, dx.$$

These are the exact functions in `fslab.science.segment` (`mask_ap`, `bsd_wasserstein`); the SAM verification
harness reuses the same functions so the comparison is fair (see [03_verify-sam.md](03_verify-sam.md)).

## Applying this to other data

This stage is a generator, not a loader: it manufactures froth with exact ground truth so segmenters can be
scored. To score a method on other froth you need per-bubble ground truth, which real froth does not have. So:

- To score the classical floor (or a new classical method added to `METHODS` in `segment.py`) on a different
  regime, add a `FrothSpec` to `CASES` in `science/froth_gen.py` (a new coverage-axis point, its own seed) and
  re-run the pipeline; you get a new committed case with exact GT.
- To score the live SAM core against this GT, use the offline verification harness, not this pipeline
  ([03_verify-sam.md](03_verify-sam.md)).
- To run the product on real froth you photographed, use the upload lane; there is no AP there because there is
  no ground truth, but you get live segmentation + BSD + froth-state ([02_bring-your-own-data.md](02_bring-your-own-data.md)).

## Data contract and outliers

- The generator is deliberately made hard to game: highlights are jittered and sometimes omitted so
  highlight-seeded watershed cannot win artificially, and `glare-storm` / `motion-fast` / `defocus` are negative
  controls where methods are supposed to degrade. Do not tune the generator to make a favourite method look good.
- `empty-control` renders no froth; the expected output is zero bubbles and a `null` AP (there is nothing to
  match). Any method that hallucinates bubbles here is failing the control.
- The scene lane is classified precompute, not live: scipy/scikit-image/OpenCV are not Pyodide-safe and the frames
  are full images, so the generation + classical scoring happen offline and are committed. The browser never runs
  this stage; it runs the SAM segmenter on `frame.png` (or an upload) live.
- Line endings for `bsd.csv` are forced to LF (via `.gitattributes` + the encoder) so the committed bytes and
  sha256 are identical on Windows and Linux CI. Do not re-save these artifacts through a tool that rewrites EOLs.
