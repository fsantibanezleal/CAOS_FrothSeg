"""Re-verify every citation added on 2026-08-01 against its primary source, and write the evidence.

Network-dependent by design: it is the point. Run it to reproduce
``verification/froth-citations-2026-08-01.json``.

  ./.venv-gpu/Scripts/python.exe scripts/verify_new_citations.py

What it checks
    Froth DOIs      api.crossref.org/works/<doi>, recording the title, container, volume, issue,
                    pages, issued/online/print dates and the full author list VERBATIM. The title of
                    10.1080/19392699.2026.2676005 is taken from this record and nowhere else: the
                    version circulating in the source dossier was a paraphrase.
    Lineage arXiv   export.arxiv.org/api/query, recording title, published/updated timestamps, the
                    author list and the comment field. Venue strings are asserted only from the
                    comment field, never from a third-party index.
    EoMT query cap  the num_q value in the released COCO instance configs of tue-mps/eomt, plus the
                    line in models/eomt.py that builds the queries as a fixed nn.Embedding.
    Licences        raw LICENSE text and the GitHub API spdx_id for MouseLand/cellpose and
                    tue-mps/eomt, plus the stale "Licence: GPL v3" badge alt-text in the cellpose
                    README that ATTRIBUTION.md warns about.

Nothing below title level is recorded for the froth papers: their abstracts are not retrievable and
no abstract-level claim from them appears anywhere in this repository.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "verification/froth-citations-2026-08-01.json"
UA = "FrothSeg-citation-check/1.0 (mailto:fsantibanez@gmail.com)"

FROTH_DOIS = {
    "chen2025frothreview": "10.1016/j.engappai.2025.110283",
    "yang2026morphological": "10.1007/s42461-025-01442-7",
    "wen2025instancemask": "10.1016/j.flowmeasinst.2025.102892",
    "wang2025samfroth": "10.1016/j.ces.2025.121657",
    "zhang2026leakage": "10.1080/19392699.2026.2676005",
    "prokopov2025unsupervised": "10.5220/0013181100003912",
}

LINEAGE_ARXIV = {
    "kerssies2025eomt": "2503.19108",
    "norouzi2026videomt": "2602.17807",
    "cavagnero2026pmt": "2603.25398",
}

EOMT_CONFIGS = (
    "configs/dinov2/coco/instance/eomt_large_640.yaml",
    "configs/dinov3/coco/instance/eomt_large_640.yaml",
)


def fetch(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8", errors="replace")


def date_parts(block: dict | None) -> str | None:
    if not block or not block.get("date-parts"):
        return None
    return "-".join(str(part) for part in block["date-parts"][0])


def crossref(doi: str) -> dict:
    url = f"https://api.crossref.org/works/{doi}"
    message = json.loads(fetch(url))["message"]
    return {
        "doi": doi,
        "source_url": url,
        "resolves": True,
        "title": " | ".join(message.get("title", [])),
        "container_title": " | ".join(message.get("container-title", [])),
        "type": message.get("type"),
        "volume": message.get("volume"),
        "issue": message.get("issue"),
        "page": message.get("page"),
        "issued": date_parts(message.get("issued")),
        "published_online": date_parts(message.get("published-online")),
        "published_print": date_parts(message.get("published-print")),
        "publisher": message.get("publisher"),
        "authors": [
            f"{a.get('family', '')}, {a.get('given', '')}".strip(", ")
            for a in message.get("author", [])
        ],
        "abstract_present": "abstract" in message,
    }


def arxiv(identifier: str) -> dict:
    url = f"http://export.arxiv.org/api/query?id_list={identifier}"
    body = fetch(url)
    entry = body.split("<entry>", 1)[1]

    def tag(name: str) -> str | None:
        match = re.search(rf"<{name}>(.*?)</{name}>", entry, re.S)
        return re.sub(r"\s+", " ", match.group(1)).strip() if match else None

    return {
        "arxiv_id": identifier,
        "source_url": url,
        "resolves": True,
        "entry_id": tag("id"),
        "title": tag("title"),
        "published": tag("published"),
        "updated": tag("updated"),
        "authors": [
            re.sub(r"\s+", " ", name).strip()
            for name in re.findall(r"<name>(.*?)</name>", entry, re.S)
        ],
        "comment_field": tag("arxiv:comment"),
        "venue_assertion_source": "the arXiv comment field of this entry, nothing else",
    }


def main() -> int:
    froth = {}
    for citation_id, doi in FROTH_DOIS.items():
        froth[citation_id] = crossref(doi)
        print(f"crossref ok: {doi}", flush=True)

    lineage = {}
    for citation_id, identifier in LINEAGE_ARXIV.items():
        lineage[citation_id] = arxiv(identifier)
        print(f"arxiv ok: {identifier}", flush=True)

    query_budget = {"configs": {}}
    for config in EOMT_CONFIGS:
        url = f"https://raw.githubusercontent.com/tue-mps/eomt/master/{config}"
        text = fetch(url)
        match = re.search(r"num_q:\s*(\d+)", text)
        query_budget["configs"][config] = {
            "source_url": url,
            "num_q": int(match.group(1)) if match else None,
        }
    model_url = "https://raw.githubusercontent.com/tue-mps/eomt/master/models/eomt.py"
    model_source = fetch(model_url)
    query_budget["query_table_is_fixed_size"] = {
        "source_url": model_url,
        "line": next(
            (line.strip() for line in model_source.splitlines() if "nn.Embedding(num_q" in line),
            None,
        ),
    }

    licences = {}
    for name, repo in (("cellpose", "MouseLand/cellpose"), ("eomt", "tue-mps/eomt")):
        api_url = f"https://api.github.com/repos/{repo}"
        api = json.loads(fetch(api_url))
        licences[name] = {
            "repo": repo,
            "api_url": api_url,
            "default_branch": api.get("default_branch"),
            "spdx_id": (api.get("license") or {}).get("spdx_id"),
            "license_name": (api.get("license") or {}).get("name"),
        }
    licence_url = "https://raw.githubusercontent.com/MouseLand/cellpose/main/LICENSE"
    licence_text = fetch(licence_url)
    readme_text = fetch("https://raw.githubusercontent.com/MouseLand/cellpose/main/README.md")
    licences["cellpose"].update({
        "license_file_url": licence_url,
        "license_file_bytes": len(licence_text.encode("utf-8")),
        "license_file_is_bsd3": all(
            phrase in licence_text
            for phrase in (
                "Redistribution and use in source and binary forms",
                "Redistributions of source code must retain",
                "Redistributions in binary form must reproduce",
                "Neither the name of HHMI",
            )
        ),
        "readme_badge_alt_text": next(
            (line.strip() for line in readme_text.splitlines() if "GPL v3" in line),
            None,
        ),
        "note": "The LICENSE file and the SPDX identifier are the authority. The README badge "
                "alt-text is stale and must not be used to 'correct' the registry to GPL-3.0.",
    })

    document = {
        "check": "froth-citations-and-lineage",
        "schema": "frothseg.citation-verification/v1",
        "date": date.today().isoformat(),
        "produced_by": "scripts/verify_new_citations.py",
        "task": "PLAN-PROPOSAL.md section 6, rows 'Six new froth citations', 'EoMT lineage', "
                "and the L5 ATTRIBUTION clause of the cpdino row",
        "policy": "Titles, venues, dates and authors only for the froth papers. Their abstracts are "
                  "not retrievable and no abstract-level claim from them is printed anywhere.",
        "froth_citations": froth,
        "lineage_citations": lineage,
        "eomt_query_budget": query_budget,
        "licences": licences,
        "all_dois_resolve": all(record["resolves"] for record in froth.values()),
        "all_arxiv_resolve": all(record["resolves"] for record in lineage.values()),
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(document, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
