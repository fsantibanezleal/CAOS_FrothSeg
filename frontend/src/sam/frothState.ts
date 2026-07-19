// Froth-state read-out from the live bubble-size distribution: a domain soft-sensor that turns the measured BSD
// into an operating-state label + indicators + operator-facing notes. This is a heuristic proxy grounded in the
// froth-vision literature (Aldrich et al. 2010: BSD + froth class as soft sensors), not a calibrated plant
// setpoint. The App shows it as an interpretation of what the segmenter measured, always labelled as a proxy.
import type { Bsd } from './types';

export type FrothClass = 'empty' | 'watery' | 'fine-stable' | 'nominal' | 'coarse-collapsing' | 'mixed';

export interface FrothState {
  cls: FrothClass;
  title: string;
  summary: string;
  indicators: Array<{ label: string; value: string; note?: string }>;
  notes: string[]; // operator-facing, heuristic
  health: number; // 0..1 a coarse froth-stability score (proxy), for the gauge
}

/**
 * px -> mm using an optional scale (px per mm). If unknown, values stay in px and are labelled px.
 * `lang` selects the localized title/summary/indicator/notes strings so the Estado tab is bilingual;
 * the `cls` and `health` fields are language-independent.
 */
export function classifyFroth(bsd: Bsd, pxPerMm: number | null = null, lang: 'en' | 'es' = 'en'): FrothState {
  const es = lang === 'es';
  const toMm = (v: number | null): string =>
    v == null ? 'n/a' : pxPerMm ? `${(v / pxPerMm).toFixed(2)} mm` : `${v.toFixed(1)} px`;

  if (!bsd.count || bsd.count === 0 || bsd.d32 == null) {
    return {
      cls: 'empty',
      title: es ? 'Vacío / sin espuma' : 'Empty / no froth',
      summary: es
        ? 'No se segmentaron burbujas. La superficie de la celda parece agua de canaleta o un cuadro vacío.'
        : 'No bubbles were segmented. The cell surface looks like launder water or an empty frame.',
      indicators: [{ label: es ? 'conteo de burbujas' : 'bubble count', value: '0' }],
      notes: [
        es
          ? 'Verificar que el recorte esté sobre la superficie de espuma y que el cuadro no esté sobreexpuesto.'
          : 'Check the crop is on the froth surface and the frame is not over-exposed.',
      ],
      health: 0,
    };
  }

  const d32 = bsd.d32;
  const count = bsd.count;
  const small = bsd.pctSmall ?? 0;
  const spread = bsd.d90 != null && bsd.d10 != null && bsd.d50 ? (bsd.d90 - bsd.d10) / bsd.d50 : 0;

  // thresholds in px on the 256-frame scale (documented; re-scaled by pxPerMm for the label only)
  let cls: FrothClass;
  let title: string;
  let summary: string;
  let health: number;
  if (d32 < 14 && small > 0.02) {
    cls = 'fine-stable';
    title = es ? 'Espuma fina y estable' : 'Fine, stable froth';
    summary = es
      ? 'Muchas burbujas pequeñas: una espuma fina y bien mineralizada, por lo general un régimen de alta recuperación. Atención a una espuma sobre-estabilizada que no drena.'
      : 'Many small bubbles: a fine, well-mineralised froth, usually a high-recovery regime. Watch for an over-stabilised froth that will not drop.';
    health = 0.85;
  } else if (d32 > 34 && count < 120) {
    cls = 'coarse-collapsing';
    title = es ? 'Espuma gruesa / colapsante' : 'Coarse / collapsing froth';
    summary = es
      ? 'Pocas burbujas grandes: espuma que coalesce y colapsa, a menudo por sobre-espumado o poco espumante. La recuperación de finos tiende a caer.'
      : 'Few large bubbles: coalescing/collapsing froth, often over-frothing or low frother. Recovery of fines tends to fall.';
    health = 0.4;
  } else if (spread > 1.3) {
    cls = 'mixed';
    title = es ? 'Espuma mixta / bimodal' : 'Mixed / bimodal froth';
    summary = es
      ? 'Una dispersión amplia de tamaño de burbuja (bimodal). A menudo un transitorio durante un cambio de ley o de aire.'
      : 'A wide bubble-size spread (bimodal). Often a transient during a grade or air change.';
    health = 0.55;
  } else if (count < 40) {
    cls = 'watery';
    title = es ? 'Espuma acuosa / delgada' : 'Watery / thin froth';
    summary = es
      ? 'Burbujas escasas y débiles con bordes delgados: una espuma acuosa (baja carga / alta agua de lavado).'
      : 'Sparse, weak bubbles with thin borders: a watery froth (low pull / high wash water).';
    health = 0.45;
  } else {
    cls = 'nominal';
    title = es ? 'Espuma nominal' : 'Nominal froth';
    summary = es
      ? 'Una espuma polidispersa en la banda operacional normal.'
      : 'A polydisperse froth in the normal operating band.';
    health = 0.75;
  }

  return {
    cls,
    title,
    summary,
    indicators: [
      {
        label: es ? 'media de Sauter d32' : 'Sauter mean d32',
        value: toMm(d32),
        note: es ? 'tamaño medio de burbuja ponderado por superficie' : 'surface-weighted mean bubble size',
      },
      { label: es ? 'mediana d50' : 'median d50', value: toMm(bsd.d50) },
      { label: 'D10 / D90', value: `${toMm(bsd.d10)} / ${toMm(bsd.d90)}`, note: es ? 'colas fina / gruesa' : 'fine / coarse tails' },
      { label: es ? 'conteo de burbujas' : 'bubble count', value: String(count) },
      { label: es ? '% finos (< d50/2)' : '% fines (< d50/2)', value: `${((small) * 100).toFixed(1)}%` },
    ],
    notes: [
      es
        ? 'Proxy heurístico de la BSD (Aldrich et al. 2010), no un setpoint de planta calibrado.'
        : 'Heuristic proxy from the BSD (Aldrich et al. 2010), not a calibrated plant setpoint.',
      pxPerMm
        ? (es ? 'Tamaños mostrados en mm usando la escala ingresada.' : 'Sizes shown in mm using the entered scale.')
        : (es ? 'Sin escala píxel/mm ingresada, tamaños mostrados en píxeles.' : 'No pixel/mm scale entered, sizes shown in pixels.'),
    ],
    health,
  };
}
