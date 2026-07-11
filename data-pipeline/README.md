# data-pipeline/ · the offline engine (`fslab`)

Rename `fslab` → `fslab` per product. The **single source of physics/algorithm truth**; `frontend/` and
`app/` consume it, never re-implement it. Its own venv: **`.venv-pipeline`** (heavy SOTA engines, local-only).

## Layout (the package lives directly under `data-pipeline/`)
- `fslab/pipeline.py` · orchestrator + CLI (`python -m fslab.pipeline [all|<case>] [--seed N]`)
- `fslab/registry.py` · cases grouped by CATEGORY · `fslab/live.py` · Pyodide live entrypoint
- `fslab/io/` · `contract.py` (**CONTRACT 1**) · `formats.py` (standard readers/writers) · `schema.py` (types)
- `fslab/core/` · `rng.py` (seeded determinism) · `trace.py` · `manifest.py` (**CONTRACT 2**) · `gate.py`
- `fslab/model/` · the shared pure-Python core (Pyodide-safe); EXAMPLE = SIR
- `fslab/stages/` · `preprocess → feature_extraction → train → infer → evaluate → export`
- `fslab/cases/` · documented cases

Setup + run: `scripts/setup.{sh,ps1}` then `scripts/precompute.{sh,ps1}`. See
[../docs/architecture/05_precompute-pipeline.md](../docs/architecture/05_precompute-pipeline.md).
