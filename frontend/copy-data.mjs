// Prebuild: overlay the committed CONTRACT-2 artifacts (../data/derived) into the SPA's public/ so the static
// site serves them (frame.png, COCO-RLE masks, bsd.csv, benchmark.json, card.json, manifests/, and the baked
// sam_benchmark.json). Canonical copies live in ../data; public/data is a build-time overlay (git-ignored).
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PUB = join(HERE, 'public');

const derived = join(ROOT, 'data', 'derived');
if (existsSync(derived)) {
  mkdirSync(join(PUB, 'data'), { recursive: true });
  cpSync(derived, join(PUB, 'data'), { recursive: true });
  console.log('[copy-data] data/derived -> public/data');
} else {
  console.warn('[copy-data] no data/derived - run scripts/precompute first');
}
