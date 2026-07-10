// Browser mirror of CONTRACT 1 (data-pipeline/fslab/io/contract.py validate_image): the bring-your-own-froth
// gate. Same thresholds, so a bad upload is rejected before a SAM inference is spent, and glare/low-contrast
// frames are flagged (the deglare front-end reacts to the flags). Operates on a row-major grayscale [0,1] array.

export const MIN_SIDE = 64;
export const MAX_SIDE = 8192;
export const DYN_RANGE_MIN = 0.06;
export const DYN_RANGE_FLAG = 0.15;
export const SAT_FRAC_FLAG = 0.2;
export const DARK_FRAC_FLAG = 0.55;

export interface ImageGateResult {
  ok: boolean;
  reason: string | null;
  flags: string[];
  stats: { h: number; w: number; dynRange: number; satFrac: number; darkFrac: number };
}

function percentile(sorted: Float32Array, p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] * (1 - (idx - lo)) + sorted[hi] * (idx - lo);
}

export function validateImage(gray: Float32Array, w: number, h: number): ImageGateResult {
  const stats = { h, w, dynRange: 0, satFrac: 0, darkFrac: 0 };
  if (!(gray.length === w * h) || w === 0 || h === 0) {
    return { ok: false, reason: 'empty image', flags: [], stats };
  }
  let sat = 0;
  let dark = 0;
  let finite = true;
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i];
    if (!Number.isFinite(v)) finite = false;
    if (v > 0.97) sat++;
    if (v < 0.03) dark++;
  }
  if (!finite) return { ok: false, reason: 'NaN/Inf pixel values', flags: [], stats };
  const sorted = Float32Array.from(gray).sort();
  const dyn = percentile(sorted, 99) - percentile(sorted, 1);
  stats.dynRange = round(dyn, 4);
  stats.satFrac = round(sat / gray.length, 4);
  stats.darkFrac = round(dark / gray.length, 4);

  if (Math.min(h, w) < MIN_SIDE) return { ok: false, reason: `too small: ${h}x${w} (min side ${MIN_SIDE}px)`, flags: [], stats };
  if (Math.max(h, w) > MAX_SIDE) return { ok: false, reason: `too large: ${h}x${w} (max side ${MAX_SIDE}px)`, flags: [], stats };
  if (dyn < DYN_RANGE_MIN) return { ok: false, reason: `blank/flat frame (dynamic range ${stats.dynRange} < ${DYN_RANGE_MIN})`, flags: [], stats };

  const flags: string[] = [];
  if (dyn < DYN_RANGE_FLAG) flags.push(`low contrast (dynamic range ${stats.dynRange})`);
  if (stats.satFrac > SAT_FRAC_FLAG) flags.push(`heavy glare (${Math.round(stats.satFrac * 100)}% saturated)`);
  if (stats.darkFrac > DARK_FRAC_FLAG) flags.push(`under-exposed (${Math.round(stats.darkFrac * 100)}% near-black)`);
  return { ok: true, reason: null, flags, stats };
}

function round(x: number, n: number): number {
  const f = 10 ** n;
  return Math.round(x * f) / f;
}
