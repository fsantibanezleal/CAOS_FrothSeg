# L3, GC-FSegNet reimplementation

L3 is a clean-room, in-repository global-context froth segmenter inspired by the
published GC-FSegNet family. Its graph has a local encoder, dilated context
bottleneck, squeeze/excitation fusion, and foreground/boundary/distance heads.
It does not claim source-code equivalence with an unavailable reference
implementation.

Run:

```powershell
./.venv-gpu/Scripts/python.exe -m fslab.learning.train_multitask `
  --method gc_fsegnet --cache data/cache/learned-v2-192.npz `
  --output models/gc-fsegnet-v1 --device cuda
```

The RTX 4070 run achieved test AP 0.3190, AP50 0.5958, PQ 0.5582; canonical
diagnostic AP is 0.3762. The model, checkpoint manifest, ONNX export, parity
report, calibration, and per-case masks are committed evidence. Glare and coarse
froth remain failure modes.

Reference: Minerals 2025, DOI 10.3390/min15121301. In-repo engine code is Apache-2.0; the paper
is cited for architectural provenance, not for an unsupported reproduction claim.
