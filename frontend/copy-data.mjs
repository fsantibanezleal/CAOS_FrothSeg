// Prebuild: overlay the committed CONTRACT-2 artifacts (../data/derived) into the SPA's public/ so the static
// site serves them (frame.png, COCO-RLE masks, bsd.csv, benchmark.json, card.json, manifests/, and the baked
// sam_benchmark.json). Canonical copies live in ../data; public/data is a build-time overlay (git-ignored).
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PUB = join(HERE, 'public');

const derived = join(ROOT, 'data', 'derived');
if (existsSync(derived)) {
  const destination = join(PUB, 'data');
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  cpSync(derived, destination, { recursive: true });
  console.log('[copy-data] replaced public/data from data/derived');
} else {
  console.warn('[copy-data] no data/derived - run scripts/precompute first');
}
