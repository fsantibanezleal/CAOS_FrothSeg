# Cases + categories

Each case declares a **category** (the froth coverage-axis taxonomy), its generator params, an **expected band**
(what a froth-vision expert should see), and a **real|synthetic** flag. `registry.list_categories()` groups them.
The **App shows one selected case**; **Experiments/Benchmark show cross-case summaries by category** (the App is
never a cross-case dashboard).

Every case here is **synthetic**, and that is on purpose: public per-bubble froth masks are legally request-only
(`research-tools-and-data-2026-07-09`), so a synthetic Laguerre-foam renderer is the only source of exact
per-bubble ground truth. These cases are the **mask-metric harness**, not real plant froth. The product's real
capability is live SAM-class segmentation of real (uploaded) froth; see [`../../data/README.md`](../../data/README.md)
and plan section 0.

## Where they live

- `data-pipeline/fslab/cases/froth_cases.py` : the 13 `Case`s. Each wraps one `FrothSpec` and adds `(category,
  expected_band, real_or_synthetic)`. The `_META` map is the single place the category + the "what an expert
  should see" band is declared.
- `data-pipeline/fslab/science/froth_gen.py` : the generator. `CASES` is the tuple of `FrothSpec`s (name, seed,
  size, `d32_px`, `sigma_ln`, and the per-case stressor knobs: `glare`, `motion_blur`, `defocus`, `noise`,
  `load`, `highlight_jitter`, `watery`, `empty`). A case is a pure function of `(spec, seed)`, so it is
  bit-reproducible.
- `data-pipeline/fslab/registry.py` : `list_cases()`, `get_case(id)`, `list_categories()` (the grouping the
  Experiments/Benchmark pages summarize by).

## The category taxonomy

Thirteen cases span the froth coverage axes (plan section 3e), grouped into four buckets. Two are explicit
**controls** (a positive control everything should pass, a negative control everything should fail), so a method
that wins only by luck is caught.

| bucket | categories (case ids) | why it is here |
|---|---|---|
| **control** | `control: monodisperse` (`mono-clean`) · `control: empty` (`empty-control`) | positive control (near-single-size, clean highlights, all methods should pass) and negative control (no froth, the segmenter must return zero bubbles) |
| **size regime** | `fine froth` (`fine-froth`) · `coarse froth` (`coarse-froth`) · `polydisperse (nominal)` (`poly-normal`) | the operating range: many small bubbles (high-recovery), few large bubbles (coalescing/collapsing), and the wide-spread nominal case |
| **stress** | `stress: glare` (`glare-storm`) · `stress: watery/thin` (`watery`) · `stress: motion blur` (`motion-fast`) · `stress: defocus` (`defocus`) · `stress: high load/dark` (`high-load`) · `stress: sensor noise` (`low-light-noise`) · `stress: framing/glare` (`edge-framing`) | the real froth-camera failure modes: glare, thin watery froth, fast travel, out-of-focus, dark high-pull froth, under-lit noisy sensor, off-centre framing |
| **transient** | `transient: bursting` (`bursting`) | bubbles bursting: missing highlights and irregular cells, the transient a stable-froth assumption breaks on |

## The coverage matrix

The full 13-case table (each case's expected band, its stressor params, and the verified SAM AP vs the classical
floor AP scored on the exact synthetic ground truth) is in **[`01_coverage.md`](01_coverage.md)**. That page also
carries the geometry + scoring maths, how the harness applies to any other froth-like data, and the data
contract / outlier behavior.

## Honesty

- Synthetic mask AP is a controlled-harness number against known truth; it is **not** real-plant AP. Never quote
  a synthetic AP as a plant accuracy.
- The generator is built to avoid making any one method win artificially: highlights are jittered and sometimes
  dropped, and the glare / motion / defocus cases are negative controls where methods are supposed to degrade.
  SAM runs at its standard auto-mask defaults (it is not tuned to this set).
- The controls (`mono-clean`, `empty-control`) are the sanity gate: if a method fails the positive control or
  invents bubbles on the empty frame, its wins elsewhere are not trustworthy.
