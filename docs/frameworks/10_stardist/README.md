# L4, official StarDist 2D

L4 uses the official `stardist==0.9.2` and `csbdeep` implementation. It trains a
32-ray, two-level StarDist model on the same leakage-safe FrothSeg cache, then
optimizes probability/NMS thresholds on calibration groups and evaluates the
untouched test split.

```powershell
./.venv-gpu/Scripts/python.exe -m fslab.learning.train_stardist `
  --output models/stardist-froth-v1 --epochs 12 --steps-per-epoch 24
```

Native Windows limitation: official TensorFlow 2.21 is CPU-only. The repository
therefore pins `tensorflow-cpu` on Windows and `tensorflow` on Linux/WSL2. The
completed Windows run reports CPU explicitly; it must not be described as GPU.

Measured test AP is 0.1119, AP50 0.3473, PQ 0.3242; canonical AP is 0.1204. The
result is below the bar but retained with the official checkpoint, config,
thresholds, TensorBoard logs, and per-case evidence.

StarDist and CSBDeep are BSD-3-Clause. Reference: Schmidt et al. 2018,
DOI 10.1007/978-3-030-00934-2_30.
