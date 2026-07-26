"""Run all seven classical engines on the untouched learned-dataset test split."""

from __future__ import annotations

import argparse
import json
import platform
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.learning.data_cache import load_cache, select_split  # noqa: E402
from fslab.science.segment import (  # noqa: E402
    METHODS,
    full_instance_metrics,
    summarize_metric_rows,
)


def run(cache_path: Path, output: Path, selected_methods: list[str] | None = None) -> dict:
    cache = select_split(load_cache(cache_path), "test")
    method_names = selected_methods or list(METHODS)
    unknown = sorted(set(method_names) - set(METHODS))
    if unknown:
        raise ValueError(f"unknown classical methods: {unknown}")
    method_reports = []
    for method_name in method_names:
        engine = METHODS[method_name]
        rows = []
        started_method = time.perf_counter()
        for index, image in enumerate(cache["images"]):
            started = time.perf_counter()
            labels = engine(image.astype(np.float32) / 255.0)
            inference_ms = (time.perf_counter() - started) * 1000
            rows.append({
                "sample_id": str(cache["sample_ids"][index]),
                "condition_id": str(cache["conditions"][index]),
                "group_id": str(cache["group_ids"][index]),
                **full_instance_metrics(labels, cache["labels"][index]),
                "inference_ms": round(inference_ms, 3),
            })
        report = summarize_metric_rows(rows, split="test")
        report.update({
            "method": method_name,
            "engine": "scikit-image/SciPy",
            "device": platform.processor() or platform.machine(),
            "duration_seconds": round(time.perf_counter() - started_method, 3),
            "mean_inference_ms": float(np.mean([row["inference_ms"] for row in rows])),
            "p95_inference_ms": float(np.quantile([row["inference_ms"] for row in rows], 0.95)),
        })
        method_reports.append(report)
        print(
            f"{method_name}: AP={report['mean_ap']:.4f} "
            f"boundary-F={report['mean_boundary_fscore']:.4f}",
            flush=True,
        )
    document = {
        "schema": "frothseg.classical-heldout/v1",
        "dataset_schema": "frothseg.learned-dataset/v2",
        "method_count": len(method_reports),
        "methods": method_reports,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(document, indent=2), encoding="utf-8")
    return document


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=ROOT / "data/cache/learned-v2-192.npz")
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "data/derived/classical-heldout.json",
    )
    parser.add_argument("--method", action="append", dest="methods")
    args = parser.parse_args()
    run(args.cache, args.output, args.methods)


if __name__ == "__main__":
    main()
