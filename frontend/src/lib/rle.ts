// COCO-RLE decode (the format masks.json uses, produced by pycocotools in the pipeline). Port of pycocotools
// maskApi.c `rleFrString` + `rleDecode`. Used to overlay the exact synthetic ground truth against the live SAM
// masks in the App/Experiments, so "SAM vs GT" is shown on real committed masks, not an approximation.
import type { MaskInstance, MasksDoc } from './contract.types';

/** Decode one RLE `counts` string into run lengths (column-major, starting with a background run). */
function countsFromString(s: string): number[] {
  const cnts: number[] = [];
  let p = 0;
  while (p < s.length) {
    let x = 0;
    let k = 0;
    let more = 1;
    while (more) {
      const c = s.charCodeAt(p) - 48;
      x |= (c & 0x1f) << (5 * k);
      more = c & 0x20;
      p++;
      k++;
      if (!more && c & 0x10) x |= -1 << (5 * k); // sign-extend
    }
    if (cnts.length > 2) x += cnts[cnts.length - 2]; // delta vs the count two back
    cnts.push(x);
  }
  return cnts;
}

/** Decode a single instance into a row-major (H*W) 0/1 mask. */
export function decodeInstance(inst: MaskInstance): Uint8Array {
  const [h, w] = inst.size;
  const runs = countsFromString(inst.counts);
  const out = new Uint8Array(h * w);
  let idx = 0; // column-major linear index
  let v = 0;
  for (const run of runs) {
    for (let i = 0; i < run; i++) {
      if (v) {
        const y = idx % h;
        const x = Math.floor(idx / h);
        out[y * w + x] = 1; // column-major -> row-major
      }
      idx++;
    }
    v ^= 1;
  }
  return out;
}

/** Decode all instances of a masks doc into a single int32 label map (row-major, 0 = background). */
export function decodeLabels(doc: MasksDoc): Int32Array {
  const { height: h, width: w } = doc;
  const labels = new Int32Array(h * w);
  for (const inst of doc.instances) {
    const m = decodeInstance(inst);
    for (let i = 0; i < m.length; i++) if (m[i]) labels[i] = inst.id;
  }
  return labels;
}
