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
7. **Lanes.** The live compute is the browser SAM segmenter (`frontend/src/sam/`), not Pyodide; `fslab/live.py`
   is a numpy-only BSD helper. The backend `app/` and the GPU precompute lane are dormant for FrothSeg.
8. **Architecture modal (ADR-0058).** `frontend/src/architecture.ts` supplies the modal config; two hand-authored
   themed SVGs (`public/svg/tech/01-the-app.svg`, `04-the-science.svg`) are passed to the `AppShell` config in
   `main.tsx`. See [guide 05](05_architecture-modal.md).
9. **Verify + version.** `scripts/setup`, `scripts/precompute`, `pytest`, then `cd frontend && npm run build`;
   `CHANGELOG.md` (`X.XX.XXX`, `0.x` while the froth-state layer uses proxy labels) with a tag per release.

The base is frozen; only the core (engine, stages, visualisations, cases, content) is specialised. Editing the
structure, contracts, env or deploy is the smell ADR-0057 exists to remove.
