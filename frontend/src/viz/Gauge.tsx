// Simple SVG arc gauge for a 0..1 proxy score (froth stability / health). Theme-aware; the value is also given
// as text so it is never colour-only.
export function Gauge({ value, label, sub }: { value: number; label: string; sub?: string }) {
  const v = Math.max(0, Math.min(1, value));
  const r = 46;
  const cx = 60;
  const cy = 60;
  const a0 = Math.PI * 0.75; // start (bottom-left)
  const a1 = Math.PI * 2.25; // end (bottom-right), 270deg sweep
  const a = a0 + (a1 - a0) * v;
  const pt = (ang: number) => [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
  const [sx, sy] = pt(a0);
  const [ex, ey] = pt(a1);
  const [vx, vy] = pt(a);
  const large = a - a0 > Math.PI ? 1 : 0;
  const arc = (x0: number, y0: number, x1: number, y1: number, lg: number) => `M ${x0} ${y0} A ${r} ${r} 0 ${lg} 1 ${x1} ${y1}`;
  const color = v < 0.4 ? '#f0883e' : v < 0.7 ? '#d29922' : 'var(--color-accent)';
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={120} height={92} viewBox="0 0 120 92" role="img" aria-label={`${label}: ${(v * 100).toFixed(0)}%`}>
        <path d={arc(sx, sy, ex, ey, 1)} fill="none" stroke="var(--color-border)" strokeWidth={9} strokeLinecap="round" />
        <path d={arc(sx, sy, vx, vy, large)} fill="none" stroke={color} strokeWidth={9} strokeLinecap="round" />
        <text x={cx} y={cy + 2} textAnchor="middle" fill="var(--color-fg)" style={{ font: '700 20px ui-monospace, monospace' }}>{Math.round(v * 100)}</text>
        <text x={cx} y={cy + 18} textAnchor="middle" fill="var(--color-fg-faint)" style={{ font: '9px ui-monospace, monospace' }}>/ 100</text>
      </svg>
      <div className="fs-hint small" style={{ fontWeight: 600 }}>{label}</div>
      {sub && <div className="fs-hint small" style={{ opacity: 0.75 }}>{sub}</div>}
    </div>
  );
}
