"""Load the committed CONTRACT-2 artifacts read-only (index, manifests, traces). Path-traversal guarded."""
from __future__ import annotations

import json
from pathlib import Path

from ..config import REPO_ROOT, Settings


def _derived() -> Path:
    return (REPO_ROOT / Settings().data_dir).resolve()


def load_index() -> dict:
    p = _derived() / "manifests" / "index.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {"cases": []}


def load_manifest(case_id: str) -> dict | None:
    p = _derived() / "manifests" / f"{case_id}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def _load_json(path: Path) -> dict | None:
    root = _derived()
    resolved = path.resolve()
    try:
        resolved.relative_to(root)
    except ValueError:
        return None
    return json.loads(resolved.read_text(encoding="utf-8")) if resolved.is_file() else None


def load_case_json_artifact(case_id: str, artifact_name: str) -> dict | None:
    allowed = {"benchmark", "card", "masks"}
    if artifact_name not in allowed:
        return None
    return _load_json(_derived() / "synth" / case_id / f"{artifact_name}.json")


def load_named_document(name: str) -> dict | None:
    if name not in {"method-benchmark.json", "release-report.json", "sam_benchmark.json"}:
        return None
    return _load_json(_derived() / name)


def load_temporal(method_id: str) -> dict | None:
    """Serve a temporal report by method slug.

    The allowlist is the registry itself, so adding a method to the ladder exposes its evidence
    without a second list to forget, while an arbitrary path still cannot reach the filesystem.
    """
    from fslab.model_registry import BY_SLUG

    if method_id not in BY_SLUG:
        return None
    return _load_json(_derived() / "temporal" / f"{method_id}.json")
