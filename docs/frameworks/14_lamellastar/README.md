# N1, LamellaStar frontier experiment

LamellaStar is FrothSeg's in-repository frontier hypothesis: a gated encoder-
decoder jointly predicts foreground, lamella boundary, interior distance, and
center evidence. The center head modulates watershed seeds, intended to reduce
splits under glare and motion.

```powershell
./.venv-gpu/Scripts/python.exe -m fslab.learning.train_multitask `
  --method lamellastar --cache data/cache/learned-v2-192.npz `
  --output models/lamellastar-v1 --epochs 20 --device cuda
```

The hypothesis failed in v1: test AP 0.2145, AP50 0.3731, PQ 0.4055; canonical
AP 0.2215. Center gating suppresses valid markers in wide/mixed-size froth.
Therefore LamellaStar is not “beyond SOTA.” It is a complete negative experiment
with checkpoint, ONNX parity, per-case errors, and a falsifiable next iteration.

No beyond-SOTA claim is permitted without a preregistered ablation showing a
gain over the strongest accepted method on untouched groups and temporal cases.
