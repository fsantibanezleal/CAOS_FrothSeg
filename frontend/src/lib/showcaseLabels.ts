const MAGIC = 0x46534c52;

export interface DecodedShowcaseLabels {
  width: number;
  height: number;
  labels: Int32Array;
}

export function decodeShowcaseLabels(buffer: ArrayBuffer): DecodedShowcaseLabels {
  const words = new Uint32Array(buffer);
  if (words.length < 5 || words[0] !== MAGIC || words[1] !== 1) {
    throw new Error('Unsupported FrothSeg label artifact');
  }
  const width = words[2];
  const height = words[3];
  const pairCount = words[4];
  if (words.length !== 5 + pairCount * 2) {
    throw new Error('Truncated FrothSeg label artifact');
  }
  const labels = new Int32Array(width * height);
  let offset = 0;
  for (let index = 0; index < pairCount; index += 1) {
    const value = words[5 + index * 2];
    const count = words[6 + index * 2];
    if (offset + count > labels.length) throw new Error('Invalid FrothSeg label run');
    labels.fill(value, offset, offset + count);
    offset += count;
  }
  if (offset !== labels.length) throw new Error('Incomplete FrothSeg label raster');
  return { width, height, labels };
}
