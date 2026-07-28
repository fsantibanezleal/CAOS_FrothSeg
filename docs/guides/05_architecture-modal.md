# 05 · The in-app Architecture / "How it works" modal (ADR-0058)

Every CAOS/Faena web app ships an in-app Architecture / "How it works" modal, opened by an always-visible info
button in the header. It is the fast visual map of the complete repository and
its bounded companion website. The chrome
(button plus modal) comes from the shared shell; the product supplies only its diagrams and copy.

Binding decision: [`conventions/architecture/0-archetype/ADR-0058-in-app-architecture-modal.md`](../../../conventions/architecture/0-archetype/ADR-0058-in-app-architecture-modal.md)
(in CAOS_MANAGE).

## How FrothSeg wires it

- **Config**: `frontend/src/architecture.ts` exports the `ArchitectureConfig` (five tabs with bilingual EN/ES
  bodies), passed to the `AppShell` config in `frontend/src/main.tsx`. The shell (`@fasl-work/caos-app-shell`,
  pinned `^0.2.0`) draws the info button and the `ArchitectureModal`; the button appears because the config is
  present.
- **Diagrams**: five themed SVGs in `frontend/public/svg/tech/`. The first
  three are FrothSeg-specific: the full repository, the offline/replay/bounded
  live lanes, and the leakage-safe data-to-release flow. The method ladder and
  data-contract diagrams complete the set. Every colour is a shell CSS-variable token
  (`--color-surface`, `--color-border`, `--color-accent`, `--color-fg`, `--color-good`, `--color-warn`), so each
  diagram repaints with the active light or dark theme.

## The five tabs

| id | tab | source | what it shows |
|----|-----|--------|----------------|
| `product` | The product | product | the full offline repository and bounded companion web |
| `methods` | Method ladder | product | all C1-C7, L1-L7, and N1 with honest quality status |
| `flow` | Data flow | product | grouped split, training, calibration, untouched test, release |
| `lanes` | Compute lanes | product | authoritative offline, committed replay, C1/C3/C4 plus SlimSAM live |
| `contracts` | Data contracts | generic | CONTRACT 1 (the bring-your-own-froth image gate) and CONTRACT 2 (the committed artifacts with sha256) |

## Verify before deploy

The screenshot-verify step (mandatory before any deploy) opens the modal and confirms every tab renders its
diagram (themed, no broken SVG) plus its text with no error, in both light and dark. FrothSeg was verified this
way (the captured `arch-modal.png`). A product is not done without the Architecture modal at full depth; it is a
non-negotiable row in the product-quality bar.
