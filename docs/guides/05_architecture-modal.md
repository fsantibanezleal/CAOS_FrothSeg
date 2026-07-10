# 05 · The in-app Architecture / "How it works" modal (ADR-0058)

Every CAOS/Faena web app ships an in-app Architecture / "How it works" modal, opened by an always-visible info
button in the header. It is the fast visual proof the app is a real, complete system, not a demo. The chrome
(button plus modal) comes from the shared shell; the product supplies only its diagrams and copy.

Binding decision: [`conventions/architecture/0-archetype/ADR-0058-in-app-architecture-modal.md`](../../../conventions/architecture/0-archetype/ADR-0058-in-app-architecture-modal.md)
(in CAOS_MANAGE).

## How FrothSeg wires it

- **Config**: `frontend/src/architecture.ts` exports the `ArchitectureConfig` (five tabs with bilingual EN/ES
  bodies), passed to the `AppShell` config in `frontend/src/main.tsx`. The shell (`@fasl-work/caos-app-shell`,
  pinned `^0.2.0`) draws the info button and the `ArchitectureModal`; the button appears because the config is
  present.
- **Diagrams**: five themed SVGs in `frontend/public/svg/tech/`. Two are hand-authored for FrothSeg,
  `01-the-app.svg` (the froth workbench: frame in, live SAM segmentation, BSD and froth state out) and
  `04-the-science.svg` (the SAM automatic mask generator plus the classical floor and the scoring). The other
  three (`02-lanes.svg`, `03-web-flow.svg`, `05-data-contracts.svg`) are archetype-generic and describe the lanes,
  the web flow and the two contracts, which FrothSeg also uses. Every colour is a shell CSS-variable token
  (`--color-surface`, `--color-border`, `--color-accent`, `--color-fg`, `--color-good`, `--color-warn`), so each
  diagram repaints with the active light or dark theme.

## The five tabs

| id | tab | source | what it shows |
|----|-----|--------|----------------|
| `app` | The app | product | the froth workbench: frame in (upload or synthetic sample), live SAM masks plus BSD plus froth state out |
| `science` | The method | product | the SAM automatic mask generator step by step with the equations, and the classical floor it is scored against |
| `lanes` | Live vs precompute | generic | what runs live in the browser (the SAM segmenter) vs offline (the synthetic benchmark) vs replay |
| `contracts` | Data contracts | generic | CONTRACT 1 (the bring-your-own-froth image gate) and CONTRACT 2 (the committed artifacts with sha256) |
| `flow` | Web flow | generic | the six pages, the contract mirror, the copy-data overlay, the Pages deploy |

## Verify before deploy

The screenshot-verify step (mandatory before any deploy) opens the modal and confirms every tab renders its
diagram (themed, no broken SVG) plus its text with no error, in both light and dark. FrothSeg was verified this
way (the captured `arch-modal.png`). A product is not done without the Architecture modal at full depth; it is a
non-negotiable row in the product-quality bar.
