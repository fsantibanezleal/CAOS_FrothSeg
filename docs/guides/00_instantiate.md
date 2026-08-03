# Guide, how the CAOS archetype is instantiated (as realised in FrothSeg)

FrothSeg is already an instantiation of the CAOS product-repo archetype (ADR-0057). This note records how the
frozen base was specialised into the froth product, so the mapping is legible; it is not a to-do list.

1. **Package.** The offline engine package is `fslab` (`data-pipeline/fslab/`); the scripts run `-m fslab.pipeline`.
2. **The engine.** The EXAMPLE domain was replaced end to end. `fslab/science/froth_gen.py` is the synthetic
   Laguerre-foam generator (the exact-ground-truth harness); `fslab/science/segment.py` is the classical floor
   plus the scoring; the stages are `generate`, `benchmark`, `export` (plus `ingest`, the image gate). The stage
   names and both data contracts are kept.
3. **CONTRACT 1.** `io/contract.py` (`validate_image`) is the bring-your-own-froth image gate: shape/dtype/size/
   contrast accept-reject plus glare/low-contrast/under-exposure flags. `data/examples/froth_sample.png` is a tiny
   frame that passes it; `tests/test_contract.py` exercises it. Documented in `data/README.md`.
4. **Cases by category.** `cases/froth_cases.py` plus `registry.py` define the 13 froth cases across the coverage
   axes (control, polydisperse, fine, coarse, and the stress and transient controls). Documented in `docs/cases/`.
5. **Engines pinned.** The CV stack is pinned in `data-pipeline/requirements.txt` (numpy, scipy, scikit-image,
   opencv, pillow, pycocotools); each has a card in `docs/frameworks/`. The live SAM runtime is a frontend
   dependency (`@huggingface/transformers`), carded in `docs/frameworks/01_transformers-js/`.
6. **Contract mirror.** `frontend/src/lib/contract.types.ts` mirrors the froth manifest/card/masks schemas (a
   drift fails `tsc`); the visualisations live in `frontend/src/viz/` and `frontend/src/pages/`.
7. **Lanes.** The mandatory offline lane owns training, official-model
   inference, evaluation, export, and release evidence. The browser provides
   four upload-only methods, C1, C3, C4, and legacy SlimSAM, plus replay of all
   15 offline methods across the 13 canonical cases.
8. **Showcase.** `python -m fslab.pipeline showcase` converts the 15-by-13
   canonical result matrix into 180 compact label/preview pairs consumed by all
   ten workbench views.
9. **Architecture modal.** `frontend/src/architecture.ts` supplies the modal
   config; five hand-authored themed SVGs under `public/svg/tech/` are passed to
   the `AppShell` config in `main.tsx`. See [guide 05](05_architecture-modal.md).
10. **Verify + version.** `scripts/setup`, `scripts/precompute`, `pytest`, then `cd frontend && npm run build`;
   `CHANGELOG.md` (`X.XX.XXX`, `0.x` while the froth-state layer uses proxy labels) with a tag per release.

The base is frozen; only the core (engine, stages, visualisations, cases, content) is specialised. Editing the
structure, contracts, env or deploy is the smell ADR-0057 exists to remove.
