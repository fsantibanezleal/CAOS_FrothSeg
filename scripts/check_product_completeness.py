"""Validate product-depth evidence without confusing plans with implementations."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.model_registry import METHODS, validate_registry  # noqa: E402


def check_development() -> list[str]:
    errors = validate_registry()
    required = {
        "data-pipeline/fslab/datasets.py",
        "data-pipeline/fslab/pipeline.py",
        "scripts/check_artifacts.py",
        "tests/test_dataset_splits.py",
        "docs/README.md",
    }
    for rel in required:
        if not (ROOT / rel).exists():
            errors.append(f"missing required product file: {rel}")
    return errors


def check_release() -> list[str]:
    errors = check_development()
    for method in METHODS:
        if method.state != "accepted":
            errors.append(f"{method.id}/{method.slug}: state={method.state}, expected accepted")
            continue
        if not (ROOT / method.docs_path).exists():
            errors.append(f"{method.id}: missing docs {method.docs_path}")
    report_path = ROOT / "data" / "derived" / "release-report.json"
    if not report_path.exists():
        errors.append("missing data/derived/release-report.json")
    else:
        report = json.loads(report_path.read_text(encoding="utf-8"))
        if report.get("schema") != "frothseg.release/v1":
            errors.append("release report schema mismatch")
        if report.get("complete") is not True:
            errors.append("release report is not complete")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("development", "release"), default="development")
    args = parser.parse_args()
    errors = check_release() if args.profile == "release" else check_development()
    if errors:
        print(f"PRODUCT COMPLETENESS {args.profile.upper()}: FAIL")
        for error in errors:
            print(f"  - {error}")
        return 1
    print(f"PRODUCT COMPLETENESS {args.profile.upper()}: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
