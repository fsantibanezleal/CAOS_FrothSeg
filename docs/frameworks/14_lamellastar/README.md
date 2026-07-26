# N1, LamellaStar experimental model

LamellaStar is FrothSeg's in-repository frontier hypothesis: a gated encoder-
decoder jointly predicts foreground, lamella boundary, interior distance, and
center evidence. The center head modulates watershed seeds, intended to reduce
splits under glare and motion.

```powershell
./.venv-gpu/Scripts/python.exe -m fslab.learning.train_multitask `
  --method lamellastar --cache data/cache/learned-v2-192.npz `
  --output runs/n1-ablations/c24-e40-s20260727 `
  --base-channels 24 --epochs 40 --seed 20260727 `
  --evaluation-split validation --device cuda
```

The second preregistered study evaluated widths 16, 24, and 32 for 24 epochs,
then repeated the winning width 24 for 40 epochs with three seeds. Selection
used validation AP only. Seed 20260727 won at validation AP 0.4766. That single
checkpoint was then evaluated once on the untouched test: AP 0.4717, AP50
0.7755, PQ 0.6967, Brier 0.0128, and ECE 0.0101. Its separate 13-case
diagnostic AP is 0.4861.

This revision clears the controlled AP 0.30 comparison threshold and improves
substantially over the first LamellaStar run. It does not exceed the measured
Cellpose-SAM leader at AP 0.5099, so the evidence does not support a superiority
claim. The selected checkpoint, exported ONNX graph, parity report, per-case
errors, calibration, and selection record make the result reproducible.

No superiority claim is permitted without a preregistered ablation showing a
gain over the strongest accepted method on untouched groups and temporal cases.
