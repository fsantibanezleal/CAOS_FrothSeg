"""Rebake every artifact that R-1 and R-2 invalidated, in dependency order.

R-2 changed `C3_H_MAXIMA` from 0.06 to 0.12 in the engine and in the browser twin, so every
artifact carrying a C3 number is stale: the classical held-out scores, the live-parity report, the
temporal reports, the showcase, and the benchmark that reads all of them.

Order matters and is not alphabetical:

   1. canonical per-case bakes  feed every benchmark row's `canonical` block; stale ones would put
                                an h=0.12 `test` block beside an h=0.06 `canonical` block in the
                                same C3 row
   2. classical held-out        C3's scores come from here and everything downstream reads them
   3. post-adoption recheck     its verdicts were measured against h=0.06 and now describe an
                                engine that no longer ships
   4. classical constant ledger publishes watershed_hmax.h and its adoption status
   5. live parity               the browser twin moved too, so the cross-language gate must
                                re-accept
   6. real-adjacent benchmark   the OTHER side of the domain-transfer subtraction; re-running only
                                the synthetic side turns C3's measured -0.092 delta into a
                                fabricated -0.170 while every step still reports ok
   7. SAM benchmark             its floor column is the best classical method per case, and C3 can
                                now BE that floor
   8. temporal                  per-method sequence reports include C3, and instance count drives
                                identity association
   9. showcase                  the App's baked scenes include C3 overlays
  10. inference timing          LAST of the measurements and ALONE, because it is the only step
                                whose output depends on what else the machine is doing
  11. method benchmark          reads 1, 2 and 10, computes the Pareto frontier
  12. release report            reads 11

Step 10 is the reason this is a script rather than a checklist. Every other step is CPU-bound and
can overlap with anything; step 10 cannot overlap with ANY of them without measuring them instead
of the methods. `--skip-timing` runs the rest so the timing pass can be scheduled for a quiet
machine, and `--only-timing` runs it plus the two rebuilds that consume it.

The run stops at the first failure. Every later step reads what an earlier one produces, so
continuing past a failure builds the benchmark from a mix of engines and then reports "1 step
failed" as if the rest were sound.
"""

from __future__ import annotations

import argparse
import hashlib
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PYTHON = sys.executable

# The adjacent-domain raw archive lives outside the repo. Its extraction is verified against
# data/derived/real-adjacent-dataset-manifest.json:archive_sha256 before it is used.
BBBC038_RAW = Path("E:/_Temp/bbbc038/extracted")
BBBC038_ARCHIVE = Path("E:/_Temp/bbbc038/stage1_train.zip")
BBBC038_SHA256 = "dcb6edc2690f137406638b2309581a71522c4dff19157d118453b448dcddcb68"


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

    # Check the adjacent-domain archive before running anything. Discovering it is missing after
    # the synthetic side has already been re-measured would leave the two halves of the transfer
    # delta on different engines, which is the specific failure this step exists to avoid.
    if not args.only_timing:
        if not BBBC038_RAW.is_dir():
            raise SystemExit(
                f"{BBBC038_RAW} is missing. The real-adjacent benchmark is the OTHER side of the "
                "domain-transfer subtraction; skipping it would leave C3's transfer delta computed "
                "across two different engines. Re-extract the archive before rebaking."
            )
        digest = hashlib.sha256()
        with BBBC038_ARCHIVE.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1 << 20), b""):
                digest.update(chunk)
        if digest.hexdigest() != BBBC038_SHA256:
            raise SystemExit(
                f"{BBBC038_ARCHIVE} sha256 {digest.hexdigest()} does not match the manifest "
                f"{BBBC038_SHA256}; refusing to re-measure against different bytes"
            )
        print(f"adjacent-domain archive verified against the manifest sha256", flush=True)

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
        # The raw BBBC038 archive is not in the repo (data/raw is empty by design). The local
        # extraction under E:/_Temp verifies against the sha256 in
        # data/derived/real-adjacent-dataset-manifest.json, so this re-measurement is against the
        # same bytes the committed artifact was built from and not a fresh download that might
        # differ.
        (
            "real-adjacent benchmark (the other side of the transfer delta)",
            [
                PYTHON, "scripts/benchmark_real_adjacent.py",
                "--raw-root", str(BBBC038_RAW), "--device", args.device,
            ],
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
