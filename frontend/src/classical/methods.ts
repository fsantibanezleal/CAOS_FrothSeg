// The live classical tier C1..C7, the in-browser twins of the offline Python floor
// (data-pipeline/fslab/science/segment.py). Same method semantics, same provenance, running client-side in pure
// TypeScript so the App is a genuine multi-model workbench: pick a method, run it live on the selected frame, and
// compare against the pre-validated offline references. Provenance per method:
//   C1 otsu_cc              Otsu 1979 + connected components, the under-segmentation baseline.
//   C2 watershed_immersion  marker-less immersion watershed on the morphological gradient (Vincent-Soille 1991),
//                           the over-segmentation exhibit (a basin per highlight/dip).
//   C3 watershed_hmax       highlight-seeded h-maxima markers (Sadr-Kazemi & Cilliers 1997).
//   C4 watershed_dt         distance-transform markers + marker-controlled watershed (Meyer 1994).
//   C5 watershed_hmin       H-minima suppression before flooding (Soille 2004).
//   C6 slic_merge           SLIC superpixels (Achanta 2012) + mean-intensity ordering, the non-watershed lane.
//   C7 valley_edge          dark-seam / valley detector (Wang 2003; Wang & Chen 2015), the froth-specific method.

import {
  blackTophat, edt, fillSmallHoles, grayMorph, hMaxima, labelCC, morphGradient, otsuThreshold, peakLocalMax,
  removeSmall,
} from './gray';
import { watershed } from './watershed';

export type ClassicalMethod =
  | 'otsu_cc' | 'watershed_immersion' | 'watershed_hmax' | 'watershed_dt'
  | 'watershed_hmin' | 'slic_merge' | 'valley_edge';

export const CLASSICAL_METHODS: Array<{ id: ClassicalMethod; label: string; note: string }> = [
  { id: 'otsu_cc', label: 'C1 Otsu + CC', note: 'under-segments touching bubbles (baseline)' },
  { id: 'watershed_immersion', label: 'C2 Immersion watershed', note: 'over-segments on highlights (exhibit)' },
  { id: 'watershed_hmax', label: 'C3 Highlight-seeded watershed', note: 'the classic industrial froth trick' },
  { id: 'watershed_dt', label: 'C4 Distance-transform watershed', note: 'the generic classical floor' },
  { id: 'watershed_hmin', label: 'C5 H-minima watershed', note: 'suppresses shallow spurious basins' },
  { id: 'slic_merge', label: 'C6 SLIC superpixels', note: 'non-watershed over-segmentation primitive' },
  { id: 'valley_edge', label: 'C7 Valley-edge (Wang)', note: 'dark-seam froth method, strongest classical' },
];

/** Froth foreground: bright bubble caps vs dark Plateau borders, Otsu-relative threshold + cleanup (mirrors
 *  the offline `_foreground`). */
export function foreground(gray: Float32Array, w: number, h: number): Uint8Array {
  const thr = otsuThreshold(gray) * 0.75;
  let fg: Uint8Array = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) fg[i] = gray[i] > thr ? 1 : 0;
  fg = fillSmallHoles(fg, w, h, 16);
  fg = removeSmall(fg, w, h, 12);
  return fg;
}

function markersFromCoords(coords: Array<[number, number]>, w: number, h: number): Int32Array {
  const m = new Int32Array(w * h);
  coords.forEach(([x, y], j) => { m[y * w + x] = j + 1; });
  return m;
}

function otsuCC(gray: Float32Array, w: number, h: number): Int32Array {
  return labelCC(foreground(gray, w, h), w, h).labels;
}

function watershedImmersion(gray: Float32Array, w: number, h: number): Int32Array {
  const fg = foreground(gray, w, h);
  const grad = morphGradient(gray, w, h);
  // marker-less: every regional minimum of the gradient becomes a basin (local-min plateaus), the over-seg exhibit
  const minima = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!fg[i]) continue;
    let isMin = true;
    for (let dy = -1; dy <= 1 && isMin; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (grad[ny * w + nx] < grad[i]) { isMin = false; break; }
    }
    if (isMin) minima[i] = 1;
  }
  const markers = labelCC(minima, w, h).labels;
  return watershed(grad, markers, fg, w, h);
}

function watershedHmax(gray: Float32Array, w: number, h: number): Int32Array {
  const fg = foreground(gray, w, h);
  const domes = hMaxima(gray, w, h, 0.06);
  const { labels: markers, n } = labelCC(domes, w, h);
  if (n === 0) return watershedDt(gray, w, h);
  const dist = edt(fg, w, h);
  const surface = new Float32Array(dist.length);
  for (let i = 0; i < dist.length; i++) surface[i] = -dist[i];
  return watershed(surface, markers, fg, w, h);
}

function watershedDt(gray: Float32Array, w: number, h: number): Int32Array {
  const fg = foreground(gray, w, h);
  const dist = edt(fg, w, h);
  const peaks = peakLocalMax(dist, w, h, 4, fg);
  const markers = markersFromCoords(peaks, w, h);
  const surface = new Float32Array(dist.length);
  for (let i = 0; i < dist.length; i++) surface[i] = -dist[i];
  return watershed(surface, markers, fg, w, h);
}

function watershedHmin(gray: Float32Array, w: number, h: number): Int32Array {
  const fg = foreground(gray, w, h);
  const dist = edt(fg, w, h);
  let dmax = 0;
  for (let i = 0; i < dist.length; i++) if (dist[i] > dmax) dmax = dist[i];
  if (dmax <= 0) return new Int32Array(w * h);
  // h-minima of the negated normalized distance = h-maxima of the normalized distance
  const norm = new Float32Array(dist.length);
  for (let i = 0; i < dist.length; i++) norm[i] = dist[i] / dmax;
  const domes = hMaxima(norm, w, h, 0.08);
  const { labels: markers, n } = labelCC(domes, w, h);
  if (n === 0) return watershedDt(gray, w, h);
  const surface = new Float32Array(dist.length);
  for (let i = 0; i < dist.length; i++) surface[i] = -norm[i];
  return watershed(surface, markers, fg, w, h);
}

function slicMerge(gray: Float32Array, w: number, h: number): Int32Array {
  // SLIC (Achanta 2012) on (gray, x, y): grid-seeded k-means, compactness m, ~10 iterations; then relabel
  // ordered by mean intensity (mirroring the offline slic_merge remap).
  const nSeg = 400;
  const S = Math.max(4, Math.round(Math.sqrt((w * h) / nSeg)));
  const m = 8 / 255;                                     // compactness on the [0,1] gray scale
  interface C { x: number; y: number; g: number }
  const centers: C[] = [];
  for (let cy = S / 2; cy < h; cy += S) for (let cx = S / 2; cx < w; cx += S)
    centers.push({ x: cx, y: cy, g: gray[(cy | 0) * w + (cx | 0)] });
  const label = new Int32Array(w * h).fill(-1);
  const dist = new Float32Array(w * h).fill(Infinity);
  for (let it = 0; it < 10; it++) {
    dist.fill(Infinity);
    centers.forEach((c, k) => {
      const x0 = Math.max(0, (c.x - S) | 0), x1 = Math.min(w - 1, (c.x + S) | 0);
      const y0 = Math.max(0, (c.y - S) | 0), y1 = Math.min(h - 1, (c.y + S) | 0);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        const dg = (gray[i] - c.g) / m;
        const dxy = Math.hypot(x - c.x, y - c.y) / S;
        const d = dg * dg + dxy * dxy;
        if (d < dist[i]) { dist[i] = d; label[i] = k; }
      }
    });
    const acc = centers.map(() => ({ x: 0, y: 0, g: 0, n: 0 }));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = label[y * w + x];
      if (k < 0) continue;
      acc[k].x += x; acc[k].y += y; acc[k].g += gray[y * w + x]; acc[k].n++;
    }
    acc.forEach((a, k) => { if (a.n) { centers[k] = { x: a.x / a.n, y: a.y / a.n, g: a.g / a.n }; } });
  }
  // relabel 1..K ordered by mean intensity (the offline remap), 0 stays for unassigned
  const means = centers.map((c) => c.g);
  const order = means.map((g, k) => [g, k] as [number, number]).sort((a, b) => a[0] - b[0]).map(([, k]) => k);
  const remap = new Int32Array(centers.length);
  order.forEach((k, newIdx) => { remap[k] = newIdx + 1; });
  const out = new Int32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = label[i] >= 0 ? remap[label[i]] : 0;
  return out;
}

function valleyEdge(gray: Float32Array, w: number, h: number): Int32Array {
  const seams = blackTophat(gray, w, h, 3);
  let smax = 0;
  for (let i = 0; i < seams.length; i++) if (seams[i] > smax) smax = seams[i];
  const fg = foreground(gray, w, h);
  const caps = new Uint8Array(w * h);
  const thr = smax > 0 ? otsuThreshold(seams) : Infinity;
  for (let i = 0; i < caps.length; i++) caps[i] = fg[i] && seams[i] <= thr ? 1 : 0;
  return labelCC(removeSmall(caps, w, h, 8), w, h).labels;
}

const IMPL: Record<ClassicalMethod, (g: Float32Array, w: number, h: number) => Int32Array> = {
  otsu_cc: otsuCC,
  watershed_immersion: watershedImmersion,
  watershed_hmax: watershedHmax,
  watershed_dt: watershedDt,
  watershed_hmin: watershedHmin,
  slic_merge: slicMerge,
  valley_edge: valleyEdge,
};

/** Run one classical method live; returns the instance label map (0 = background). */
export function runClassical(method: ClassicalMethod, gray: Float32Array, w: number, h: number): Int32Array {
  return IMPL[method](gray, w, h);
}

/** Grey erosion used by callers that need a plain min filter (exported for tests). */
export const _grayErode = (g: Float32Array, w: number, h: number, r: number) => grayMorph(g, w, h, r, 'erode');
