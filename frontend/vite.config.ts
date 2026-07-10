import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './', // relative base -> works on a GitHub Pages project site
  plugins: [react()],
  // @huggingface/transformers loads onnxruntime-web (wasm) via dynamic import; excluding it from esbuild
  // pre-bundling avoids the resolver choking on the wasm/worker entry points.
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  build: { target: 'esnext' },
  test: { environment: 'node', globals: true },
});
