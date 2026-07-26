"""Export L1 to ONNX and verify numerical parity with ONNX Runtime."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

from .unet_watershed import load_npz_weights


def run(model_dir: Path) -> dict:
    import onnxruntime as ort
    import torch

    manifest = json.loads((model_dir / "run.json").read_text(encoding="utf-8"))
    weights = model_dir / manifest["inference_weights"]["path"]
    model = load_npz_weights(weights, base_channels=int(manifest["config"]["base_channels"]))
    model.eval()
    size = int(manifest["config"]["image_size"])
    example = torch.linspace(0, 1, size * size, dtype=torch.float32).reshape(1, 1, size, size)
    onnx_path = model_dir / "model.onnx"
    torch.onnx.export(
        model,
        example,
        onnx_path,
        input_names=["image"],
        output_names=["logits"],
        dynamic_axes={"image": {0: "batch", 2: "height", 3: "width"},
                      "logits": {0: "batch", 2: "height", 3: "width"}},
        opset_version=18,
        dynamo=False,
    )
    with torch.inference_mode():
        expected = model(example).numpy()
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    actual = session.run(["logits"], {"image": example.numpy()})[0]
    max_abs_error = float(np.max(np.abs(expected - actual)))
    tolerance = 2e-5
    report = {
        "schema": "frothseg.onnx-parity/v1",
        "method": "unet_watershed",
        "opset": 18,
        "input": [1, 1, size, size],
        "max_abs_error": max_abs_error,
        "absolute_tolerance": tolerance,
        "passed": max_abs_error <= tolerance,
        "onnx": {
            "path": onnx_path.name,
            "bytes": onnx_path.stat().st_size,
            "sha256": hashlib.sha256(onnx_path.read_bytes()).hexdigest(),
        },
        "providers": session.get_providers(),
    }
    (model_dir / "onnx-parity.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    if not report["passed"]:
        raise RuntimeError(f"ONNX parity failed: {max_abs_error}")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(run(args.model), indent=2))


if __name__ == "__main__":
    main()
