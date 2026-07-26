# Create all three venvs + install per-lane requirements + the editable package. Idempotent. No global installs.
# .ps1 parity of setup.sh (Felipe runs PowerShell on Windows).
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$py = if ($env:PYTHON) { $env:PYTHON } else { "python" }

function Get-VenvPy($dir) {
  $p = Join-Path $dir "Scripts\python.exe"
  if (-not (Test-Path $p)) { $p = Join-Path $dir "bin/python" }
  return $p
}

Write-Host "[setup] .venv-pipeline (offline lane)..."
if (-not (Test-Path ".venv-pipeline")) { & $py -m venv .venv-pipeline }
$vp = Get-VenvPy ".venv-pipeline"
& $vp -m pip install --upgrade pip -q
& $vp -m pip install -q -r requirements-precompute.txt -r requirements-dev.txt -r requirements-api.txt
& $vp -m pip install -q -e .
Write-Host "[setup] .venv-pipeline ready."

Write-Host "[setup] .venv-gpu (offline CUDA training/inference lane)..."
if (-not (Test-Path ".venv-gpu")) { & $py -m venv .venv-gpu }
$vg = Get-VenvPy ".venv-gpu"
& $vg -m pip install --upgrade pip -q
$env:SAM2_BUILD_CUDA = "0" # Native Windows: skip only optional CC post-processing extension.
& $vg -m pip install -q -r requirements-gpu.txt -r requirements-dev.txt -r requirements-api.txt
Remove-Item Env:SAM2_BUILD_CUDA -ErrorAction SilentlyContinue
& $vg -m pip install -q -e .
& $vg scripts/check_cuda.py
Write-Host "[setup] .venv-gpu ready."

Write-Host "[setup] .venv (runtime/live-thin lane)..."
if (-not (Test-Path ".venv")) { & $py -m venv .venv }
$vr = Get-VenvPy ".venv"
& $vr -m pip install --upgrade pip -q
& $vr -m pip install -q -r requirements.txt
Write-Host "[setup] .venv ready."

Write-Host "[setup] done. Next: train/bake offline, then ./scripts/dev.ps1"
