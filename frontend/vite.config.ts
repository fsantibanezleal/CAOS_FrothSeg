import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vitest/config';
import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// GitHub Pages has no SPA fallback: a direct hit / refresh on a client route (e.g. /experiments) returns the
// host 404 page. Copying the built index.html to 404.html makes Pages serve the app for any unknown path so the
// React router can render deep links. Runs after the bundle is written, so 404.html carries the hashed assets.
function spaFallback(): Plugin {
  return {
    name: 'spa-404-fallback',
    apply: 'build',
    closeBundle() {
      const idx = resolve(__dirname, 'dist/index.html');
      if (existsSync(idx)) copyFileSync(idx, resolve(__dirname, 'dist/404.html'));
    },
  };
}

// Static SPA for GitHub Pages at frothseg.fasl-work.com (custom domain -> base '/', so assets + data resolve
// absolutely from root and work on every client route, not just '/').
export default defineConfig({
  base: '/',
  plugins: [react(), spaFallback()],
  // @huggingface/transformers loads onnxruntime-web (wasm) via dynamic import; excluding it from esbuild
  // pre-bundling avoids the resolver choking on the wasm/worker entry points.
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  build: { target: 'esnext', outDir: 'dist', sourcemap: false },
  test: { environment: 'node', globals: true },
});
