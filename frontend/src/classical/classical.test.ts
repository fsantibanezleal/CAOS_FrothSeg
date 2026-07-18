// Invariant tests for the live classical tier, mirroring the offline Python tests
// (tests/test_froth_science.py): the under/over-segmentation exhibits must have the expected SIGN and the strong
// methods must recover roughly the true bubble count on a synthetic froth-like frame with exact known layout.
import { describe, expect, it } from 'vitest';
import { edt, labelCC, otsuThreshold } from './gray';
import { watershed } from './watershed';
import { CLASSICAL_METHODS, runClassical } from './methods';

/** Deterministic synthetic froth-ish frame: a 4x4 grid of bright circular caps (r=13) separated by faint dark
 *  seams on a dark background, one specular highlight per cap, mild deterministic noise. 16 true bubbles. */
function frothFrame(): { gray: Float32Array; w: number; h: number; nTrue: number } {
  const w = 128, h = 128;
  const gray = new Float32Array(w * h).fill(0.15);          // dark Plateau-border background
  const centers: Array<[number, number]> = [];
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) centers.push([18 + gx * 30, 18 + gy * 30]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    for (const [cx, cy] of centers) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= 13) {
        gray[y * w + x] = 0.7;                               // bubble cap
        break;
      } else if (d <= 15 && gray[y * w + x] < 0.5) {
        gray[y * w + x] = 0.5;                               // faint seam shoulder (merges caps at Otsu FG)
      }
    }
  }
  centers.forEach(([cx, cy], k) => {                         // one specular highlight per bubble + a rim dip
    const hx = cx - 4, hy = cy - 4;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
      gray[(hy + dy) * w + (hx + dx)] = 0.98;
    gray[(cy + 5) * w + (cx + ((k % 3) - 1))] = 0.6;         // deterministic texture dip
  });
  for (let i = 0; i < gray.length; i++) gray[i] += 0.01 * Math.sin(i * 12.9898);  // mild deterministic noise
  return { gray, w, h, nTrue: 16 };
}

const count = (labels: Int32Array) => new Set(Array.from(labels).filter((v) => v > 0)).size;

describe('gray toolbox', () => {
  it('otsu finds a threshold between the modes of a bimodal image', () => {
    const img = new Float32Array(1000);
    for (let i = 0; i < 500; i++) img[i] = 0.2;
    for (let i = 500; i < 1000; i++) img[i] = 0.8;
    const t = otsuThreshold(img);
    expect(t).toBeGreaterThan(0.2);
    expect(t).toBeLessThan(0.8);
  });

  it('edt matches brute force on a small mask', () => {
    const w = 9, h = 7;
    const mask = new Uint8Array(w * h).fill(1);
    mask[3 * w + 4] = 0;                                     // a single zero pixel
    const d = edt(mask, w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const expected = Math.hypot(x - 4, y - 3);
      expect(Math.abs(d[y * w + x] - expected)).toBeLessThan(1e-4);
    }
  });

  it('watershed separates two touching blobs from two markers', () => {
    const w = 30, h = 12;
    const mask = new Uint8Array(w * h).fill(1);
    const surface = new Float32Array(w * h);
    // markers sit at the surface minima (distance 0), the correct watershed convention: flooding rises outward
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
      surface[y * w + x] = Math.min(Math.hypot(x - 8, y - 6), Math.hypot(x - 22, y - 6));
    const markers = new Int32Array(w * h);
    markers[6 * w + 8] = 1; markers[6 * w + 22] = 2;
    const lab = watershed(surface, markers, mask, w, h);
    expect(count(lab)).toBe(2);
    expect(lab[6 * w + 2]).toBe(1);
    expect(lab[6 * w + 28]).toBe(2);
    expect(labelCC(mask, w, h).n).toBe(1);                   // sanity: one blob before splitting
  });
});

describe('live classical tier C1..C7 (same signs as the offline Python tier)', () => {
  const { gray, w, h, nTrue } = frothFrame();

  it('every method runs and returns a label map', () => {
    for (const m of CLASSICAL_METHODS) {
      const lab = runClassical(m.id, gray, w, h);
      expect(lab.length).toBe(w * h);
    }
  });

  it('C1 otsu_cc UNDER-segments (touching caps merge across the faint seams)', () => {
    expect(count(runClassical('otsu_cc', gray, w, h))).toBeLessThan(nTrue * 0.75);
  });

  it('C2 immersion watershed OVER-segments (a basin per highlight/dip)', () => {
    expect(count(runClassical('watershed_immersion', gray, w, h))).toBeGreaterThan(nTrue * 2);
  });

  it('C4 distance-transform watershed recovers roughly the true bubble count', () => {
    const n = count(runClassical('watershed_dt', gray, w, h));
    expect(n).toBeGreaterThanOrEqual(nTrue * 0.6);
    expect(n).toBeLessThanOrEqual(nTrue * 1.8);
  });

  it('C7 valley-edge recovers roughly the true bubble count (the froth-specific method)', () => {
    const n = count(runClassical('valley_edge', gray, w, h));
    expect(n).toBeGreaterThanOrEqual(nTrue * 0.6);
    expect(n).toBeLessThanOrEqual(nTrue * 2.0);
  });
});
