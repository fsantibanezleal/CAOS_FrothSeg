# L1, boundary U-Net plus marker watershed

Status: **implemented research vertical, not accepted as the flagship**.

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
python -m fslab.learning.train_unet `
  --output models/unet-watershed-v1 --epochs 12 --image-size 96 --base-channels 8
python -m fslab.learning.infer_unet `
  --model models/unet-watershed-v1 `
  --output data/derived/learned/unet-watershed-v1
.venv-gpu/Scripts/python.exe -m fslab.learning.export_unet `
  --model models/unet-watershed-v1
```

## Current evidence

- held-out synthetic seed families: mean AP 0.2213, AP50 0.5402, PQ 0.4723;
- canonical synthetic diagnostic cases: mean AP 0.2219, AP50 0.5143, PQ 0.4721;
- ONNX maximum absolute logit error: 7.63e-6, parity passed;
- checkpoint: `models/unet-watershed-v1/weights.npz`;
- browser export: `models/unet-watershed-v1/model.onnx`.

These results are still below the best current classical diagnostic mean AP
(0.262). L1 is therefore a real trained implementation but **not an accepted
quality result**. It must not be promoted in the UI as SOTA or flagship. The main
weaknesses are fine dense froth and glare. The next experiments increase native
resolution/data diversity, use distance/ray targets, and add real corrected froth
before any product claim.

## Reference

Ronneberger, Fischer, Brox, “U-Net: Convolutional Networks for Biomedical Image
Segmentation,” MICCAI 2015. DOI: 10.1007/978-3-319-24574-4_28.
