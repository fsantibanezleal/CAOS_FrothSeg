"""The froth benchmark cases, grouped by CATEGORY (the coverage-axis taxonomy). Each case wraps one FrothSpec
from the synthetic generator (the sole source of EXACT per-bubble ground truth) plus what a froth-vision expert
should see. The App shows ONE selected case; Experiments/Benchmark aggregate by category.

These are labelled SYNTHETIC everywhere: they are the mask-metric harness, not real-plant froth. The product's
real capability is live SAM-class segmentation of REAL (uploaded) froth (data/README.md, plan section 0).
"""
from __future__ import annotations

from dataclasses import dataclass

from ..science.froth_gen import CASES as SPECS, FrothSpec

# case name -> (category, what a froth-vision expert should see)
_META: dict[str, tuple[str, str]] = {
    "mono-clean":      ("control: monodisperse", "near-single-size bubbles, clean specular highlights; d50 ~ d32"),
    "poly-normal":     ("polydisperse (nominal)", "wide bubble-size range, dark Plateau borders; the nominal operating case"),
    "fine-froth":      ("fine froth", "many small bubbles (high recovery regime); high count, small d32"),
    "coarse-froth":    ("coarse froth", "few large bubbles (collapsing/coalescing froth); low count, large d32"),
    "glare-storm":     ("stress: glare (negative control)", "a saturated glare lobe; highlight-seeded methods must fail here"),
    "watery":          ("stress: watery/thin", "thin watery froth, weak borders, low load; borders hard to resolve"),
    "motion-fast":     ("stress: motion blur", "horizontal motion blur from fast froth travel; smeared borders"),
    "defocus":         ("stress: defocus", "out-of-focus frame; soft borders, merged bubbles"),
    "high-load":       ("stress: high load/dark", "dense dark froth (high pull); low contrast between bubble and border"),
    "low-light-noise": ("stress: sensor noise", "under-lit, noisy sensor; grain competes with true borders"),
    "bursting":        ("transient: bursting", "bubbles bursting: many missing highlights, irregular cells"),
    "edge-framing":    ("stress: framing/glare", "off-centre framing with a glare band near the edge"),
    "empty-control":   ("control: empty", "no froth (launder/empty cell); segmenter must return zero bubbles"),
}


@dataclass(frozen=True)
class Case:
    id: str
    category: str
    spec: FrothSpec
    expected_band: str
    real_or_synthetic: str = "synthetic"


def _build() -> list[Case]:
    out: list[Case] = []
    for spec in SPECS:
        cat, band = _META.get(spec.name, ("uncategorized", ""))
        out.append(Case(id=spec.name, category=cat, spec=spec, expected_band=band))
    return out


CASES: list[Case] = _build()
