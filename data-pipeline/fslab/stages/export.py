"""Stage: export (CONTRACT 2) — encode one froth scene into committed artifacts + write the case manifest.

Per case, under data/derived/synth/<case>/:
  frame.png        8-bit grayscale froth image
  masks.json       EXACT instance ground truth, COCO-RLE
  bsd.csv          per-instance morphometry + BSD summary
  benchmark.json   classical-floor method scores (mask AP + BSD Wasserstein)
  card.json        compact web selector card
and manifests/<case>.json = the authoritative record (spec + seed + artifact sha256s + benchmark + lane).
"""
from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
from typing import Any

from ..core.gate import classify_lane
from ..core.manifest import build_case_manifest
from ..core.trace import build_card
from ..io.formats import write_json
from ..io.froth_io import sha256_file, write_bsd_csv, write_masks_json, write_png


def _artifact(path: Path, rel: str, fmt: str, nbytes: int, extra: dict | None = None) -> dict:
    rec = {"path": rel, "format": fmt, "bytes": nbytes, "sha256": sha256_file(path)}
    if extra:
        rec.update(extra)
    return rec


def run(
    *,
    case: Any,
    scene: Any,
    benchmark: list,
    seed: int,
    run_ms: float,
    derived_dir: str,
    manifests_dir: str,
) -> dict:
    case_dir = Path(derived_dir) / "synth" / case.id
    rel = f"synth/{case.id}"
    bench = [asdict(s) for s in benchmark]

    frame_path = case_dir / "frame.png"
    frame_bytes = write_png(frame_path, scene.image)
    masks_path = case_dir / "masks.json"
    masks_bytes, n_inst = write_masks_json(masks_path, case.id, scene.labels)
    bsd_path = case_dir / "bsd.csv"
    bsd_bytes = write_bsd_csv(bsd_path, scene.labels, scene.bsd)
    bench_path = case_dir / "benchmark.json"
    bench_bytes = write_json(bench_path, {"schema": "frothseg.benchmark/v1", "case_id": case.id, "methods": bench})

    artifacts = {
        "frame": _artifact(frame_path, f"{rel}/frame.png", "png", frame_bytes,
                           {"height": scene.image.shape[0], "width": scene.image.shape[1]}),
        "masks": _artifact(masks_path, f"{rel}/masks.json", "coco-rle", masks_bytes, {"n_instances": n_inst}),
        "bsd": _artifact(bsd_path, f"{rel}/bsd.csv", "csv", bsd_bytes),
        "benchmark": _artifact(bench_path, f"{rel}/benchmark.json", "json", bench_bytes),
    }

    # The synthetic GT + classical benchmark are baked OFFLINE (scipy/skimage/opencv are not Pyodide-safe and the
    # frames are full images), so the case lane is PRECOMPUTE. The LIVE capability is the browser SAM-class
    # segmenter (onnxruntime-web + WebGPU) operating on frame.png or an upload, measured live in JS, not here.
    gate = classify_lane(pure_python=False, wheels={"numpy", "scipy", "scikit-image", "opencv-python"},
                         run_ms=run_ms, trace_bytes=frame_bytes)

    card = build_card(case=case, bsd=scene.bsd, benchmark=bench, frame_rel=artifacts["frame"]["path"])
    write_json(case_dir / "card.json", card)

    manifest = build_case_manifest(case=case, scene=scene, seed=seed, artifacts=artifacts,
                                   benchmark=bench, gate=gate)
    write_json(Path(manifests_dir) / f"{case.id}.json", manifest)
    return manifest
