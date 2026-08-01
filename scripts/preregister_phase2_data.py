"""Phase 2 of the 2026-07-31 plan proposal: the data step, pre-registered.

Section 4 of `CAOS_MANAGE plans/frothseg/research-2026-07-31/PLAN-PROPOSAL.md` asks for three
things, and this script performs all three and records them in one file:

1. Explicit synthetic reserve groups, at least one slice per planned study (P-1 to P-5), never
   looked at. Built by `scripts/build_reserve_cache.py`; this script reads only that archive's
   index arrays (ids, group ids, split names, study names) and never its pixels or labels.
2. A fresh real-adjacent draw from the BBBC038/DSB2018 pool, disjoint from the 64 samples
   observed on 2026-07-28, pre-registered before inspection.
3. Both assignments recorded with their sha256, so "which surface did this number come from" is
   answerable from this file alone.

What this script deliberately does NOT do: train anything, evaluate anything, or compute any
content statistic of the fresh real split. The only pixel-level quantity it reads from the real
pool is the (height, width, coarse mean intensity) group key, which is the committed leakage
guard from `scripts/ingest_bbbc038.py` and is required to draw whole groups at all. Instance
counts, mask statistics and per-sample metrics are not computed for the fresh members.

    .venv-gpu/Scripts/python.exe scripts/preregister_phase2_data.py \
        --pool-root E:/_Temp/bbbc038/extracted \
        --archive E:/_Temp/bbbc038/stage1_train.zip
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.datasets import (  # noqa: E402
    RESERVE_GROUPS_PER_CONDITION,
    RESERVE_SEED_BASE,
    RESERVE_STUDIES,
    learned_dataset_matrix,
    reserve_dataset_matrix,
    validate_learned_matrix,
    validate_reserve_matrix,
)

#: Fresh, and distinct from the 20260728 seed that produced the now-burned real test draw.
FRESH_SPLIT_SEED = 20260801
#: Matches the burned draw's size so the two are read on the same footing.
FRESH_SPLIT_TARGET = 64
#: Drawn in this order, whole groups only. Fixed before the draw was executed.
FRESH_SPLIT_ORDER: tuple[str, ...] = ("fresh-calibration", "fresh-test")

DATE = "2026-08-01"


def _sha256_ids(ids: list[str]) -> str:
    """Canonical hash of an id set: sorted, newline joined, trailing newline, utf-8."""
    payload = "\n".join(sorted(ids)) + "\n"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _group_key(image: np.ndarray) -> str:
    """Byte-for-byte the grouping rule committed in scripts/ingest_bbbc038.py."""
    height, width = image.shape
    brightness = int(round(float(image.mean()) * 10))
    return f"{height}x{width}-b{brightness}"


def _read_image(sample_dir: Path) -> np.ndarray:
    image_files = sorted((sample_dir / "images").glob("*.png"))
    if not image_files:
        raise FileNotFoundError(f"{sample_dir}: no image")
    with Image.open(image_files[0]) as handle:
        return np.asarray(handle.convert("L"), dtype=np.float32) / 255.0


def _regeneration_evidence() -> dict:
    """Load the proof that the Phase 2 refactor left the frozen working matrix untouched."""
    path = ROOT / "verification/phase2-working-cache-regeneration.json"
    if not path.exists():
        raise FileNotFoundError(f"missing regeneration evidence: {path}")
    evidence = json.loads(path.read_text(encoding="utf-8"))
    return {
        "evidence_path": "verification/phase2-working-cache-regeneration.json",
        "verdict": evidence["verdict"],
        "archive_bytes_identical": evidence["archive_bytes_identical"],
        "rebuilt_sha256": evidence["rebuilt_sha256"],
        "samples_regenerated": evidence["samples"],
    }


def synthetic_section(reserve_cache: Path) -> dict:
    """Record the working matrix, the reserve matrix, and their disjointness."""
    working = learned_dataset_matrix()
    reserve = reserve_dataset_matrix()
    working_errors = validate_learned_matrix(working)
    reserve_errors = validate_reserve_matrix(reserve, working)
    if working_errors or reserve_errors:
        raise ValueError(
            "invalid synthetic matrices: " + "; ".join(working_errors + reserve_errors)
        )

    working_groups: dict[str, set[str]] = defaultdict(set)
    working_samples: dict[str, int] = defaultdict(int)
    for sample in working:
        working_groups[sample.split].add(sample.record.group_id)
        working_samples[sample.split] += 1

    per_study: dict[str, dict] = {}
    for study in RESERVE_STUDIES:
        rows = [row for row in reserve if row.reserve_study == study]
        group_ids = sorted({row.record.group_id for row in rows})
        sample_ids = sorted(row.record.sample_id for row in rows)
        per_study[study] = {
            "plan_section": f"PLAN-PROPOSAL.md section 5, {study.upper()}",
            "group_count": len(group_ids),
            "sample_count": len(sample_ids),
            "condition_count": len({row.condition_id for row in rows}),
            "geometry_seed_min": min(row.spec.seed for row in rows),
            "geometry_seed_max": max(row.spec.seed for row in rows),
            "group_ids": group_ids,
            "group_ids_sha256": _sha256_ids(group_ids),
            "sample_ids_sha256": _sha256_ids(sample_ids),
        }

    reserve_report_path = reserve_cache.with_suffix(".json")
    if not reserve_cache.exists() or not reserve_report_path.exists():
        raise FileNotFoundError(
            f"reserve cache missing: run scripts/build_reserve_cache.py --output {reserve_cache}"
        )
    reserve_report = json.loads(reserve_report_path.read_text(encoding="utf-8"))
    actual_sha = _sha256_file(reserve_cache)
    if actual_sha != reserve_report["sha256"]:
        raise ValueError("reserve cache checksum mismatch against its own report")

    # Index arrays only. The reserve archive's images and labels are never read here.
    archive = np.load(reserve_cache)
    archived_groups = sorted({str(value) for value in archive["group_ids"]})
    archived_samples = sorted(str(value) for value in archive["sample_ids"])
    if archived_groups != sorted({row.record.group_id for row in reserve}):
        raise ValueError("reserve archive group ids disagree with the reserve matrix")
    if set(str(value) for value in archive["splits"]) != {"reserve"}:
        raise ValueError("reserve archive contains a non-reserve split")

    working_cache = ROOT / "data/cache/learned-v2-192.npz"
    working_report = json.loads(
        working_cache.with_suffix(".json").read_text(encoding="utf-8")
    )

    return {
        "generator": "fslab.science.froth_gen (deterministic, in-repo)",
        "image_size": 192,
        "appearance_variants_per_latent": 2,
        "condition_count": 16,
        "working_matrix": {
            "note": (
                "Frozen on purpose. Every published learned-model number was selected on this "
                "matrix and the P-1 ensemble-spread study reads its train split, so Phase 2 "
                "enlarges the dataset by adding reserve groups rather than by moving the "
                "surface the existing numbers stand on."
            ),
            "cache_path": "data/cache/learned-v2-192.npz",
            "cache_sha256": _sha256_file(working_cache),
            "cache_sha256_matches_committed_report": (
                _sha256_file(working_cache) == working_report["sha256"]
            ),
            "regeneration_check": _regeneration_evidence(),
            "sample_count": len(working),
            "group_count": len({row.record.group_id for row in working}),
            "groups_by_split": {
                split: len(working_groups[split])
                for split in ("train", "validation", "calibration", "test")
            },
            "samples_by_split": {
                split: working_samples[split]
                for split in ("train", "validation", "calibration", "test")
            },
        },
        "reserve_matrix": {
            "cache_path": str(reserve_cache.relative_to(ROOT)).replace("\\", "/"),
            "cache_sha256": actual_sha,
            "cache_bytes": reserve_cache.stat().st_size,
            "studies": list(RESERVE_STUDIES),
            "study_count": len(RESERVE_STUDIES),
            "planned_study_count": 5,
            "groups_per_condition_per_study": RESERVE_GROUPS_PER_CONDITION,
            "group_count": len(archived_groups),
            "sample_count": len(archived_samples),
            "geometry_seed_base": RESERVE_SEED_BASE,
            "all_group_ids_sha256": _sha256_ids(archived_groups),
            "all_sample_ids_sha256": _sha256_ids(archived_samples),
            "per_study": per_study,
            "observation_status": (
                "Written and hashed, never evaluated. No script in this repository reads this "
                "archive's images or labels. A study spends only the slice named after it, "
                "once, and records that it did."
            ),
        },
        "disjointness_checks": {
            "sample_id_overlap": 0,
            "group_id_overlap": 0,
            "geometry_seed_overlap": 0,
            "checked_by": (
                "fslab.datasets.validate_reserve_matrix, which compares sample id, group id AND "
                "geometry seed. An id-only check would pass a reserve that re-renders an "
                "observed scene under a new name."
            ),
        },
    }


def real_section(pool_root: Path, archive: Path) -> dict:
    """Draw and pre-register the fresh real-adjacent split from the BBBC038 pool."""
    manifest_path = ROOT / "data/derived/real-adjacent-dataset-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    archive_sha = _sha256_file(archive)
    if archive_sha != manifest["archive_sha256"]:
        raise ValueError(
            "pool archive sha256 does not match the committed manifest; this is a different "
            f"download ({archive_sha} vs {manifest['archive_sha256']})"
        )

    sample_dirs = sorted(
        d for d in pool_root.iterdir()
        if d.is_dir() and (d / "masks").is_dir() and (d / "images").is_dir()
    )
    if len(sample_dirs) != manifest["sample_count"]:
        raise ValueError(
            f"pool has {len(sample_dirs)} samples, manifest recorded "
            f"{manifest['sample_count']}"
        )

    by_group: dict[str, list[str]] = defaultdict(list)
    group_of: dict[str, str] = {}
    for sample_dir in sample_dirs:
        key = _group_key(_read_image(sample_dir))
        by_group[key].append(sample_dir.name)
        group_of[sample_dir.name] = key

    # Reproduce the committed grouping exactly, or the disjointness argument is worthless.
    observed_rows = manifest["test_samples"]
    mismatches = [
        row["sample_id"] for row in observed_rows
        if group_of.get(row["sample_id"]) != row["group_id"]
    ]
    if mismatches:
        raise ValueError(f"group key does not reproduce for {len(mismatches)} observed samples")
    if len(by_group) != manifest["grouping"]["group_count"]:
        raise ValueError(
            f"recomputed {len(by_group)} groups, manifest recorded "
            f"{manifest['grouping']['group_count']}"
        )

    # The 2026-07-28 draw truncated its second group at 64 samples, so that group is only
    # PARTIALLY burned: the members left behind are near-duplicate fields of view of observed
    # images. Excluding the whole group, not merely the 64 observed ids, is what makes the
    # fresh draw actually disjoint.
    observed_ids = sorted({row["sample_id"] for row in observed_rows})
    burned_groups = sorted({row["group_id"] for row in observed_rows})
    partially_burned = sorted(
        group for group in burned_groups
        if len([i for i in by_group[group] if i in set(observed_ids)]) < len(by_group[group])
    )

    eligible = sorted(group for group in by_group if group not in set(burned_groups))
    rng = np.random.default_rng(FRESH_SPLIT_SEED)
    order = list(eligible)
    rng.shuffle(order)

    assignments: dict[str, dict] = {}
    cursor = 0
    for split_name in FRESH_SPLIT_ORDER:
        groups: list[str] = []
        members: list[str] = []
        while cursor < len(order) and len(members) < FRESH_SPLIT_TARGET:
            group = order[cursor]
            cursor += 1
            groups.append(group)
            members.extend(by_group[group])
        if len(members) < FRESH_SPLIT_TARGET:
            raise ValueError(f"{split_name}: pool exhausted at {len(members)} samples")
        assignments[split_name] = {
            "group_ids": sorted(groups),
            "group_count": len(groups),
            "sample_count": len(members),
            "group_sizes": {group: len(by_group[group]) for group in sorted(groups)},
            "sample_ids": sorted(members),
            "group_ids_sha256": _sha256_ids(groups),
            "sample_ids_sha256": _sha256_ids(members),
        }

    remaining_groups = sorted(order[cursor:])
    drawn = {
        member
        for split in assignments.values()
        for member in split["sample_ids"]
    }
    if drawn & set(observed_ids):
        raise ValueError("fresh draw intersects the observed 64")
    drawn_groups = [group for split in assignments.values() for group in split["group_ids"]]
    if len(drawn_groups) != len(set(drawn_groups)):
        raise ValueError("a group was drawn into more than one fresh split")

    # Reported, not repaired. The fill rule was fixed before the draw ran and a pre-registered
    # design may not be adjusted once its output is visible, so the composition defect below is
    # recorded for the studies that will consume the split rather than tuned away here.
    limitations: list[dict] = []
    for split_name, split in assignments.items():
        if split["group_count"] < 3:
            limitations.append({
                "split": split_name,
                "issue": "single-group draw" if split["group_count"] == 1 else "two-group draw",
                "detail": (
                    f"{split_name} landed on {split['group_count']} whole group(s) "
                    f"({', '.join(split['group_ids'])}) carrying {split['sample_count']} "
                    "samples, because whole-group filling overshoots when the first group "
                    "drawn is large. BBBC038 groups are size and brightness regimes, so this "
                    "split covers few imaging modalities."
                ),
                "consequence": (
                    "For split conformal this is a live exchangeability risk: calibrating on "
                    "one modality and testing on several is a distribution shift, and the "
                    "marginal coverage guarantee does not survive it. P-3 must decide BEFORE "
                    "it runs whether to accept this draw, or to use the conditional or Mondrian "
                    "scheme its own design already names as the fallback."
                ),
                "not_repaired_because": (
                    "The fill rule and the seed were fixed before the draw executed. Redrawing "
                    "until the composition looks better is selection on the split, which is the "
                    "defect Phase 2 exists to remove."
                ),
            })

    return {
        "source_id": manifest["source_id"],
        "domain": manifest["domain"],
        "license": manifest["license"],
        "source_url": manifest["source_url"],
        "archive_sha256": archive_sha,
        "archive_sha256_matches_manifest": True,
        "pool_sample_count": len(sample_dirs),
        "pool_group_count": len(by_group),
        "grouping": {
            "method": manifest["grouping"]["method"],
            "reproduced_from": "scripts/ingest_bbbc038.py::_group_key",
            "observed_group_ids_reproduced": len(observed_rows),
            "note": manifest["grouping"]["note"],
        },
        "burned_surface": {
            "draw_date": "2026-07-28",
            "split_seed": manifest["split_seed"],
            "observed_sample_count": len(observed_ids),
            "observed_sample_ids_sha256": _sha256_ids(observed_ids),
            "burned_group_ids": burned_groups,
            "partially_burned_group_ids": partially_burned,
            "exclusion_rule": (
                "Whole burned groups are excluded, not merely the 64 observed ids. The "
                "2026-07-28 draw truncated its second group at 64 samples, so that group's "
                "remaining members are near-duplicate fields of view of observed images."
            ),
            "excluded_sample_count": sum(len(by_group[g]) for g in burned_groups),
        },
        "fresh_draw": {
            "split_seed": FRESH_SPLIT_SEED,
            "target_samples_per_split": FRESH_SPLIT_TARGET,
            "draw_order": list(FRESH_SPLIT_ORDER),
            "procedure": (
                "Exclude the burned groups, sort the remaining group ids, shuffle with "
                "numpy.random.default_rng(20260801), then fill each split in the pre-registered "
                "order with WHOLE groups until it reaches at least 64 samples. No truncation: "
                "the 2026-07-28 draw truncated and left a partially burned group behind, which "
                "is the defect this rule removes."
            ),
            "eligible_group_count": len(eligible),
            "splits": assignments,
            "unallocated_group_ids": remaining_groups,
            "unallocated_group_count": len(remaining_groups),
            "known_limitations": limitations,
        },
        "inspection_status": (
            "Pre-registered before inspection. The only pixel-level quantity read from the "
            "fresh members is the committed (height, width, coarse mean intensity) group key, "
            "which is required to draw whole groups. No instance count, mask statistic, model "
            "prediction or metric was computed on any fresh member."
        ),
        "intended_use": {
            "fresh-calibration": (
                "P-3 conformal calibration. The existing calibration split was already used to "
                "fit post-processing by a 405-combination grid search (train_multitask.py:140-177), "
                "so reusing it would break exchangeability and produce an invalid guarantee."
            ),
            "fresh-test": (
                "One real-split test evaluation per study that pre-registers one, starting with "
                "P-2's single real-split evaluation. Unspent as of this file."
            ),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pool-root", type=Path, default=ROOT / "data/raw/bbbc038-dsb2018")
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument(
        "--reserve-cache",
        type=Path,
        default=ROOT / "data/cache/learned-v2-192-reserve.npz",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "verification/phase2-data-preregistration.json",
    )
    args = parser.parse_args()

    document = {
        "experiment": "phase2-data-step",
        "preregistration": (
            "CAOS_MANAGE plans/frothseg/research-2026-07-31/PLAN-PROPOSAL.md section 4"
        ),
        "date": DATE,
        "purpose": (
            "Phase 3 and Phase 4 would otherwise select on surfaces that are already observed: "
            "reserve_groups was 0, three synthetic test evaluations are spent, the real-adjacent "
            "split was observed on 2026-07-28, and the calibration split was already used to fit "
            "post-processing. This file creates and hashes the clean surfaces those studies need."
        ),
        "produced_by": "scripts/preregister_phase2_data.py",
        "trained": "nothing",
        "evaluated": "nothing",
        "test_evaluations_spent": 0,
        "hash_canonicalization": (
            "sha256 over the utf-8 bytes of the sorted id list joined by newlines with a "
            "trailing newline; file hashes are sha256 over the raw file bytes."
        ),
        "synthetic": synthetic_section(args.reserve_cache),
        "real_adjacent": real_section(args.pool_root, args.archive),
    }
    document["budget"] = {
        "reserve_slices_available": len(RESERVE_STUDIES),
        "reserve_slices_spent": 0,
        "fresh_real_test_evaluations_available": 1,
        "fresh_real_test_evaluations_spent": 0,
        "rule": (
            "A pre-registered design may not be adjusted after seeing a result. A study spends "
            "the reserve slice named after it, at most once, and records the spend here."
        ),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(document, indent=2) + "\n")

    print(json.dumps({
        "output": str(args.output.relative_to(ROOT)).replace("\\", "/"),
        "reserve_groups": document["synthetic"]["reserve_matrix"]["group_count"],
        "reserve_samples": document["synthetic"]["reserve_matrix"]["sample_count"],
        "reserve_studies": document["synthetic"]["reserve_matrix"]["studies"],
        "fresh_calibration_samples": (
            document["real_adjacent"]["fresh_draw"]["splits"]["fresh-calibration"]["sample_count"]
        ),
        "fresh_test_samples": (
            document["real_adjacent"]["fresh_draw"]["splits"]["fresh-test"]["sample_count"]
        ),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
