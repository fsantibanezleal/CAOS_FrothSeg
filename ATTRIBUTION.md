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

## Data

- All committed benchmark cases are SYNTHETIC (seeded Laguerre-packed froth; generator in
  `data-pipeline/fslab/`). No proprietary plant images are stored in this repository. Any real froth
  imagery used in examples must carry an explicit license note here before it is committed.
