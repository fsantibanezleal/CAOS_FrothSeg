# L5, official Cellpose-SAM

L5 executes official `cellpose==4.2.1.1` on CUDA and fine-tunes the pretrained
`cpsam_v2` checkpoint. The resulting 1.22 GB checkpoint remains local; the run
manifest records its exact byte size, SHA-256, base model, data split,
hyperparameters, device, and losses so results are reproducible without
committing a redundant binary.

```powershell
./.venv-gpu/Scripts/python.exe scripts/finetune_cellpose_sam.py --epochs 2
```

Parameters are fixed before test evaluation: automatic diameter, normalized
grayscale, flow threshold 0.4, cell-probability threshold 0.0, and minimum size
5. No test-set tuning occurs.

The RTX 4070 run trained on all 192 training samples for two complete epochs,
used 64 validation samples without mixing groups, and then evaluated the 64
untouched test samples. It achieved test AP 0.5099, AP50 0.8238, PQ 0.7227 and
canonical diagnostic AP 0.6472. This is the strongest measured method in the
current matrix. It remains a synthetic-harness result, not a plant-accuracy
claim.

Cellpose code is BSD-3-Clause; pretrained-data/model terms are recorded in the
run manifest and attribution. Reference: Pachitariu et al. 2025,
DOI 10.1101/2025.04.28.651001.
