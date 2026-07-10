// Bubble-size distribution + per-instance descriptors from an instance-label map. Mirrors the Python
// fslab.live.bsd_from_labels and fslab.science.froth_gen.bsd EXACTLY (d_eq = 2*sqrt(area/pi)), so the live
// browser numbers are directly comparable to the baked synthetic ground truth.
import type { Bsd } from './types';

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/** Instance areas [px] -> BSD summary. Areas of 0 are ignored. */
export function bsdFromAreas(areas: number[]): Bsd {
  const a = areas.filter((x) => x > 0);
  if (a.length === 0) return { count: 0, d10: null, d50: null, d90: null, d32: null, pctSmall: null };
  const d = a.map((area) => 2 * Math.sqrt(area / Math.PI)).sort((x, y) => x - y);
  const d50 = percentile(d, 50);
  let s2 = 0;
  let s3 = 0;
  for (const v of d) {
    s2 += v * v;
    s3 += v * v * v;
  }
  const pctSmall = d.filter((v) => v < d50 / 2).length / d.length;
  return {
    count: d.length,
    d10: round(percentile(d, 10), 2),
    d50: round(d50, 2),
    d90: round(percentile(d, 90), 2),
    d32: round(s3 / s2, 2),
    pctSmall: round(pctSmall, 3),
  };
}

/** BSD from a label map directly (bincount of positive labels -> areas). */
export function bsdFromLabels(labels: Int32Array): Bsd {
  const counts = new Map<number, number>();
  for (let i = 0; i < labels.length; i++) {
    const v = labels[i];
    if (v > 0) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return bsdFromAreas([...counts.values()]);
}

function round(x: number, n: number): number {
  const f = 10 ** n;
  return Math.round(x * f) / f;
}
