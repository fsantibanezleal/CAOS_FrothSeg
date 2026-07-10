"""CONTRACT 2 — artifact (pipeline -> web). The manifest is the authoritative, versioned record of a baked froth
case: its generator spec + seed, the artifact pointers (frame.png / masks.json / bsd.csv) with byte size AND
sha256, the BSD ground-truth summary, the classical-floor benchmark scores, and the lane/gate verdict. The web
loads ONLY manifests + artifacts; frontend/src/lib/contract.types.ts mirrors this schema so a drift fails the
build. A flat index.json inventories every case (ADR-0057 default)."""
from __future__ import annotations

from dataclasses import asdict
from typing import Any

from .. import __version__

MANIFEST_SCHEMA = "frothseg.manifest/v1"
INDEX_SCHEMA = "frothseg.index/v1"
GENERATOR_ID = "laguerre-power-diagram/v1"


def build_case_manifest(
    *,
    case: Any,
    scene: Any,
    seed: int,
    artifacts: dict,
    benchmark: list,
    gate: dict,
) -> dict:
    """Deterministic: a pure function of (spec, seed). No wall-clock (would dirty git on re-run); the gate carries
    the lane decision + budgets, live latency is measured in the browser."""
    spec = case.spec
    return {
        "schema": MANIFEST_SCHEMA,
        "case_id": case.id,
        "category": case.category,
        "real_or_synthetic": case.real_or_synthetic,
        "expected_band": case.expected_band,
        "labels": list(spec.labels),
        "engine": {"package": "fslab", "version": __version__, "generator": GENERATOR_ID},
        "spec": {
            "h": spec.h, "w": spec.w, "d32_px": spec.d32_px, "sigma_ln": spec.sigma_ln,
            "glare": spec.glare, "motion_blur": spec.motion_blur, "defocus": spec.defocus,
            "noise": spec.noise, "load": spec.load, "highlight_jitter": spec.highlight_jitter,
            "watery": spec.watery, "empty": spec.empty,
        },
        "seed": seed,
        "artifacts": artifacts,
        "bsd": scene.bsd,
        "benchmark": [asdict(s) if hasattr(s, "__dataclass_fields__") else s for s in benchmark],
        "lane": gate["lane"],
        "gate": gate,
    }


def build_index(entries: list[dict]) -> dict:
    """entries: [{case_id, category, manifest_path}] -> the flat authoritative inventory."""
    return {
        "schema": INDEX_SCHEMA,
        "engine_version": __version__,
        "generator": GENERATOR_ID,
        "n_cases": len(entries),
        "cases": sorted(entries, key=lambda e: e["case_id"]),
    }
