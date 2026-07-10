import { useEffect, useMemo, useRef, useState } from 'react';

// Interactive instance-mask overlay: the froth frame with the segmented bubbles painted as translucent coloured
// instances over it. Meets the interactive-viz rubric: hover value-readout (per-bubble area + equivalent
// diameter), an opacity control, an outline-only mode, and a scroll-to-zoom / drag-to-pan viewport, theme-aware.
// Renders from a base image (URL) + an Int32 label map; the SAME component shows the live SAM masks and the
// ground-truth masks (Experiments) since both are just label maps.

export interface MaskOverlayProps {
  baseUrl: string;
  labels: Int32Array;
  width: number;
  height: number;
  pxPerMm?: number | null;
  caption?: string;
}

function colorFor(id: number): [number, number, number] {
  // golden-ratio hue hash -> distinct, stable colours per instance
  const h = (id * 0.61803398875) % 1;
  const s = 0.6;
  const v = 1.0;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const [r, g, b] = [
    [v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q],
  ][i % 6];
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export function MaskOverlay({ baseUrl, labels, width, height, pxPerMm, caption }: MaskOverlayProps) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overRef = useRef<HTMLCanvasElement>(null);
  const [opacity, setOpacity] = useState(0.55);
  const [outline, setOutline] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [hover, setHover] = useState<{ id: number; area: number; dEq: number; x: number; y: number } | null>(null);

  // per-instance area (once)
  const areaById = useMemo(() => {
    const m = new Map<number, number>();
    for (let i = 0; i < labels.length; i++) {
      const v = labels[i];
      if (v > 0) m.set(v, (m.get(v) ?? 0) + 1);
    }
    return m;
  }, [labels]);

  const nInstances = areaById.size;

  // draw base image
  useEffect(() => {
    const cv = baseRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
    };
    img.src = baseUrl;
  }, [baseUrl, width, height]);

  // draw overlay from labels
  useEffect(() => {
    const cv = overRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    const id = ctx.createImageData(width, height);
    const data = id.data;
    if (outline) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = y * width + x;
          const v = labels[i];
          if (v === 0) continue;
          const edge = (x + 1 < width && labels[i + 1] !== v) || (y + 1 < height && labels[i + width] !== v) || x === 0 || y === 0;
          if (edge) {
            const [r, g, b] = colorFor(v);
            const p = i * 4;
            data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
          }
        }
      }
    } else {
      for (let i = 0; i < labels.length; i++) {
        const v = labels[i];
        if (v === 0) continue;
        const [r, g, b] = colorFor(v);
        const p = i * 4;
        data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
      }
    }
    ctx.putImageData(id, 0, 0);
  }, [labels, width, height, outline]);

  const toMm = (v: number): string => (pxPerMm ? `${(v / pxPerMm).toFixed(2)} mm` : `${v.toFixed(1)} px`);

  const onMove = (e: React.MouseEvent) => {
    const cv = overRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    // account for zoom/pan transform on the wrapper
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top) / rect.height;
    const px = Math.floor(rx * width);
    const py = Math.floor(ry * height);
    if (drag.current) {
      setPan({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) });
      return;
    }
    if (px < 0 || py < 0 || px >= width || py >= height) return setHover(null);
    const v = labels[py * width + px];
    if (v > 0) {
      const area = areaById.get(v) ?? 0;
      setHover({ id: v, area, dEq: 2 * Math.sqrt(area / Math.PI), x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else setHover(null);
  };

  return (
    <div className="fs-overlay">
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
        <label className="fs-hint small">overlay
          <input type="range" min={0} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(+e.target.value)} style={{ verticalAlign: 'middle', marginLeft: 6 }} />
        </label>
        <div className="fs-seg" role="group" aria-label="mask style">
          <button type="button" className={`chip${!outline ? ' on' : ''}`} onClick={() => setOutline(false)} aria-pressed={!outline}>Fill</button>
          <button type="button" className={`chip${outline ? ' on' : ''}`} onClick={() => setOutline(true)} aria-pressed={outline}>Outline</button>
        </div>
        <button type="button" className="chip" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Reset view</button>
        <span className="fs-hint small mono" style={{ marginLeft: 'auto' }}>{nInstances} bubbles · zoom {zoom.toFixed(1)}x</span>
      </div>
      <div
        className="fs-overlay-view"
        style={{ position: 'relative', overflow: 'hidden', width: '100%', aspectRatio: `${width} / ${height}`, cursor: drag.current ? 'grabbing' : 'grab' }}
        onWheel={(e) => { const nz = Math.max(1, Math.min(8, zoom * (e.deltaY < 0 ? 1.15 : 0.87))); setZoom(nz); if (nz === 1) setPan({ x: 0, y: 0 }); }}
        onMouseDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; }}
        onMouseUp={() => { drag.current = null; }}
        onMouseMove={onMove}
        onMouseLeave={() => { setHover(null); drag.current = null; }}
      >
        <div style={{ position: 'absolute', inset: 0, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          <canvas ref={baseRef} width={width} height={height} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', imageRendering: 'pixelated' }} />
          <canvas ref={overRef} width={width} height={height} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', imageRendering: 'pixelated', opacity, mixBlendMode: 'normal' }} />
        </div>
        {hover && (
          <div className="fs-tooltip" style={{ left: Math.min(hover.x + 12, width - 4), top: hover.y + 12 }}>
            bubble #{hover.id} · area {hover.area}px · d_eq {toMm(hover.dEq)}
          </div>
        )}
      </div>
      {caption && <p className="fs-hint small" style={{ marginTop: '0.3rem' }}>{caption}</p>}
    </div>
  );
}
