import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { CircleDot } from 'lucide-react';
import { AppShell, applyTheme, readTheme, CitationsProvider, type ShellConfig } from '@fasl-work/caos-app-shell';
import '@fasl-work/caos-app-shell/styles.css';
import './frothseg.css';
import 'katex/dist/katex.min.css';
import { CITATIONS } from './data/citations';
import { architecture } from './architecture';
import pkg from '../package.json';
import Tool from './pages/Tool';
import Introduction from './pages/Introduction';
import Methodology from './pages/Methodology';
import Implementation from './pages/Implementation';
import Experiments from './pages/Experiments';
import Benchmark from './pages/Benchmark';

applyTheme(readTheme());

const config: ShellConfig = {
  product: { name: 'FrothSeg', mark: <CircleDot size={18} aria-hidden="true" /> },
  routes: [
    { path: '/', en: 'App', es: 'App' },
    { path: '/introduction', en: 'Introduction', es: 'Introducción' },
    { path: '/methodology', en: 'Methodology', es: 'Metodología' },
    { path: '/implementation', en: 'Implementation', es: 'Implementación' },
    { path: '/experiments', en: 'Experiments', es: 'Experimentos' },
    { path: '/benchmark', en: 'Benchmark', es: 'Benchmark' },
  ],
  links: { github: 'https://github.com/fsantibanezleal/CAOS_FrothSeg' },
  version: pkg.version,
  architecture,
  footer: {
    provenance: {
      en: 'Live: SAM-class model (SlimSAM, Apache-2.0) via transformers.js + WebGPU. Benchmark: synthetic froth (Laguerre foam), exact masks.',
      es: 'En vivo: modelo SAM (SlimSAM, Apache-2.0) vía transformers.js + WebGPU. Benchmark: espuma sintética (espuma de Laguerre), máscaras exactas.',
    },
    disclaimer: {
      en: 'Static site; segmentation runs in your browser, no backend. Synthetic AP is a controlled benchmark, not real-plant accuracy.',
      es: 'Sitio estático; la segmentación se ejecuta en el navegador, sin backend. El AP sintético es un benchmark controlado, no exactitud de planta real.',
    },
  },
};

const el = document.getElementById('root');
if (el) {
  createRoot(el).render(
    <StrictMode>
      <BrowserRouter>
        <CitationsProvider items={CITATIONS}>
          <AppShell config={config}>
            <Routes>
              <Route path="/" element={<Tool />} />
              <Route path="/introduction" element={<Introduction />} />
              <Route path="/methodology" element={<Methodology />} />
              <Route path="/implementation" element={<Implementation />} />
              <Route path="/experiments" element={<Experiments />} />
              <Route path="/benchmark" element={<Benchmark />} />
              <Route path="*" element={<Tool />} />
            </Routes>
          </AppShell>
        </CitationsProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}
