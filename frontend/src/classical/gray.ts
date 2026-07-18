// Grayscale image toolbox for the live classical tier (C1..C7), the JS twins of the offline
// data-pipeline/fslab/science/segment.py. Pure TypeScript over Float32Array [0,1] images so every classical
// method runs client-side with no model download. Algorithms are the cited standards: Otsu 1979 thresholding,
// Felzenszwalb-Huttenlocher exact Euclidean distance transform, morphological reconstruction for h-extrema
// (Soille 2004), and flat disk erosion/dilation for the top-hat family.

export interface Labeled { labels: Int32Array; n: number }

/** Otsu's threshold (1979) on a 256-bin histogram; returns the threshold in [0,1]. */
export function otsuThreshold(gray: Float32Array): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < gray.length; i++) hist[Math.max(0, Math.min(255, (gray[i] * 255) | 0))]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  // Between-class variance is FLAT across the empty gap between two modes; taking the first argmax lands the
  // threshold on the lower mode's edge. Track the argmax PLATEAU [firstT, lastT] and return its midpoint (the
  // standard robust choice, what scikit-image effectively yields on bimodal froth histograms).
  let sumB = 0, wB = 0, best = 0, firstT = 127, lastT = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best * (1 + 1e-12)) { best = between; firstT = t; lastT = t; }
    else if (between >= best * (1 - 1e-12) && best > 0) { lastT = t; }
  }
  return (firstT + lastT) / 2 / 255;
}

/** 4-connected component labeling of a binary mask. */
export function labelCC(mask: Uint8Array, w: number, h: number): Labeled {
  const labels = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let n = 0;
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || labels[s]) continue;
    n++;
    let top = 0;
    stack[top++] = s; labels[s] = n;
    while (top > 0) {
      const p = stack[--top];
      const x = p % w, y = (p / w) | 0;
      if (x > 0 && mask[p - 1] && !labels[p - 1]) { labels[p - 1] = n; stack[top++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !labels[p + 1]) { labels[p + 1] = n; stack[top++] = p + 1; }
      if (y > 0 && mask[p - w] && !labels[p - w]) { labels[p - w] = n; stack[top++] = p - w; }
      if (y < h - 1 && mask[p + w] && !labels[p + w]) { labels[p + w] = n; stack[top++] = p + w; }
    }
  }
  return { labels, n };
}

/** Drop connected components smaller than minArea from a binary mask (in place semantics, returns a new mask). */
export function removeSmall(mask: Uint8Array, w: number, h: number, minArea: number): Uint8Array {
  const { labels, n } = labelCC(mask, w, h);
  const area = new Int32Array(n + 1);
  for (let i = 0; i < labels.length; i++) area[labels[i]]++;
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < labels.length; i++) out[i] = labels[i] && area[labels[i]] >= minArea ? 1 : 0;
  return out;
}

/** Fill background holes smaller than maxArea (holes = background components not touching the border). */
export function fillSmallHoles(mask: Uint8Array, w: number, h: number, maxArea: number): Uint8Array {
  const inv = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) inv[i] = mask[i] ? 0 : 1;
  const { labels, n } = labelCC(inv, w, h);
  const area = new Int32Array(n + 1);
  const touchesBorder = new Uint8Array(n + 1);
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i];
    if (!l) continue;
    area[l]++;
    const x = i % w, y = (i / w) | 0;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesBorder[l] = 1;
  }
  const out = Uint8Array.from(mask);
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i];
    if (l && !touchesBorder[l] && area[l] <= maxArea) out[i] = 1;
  }
  return out;
}

/** Exact squared Euclidean distance transform (Felzenszwalb & Huttenlocher 2012), distance to the nearest
 *  zero pixel; returns sqrt distances. */
export function edt(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e20;
  const f = new Float64Array(Math.max(w, h));
  const d = new Float64Array(Math.max(w, h));
  const v = new Int32Array(Math.max(w, h));
  const z = new Float64Array(Math.max(w, h) + 1);
  const g = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = mask[i] ? INF : 0;
  const dt1 = (n: number) => {
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
  };
  for (let x = 0; x < w; x++) {              // columns
    for (let y = 0; y < h; y++) f[y] = g[y * w + x];
    dt1(h);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {              // rows
    for (let x = 0; x < w; x++) f[x] = g[y * w + x];
    dt1(w);
    for (let x = 0; x < w; x++) g[y * w + x] = d[x];
  }
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = Math.sqrt(g[i]);
  return out;
}

function diskOffsets(radius: number, w: number): Array<[number, number]> {
  const offs: Array<[number, number]> = [];
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++)
      if (dx * dx + dy * dy <= radius * radius) offs.push([dx, dy]);
  void w;
  return offs;
}

/** Flat gray dilation (max) / erosion (min) with a disk structuring element. */
export function grayMorph(gray: Float32Array, w: number, h: number, radius: number, op: 'dilate' | 'erode'): Float32Array {
  const offs = diskOffsets(radius, w);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = op === 'dilate' ? -Infinity : Infinity;
      for (const [dx, dy] of offs) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const val = gray[ny * w + nx];
        m = op === 'dilate' ? Math.max(m, val) : Math.min(m, val);
      }
      out[y * w + x] = m;
    }
  }
  return out;
}

/** Black top-hat: closing(f) - f, isolates DARK structures thinner than the disk (the inter-bubble seams). */
export function blackTophat(gray: Float32Array, w: number, h: number, radius: number): Float32Array {
  const closing = grayMorph(grayMorph(gray, w, h, radius, 'dilate'), w, h, radius, 'erode');
  const out = new Float32Array(w * h);
  for (let i = 0; i < gray.length; i++) out[i] = Math.max(0, closing[i] - gray[i]);
  return out;
}

/** Morphological reconstruction by dilation of `marker` under `maskImg` (marker <= maskImg), iterative
 *  raster/anti-raster sweeps (Vincent 1993), converged for our image sizes in a few passes. */
export function reconstructByDilation(marker: Float32Array, maskImg: Float32Array, w: number, h: number): Float32Array {
  const r = Float32Array.from(marker);
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 256) {
    changed = false;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {         // raster
      const i = y * w + x;
      let m = r[i];
      if (x > 0) m = Math.max(m, r[i - 1]);
      if (y > 0) m = Math.max(m, r[i - w]);
      const val = Math.min(m, maskImg[i]);
      if (val > r[i]) { r[i] = val; changed = true; }
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { // anti-raster
      const i = y * w + x;
      let m = r[i];
      if (x < w - 1) m = Math.max(m, r[i + 1]);
      if (y < h - 1) m = Math.max(m, r[i + w]);
      const val = Math.min(m, maskImg[i]);
      if (val > r[i]) { r[i] = val; changed = true; }
    }
  }
  return r;
}

/** H-maxima markers (Soille 2004): regional maxima deeper than h, via reconstruction of (f - h) under f.
 *  Returns a binary mask of the surviving maxima plateaus. */
export function hMaxima(gray: Float32Array, w: number, h: number, hVal: number): Uint8Array {
  const marker = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i++) marker[i] = gray[i] - hVal;
  const rec = reconstructByDilation(marker, gray, w, h);
  // At an isolated dome PEAK deeper than h the reconstruction sits exactly h below f, while on flanks and on
  // sub-h relief f - rec falls toward 0 (a dome riding a taller connected dome reconstructs to its own height and
  // vanishes). Marking f - rec >= h/2 therefore keeps one compact plateau per genuine h-deep maximum, the
  // highlight-seeding semantics (one marker per specular spot), instead of smearing over the whole dome cap.
  const out = new Uint8Array(gray.length);
  const cut = hVal * 0.5;
  for (let i = 0; i < gray.length; i++) out[i] = gray[i] - rec[i] >= cut ? 1 : 0;
  return out;
}

/** Peaks of a height map: local maxima with a minimum separation, inside an optional mask. */
export function peakLocalMax(height: Float32Array, w: number, h: number, minDistance: number, mask?: Uint8Array): Array<[number, number]> {
  const cand: Array<[number, number, number]> = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (mask && !mask[i]) continue;
    const v = height[i];
    if (v <= 0) continue;
    let isMax = true;
    for (let dy = -1; dy <= 1 && isMax; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (height[ny * w + nx] > v) { isMax = false; break; }
    }
    if (isMax) cand.push([x, y, v]);
  }
  cand.sort((a, b) => b[2] - a[2]);
  const kept: Array<[number, number]> = [];
  const md2 = minDistance * minDistance;
  for (const [x, y] of cand) {
    let ok = true;
    for (const [kx, ky] of kept) {
      const dx = x - kx, dy = y - ky;
      if (dx * dx + dy * dy < md2) { ok = false; break; }
    }
    if (ok) kept.push([x, y]);
  }
  return kept;
}

/** Morphological gradient (dilate - erode, radius 1), the edge-strength surface for the immersion exhibit. */
export function morphGradient(gray: Float32Array, w: number, h: number): Float32Array {
  const d = grayMorph(gray, w, h, 1, 'dilate');
  const e = grayMorph(gray, w, h, 1, 'erode');
  const out = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = d[i] - e[i];
  return out;
}
