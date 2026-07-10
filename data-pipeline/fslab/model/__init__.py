"""Reserved for a pure-Python, Pyodide-safe analytic core shared by the offline stages and the live lane. FrothSeg
has none here: the segmentation engines are the classical CV methods in science/segment.py (offline, scikit-image/
OpenCV) and the SAM-class ONNX model that runs in the browser (onnxruntime-web + WebGPU), not Python. The only
Pyodide-safe live helper is fslab.live.bsd_from_labels (numpy-only)."""
