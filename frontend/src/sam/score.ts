// In-browser instance-mask AP, matching the Python fslab.science.segment.mask_ap (greedy IoU matching, mean over
// IoU thresholds .5:.05:.95). Used only for SYNTHETIC samples in the App, where the exact ground truth is
// available, to show a live "SAM vs GT" agreement next to the baked benchmark. Efficient: one pass builds the
// sparse pred x gt intersection table, so it stays interactive even at a few hundred instances.

export interface MaskApResult {
  ap: number | null;
  ap50: number | null;
  ap75: number | null;
  nPred: number;
  nGt: number;
}

export function maskAp(pred: Int32Array, gt: Int32Array): MaskApResult {
  const predIds = new Map<number, number>(); // id -> area
  const gtIds = new Map<number, number>();
  for (let i = 0; i < pred.length; i++) {
    if (pred[i] > 0) predIds.set(pred[i], (predIds.get(pred[i]) ?? 0) + 1);
    if (gt[i] > 0) gtIds.set(gt[i], (gtIds.get(gt[i]) ?? 0) + 1);
  }
  const nPred = predIds.size;
  const nGt = gtIds.size;
  if (nGt === 0) return { ap: null, ap50: null, ap75: null, nPred, nGt: 0 };

  // sparse intersection counts keyed by (pred<<20 | gt) -> requires ids < 2^20; froth instance counts are small
  const inter = new Map<number, number>();
  for (let i = 0; i < pred.length; i++) {
    const p = pred[i];
    const g = gt[i];
    if (p > 0 && g > 0) {
      const key = p * 1048576 + g;
      inter.set(key, (inter.get(key) ?? 0) + 1);
    }
  }
  // build candidate pairs with IoU
  const pairs: Array<{ p: number; g: number; iou: number }> = [];
  for (const [key, ic] of inter) {
    const p = Math.floor(key / 1048576);
    const g = key % 1048576;
    const iou = ic / ((predIds.get(p) ?? 0) + (gtIds.get(g) ?? 0) - ic);
    if (iou > 0) pairs.push({ p, g, iou });
  }
  pairs.sort((a, b) => b.iou - a.iou);

  const thresholds: number[] = [];
  for (let t = 0.5; t < 0.999; t += 0.05) thresholds.push(+t.toFixed(2));
  const aps: Record<number, number> = {};
  for (const t of thresholds) {
    const usedP = new Set<number>();
    const usedG = new Set<number>();
    let tp = 0;
    for (const { p, g, iou } of pairs) {
      if (iou < t) break;
      if (usedP.has(p) || usedG.has(g)) continue;
      usedP.add(p);
      usedG.add(g);
      tp++;
    }
    const fp = nPred - tp;
    const fn = nGt - tp;
    aps[t] = tp + fp + fn > 0 ? tp / (tp + fp + fn) : 0;
  }
  const mean = thresholds.reduce((a, t) => a + aps[t], 0) / thresholds.length;
  return { ap: round(mean, 3), ap50: round(aps[0.5], 3), ap75: round(aps[0.75] ?? 0, 3), nPred, nGt };
}

function round(x: number, n: number): number {
  const f = 10 ** n;
  return Math.round(x * f) / f;
}
