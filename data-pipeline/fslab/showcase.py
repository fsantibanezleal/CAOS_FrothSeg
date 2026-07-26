"""Bake browser-ready previews for every registered method and canonical case.

The scientific engines run offline. The static companion website reads these
artifacts for curated cases and never substitutes browser code for an offline
method. Raw classical labels are retained beside the previews; learned labels
remain in their authoritative inference output directories.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import uuid
from pathlib import Path

import numpy as np
from PIL import Image
from skimage.segmentation import find_boundaries

from .model_registry import METHODS as REGISTERED_METHODS
from .registry import list_cases
from .science.froth_gen import CASES, generate_sequence
from .science.segment import METHODS

ROOT = Path(__file__).resolve().parents[2]

METHOD_SOURCES = {
    "L1": "learned/unet-watershed-v2/cases/{case}/instances.png",
    "L2": "learned/deep-marker-watershed-v1/cases/{case}/instances.png",
    "L3": "learned/gc-fsegnet-v1/cases/{case}/instances.png",
    "L4": "learned/stardist-froth-v1/cases/{case}/instances.png",
    "L5": "learned/cellpose-sam-cpsam-v2/cases/{case}/instances.png",
    "L6": "learned/yolo-froth-seg-v1/cases/{case}/instances.png",
    "L7": "learned/sam2-1-hiera-tiny/cases/{case}/instances.png",
    "N1": "learned/lamellastar-v1/cases/{case}/instances.png",
}

CLASSICAL_IDS = {
    "C1": "otsu_cc",
    "C2": "watershed_immersion",
    "C3": "watershed_hmax",
    "C4": "watershed_dt",
    "C5": "watershed_hmin",
    "C6": "slic_merge",
    "C7": "valley_edge",
}

TEMPORAL_CASE_IDS = (
    "poly-normal",
    "fine-froth",
    "glare-storm",
    "motion-fast",
    "bursting",
)
TEMPORAL_FRAMES = 8
PRIMARY_EXCLUDED_CASE_IDS = ("empty-control",)

TEMPORAL_PREDICTION_SOURCES = {
    "L1": {
        "report_path": "temporal/unet-watershed-v2.json",
        "mode": "framewise_segmentation_with_iou_identity_association",
        "protocol": "L1 inference on every frame, followed by Hungarian IoU association",
        "required_cases": TEMPORAL_CASE_IDS,
    },
    "L7": {
        "report_path": "temporal/sam2-1-hiera-tiny.json",
        "mode": "native_prompted_video_propagation",
        "protocol": "first-frame ground-truth mask prompts; forward propagation",
        "required_cases": ("motion-fast",),
    },
}

TEMPORAL_METRIC_FIELDS = (
    "frames",
    "matched_gt_instances",
    "false_positive_instances",
    "false_negative_instances",
    "id_switches",
    "id_switch_rate",
    "mean_frame_coverage",
    "id_precision",
    "id_recall",
    "idf1",
    "detection_accuracy",
    "association_accuracy",
    "hota",
    "track_fragmentations",
    "event_true_positives",
    "event_false_positives",
    "event_false_negatives",
    "event_precision",
    "event_recall",
    "event_f1",
    "flow_epe_px",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def preview(frame: np.ndarray, labels: np.ndarray) -> Image.Image:
    base = np.repeat(frame[..., None], 3, axis=2).astype(np.float32)
    ids = labels.astype(np.uint32)
    colours = np.stack(
        [
            (ids * 67 + 41) % 223 + 32,
            (ids * 131 + 17) % 223 + 32,
            (ids * 197 + 73) % 223 + 32,
        ],
        axis=2,
    ).astype(np.float32)
    foreground = ids > 0
    rendered = base.copy()
    rendered[foreground] = 0.38 * base[foreground] + 0.62 * colours[foreground]
    rendered[find_boundaries(labels, mode="outer")] = np.array([255, 255, 255])
    return Image.fromarray(np.clip(rendered, 0, 255).astype(np.uint8), mode="RGB")


def encode_label_runs(labels: np.ndarray) -> bytes:
    """Encode a uint16 label raster as little-endian uint32 value/count pairs."""
    flat = np.asarray(labels, dtype=np.uint32).reshape(-1)
    changes = np.flatnonzero(flat[1:] != flat[:-1]) + 1
    starts = np.concatenate(([0], changes))
    ends = np.concatenate((changes, [flat.size]))
    pairs = np.empty((len(starts), 2), dtype="<u4")
    pairs[:, 0] = flat[starts]
    pairs[:, 1] = ends - starts
    header = np.asarray(
        [0x46534C52, 1, labels.shape[1], labels.shape[0], len(pairs)],
        dtype="<u4",
    )
    return header.tobytes() + pairs.tobytes()


def decode_label_runs(payload: bytes) -> np.ndarray:
    """Decode and validate the compact uint32 value/count label contract."""
    words = np.frombuffer(payload, dtype="<u4")
    if len(words) < 5 or int(words[0]) != 0x46534C52 or int(words[1]) != 1:
        raise ValueError("invalid FrothSeg label-run header")
    width, height, pair_count = (int(value) for value in words[2:5])
    pairs = words[5:]
    if width <= 0 or height <= 0 or len(pairs) != pair_count * 2:
        raise ValueError("invalid FrothSeg label-run dimensions or pair count")
    pairs = pairs.reshape(-1, 2)
    if int(pairs[:, 1].sum()) != width * height:
        raise ValueError("FrothSeg label runs do not cover the declared raster")
    return np.repeat(pairs[:, 0], pairs[:, 1]).reshape(height, width)


def bake(derived_root: Path, output_root: Path) -> dict:
    """Build a complete tree off-path, then swap it into service."""
    derived_root = derived_root.resolve()
    output_root = output_root.resolve()
    stage_root = output_root.parent / f".{output_root.name}-staging-{uuid.uuid4().hex}"
    backup_root = output_root.parent / f".{output_root.name}-previous-{uuid.uuid4().hex}"
    try:
        manifest = _bake(derived_root, stage_root, public_root=output_root)
        if output_root.exists():
            output_root.rename(backup_root)
        try:
            stage_root.rename(output_root)
        except Exception:
            if backup_root.exists() and not output_root.exists():
                backup_root.rename(output_root)
            raise
        if backup_root.exists():
            shutil.rmtree(backup_root)
        return manifest
    finally:
        if stage_root.exists():
            shutil.rmtree(stage_root)


def _bake(derived_root: Path, output_root: Path, *, public_root: Path) -> dict:
    derived_root = derived_root.resolve()
    output_root = output_root.resolve()
    case_index = json.loads((derived_root / "manifests" / "index.json").read_text(encoding="utf-8"))
    benchmark_cases = [row["case_id"] for row in case_index["cases"]]
    cases = [
        case_id
        for case_id in benchmark_cases
        if case_id not in PRIMARY_EXCLUDED_CASE_IDS
    ]
    method_ids = [*CLASSICAL_IDS, *METHOD_SOURCES]
    expected_method_ids = {method.id for method in REGISTERED_METHODS}
    expected_case_ids = {case.id for case in list_cases()}
    if len(method_ids) != len(expected_method_ids) or set(method_ids) != expected_method_ids:
        raise ValueError("showcase method map does not match the registered methods")
    if (
        len(benchmark_cases) != len(expected_case_ids)
        or set(benchmark_cases) != expected_case_ids
    ):
        raise ValueError("showcase input index does not contain the 13 canonical cases exactly once")
    if set(PRIMARY_EXCLUDED_CASE_IDS) - expected_case_ids:
        raise ValueError("primary showcase exclusion references an unknown canonical case")

    # A showcase bake is a complete replacement. Remove only the explicitly
    # registered output subtrees so stale cases or methods cannot survive.
    output_root.mkdir(parents=True, exist_ok=True)
    for child in (*method_ids, "temporal"):
        path = output_root / child
        if path.is_dir():
            shutil.rmtree(path)
    manifest_path = output_root / "manifest.json"
    if manifest_path.is_file():
        manifest_path.unlink()

    records: list[dict] = []

    for case_id in cases:
        frame_path = derived_root / "synth" / case_id / "frame.png"
        frame = np.asarray(Image.open(frame_path).convert("L"), dtype=np.uint8)

        for method_id, method_name in CLASSICAL_IDS.items():
            labels = METHODS[method_name](frame.astype(np.float32) / 255.0).astype(np.uint16)
            method_dir = output_root / method_id / case_id
            method_dir.mkdir(parents=True, exist_ok=True)
            labels_path = method_dir / "labels.png"
            analysis_path = method_dir / "labels.rle"
            preview_path = method_dir / "preview.png"
            Image.fromarray(labels, mode="I;16").save(labels_path, optimize=True)
            analysis_path.write_bytes(encode_label_runs(labels))
            preview(frame, labels).save(preview_path, optimize=True)
            records.append(
                _record(
                    method_id,
                    case_id,
                    labels_path,
                    analysis_path,
                    preview_path,
                    output_root,
                    public_root=public_root,
                    labels_root=output_root.parent,
                    labels_scope="showcase",
                )
            )

        for method_id, source_pattern in METHOD_SOURCES.items():
            labels_path = derived_root / source_pattern.format(case=case_id)
            if not labels_path.is_file():
                raise FileNotFoundError(f"missing baked labels for {method_id}/{case_id}: {labels_path}")
            labels = np.asarray(Image.open(labels_path), dtype=np.uint16)
            method_dir = output_root / method_id / case_id
            method_dir.mkdir(parents=True, exist_ok=True)
            analysis_path = method_dir / "labels.rle"
            preview_path = method_dir / "preview.png"
            analysis_path.write_bytes(encode_label_runs(labels))
            preview(frame, labels).save(preview_path, optimize=True)
            records.append(
                _record(
                    method_id,
                    case_id,
                    labels_path,
                    analysis_path,
                    preview_path,
                    output_root,
                    public_root=public_root,
                    labels_root=derived_root,
                    labels_scope="derived",
                )
            )

    temporal = bake_temporal(derived_root, output_root, public_root=public_root)
    temporal_manifest_path = output_root / "temporal" / "manifest.json"
    canonical_output_file_count = len(records) * 2 + len(CLASSICAL_IDS) * len(cases)
    hashed_output_file_count = (
        canonical_output_file_count + temporal["artifact_count"] + 1
    )
    manifest = {
        "schema": "frothseg.showcase/v1",
        "generated_by": "python -m fslab.pipeline showcase",
        "method_count": len(method_ids),
        "case_count": len(cases),
        "benchmark_case_count": len(benchmark_cases),
        "excluded_primary_cases": list(PRIMARY_EXCLUDED_CASE_IDS),
        "artifact_count": len(records),
        "complete": (
            len(records) == len(method_ids) * len(cases)
            and temporal["complete"] is True
            and hashed_output_file_count
            == (
                len(method_ids) * len(cases) * 2
                + len(CLASSICAL_IDS) * len(cases)
                + temporal["artifact_count"]
                + 1
            )
        ),
        # Every output except this self-describing root manifest is content-addressed.
        "file_count": hashed_output_file_count + 1,
        "hashed_file_count": hashed_output_file_count,
        "methods": method_ids,
        "cases": cases,
        "artifacts": records,
        "temporal": {
            "manifest_path": _public_reference(
                temporal_manifest_path,
                output_root,
                public_root,
            ),
            "manifest_sha256": sha256(temporal_manifest_path),
            "sequence_count": temporal["sequence_count"],
            "frames_per_sequence": temporal["frames_per_sequence"],
            "artifact_count": temporal["artifact_count"],
            "prediction_method_count": temporal["prediction_method_count"],
            "prediction_sequence_count": temporal["prediction_sequence_count"],
            "prediction_frame_count": temporal["prediction_frame_count"],
            "complete": temporal["complete"],
        },
    }
    _write_json(output_root / "manifest.json", manifest)
    return manifest


def bake_temporal(
    derived_root: Path,
    output_root: Path,
    *,
    public_root: Path,
) -> dict:
    """Publish exact truth plus governed L1 and L7 temporal predictions."""
    temporal_root = output_root / "temporal"
    specs = {spec.name: spec for spec in CASES}
    reports = _load_temporal_reports(derived_root)
    sequences: list[dict] = []
    observed_prediction_pairs: set[tuple[str, str]] = set()
    prediction_frame_count = 0

    for case_id in TEMPORAL_CASE_IDS:
        frames: list[dict] = []
        generated = generate_sequence(specs[case_id], frames=TEMPORAL_FRAMES)
        for frame in generated:
            frame_index = int(frame["frame_index"])
            frame_dir = temporal_root / case_id / f"{frame_index:03d}"
            frame_dir.mkdir(parents=True, exist_ok=True)
            source_path = frame_dir / "source.png"
            truth_path = frame_dir / "truth.rle"
            overlay_path = frame_dir / "overlay.png"
            source = np.rint(np.clip(frame["image"], 0.0, 1.0) * 255.0).astype(np.uint8)
            labels = np.asarray(frame["labels"], dtype=np.uint16)
            Image.fromarray(source, mode="L").save(source_path, optimize=True)
            truth_path.write_bytes(encode_label_runs(labels))
            preview(source, labels).save(overlay_path, optimize=True)
            frames.append(
                {
                    "frame_index": frame_index,
                    "source_path": _public_reference(
                        source_path,
                        output_root,
                        public_root,
                    ),
                    "source_sha256": sha256(source_path),
                    "truth_path": _public_reference(
                        truth_path,
                        output_root,
                        public_root,
                    ),
                    "truth_sha256": sha256(truth_path),
                    "overlay_path": _public_reference(
                        overlay_path,
                        output_root,
                        public_root,
                    ),
                    "overlay_sha256": sha256(overlay_path),
                }
            )

        predictions: list[dict] = []
        for method_id, report in reports.items():
            row = report["sequences"].get(case_id)
            if row is None:
                continue
            frame_artifacts = sorted(
                row["frame_artifacts"],
                key=lambda artifact: int(artifact["frame_index"]),
            )
            if [int(artifact["frame_index"]) for artifact in frame_artifacts] != list(
                range(TEMPORAL_FRAMES)
            ):
                raise ValueError(
                    f"{method_id}/{case_id}: temporal prediction frames are incomplete"
                )
            published_frames = [
                _publish_prediction_frame(
                    method_id=method_id,
                    case_id=case_id,
                    report_path=report["path"],
                    artifact=artifact,
                    output_root=output_root,
                    public_root=public_root,
                )
                for artifact in frame_artifacts
            ]
            metrics = row["metrics"]
            missing_metrics = set(TEMPORAL_METRIC_FIELDS) - metrics.keys()
            if missing_metrics:
                raise ValueError(
                    f"{method_id}/{case_id}: missing temporal metrics "
                    f"{sorted(missing_metrics)}"
                )
            predictions.append(
                {
                    "method_id": method_id,
                    "method_slug": report["slug"],
                    "mode": report["mode"],
                    "protocol": report["protocol"],
                    "model_provenance": report["model_provenance"],
                    "evidence_path": report["path"].relative_to(derived_root).as_posix(),
                    "evidence_sha256": sha256(report["path"]),
                    "metrics": metrics,
                    "truth_events": row["truth_events"],
                    "predicted_events": row["predicted_events"],
                    "frames": published_frames,
                }
            )
            observed_prediction_pairs.add((method_id, case_id))
            prediction_frame_count += len(published_frames)

        sequences.append(
            {
                "case_id": case_id,
                "label": f"{case_id.replace('-', ' ').title()} sequence",
                "frames": frames,
                "predictions": predictions,
            }
        )

    expected_prediction_pairs = {
        (method_id, case_id)
        for method_id, config in TEMPORAL_PREDICTION_SOURCES.items()
        for case_id in config["required_cases"]
    }
    method_availability = _temporal_method_availability(reports)
    base_artifact_count = sum(len(sequence["frames"]) * 3 for sequence in sequences)
    prediction_artifact_count = prediction_frame_count * 2
    artifact_count = base_artifact_count + prediction_artifact_count
    manifest = {
        "schema": "frothseg.temporal-showcase/v2",
        "generated_by": "python -m fslab.pipeline showcase",
        "source_kind": "deterministic_generated",
        "label_kind": "ground_truth",
        "sequence_count": len(sequences),
        "frames_per_sequence": TEMPORAL_FRAMES,
        "prediction_method_count": len(TEMPORAL_PREDICTION_SOURCES),
        "prediction_sequence_count": len(observed_prediction_pairs),
        "prediction_frame_count": prediction_frame_count,
        "artifact_count": artifact_count,
        "method_availability": method_availability,
        "complete": (
            len(sequences) == len(TEMPORAL_CASE_IDS)
            and all(len(sequence["frames"]) == TEMPORAL_FRAMES for sequence in sequences)
            and observed_prediction_pairs == expected_prediction_pairs
            and prediction_frame_count
            == len(expected_prediction_pairs) * TEMPORAL_FRAMES
            and len(method_availability) == len(REGISTERED_METHODS)
        ),
        "sequences": sequences,
    }
    _write_json(temporal_root / "manifest.json", manifest)
    return manifest


def _load_temporal_reports(derived_root: Path) -> dict[str, dict]:
    reports: dict[str, dict] = {}
    methods = {method.id: method for method in REGISTERED_METHODS}
    for method_id, config in TEMPORAL_PREDICTION_SOURCES.items():
        report_path = derived_root / str(config["report_path"])
        if not report_path.is_file():
            raise FileNotFoundError(f"missing temporal prediction evidence: {report_path}")
        document = json.loads(report_path.read_text(encoding="utf-8"))
        if document.get("method_id") != method_id:
            raise ValueError(f"{report_path}: temporal method id mismatch")
        if document.get("prediction_kind") != config["mode"]:
            raise ValueError(f"{report_path}: temporal prediction mode mismatch")
        if method_id == "L1":
            rows = {
                row["condition_id"]: {
                    "metrics": {
                        field: row[field]
                        for field in TEMPORAL_METRIC_FIELDS
                        if field in row
                    },
                    "truth_events": row.get("truth_events"),
                    "predicted_events": row.get("predicted_events"),
                    "frame_artifacts": row.get("frame_artifacts"),
                }
                for row in document.get("sequences", [])
            }
        else:
            condition_id = document.get("condition_id")
            rows = {
                condition_id: {
                    "metrics": document.get("temporal_metrics"),
                    "truth_events": document.get("truth_events"),
                    "predicted_events": document.get("predicted_events"),
                    "frame_artifacts": document.get("frame_artifacts"),
                }
            }
        required_cases = set(config["required_cases"])
        if set(rows) != required_cases:
            raise ValueError(
                f"{report_path}: expected temporal cases {sorted(required_cases)}, "
                f"observed {sorted(rows)}"
            )
        for case_id, row in rows.items():
            if not isinstance(row["metrics"], dict):
                raise ValueError(f"{method_id}/{case_id}: missing temporal metrics")
            if not isinstance(row["truth_events"], list):
                raise ValueError(f"{method_id}/{case_id}: missing truth event evidence")
            if not isinstance(row["predicted_events"], list):
                raise ValueError(f"{method_id}/{case_id}: missing predicted event evidence")
            if not isinstance(row["frame_artifacts"], list):
                raise ValueError(f"{method_id}/{case_id}: missing frame artifacts")
        reports[method_id] = {
            "path": report_path,
            "slug": methods[method_id].slug,
            "mode": config["mode"],
            "protocol": document.get("protocol", config["protocol"]),
            "model_provenance": (
                {
                    "checkpoint_sha256": document["checkpoint_sha256"],
                    "device": document["device"],
                }
                if method_id == "L1"
                else {
                    "model_id": document["model_id"],
                    "upstream_commit": document["upstream_commit"],
                    "checkpoint_sha256": document["checkpoint_sha256"],
                    "checkpoint_bytes": document["checkpoint_bytes"],
                    "device": document["device"],
                }
            ),
            "sequences": rows,
        }
    return reports


def _publish_prediction_frame(
    *,
    method_id: str,
    case_id: str,
    report_path: Path,
    artifact: dict,
    output_root: Path,
    public_root: Path,
) -> dict:
    frame_index = int(artifact["frame_index"])
    target_root = (
        output_root
        / "temporal"
        / case_id
        / f"{frame_index:03d}"
        / "predictions"
        / method_id
    )
    target_root.mkdir(parents=True, exist_ok=True)
    published = {"frame_index": frame_index}
    for source_name, target_name in (
        ("prediction", "labels.rle"),
        ("overlay", "overlay.png"),
    ):
        relative_path = artifact.get(f"{source_name}_path")
        expected_sha256 = artifact.get(f"{source_name}_sha256")
        if not isinstance(relative_path, str) or not isinstance(expected_sha256, str):
            raise ValueError(
                f"{method_id}/{case_id}/{frame_index}: incomplete {source_name} evidence"
            )
        source_path = (report_path.parent / relative_path).resolve()
        if not source_path.is_relative_to(report_path.parent.resolve()):
            raise ValueError(f"temporal artifact escapes report directory: {relative_path}")
        if not source_path.is_file() or sha256(source_path) != expected_sha256:
            raise ValueError(
                f"{method_id}/{case_id}/{frame_index}: stale {source_name} evidence"
            )
        if source_name == "prediction":
            labels = decode_label_runs(source_path.read_bytes())
            if not np.any(labels):
                raise ValueError(
                    f"{method_id}/{case_id}/{frame_index}: empty prediction evidence"
                )
        target_path = target_root / target_name
        shutil.copyfile(source_path, target_path)
        published[f"{source_name}_path"] = _public_reference(
            target_path,
            output_root,
            public_root,
        )
        published[f"{source_name}_sha256"] = sha256(target_path)
    return published


def _temporal_method_availability(reports: dict[str, dict]) -> list[dict]:
    availability = []
    for method in REGISTERED_METHODS:
        report = reports.get(method.id)
        if report is not None:
            availability.append(
                {
                    "method_id": method.id,
                    "method_slug": method.slug,
                    "status": "available",
                    "mode": report["mode"],
                    "identity_contract": (
                        "native_persistent_ids"
                        if method.id == "L7"
                        else "hungarian_iou_association"
                    ),
                    "available_sequence_ids": sorted(report["sequences"]),
                    "reason": None,
                }
            )
        else:
            availability.append(
                {
                    "method_id": method.id,
                    "method_slug": method.slug,
                    "status": "not_precomputed",
                    "mode": "framewise_segmentation_only",
                    "identity_contract": "none",
                    "available_sequence_ids": [],
                    "reason": (
                        "No governed identity-aware temporal artifact is "
                        "published for this release."
                    ),
                }
            )
    return availability


def _public_reference(path: Path, output_root: Path, public_root: Path) -> str:
    relative = path.relative_to(output_root)
    return (public_root / relative).relative_to(public_root.parent).as_posix()


def _write_json(path: Path, payload: dict) -> None:
    """Write canonical UTF-8/LF JSON so content hashes survive every checkout."""
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def _record(
    method_id: str,
    case_id: str,
    labels_path: Path,
    analysis_path: Path,
    preview_path: Path,
    output_root: Path,
    *,
    public_root: Path,
    labels_root: Path,
    labels_scope: str,
) -> dict:
    if labels_scope not in {"showcase", "derived"}:
        raise ValueError(f"unknown labels scope: {labels_scope}")
    labels_ref = (
        _public_reference(labels_path, output_root, public_root)
        if labels_scope == "showcase"
        else labels_path.relative_to(labels_root).as_posix()
    )
    return {
        "method_id": method_id,
        "case_id": case_id,
        "labels_path": labels_ref,
        "labels_sha256": sha256(labels_path),
        "labels_scope": labels_scope,
        "analysis_path": _public_reference(
            analysis_path,
            output_root,
            public_root,
        ),
        "analysis_sha256": sha256(analysis_path),
        "preview_path": _public_reference(
            preview_path,
            output_root,
            public_root,
        ),
        "preview_sha256": sha256(preview_path),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--derived-root", type=Path, default=ROOT / "data" / "derived")
    parser.add_argument(
        "--output-root",
        type=Path,
        default=ROOT / "data" / "derived" / "showcase",
    )
    args = parser.parse_args()
    manifest = bake(args.derived_root.resolve(), args.output_root.resolve())
    print(
        json.dumps(
            {
                "methods": manifest["method_count"],
                "cases": manifest["case_count"],
                "artifacts": manifest["artifact_count"],
                "complete": manifest["complete"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
