import { useCallback, useEffect, useRef, useState } from 'react';
import { useShellLang } from '@fasl-work/caos-app-shell';
import { artifactUrl, loadIndex, loadMasks } from '../api/artifacts';
import type { CaseIndex } from '../lib/contract.types';
import { decodeLabels } from '../lib/rle';
import { validateImage } from '../lib/imageGate';
import { loadImage, grayToRawImage } from '../lib/imageLoad';
import { preprocess } from '../preprocess/deglare';
import { FrothSegmenter, DEFAULT_MODEL } from '../sam/autoMask';
import type { SegResult } from '../sam/types';
import { classifyFroth } from '../sam/frothState';
import { maskAp, type MaskApResult } from '../sam/score';
import { MaskOverlay } from '../viz/MaskOverlay';
import { BsdHistogram } from '../viz/BsdHistogram';
import { Gauge } from '../viz/Gauge';
import { PanelBoundary } from '../viz/PanelBoundary';

type Tab = 'segment' | 'bsd' | 'state' | 'compare';

export default function Tool() {
  const es = useShellLang() === 'es';
  const [index, setIndex] = useState<CaseIndex | null>(null);
  const [source, setSource] = useState<'sample' | 'upload'>('sample');
  const [sampleId, setSampleId] = useState('poly-normal');
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState('');

  // controls
  const [grid, setGrid] = useState(28);
  const [predIou, setPredIou] = useState(0.86);
  const [stability, setStability] = useState(0.9);
  const [flatten, setFlatten] = useState(false);
  const [deglare, setDeglare] = useState(false);
  const [pxPerMm, setPxPerMm] = useState('');

  // model + run state
  const segRef = useRef<FrothSegmenter | null>(null);
  const [device, setDevice] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading-model' | 'running' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [errMsg, setErrMsg] = useState('');
  const [result, setResult] = useState<SegResult | null>(null);
  const [frameUrl, setFrameUrl] = useState('');
  const [gateFlags, setGateFlags] = useState<string[]>([]);
  const [gt, setGt] = useState<Int32Array | null>(null);
  const [ap, setAp] = useState<MaskApResult | null>(null);
  const [tab, setTab] = useState<Tab>('segment');

  useEffect(() => {
    loadIndex().then(setIndex).catch(() => setIndex(null));
  }, []);

  const scale = pxPerMm ? Number(pxPerMm) || null : null;

  const run = useCallback(async () => {
    setErrMsg('');
    setResult(null);
    setAp(null);
    setGt(null);
    try {
      // 1) resolve the frame
      const isSample = source === 'sample';
      const src = isSample ? artifactUrl(`synth/${sampleId}/frame.png`) : uploadUrl;
      if (!src) {
        setErrMsg(es ? 'Sube una imagen de espuma primero.' : 'Upload a froth image first.');
        return;
      }
      const img = await loadImage(src);
      // 2) CONTRACT-1 gate
      const gate = validateImage(img.gray, img.width, img.height);
      setGateFlags(gate.flags);
      if (!gate.ok) {
        setStatus('error');
        setErrMsg((es ? 'Cuadro rechazado: ' : 'Frame rejected: ') + gate.reason);
        return;
      }
      // 3) optional front-end
      const gray = flatten || deglare ? preprocess(img.gray, img.width, img.height, { flatten, deglare }) : img.gray;
      // show the (possibly preprocessed) frame
      setFrameUrl(makePngUrl(gray, img.width, img.height));
      // 4) model
      if (!segRef.current) {
        setStatus('loading-model');
        const seg = new FrothSegmenter(DEFAULT_MODEL);
        await seg.load('auto');
        segRef.current = seg;
        setDevice(seg.device);
      }
      // 5) segment
      setStatus('running');
      setProgress(0);
      const raw = grayToRawImage(gray, img.width, img.height);
      const r = await segRef.current!.segment(raw, {
        gridSize: grid,
        predIouThresh: predIou,
        stabilityThresh: stability,
        onProgress: (d, t) => setProgress(Math.round((d / t) * 100)),
      });
      setResult(r);
      setStatus('done');
      // 6) if synthetic, load GT + score live
      if (isSample) {
        try {
          const doc = await loadMasks(sampleId);
          const gtLabels = decodeLabels(doc);
          setGt(gtLabels);
          setAp(maskAp(r.labels, gtLabels));
        } catch { /* GT optional */ }
      }
    } catch (e) {
      setStatus('error');
      setErrMsg(String(e instanceof Error ? e.message : e));
    }
  }, [source, sampleId, uploadUrl, grid, predIou, stability, flatten, deglare, es]);

  const onUpload = (f: File | null) => {
    if (!f) return;
    if (uploadUrl) URL.revokeObjectURL(uploadUrl);
    setUploadUrl(URL.createObjectURL(f));
    setUploadName(f.name);
    setSource('upload');
  };

  const froth = result ? classifyFroth(result.bsd, scale) : null;
  const diams = result ? diametersFromLabels(result.labels) : [];
  const gtDiams = gt ? diametersFromLabels(gt) : [];

  return (
    <div className="page-body">
      <div className="page-head">
        <h1>{es ? 'App, segmentador de espuma en vivo' : 'App, live froth segmenter'}</h1>
        <p className="lede">
          {es ? 'Elige una muestra sintética (con verdad de terreno) o sube una foto de espuma real; el modelo SAM segmenta las burbujas en tu navegador y reporta la distribución de tamaño y el estado de la espuma.' : 'Pick a synthetic sample (with ground truth) or upload a real froth photo; the SAM model segments the bubbles in your browser and reports the size distribution and froth state.'}
        </p>
      </div>

      <div className="fs-layout">
        {/* ---- controls ---- */}
        <div className="fs-controls">
          <div className="fs-panel">
            <div className="fs-panel-t">{es ? 'Fuente' : 'Source'}</div>
            <div className="fs-seg" style={{ marginBottom: '0.5rem' }}>
              <button className={`chip${source === 'sample' ? ' on' : ''}`} onClick={() => setSource('sample')}>{es ? 'Muestra sintética' : 'Synthetic sample'}</button>
              <button className={`chip${source === 'upload' ? ' on' : ''}`} onClick={() => setSource('upload')}>{es ? 'Subir real' : 'Upload real'}</button>
            </div>
            {source === 'sample' ? (
              <label className="fs-ctl">{es ? 'caso' : 'case'}
                <select className="fs-sel" value={sampleId} onChange={(e) => setSampleId(e.target.value)}>
                  {index?.cases.map((c) => <option key={c.case_id} value={c.case_id}>{c.case_id} — {c.category}</option>)}
                </select>
              </label>
            ) : (
              <label className="fs-ctl">{es ? 'imagen de espuma' : 'froth image'}
                <input type="file" accept="image/*" onChange={(e) => onUpload(e.target.files?.[0] ?? null)} />
                {uploadName && <span className="fs-hint small mono">{uploadName}</span>}
              </label>
            )}
            <p className="fs-hint small" style={{ marginTop: '0.4rem' }}>
              {source === 'sample'
                ? (es ? 'Sintética: verdad de terreno disponible, se puntúa el AP en vivo.' : 'Synthetic: ground truth available, live AP is scored.')
                : (es ? 'Real: sin verdad de terreno; solo controlas cuál subes, todo lo demás corre igual.' : 'Real: no ground truth; you only pick what to upload, everything else runs the same.')}
            </p>
          </div>

          <div className="fs-panel">
            <div className="fs-panel-t">{es ? 'Controles del segmentador' : 'Segmenter controls'}</div>
            <label className="fs-ctl">{es ? 'densidad de grilla' : 'grid density'}: {grid}x{grid} ({grid * grid} {es ? 'puntos' : 'points'})
              <input type="range" min={12} max={40} step={4} value={grid} onChange={(e) => setGrid(+e.target.value)} />
            </label>
            <label className="fs-ctl">{es ? 'umbral IoU predicha' : 'predicted-IoU threshold'}: {predIou.toFixed(2)}
              <input type="range" min={0.5} max={0.95} step={0.02} value={predIou} onChange={(e) => setPredIou(+e.target.value)} />
            </label>
            <label className="fs-ctl">{es ? 'umbral estabilidad' : 'stability threshold'}: {stability.toFixed(2)}
              <input type="range" min={0.5} max={0.98} step={0.02} value={stability} onChange={(e) => setStability(+e.target.value)} />
            </label>
            <p className="fs-hint small">{es ? 'Grilla más densa y umbrales más bajos hallan más burbujas (y más falsos positivos). Ajusta y re-corre.' : 'Denser grid and lower thresholds find more bubbles (and more false positives). Adjust and re-run.'}</p>
          </div>

          <div className="fs-panel">
            <div className="fs-panel-t">{es ? 'Front-end de imagen real' : 'Real-image front-end'}</div>
            <div className="fs-seg">
              <button className={`chip${flatten ? ' on' : ''}`} onClick={() => setFlatten((v) => !v)}>{es ? 'Aplanar luz' : 'Flatten light'}</button>
              <button className={`chip${deglare ? ' on' : ''}`} onClick={() => setDeglare((v) => !v)}>{es ? 'Quitar brillo' : 'Deglare'}</button>
            </div>
            <label className="fs-ctl" style={{ marginTop: '0.5rem' }}>{es ? 'escala (px por mm, opcional)' : 'scale (px per mm, optional)'}
              <input className="fs-sel" type="number" min={0} step={0.1} value={pxPerMm} onChange={(e) => setPxPerMm(e.target.value)} placeholder="px/mm" />
            </label>
          </div>

          <button className="chip on" style={{ padding: '0.5rem', fontSize: '0.9rem' }} onClick={run} disabled={status === 'running' || status === 'loading-model'}>
            {status === 'loading-model' ? (es ? 'Cargando modelo...' : 'Loading model...') : status === 'running' ? (es ? `Segmentando ${progress}%` : `Segmenting ${progress}%`) : (es ? 'Segmentar' : 'Segment')}
          </button>
          {device && <p className="fs-hint small">{es ? 'motor' : 'engine'}: <span className="mono">{device}</span> · {result?.model?.split('/').pop()}</p>}
          {gateFlags.length > 0 && <p className="fs-note">{es ? 'avisos del cuadro: ' : 'frame flags: '}{gateFlags.join('; ')}</p>}
          {errMsg && <p className="fs-note">{errMsg}</p>}
        </div>

        {/* ---- main ---- */}
        <div className="fs-main">
          <div className="fs-tabs" role="tablist">
            {(['segment', 'bsd', 'state', 'compare'] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={`fs-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
                {label(t, es)}
              </button>
            ))}
          </div>

          {!result && status !== 'running' && status !== 'loading-model' && (
            <div className="fs-panel"><p className="fs-hint">{es ? 'Elige una fuente y pulsa Segmentar. El modelo se descarga una vez (unos MB) y luego corre en tu GPU.' : 'Pick a source and press Segment. The model downloads once (a few MB) and then runs on your GPU.'}</p></div>
          )}
          {(status === 'running' || status === 'loading-model') && (
            <div className="fs-panel"><p className="fs-hint"><span className="fs-spinner" /> {status === 'loading-model' ? (es ? 'descargando el modelo SAM...' : 'downloading the SAM model...') : (es ? `segmentando, ${progress}%` : `segmenting, ${progress}%`)}</p></div>
          )}

          {result && tab === 'segment' && (
            <PanelBoundary label="segment">
              <>
                <div className="fs-kpis">
                  <div className="fs-kpi"><div className="fs-kpi-v">{result.nInstances}</div><div className="fs-kpi-l">{es ? 'burbujas' : 'bubbles'}</div></div>
                  <div className="fs-kpi"><div className="fs-kpi-v">{result.bsd.d32 ?? '-'}</div><div className="fs-kpi-l">d32 (px)</div></div>
                  <div className="fs-kpi"><div className="fs-kpi-v">{ap?.ap != null ? ap.ap.toFixed(3) : '--'}</div><div className="fs-kpi-l">{es ? 'AP vs verdad' : 'AP vs truth'}</div></div>
                  <div className="fs-kpi"><div className="fs-kpi-v">{result.totalMs}<span style={{ fontSize: '0.7rem' }}>ms</span></div><div className="fs-kpi-l">{es ? 'tiempo' : 'time'}</div></div>
                </div>
                <div style={{ marginTop: '0.7rem' }}>
                  <MaskOverlay baseUrl={frameUrl} labels={result.labels} width={result.width} height={result.height} pxPerMm={scale}
                    caption={es ? 'Burbujas segmentadas en vivo por el modelo SAM sobre tu cuadro. Pasa el cursor para leer cada burbuja; rueda para hacer zoom.' : 'Bubbles segmented live by the SAM model on your frame. Hover to read each bubble; scroll to zoom.'} />
                </div>
                {ap?.ap != null && <p className="fs-hint small">{es ? 'AP de máscara en vivo vs la verdad de terreno sintética (mismas métricas que el benchmark).' : 'Live mask AP vs the synthetic ground truth (same metrics as the benchmark).'} AP50 {ap.ap50} · {ap.nPred} {es ? 'predichas' : 'pred'} / {ap.nGt} GT</p>}
              </>
            </PanelBoundary>
          )}

          {result && tab === 'bsd' && (
            <PanelBoundary label="bsd">
              <>
                <div className="fs-panel">
                  <div className="fs-panel-t">{es ? 'Distribución de tamaño de burbuja' : 'Bubble-size distribution'}</div>
                  <BsdHistogram ariaLabel="bubble-size distribution" unit={scale ? 'px' : 'px'}
                    series={gtDiams.length ? [{ label: 'SAM', diameters: diams }, { label: es ? 'verdad' : 'truth', diameters: gtDiams }] : [{ label: 'SAM', diameters: diams }]} />
                </div>
                <BsdTable es={es} bsd={result.bsd} scale={scale} />
              </>
            </PanelBoundary>
          )}

          {result && tab === 'state' && froth && (
            <PanelBoundary label="froth state">
              <div className="fs-panel">
                <div style={{ display: 'flex', gap: '1.2rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Gauge value={froth.health} label={es ? 'estabilidad (proxy)' : 'stability (proxy)'} />
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{froth.title}</div>
                    <p className="fs-hint">{froth.summary}</p>
                  </div>
                </div>
                <table className="fs-table" style={{ marginTop: '0.6rem' }}>
                  <tbody>{froth.indicators.map((ind) => (
                    <tr key={ind.label}><th>{ind.label}</th><td className="num">{ind.value}</td><td className="fs-hint small">{ind.note ?? ''}</td></tr>
                  ))}</tbody>
                </table>
                {froth.notes.map((n, i) => <p key={i} className="fs-note" style={{ marginTop: '0.4rem' }}>{n}</p>)}
              </div>
            </PanelBoundary>
          )}

          {result && tab === 'compare' && (
            <PanelBoundary label="compare">
              <div className="fs-panel">
                <div className="fs-panel-t">{es ? 'SAM en vivo vs el piso clásico' : 'Live SAM vs the classical floor'}</div>
                {source === 'sample' ? (
                  <p className="fs-hint">{es ? 'El piso clásico (watershed/SLIC, scikit-image) corre offline; su AP para este caso está en Benchmark. Aquí ves el AP en vivo de SAM contra la misma verdad de terreno. En el conjunto completo SAM gana en 10 de 13 casos.' : 'The classical floor (watershed/SLIC, scikit-image) runs offline; its AP for this case is on Benchmark. Here you see SAM\'s live AP against the same ground truth. Over the full set SAM wins 10 of 13 cases.'}</p>
                ) : (
                  <p className="fs-hint">{es ? 'El piso clásico usa scikit-image (Python) y corre offline, no en el navegador; para tu subida solo el segmentador SAM corre en vivo. Compara ambos métodos en la página Benchmark sobre los casos sintéticos.' : 'The classical floor uses scikit-image (Python) and runs offline, not in the browser; for your upload only the SAM segmenter runs live. Compare both methods on the Benchmark page over the synthetic cases.'}</p>
                )}
                {ap?.ap != null && (
                  <table className="fs-table" style={{ marginTop: '0.5rem' }}>
                    <tbody>
                      <tr><th>{es ? 'AP SAM en vivo' : 'live SAM AP'}</th><td className="num win">{ap.ap.toFixed(3)}</td></tr>
                      <tr><th>AP50</th><td className="num">{ap.ap50}</td></tr>
                      <tr><th>{es ? 'burbujas SAM / verdad' : 'bubbles SAM / truth'}</th><td className="num">{ap.nPred} / {ap.nGt}</td></tr>
                    </tbody>
                  </table>
                )}
              </div>
            </PanelBoundary>
          )}
        </div>
      </div>
    </div>
  );
}

function BsdTable({ es, bsd, scale }: { es: boolean; bsd: SegResult['bsd']; scale: number | null }) {
  const f = (v: number | null) => (v == null ? '-' : scale ? `${(v / scale).toFixed(2)} mm` : `${v.toFixed(1)} px`);
  return (
    <table className="fs-table" style={{ marginTop: '0.6rem' }}>
      <tbody>
        <tr><th>{es ? 'conteo' : 'count'}</th><td className="num">{bsd.count}</td></tr>
        <tr><th>D10</th><td className="num">{f(bsd.d10)}</td></tr>
        <tr><th>D50</th><td className="num">{f(bsd.d50)}</td></tr>
        <tr><th>D90</th><td className="num">{f(bsd.d90)}</td></tr>
        <tr><th>d32 (Sauter)</th><td className="num">{f(bsd.d32)}</td></tr>
        <tr><th>{es ? '% finos (< d50/2)' : '% fines (< d50/2)'}</th><td className="num">{bsd.pctSmall != null ? (bsd.pctSmall * 100).toFixed(1) + '%' : '-'}</td></tr>
      </tbody>
    </table>
  );
}

function label(t: Tab, es: boolean): string {
  return t === 'segment' ? (es ? 'Segmentación' : 'Segmentation')
    : t === 'bsd' ? (es ? 'Distribución' : 'Size distribution')
    : t === 'state' ? (es ? 'Estado' : 'Froth state')
    : (es ? 'Comparar' : 'Compare');
}

function diametersFromLabels(labels: Int32Array): number[] {
  const areas = new Map<number, number>();
  for (let i = 0; i < labels.length; i++) if (labels[i] > 0) areas.set(labels[i], (areas.get(labels[i]) ?? 0) + 1);
  return [...areas.values()].map((a) => 2 * Math.sqrt(a / Math.PI));
}

// render a grayscale [0,1] frame to a PNG data URL (so MaskOverlay's <img> shows the possibly-preprocessed frame)
function makePngUrl(gray: Float32Array, w: number, h: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const id = ctx.createImageData(w, h);
  for (let i = 0; i < gray.length; i++) {
    const v = Math.max(0, Math.min(255, Math.round(gray[i] * 255)));
    id.data[i * 4] = v; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
  return canvas.toDataURL('image/png');
}
