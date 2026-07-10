// Lightweight real-froth front-end: illumination flattening + specular-glare attenuation, in pure canvas/typed
// arrays (no 10 MB OpenCV.js wasm for a preprocessing step). Real froth frames carry uneven lighting and bright
// specular glare that wash out borders; this normalises them BEFORE the segmenter, and CONTRACT-1 flags decide
// when to apply it. Same intent as the offline OpenCV deglare/illumination-flatten, at browser weight.
//
//  * illumination flatten: divide by a large-kernel box-blurred background estimate (retinex-style), so a
//    lighting gradient is removed while bubble texture survives.
//  * glare attenuation: soft-clip near-saturated pixels toward the local mean (specular highlights are the
//    froth-vision failure mode for highlight-seeded methods and for SAM prompts landing on white blobs).

/** In-place-safe: returns a NEW grayscale Float32Array in [0,1]. `gray` is row-major [0,1]. */
export function flattenIllumination(gray: Float32Array, w: number, h: number, radius = 24): Float32Array {
  const bg = boxBlur(gray, w, h, radius);
  const out = new Float32Array(w * h);
  let mean = 0;
  for (let i = 0; i < gray.length; i++) mean += bg[i];
  mean /= gray.length || 1;
  for (let i = 0; i < gray.length; i++) {
    const d = bg[i] > 1e-3 ? gray[i] / bg[i] : gray[i];
    out[i] = clamp01(d * mean); // rescale so the average brightness is preserved
  }
  return out;
}

/** Soft-attenuate specular glare: pixels above `hi` are pulled toward the local background. */
export function attenuateGlare(gray: Float32Array, w: number, h: number, hi = 0.9, radius = 12): Float32Array {
  const bg = boxBlur(gray, w, h, radius);
  const out = new Float32Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i];
    if (v > hi) {
      const t = (v - hi) / (1 - hi); // 0..1 how saturated
      out[i] = clamp01(v * (1 - t) + bg[i] * t);
    } else {
      out[i] = v;
    }
  }
  return out;
}

export interface DeglareOptions {
  flatten?: boolean;
  deglare?: boolean;
  flattenRadius?: number;
  glareHi?: number;
}

export function preprocess(gray: Float32Array, w: number, h: number, o: DeglareOptions = {}): Float32Array {
  let out = gray;
  if (o.flatten) out = flattenIllumination(out, w, h, o.flattenRadius ?? 24);
  if (o.deglare) out = attenuateGlare(out, w, h, o.glareHi ?? 0.9);
  return out;
}

// separable box blur (two passes), O(n) via a running sum
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const norm = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) sum += src[row + clampIdx(x, w)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum * norm;
      sum += src[row + clampIdx(x + r + 1, w)] - src[row + clampIdx(x - r, w)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[clampIdx(y, h) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum * norm;
      sum += tmp[clampIdx(y + r + 1, h) * w + x] - tmp[clampIdx(y - r, h) * w + x];
    }
  }
  return out;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const clampIdx = (i: number, n: number): number => (i < 0 ? 0 : i >= n ? n - 1 : i);
