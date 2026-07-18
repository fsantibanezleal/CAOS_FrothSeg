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

/** px -> mm using an optional scale (px per mm). If unknown, values stay in px and are labelled px. */
export function classifyFroth(bsd: Bsd, pxPerMm: number | null = null): FrothState {
  const toMm = (v: number | null): string =>
    v == null ? 'n/a' : pxPerMm ? `${(v / pxPerMm).toFixed(2)} mm` : `${v.toFixed(1)} px`;

  if (!bsd.count || bsd.count === 0 || bsd.d32 == null) {
    return {
      cls: 'empty',
      title: 'Empty / no froth',
      summary: 'No bubbles were segmented. The cell surface looks like launder water or an empty frame.',
      indicators: [{ label: 'bubble count', value: '0' }],
      notes: ['Check the crop is on the froth surface and the frame is not over-exposed.'],
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
    title = 'Fine, stable froth';
    summary = 'Many small bubbles: a fine, well-mineralised froth, usually a high-recovery regime. Watch for an over-stabilised froth that will not drop.';
    health = 0.85;
  } else if (d32 > 34 && count < 120) {
    cls = 'coarse-collapsing';
    title = 'Coarse / collapsing froth';
    summary = 'Few large bubbles: coalescing/collapsing froth, often over-frothing or low frother. Recovery of fines tends to fall.';
    health = 0.4;
  } else if (spread > 1.3) {
    cls = 'mixed';
    title = 'Mixed / bimodal froth';
    summary = 'A wide bubble-size spread (bimodal). Often a transient during a grade or air change.';
    health = 0.55;
  } else if (count < 40) {
    cls = 'watery';
    title = 'Watery / thin froth';
    summary = 'Sparse, weak bubbles with thin borders: a watery froth (low pull / high wash water).';
    health = 0.45;
  } else {
    cls = 'nominal';
    title = 'Nominal froth';
    summary = 'A polydisperse froth in the normal operating band.';
    health = 0.75;
  }

  return {
    cls,
    title,
    summary,
    indicators: [
      { label: 'Sauter mean d32', value: toMm(d32), note: 'surface-weighted mean bubble size' },
      { label: 'median d50', value: toMm(bsd.d50) },
      { label: 'D10 / D90', value: `${toMm(bsd.d10)} / ${toMm(bsd.d90)}`, note: 'fine / coarse tails' },
      { label: 'bubble count', value: String(count) },
      { label: '% fines (< d50/2)', value: `${((small) * 100).toFixed(1)}%` },
    ],
    notes: [
      'Heuristic proxy from the BSD (Aldrich et al. 2010), not a calibrated plant setpoint.',
      pxPerMm ? 'Sizes shown in mm using the entered scale.' : 'No pixel/mm scale entered, sizes shown in pixels.',
    ],
    health,
  };
}
