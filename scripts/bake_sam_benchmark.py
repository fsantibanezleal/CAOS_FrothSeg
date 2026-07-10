"""Bake the offline SAM-vs-floor benchmark into a committed artifact the web reads (data/derived/
sam_benchmark.json, schema frothseg.sam_benchmark/v1). Reads the SAM label dumps produced by
frontend/scripts/verify_sam.ts (verification/sam/<case>.json), regenerates the exact GT, and scores SAM with the
SAME validated mask_ap + bsd_wasserstein the classical floor uses. This is a RECORDED experiment result (the SAM
run is model-dependent), not a sha-checked CONTRACT-2 artifact, so it is written once here and committed.

    PYTHONPATH=data-pipeline .venv-pipeline/Scripts/python.exe scripts/bake_sam_benchmark.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.science.froth_gen import CASES, generate  # noqa: E402
from fslab.science.segment import bsd_wasserstein, mask_ap  # noqa: E402

SAM_DIR = ROOT / "verification" / "sam"
BENCH = ROOT / "data" / "derived" / "synth"
OUT = ROOT / "data" / "derived" / "sam_benchmark.json"

# case -> category (mirror the App registry labels)
CATEGORY = {c.name: cat for c, cat in [
    (c, {
        "mono-clean": "control: monodisperse", "poly-normal": "polydisperse (nominal)", "fine-froth": "fine froth",
        "coarse-froth": "coarse froth", "glare-storm": "stress: glare", "watery": "stress: watery/thin",
        "motion-fast": "stress: motion blur", "defocus": "stress: defocus", "high-load": "stress: high load/dark",
        "low-light-noise": "stress: sensor noise", "bursting": "transient: bursting",
        "edge-framing": "stress: framing/glare", "empty-control": "control: empty",
    }.get(c.name, "uncategorized")) for c in CASES]}


def _gt(case_id: str) -> np.ndarray:
    spec = next(c for c in CASES if c.name == case_id)
    return np.asarray(generate(spec)["labels"], dtype=np.int32)


def _gt_d32(gt: np.ndarray) -> float | None:
    ids = np.unique(gt[gt > 0])
    if ids.size == 0:
        return None
    counts = np.bincount(gt.ravel())[ids]
    d = 2.0 * np.sqrt(counts / np.pi)
    return round(float((d ** 3).sum() / (d ** 2).sum()), 2)


def _floor_best(case_id: str):
    bpath = BENCH / case_id / "benchmark.json"
    methods = json.loads(bpath.read_text(encoding="utf-8"))["methods"]
    scored = [m for m in methods if m.get("ap") is not None]
    if not scored:
        return None, None
    best = max(scored, key=lambda m: m["ap"])
    return best["method"], best["ap"]


def main() -> int:
    dumps = sorted(SAM_DIR.glob("*.json"))
    if not dumps:
        print(f"no SAM dumps in {SAM_DIR}; run frontend/scripts/verify_sam.ts first")
        return 1
    model = json.loads(dumps[0].read_text(encoding="utf-8")).get("model", "unknown")
    cases = []
    sam_aps, floor_aps = [], []
    for d in dumps:
        j = json.loads(d.read_text(encoding="utf-8"))
        cid = j["case_id"]
        pred = np.asarray(j["labels"], dtype=np.int32).reshape(j["height"], j["width"])
        gt = _gt(cid)
        ap = mask_ap(pred, gt)
        fmethod, fap = _floor_best(cid)
        gt_ids = int(len(np.unique(gt[gt > 0])))
        rec = {
            "case_id": cid, "category": CATEGORY.get(cid, "uncategorized"),
            "sam_ap": ap["ap"], "sam_ap50": ap["ap50"], "sam_bsd_w": bsd_wasserstein(pred, gt),
            "sam_n": j["nInstances"], "gt_n": gt_ids, "sam_d32": j["bsd"]["d32"], "gt_d32": _gt_d32(gt),
            "floor_method": fmethod, "floor_ap": fap,
            "encoder_ms": j.get("encoderMs"), "total_ms": j.get("totalMs"), "device": j.get("device"),
        }
        cases.append(rec)
        if ap["ap"] is not None:
            sam_aps.append(ap["ap"])
        if fap is not None:
            floor_aps.append(fap)
    cases.sort(key=lambda r: (r["sam_ap"] is None, -(r["sam_ap"] or 0)))
    doc = {
        "schema": "frothseg.sam_benchmark/v1",
        "model": model,
        "grid": 32,
        "provenance": "offline verification, onnxruntime-node CPU; scored vs exact synthetic GT with the same mask_ap the classical floor uses",
        "summary": {
            "n_cases": len(cases),
            "mean_sam_ap": round(float(np.mean(sam_aps)), 3) if sam_aps else None,
            "mean_floor_ap": round(float(np.mean(floor_aps)), 3) if floor_aps else None,
            "delta": round(float(np.mean(sam_aps) - np.mean(floor_aps)), 3) if sam_aps and floor_aps else None,
            "sam_wins": int(sum(1 for c in cases if c["sam_ap"] is not None and c["floor_ap"] is not None and c["sam_ap"] > c["floor_ap"])),
        },
        "cases": cases,
    }
    OUT.write_text(json.dumps(doc, indent=1), encoding="utf-8")
    s = doc["summary"]
    print(f"baked {OUT} : {s['n_cases']} cases, mean SAM AP {s['mean_sam_ap']} vs floor {s['mean_floor_ap']} "
          f"(delta {s['delta']}), SAM wins {s['sam_wins']}/{s['n_cases']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
