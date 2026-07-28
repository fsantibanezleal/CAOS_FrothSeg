"""Bake temporal (image-sequence) evidence for every framewise method.

Runs each registered method over all five canonical sequences, assigns identities by IoU
association, scores tracking and events, and writes one report per method under the temporal
report root. L7 is excluded here: it propagates natively and is baked by benchmark_sam2_video.py.

Usage:
    python scripts/bake_temporal_all.py --output-root data/derived/temporal
    python scripts/bake_temporal_all.py --methods C1,C4,N1 --output-root runs/temporal-probe

Always pass a sandbox --output-root when probing. The canonical root is a release artifact.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.temporal_bake import (  # noqa: E402
    FRAMEWISE_METHOD_IDS,
    SEQUENCE_IDS,
    bake_method,
    report_filename,
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-root",
        type=Path,
        default=ROOT / "data/derived/temporal",
        help="directory that receives <slug>.json plus its prediction artifacts",
    )
    parser.add_argument(
        "--methods",
        default=",".join(FRAMEWISE_METHOD_IDS),
        help="comma-separated method ids; defaults to every framewise method",
    )
    parser.add_argument(
        "--sequences",
        default=",".join(SEQUENCE_IDS),
        help="comma-separated sequence ids",
    )
    parser.add_argument("--device", default="cuda")
    parser.add_argument(
        "--continue-on-error",
        action="store_true",
        help="record a failure for a method and keep going instead of aborting the whole bake",
    )
    args = parser.parse_args()

    method_ids = [item.strip() for item in args.methods.split(",") if item.strip()]
    sequence_ids = tuple(item.strip() for item in args.sequences.split(",") if item.strip())
    output_root = args.output_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    summary: list[dict] = []
    failures: list[str] = []
    overall_started = time.perf_counter()
    for method_id in method_ids:
        started = time.perf_counter()
        report_path = output_root / report_filename(method_id)
        try:
            report = bake_method(
                method_id,
                report_path=report_path,
                device=args.device,
                sequence_ids=sequence_ids,
            )
        except Exception as error:  # noqa: BLE001 - the point is to report which engine failed
            failures.append(method_id)
            print(f"[{method_id}] FAILED after {time.perf_counter() - started:.1f}s: {error}")
            traceback.print_exc()
            if not args.continue_on_error:
                return 1
            continue
        summary.append({
            "method_id": method_id,
            "method": report["method"],
            "mean_idf1": round(report["mean_idf1"], 4),
            "mean_hota": round(report["mean_hota"], 4),
            "mean_frame_coverage": round(report["mean_frame_coverage"], 4),
            "mean_id_switch_rate": round(report["mean_id_switch_rate"], 5),
            "seconds": round(report["duration_seconds"], 1),
        })
        print(
            f"[{method_id}] {report['method']:26} "
            f"IDF1 {report['mean_idf1']:.3f}  HOTA {report['mean_hota']:.3f}  "
            f"coverage {report['mean_frame_coverage']:.3f}  "
            f"({report['duration_seconds']:.1f}s)"
        )

    print()
    print(json.dumps({
        "baked": len(summary),
        "failed": failures,
        "total_seconds": round(time.perf_counter() - overall_started, 1),
        "ranking_by_hota": sorted(summary, key=lambda row: -row["mean_hota"]),
    }, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
