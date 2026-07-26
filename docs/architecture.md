# Architecture

FrothSeg is an offline-first scientific product with a bounded companion web.
The repository owns the complete lifecycle; the browser exposes selected cases,
precomputed comparisons, and lightweight interactive evaluation.

- [01 · overview](architecture/01_overview.md): component boundaries and the
  full data-to-release flow.
- [02 · determinism and trace](architecture/02_determinism-and-trace.md):
  seeds, checksums, and reproducible artifacts.
- [03 · compute gate](architecture/03_the-gate.md): what is valid live and what
  must be precomputed.
- [04 · bounded browser lane](architecture/04_live-lane-pyodide.md): seven
  TypeScript classical methods and legacy lightweight SlimSAM.
- [05 · offline pipelines](architecture/05_precompute-pipeline.md): generation,
  caching, training, calibration, inference, evaluation, and export.
- [06 · model evaluation](architecture/06_model-evaluation.md): split policy,
  metrics, full results, and claim gates.
- [07 · deployment](architecture/07_deploy.md): static companion-web delivery.
- [08 · data contracts](architecture/08_data-contracts.md): ingestion and
  artifact schemas.

Binding decisions are maintained in the CAOS management repository. This
implementation follows the product-repo archetype while treating the offline
science stack, not the website, as the primary product.
