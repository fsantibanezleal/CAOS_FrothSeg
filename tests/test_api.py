import pathlib

import anyio
import httpx

from app.main import app


async def _get(path: str) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


def get(path: str) -> httpx.Response:
    return anyio.run(_get, path)


def test_health_and_release_evidence():
    health = get("/health")
    assert health.status_code == 200
    # Read from VERSION, the single source of truth, never a literal. Hardcoding it here
    # meant a legitimate version bump broke a test that is not about versioning at all.
    expected = (pathlib.Path(__file__).resolve().parent.parent / "VERSION").read_text(
        encoding="utf-8"
    ).strip()
    assert health.json()["version"] == expected
    release = get("/api/release")
    assert release.status_code == 200
    document = release.json()
    assert document["complete"] is (len(document["errors"]) == 0)
    assert document["schema"] == "frothseg.release/v2"


def test_method_and_case_endpoints():
    methods = get("/api/methods")
    assert methods.status_code == 200
    assert methods.json()["implemented_count"] == 15
    cases = get("/api/cases")
    assert cases.status_code == 200
    case_id = cases.json()["cases"][0]["case_id"]
    assert get(f"/api/cases/{case_id}/manifest").status_code == 200
    assert get(f"/api/cases/{case_id}/artifacts/benchmark").status_code == 200
    assert get(f"/api/cases/{case_id}/artifacts/unknown").status_code == 404


def test_temporal_endpoints_are_allowlisted():
    from fslab.model_registry import METHODS

    # Every registered method serves its temporal evidence; nothing outside the registry does.
    for method in METHODS:
        assert get(f"/api/temporal/{method.slug}").status_code == 200, method.id
    assert get("/api/temporal/../../release-report.json").status_code == 404
    assert get("/api/temporal/not-a-method").status_code == 404
