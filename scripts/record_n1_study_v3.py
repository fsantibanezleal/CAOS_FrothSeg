"""Append study v3 to the pre-registered N1 ablation record.

Adds the study, its seven validation results, the finalist gate, and the single test
evaluation that was spent on the winner.

It deliberately does NOT touch the top-level `selection`, `untouched_test` or `comparison`
blocks. Those describe the checkpoint actually published as N1 (`models/lamellastar-v1`,
the e80 single model). The v3 winner is a three-member ensemble that has not been promoted,
so rewriting those blocks would make the record describe a model the repository does not ship.
Promotion is a separate, deliberate step.

    python scripts/record_n1_study_v3.py --work-root E:/_Temp/n1-v3
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "verification/n1-preregistered-ablation.json"

PREREGISTRATION = (
    "CAOS_MANAGE wip/frothseg/n1-study-v3-preregistration-2026-07-27.md, "
    "committed before any run"
)

TRAINING_RUNS = (
    ("c24-e120-s20260727", {"base_channels": 24, "epochs": 120, "seed": 20260727}),
    ("c24-e160-s20260727", {"base_channels": 24, "epochs": 160, "seed": 20260727}),
    ("c24-e120-s20260725", {"base_channels": 24, "epochs": 120, "seed": 20260725}),
    ("c24-e120-s20260726", {"base_channels": 24, "epochs": 120, "seed": 20260726}),
    ("c32-e120-s20260727", {"base_channels": 32, "epochs": 120, "seed": 20260727}),
)

ENSEMBLES = (
    ("ensemble-logitmean-e120-seeds-25-26-27", {"mode": "logit-mean", "tta": "none"}),
    ("ensemble-logitmean-tta-d4-e120-seeds-25-26-27", {"mode": "logit-mean", "tta": "d4"}),
)

MEMBERS = ("c24-e120-s20260725", "c24-e120-s20260726", "c24-e120-s20260727")
WINNER = "ensemble-logitmean-e120-seeds-25-26-27"
REFERENCE = "REF-c24-e80-s20260727"
V2_WINNER_VALIDATION = 0.49982812500000007


def _evaluation(path: Path) -> dict:
    return json.loads((path / "run.json").read_text(encoding="utf-8"))["evaluation"]


def _by_condition(evaluation: dict) -> dict[str, float]:
    return {
        key: (value.get("mean_ap") if isinstance(value, dict) else value)
        for key, value in evaluation["robustness_by_condition"].items()
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--work-root", type=Path, required=True)
    args = parser.parse_args()
    work = args.work_root.resolve()

    results = []
    for run_id, config in TRAINING_RUNS:
        results.append({
            "id": run_id,
            "kind": "single",
            **config,
            "mean_ap": _evaluation(work / run_id)["mean_ap"],
        })
    for run_id, config in ENSEMBLES:
        results.append({
            "id": run_id,
            "kind": "ensemble",
            "members": list(MEMBERS),
            **config,
            "mean_ap": _evaluation(work / run_id)["mean_ap"],
        })
    results.sort(key=lambda row: -row["mean_ap"])

    winner_validation = _evaluation(work / WINNER)
    reference_validation = _evaluation(work / REFERENCE)
    winner_conditions = _by_condition(winner_validation)
    reference_conditions = _by_condition(reference_validation)
    degraded = sorted(
        (
            (name, round(reference_conditions[name] - winner_conditions[name], 5))
            for name in reference_conditions
            if reference_conditions[name] - winner_conditions.get(name, 0.0) > 0.03
        ),
        key=lambda row: -row[1],
    )
    worst_condition = min(winner_conditions.items(), key=lambda item: item[1])
    test = _evaluation(work / "FINAL-TEST-ensemble-logitmean-e120")

    evidence = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    leader = evidence["comparison"]["cellpose_sam_mean_ap"]
    published_n1 = evidence["untouched_test"]["mean_ap"]
    member_scores = [
        _evaluation(work / member)["mean_ap"] for member in MEMBERS
    ]
    seed_spread = round(max(member_scores) - min(member_scores), 5)

    study = {
        "id": "n1-long-schedule-and-ensemble-study-v3",
        "preregistration": PREREGISTRATION,
        "hypothesis": (
            "the gap to Cellpose-SAM is an under-training deficit that a longer schedule closes"
        ),
        "hypothesis_outcome": "refuted",
        "validation_results": results,
        "seed_variance": {
            "configuration": "c24-e120",
            "seeds": list(MEMBERS),
            "mean_aps": [round(value, 5) for value in member_scores],
            "spread": seed_spread,
            "mean": round(sum(member_scores) / len(member_scores), 5),
            "note": (
                "The seed spread exceeds the gap this study set out to close. Averaged over "
                "seeds, e120 is worth about 0.002 over e80, so the apparent monotone "
                "e24/e40/e80/e120 trend was one seed measured at each length. A single-seed "
                "comparison on this dataset cannot resolve a difference below about 0.03."
            ),
        },
        "selected": WINNER,
        "selection_rule": "highest validation mean_ap, no tiebreak, fixed before any run",
        "finalist_gate": {
            "minimum_validation_mean_ap_exclusive": V2_WINNER_VALIDATION,
            "observed_validation_mean_ap": winner_validation["mean_ap"],
            "minimum_worst_condition_mean_ap": 0.075,
            "observed_worst_condition_mean_ap": round(worst_condition[1], 5),
            "observed_worst_condition": worst_condition[0],
            "maximum_conditions_degraded_by_more_than_0_03": 4,
            "observed_conditions_degraded_by_more_than_0_03": len(degraded),
            "degraded_conditions": [
                {"condition_id": name, "delta": delta} for name, delta in degraded
            ],
            "reference_run": {
                "id": REFERENCE,
                "note": (
                    "The v2 winner retrained on the validation split to obtain the "
                    "per-condition reference, which no stored artifact carried. It "
                    "reproduced the published validation mean_ap exactly, which "
                    "independently confirms the training path is deterministic."
                ),
                "validation_mean_ap": reference_validation["mean_ap"],
                "published_record_mean_ap": V2_WINNER_VALIDATION,
            },
            "passed": (
                winner_validation["mean_ap"] > V2_WINNER_VALIDATION
                and worst_condition[1] >= 0.075
                and len(degraded) <= 4
            ),
        },
        "untouched_test": {
            "split": "test",
            "n": test["n"],
            "mean_ap": test["mean_ap"],
            "mean_ap50": test["mean_ap50"],
            "mean_pq": test["mean_pq"],
            "mean_boundary_fscore": test["mean_boundary_fscore"],
            "evaluation_index": 3,
            "note": "the third and only final test evaluation spent in this study",
        },
        "outcome": {
            "exceeds_measured_leader": bool(test["mean_ap"] > leader),
            "cellpose_sam_mean_ap": leader,
            "margin_over_leader": round(test["mean_ap"] - leader, 6),
            "published_n1_mean_ap": published_n1,
            "gain_over_published_n1": round(test["mean_ap"] - published_n1, 6),
            "wins_on": [
                "mean_ap", "mean_ap50", "mean_pq", "mean_boundary_fscore",
            ],
            "margin_versus_noise": {
                "single_model_seed_spread": seed_spread,
                "margin_over_leader": round(test["mean_ap"] - leader, 6),
                "note": (
                    "The margin over the leader is smaller than the single-model seed spread "
                    "measured in this same study. Ensembling suppresses that variance by "
                    "construction, but only one ensemble draw was evaluated, so "
                    "ensemble-to-ensemble stability is unmeasured. The result wins on four "
                    "metrics that are not perfectly correlated, which strengthens it, and it "
                    "remains a leaderboard result on one synthetic benchmark against a "
                    "generically pretrained Cellpose-SAM checkpoint."
                ),
            },
            "claim": (
                "On this controlled synthetic benchmark the three-seed LamellaStar ensemble "
                "exceeds Cellpose-SAM on mask AP, AP50, PQ and boundary F-score under a "
                "pre-registered protocol with one test evaluation. This is a benchmark "
                "result, not a state-of-the-art claim, and beyond_sota_claim stays false."
            ),
        },
        "publication_status": {
            "promoted": False,
            "published_n1_checkpoint": "models/lamellastar-v1 (c24-e80-s20260727, single model)",
            "note": (
                "The winner is a three-member ensemble and has not been promoted to the "
                "published N1. Promotion would change the product's headline result and "
                "requires republishing three checkpoints and rebaking the still and temporal "
                "evidence for N1. Recorded here as a measured result pending that decision."
            ),
        },
    }

    evidence["studies"].append(study)
    EVIDENCE.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "study": study["id"],
        "winner": WINNER,
        "gate_passed": study["finalist_gate"]["passed"],
        "test_mean_ap": test["mean_ap"],
        "exceeds_leader": study["outcome"]["exceeds_measured_leader"],
        "margin": study["outcome"]["margin_over_leader"],
        "seed_spread": seed_spread,
        "promoted": False,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
