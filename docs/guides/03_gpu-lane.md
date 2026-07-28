# GPU lane: offline training and foundation-model inference

FrothSeg has a mandatory offline CUDA lane. It trains the learned models, runs
foundation-model inference, calibrates thresholds on validation families, exports
deployable artifacts, and bakes benchmark results. None of that work belongs in
the browser or in the production deployment.

## Reproducible environment

On an NVIDIA host, run:

```powershell
./scripts/setup.ps1
./.venv-gpu/Scripts/python.exe scripts/check_cuda.py
```

The GPU requirements pin `torch==2.13.0+cu126` and
`torchvision==0.28.0+cu126` from PyTorch's CUDA 12.6 wheel index. The smoke
check requires the CUDA-qualified wheel, a visible device, and a real matrix
operation. It exits non-zero instead of silently falling back to CPU.

The validated workstation target is an NVIDIA GeForce RTX 4070 Laptop GPU with
8 GiB VRAM. Training commands must support bounded batch sizes, deterministic
seeds, checkpoints, resume, and machine-readable run manifests.

## Lane boundary

- `.venv-pipeline`: CPU generation, classical C1-C7 baselines, artifact
  validation, and inexpensive evaluation.
- `.venv-gpu`: L1-L7 and N1 training/inference/export, including official
  foundation-model inference. Heavy work happens here and is baked to versioned
  artifacts.
- `.venv`: thin web/runtime tooling only.

The companion website reads committed benchmark summaries and compact model
artifacts. It may offer a deliberately bounded live evaluation path when the
method and hardware make that valid, but it never recomputes the benchmark,
trains a model, or downloads a multi-gigabyte research stack during deployment.

## Verification

Every GPU run records the model/method id, data split manifest, seed,
hyperparameters, package versions, device, checkpoint lineage, calibration
choice, metrics, and artifact checksums. A result without that provenance is
not eligible for the comparison table or release gate.
