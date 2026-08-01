// Marker-controlled watershed by priority flooding (Meyer 1994, doi:10.1016/0165-1684(94)90060-4): seed the
// queue with the marker pixels, always pop the LOWEST surface value, and grow each marker's basin outward; a
// pixel is claimed by the first (lowest-cost) basin to reach it. Exact enough for froth delineation and O(N log N).
//
// The heap breaks ties on INSERTION ORDER (FIFO among equal surface values). That is not a refinement, it is
// what decides the result on a plateau, and froth surfaces are mostly plateau: C3 now floods the negated
// GRAYSCALE, which comes from an 8-bit frame and therefore has at most 256 distinct levels, so equal-valued
// runs are long and whichever basin the heap happens to pop first takes the whole run.
//
// What the tiebreak measurably bought, from scripts/validate_classical_live_parity.py: browser-vs-offline
// mask IoU rose from 0.5226 to 0.7654 on C3 and from 0.6625 to 0.7056 on C4. What it did NOT buy, stated
// because it was first assumed to be the whole story: it left the C3 mean-AP delta at 0.0333, past the 0.03
// gate. The rest was the out-of-mask marker bug fixed below.

class MinHeap {
  private v: number[] = [];        // packed: priority
  private a: number[] = [];        // packed: insertion age, the tiebreak among equal priorities
  private p: number[] = [];        // packed: pixel index
  private next = 0;                // monotonic age counter
  size(): number { return this.v.length; }
  /** True when (value, age) at `i` sorts before (value, age) at `j`. */
  private before(i: number, j: number): boolean {
    return this.v[i] < this.v[j] || (this.v[i] === this.v[j] && this.a[i] < this.a[j]);
  }
  private swap(i: number, j: number): void {
    const v = this.v, a = this.a, p = this.p;
    [v[i], v[j]] = [v[j], v[i]];
    [a[i], a[j]] = [a[j], a[i]];
    [p[i], p[j]] = [p[j], p[i]];
  }
  push(priority: number, pixel: number): void {
    this.v.push(priority); this.a.push(this.next++); this.p.push(pixel);
    let i = this.v.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.before(i, parent)) break;
      this.swap(parent, i);
      i = parent;
    }
  }
  pop(): [number, number] {
    const v = this.v, a = this.a, p = this.p;
    const top: [number, number] = [v[0], p[0]];
    const lv = v.pop() as number, la = a.pop() as number, lp = p.pop() as number;
    if (v.length) {
      v[0] = lv; a[0] = la; p[0] = lp;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let s = i;
        if (l < v.length && this.before(l, s)) s = l;
        if (r < v.length && this.before(r, s)) s = r;
        if (s === i) break;
        this.swap(s, i);
        i = s;
      }
    }
    return top;
  }
}

/** Flood `surface` from the labelled `markers` (0 = unlabelled), restricted to `mask` (1 = floodable).
 *  Returns the per-pixel basin labels. */
export function watershed(surface: Float32Array, markers: Int32Array, mask: Uint8Array, w: number, h: number): Int32Array {
  // Seed only INSIDE the mask, and return nothing outside it. The seed copy used to carry every marker
  // pixel through to the output, including markers that lie entirely outside the froth foreground, so the
  // twin invented one instance per out-of-mask marker: on C3, whose h-maxima markers sit on any bright
  // speck anywhere in the frame, that inflated the browser instance count to 1.2420x the offline count in
  // every parity run since the artifact was first committed. skimage's masked watershed returns 0 outside
  // the mask, so the twin now does too.
  const labels = new Int32Array(markers.length);
  for (let i = 0; i < markers.length; i++) if (mask[i]) labels[i] = markers[i];
  const heap = new MinHeap();
  const inQueue = new Uint8Array(w * h);
  for (let i = 0; i < markers.length; i++) {
    if (markers[i] > 0 && mask[i]) { heap.push(surface[i], i); inQueue[i] = 1; }
  }
  const nb = [-1, 1, -w, w];
  while (heap.size() > 0) {
    const [, i] = heap.pop();
    const x = i % w;
    for (let k = 0; k < 4; k++) {
      const j = i + nb[k];
      if (k === 0 && x === 0) continue;
      if (k === 1 && x === w - 1) continue;
      if (j < 0 || j >= labels.length) continue;
      if (!mask[j] || labels[j] !== 0 || inQueue[j]) continue;
      labels[j] = labels[i];
      inQueue[j] = 1;
      heap.push(surface[j], j);
    }
  }
  return labels;
}
