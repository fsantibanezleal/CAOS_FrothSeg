// The SAM-class automatic mask generator for flotation froth: run a SAM-family foundation model (SlimSAM /
// MobileSAM via @huggingface/transformers) with a dense grid of point prompts, keep the confident + stable
// masks, dedupe by NMS, and reduce to an instance-label map + bubble-size distribution. Zero-shot: NO froth
// training labels. This is the product's live core; it runs in the browser on WebGPU (WASM fallback) and in
// Node (onnxruntime-node) for the offline verification harness, sharing this exact code.
//
// Algorithm = the standard SamAutomaticMaskGenerator (Kirillov et al. 2023, SAM): the image is encoded once,
// then each grid point is decoded to 3 candidate masks; we take the highest predicted-IoU candidate, score its
// stability (IoU of the logits thresholded at +/- an offset), filter on predicted-IoU / stability / area, and
// suppress duplicates with greedy IoU NMS.
import { AutoProcessor, env, SamModel, Tensor } from '@huggingface/transformers';

import { bsdFromAreas } from './morphometry';
import type { AutoMaskOptions, Device, InstanceMask, SegResult } from './types';

// Force SINGLE-THREADED onnxruntime-web WASM. The multi-threaded WASM backend needs SharedArrayBuffer, which
// requires cross-origin-isolation (COOP/COEP) headers a static host like GitHub Pages cannot set; without them
// the threaded backend stalls. Single-threaded is slower but works everywhere; WebGPU (when available) is the
// fast path and does not need SharedArrayBuffer either.
if (typeof env !== 'undefined' && env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
}

// SlimSAM-77 (uniform-pruned SAM) is tiny + browser-ready via transformers.js; MobileSAM is the alternate.
export const DEFAULT_MODEL = 'Xenova/slimsam-77-uniform';

interface RawImageLike {
  width: number;
  height: number;
}

interface Embeddings {
  image_embeddings: Tensor;
  image_positional_embeddings: Tensor;
  reshaped: [number, number]; // [Hr, Wr] the SAM-resized size
  original: [number, number]; // [Horig, Worig]
}

export class FrothSegmenter {
  private model: any = null;
  private processor: any = null;
  readonly modelId: string;
  device = 'unknown';

  constructor(modelId: string = DEFAULT_MODEL) {
    this.modelId = modelId;
  }

  /** Load the model + processor. `device` 'auto' PROBES for a real WebGPU adapter first (loading with a device
   *  that has no adapter loads fine but then fails at inference), so it only uses WebGPU when it will actually
   *  work, else the single-threaded WASM backend in the browser or CPU (onnxruntime-node) in Node. */
  async load(device: Device = 'auto', dtype: string = 'fp32'): Promise<void> {
    const chosen = device === 'auto' ? await pickDevice() : device;
    const opts = chosen === 'default' ? { dtype: dtype as any } : { device: chosen as any, dtype: dtype as any };
    try {
      this.model = await SamModel.from_pretrained(this.modelId, opts);
      this.processor = await AutoProcessor.from_pretrained(this.modelId);
      this.device = chosen;
    } catch (e) {
      // one fallback: if a non-wasm device failed to load, retry on wasm (always available in the browser)
      if (chosen !== 'wasm' && chosen !== 'default') {
        this.model = await SamModel.from_pretrained(this.modelId, { device: 'wasm' as any, dtype: dtype as any });
        this.processor = await AutoProcessor.from_pretrained(this.modelId);
        this.device = 'wasm';
      } else {
        throw e;
      }
    }
  }

  private async embed(image: RawImageLike): Promise<Embeddings> {
    const inputs = await this.processor(image);
    const emb = await this.model.get_image_embeddings(inputs);
    const reshaped = arr2(inputs.reshaped_input_sizes);
    const original = arr2(inputs.original_sizes);
    return { ...emb, reshaped, original };
  }

  /** Segment an image into froth-bubble instances. `image` is a transformers.js RawImage (or {width,height}
   *  compatible object the processor accepts). */
  async segment(image: RawImageLike, opts: AutoMaskOptions = {}): Promise<SegResult> {
    if (!this.model) throw new Error('call load() first');
    const o = withDefaults(opts);
    const t0 = now();
    const emb = await this.embed(image);
    const encoderMs = now() - t0;
    const [H, W] = emb.original;
    const [Hr, Wr] = emb.reshaped;

    const points = gridPoints(W, H, o.gridSize, o.cropMarginFrac);
    const candidates: InstanceMask[] = [];
    for (let i = 0; i < points.length; i += o.pointBatch) {
      const batch = points.slice(i, i + o.pointBatch);
      const cands = await this.decodeBatch(emb, batch, W, H, Hr, Wr, o);
      candidates.push(...cands);
      o.onProgress?.(Math.min(i + o.pointBatch, points.length), points.length);
    }

    const kept = nms(candidates, o.nmsIou);
    const labels = paintLabels(kept, W, H);
    const areas = kept.map((m) => m.area);
    return {
      width: W,
      height: H,
      labels,
      masks: kept,
      nInstances: kept.length,
      bsd: bsdFromAreas(areas),
      encoderMs: Math.round(encoderMs),
      totalMs: Math.round(now() - t0),
      device: this.device,
      model: this.modelId,
    };
  }

  private async decodeBatch(
    emb: Embeddings,
    batch: Array<[number, number]>,
    W: number,
    H: number,
    Hr: number,
    Wr: number,
    o: Required<Omit<AutoMaskOptions, 'onProgress'>> & Pick<AutoMaskOptions, 'onProgress'>,
  ): Promise<InstanceMask[]> {
    const K = batch.length;
    // SAM scales prompt points into the resized frame; build the tensors directly (avoids re-encoding).
    const pts = new Float32Array(K * 2);
    const lbls = new BigInt64Array(K);
    for (let k = 0; k < K; k++) {
      pts[k * 2] = (batch[k][0] * Wr) / W;
      pts[k * 2 + 1] = (batch[k][1] * Hr) / H;
      lbls[k] = 1n;
    }
    const input_points = new Tensor('float32', pts, [1, K, 1, 2]);
    const input_labels = new Tensor('int64', lbls, [1, K, 1]);
    const out = await this.model({
      image_embeddings: emb.image_embeddings,
      image_positional_embeddings: emb.image_positional_embeddings,
      input_points,
      input_labels,
    });
    const iou = out.iou_scores.data as Float32Array; // [1,K,3]
    const md = out.pred_masks.dims as number[]; // [1,K,3,Hl,Wl]
    const Hl = md[3];
    const Wl = md[4];
    const logits = out.pred_masks.data as Float32Array; // [1,K,3,Hl,Wl]
    const per = 3 * Hl * Wl;
    const out_masks: InstanceMask[] = [];
    for (let k = 0; k < K; k++) {
      // pick the highest predicted-IoU of the 3 multimask outputs
      let best = 0;
      for (let m = 1; m < 3; m++) if (iou[k * 3 + m] > iou[k * 3 + best]) best = m;
      const predIou = iou[k * 3 + best];
      if (predIou < o.predIouThresh) continue;
      const off = k * per + best * Hl * Wl;
      const stab = stability(logits, off, Hl * Wl, o.stabilityOffset);
      if (stab < o.stabilityThresh) continue;
      // upscale the chosen logit mask to original resolution, threshold at 0, measure geometry
      const up = Hl === H && Wl === W ? logits.subarray(off, off + Hl * Wl) : resizeBilinear(logits, off, Wl, Hl, W, H);
      const { data, area, bbox } = binarize(up, W, H);
      if (area < o.minAreaPx || area > o.maxAreaFrac * W * H) continue;
      out_masks.push({ data, area, bbox, predIou, stability: stab, point: batch[k] });
    }
    return out_masks;
  }
}

// ---- helpers ------------------------------------------------------------------------------------------------

/** Choose the inference device. In the browser, only pick 'webgpu' if a real GPU adapter is actually obtainable
 *  (otherwise WASM); in Node (no navigator.gpu) let transformers.js pick (onnxruntime-node CPU). */
async function pickDevice(): Promise<string> {
  const gpu = (globalThis as any)?.navigator?.gpu;
  if (gpu?.requestAdapter) {
    try {
      const adapter = await gpu.requestAdapter();
      if (adapter) return 'webgpu';
    } catch {
      /* fall through to wasm */
    }
    return 'wasm';
  }
  // no WebGPU API at all: browser without WebGPU -> wasm; Node -> let the lib default (cpu)
  return typeof (globalThis as any)?.navigator === 'undefined' ? 'default' : 'wasm';
}

function withDefaults(o: AutoMaskOptions) {
  return {
    gridSize: o.gridSize ?? 32,
    pointBatch: o.pointBatch ?? 64,
    predIouThresh: o.predIouThresh ?? 0.86,
    stabilityThresh: o.stabilityThresh ?? 0.9,
    stabilityOffset: o.stabilityOffset ?? 1.0,
    minAreaPx: o.minAreaPx ?? 25,
    maxAreaFrac: o.maxAreaFrac ?? 0.5,
    nmsIou: o.nmsIou ?? 0.7,
    cropMarginFrac: o.cropMarginFrac ?? 0.02,
    onProgress: o.onProgress,
  };
}

function gridPoints(W: number, H: number, n: number, marginFrac: number): Array<[number, number]> {
  const mx = marginFrac * W;
  const my = marginFrac * H;
  const pts: Array<[number, number]> = [];
  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      const x = mx + ((ix + 0.5) / n) * (W - 2 * mx);
      const y = my + ((iy + 0.5) / n) * (H - 2 * my);
      pts.push([x, y]);
    }
  }
  return pts;
}

/** SAM stability: |{logit > t+off}| / |{logit > t-off}| (the high set is a subset of the low set, so this is
 *  their IoU). t = 0 is the mask threshold on the logits. */
function stability(logits: Float32Array, off: number, n: number, offset: number): number {
  let high = 0;
  let low = 0;
  for (let i = 0; i < n; i++) {
    const v = logits[off + i];
    if (v > offset) high++;
    if (v > -offset) low++;
  }
  return low > 0 ? high / low : 0;
}

function binarize(logits: Float32Array, W: number, H: number): { data: Uint8Array; area: number; bbox: [number, number, number, number] } {
  const data = new Uint8Array(W * H);
  let area = 0;
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (logits[i] > 0) {
        data[i] = 1;
        area++;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  const bbox: [number, number, number, number] = area > 0 ? [x0, y0, x1 - x0 + 1, y1 - y0 + 1] : [0, 0, 0, 0];
  return { data, area, bbox };
}

function resizeBilinear(src: Float32Array, off: number, sw: number, sh: number, dw: number, dh: number): Float32Array {
  const dst = new Float32Array(dw * dh);
  const sx = sw / dw;
  const sy = sh / dh;
  for (let y = 0; y < dh; y++) {
    const fy = (y + 0.5) * sy - 0.5;
    const y0 = Math.max(0, Math.min(sh - 1, Math.floor(fy)));
    const y1 = Math.min(sh - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = (x + 0.5) * sx - 0.5;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(fx)));
      const x1 = Math.min(sw - 1, x0 + 1);
      const wx = fx - x0;
      const a = src[off + y0 * sw + x0];
      const b = src[off + y0 * sw + x1];
      const c = src[off + y1 * sw + x0];
      const d = src[off + y1 * sw + x1];
      dst[y * dw + x] = a * (1 - wx) * (1 - wy) + b * wx * (1 - wy) + c * (1 - wx) * wy + d * wx * wy;
    }
  }
  return dst;
}

function iouOf(a: InstanceMask, b: InstanceMask): number {
  // fast reject by bbox
  const [ax, ay, aw, ah] = a.bbox;
  const [bx, by, bw, bh] = b.bbox;
  if (ax > bx + bw || bx > ax + aw || ay > by + bh || by > ay + ah) return 0;
  let inter = 0;
  const da = a.data;
  const db = b.data;
  for (let i = 0; i < da.length; i++) if (da[i] && db[i]) inter++;
  return inter / (a.area + b.area - inter);
}

function nms(cands: InstanceMask[], iouThresh: number): InstanceMask[] {
  const order = cands.slice().sort((m1, m2) => m2.predIou * m2.stability - m1.predIou * m1.stability);
  const kept: InstanceMask[] = [];
  for (const c of order) {
    let dup = false;
    for (const k of kept) {
      if (iouOf(c, k) > iouThresh) {
        dup = true;
        break;
      }
    }
    if (!dup) kept.push(c);
  }
  return kept;
}

/** Paint kept masks into a label map. Highest-score first; a pixel keeps its first (best) owner so overlapping
 *  SAM masks yield clean, disjoint instances. */
function paintLabels(masks: InstanceMask[], W: number, H: number): Int32Array {
  const labels = new Int32Array(W * H);
  for (let m = 0; m < masks.length; m++) {
    const id = m + 1;
    const d = masks[m].data;
    for (let i = 0; i < d.length; i++) if (d[i] && labels[i] === 0) labels[i] = id;
  }
  return labels;
}

function arr2(t: any): [number, number] {
  const d = Array.isArray(t) ? t[0] : (t?.data ?? t?.tolist?.()?.[0] ?? t);
  return [Number(d[0]), Number(d[1])];
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
