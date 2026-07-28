"""Fail-fast validation for FrothSeg's offline GPU lane."""

from __future__ import annotations

import json
import sys

import torch


def main() -> int:
    if "+cu126" not in torch.__version__:
        raise SystemExit(
            f"GPU contract failed: expected a +cu126 PyTorch wheel, got {torch.__version__!r}."
        )
    if not torch.cuda.is_available():
        raise SystemExit(
            "GPU contract failed: torch.cuda.is_available() is false. "
            "Do not train or benchmark with a silent CPU fallback."
        )

    device = torch.device("cuda:0")
    left = torch.randn((1024, 1024), device=device)
    right = torch.randn((1024, 1024), device=device)
    result = left @ right
    torch.cuda.synchronize(device)

    props = torch.cuda.get_device_properties(device)
    report = {
        "torch": torch.__version__,
        "cuda_runtime": torch.version.cuda,
        "device": props.name,
        "compute_capability": f"{props.major}.{props.minor}",
        "total_vram_mib": round(props.total_memory / 1024**2),
        "smoke_shape": list(result.shape),
        "peak_allocated_mib": round(torch.cuda.max_memory_allocated(device) / 1024**2, 1),
    }
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
