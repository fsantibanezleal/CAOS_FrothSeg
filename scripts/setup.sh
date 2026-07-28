#!/usr/bin/env bash
# Create all three venvs + install per-lane requirements + the editable package. Idempotent. No global installs.
#   .venv-pipeline = heavy OFFLINE lane (data-pipeline/requirements.txt) + dev + editable pkg  (local-only)
#   .venv          = runtime/live-thin lane (requirements.txt)                                  (what ships)
# Dormant lanes are skipped gracefully. Re-runnable.
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PYTHON:-python}"

mkvenv() { [ -d "$1" ] || "$PY" -m venv "$1"; }
venvpy() { local p="$1/bin/python"; [ -x "$p" ] || p="$1/Scripts/python.exe"; echo "$p"; }

echo "[setup] .venv-pipeline (offline lane)…"
mkvenv .venv-pipeline
VP="$(venvpy .venv-pipeline)"
"$VP" -m pip install --upgrade pip -q
"$VP" -m pip install -q -r requirements-precompute.txt -r requirements-dev.txt -r requirements-api.txt
"$VP" -m pip install -q -e .
echo "[setup] .venv-pipeline ready."

echo "[setup] .venv-gpu (offline CUDA training/inference lane)..."
mkvenv .venv-gpu
VG="$(venvpy .venv-gpu)"
"$VG" -m pip install --upgrade pip -q
"$VG" -m pip install -q -r requirements-gpu.txt -r requirements-dev.txt -r requirements-api.txt
"$VG" -m pip install -q -e .
"$VG" scripts/check_cuda.py
echo "[setup] .venv-gpu ready."

echo "[setup] .venv (runtime/live-thin lane)…"
mkvenv .venv
VR="$(venvpy .venv)"
"$VR" -m pip install --upgrade pip -q
"$VR" -m pip install -q -r requirements.txt
echo "[setup] .venv ready."

echo "[setup] done. Next: train/bake offline, then ./scripts/dev.sh"
