from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from fslab import pipeline
from fslab import showcase as showcase_module
from fslab.model_registry import METHODS
from fslab.registry import list_cases
from fslab.temporal import FRAMEWISE_MODE, NATIVE_VIDEO_MODE
from fslab.showcase import (
    PRIMARY_EXCLUDED_CASE_IDS,
    TEMPORAL_CASE_IDS,
    TEMPORAL_FRAMES,
    decode_label_runs,
)

ROOT = Path(__file__).resolve().parents[1]

#: Files the still lane publishes: fixed by the 12 primary cases x 15 methods contract.
STILL_SHOWCASE_FILES = 445
#: One (method, sequence) pair per registered method per canonical sequence.
PREDICTION_PAIRS = len(METHODS) * len(TEMPORAL_CASE_IDS)
#: 3 base artifacts per frame (source, truth, overlay), 1 label file per prediction frame,
#: and 1 event log per pair.
TEMPORAL_ARTIFACTS = (
    len(TEMPORAL_CASE_IDS) * TEMPORAL_FRAMES * 3
    + PREDICTION_PAIRS * TEMPORAL_FRAMES
    + PREDICTION_PAIRS
)


def test_showcase_manifest_covers_every_registered_method_and_case() -> None:
    path = ROOT / "data" / "derived" / "showcase" / "manifest.json"
    document = json.loads(path.read_text(encoding="utf-8"))

    primary_case_ids = {
        case.id
        for case in list_cases()
        if case.id not in PRIMARY_EXCLUDED_CASE_IDS
    }
    expected_pairs = {
        (method.id, case.id)
        for method in METHODS
        for case in list_cases()
        if case.id in primary_case_ids
    }
    observed_pairs = {
        (artifact["method_id"], artifact["case_id"])
        for artifact in document["artifacts"]
    }

    assert document["schema"] == "frothseg.showcase/v1"
    assert document["complete"] is True
    assert document["method_count"] == len(METHODS) == 15
    assert document["case_count"] == len(primary_case_ids) == 12
    assert document["benchmark_case_count"] == len(list_cases()) == 13
    assert document["excluded_primary_cases"] == ["empty-control"]
    assert document["artifact_count"] == len(expected_pairs) == 180
    # Derived from the contract rather than snapshotted: the still lane ships a fixed set of
    # per-case files, and the temporal lane ships whatever the full method x sequence matrix
    # comes to. Stating it this way makes a coverage regression fail with a readable diff.
    assert document["file_count"] == STILL_SHOWCASE_FILES + TEMPORAL_ARTIFACTS + 1
    assert document["hashed_file_count"] == STILL_SHOWCASE_FILES + TEMPORAL_ARTIFACTS
    assert observed_pairs == expected_pairs
    assert not any(path.parts[-2] == "empty-control" for path in path.parent.rglob("*"))


def test_showcase_labels_previews_and_analysis_match_manifest_hashes() -> None:
    root = ROOT / "data" / "derived"
    document = json.loads((root / "showcase" / "manifest.json").read_text(encoding="utf-8"))

    for artifact in document["artifacts"]:
        for name in ("labels", "preview", "analysis"):
            path = root / artifact[f"{name}_path"]
            assert path.is_file()
            assert hashlib.sha256(path.read_bytes()).hexdigest() == artifact[f"{name}_sha256"]


def test_temporal_showcase_has_real_hashed_prediction_identity_and_event_evidence() -> None:
    root = ROOT / "data" / "derived"
    showcase = json.loads((root / "showcase" / "manifest.json").read_text(encoding="utf-8"))
    temporal_path = root / showcase["temporal"]["manifest_path"]
    assert temporal_path.is_file()
    assert hashlib.sha256(temporal_path.read_bytes()).hexdigest() == showcase["temporal"][
        "manifest_sha256"
    ]
    temporal = json.loads(temporal_path.read_text(encoding="utf-8"))

    assert temporal["schema"] == "frothseg.temporal-showcase/v2"
    assert temporal["source_kind"] == "deterministic_generated"
    assert temporal["label_kind"] == "ground_truth"
    assert temporal["sequence_count"] == len(TEMPORAL_CASE_IDS) == 5
    assert temporal["frames_per_sequence"] == TEMPORAL_FRAMES == 8
    assert temporal["prediction_method_count"] == len(METHODS) == 15
    assert temporal["prediction_sequence_count"] == PREDICTION_PAIRS == 75
    assert temporal["prediction_frame_count"] == PREDICTION_PAIRS * TEMPORAL_FRAMES == 600
    assert temporal["artifact_count"] == TEMPORAL_ARTIFACTS
    assert temporal["complete"] is True
    assert {sequence["case_id"] for sequence in temporal["sequences"]} == set(
        TEMPORAL_CASE_IDS
    )

    for sequence in temporal["sequences"]:
        assert len(sequence["frames"]) == TEMPORAL_FRAMES
        assert {frame["frame_index"] for frame in sequence["frames"]} == set(
            range(TEMPORAL_FRAMES)
        )
        for frame in sequence["frames"]:
            for name in ("source", "truth", "overlay"):
                path = root / frame[f"{name}_path"]
                assert path.is_file()
                assert hashlib.sha256(path.read_bytes()).hexdigest() == frame[
                    f"{name}_sha256"
                ]
        # Every registered method owes a prediction on every sequence. A subset is a gap.
        assert {prediction["method_id"] for prediction in sequence["predictions"]} == {
            method.id for method in METHODS
        }
        for prediction in sequence["predictions"]:
            assert len(prediction["frames"]) == TEMPORAL_FRAMES
            assert set(prediction["metrics"]) >= {
                "idf1",
                "hota",
                "track_fragmentations",
                "event_precision",
                "event_recall",
                "event_f1",
            }
            # Event logs are published beside their frames, not inlined: keeping all 75 of them
            # in the manifest put 10.4 MB of birth/death records in front of every visitor.
            assert isinstance(prediction["truth_event_count"], int)
            assert isinstance(prediction["predicted_event_count"], int)
            events_path = root / prediction["events_path"]
            assert events_path.is_file()
            assert hashlib.sha256(events_path.read_bytes()).hexdigest() == prediction[
                "events_sha256"
            ]
            events = json.loads(events_path.read_text(encoding="utf-8"))
            assert len(events["truth_events"]) == prediction["truth_event_count"]
            assert len(events["predicted_events"]) == prediction["predicted_event_count"]
            evidence_path = root / prediction["evidence_path"]
            assert hashlib.sha256(evidence_path.read_bytes()).hexdigest() == prediction[
                "evidence_sha256"
            ]
            for frame in prediction["frames"]:
                path = root / frame["prediction_path"]
                assert path.is_file()
                assert hashlib.sha256(path.read_bytes()).hexdigest() == frame[
                    "prediction_sha256"
                ]
                labels = decode_label_runs(
                    (root / frame["prediction_path"]).read_bytes()
                )
                truth_frame = next(
                    value
                    for value in sequence["frames"]
                    if value["frame_index"] == frame["frame_index"]
                )
                truth_labels = decode_label_runs(
                    (root / truth_frame["truth_path"]).read_bytes()
                )
                assert labels.shape == truth_labels.shape
                assert labels.max() > 0
            truth_by_frame = {
                frame["frame_index"]: (root / frame["truth_path"]).read_bytes()
                for frame in sequence["frames"]
            }
            assert any(
                (root / frame["prediction_path"]).read_bytes()
                != truth_by_frame[frame["frame_index"]]
                for frame in prediction["frames"]
            )
    availability = {row["method_id"]: row for row in temporal["method_availability"]}
    assert set(availability) == {method.id for method in METHODS}
    for method in METHODS:
        row = availability[method.id]
        assert row["status"] == "available", f"{method.id} is not published"
        assert row["available_sequence_ids"] == sorted(TEMPORAL_CASE_IDS)
    # The one method with a different protocol stays labelled as such, because its identity
    # metrics are not comparable with the framewise lane and must never be ranked against it.
    assert availability["L7"]["mode"] == NATIVE_VIDEO_MODE
    assert availability["L7"]["identity_contract"] == "native_persistent_ids"
    assert all(
        row["mode"] == FRAMEWISE_MODE
        for method_id, row in availability.items()
        if method_id != "L7"
    )


def test_showcase_manifest_hashes_every_output_file_without_orphans() -> None:
    root = ROOT / "data" / "derived"
    showcase_path = root / "showcase" / "manifest.json"
    showcase = json.loads(showcase_path.read_text(encoding="utf-8"))
    expected = {
        artifact[f"{name}_path"]
        for artifact in showcase["artifacts"]
        for name in ("preview", "analysis")
    }
    expected.update(
        artifact["labels_path"]
        for artifact in showcase["artifacts"]
        if artifact["labels_scope"] == "showcase"
    )
    expected.add(showcase["temporal"]["manifest_path"])
    temporal = json.loads((root / showcase["temporal"]["manifest_path"]).read_text(encoding="utf-8"))
    expected.update(
        frame[f"{name}_path"]
        for sequence in temporal["sequences"]
        for frame in sequence["frames"]
        for name in ("source", "truth", "overlay")
    )
    expected.update(
        frame["prediction_path"]
        for sequence in temporal["sequences"]
        for prediction in sequence["predictions"]
        for frame in prediction["frames"]
    )
    expected.update(
        prediction["events_path"]
        for sequence in temporal["sequences"]
        for prediction in sequence["predictions"]
    )
    actual = {
        path.relative_to(root).as_posix()
        for path in showcase_path.parent.rglob("*")
        if path.is_file() and path != showcase_path
    }

    assert actual == expected
    assert len(actual) == showcase["hashed_file_count"] == (
        STILL_SHOWCASE_FILES + TEMPORAL_ARTIFACTS
    )
    assert len(actual) + 1 == showcase["file_count"] == (
        STILL_SHOWCASE_FILES + TEMPORAL_ARTIFACTS + 1
    )


def test_registered_showcase_stage_uses_caller_controlled_roots(
    tmp_path: Path,
    monkeypatch,
) -> None:
    input_root = tmp_path / "input"
    output_root = tmp_path / "output"
    observed: dict[str, Path] = {}

    def fake_bake(derived_root: Path, showcase_root: Path) -> dict:
        observed["input"] = derived_root
        observed["output"] = showcase_root
        return {"complete": True}

    monkeypatch.setattr(pipeline, "bake_showcase_artifacts", fake_bake)

    assert pipeline.bake_showcase(input_root=input_root, output_root=output_root) == {
        "complete": True
    }
    assert observed == {
        "input": input_root.resolve(),
        "output": output_root.resolve() / "showcase",
    }


def test_showcase_bake_keeps_previous_tree_until_staged_tree_is_complete(
    tmp_path: Path,
    monkeypatch,
) -> None:
    derived_root = tmp_path / "derived"
    output_root = derived_root / "showcase"
    output_root.mkdir(parents=True)
    previous = output_root / "previous.txt"
    previous.write_text("stable", encoding="utf-8")

    def fake_bake(
        derived: Path,
        stage: Path,
        *,
        public_root: Path,
    ) -> dict:
        assert derived == derived_root.resolve()
        assert public_root == output_root.resolve()
        assert previous.read_text(encoding="utf-8") == "stable"
        stage.mkdir(parents=True)
        (stage / "manifest.json").write_text("complete", encoding="utf-8")
        return {"complete": True}

    monkeypatch.setattr(showcase_module, "_bake", fake_bake)

    assert showcase_module.bake(derived_root, output_root) == {"complete": True}
    assert not previous.exists()
    assert (output_root / "manifest.json").read_text(encoding="utf-8") == "complete"
    assert not list(derived_root.glob(".showcase-*"))


def test_temporal_publisher_rejects_missing_prediction_artifact(
    tmp_path: Path,
) -> None:
    report_path = tmp_path / "temporal" / "report.json"
    report_path.parent.mkdir()
    report_path.write_text("{}", encoding="utf-8")

    with pytest.raises(ValueError, match="stale prediction evidence"):
        showcase_module._publish_prediction_frame(
            method_id="L1",
            case_id="poly-normal",
            report_path=report_path,
            artifact={
                "frame_index": 0,
                "prediction_path": "missing.rle",
                "prediction_sha256": "0" * 64,
            },
            output_root=tmp_path / "stage",
            public_root=tmp_path / "showcase",
        )
