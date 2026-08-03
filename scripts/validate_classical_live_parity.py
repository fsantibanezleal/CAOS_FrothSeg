"""Compare browser C1/C3/C4 twins with the canonical Python implementations."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.learning.data_cache import load_cache, select_split  # noqa: E402
from fslab.science.segment import (  # noqa: E402
    METHODS,
    full_instance_metrics,
)

LIVE_METHODS = ("otsu_cc", "watershed_hmax", "watershed_dt")
ACCEPTANCE = {
    "max_mean_absolute_ap_delta": 0.03,
    "min_mean_browser_vs_offline_ap": 0.50,
    "min_mean_browser_vs_offline_boundary_fscore": 0.95,
    "min_mean_instance_count_ratio": 0.75,
    "max_mean_instance_count_ratio": 1.25,
}


def sha256(path: Path) -> str:
    """Hash a source file with line endings normalised to LF.

    These are TEXT sources and `.gitattributes` stores them with LF. A Windows edit can leave
    CRLF in the working tree, so hashing raw bytes made the recorded hash depend on which
    machine ran the validator: it passed locally and failed in CI on a fresh LF checkout, with
    a "parity is stale" message that had nothing to do with parity. Normalising first makes the
    hash a property of the content.
    """
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def build(cache_path: Path) -> dict:
    cache = select_split(load_cache(cache_path), "test")
    selected_indices = []
    seen_conditions: set[str] = set()
    for index, condition in enumerate(cache["conditions"]):
        condition_id = str(condition)
        if condition_id not in seen_conditions:
            selected_indices.append(index)
            seen_conditions.add(condition_id)
    if len(selected_indices) != 16:
        raise ValueError(f"expected 16 condition representatives, got {len(selected_indices)}")

    input_document = {
        "schema": "frothseg.classical-live-input/v1",
        "cases": [
            {
                "sample_id": str(cache["sample_ids"][index]),
                "width": int(cache["images"][index].shape[1]),
                "height": int(cache["images"][index].shape[0]),
                "gray": (cache["images"][index].astype(np.float32) / 255.0)
                .ravel()
                .tolist(),
            }
            for index in selected_indices
        ],
    }
    with tempfile.TemporaryDirectory(prefix="frothseg-live-parity-") as temporary:
        temporary_path = Path(temporary)
        input_path = temporary_path / "input.json"
        output_path = temporary_path / "output.json"
        input_path.write_text(json.dumps(input_document), encoding="utf-8")
        tsx_cli = ROOT / "frontend/node_modules/tsx/dist/cli.mjs"
        if not tsx_cli.exists():
            raise FileNotFoundError(
                "frontend dependencies are required; run npm ci in frontend"
            )
        subprocess.run(
            [
                "node",
                str(tsx_cli),
                str(ROOT / "frontend/scripts/run_classical_parity.ts"),
                str(input_path),
                str(output_path),
            ],
            cwd=ROOT,
            check=True,
        )
        live = json.loads(output_path.read_text(encoding="utf-8"))

    live_by_sample = {row["sample_id"]: row["methods"] for row in live["cases"]}
    methods = []
    for method_name in LIVE_METHODS:
        rows = []
        for index in selected_indices:
            sample_id = str(cache["sample_ids"][index])
            image = cache["images"][index].astype(np.float32) / 255.0
            truth = cache["labels"][index]
            offline = METHODS[method_name](image)
            browser = np.asarray(
                live_by_sample[sample_id][method_name],
                dtype=np.int32,
            ).reshape(truth.shape)
            browser_vs_truth = full_instance_metrics(browser, truth)
            offline_vs_truth = full_instance_metrics(offline, truth)
            browser_vs_offline = full_instance_metrics(browser, offline)
            rows.append({
                "sample_id": sample_id,
                "condition_id": str(cache["conditions"][index]),
                "browser_ap": browser_vs_truth["ap"],
                "offline_ap": offline_vs_truth["ap"],
                "ap_delta": browser_vs_truth["ap"] - offline_vs_truth["ap"],
                "browser_vs_offline_ap": browser_vs_offline["ap"],
                "browser_vs_offline_boundary_fscore": browser_vs_offline[
                    "boundary_fscore"
                ],
                "browser_count": browser_vs_truth["nPred"],
                "offline_count": offline_vs_truth["nPred"],
            })
        mean_abs_ap_delta = float(np.mean([abs(row["ap_delta"]) for row in rows]))
        mean_output_ap = float(np.mean([
            row["browser_vs_offline_ap"] for row in rows
        ]))
        mean_boundary_fscore = float(np.mean([
            row["browser_vs_offline_boundary_fscore"] for row in rows
        ]))
        mean_browser_count = float(np.mean([row["browser_count"] for row in rows]))
        mean_offline_count = float(np.mean([row["offline_count"] for row in rows]))
        count_ratio = mean_browser_count / mean_offline_count
        checks = {
            "mean_absolute_ap_delta": (
                mean_abs_ap_delta <= ACCEPTANCE["max_mean_absolute_ap_delta"]
            ),
            "browser_vs_offline_ap": (
                mean_output_ap >= ACCEPTANCE["min_mean_browser_vs_offline_ap"]
            ),
            "browser_vs_offline_boundary_fscore": (
                mean_boundary_fscore
                >= ACCEPTANCE["min_mean_browser_vs_offline_boundary_fscore"]
            ),
            "instance_count_ratio": (
                ACCEPTANCE["min_mean_instance_count_ratio"]
                <= count_ratio
                <= ACCEPTANCE["max_mean_instance_count_ratio"]
            ),
        }
        methods.append({
            "method": method_name,
            "n_conditions": len(rows),
            "mean_browser_ap": float(np.mean([row["browser_ap"] for row in rows])),
            "mean_offline_ap": float(np.mean([row["offline_ap"] for row in rows])),
            "mean_absolute_ap_delta": mean_abs_ap_delta,
            "mean_browser_vs_offline_ap": mean_output_ap,
            "mean_browser_vs_offline_boundary_fscore": mean_boundary_fscore,
            "mean_browser_instance_count": mean_browser_count,
            "mean_offline_instance_count": mean_offline_count,
            "mean_instance_count_ratio": count_ratio,
            "checks": checks,
            "accepted": all(checks.values()),
            "cases": rows,
        })
    # Hash EVERY source the twin transitively depends on, not just its entry point.
    # methods.ts only wires the methods together: the algorithms themselves (h-maxima, the EDT,
    # peak_local_max, the watershed flood, the morphology) live in gray.ts and watershed.ts. While
    # only methods.ts was hashed, the completeness gate declared this report fresh after a change to
    # the code that actually computes the numbers it certifies.
    browser_sources = [
        ROOT / "frontend/src/classical/methods.ts",
        ROOT / "frontend/src/classical/gray.ts",
        ROOT / "frontend/src/classical/watershed.ts",
    ]
    offline_module = ROOT / "data-pipeline/fslab/science/segment.py"
    implementations = {
        f"browser:{path.name}": {
            "path": path.relative_to(ROOT).as_posix(),
            "sha256": sha256(path),
        }
        for path in browser_sources
    }
    implementations["offline"] = {
        "path": offline_module.relative_to(ROOT).as_posix(),
        "sha256": sha256(offline_module),
    }
    return {
        "schema": "frothseg.classical-live-parity/v1",
        "dataset": "frothseg.learned-dataset/v2",
        "selection": "first untouched-test sample from each of 16 conditions",
        "acceptance": ACCEPTANCE,
        "implementations": implementations,
        "accepted_methods": [
            row["method"] for row in methods if row["accepted"]
        ],
        "complete": all(row["accepted"] for row in methods),
        "methods": methods,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--cache",
        type=Path,
        default=ROOT / "data/cache/learned-v2-192.npz",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "verification/classical-live-parity.json",
    )
    args = parser.parse_args()
    report = build(args.cache)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({
        row["method"]: {
            "mean_browser_ap": row["mean_browser_ap"],
            "mean_offline_ap": row["mean_offline_ap"],
            "mean_absolute_ap_delta": row["mean_absolute_ap_delta"],
            "mean_browser_vs_offline_ap": row["mean_browser_vs_offline_ap"],
            "mean_browser_vs_offline_boundary_fscore": row[
                "mean_browser_vs_offline_boundary_fscore"
            ],
            "mean_instance_count_ratio": row["mean_instance_count_ratio"],
            "accepted": row["accepted"],
        }
        for row in report["methods"]
    }, indent=2))


if __name__ == "__main__":
    main()
