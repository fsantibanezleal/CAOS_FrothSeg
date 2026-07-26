# Guide · run the read-only evidence API

The static companion web does not require a server, but the repository includes
a complete read-only FastAPI surface for integrations and internal tooling.

```powershell
./.venv-gpu/Scripts/python.exe -m pip install -r requirements-api.txt
$env:PYTHONPATH = "data-pipeline"
./.venv-gpu/Scripts/python.exe -m uvicorn app.main:app --reload
```

Endpoints:

- `GET /health` and `/healthz`;
- `GET /api/cases`;
- `GET /api/cases/{case_id}/manifest`;
- `GET /api/cases/{case_id}/artifacts/{benchmark|card|masks}`;
- `GET /api/methods`;
- `GET /api/release`;
- `GET /api/temporal/{unet-watershed-v2|sam2-1-hiera-tiny}`.

All endpoints are read-only and serve the same committed evidence the web
consumes. Case ids and artifact names are allow-listed, and resolved paths must
remain under `data/derived`.
