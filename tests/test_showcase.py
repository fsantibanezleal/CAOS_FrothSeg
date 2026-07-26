from __future__ import annotations

import hashlib
import json
from pathlib import Path

from fslab import pipeline
from fslab.model_registry import METHODS
from fslab.registry import list_cases
from fslab.showcase import TEMPORAL_CASE_IDS, TEMPORAL_FRAMES

ROOT = Path(__file__).resolve().parents[1]


def test_showcase_manifest_covers_every_registered_method_and_case() -> None:
    path = ROOT / "data" / "derived" / "showcase" / "manifest.json"
    document = json.loads(path.read_text(encoding="utf-8"))

    expected_pairs = {
        (method.id, case.id)
        for method in METHODS
        for case in list_cases()
    }
    observed_pairs = {
        (artifact["method_id"], artifact["case_id"])
        for artifact in document["artifacts"]
    }

    assert document["schema"] == "frothseg.showcase/v1"
    assert document["complete"] is True
    assert document["method_count"] == len(METHODS) == 15
    assert document["case_count"] == len(list_cases()) == 13
    assert document["artifact_count"] == len(expected_pairs) == 195
    assert document["file_count"] == 603
    assert document["hashed_file_count"] == 602
    assert observed_pairs == expected_pairs


def test_showcase_labels_previews_and_analysis_match_manifest_hashes() -> None:
    root = ROOT / "data" / "derived"
    document = json.loads((root / "showcase" / "manifest.json").read_text(encoding="utf-8"))

    for artifact in document["artifacts"]:
        for name in ("labels", "preview", "analysis"):
            path = root / artifact[f"{name}_path"]
            assert path.is_file()
            assert hashlib.sha256(path.read_bytes()).hexdigest() == artifact[f"{name}_sha256"]


def test_temporal_showcase_has_five_hashed_eight_frame_truth_sequences() -> None:
    root = ROOT / "data" / "derived"
    showcase = json.loads((root / "showcase" / "manifest.json").read_text(encoding="utf-8"))
    temporal_path = root / showcase["temporal"]["manifest_path"]
    assert temporal_path.is_file()
    assert hashlib.sha256(temporal_path.read_bytes()).hexdigest() == showcase["temporal"][
        "manifest_sha256"
    ]
    temporal = json.loads(temporal_path.read_text(encoding="utf-8"))

    assert temporal["schema"] == "frothseg.temporal-showcase/v1"
    assert temporal["source_kind"] == "deterministic_generated"
    assert temporal["label_kind"] == "ground_truth"
    assert temporal["prediction_method"] is None
    assert temporal["sequence_count"] == len(TEMPORAL_CASE_IDS) == 5
    assert temporal["frames_per_sequence"] == TEMPORAL_FRAMES == 8
    assert temporal["artifact_count"] == 5 * 8 * 3
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
            assert frame["prediction_path"] is None
            assert frame["prediction_sha256"] is None
            for name in ("source", "truth", "overlay"):
                path = root / frame[f"{name}_path"]
                assert path.is_file()
                assert hashlib.sha256(path.read_bytes()).hexdigest() == frame[
                    f"{name}_sha256"
                ]


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
    actual = {
        path.relative_to(root).as_posix()
        for path in showcase_path.parent.rglob("*")
        if path.is_file() and path != showcase_path
    }

    assert actual == expected
    assert len(actual) == showcase["hashed_file_count"] == 602
    assert len(actual) + 1 == showcase["file_count"] == 603


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
