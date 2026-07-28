# Security and dependency posture

FrothSeg's deployed surface is a static GitHub Pages SPA. It has no server
actions, cookies, authentication, upload endpoint, or application database.
Uploaded frames stay in the browser. The research and training environments are
offline command-line lanes and do not listen on a network port.

The browser ONNX/WASM stack is code-split. It is neither transferred nor
initialized during normal browsing and is fetched only after the user
explicitly selects and runs the legacy SlimSAM interaction. Validated live
classical twins C1/C3/C4 need no model download; C2/C5/C6/C7 and all
authoritative learned/foundation benchmarks remain offline artifacts.

## Frontend dependency gate

The July 2026 rebuild upgraded `@huggingface/transformers` from 3.8.1 to 4.2.0
and Vitest from 2.1.9 to 4.1.10. It also pins patched `adm-zip`, `postcss`, and
`sharp` transitive releases. This removed the critical Vitest file-read/code
execution advisory and the vulnerable image/archive dependencies while keeping
all eight frontend tests and the production build green.

`npm audit --omit=dev` retains one advisory represented as two dependency
nodes: `GHSA-qwww-vcr4-c8h2` in React Router. It concerns React Server
Components action execution. FrothSeg uses only `BrowserRouter` in a static SPA
and defines no RSC or server action, so the vulnerable code path is absent.
NPM's suggested downgrade to 7.11.0 reintroduces multiple XSS, redirect, RCE,
and denial-of-service advisories and is explicitly rejected. Track the upstream
fix and upgrade when a non-vulnerable current release exists.

## Raw-data handling

- `data/raw/`, local calibration overlays, credentials, large checkpoints, and
  run logs are ignored.
- No dataset fetcher ships with a credential path. The Roboflow fetcher was removed on
  2026-07-28 with its source; any future fetcher must read its credential from the
  environment only and must never persist it into provenance.
- `scripts/import_real_coco.py` rejects missing licenses, missing grouping,
  absent physical calibration, leakage, and unreviewed annotations.
- Release evidence contains source identifiers, hashes, metrics, and review
  state, not third-party raw images or secrets.

## Release behavior

Develop deployments are allowed only as explicitly incomplete evidence
deployments. A versioned release remains blocked until the scientific gate,
including the real held-out lane and synchronized tag, passes.

The production build materializes every declared BrowserRouter route as its own
GitHub Pages `index.html`, so direct/deep links return HTTP 200 instead of
relying on a status-404 SPA fallback.
