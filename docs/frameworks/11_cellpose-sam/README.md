# L5, official Cellpose-SAM

L5 executes official `cellpose==4.2.1.1` with the pretrained `cpsam_v2`
checkpoint on CUDA. The 1.23 GB checkpoint remains in Cellpose's user cache; the
run manifest records its exact byte size and SHA-256 so results are reproducible
without committing a redundant binary.

```powershell
./.venv-gpu/Scripts/python.exe scripts/benchmark_cellpose_sam.py
```

Parameters are fixed before test evaluation: automatic diameter, normalized
grayscale, flow threshold 0.4, cell-probability threshold 0.0, and minimum size
5. No test-set tuning occurs.

The RTX 4070 run achieved test AP 0.4336, AP50 0.7462, PQ 0.6553 and canonical
diagnostic AP 0.5827. This is the strongest measured method in the current
matrix. It remains a synthetic-harness result, not a plant-accuracy claim.

Cellpose code is BSD-3-Clause; pretrained-data/model terms are recorded in the
run manifest and attribution. Reference: Pachitariu et al. 2025,
DOI 10.1101/2025.04.28.651001.
