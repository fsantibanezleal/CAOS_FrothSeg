// Offline verification of the live SAM-class froth segmenter: run the SAME auto-mask generator the browser uses
// (here on onnxruntime-node) over synthetic froth frames that have EXACT ground-truth masks, and dump the
// predicted instance-label map. score_sam.py then scores it with the validated Python mask-AP + BSD-Wasserstein
// so the live core is measured against the classical floor on identical metrics. Run:
//   npx tsx scripts/verify_sam.ts poly-normal fine-froth coarse-froth glare-storm --grid 32
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RawImage } from '@huggingface/transformers';

import { DEFAULT_MODEL, FrothSegmenter } from '../src/sam/autoMask';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..'); // repo root
const OUT = join(ROOT, 'verification', 'sam'); // gitignored

async function main() {
  const args = process.argv.slice(2);
  const gi = args.indexOf('--grid');
  const grid = gi >= 0 ? parseInt(args[gi + 1], 10) : 32;
  const model = (() => {
    const mi = args.indexOf('--model');
    return mi >= 0 ? args[mi + 1] : DEFAULT_MODEL;
  })();
  const cases = args.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));
  const caseList = cases.length ? cases : ['poly-normal'];

  mkdirSync(OUT, { recursive: true });
  const seg = new FrothSegmenter(model);
  console.log(`loading ${model} ...`);
  await seg.load('auto');
  console.log(`device=${seg.device} grid=${grid}x${grid}`);

  for (const c of caseList) {
    const framePath = join(ROOT, 'data', 'derived', 'synth', c, 'frame.png');
    const img = await RawImage.read(framePath);
    const r = await seg.segment(img, { gridSize: grid });
    const outPath = join(OUT, `${c}.json`);
    writeFileSync(
      outPath,
      JSON.stringify({
        case_id: c,
        model: r.model,
        device: r.device,
        width: r.width,
        height: r.height,
        nInstances: r.nInstances,
        bsd: r.bsd,
        encoderMs: r.encoderMs,
        totalMs: r.totalMs,
        labels: Array.from(r.labels),
      }),
    );
    console.log(
      `  ${c.padEnd(16)} instances=${String(r.nInstances).padStart(4)} ` +
        `d32=${r.bsd.d32 ?? '-'} count=${r.bsd.count} enc=${r.encoderMs}ms total=${r.totalMs}ms -> ${outPath}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
