# Offline processing, training, and inference pipelines

Offline compute is the product core. The web never substitutes for it.

## Data pipeline

1. `froth_gen.generate` creates an image and exact instance labels.
2. `froth_gen.generate_sequence` creates time-varying frames with persistent
   identity labels.
3. `datasets.build_learned_dataset` expands 16 condition families into 384
   samples with independent geometry and appearance seeds.
4. `build_learned_manifest.py` writes split membership and provenance.
5. `build_learned_cache.py` materializes the local NPZ cache and checksum
   metadata. The cache is reproducible but intentionally not committed.

The split unit is the latent geometry group, never the rendered image.

## Classical pipeline

`fslab.pipeline` runs generation, C1-C7 benchmarking, and CONTRACT-2 export for
the 13 canonical cases. Each output has exact ground truth, COCO-RLE masks,
bubble-size distribution, per-method results, and SHA-256 references.

## Learned-model pipeline

The shared lifecycle is:

```text
train split -> validation monitoring -> calibration-only thresholds
           -> untouched test -> canonical diagnostic -> portable export
```

- L1 uses `train_unet`, `infer_unet`, and `export_unet`.
- L2, L3, and N1 use the distinct graphs in `multitask_models` with the shared
  `train_multitask`, `infer_multitask`, and `export_multitask` harness.
- L4 uses the official StarDist graph and serialization.
- L6 exports exact polygons and trains the official Ultralytics segmentation
  model.

CUDA is mandatory for PyTorch and Ultralytics training. A CPU fallback is an
error. Native Windows TensorFlow is the documented exception for StarDist
because current upstream Windows wheels do not expose CUDA; WSL2/Linux is the
supported GPU path.

## Foundation pipeline

- L5 loads official Cellpose `cpsam_v2`, records its external checkpoint SHA,
  runs CUDA batch inference, and emits common instance metrics.
- L7 pins official `facebookresearch/sam2`, runs automatic image masks on CUDA,
  and separately evaluates video propagation from exact first-frame prompts.

Large upstream checkpoints remain in their official caches. Their identifiers,
sizes, hashes, parameters, versions, and device evidence are committed.

## Showcase pipeline

After every method has produced canonical labels,
`python -m fslab.pipeline showcase` runs `fslab.showcase`. It converts each
registered method's labels into a compact run-length label raster and a
boundary-overlay preview for every canonical case. The manifest records exactly
15 methods, 12 scored cases, and 180 method-case artifact pairs, with SHA-256 for each
analysis raster and preview. This stage is the explicit bridge from
authoritative offline inference to the ten-view companion workbench.

The showcase stage performs no model inference. It fails when a learned result
is missing, and it never replaces the originating labels in the method-specific
inference directory.

## Evaluation and release

`build_method_benchmark.py` joins all 15 implementations into the
`frothseg.method-benchmark/v2` browser/release contract. It retains every one
of the 15 x 64 = 960 held-out method-case cells, macro and micro aggregates,
runtime, peak-memory measurement, hardware lane, model size/hash, and run
provenance. `build_release_report.py` inventories those cells, every model run,
browser parity, temporal report, and showcase coverage.
`check_product_completeness.py
--profile development` rejects incomplete matrices or compute evidence;
`--profile release` additionally enforces the governed real-data and version
gates.
