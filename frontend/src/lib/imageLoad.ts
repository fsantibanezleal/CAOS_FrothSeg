// Browser image loading + conversion for the segmenter. Loads a sample URL or an uploaded File, exposes the
// grayscale [0,1] array the deglare front-end + CONTRACT-1 gate operate on, and builds the RawImage the SAM
// processor consumes. Downscales very large uploads so a phone photo does not blow up the point-grid decode.
import { RawImage } from '@huggingface/transformers';

export interface LoadedImage {
  gray: Float32Array; // row-major [0,1]
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
}

const MAX_SIDE = 1024; // SAM resizes to 1024 anyway; cap uploads so decode stays interactive

export async function loadImage(src: string | File): Promise<LoadedImage> {
  const bitmap = await toBitmap(src);
  let { width, height } = bitmap;
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = (0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]) / 255;
  }
  return { gray, rgba, width, height };
}

/** Grayscale [0,1] -> a 3-channel RawImage (SAM expects RGB; we replicate the gray channel). */
export function grayToRawImage(gray: Float32Array, width: number, height: number): RawImage {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0; i < gray.length; i++) {
    const v = Math.max(0, Math.min(255, Math.round(gray[i] * 255)));
    data[i * 3] = v;
    data[i * 3 + 1] = v;
    data[i * 3 + 2] = v;
  }
  return new RawImage(data, width, height, 3);
}

async function toBitmap(src: string | File): Promise<ImageBitmap> {
  const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
  return createImageBitmap(blob);
}
