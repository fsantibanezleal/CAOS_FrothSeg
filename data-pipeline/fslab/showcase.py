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


def bake(derived_root: Path, output_root: Path) -> dict:
    derived_root = derived_root.resolve()
    output_root = output_root.resolve()
    case_index = json.loads((derived_root / "manifests" / "index.json").read_text(encoding="utf-8"))
    cases = [row["case_id"] for row in case_index["cases"]]
    method_ids = [*CLASSICAL_IDS, *METHOD_SOURCES]
    expected_method_ids = {method.id for method in REGISTERED_METHODS}
    expected_case_ids = {case.id for case in list_cases()}
    if len(method_ids) != len(expected_method_ids) or set(method_ids) != expected_method_ids:
        raise ValueError("showcase method map does not match the registered methods")
    if len(cases) != len(expected_case_ids) or set(cases) != expected_case_ids:
        raise ValueError("showcase input index does not contain the 13 canonical cases exactly once")

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
                    labels_root=derived_root,
                    labels_scope="derived",
                )
            )

    temporal = bake_temporal(output_root)
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
        "artifact_count": len(records),
        "complete": (
            len(records) == len(method_ids) * len(cases)
            and temporal["complete"] is True
            and hashed_output_file_count
            == (
                len(method_ids) * len(cases) * 2
                + len(CLASSICAL_IDS) * len(cases)
                + len(TEMPORAL_CASE_IDS) * TEMPORAL_FRAMES * 3
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
            "manifest_path": temporal_manifest_path.relative_to(output_root.parent).as_posix(),
            "manifest_sha256": sha256(temporal_manifest_path),
            "sequence_count": temporal["sequence_count"],
            "frames_per_sequence": temporal["frames_per_sequence"],
            "artifact_count": temporal["artifact_count"],
            "complete": temporal["complete"],
        },
    }
    (output_root / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return manifest


def bake_temporal(output_root: Path) -> dict:
    """Bake five deterministic 8-frame source + exact-truth temporal sequences."""
    temporal_root = output_root / "temporal"
    specs = {spec.name: spec for spec in CASES}
    sequences: list[dict] = []

    for case_id in TEMPORAL_CASE_IDS:
        frames: list[dict] = []
        for frame in generate_sequence(specs[case_id], frames=TEMPORAL_FRAMES):
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
                    "source_path": source_path.relative_to(output_root.parent).as_posix(),
                    "source_sha256": sha256(source_path),
                    "truth_path": truth_path.relative_to(output_root.parent).as_posix(),
                    "truth_sha256": sha256(truth_path),
                    "overlay_path": overlay_path.relative_to(output_root.parent).as_posix(),
                    "overlay_sha256": sha256(overlay_path),
                    "prediction_path": None,
                    "prediction_sha256": None,
                }
            )
        sequences.append(
            {
                "case_id": case_id,
                "label": f"{case_id.replace('-', ' ').title()} generated source and exact truth",
                "frames": frames,
            }
        )

    artifact_count = sum(len(sequence["frames"]) * 3 for sequence in sequences)
    manifest = {
        "schema": "frothseg.temporal-showcase/v1",
        "generated_by": "python -m fslab.pipeline showcase",
        "source_kind": "deterministic_generated",
        "label_kind": "ground_truth",
        "prediction_method": None,
        "sequence_count": len(sequences),
        "frames_per_sequence": TEMPORAL_FRAMES,
        "artifact_count": artifact_count,
        "complete": (
            len(sequences) == len(TEMPORAL_CASE_IDS)
            and all(len(sequence["frames"]) == TEMPORAL_FRAMES for sequence in sequences)
            and artifact_count == len(TEMPORAL_CASE_IDS) * TEMPORAL_FRAMES * 3
        ),
        "sequences": sequences,
    }
    (temporal_root / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return manifest


def _record(
    method_id: str,
    case_id: str,
    labels_path: Path,
    analysis_path: Path,
    preview_path: Path,
    output_root: Path,
    *,
    labels_root: Path,
    labels_scope: str,
) -> dict:
    if labels_scope not in {"showcase", "derived"}:
        raise ValueError(f"unknown labels scope: {labels_scope}")
    labels_ref = labels_path.relative_to(labels_root).as_posix()
    return {
        "method_id": method_id,
        "case_id": case_id,
        "labels_path": labels_ref,
        "labels_sha256": sha256(labels_path),
        "labels_scope": labels_scope,
        "analysis_path": analysis_path.relative_to(output_root.parent).as_posix(),
        "analysis_sha256": sha256(analysis_path),
        "preview_path": preview_path.relative_to(output_root.parent).as_posix(),
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
