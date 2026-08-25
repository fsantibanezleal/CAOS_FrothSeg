"""fslab · the offline+live engine for the CAOS product-repo template (ADR-0057).

Rename this package to `fslab` per product and replace the EXAMPLE engine (model/ + the stage bodies) with the
deep-research-chosen SOTA engine. Everything else (the two data contracts, the staged pipeline, the lane gate, the
manifest/trace, the cases-by-category registry) is the FROZEN base · instantiate it, do not redesign it.
"""

# Read from the repo's VERSION file rather than restating it here. A second copy of a version is a
# second thing to forget, and this one stamps `engine_version` onto every baked artifact: measured
# before this change, the copy read '0.06.005' while the product was at '0.06.006'. PhaseFlow hit the
# same defect first and its note records the cost, a stale version "stamped 0.01.000 onto every
# artifact of the 0.02.000 bake, including the cache-busting query the frontend appends to each fetch".
import pathlib

__version__ = (
    (pathlib.Path(__file__).resolve().parents[2] / "VERSION").read_text(encoding="utf-8").strip()
)
