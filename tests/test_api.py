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
    assert health.json()["version"] == "0.04.000"
    release = get("/api/release")
    assert release.status_code == 200
    assert release.json()["complete"] is True


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
    assert get("/api/temporal/unet-watershed-v2").status_code == 200
    assert get("/api/temporal/sam2-1-hiera-tiny").status_code == 200
    assert get("/api/temporal/../../release-report.json").status_code == 404
