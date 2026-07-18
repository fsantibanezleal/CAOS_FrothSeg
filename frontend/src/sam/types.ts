// Shared types for the SAM-class froth segmenter. The same module runs in the browser (onnxruntime-web +
// WebGPU) and in Node (onnxruntime-node) for the offline verification harness, so it depends only on
// @huggingface/transformers + typed arrays, never on the DOM.

export type Device = 'webgpu' | 'wasm' | 'cpu' | 'auto';

export interface InstanceMask {
  data: Uint8Array; // (H*W) row-major 0/1 mask at the ORIGINAL image resolution
  area: number; // pixels
  bbox: [number, number, number, number]; // x, y, w, h
  predIou: number; // SAM's predicted IoU for this mask (decoder head)
  stability: number; // mask stability score (IoU of logits thresholded at +/- offset)
  point: [number, number]; // the grid point that prompted it (x, y)
}

export interface Bsd {
  count: number;
  d10: number | null;
  d50: number | null;
  d90: number | null;
  d32: number | null; // Sauter mean
  pctSmall: number | null; // fraction below d50/2
}

export interface SegResult {
  width: number;
  height: number;
  labels: Int32Array; // (H*W) instance label map, 0 = background
  masks: InstanceMask[]; // kept instances, highest score first
  nInstances: number;
  bsd: Bsd;
  encoderMs: number;
  totalMs: number;
  device: string;
  model: string;
}

export interface AutoMaskOptions {
  gridSize?: number; // points per side of the prompt grid (default 32)
  pointBatch?: number; // points decoded per forward pass (default 64)
  predIouThresh?: number; // drop masks the decoder is unsure about (default 0.86)
  stabilityThresh?: number; // drop unstable masks (default 0.90)
  stabilityOffset?: number; // logit offset for the stability score (default 1.0)
  minAreaPx?: number; // drop specks (default 25)
  maxAreaFrac?: number; // drop masks covering more than this fraction of the frame (default 0.5)
  nmsIou?: number; // suppress duplicates above this IoU (default 0.7)
  cropMarginFrac?: number; // inset the point grid from the border (default 0.02)
  onProgress?: (done: number, total: number) => void;
}
