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
import Focus from './pages/Focus';

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

/** `0.4.0` (npm semver) -> `0.04.000` (the padded display form the CHANGELOG and tags use). */
function displayVersion(semver: string): string {
  const [major = '0', minor = '0', patch = '0'] = semver.split('.');
  return `${major}.${minor.padStart(2, '0')}.${patch.padStart(3, '0')}`;
}

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
  // The shell footer takes the display form X.XX.XXX (ADR-0068); package.json carries the semver
  // form with zeros dropped. Derive one from the other so the footer cannot drift from the manifest.
  version: displayVersion(pkg.version),
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

/** The shared shell hardcodes "MIT licensed" in its footer. This repository is Apache-2.0
 *  (ADR-0065), so without a correction the footer states the wrong licence, which is a
 *  factual error about a legal term rather than a cosmetic one.
 *
 *  The proper fix is a `license` field on ShellConfig; the shell has none today, and adding
 *  one means publishing a shell version that all 16 CAOS products depend on. That is a
 *  cross-product release, so it is tracked as BL-015 rather than done from here.
 *
 *  Until then this patches the DOM, and it matches on the TEXT rather than on a selector
 *  chain. The previous version keyed off `.footer-meta a[href*="github"] + span + .faint`,
 *  which any shell markup change would silently break, leaving the footer quietly asserting
 *  MIT. Matching the text fails safe: if the shell stops saying "MIT licensed" there is
 *  nothing to correct, and if it says it somewhere else this still finds it. */
const LICENSE_TEXT = {
  en: 'Apache-2.0 licensed · open source',
  es: 'Licencia Apache-2.0 · código abierto',
} as const;

function ShellLicenseCorrection() {
  const lang = useShellLang();
  useEffect(() => {
    document.documentElement.lang = lang;
    const correct = LICENSE_TEXT[lang === 'es' ? 'es' : 'en'];
    const footer = document.querySelector('footer') ?? document.body;
    const candidates = footer.querySelectorAll<HTMLElement>('span, p, div, small');
    for (const node of candidates) {
      // Only leaf nodes, so a wrapper containing the phrase is not flattened.
      if (node.children.length > 0) continue;
      const text = node.textContent ?? '';
      if (/MIT\s+licensed|Licencia\s+MIT/i.test(text)) {
        node.textContent = correct;
      }
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
          <Routes>
            <Route path="/focus/:laneKind/:caseId" element={<Focus />} />
        {/* Old deep links carried no lane and were always sequences; they keep working. */}
        <Route path="/focus/:caseId" element={<Focus />} />
            <Route path="*" element={<AppShell config={config}>
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
          </AppShell>} />
          </Routes>
        </CitationsProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}
