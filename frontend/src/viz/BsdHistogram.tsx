import { useEffect, useMemo, useRef, useState } from 'react';

// Interactive bubble-size-distribution histogram (React + SVG). Bins the per-bubble equivalent diameters and
// draws them with hover readout (bin range + count + fraction), D10/D50/D90 + Sauter-d32 markers, and an
// optional second distribution (e.g. ground truth) overlaid as an outline so "SAM vs GT" BSDs are comparable.
// Theme-aware via shell CSS vars; keyboard-reachable summary table for a11y.

export interface BsdSeries {
  label: string;
  diameters: number[];
  color?: string;
}

export function BsdHistogram({
  series, unit = 'px', bins = 24, ariaLabel, height = 220,
}: {
  series: BsdSeries[];
  unit?: string;
  bins?: number;
  ariaLabel: string;
  height?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 600));
    ro.observe(el);
    setW(el.clientWidth || 600);
    return () => ro.disconnect();
  }, []);

  const model = useMemo(() => {
    const all = series.flatMap((s) => s.diameters).filter((d) => d > 0);
    if (all.length === 0) return null;
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const span = hi - lo || 1;
    const edges = Array.from({ length: bins + 1 }, (_, i) => lo + (i / bins) * span);
    const counts = series.map((s) => {
      const c = new Array(bins).fill(0);
      for (const d of s.diameters) {
        if (d <= 0) continue;
        let b = Math.floor(((d - lo) / span) * bins);
        if (b >= bins) b = bins - 1;
        if (b < 0) b = 0;
        c[b]++;
      }
      return c;
    });
    const maxCount = Math.max(1, ...counts.flat());
    const primary = series[0].diameters.slice().sort((a, b) => a - b);
    const pct = (p: number) => (primary.length ? primary[Math.min(primary.length - 1, Math.floor((p / 100) * (primary.length - 1)))] : 0);
    let s2 = 0, s3 = 0;
    for (const d of primary) { s2 += d * d; s3 += d * d * d; }
    const d32 = s2 ? s3 / s2 : 0;
    return { lo, hi, edges, counts, maxCount, markers: { d10: pct(10), d50: pct(50), d90: pct(90), d32 } };
  }, [series, bins]);

  if (!model) return <p className="fs-hint small">No bubbles to plot.</p>;

  const padL = 34, padR = 10, padT = 8, padB = 26;
  const plotW = Math.max(40, w - padL - padR);
  const plotH = height - padT - padB;
  const xOf = (d: number) => padL + ((d - model.lo) / (model.hi - model.lo || 1)) * plotW;
  const yOf = (c: number) => padT + plotH - (c / model.maxCount) * plotH;
  const bw = plotW / bins;

  return (
    <div ref={hostRef} style={{ width: '100%', position: 'relative' }}>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
        {series.map((s, i) => (
          <span key={s.label} className="fs-hint small" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, background: s.color ?? (i === 0 ? 'var(--color-accent)' : 'var(--color-fg-faint)'), display: 'inline-block', borderRadius: 2 }} />
            {s.label}
          </span>
        ))}
        {active != null && (
          <span className="fs-hint small mono" style={{ marginLeft: 'auto' }}>
            {model.edges[active].toFixed(1)}-{model.edges[active + 1].toFixed(1)} {unit}: {series.map((_, si) => model.counts[si][active]).join(' / ')}
          </span>
        )}
      </div>
      <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label={ariaLabel}
        style={{ display: 'block', font: '10px ui-monospace, monospace' }} onMouseLeave={() => setActive(null)}>
        {[0, 0.5, 1].map((f, i) => {
          const y = padT + plotH - f * plotH;
          return <g key={i}><line x1={padL} y1={y} x2={padL + plotW} y2={y} stroke="var(--color-border)" strokeWidth={0.5} opacity={0.6} />
            <text x={padL - 4} y={y + 3} textAnchor="end" fill="var(--color-fg-faint)">{Math.round(f * model.maxCount)}</text></g>;
        })}
        {/* primary bars */}
        {model.counts[0].map((c, i) => {
          const isA = i === active;
          return <rect key={i} x={xOf(model.edges[i]) + 0.5} y={yOf(c)} width={Math.max(0.5, bw - 1)} height={padT + plotH - yOf(c)}
            fill={series[0].color ?? 'var(--color-accent)'} opacity={isA ? 1 : 0.8}
            onMouseEnter={() => setActive(i)} />;
        })}
        {/* secondary as outline */}
        {series[1] && (
          <polyline fill="none" stroke={series[1].color ?? 'var(--color-fg-faint)'} strokeWidth={1.4}
            points={model.counts[1].map((c, i) => `${xOf((model.edges[i] + model.edges[i + 1]) / 2)},${yOf(c)}`).join(' ')} />
        )}
        {/* markers */}
        {([['d10', model.markers.d10], ['d50', model.markers.d50], ['d90', model.markers.d90], ['d32', model.markers.d32]] as const).map(([k, d]) => (
          <g key={k}>
            <line x1={xOf(d)} y1={padT} x2={xOf(d)} y2={padT + plotH} stroke="var(--color-fg)" strokeDasharray={k === 'd32' ? '1 0' : '3 2'} strokeWidth={k === 'd32' ? 1.2 : 0.8} opacity={0.5} />
            <text x={xOf(d)} y={padT + 9} textAnchor="middle" fill="var(--color-fg)" opacity={0.7}>{k}</text>
          </g>
        ))}
        {[model.lo, (model.lo + model.hi) / 2, model.hi].map((d, i) => (
          <text key={i} x={xOf(d)} y={height - 8} textAnchor="middle" fill="var(--color-fg-faint)">{d.toFixed(0)}</text>
        ))}
        <text x={padL + plotW / 2} y={height - 0} textAnchor="middle" fill="var(--color-fg-faint)">equivalent diameter ({unit})</text>
      </svg>
    </div>
  );
}
