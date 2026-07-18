// Marker-controlled watershed by priority flooding (Meyer 1994, doi:10.1016/0165-1684(94)90060-4): seed the
// queue with the marker pixels, always pop the LOWEST surface value, and grow each marker's basin outward; a
// pixel is claimed by the first (lowest-cost) basin to reach it. Exact enough for froth delineation and O(N log N).

class MinHeap {
  private v: number[] = [];        // packed: priority
  private p: number[] = [];        // packed: pixel index
  size(): number { return this.v.length; }
  push(priority: number, pixel: number): void {
    const v = this.v, p = this.p;
    v.push(priority); p.push(pixel);
    let i = v.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (v[parent] <= v[i]) break;
      [v[parent], v[i]] = [v[i], v[parent]];
      [p[parent], p[i]] = [p[i], p[parent]];
      i = parent;
    }
  }
  pop(): [number, number] {
    const v = this.v, p = this.p;
    const top: [number, number] = [v[0], p[0]];
    const lv = v.pop() as number, lp = p.pop() as number;
    if (v.length) {
      v[0] = lv; p[0] = lp;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let s = i;
        if (l < v.length && v[l] < v[s]) s = l;
        if (r < v.length && v[r] < v[s]) s = r;
        if (s === i) break;
        [v[s], v[i]] = [v[i], v[s]];
        [p[s], p[i]] = [p[i], p[s]];
        i = s;
      }
    }
    return top;
  }
}

/** Flood `surface` from the labelled `markers` (0 = unlabelled), restricted to `mask` (1 = floodable).
 *  Returns the per-pixel basin labels. */
export function watershed(surface: Float32Array, markers: Int32Array, mask: Uint8Array, w: number, h: number): Int32Array {
  const labels = Int32Array.from(markers);
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
