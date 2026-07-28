# L6, official Ultralytics YOLO segmentation

L6 exports exact instance masks into YOLO polygon annotations, trains the
official Ultralytics segmentation model on CUDA, and maps predicted masks back
to the common FrothSeg label/metric contract.

```powershell
./.venv-gpu/Scripts/python.exe scripts/train_yolo_seg.py --epochs 20
```

The generated YOLO dataset is local and reproducible under `data/cache/`; the
source of truth remains `manifests/learned-dataset-v2.json` plus the deterministic
generator. The run uses all 16 conditions, including microbubbles.

Ultralytics is AGPL-3.0 unless an enterprise license applies. That license is a
release/distribution gate even when the model quality passes. Reference:
Flow Measurement and Instrumentation 2026,
DOI 10.1016/j.flowmeasinst.2026.103507.

Measured metrics are read from `models/yolo-froth-seg-v1/run.json`; this page
must not claim completion until that manifest exists.
