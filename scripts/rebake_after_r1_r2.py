"""Rebake every artifact that R-1 and R-2 invalidated, in dependency order.

R-2 changed `C3_H_MAXIMA` from 0.06 to 0.12 in the engine and in the browser twin, so every
artifact carrying a C3 number is stale: the classical held-out scores, the live-parity report, the
temporal reports, the showcase, and the benchmark that reads all of them.

Order matters and is not alphabetical:

  1. classical held-out      C3's scores come from here and everything downstream reads them
  2. post-adoption recheck   its verdicts were measured against h=0.06 and now describe an engine
                             that no longer ships; re-running it makes it describe what shipped
  3. live parity             the browser twin moved too, so the cross-language gate must re-accept
  4. temporal                per-method sequence reports include C3
  5. showcase                the App's baked scenes include C3 overlays
  6. inference timing        LAST of the measurements and ALONE, because it is the only step whose
                             output depends on what else the machine is doing
  7. method benchmark        reads 1 and 6, computes the Pareto frontier
  8. release report          reads 7

Step 6 is the reason this script exists as a script rather than a checklist. Every other step is
CPU-bound and can overlap with anything; step 6 cannot overlap with ANY of them without measuring
them instead of the methods. `--skip-timing` runs the rest so the timing pass can be scheduled for
a quiet machine.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PYTHON = sys.executable


def step(name: str, command: list[str], *, cwd: Path = ROOT) -> dict:
    print(f"\n{'=' * 78}\n=== {name}\n=== {' '.join(command)}\n{'=' * 78}", flush=True)
    started = time.perf_counter()
    result = subprocess.run(command, cwd=cwd)
    duration = time.perf_counter() - started
    status = "ok" if result.returncode == 0 else f"FAILED rc={result.returncode}"
    print(f"--- {name}: {status} in {duration:.1f}s", flush=True)
    return {"name": name, "returncode": result.returncode, "seconds": round(duration, 1)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--skip-timing",
        action="store_true",
        help="skip the inference-timing pass, which needs a quiet machine",
    )
    parser.add_argument(
        "--only-timing",
        action="store_true",
        help="run ONLY the inference-timing pass and the two rebuilds that consume it",
    )
    parser.add_argument("--timing-repeats", type=int, default=5)
    parser.add_argument("--device", default="cuda")
    args = parser.parse_args()

    measurements = [
        # The canonical per-case bakes come FIRST. build_method_benchmark globs
        # data/derived/synth/<case>/benchmark.json into every row's `canonical` block, so leaving
        # them stale would put an h=0.12 `test` block and an h=0.06 `canonical` block in the same
        # C3 row of the same artifact.
        (
            "canonical per-case bakes (feed every row's canonical block)",
            [PYTHON, "-m", "fslab.pipeline", "all"],
        ),
        (
            "classical held-out (C3 depth changed)",
            [PYTHON, "scripts/benchmark_classical_heldout.py", "--repeats", "5"],
        ),
        (
            "post-adoption constant recheck (engine changed under it)",
            [PYTHON, "scripts/phase1b_postadoption_sweeps.py"],
        ),
        (
            "classical constant ledger (publishes watershed_hmax.h)",
            [PYTHON, "scripts/phase1_constant_ledger.py"],
        ),
        (
            "classical live parity (browser twin changed)",
            [PYTHON, "scripts/validate_classical_live_parity.py"],
        ),
        # Both sides of the domain-transfer subtraction must move together. Re-running only the
        # synthetic side turns C3's measured -0.092 transfer delta into a fabricated -0.170.
        (
            "real-adjacent benchmark (the other side of the transfer delta)",
            [PYTHON, "scripts/benchmark_real_adjacent.py"],
        ),
        # Its floor column is the best classical method per case, and C3 can now BE that floor.
        ("SAM benchmark (classical floor column)", [PYTHON, "scripts/bake_sam_benchmark.py"]),
        (
            "temporal reports",
            [PYTHON, "scripts/bake_temporal_all.py", "--output-root", "data/derived/temporal"],
        ),
        ("showcase artifacts", [PYTHON, "scripts/bake_showcase_artifacts.py"]),
    ]
    timing = [(
        "inference timing (MUST run alone)",
        [
            PYTHON, "scripts/measure_inference_timing.py",
            "--repeats", str(args.timing_repeats), "--device", args.device,
        ],
    )]
    rebuilds = [
        ("method benchmark + Pareto frontier", [PYTHON, "scripts/build_method_benchmark.py"]),
        ("release report", [PYTHON, "scripts/build_release_report.py"]),
    ]
    checks = [
        ("check artifacts", [PYTHON, "scripts/check_artifacts.py"]),
        (
            "check product completeness",
            [PYTHON, "scripts/check_product_completeness.py", "--profile", "development"],
        ),
        ("check content standards", [PYTHON, "scripts/check_content_standards.py"]),
    ]

    if args.only_timing:
        plan = timing + rebuilds + checks
    elif args.skip_timing:
        plan = measurements + rebuilds + checks
    else:
        plan = measurements + timing + rebuilds + checks

    # Fail fast. Every step after a failed one reads what the failed one was supposed to produce,
    # so continuing past a failure builds a benchmark from a mix of engines and reports "1 step
    # failed" at the end as if the rest were fine. The timing step in particular exits non-zero
    # precisely when its measurement must not be consumed.
    results = []
    for name, command in plan:
        row = step(name, command)
        results.append(row)
        if row["returncode"] != 0:
            print(
                f"\nSTOPPING: '{name}' failed. Every later step reads what it produces, so "
                "continuing would build the benchmark from a mix of engines.",
                flush=True,
            )
            break
    failed = [row for row in results if row["returncode"] != 0]

    print("\n" + "=" * 78)
    for row in results:
        mark = "ok  " if row["returncode"] == 0 else "FAIL"
        print(f"  {mark} {row['seconds']:>8.1f}s  {row['name']}")
    if failed:
        print(f"\n{len(failed)} step(s) failed: {[row['name'] for row in failed]}")
        raise SystemExit(1)
    print("\nall steps ok")


if __name__ == "__main__":
    main()
