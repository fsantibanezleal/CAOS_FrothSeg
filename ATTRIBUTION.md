# Attribution

FrothSeg builds on published methods and open-source software. Method-level citations (DOIs) live in the
in-app references panel and `docs/`; this file tracks software and data provenance.

## Software

- React, Vite, TypeScript · MIT.
- `@fasl-work/caos-app-shell` · the shared CAOS product shell (MIT).
- onnxruntime-web · MIT (client-side inference of the distilled mask head).
- NumPy / the Python offline pipeline dependencies · see `requirements*.txt` (BSD/MIT family).

## Methods (canonical sources · full list in docs/ and the in-app refs panel)

- Marker-controlled watershed: Meyer (1994), Signal Processing 38(1).
- Highlight-seeded froth segmentation: the Anglo Platinum / froth machine-vision line of work
  (Sweet, Aldrich et al.).
- Froth image analysis reviews: Aldrich et al. (2010, IJMP 96), Shean & Cilliers (2011, IJMP 100).
- SAM2 / Mask R-CNN as offline teachers (cited where used; no teacher weights are redistributed).

## Upstream licence provenance, L5 Cellpose-SAM

`model_registry.py` records L5's licence as BSD-3-Clause. That is correct, and it looks wrong at a
glance, so the evidence is written down here rather than left to be rediscovered:

- `https://raw.githubusercontent.com/MouseLand/cellpose/main/LICENSE` (read 2026-08-01) is the BSD
  3-Clause text verbatim: "Copyright © 2020 Howard Hughes Medical Institute", the redistribution,
  binary-reproduction and no-endorsement conditions, and the standard disclaimer. 1,454 bytes UTF-8.
- The GitHub repository API (`https://api.github.com/repos/MouseLand/cellpose`, read the same day)
  reports `license.spdx_id = BSD-3-Clause`, `license.name = BSD 3-Clause "New" or "Revised" License`.
- The repository README carries a badge whose alt-text reads `Licence: GPL v3`. The badge image is
  `img.shields.io/github/license/MouseLand/cellpose` and the alt-text is a hardcoded string that does
  not match what the badge resolves to or what the LICENSE file says.

**Do not "correct" the registry to GPL-3.0 on the strength of that badge.** The LICENSE file and the
SPDX identifier are the authority; the README alt-text is stale. Evidence recorded in
`verification/froth-citations-2026-08-01.json`.

Separately, and unchanged by the above: the Cellpose README states that all Cellpose models are
trained on CC-BY-NC data and that the Cellpose annotated dataset is also CC-BY-NC. That is a
constraint on redistributing weights or anything distilled from them, not on the BSD-3-Clause code
licence, and it is open as decision D-A in the 2026-07-31 plan proposal.

## Data

- All committed benchmark cases are SYNTHETIC (seeded Laguerre-packed froth; generator in
  `data-pipeline/fslab/`). No proprietary plant images are stored in this repository. Any real froth
  imagery used in examples must carry an explicit license note here before it is committed.
