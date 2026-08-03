"""Phase 1 of the 2026-07-31 research plan: the four classical sweeps, recorded as sweeps.

Pre-registered in `CAOS_MANAGE/plans/frothseg/research-2026-07-31/PLAN-PROPOSAL.md` section 3. Every grid
below is fixed in this file BEFORE the first run and is copied verbatim into the artifact it produces, so a
reader can check that no grid point was added or dropped after a result was seen.

  1.1  `data/derived/phase1/c4-compactness-sweep.json`      compactness and watershed_line on C4
  1.2  `data/derived/phase1/foreground-factor-sweep.json`   the 0.75 Otsu factor, on all five dependants
  1.2b `data/derived/phase1/foreground-cleanup-sweep.json`  the two cleanup areas in the same function
  1.3  `data/derived/phase1/c7-constrained-watershed.json`  C7 seam-subtraction against a real Meyer flood
  1.4  `data/derived/phase1/c3-flooding-surface.json`       C3's markers on four flooding surfaces
       `data/derived/phase1/classical-constant-ledger.json` every classical constant, swept or sourced

Surface: the 64-image `test` split of `data/cache/learned-v2-192.npz`, the same split the committed
`data/derived/classical-heldout.json` was produced on. These are NOT model-selection experiments: no engine
default is changed by this script and nothing here consumes the learned-lane test-evaluation budget.

Nothing this script writes changes a published number. `--verify-baseline` re-runs all seven engines through
the newly parameterised call path and asserts they reproduce `classical-heldout.json` exactly.

OUTCOME, added after the fact so nobody reads the grids without it. Two of the constants swept here were
ADOPTED on 2026-08-01, `watershed_hmax.surface` (neg_edt to neg_gray) and `valley_edge.mode` (subtract to
watershed), each on the primary source its registry entry documents rather than on its score here, and each
confirmed BEFORE and AFTER on an untouched reserve slice by `scripts/confirm_phase1_adoption.py`
(`verification/phase1-adoption.json`). The artifacts under `data/derived/phase1/` are therefore the
PRE-ADOPTION record: they were measured with the old defaults and they are deliberately NOT re-run against
the engine they produced, because that would replace the evidence with its own consequence. The prose in the
study docstrings below is likewise as it was written, in the present tense of the pre-adoption engine.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))

from fslab.learning.data_cache import load_cache, select_split  # noqa: E402
from fslab.science import segment  # noqa: E402
from fslab.science.segment import (  # noqa: E402
    METHODS,
    full_instance_metrics,
    summarize_metric_rows,
)

OUT_DIR = ROOT / "data" / "derived" / "phase1"
CACHE = ROOT / "data" / "cache" / "learned-v2-192.npz"
HELDOUT = ROOT / "data" / "derived" / "classical-heldout.json"

# ---------------------------------------------------------------------------------------------
# Pre-registered grids. Fixed before the first run.
# ---------------------------------------------------------------------------------------------

COMPACTNESS_GRID = [0.0, 0.0001, 0.001, 0.01, 0.03, 0.1, 0.3, 1.0, 3.0, 10.0, 30.0, 100.0]
WATERSHED_LINE_GRID = [False, True]

FOREGROUND_FACTOR_GRID = [0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 1.00, 1.05, 1.10]
FOREGROUND_DEPENDANTS = ["otsu_cc", "watershed_hmax", "watershed_dt", "watershed_hmin", "valley_edge"]

HOLE_MAX_SIZE_GRID = [0, 4, 8, 16, 32, 64]
OBJECT_MAX_SIZE_GRID = [0, 4, 8, 12, 24, 48]

C7_SEAM_RADIUS_GRID = [2, 3, 4, 5]
C7_MODE_GRID = ["subtract", "watershed"]

C3_SURFACE_GRID = list(segment.FLOODING_SURFACES)

# Residual per-method constants. Not one of the plan's four items, but the phase acceptance is
# "every constant that survives is swept-and-recorded or documented as a deliberate choice with its
# source", and these five are the ones left in the scored critical path with neither. One 1-D sweep
# each, every other constant held at its published value. C6's four SLIC constants are deliberately
# excluded: C6 is a Phase 5 rebuild-or-demote item and costs 536 ms/image.
RESIDUAL_GRIDS = [
    ("watershed_immersion", "min_distance", [1, 2, 3, 4, 6]),
    ("watershed_hmax", "h", [0.02, 0.04, 0.06, 0.08, 0.12, 0.20]),
    ("watershed_dt", "min_distance", [2, 3, 4, 5, 6, 8]),
    ("watershed_hmin", "h", [0.02, 0.04, 0.06, 0.08, 0.12, 0.20]),
    ("valley_edge", "min_cap_size", [0, 4, 8, 16, 32]),
]

REPORTED_METRICS = (
    "mean_ap",
    "mean_ap50",
    "mean_ap75",
    "mean_pq",
    "mean_sq",
    "mean_rq",
    "mean_boundary_precision",
    "mean_boundary_recall",
    "mean_boundary_fscore",
    "mean_bsd_wasserstein",
    "mean_count_absolute_error",
    "mean_count_relative_error",
    "mean_d10_relative_error",
    "mean_d32_relative_error",
    "mean_d50_relative_error",
    "mean_d90_relative_error",
)


def _environment() -> dict:
    import scipy
    import skimage

    return {
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "processor": platform.processor() or platform.machine(),
        "numpy": np.__version__,
        "scipy": scipy.__version__,
        "scikit_image": skimage.__version__,
    }


def evaluate(cache: dict, method: str, **kwargs) -> dict:
    """Run one engine at one configuration over every image of the split and aggregate."""
    engine = METHODS[method]
    rows = []
    for index, image in enumerate(cache["images"]):
        started = time.perf_counter()
        labels = engine(image.astype(np.float32) / 255.0, **kwargs)
        elapsed_ms = (time.perf_counter() - started) * 1000
        rows.append({
            "sample_id": str(cache["sample_ids"][index]),
            "condition_id": str(cache["conditions"][index]),
            **full_instance_metrics(labels, cache["labels"][index]),
            "inference_ms": elapsed_ms,
        })
    summary = summarize_metric_rows(rows, split="test")
    point = {
        "method": method,
        "config": {key: value for key, value in kwargs.items()},
        "n": summary["n"],
        **{name: summary[name] for name in REPORTED_METRICS},
        "mean_inference_ms": float(np.mean([row["inference_ms"] for row in rows])),
        "p95_inference_ms": float(np.quantile([row["inference_ms"] for row in rows], 0.95)),
        "total_predicted_instances": int(sum(row["nPred"] for row in rows)),
        "total_true_instances": int(sum(row["nGt"] for row in rows)),
        "total_merges": int(sum(row["merges"] for row in rows)),
        "total_splits": int(sum(row["splits"] for row in rows)),
        "total_tp": int(sum(row["tp"] for row in rows)),
        "total_fp": int(sum(row["fp"] for row in rows)),
        "total_fn": int(sum(row["fn"] for row in rows)),
        "mean_ap_by_condition": {
            key: value["mean_ap"] for key, value in summary["robustness_by_condition"].items()
        },
    }
    return point


def _document(name: str, purpose: str, grid: dict, points: list[dict], baseline: dict) -> dict:
    return {
        "schema": "frothseg.phase1-sweep/v1",
        "study": name,
        "purpose": purpose,
        "plan": "CAOS_MANAGE/plans/frothseg/research-2026-07-31/PLAN-PROPOSAL.md section 3",
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "surface": {
            "cache": CACHE.relative_to(ROOT).as_posix(),
            "split": "test",
            "n_images": points[0]["n"] if points else 0,
            "note": (
                "The same 64-image split the committed classical-heldout.json was produced on. "
                "No engine default is changed by this study and no learned-lane test budget is spent."
            ),
        },
        "pre_registered_grid": grid,
        "baseline_config": baseline,
        "environment": _environment(),
        "point_count": len(points),
        "points": points,
    }


def _write(document: dict, filename: str) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / filename
    path.write_text(json.dumps(document, indent=2), encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT).as_posix()}", flush=True)
    return path


def _log(point: dict) -> None:
    print(
        f"  {point['method']} {point['config']} "
        f"AP={point['mean_ap']:.4f} PQ={point['mean_pq']:.4f} "
        f"bF={point['mean_boundary_fscore']:.4f} W1={point['mean_bsd_wasserstein']:.3f} "
        f"cnt={point['mean_count_absolute_error']:.2f} d32={point['mean_d32_relative_error']:.4f} "
        f"{point['mean_inference_ms']:.1f}ms",
        flush=True,
    )


# ---------------------------------------------------------------------------------------------
# Studies
# ---------------------------------------------------------------------------------------------


def probe_watershed_line_under_compactness(cache: dict) -> dict:
    """Does the pinned watershed honour watershed_line when compactness > 0?

    Recorded because the 1.1 grid crosses the two flags and the answer decides whether half of that grid
    carries any information at all. Measured, not assumed: the probe counts foreground pixels the engine
    left at label 0, which is what a watershed line is."""
    from fslab.science.segment import _foreground, watershed_dt

    observations = []
    for compactness in (0.0, 0.01, 1.0):
        zero_with_line = 0
        zero_without_line = 0
        identical = True
        for image in cache["images"]:
            gray = image.astype(np.float32) / 255.0
            foreground = _foreground(gray)
            plain = watershed_dt(gray, compactness=compactness, watershed_line=False)
            lined = watershed_dt(gray, compactness=compactness, watershed_line=True)
            zero_without_line += int((plain[foreground] == 0).sum())
            zero_with_line += int((lined[foreground] == 0).sum())
            identical = identical and bool(np.array_equal(plain, lined))
        observations.append({
            "compactness": compactness,
            "foreground_pixels_at_label_zero_without_line": zero_without_line,
            "foreground_pixels_at_label_zero_with_line": zero_with_line,
            "outputs_identical_across_watershed_line": identical,
        })
    honoured = [entry["compactness"] for entry in observations
                if not entry["outputs_identical_across_watershed_line"]]
    return {
        "question": "is watershed_line honoured when compactness > 0 in scikit-image 0.26.0",
        "answer": (
            "No. watershed_line produces a separating line only at compactness == 0; for every "
            "compactness > 0 tested the output is bit-identical to watershed_line=False and no foreground "
            "pixel is left at label 0."
        ),
        "compactness_values_where_watershed_line_changed_the_output": honoured,
        "observations": observations,
        "consequence_for_this_sweep": (
            "The watershed_line=True half of the 1.1 grid is informative only at compactness == 0. Every "
            "other watershed_line=True row repeats its watershed_line=False twin and is kept in the "
            "artifact as the evidence for that statement, not as an independent measurement."
        ),
    }


def study_c4_compactness(cache: dict) -> Path:
    points = []
    for line in WATERSHED_LINE_GRID:
        for compactness in COMPACTNESS_GRID:
            point = evaluate(cache, "watershed_dt", compactness=compactness, watershed_line=line)
            _log(point)
            points.append(point)
    document = _document(
        "1.1 C4 compact watershed",
        (
            "Sweep the compactness keyword of the pinned scikit-image watershed on C4, and the "
            "watershed_line flag alongside it. compactness > 0 selects the compact watershed of "
            "Neubert and Protzel 2014, which the pinned 0.26.0 docstring cites for that exact parameter."
        ),
        {"compactness": COMPACTNESS_GRID, "watershed_line": WATERSHED_LINE_GRID},
        points,
        {"compactness": segment.C4_COMPACTNESS, "watershed_line": segment.C4_WATERSHED_LINE},
    )
    document["source"] = {
        "citation": (
            "P. Neubert and P. Protzel, Compact Watershed and Preemptive SLIC, ICPR 2014, pp. 996-1001"
        ),
        "doi": "10.1109/ICPR.2014.181",
        "where_verified": (
            "skimage.segmentation.watershed.__doc__ reference [1] in the pinned scikit-image 0.26.0, "
            "read in this environment"
        ),
    }
    document["library_behaviour_probe"] = probe_watershed_line_under_compactness(cache)
    return _write(document, "c4-compactness-sweep.json")


def study_foreground_factor(cache: dict) -> Path:
    points = []
    for factor in FOREGROUND_FACTOR_GRID:
        for method in FOREGROUND_DEPENDANTS:
            point = evaluate(cache, method, otsu_factor=factor)
            _log(point)
            points.append(point)
    document = _document(
        "1.2 _foreground Otsu factor",
        (
            "Sweep the 0.75 multiplier applied to Otsu's threshold in _foreground and report the effect on "
            "all five scored methods that consume that mask, because the constant is common-mode across "
            "the tier rather than a property of C1."
        ),
        {"otsu_factor": FOREGROUND_FACTOR_GRID, "methods": FOREGROUND_DEPENDANTS},
        points,
        {"otsu_factor": segment.FOREGROUND_OTSU_FACTOR},
    )
    document["source"] = {
        "citation": "N. Otsu, A Threshold Selection Method from Gray-Level Histograms, IEEE TSMC 9(1), 1979",
        "doi": "10.1109/TSMC.1979.4310076",
        "note": (
            "Otsu's method supplies the threshold; the 0.75 multiplier is not part of it, which is why the "
            "constant needs a measurement rather than a citation."
        ),
    }
    return _write(document, "foreground-factor-sweep.json")


def study_foreground_cleanup(cache: dict) -> Path:
    points = []
    for size in HOLE_MAX_SIZE_GRID:
        for method in FOREGROUND_DEPENDANTS:
            point = evaluate(cache, method, hole_max_size=size)
            _log(point)
            points.append(point)
    for size in OBJECT_MAX_SIZE_GRID:
        for method in FOREGROUND_DEPENDANTS:
            point = evaluate(cache, method, object_max_size=size)
            _log(point)
            points.append(point)
    document = _document(
        "1.2b _foreground cleanup areas",
        (
            "The other two undefended constants inside the same common-mode function: the "
            "remove_small_holes and remove_small_objects area thresholds. Swept one at a time with the "
            "other two held at their published values. Zero means the cleanup removes nothing, because "
            "scikit-image 0.26 removes components of max_size pixels or fewer."
        ),
        {"hole_max_size": HOLE_MAX_SIZE_GRID, "object_max_size": OBJECT_MAX_SIZE_GRID,
         "methods": FOREGROUND_DEPENDANTS},
        points,
        {
            "hole_max_size": segment.FOREGROUND_HOLE_MAX_SIZE,
            "object_max_size": segment.FOREGROUND_OBJECT_MAX_SIZE,
        },
    )
    return _write(document, "foreground-cleanup-sweep.json")


def study_c7_constrained_watershed(cache: dict) -> Path:
    points = []
    for radius in C7_SEAM_RADIUS_GRID:
        for mode in C7_MODE_GRID:
            lines = WATERSHED_LINE_GRID if mode == "watershed" else [False]
            for line in lines:
                point = evaluate(
                    cache, "valley_edge", seam_radius=radius, mode=mode, watershed_line=line,
                )
                _log(point)
                points.append(point)
    document = _document(
        "1.3 C7 as a real constrained watershed",
        (
            "C7 currently subtracts the detected seam from the foreground and labels what is left, so every "
            "bubble loses its seam ring by construction. The watershed mode uses the cleaned caps as markers "
            "and floods the black-top-hat response, so caps grow back to the seam ridge. Seam radius is "
            "swept alongside the mode because it sets the width of the ring that is lost."
        ),
        {"seam_radius": C7_SEAM_RADIUS_GRID, "mode": C7_MODE_GRID,
         "watershed_line": WATERSHED_LINE_GRID},
        points,
        {
            "seam_radius": segment.C7_SEAM_RADIUS,
            "mode": segment.C7_MODE,
            "watershed_line": segment.C7_WATERSHED_LINE,
        },
    )
    document["source"] = {
        "citation": "F. Meyer, Topographic distance and watershed lines, Signal Processing 38(1), 1994, 113-125",
        "doi": "10.1016/0165-1684(94)90060-4",
        "where_named_in_repo": "data-pipeline/fslab/model_registry.py C7 entry, which already calls C7 a constrained watershed",
    }
    return _write(document, "c7-constrained-watershed.json")


def study_c3_flooding_surface(cache: dict) -> Path:
    points = []
    for surface in C3_SURFACE_GRID:
        for line in WATERSHED_LINE_GRID:
            point = evaluate(cache, "watershed_hmax", surface=surface, watershed_line=line)
            _log(point)
            points.append(point)
    reference = evaluate(cache, "watershed_dt")
    _log(reference)
    document = _document(
        "1.4 C3 flooding surface",
        (
            "C3 and C4 flood the same negated distance transform and differ only in their markers, so C3's "
            "0.1031 against C4's 0.1977 is a marker result reported as a method result. This study holds "
            "C3's h-maxima markers fixed and swaps the surface for the image, its negation and its "
            "morphological gradient, which is the surface the published froth method floods."
        ),
        {"surface": C3_SURFACE_GRID, "watershed_line": WATERSHED_LINE_GRID},
        points,
        {"surface": segment.C3_FLOODING_SURFACE, "watershed_line": False},
    )
    document["c4_reference_same_surface"] = reference
    document["source"] = {
        "citation": (
            "H. Sadr-Kazemi and J. J. Cilliers, An image processing algorithm for measurement of flotation "
            "froth bubble size and shape distributions, Minerals Engineering 10(10), 1997"
        ),
        "doi": "10.1016/S0892-6875(97)00094-0",
    }
    return _write(document, "c3-flooding-surface.json")


def study_residual_constants(cache: dict) -> Path:
    points = []
    for method, parameter, grid in RESIDUAL_GRIDS:
        for value in grid:
            point = evaluate(cache, method, **{parameter: value})
            point["swept_parameter"] = parameter
            _log(point)
            points.append(point)
    document = _document(
        "1.5 residual per-method constants",
        (
            "The constants left in the scored critical path after items 1.1 to 1.4, each swept once in "
            "one dimension with every other constant held at its published value. Added so the phase "
            "acceptance, that every surviving constant is either swept or sourced, can be checked rather "
            "than asserted. C6's four SLIC constants are excluded on cost and because C6 is a Phase 5 "
            "rebuild-or-demote item."
        ),
        {f"{method}.{parameter}": grid for method, parameter, grid in RESIDUAL_GRIDS},
        points,
        {
            "watershed_immersion.min_distance": segment.C2_MIN_DISTANCE,
            "watershed_hmax.h": segment.C3_H_MAXIMA,
            "watershed_dt.min_distance": segment.C4_MIN_DISTANCE,
            "watershed_hmin.h": segment.C5_H_MINIMA,
            "valley_edge.min_cap_size": segment.C7_MIN_CAP_SIZE,
        },
    )
    return _write(document, "residual-constants-sweep.json")


# ---------------------------------------------------------------------------------------------
# Baseline reproduction guard
# ---------------------------------------------------------------------------------------------

GUARDED_METRICS = (
    "mean_ap",
    "mean_pq",
    "mean_boundary_fscore",
    "mean_bsd_wasserstein",
    "mean_count_absolute_error",
    "mean_d32_relative_error",
)


def verify_baseline(cache: dict) -> dict:
    """Assert the parameterised engines reproduce the committed artifact exactly at their defaults."""
    reference = {
        entry["method"]: entry for entry in json.loads(HELDOUT.read_text(encoding="utf-8"))["methods"]
    }
    results = []
    for method in METHODS:
        point = evaluate(cache, method)
        deltas = {}
        for name in GUARDED_METRICS:
            observed = point[name]
            expected = reference[method][name]
            deltas[name] = {
                "observed": observed,
                "committed": expected,
                "delta": None if observed is None or expected is None else float(observed - expected),
            }
        results.append({
            "method": method,
            "identical": all(
                entry["delta"] is not None and abs(entry["delta"]) <= 1e-12
                for entry in deltas.values()
            ),
            "metrics": deltas,
        })
        print(f"  baseline {method}: {'identical' if results[-1]['identical'] else 'DRIFTED'}", flush=True)
    return {
        "schema": "frothseg.phase1-baseline-reproduction/v1",
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "reference_artifact": HELDOUT.relative_to(ROOT).as_posix(),
        # Pin WHICH version of the reference was reproduced. Without this the certificate says
        # "identical to the committed artifact" against whatever that file happens to be later,
        # so a rebake of classical-heldout.json silently inherits a reproduction claim that was
        # made about different bytes.
        # LF-normalised, exactly like check_product_completeness._source_sha256. This is a
        # TEXT artifact and .gitattributes stores it with LF, so a raw-byte hash taken on a
        # Windows working tree does not match the same file in a fresh CI checkout. That is
        # how the first version of this pin passed locally and failed in CI, reporting a
        # reproduction mismatch when nothing about the reproduction had changed.
        "reference_artifact_sha256": hashlib.sha256(
            HELDOUT.read_bytes().replace(b"\r\n", b"\n")
        ).hexdigest(),
        "reference_artifact_sha256_normalisation": "line endings normalised to LF",
        "engine_constants": {
            name: getattr(segment, name)
            for name in (
                "FOREGROUND_OTSU_FACTOR", "FOREGROUND_HOLE_MAX_SIZE", "FOREGROUND_OBJECT_MAX_SIZE",
                "C2_MIN_DISTANCE", "C2_GRADIENT_RADIUS", "C3_H_MAXIMA", "C3_FLOODING_SURFACE",
                "C4_MIN_DISTANCE", "C4_COMPACTNESS", "C5_H_MINIMA", "C7_SEAM_RADIUS",
                "C7_MIN_CAP_SIZE", "C7_MODE",
            )
        },
        "tolerance": 1e-12,
        "all_identical": all(entry["identical"] for entry in results),
        "methods": results,
    }


STUDIES = {
    "c4-compactness": study_c4_compactness,
    "foreground-factor": study_foreground_factor,
    "foreground-cleanup": study_foreground_cleanup,
    "c7-watershed": study_c7_constrained_watershed,
    "c3-surface": study_c3_flooding_surface,
    "residual-constants": study_residual_constants,
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=CACHE)
    parser.add_argument("--study", action="append", dest="studies", choices=sorted(STUDIES))
    parser.add_argument("--verify-baseline", action="store_true")
    args = parser.parse_args()

    cache = select_split(load_cache(args.cache), "test")
    print(f"test split: {len(cache['images'])} images", flush=True)

    if args.verify_baseline:
        document = verify_baseline(cache)
        _write(document, "baseline-reproduction.json")
        if not document["all_identical"]:
            raise SystemExit("parameterised engines drifted from the committed classical-heldout.json")

    for name in args.studies or []:
        print(f"== {name} ==", flush=True)
        STUDIES[name](cache)


if __name__ == "__main__":
    main()
