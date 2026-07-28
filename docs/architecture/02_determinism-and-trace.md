# Determinism, provenance, and trace

## Synthetic data

A still case is a pure function of its `FrothSpec`. Geometry and appearance
have separate seeds. The v2 dataset can therefore render two appearance variants
from the same latent instance geometry while retaining explicit group identity.

The manifest stores sample id, condition, latent group, geometry seed,
appearance seed, and split. A latent group belongs to exactly one split.

Canonical case exports contain:

| Artifact | Content |
|---|---|
| `frame.png` | rendered 8-bit image |
| `masks.json` | exact COCO-RLE instances |
| `bsd.csv` | per-instance morphometry and BSD |
| `benchmark.json` | C1-C7 results |
| `card.json` | compact web record |
| manifest | parameters, lane, byte sizes, and SHA-256 |

`fslab.pipeline --check` and `scripts/check_artifacts.py` regenerate or
re-hash those artifacts so silent drift fails verification.

## Learned and foundation runs

GPU floating point and official engine versions can change byte-level outputs.
Their manifests therefore record reproducibility inputs and resulting evidence:

- dataset cache checksum and split;
- seed, hyperparameters, and calibration choice;
- Python, framework, CUDA, and device versions;
- checkpoint lineage, byte size, and SHA-256;
- untouched-test metrics and per-sample errors;
- canonical diagnostic metrics;
- ONNX parity where an export is applicable.

Small in-repo checkpoints and ONNX files are versioned. Large official
Cellpose-SAM and SAM2 weights remain in upstream caches, with immutable
identifiers and local-file hashes recorded in their run manifests.

## Release trace

`method-benchmark.json` joins all 15 method results. `release-report.json`
records the SHA of that comparison, each method run, and both temporal reports.
The release gate rejects an incomplete registry or missing evidence.

The legacy browser SlimSAM experiment remains a separate historical artifact.
It does not replace or rank above the current held-out model comparison.
