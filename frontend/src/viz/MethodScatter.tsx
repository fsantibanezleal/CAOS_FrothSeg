/** Accuracy against compute cost, one dot per method.
 *
 *  The 15-method table answers "which is best" but hides the trade that actually decides a
 *  deployment: C1 is 3.4 ms and scores 0.065, L5 is 324 ms and scores 0.510, N1 is 99 ms and
 *  scores 0.519. Ranked in a column those are three rows to hold in your head; plotted, N1
 *  sitting up and to the left of L5 is the whole finding.
 *
 *  Cost is on a log scale because it spans 3.4 ms to 972 ms; a linear axis would pile eleven
 *  methods against the left edge. The axis is labelled as logarithmic rather than left to be
 *  discovered.
 *
 *  Family carries identity (classical / trained / foundation / research), so it is a categorical
 *  encoding, and it is doubled with shape as well as colour so it survives colour-blindness and
 *  greyscale printing. The selected method is ringed and directly labelled.
 */
interface MethodPoint {
  id: string;
  name: string;
  family: string;
  ap: number;
  ms: number;
}

/* Order is load-bearing: it is the categorical assignment, and the adjacent-pair CVD check runs
   on it. Classical/trained/foundation/research as blue/orange/purple/green passes; the obvious
   blue/orange/green/purple ordering FAILS, because green next to orange is deltaE 5.7 under
   deuteranopia, which is below the floor even with the shape encoding these marks already carry.
   Validated with the palette validator in both modes; the light steps are darker steps of the
   same hues, chosen for the light surface rather than reused from dark. */
const FAMILY_ORDER = ['classical', 'trained', 'foundation model', 'research model'];

export function MethodScatter({
  points, selectedId, onSelect, es, ariaLabel,
}: {
  points: MethodPoint[];
  selectedId: string;
  onSelect: (id: string) => void;
  es: boolean;
  ariaLabel: string;
}) {
  if (points.length === 0) return null;

  const W = 460;
  const H = 380;
  const PAD = { l: 40, r: 20, t: 14, b: 44 };
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;

  const msValues = points.map((p) => Math.max(p.ms, 0.5));
  const lo = Math.log10(Math.min(...msValues));
  const hi = Math.log10(Math.max(...msValues));
  const span = hi - lo || 1;
  const x = (ms: number) => PAD.l + ((Math.log10(Math.max(ms, 0.5)) - lo) / span) * iw;
  const maxAp = Math.max(0.6, ...points.map((p) => p.ap));
  const y = (ap: number) => PAD.t + (1 - ap / maxAp) * ih;

  const decades = [1, 10, 100, 1000].filter((d) => Math.log10(d) >= lo - 0.35 && Math.log10(d) <= hi + 0.35);

  return (
    <figure className="fs-scatter">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} preserveAspectRatio="xMidYMid meet">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const v = f * maxAp;
          return (
            <g key={f}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="fs-scatter-grid" />
              <text x={PAD.l - 7} y={y(v) + 3.5} textAnchor="end" className="fs-scatter-tick">{v.toFixed(2)}</text>
            </g>
          );
        })}
        {decades.map((d) => (
          <text key={d} x={x(d)} y={H - 24} textAnchor="middle" className="fs-scatter-tick">{d} ms</text>
        ))}

        {points.map((p) => {
          const on = p.id === selectedId;
          const familyIndex = Math.max(0, FAMILY_ORDER.indexOf(p.family));
          const cx = x(p.ms);
          const cy = y(p.ap);
          return (
            <g
              key={p.id}
              className={`fs-scatter-pt fam-${familyIndex}${on ? ' on' : ''}`}
              onClick={() => onSelect(p.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p.id); } }}
            >
              <title>{`${p.id} ${p.name} · AP ${p.ap.toFixed(3)} · ${p.ms.toFixed(1)} ms · ${p.family}`}</title>
              {/* Shape doubles the family encoding so it is never colour-alone. */}
              {familyIndex === 0 && <circle cx={cx} cy={cy} r={5} />}
              {familyIndex === 1 && <rect x={cx - 4.4} y={cy - 4.4} width={8.8} height={8.8} rx={1.5} />}
              {familyIndex === 2 && <path d={`M${cx},${cy - 5.6} L${cx + 5.6},${cy} L${cx},${cy + 5.6} L${cx - 5.6},${cy} Z`} />}
              {familyIndex === 3 && <path d={`M${cx},${cy - 6} L${cx + 5.4},${cy + 4} L${cx - 5.4},${cy + 4} Z`} />}
              {on && <circle cx={cx} cy={cy} r={10} className="fs-scatter-ring" />}
              {(on || p.ap >= 0.4) && (
                <text x={cx + 10} y={cy + 3.5} className="fs-scatter-label">{p.id}</text>
              )}
            </g>
          );
        })}

        <text x={PAD.l + iw / 2} y={H - 6} textAnchor="middle" className="fs-scatter-axis">
          {es ? 'coste por imagen (escala log)' : 'cost per image (log scale)'}
        </text>
      </svg>

      <ul className="fs-scatter-legend">
        {FAMILY_ORDER.map((family, i) => (
          <li key={family} className={`fam-${i}`}>
            <span aria-hidden="true" />{familyLabel(family, es)}
          </li>
        ))}
      </ul>
    </figure>
  );
}

function familyLabel(family: string, es: boolean): string {
  if (family === 'classical') return es ? 'clásico' : 'classical';
  if (family === 'trained') return es ? 'entrenado' : 'trained';
  if (family === 'foundation model') return es ? 'fundacional' : 'foundation';
  return es ? 'investigación' : 'research';
}
