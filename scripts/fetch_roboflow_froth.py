"""Fetch the licensed Roboflow Froth dataset into ignored raw storage.

The API key is read only from ``ROBOFLOW_API_KEY`` and is never written to
provenance or printed. The downloaded archive is retained only long enough to
verify and safely extract it.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import tempfile
import urllib.parse
import urllib.request
import zipfile
from datetime import UTC, datetime
from pathlib import Path


WORKSPACE = "froth-tmvvu"
PROJECT = "froth-rk6ka"
VERSION = 1
SOURCE_URL = f"https://universe.roboflow.com/{WORKSPACE}/{PROJECT}"
LICENSE = "CC-BY-NC-SA-4.0"


def _safe_extract(archive: Path, destination: Path) -> None:
    root = destination.resolve()
    with zipfile.ZipFile(archive) as bundle:
        for member in bundle.infolist():
            target = (destination / member.filename).resolve()
            if root not in target.parents and target != root:
                raise ValueError(f"unsafe archive member: {member.filename}")
        bundle.extractall(destination)


def _request_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=120) as response:
        return json.load(response)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/raw/roboflow-froth-rk6ka"),
    )
    parser.add_argument("--format", default="coco-segmentation")
    args = parser.parse_args()

    api_key = os.environ.get("ROBOFLOW_API_KEY")
    if not api_key:
        raise SystemExit(
            "ROBOFLOW_API_KEY is required. Create a scoped key in Roboflow; "
            "do not commit it."
        )
    output = args.output.resolve()
    if output.exists():
        raise SystemExit(f"refusing to overwrite existing raw dataset: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)

    query = urllib.parse.urlencode({"api_key": api_key})
    endpoint = (
        f"https://api.roboflow.com/{WORKSPACE}/{PROJECT}/{VERSION}/"
        f"{urllib.parse.quote(args.format)}?{query}"
    )
    export = _request_json(endpoint)
    download_url = export.get("export", {}).get("link") or export.get("download")
    if not download_url:
        raise RuntimeError("Roboflow export response did not contain a download link")

    with tempfile.TemporaryDirectory(prefix="frothseg-rf-", dir=output.parent) as temp_name:
        temp = Path(temp_name)
        archive = temp / "dataset.zip"
        with urllib.request.urlopen(download_url, timeout=300) as response:
            with archive.open("wb") as stream:
                shutil.copyfileobj(response, stream)
        archive_sha256 = hashlib.sha256(archive.read_bytes()).hexdigest()
        extracted = temp / "extracted"
        extracted.mkdir()
        _safe_extract(archive, extracted)
        provenance = {
            "schema": "frothseg.raw-source/v1",
            "source_id": "roboflow-froth-rk6ka",
            "source_url": SOURCE_URL,
            "license": LICENSE,
            "workspace": WORKSPACE,
            "project": PROJECT,
            "version": VERSION,
            "format": args.format,
            "archive_sha256": archive_sha256,
            "fetched_at_utc": datetime.now(UTC).isoformat(),
            "credential_persisted": False,
        }
        (extracted / "frothseg-source.json").write_text(
            json.dumps(provenance, indent=2) + "\n",
            encoding="utf-8",
        )
        extracted.replace(output)
    print(output)


if __name__ == "__main__":
    main()
