import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const routes = [
  'introduction',
  'methodology',
  'implementation',
  'experiments',
  'benchmark',
];

for (const route of routes) {
  const directory = join('dist', route);
  await mkdir(directory, { recursive: true });
  await copyFile(join('dist', 'index.html'), join(directory, 'index.html'));
}

// Unknown routes still boot the SPA and reach its explicit catch-all view.
await copyFile(join('dist', 'index.html'), join('dist', '404.html'));
console.log(`[spa-routes] materialized ${routes.length} routes + 404 fallback`);
