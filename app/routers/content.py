"""GET-only endpoints serving the committed artifacts (read-only). No write paths."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..services import content

router = APIRouter(prefix="/api")


@router.get("/cases")
def list_cases() -> dict:
    return content.load_index()


@router.get("/cases/{case_id}/manifest")
def get_manifest(case_id: str) -> dict:
    m = content.load_manifest(case_id)
    if m is None:
        raise HTTPException(status_code=404, detail="unknown case")
    return m


@router.get("/cases/{case_id}/artifacts/{artifact_name}")
def get_case_artifact(case_id: str, artifact_name: str) -> dict:
    artifact = content.load_case_json_artifact(case_id, artifact_name)
    if artifact is None:
        raise HTTPException(status_code=404, detail="unknown case or artifact")
    return artifact


@router.get("/methods")
def get_methods() -> dict:
    document = content.load_named_document("method-benchmark.json")
    if document is None:
        raise HTTPException(status_code=404, detail="method benchmark unavailable")
    return document


@router.get("/release")
def get_release() -> dict:
    document = content.load_named_document("release-report.json")
    if document is None:
        raise HTTPException(status_code=404, detail="release report unavailable")
    return document


@router.get("/temporal/{method_id}")
def get_temporal(method_id: str) -> dict:
    document = content.load_temporal(method_id)
    if document is None:
        raise HTTPException(status_code=404, detail="unknown temporal method")
    return document
