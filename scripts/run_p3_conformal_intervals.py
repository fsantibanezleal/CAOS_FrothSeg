"""Execute pre-registered experiment P-3: conformal intervals on D32 and bubble count.

Pre-registration: CAOS_MANAGE `plans/frothseg/research-2026-07-31/PLAN-PROPOSAL.md`, section
P-3. The hypothesis, the bars, the calibration source and the budget are fixed there, before any
run. This script only executes it. Nothing below is adjusted after a result is seen; a miss is
published as a null.

Hypothesis, refutable
---------------------

Split conformal on a FRESH calibration draw produces distribution-free intervals on per-frame
D32 and bubble count that (a) achieve nominal coverage on the untouched test split AND (b) are
narrow enough to be operationally useful.

Bars, fixed in the proposal
---------------------------

1. Empirical test coverage inside the finite-sample band of the nominal level. The band's
   operational definition, fixed here before the run: the equal-tailed central 95 percent
   interval of BetaBinomial(m, rank, n + 1 - rank), the exact law of the covered count under
   exchangeability (`fslab.learning.conformal.coverage_band`).
2. Median D32 interval half width below 15 percent of the point estimate.

A guarantee met by an uninformatively wide interval is a NULL and is recorded as one. The
proposal sets a width bar for D32 only; the count lane reports its width without a bar, and no
width bar is invented for it here.

The blocking hazard, and how it is discharged
---------------------------------------------

The EXISTING calibration split was already used to fit the decode thresholds by the 405
combination grid search in `fslab.learning.train_multitask._calibrate`. Reusing it as the
conformal calibration set breaks exchangeability and yields an invalid guarantee. It is
therefore not used. The calibration set is the Phase 2 reserve slice named `p3`
(`data/cache/learned-v2-192-reserve.npz`, 32 groups / 64 samples, pre-registered id-by-id with
its sha256 in `verification/phase2-data-preregistration.json`). That slice has never been
trained on, never been selected on, and never been looked at. This run spends it, once.

Test-evaluation budget
----------------------

ZERO new test evaluations. The published ensemble already spent its three, and its per-frame
predicted and true BSD summaries for all 64 test frames are committed in
`models/lamellastar-v1/run.json` (`evaluation.cases[*].predicted_bsd` / `truth_bsd`). The
verification reads those records. No test image is re-inferred, no test-time decision is made,
and no threshold is fitted on anything the test split touched.

Scores, fixed in advance
------------------------

- PRIMARY, both quantities: the absolute residual |point estimate - truth|. Textbook split
  conformal; the interval is a constant half width around the point estimate.
- SECONDARY, reported for transparency and never used to decide the verdict: the relative
  residual |point estimate - truth| / point estimate, whose half width scales with the estimate.

Device, fixed in advance
------------------------

The committed test record was produced on CUDA (`models/lamellastar-v1/run.json`
`environment.device`). A conformal threshold is only exchangeable with the evaluation scores if
the SAME scoring function produced both, so the PRIMARY calibration inference runs on the same
device. The identical pass is also run on CPU and the per-frame disagreement is reported, so
the device dependence is measured rather than assumed. No training happens here: the whole cost
is 3 members x 64 frames of forward passes per device.

Optional follow-on, same phase, also pre-registered here
--------------------------------------------------------

Instance-level prediction sets from the three members' disagreement, per the proposal's optional
item. For each bubble the ensemble reports, the candidate splits are the member-level counts of
true bubbles inside that same region; the set of size lambda takes the top-lambda members ordered
by their PUBLISHED VALIDATION mean AP (never by calibration or test). The claim is the
proposal's sentence: for each reported cluster, at least one candidate split gives the right
number of bubbles with probability at least 1 - alpha. Selected by conformal risk control
(arXiv:2208.02814) with its finite-sample term. Its calibration and verification halves are both
carved out of the SAME p3 reserve slice by a rule fixed here before the run: the 32 p3 groups
sorted by id, even positions fit, odd positions verify. It never touches the test split, so it
spends no budget.

    .venv-gpu/Scripts/python.exe scripts/run_p3_conformal_intervals.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.learning import conformal  # noqa: E402
from fslab.learning.data_cache import load_cache  # noqa: E402
from fslab.learning.evaluate_ensemble import _combine  # noqa: E402
from fslab.learning.multitask_models import build_model  # noqa: E402
from fslab.learning.train_multitask import _probabilities, method_decode  # noqa: E402
from fslab.science.segment import diameter_summary  # noqa: E402

# ---------------------------------------------------------------------------------------------
# Pre-registered constants. Fixed before the run; not one of them is touched afterwards.
# ---------------------------------------------------------------------------------------------

ALPHA = 0.10
TARGET_COVERAGE = 1.0 - ALPHA
COVERAGE_BAND_MASS = 0.95
#: Bar 2 from the proposal, D32 only.
D32_MEDIAN_RELATIVE_HALF_WIDTH_BAR = 0.15
PRIMARY_SCORE = "absolute"
SECONDARY_SCORE = "relative"
CALIBRATION_RESERVE_STUDY = "p3"
PRIMARY_DEVICE = "cuda"
REPLICATION_DEVICE = "cpu"
#: Largest per-frame disagreement between the two devices that still lets the CUDA threshold be
#: read as device independent. Declared before the run; it gates a sentence, not a verdict.
DEVICE_AGREEMENT_TOLERANCE_PX = 1e-3

#: The published operating point, selected on the OLD calibration split by the study v3 ensemble
#: run. Frozen here and asserted against the committed manifest: this study fits no threshold.
PUBLISHED_DECODE = {
    "foreground_threshold": 0.6,
    "boundary_threshold": 0.65,
    "marker_threshold": 0.15,
    "min_distance": 3,
    "center_weight": 0.5,
}

#: Follow-on: fraction of an instance's area that must lie inside the reported region for it to
#: count as belonging to that region.
CLUSTER_CONTAINMENT = 0.5
FOLLOW_ON_LAMBDAS = (1, 2, 3)


def _sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _sha256_ids(ids) -> str:
    """Same canonicalization the Phase 2 pre-registration used: sorted, newline joined."""
    payload = "\n".join(sorted(str(value) for value in ids)) + "\n"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _load_members(model_root: Path, device):
    """Load the three published ensemble members straight from the committed product manifest."""
    import torch

    manifest = json.loads((model_root / "run.json").read_text(encoding="utf-8"))
    models = []
    reports = []
    for member in manifest["members"]:
        weights_path = model_root / member["weights"]["path"]
        digest = _sha256_file(weights_path)
        if digest != member["weights"]["sha256"]:
            raise ValueError(f"member checksum mismatch: {weights_path}")
        config = member["config"]
        model = build_model(config["method"], int(config["base_channels"]))
        archive = np.load(weights_path)
        model.load_state_dict({name: torch.from_numpy(archive[name]) for name in archive.files})
        models.append(model.to(device).eval())
        reports.append({
            "seed": config["seed"],
            "study_run_id": member["study_run_id"],
            "weights_path": member["weights"]["path"],
            "weights_sha256": digest,
            "validation_mean_ap": member["validation_mean_ap"],
        })
    return models, manifest, reports


def _reserve_slice(cache_path: Path, study: str) -> dict:
    cache = load_cache(cache_path)
    selector = cache["reserve_studies"] == study
    return {key: value[selector] for key, value in cache.items()}


def _working_split(cache_path: Path, split: str) -> dict:
    cache = load_cache(cache_path)
    return {key: value[cache["splits"] == split] for key, value in cache.items()}


def _record_spend(ledger_path: Path, evidence: dict, *, output: Path) -> None:
    """Upsert this study's reserve-slice spend into the running ledger."""
    if ledger_path.exists():
        ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
    else:
        ledger = {
            "schema": "frothseg.reserve-ledger/v1",
            "purpose": (
                "Running count of the Phase 2 reserve slices a study has spent. The "
                "pre-registration in verification/phase2-data-preregistration.json is a frozen "
                "snapshot of the data step and is never back-edited; this file changes instead."
            ),
            "rule": (
                "A study spends the reserve slice named after it, at most once. A second entry "
                "for the same slice means the slice was observed twice and its guarantee is void."
            ),
            "entries": [],
        }
    source = evidence["design"]["calibration_source"]
    entry = {
        "reserve_study": source["reserve_study"],
        "spent_by": evidence["experiment"],
        "date": evidence["date"],
        "evidence": str(output.relative_to(ROOT)).replace("\\", "/"),
        "sample_count": source["sample_count"],
        "group_ids_sha256": source["group_ids_sha256"],
        "sample_ids_sha256": source["sample_ids_sha256"],
        "test_evaluations_spent": evidence["test_evaluations_spent"],
    }
    entries = [row for row in ledger["entries"] if row["spent_by"] != entry["spent_by"]]
    entries.append(entry)
    ledger["entries"] = sorted(entries, key=lambda row: (row["reserve_study"], row["spent_by"]))
    ledger["slices_spent"] = len({row["reserve_study"] for row in ledger["entries"]})
    ledger_path.write_text(json.dumps(ledger, indent=2), encoding="utf-8")


def _frame_rows(models, split: dict, *, device_name: str, batch_size: int) -> tuple[list[dict], list]:
    """Decode the ensemble AND each member on one split, at the published operating point."""
    import torch

    device = torch.device(device_name)
    images = torch.from_numpy(split["images"].astype(np.float32)[:, None] / 255.0)
    member_probabilities = [
        _probabilities(model, images, device=device, batch_size=batch_size) for model in models
    ]
    combined = _combine(member_probabilities, "logit-mean")
    decode = method_decode("lamellastar")

    rows = []
    member_labels = []
    for index in range(len(combined)):
        ensemble_labels = decode(combined[index], **PUBLISHED_DECODE)
        per_member = [
            decode(probabilities[index], **PUBLISHED_DECODE) for probabilities in member_probabilities
        ]
        truth = split["labels"][index]
        predicted_bsd = diameter_summary(ensemble_labels)
        truth_bsd = diameter_summary(truth)
        rows.append({
            "sample_id": str(split["sample_ids"][index]),
            "group_id": str(split["group_ids"][index]),
            "condition_id": str(split["conditions"][index]),
            "predicted_bsd": predicted_bsd,
            "truth_bsd": truth_bsd,
        })
        member_labels.append((ensemble_labels, per_member, truth))
    return rows, member_labels


def _contained_counts(region_labels: np.ndarray, other: np.ndarray) -> np.ndarray:
    """For each region id 1..R, how many `other` instances lie mostly inside it.

    "Mostly" is CLUSTER_CONTAINMENT of the other instance's own area, so an instance is charged
    to at most one region and the counts do not double count a bubble straddling a seam.
    """
    region_max = int(region_labels.max())
    counts = np.zeros(region_max + 1, dtype=int)
    other_ids = np.unique(other[other > 0])
    if region_max == 0 or other_ids.size == 0:
        return counts[1:]
    flat_other = other.ravel()
    flat_region = region_labels.ravel()
    for value in other_ids:
        selector = flat_other == value
        area = int(selector.sum())
        overlaps = np.bincount(flat_region[selector], minlength=region_max + 1)
        overlaps[0] = 0
        best = int(np.argmax(overlaps))
        if best > 0 and overlaps[best] >= CLUSTER_CONTAINMENT * area:
            counts[best] += 1
    return counts[1:]


def _follow_on_losses(member_labels: list, member_order: list[int]) -> list[dict]:
    """Per-frame cluster losses for every candidate-set size lambda."""
    frames = []
    for ensemble_labels, per_member, truth in member_labels:
        truth_counts = _contained_counts(ensemble_labels, truth)
        member_counts = [_contained_counts(ensemble_labels, per_member[i]) for i in member_order]
        clusters = len(truth_counts)
        losses = {}
        for size in FOLLOW_ON_LAMBDAS:
            if clusters == 0:
                losses[size] = 0.0
                continue
            wrong = np.ones(clusters, dtype=bool)
            for counts in member_counts[:size]:
                wrong &= counts != truth_counts
            losses[size] = float(np.mean(wrong))
        frames.append({
            "clusters": clusters,
            "losses": losses,
            "cluster_truth_counts": truth_counts,
            "cluster_member_counts": member_counts,
        })
    return frames


def _interval_block(
    *,
    quantity: str,
    score: str,
    calibration_rows: list[dict],
    test_rows: list[dict],
    predicted_key,
    truth_key,
) -> dict:
    report = conformal.fit_and_apply(
        score=score,
        calibration_prediction=np.array([predicted_key(row) for row in calibration_rows]),
        calibration_truth=np.array([truth_key(row) for row in calibration_rows]),
        evaluation_prediction=np.array([predicted_key(row) for row in test_rows]),
        evaluation_truth=np.array([truth_key(row) for row in test_rows]),
        alpha=ALPHA,
    )
    scorer = getattr(conformal, f"{score}_residual")
    test_scores = scorer(
        np.array([predicted_key(row) for row in test_rows]),
        np.array([truth_key(row) for row in test_rows]),
    )
    block = report.summary()
    block["quantity"] = quantity
    block["per_condition_coverage"] = conformal.conditional_coverage(
        test_scores,
        report.threshold,
        np.array([row["condition_id"] for row in test_rows]),
    )
    block["worst_condition"] = min(
        block["per_condition_coverage"].items(), key=lambda item: item[1]["coverage"]
    )[0]
    block["worst_condition_coverage"] = block["per_condition_coverage"][block["worst_condition"]][
        "coverage"
    ]
    return block


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-root", type=Path, default=ROOT / "models/lamellastar-v1")
    parser.add_argument(
        "--reserve-cache", type=Path, default=ROOT / "data/cache/learned-v2-192-reserve.npz"
    )
    parser.add_argument(
        "--working-cache", type=Path, default=ROOT / "data/cache/learned-v2-192.npz"
    )
    parser.add_argument(
        "--preregistration", type=Path, default=ROOT / "verification/phase2-data-preregistration.json"
    )
    parser.add_argument(
        "--output", type=Path, default=ROOT / "verification/p3-conformal-intervals.json"
    )
    parser.add_argument(
        "--ledger", type=Path, default=ROOT / "verification/reserve-slice-ledger.json"
    )
    parser.add_argument("--batch-size", type=int, default=8)
    args = parser.parse_args()

    import torch

    started = time.perf_counter()

    # ---- 1. the committed test record, and the operating point it was produced at ----
    manifest = json.loads((args.model_root / "run.json").read_text(encoding="utf-8"))
    published_decode = {key: manifest["calibration"][key] for key in PUBLISHED_DECODE}
    if published_decode != PUBLISHED_DECODE:
        raise ValueError(f"published operating point moved: {published_decode}")
    if manifest["evaluation"]["split"] != "test":
        raise ValueError("the committed evaluation is not the test split")
    test_rows = [
        {
            "sample_id": case["sample_id"],
            "group_id": case["group_id"],
            "condition_id": case["condition_id"],
            "predicted_bsd": case["predicted_bsd"],
            "truth_bsd": case["truth_bsd"],
        }
        for case in manifest["evaluation"]["cases"]
    ]
    missing = [row["sample_id"] for row in test_rows if row["predicted_bsd"]["d32"] is None]
    if missing:
        raise ValueError(f"test frames without a predicted d32: {missing}")

    # ---- 2. the fresh calibration draw, checked against its Phase 2 pre-registration ----
    preregistration = json.loads(args.preregistration.read_text(encoding="utf-8"))
    registered = preregistration["synthetic"]["reserve_matrix"]["per_study"][CALIBRATION_RESERVE_STUDY]
    reserve_sha = _sha256_file(args.reserve_cache)
    if reserve_sha != preregistration["synthetic"]["reserve_matrix"]["cache_sha256"]:
        raise ValueError("reserve cache does not match the Phase 2 pre-registration digest")
    calibration_split = _reserve_slice(args.reserve_cache, CALIBRATION_RESERVE_STUDY)
    slice_group_sha = _sha256_ids(set(calibration_split["group_ids"]))
    slice_sample_sha = _sha256_ids(calibration_split["sample_ids"])
    if slice_group_sha != registered["group_ids_sha256"]:
        raise ValueError("p3 reserve group ids do not match the pre-registration")
    if slice_sample_sha != registered["sample_ids_sha256"]:
        raise ValueError("p3 reserve sample ids do not match the pre-registration")
    burned_test_groups = {row["group_id"] for row in test_rows}
    overlap = burned_test_groups & set(calibration_split["group_ids"])
    if overlap:
        raise ValueError(f"calibration draw overlaps the test split: {sorted(overlap)}")

    # ---- 3. inference on the calibration draw, on both devices ----
    if not torch.cuda.is_available():
        raise RuntimeError(
            "the primary calibration pass must run on the same device as the committed test "
            "record; CUDA is unavailable"
        )
    device_rows = {}
    device_members = {}
    member_reports = None
    for device_name in (PRIMARY_DEVICE, REPLICATION_DEVICE):
        models, _, member_reports = _load_members(args.model_root, torch.device(device_name))
        rows, member_labels = _frame_rows(
            models, calibration_split, device_name=device_name, batch_size=args.batch_size
        )
        device_rows[device_name] = rows
        device_members[device_name] = member_labels
        del models
        torch.cuda.empty_cache()
        print(f"[{device_name}] decoded {len(rows)} calibration frames", flush=True)

    def _vector(rows, key, field):
        return np.array([row[key][field] for row in rows], dtype=float)

    device_agreement = {
        "tolerance_px": DEVICE_AGREEMENT_TOLERANCE_PX,
        "max_abs_d32_difference": float(
            np.max(
                np.abs(
                    _vector(device_rows[PRIMARY_DEVICE], "predicted_bsd", "d32")
                    - _vector(device_rows[REPLICATION_DEVICE], "predicted_bsd", "d32")
                )
            )
        ),
        "max_abs_count_difference": float(
            np.max(
                np.abs(
                    _vector(device_rows[PRIMARY_DEVICE], "predicted_bsd", "count")
                    - _vector(device_rows[REPLICATION_DEVICE], "predicted_bsd", "count")
                )
            )
        ),
    }
    device_agreement["within_tolerance"] = bool(
        device_agreement["max_abs_d32_difference"] <= DEVICE_AGREEMENT_TOLERANCE_PX
        and device_agreement["max_abs_count_difference"] == 0.0
    )
    calibration_rows = device_rows[PRIMARY_DEVICE]

    # ---- 4. the pre-registered intervals ----
    def d32_pred(row):
        return row["predicted_bsd"]["d32"]

    def d32_true(row):
        return row["truth_bsd"]["d32"]

    def count_pred(row):
        return row["predicted_bsd"]["count"]

    def count_true(row):
        return row["truth_bsd"]["count"]

    quantities = (
        ("d32_px", d32_pred, d32_true),
        ("bubble_count", count_pred, count_true),
    )
    lanes = {}
    for quantity, predicted_key, truth_key in quantities:
        for score in (PRIMARY_SCORE, SECONDARY_SCORE):
            try:
                lanes[f"{quantity}.{score}"] = _interval_block(
                    quantity=quantity,
                    score=score,
                    calibration_rows=calibration_rows,
                    test_rows=test_rows,
                    predicted_key=predicted_key,
                    truth_key=truth_key,
                )
            except ValueError as error:
                # A zero point estimate has no proportional interval. Recording that the lane is
                # undefined is honest; substituting a different normalizer after the fact is not.
                lanes[f"{quantity}.{score}"] = {
                    "quantity": quantity,
                    "score": score,
                    "computable": False,
                    "reason": str(error),
                }

    band = conformal.coverage_band(
        calibration_n=len(calibration_rows),
        evaluation_n=len(test_rows),
        alpha=ALPHA,
        mass=COVERAGE_BAND_MASS,
    )

    primary_d32 = lanes[f"d32_px.{PRIMARY_SCORE}"]
    primary_count = lanes[f"bubble_count.{PRIMARY_SCORE}"]
    coverage_pass = {
        name: (
            None
            if "empirical_coverage" not in lanes[name]
            else bool(
                band["lower_coverage"]
                <= lanes[name]["empirical_coverage"]
                <= band["upper_coverage"]
            )
        )
        for name in lanes
    }
    width_pass_d32 = bool(
        primary_d32["median_relative_half_width"] is not None
        and primary_d32["median_relative_half_width"] < D32_MEDIAN_RELATIVE_HALF_WIDTH_BAR
    )

    # ---- 4b. device robustness: the same two lanes fitted on the CPU replication pass ----
    # Declared with the device rule above: the device dependence is MEASURED, not assumed. This
    # block never decides anything; the verdict lanes are the CUDA ones, chosen before the run
    # because CUDA is what produced the committed test record.
    device_robustness = {
        quantity: _interval_block(
            quantity=quantity,
            score=PRIMARY_SCORE,
            calibration_rows=device_rows[REPLICATION_DEVICE],
            test_rows=test_rows,
            predicted_key=predicted_key,
            truth_key=truth_key,
        )
        for quantity, predicted_key, truth_key in quantities
    }

    # ---- 4c. the hazard, made concrete ----
    # What the INVALID route would have claimed: the same conformal fit on the OLD calibration
    # split, the one the 405 combination decode grid was already fitted on. It carries no
    # guarantee and is reported only so the size of the hazard is a number rather than a warning.
    hazard_rows, _ = _frame_rows(
        _load_members(args.model_root, torch.device(PRIMARY_DEVICE))[0],
        _working_split(args.working_cache, "calibration"),
        device_name=PRIMARY_DEVICE,
        batch_size=args.batch_size,
    )
    torch.cuda.empty_cache()
    hazard = {
        "status": "INVALID, reported for size only",
        "why_invalid": (
            "this split was used to select the decode operating point by a 405 combination grid "
            "search, so its residuals are not exchangeable with the test split's"
        ),
        "lanes": {
            quantity: _interval_block(
                quantity=quantity,
                score=PRIMARY_SCORE,
                calibration_rows=hazard_rows,
                test_rows=test_rows,
                predicted_key=predicted_key,
                truth_key=truth_key,
            )
            for quantity, predicted_key, truth_key in quantities
        },
    }

    # ---- 5. per-group Mondrian feasibility, the proposal's named refutation route ----
    condition_sizes = {}
    for row in calibration_rows:
        condition_sizes[row["condition_id"]] = condition_sizes.get(row["condition_id"], 0) + 1
    mondrian = conformal.mondrian_feasibility(condition_sizes, ALPHA)

    # ---- 6. group-level secondary: one appearance variant per latent group ----
    def _first_per_group(rows):
        seen = set()
        kept = []
        for row in rows:
            if row["group_id"] in seen:
                continue
            seen.add(row["group_id"])
            kept.append(row)
        return kept

    group_level = {}
    for quantity, predicted_key, truth_key in quantities:
        group_level[quantity] = _interval_block(
            quantity=quantity,
            score=PRIMARY_SCORE,
            calibration_rows=_first_per_group(calibration_rows),
            test_rows=_first_per_group(test_rows),
            predicted_key=predicted_key,
            truth_key=truth_key,
        )
    group_band = conformal.coverage_band(
        calibration_n=group_level["d32_px"]["calibration_n"],
        evaluation_n=group_level["d32_px"]["evaluation_n"],
        alpha=ALPHA,
        mass=COVERAGE_BAND_MASS,
    )

    # ---- 7. optional follow-on: instance-level prediction sets, conformal risk control ----
    member_order = list(
        np.argsort([-report["validation_mean_ap"] for report in member_reports])
    )
    follow_on_frames = _follow_on_losses(device_members[PRIMARY_DEVICE], member_order)
    ordered_groups = sorted({row["group_id"] for row in calibration_rows})
    fit_groups = set(ordered_groups[0::2])
    fit_index = [i for i, row in enumerate(calibration_rows) if row["group_id"] in fit_groups]
    verify_index = [i for i, row in enumerate(calibration_rows) if row["group_id"] not in fit_groups]
    crc = conformal.conformal_risk_control(
        {
            size: np.array([follow_on_frames[i]["losses"][size] for i in fit_index])
            for size in FOLLOW_ON_LAMBDAS
        },
        ALPHA,
    )
    verification_risk = {
        size: float(np.mean([follow_on_frames[i]["losses"][size] for i in verify_index]))
        for size in FOLLOW_ON_LAMBDAS
    }
    follow_on_clusters = int(sum(frame["clusters"] for frame in follow_on_frames))

    # ---- 8. verdict, against bars fixed before the run ----
    verdict_reasons = []
    if not coverage_pass[f"d32_px.{PRIMARY_SCORE}"]:
        verdict_reasons.append("D32 coverage outside the finite-sample band")
    if not width_pass_d32:
        verdict_reasons.append("median D32 relative half width at or above the 0.15 bar")
    if not coverage_pass[f"bubble_count.{PRIMARY_SCORE}"]:
        verdict_reasons.append("bubble-count coverage outside the finite-sample band")
    hypothesis_supported = bool(
        coverage_pass[f"d32_px.{PRIMARY_SCORE}"] and width_pass_d32
    )

    evidence = {
        "schema": "frothseg.p3-conformal/v1",
        "experiment": "p3-conformal-intervals",
        "date": "2026-08-01",
        "preregistration": (
            "CAOS_MANAGE plans/frothseg/research-2026-07-31/PLAN-PROPOSAL.md section 5, P-3; "
            "bars, scores, calibration source, band definition and budget fixed in "
            "scripts/run_p3_conformal_intervals.py before the run"
        ),
        "produced_by": "scripts/run_p3_conformal_intervals.py",
        "trained": "nothing",
        "gpu_used_for": "inference only, 3 members x 64 reserve frames",
        "test_evaluations_spent": 0,
        "test_evidence_source": (
            "models/lamellastar-v1/run.json evaluation.cases, the already published single test "
            "evaluation of the promoted ensemble; no test image was re-inferred here"
        ),
        "hypothesis": (
            "split conformal on a fresh calibration draw gives distribution-free intervals on "
            "per-frame D32 and bubble count that achieve nominal coverage on the untouched test "
            "split AND are narrow enough to be operationally useful"
        ),
        "bars": {
            "coverage": (
                "empirical test coverage inside the equal-tailed central 95 percent interval of "
                "BetaBinomial(m, rank, n + 1 - rank)"
            ),
            "d32_width": (
                f"median D32 interval half width below "
                f"{D32_MEDIAN_RELATIVE_HALF_WIDTH_BAR} of the point estimate"
            ),
            "count_width": "no width bar; the proposal sets one for D32 only",
            "null_rule": (
                "a guarantee met by an uninformatively wide interval is a null and is recorded "
                "as one"
            ),
        },
        "design": {
            "alpha": ALPHA,
            "target_coverage": TARGET_COVERAGE,
            "primary_score": PRIMARY_SCORE,
            "secondary_score": SECONDARY_SCORE,
            "calibration_source": {
                "reserve_study": CALIBRATION_RESERVE_STUDY,
                "cache_path": str(args.reserve_cache.relative_to(ROOT)).replace("\\", "/"),
                "cache_sha256": reserve_sha,
                "group_ids_sha256": slice_group_sha,
                "sample_ids_sha256": slice_sample_sha,
                "group_count": int(len(set(calibration_split["group_ids"]))),
                "sample_count": int(len(calibration_split["sample_ids"])),
                "matches_phase2_preregistration": True,
                "disjoint_from_test_groups": True,
            },
            "hazard_discharged": (
                "the existing calibration split was used to fit the decode thresholds by a 405 "
                "combination grid search (fslab.learning.train_multitask._calibrate), so it is "
                "not exchangeable with the test split and is NOT used here"
            ),
            "operating_point": PUBLISHED_DECODE,
            "operating_point_source": "models/lamellastar-v1/run.json calibration",
            "primary_device": PRIMARY_DEVICE,
            "replication_device": REPLICATION_DEVICE,
        },
        "members": member_reports,
        "device_agreement": device_agreement,
        "device_robustness": {
            "note": (
                "the same primary lanes fitted on the CPU replication pass. Reported because the "
                "device rule was declared before the run; it decides nothing"
            ),
            "lanes": device_robustness,
        },
        "hazard_demonstration": hazard,
        "coverage_band": band,
        "lanes": lanes,
        "coverage_within_band": coverage_pass,
        "d32_width_within_bar": width_pass_d32,
        "group_level_secondary": {
            "note": (
                "one appearance variant per latent group on both sides, so no two frames share a "
                "geometry; this is the strictest exchangeability reading of the design"
            ),
            "coverage_band": group_band,
            "lanes": group_level,
            "coverage_within_band": {
                quantity: bool(
                    group_band["lower_coverage"]
                    <= group_level[quantity]["empirical_coverage"]
                    <= group_band["upper_coverage"]
                )
                for quantity in group_level
            },
        },
        "mondrian_by_condition": {
            "note": (
                "the proposal's named refutation route. Reported whether or not coverage misses, "
                "because feasibility is a property of the calibration size, not of the result"
            ),
            **mondrian,
        },
        "follow_on_instance_prediction_sets": {
            "claim": (
                "for each bubble the ensemble reports, at least one of the top-lambda members "
                "gives the right number of true bubbles inside that region, with probability at "
                "least 1 - alpha"
            ),
            "selection": "conformal risk control, arXiv:2208.02814, with its finite-sample term",
            "member_order_by": "published validation mean AP, from models/lamellastar-v1/run.json",
            "member_order": [member_reports[i]["study_run_id"] for i in member_order],
            "containment_fraction": CLUSTER_CONTAINMENT,
            "split_rule": (
                "the 32 p3 reserve groups sorted by id; even positions fit, odd positions verify. "
                "Fixed before the run. The test split is never read by this lane"
            ),
            "fit_frames": len(fit_index),
            "verification_frames": len(verify_index),
            "clusters_scored": follow_on_clusters,
            "risk_control": crc,
            "verification_risk_by_lambda": {
                str(size): round(value, 6) for size, value in verification_risk.items()
            },
            "verification_risk_at_selected_lambda": (
                None
                if crc["selected_lambda"] is None
                else round(verification_risk[crc["selected_lambda"]], 6)
            ),
        },
        "verdict": {
            "hypothesis_supported": hypothesis_supported,
            "reasons": verdict_reasons,
        },
        "environment": {
            "python": platform.python_version(),
            "torch": torch.__version__,
            "cuda_runtime": torch.version.cuda,
            "device": torch.cuda.get_device_properties(0).name,
        },
        "duration_seconds": round(time.perf_counter() - started, 3),
        "calibration_frames": [
            {
                "sample_id": row["sample_id"],
                "condition_id": row["condition_id"],
                "group_id": row["group_id"],
                "predicted_d32": row["predicted_bsd"]["d32"],
                "truth_d32": row["truth_bsd"]["d32"],
                "predicted_count": row["predicted_bsd"]["count"],
                "truth_count": row["truth_bsd"]["count"],
            }
            for row in calibration_rows
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(evidence, indent=2), encoding="utf-8")

    # ---- 9. record the spend ----
    # The Phase 2 pre-registration is a frozen snapshot of the data step and its own guard
    # asserts nothing was spent when it was written, so the running count lives here instead of
    # being back-edited into a document whose value is that it does not change.
    _record_spend(args.ledger, evidence, output=args.output)

    print(json.dumps({
        "d32_primary": {
            "threshold_px": primary_d32["threshold"],
            "coverage": primary_d32["empirical_coverage"],
            "median_relative_half_width": primary_d32["median_relative_half_width"],
        },
        "count_primary": {
            "threshold": primary_count["threshold"],
            "coverage": primary_count["empirical_coverage"],
            "median_relative_half_width": primary_count["median_relative_half_width"],
        },
        "band": [band["lower_coverage"], band["upper_coverage"]],
        "hypothesis_supported": hypothesis_supported,
        "reasons": verdict_reasons,
        "output": str(args.output),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
