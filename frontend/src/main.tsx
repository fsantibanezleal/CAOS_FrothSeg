import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { CircleDot } from 'lucide-react';
import {
  AppShell, applyTheme, readTheme, CitationsProvider, useShellLang, type ShellConfig,
} from '@fasl-work/caos-app-shell';
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

// Vite fingerprints lazy chunks. If a deployment replaces the bundle while a
// tab is open, reload the new index once instead of surfacing a stale-chunk
// import error to the segmentation workbench.
const PRELOAD_RECOVERY_KEY = 'frothseg:preload-recovery';
window.setTimeout(() => sessionStorage.removeItem(PRELOAD_RECOVERY_KEY), 10_000);
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  if (sessionStorage.getItem(PRELOAD_RECOVERY_KEY) !== location.pathname) {
    sessionStorage.setItem(PRELOAD_RECOVERY_KEY, location.pathname);
    location.reload();
  }
});

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
      en: 'Repository: complete processing, training, inference, evaluation, and export pipelines. Site: verified result exploration and four local-image methods.',
      es: 'Repositorio: pipelines completos de procesamiento, entrenamiento, inferencia, evaluación y exportación. Sitio: resultados verificados y cuatro métodos para imágenes locales.',
    },
    disclaimer: {
      en: 'The website replays precomputed evidence and offers light interaction. Synthetic AP is controlled evidence, not plant accuracy.',
      es: 'La web reproduce evidencia precalculada y ofrece interacción liviana. El AP sintético es evidencia controlada, no exactitud de planta.',
    },
  },
};

function ShellLicenseCorrection() {
  const lang = useShellLang();
  useEffect(() => {
    document.documentElement.lang = lang;
    const node = document.querySelector(
      '.footer-meta a[href*="github"] + span + .faint',
    );
    if (node) {
      node.textContent = lang === 'es'
        ? 'Licencia Apache-2.0 · código abierto'
        : 'Apache-2.0 licensed · open source';
    }
  }, [lang]);
  return null;
}

const el = document.getElementById('root');
if (el) {
  createRoot(el).render(
    <StrictMode>
      <BrowserRouter>
        <CitationsProvider items={CITATIONS}>
          <AppShell config={config}>
            <ShellLicenseCorrection />
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
