/** AP against the IoU matching threshold, for one case.
 *
 *  The headline AP this product reports is the Cellpose/StarDist definition, TP/(TP+FP+FN)
 *  averaged over IoU thresholds 0.50 to 0.95. That average was shown as a single number with no
 *  way to see what it averages, on a panel that was otherwise four cards and a sentence. The
 *  curve is the metric's own shape: a method that finds every bubble but traces it loosely
 *  collapses on the right, and one that traces a few bubbles perfectly is flat and low.
 *
 *  The values come from `maskAp`, which already computed them to produce the mean.
 *
 *  One series, so no legend box: the panel title names it. Markers are 9px (the 8px floor for a
 *  hover target), the line is 2px, and the grid and axis type are recessive text tokens rather
 *  than the series colour.
 */
import { useId, useRef, useState } from 'react';

interface Point { threshold: number; ap: number }

export function ApCurve({
  curve, ap, es, ariaLabel,
}: {
  curve: Point[];
  ap: number | null;
  es: boolean;
  ariaLabel: string;
}) {
  const gradientId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<Point | null>(null);
  if (curve.length === 0) return null;

  const W = 520;
  const H = 240;
  const PAD = { l: 44, r: 16, t: 16, b: 38 };
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (t: number) => PAD.l + ((t - 0.5) / 0.45) * iw;
  const y = (v: number) => PAD.t + (1 - v) * ih;

  const line = curve.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.threshold).toFixed(1)},${y(p.ap).toFixed(1)}`).join(' ');
  const area = `${line} L${x(curve[curve.length - 1].threshold).toFixed(1)},${y(0)} L${x(curve[0].threshold).toFixed(1)},${y(0)} Z`;

  /** Nearest point in x, so the whole plot is the hit target rather than each 9px dot. */
  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const local = ((event.clientX - box.left) / box.width) * W;
    let best = curve[0];
    for (const point of curve) {
      if (Math.abs(x(point.threshold) - local) < Math.abs(x(best.threshold) - local)) best = point;
    }
    setHover(best);
  };

  return (
    <figure className="fs-apcurve">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="xMidYMid meet"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="fs-apcurve-grid" />
            <text x={PAD.l - 8} y={y(v) + 3.5} textAnchor="end" className="fs-apcurve-tick">{v.toFixed(2)}</text>
          </g>
        ))}
        {[0.5, 0.6, 0.7, 0.8, 0.9].map((t) => (
          <text key={t} x={x(t)} y={H - 14} textAnchor="middle" className="fs-apcurve-tick">{t.toFixed(2)}</text>
        ))}

        {ap != null && (
          <g>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(ap)} y2={y(ap)} className="fs-apcurve-mean" />
            <text x={W - PAD.r} y={y(ap) - 6} textAnchor="end" className="fs-apcurve-meanlabel">
              {es ? 'media' : 'mean'} {ap.toFixed(3)}
            </text>
          </g>
        )}

        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} className="fs-apcurve-line" />

        {/* Direct label on the two ends: the shape is readable without hovering. */}
        <text x={x(curve[0].threshold) + 6} y={y(curve[0].ap) - 9} className="fs-apcurve-end">
          {curve[0].ap.toFixed(2)}
        </text>
        <text x={x(curve[curve.length - 1].threshold) - 2} y={y(curve[curve.length - 1].ap) - 9} textAnchor="end" className="fs-apcurve-end">
          {curve[curve.length - 1].ap.toFixed(2)}
        </text>

        {curve.map((p) => (
          <circle key={p.threshold} cx={x(p.threshold)} cy={y(p.ap)} r={4.5} className="fs-apcurve-dot" />
        ))}

        {hover && (
          <g className="fs-apcurve-hover" pointerEvents="none">
            <line x1={x(hover.threshold)} x2={x(hover.threshold)} y1={PAD.t} y2={PAD.t + ih} className="fs-apcurve-cross" />
            <circle cx={x(hover.threshold)} cy={y(hover.ap)} r={5.5} className="fs-apcurve-dot-on" />
            <g transform={`translate(${Math.min(x(hover.threshold) + 10, W - PAD.r - 116)}, ${Math.max(y(hover.ap) - 34, PAD.t + 2)})`}>
              <rect width="112" height="30" rx="7" className="fs-apcurve-tipbg" />
              <text x={8} y={13} className="fs-apcurve-tiplabel">IoU {hover.threshold.toFixed(2)}</text>
              <text x={8} y={24} className="fs-apcurve-tipvalue">AP {hover.ap.toFixed(3)}</text>
            </g>
          </g>
        )}

        <text x={PAD.l + iw / 2} y={H - 2} textAnchor="middle" className="fs-apcurve-axis">
          {es ? 'umbral de emparejamiento IoU' : 'IoU matching threshold'}
        </text>
      </svg>
    </figure>
  );
}
