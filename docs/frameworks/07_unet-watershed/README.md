# L1, boundary U-Net plus marker watershed

Status: **accepted learned vertical; Cellpose-SAM remains the measured leader**.

## What is implemented

- compact two-head U-Net in `fslab.learning.unet_watershed`;
- foreground and lamella-boundary supervision from exact instance masks;
- deterministic, leakage-safe synthetic seed families;
- resumable PyTorch training with a local optimizer checkpoint;
- committed framework-neutral NPZ inference weights with SHA-256;
- calibration-only threshold/min-distance sweep;
- untouched synthetic test evaluation;
- batch inference over the 13 canonical diagnostic cases;
- 16-bit instance-mask artifacts;
- ONNX opset 18 export and ONNX Runtime numerical parity.

Commands:

```powershell
$env:PYTHONPATH = "data-pipeline"
./.venv-gpu/Scripts/python.exe -m fslab.learning.train_unet `
  --output models/unet-watershed-v2 --epochs 24 --image-size 192 `
  --base-channels 24 --batch-size 8 --device cuda
./.venv-gpu/Scripts/python.exe -m fslab.learning.infer_unet `
  --model models/unet-watershed-v2 `
  --output data/derived/learned/unet-watershed-v2 --device cuda
.venv-gpu/Scripts/python.exe -m fslab.learning.export_unet `
  --model models/unet-watershed-v2
```

## Current evidence

- 16 conditions, 192 latent groups, and 384 samples with group-safe
  train/validation/calibration/test partitions;
- untouched 64-sample test: mean AP 0.4153, AP50 0.6987, PQ 0.6559;
- canonical synthetic diagnostic: mean AP 0.4565, AP50 0.7563, PQ 0.6978;
- ONNX maximum absolute logit error: 1.046e-5 at a declared 2e-5 tolerance;
- checkpoint: `models/unet-watershed-v2/weights.npz`;
- browser export: `models/unet-watershed-v2/model.onnx`.

L1 still exceeds the best current classical diagnostic mean AP: 0.4565 against 0.3506, which is C3
after the 2026-08-01 corrections (the best classical was 0.262 before them). The margin narrowed
because C3 improved, not because L1 moved. It does not exceed official Cellpose-SAM, which is 0.6472
on the same 13-case diagnostic. It is accepted as the compact deployable
learned model, not advertised as SOTA. Microbubble resolution and coarse-bubble
over-segmentation remain visible failure modes.

## Reference

Ronneberger, Fischer, Brox, “U-Net: Convolutional Networks for Biomedical Image
Segmentation,” MICCAI 2015. DOI: 10.1007/978-3-319-24574-4_28.
