"""Export L2/L3/N1 checkpoints to ONNX and verify numerical parity."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

from .multitask_models import build_model


def run(
    model_dir: Path,
    output_dir: Path | None = None,
    cache_metadata: Path = Path("data/cache/learned-v2-192.json"),
) -> dict:
    import onnxruntime as ort
    import torch

    manifest = json.loads((model_dir / "run.json").read_text(encoding="utf-8"))
    config = manifest["config"]
    weights_path = model_dir / manifest["inference_weights"]["path"]
    actual_hash = hashlib.sha256(weights_path.read_bytes()).hexdigest()
    if actual_hash != manifest["inference_weights"]["sha256"]:
        raise ValueError("checkpoint checksum mismatch")
    model = build_model(config["method"], int(config["base_channels"]))
    archive = np.load(weights_path)
    model.load_state_dict({
        name: torch.from_numpy(archive[name]) for name in archive.files
    })
    model.eval()
    size = int(json.loads(cache_metadata.read_text(encoding="utf-8"))["image_size"])
    example = torch.linspace(0, 1, size * size).reshape(1, 1, size, size)
    destination = output_dir or model_dir
    destination.mkdir(parents=True, exist_ok=True)
    onnx_path = destination / "model.onnx"
    torch.onnx.export(
        model,
        example,
        onnx_path,
        input_names=["image"],
        output_names=["logits"],
        dynamic_axes={
            "image": {0: "batch", 2: "height", 3: "width"},
            "logits": {0: "batch", 2: "height", 3: "width"},
        },
        opset_version=18,
        dynamo=False,
    )
    with torch.inference_mode():
        expected = model(example).numpy()
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    actual = session.run(["logits"], {"image": example.numpy()})[0]
    max_abs_error = float(np.max(np.abs(expected - actual)))
    tolerance = 3e-5
    report = {
        "schema": "frothseg.onnx-parity/v1",
        "method": config["method"],
        "opset": 18,
        "input": list(example.shape),
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
    (destination / "onnx-parity.json").write_text(
        json.dumps(report, indent=2),
        encoding="utf-8",
    )
    if not report["passed"]:
        raise RuntimeError(f"ONNX parity failed: {max_abs_error}")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument(
        "--output",
        type=Path,
        help="export root; defaults to the model directory for a canonical bake",
    )
    parser.add_argument(
        "--cache-metadata",
        type=Path,
        default=Path("data/cache/learned-v2-192.json"),
    )
    args = parser.parse_args()
    print(json.dumps(run(args.model, args.output, args.cache_metadata), indent=2))


if __name__ == "__main__":
    main()
