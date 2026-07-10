"""The compact CARD = the web selector/gallery artifact for one froth case: just enough to populate the case
picker and the case header without loading the full manifest + masks. Part of CONTRACT 2: its shape is mirrored
by frontend/src/lib/contract.types.ts, so a drift fails the web build. Schema id is versioned."""
from __future__ import annotations

from typing import Any

CARD_SCHEMA = "frothseg.card/v1"


def _best_floor(benchmark: list[dict]) -> dict | None:
    """The headline classical baseline: the method with the highest mask AP (ties -> lowest BSD Wasserstein)."""
    scored = [b for b in benchmark if b.get("ap") is not None]
    if not scored:
        return None
    best = max(scored, key=lambda b: (b["ap"], -(b["bsd_w"] or 0.0)))
    return {"method": best["method"], "ap": best["ap"], "ap50": best["ap50"], "bsd_w": best["bsd_w"]}


def build_card(*, case: Any, bsd: dict, benchmark: list[dict], frame_rel: str) -> dict:
    return {
        "schema": CARD_SCHEMA,
        "case_id": case.id,
        "category": case.category,
        "labels": list(case.spec.labels),
        "expected_band": case.expected_band,
        "frame": frame_rel,
        "bsd": {"count": bsd.get("count"), "d10": bsd.get("d10"), "d50": bsd.get("d50"),
                "d90": bsd.get("d90"), "d32": bsd.get("d32"), "pctSmall": bsd.get("pctSmall")},
        "best_floor": _best_floor(benchmark),
    }
