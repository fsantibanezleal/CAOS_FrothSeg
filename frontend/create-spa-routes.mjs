import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const routes = [
  'introduction',
  'methodology',
  'implementation',
  'experiments',
  'benchmark',
];

/* ADR-0070 makes a focus view shareable per scenario, so `/focus/<case>` has to answer 200
   rather than lean on the 404 fallback. The fallback does boot the SPA and the view renders,
   but a link that a reader is meant to share and teach from should not be served as an error.
   The scenario list is read from the shipped manifest so a new sequence gets its route without
   anyone remembering to add it here. */
const showcase = JSON.parse(
  await readFile(join('dist', 'data', 'showcase', 'temporal', 'manifest.json'), 'utf8'),
);
for (const sequence of showcase.sequences ?? []) {
  // The old lane-less path stays materialized so shared links keep answering 200.
  routes.push(join('focus', sequence.case_id));
  routes.push(join('focus', 'sequence', sequence.case_id));
}
// Still cases are focusable too (the case index is the same one the App reads).
const caseIndex = JSON.parse(
  await readFile(join('dist', 'data', 'manifests', 'index.json'), 'utf8'),
);
for (const entry of caseIndex.cases ?? []) {
  routes.push(join('focus', 'still', entry.case_id));
}

for (const route of routes) {
  const directory = join('dist', route);
  await mkdir(directory, { recursive: true });
  await copyFile(join('dist', 'index.html'), join(directory, 'index.html'));
}

// Unknown routes still boot the SPA and reach its explicit catch-all view.
await copyFile(join('dist', 'index.html'), join('dist', '404.html'));
console.log(`[spa-routes] materialized ${routes.length} routes + 404 fallback`);
