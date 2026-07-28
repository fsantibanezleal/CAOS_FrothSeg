# L2, deep-marker watershed

L2 is an in-repository PyTorch implementation of the deep-marker watershed
family. It is not a copy of unavailable paper code. A three-head encoder-decoder
learns foreground, lamella boundary, and interior distance; calibrated peaks of
the distance field seed a marker-controlled watershed.

Run:

```powershell
./.venv-gpu/Scripts/python.exe -m fslab.learning.train_multitask `
  --method deep_marker_watershed --cache data/cache/learned-v2-192.npz `
  --output models/deep-marker-watershed-v1 --device cuda
./.venv-gpu/Scripts/python.exe -m fslab.learning.export_multitask `
  --model models/deep-marker-watershed-v1
```

Evidence: 16 conditions, 192 latent groups, 64 untouched test samples; test AP
0.3247, AP50 0.5990, PQ 0.5694. Canonical diagnostic AP is 0.3769. ONNX parity
passes with maximum absolute error recorded in `onnx-parity.json`.

The method is executable and reproducible, but it does not beat L1 or
Cellpose-SAM. “Domain SOTA” names its research category, not a performance claim.
Reference: Chemical Engineering Research and Design (2024),
DOI 10.1016/j.cherd.2024.07.041.
