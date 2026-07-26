import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShellLang } from '@fasl-work/caos-app-shell';
import { artifactUrl, loadIndex, loadMasks, loadTemporalBenchmark } from '../api/artifacts';
import type { CaseIndex, TemporalBenchmarkDoc } from '../lib/contract.types';
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
import { CLASSICAL_METHODS, runClassical, type ClassicalMethod } from '../classical/methods';
import { bsdFromLabels } from '../sam/morphometry';

type Tab = 'segment' | 'boundary' | 'bsd' | 'morphometry' | 'confidence'
  | 'state' | 'temporal' | 'provenance' | 'export' | 'compare';

const TABS: Tab[] = [
  'segment', 'boundary', 'bsd', 'morphometry', 'confidence',
  'state', 'temporal', 'provenance', 'export', 'compare',
];

export default function Tool() {
  const es = useShellLang() === 'es';
  const [index, setIndex] = useState<CaseIndex | null>(null);
  const [temporal, setTemporal] = useState<TemporalBenchmarkDoc | null>(null);
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
  const [method, setMethod] = useState<'sam' | ClassicalMethod>('sam');

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
  const [analysisFrame, setAnalysisFrame] = useState<Float32Array | null>(null);

  useEffect(() => {
    loadIndex().then(setIndex).catch(() => setIndex(null));
    loadTemporalBenchmark().then(setTemporal).catch(() => setTemporal(null));
  }, []);

  // Always show the selected frame as a base preview, and clear any stale result/error, whenever the source or
  // case changes. Without this the image only appeared as part of a successful segmentation, so a failed run (or
  // just switching cases) left the panel blank / showed the previous case's masks.
  useEffect(() => {
    let cancelled = false;
    setResult(null); setAp(null); setGt(null); setErrMsg(''); setGateFlags([]); setStatus('idle');
    const src = source === 'sample' ? artifactUrl(`synth/${sampleId}/frame.png`) : uploadUrl;
    if (!src) { setFrameUrl(''); return; }
    loadImage(src)
      .then((img) => { if (!cancelled) setFrameUrl(makePngUrl(img.gray, img.width, img.height)); })
      .catch(() => { if (!cancelled) setFrameUrl(''); });
    return () => { cancelled = true; };
  }, [source, sampleId, uploadUrl]);

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
        setErrMsg(es ? 'Subir una imagen de espuma primero.' : 'Upload a froth image first.');
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
      setAnalysisFrame(gray);
      // show the (possibly preprocessed) frame
      setFrameUrl(makePngUrl(gray, img.width, img.height));
      let r: SegResult;
      if (method !== 'sam') {
        // 4a) live classical tier (C1..C7): the JS twins of the offline Python floor, pure CPU, no model
        //     download, runs in milliseconds. The offline bake holds the pre-validated reference numbers.
        setStatus('running');
        setProgress(0);
        const t0 = performance.now();
        const labels = runClassical(method, gray, img.width, img.height);
        let nInstances = 0;
        for (const v of new Set(labels)) if (v > 0) nInstances++;
        r = {
          width: img.width, height: img.height, labels, masks: [], nInstances,
          device: 'cpu', model: `classical/${method}`,
          bsd: bsdFromLabels(labels), encoderMs: 0, totalMs: Math.round(performance.now() - t0),
        };
        setDevice('cpu · classical, live');
      } else {
        // 4b) model
        if (!segRef.current) {
          setStatus('loading-model');
          const seg = new FrothSegmenter(DEFAULT_MODEL);
          await seg.load('auto');
          segRef.current = seg;
          setDevice(seg.device);
        }
        // 5) segment. If a non-wasm device (WebGPU) fails at inference, transparently reload on wasm and retry
        //    once, so a GPU that loads the model but cannot run it still produces a result instead of a dead panel.
        setStatus('running');
        setProgress(0);
        const raw = grayToRawImage(gray, img.width, img.height);
        const segOpts = {
          gridSize: grid,
          predIouThresh: predIou,
          stabilityThresh: stability,
          onProgress: (d: number, t: number) => setProgress(Math.round((d / t) * 100)),
        };
        try {
          r = await segRef.current!.segment(raw, segOpts);
        } catch (segErr) {
          if (segRef.current && segRef.current.device !== 'wasm') {
            const seg = new FrothSegmenter(DEFAULT_MODEL);
            await seg.load('wasm');
            segRef.current = seg;
            setDevice(seg.device);
            r = await segRef.current.segment(raw, segOpts);
          } else {
            throw segErr;
          }
        }
      }
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
      segRef.current = null; // drop a possibly-corrupted model / lost GPU context so the next run reloads fresh
      setStatus('error');
      setErrMsg(String(e instanceof Error ? e.message : e));
    }
  }, [source, sampleId, uploadUrl, method, grid, predIou, stability, flatten, deglare, es]);

  const onUpload = (f: File | null) => {
    if (!f) return;
    if (uploadUrl) URL.revokeObjectURL(uploadUrl);
    setUploadUrl(URL.createObjectURL(f));
    setUploadName(f.name);
    setSource('upload');
  };

  const froth = result ? classifyFroth(result.bsd, scale, es ? 'es' : 'en') : null;
  const diams = result ? diametersFromLabels(result.labels) : [];
  const gtDiams = gt ? diametersFromLabels(gt) : [];
  const temporalRow = temporal?.sequences.find((row) => row.condition_id === sampleId);
  const boundaryPixels = result ? countBoundaryPixels(result.labels, result.width, result.height) : 0;
  const liveComparison = useMemo(() => {
    if (!analysisFrame || !result) return [];
    return CLASSICAL_METHODS.map((candidate) => {
      const labels = runClassical(candidate.id, analysisFrame, result.width, result.height);
      const ids = new Set(labels);
      ids.delete(0);
      const score = gt ? maskAp(labels, gt) : null;
      return { id: candidate.id, label: candidate.label, count: ids.size, ap: score?.ap ?? null };
    });
  }, [analysisFrame, result, gt]);

  return (
    <div className="page-body">
      <div className="page-head">
        <h1>{es ? 'App, banco de trabajo de segmentación' : 'App, segmentation workbench'}</h1>
        <p className="lede">
          {es ? 'Explorar un caso canónico o evaluar una imagen local con los motores ligeros. El benchmark y los modelos aprendidos se calculan fuera de línea; esta página nunca sustituye el pipeline científico.' : 'Explore one canonical case or evaluate a local image with the light engines. The benchmark and trained models are computed offline; this page never replaces the scientific pipeline.'}
        </p>
      </div>

      <MethodPortfolio es={es} />

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
                  {index?.cases.map((c) => <option key={c.case_id} value={c.case_id}>{c.case_id} · {c.category}</option>)}
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
                : (es ? 'Real: sin verdad de terreno; solo cambia la imagen subida, todo lo demás se ejecuta igual.' : 'Real: no ground truth; only the uploaded image changes, everything else runs the same.')}
            </p>
          </div>

          <div className="fs-panel">
            <div className="fs-panel-t">{es ? 'Motor ligero en vivo' : 'Light live engine'}</div>
            <label className="fs-ctl">{es ? 'método' : 'method'}
              <select className="fs-sel" value={method} onChange={(e) => setMethod(e.target.value as 'sam' | ClassicalMethod)}>
                <option value="sam">{es ? 'SlimSAM cero-shot (legado, GPU/WASM)' : 'SlimSAM zero-shot (legacy, GPU/WASM)'}</option>
                {CLASSICAL_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            {method !== 'sam' && (
              <p className="fs-hint small">{CLASSICAL_METHODS.find((m) => m.id === method)?.note}. {es ? 'Se ejecuta en vivo en la CPU (milisegundos, sin descarga de modelo); el piso clásico citado que el modelo aprendido debe superar.' : 'Runs live on the CPU (milliseconds, no model download); the cited classical floor the learned model must beat.'}</p>
            )}
            <label className="fs-ctl">{es ? 'densidad de grilla' : 'grid density'}: {grid}x{grid} ({grid * grid} {es ? 'puntos' : 'points'})
              <input type="range" min={12} max={40} step={4} value={grid} disabled={method !== 'sam'} onChange={(e) => setGrid(+e.target.value)} />
            </label>
            <label className="fs-ctl">{es ? 'umbral IoU predicha' : 'predicted-IoU threshold'}: {predIou.toFixed(2)}
              <input type="range" min={0.5} max={0.95} step={0.02} value={predIou} disabled={method !== 'sam'} onChange={(e) => setPredIou(+e.target.value)} />
            </label>
            <label className="fs-ctl">{es ? 'umbral estabilidad' : 'stability threshold'}: {stability.toFixed(2)}
              <input type="range" min={0.5} max={0.98} step={0.02} value={stability} disabled={method !== 'sam'} onChange={(e) => setStability(+e.target.value)} />
            </label>
            <p className="fs-hint small">{es ? 'Grilla más densa y umbrales más bajos hallan más burbujas (y más falsos positivos). Ajustar y volver a ejecutar.' : 'Denser grid and lower thresholds find more bubbles (and more false positives). Adjust and re-run.'}</p>
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
            {TABS.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={`fs-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
                {label(t, es)}
              </button>
            ))}
          </div>

          {!result && status !== 'running' && status !== 'loading-model' && (
            <div className="fs-panel">
              {frameUrl && tab === 'segment' && <img className="fs-frame-preview" src={frameUrl} alt={es ? 'cuadro de espuma' : 'froth frame'} />}
              <p className="fs-hint" style={{ marginTop: frameUrl && tab === 'segment' ? '0.6rem' : 0 }}>{frameUrl
                ? (es ? 'Cuadro seleccionado. Elegir un motor ligero y ejecutar; los resultados canónicos de los modelos pesados se consultan en Benchmark.' : 'Selected frame. Choose a light engine and run it; canonical heavy-model results belong in Benchmark.')
                : (es ? 'Seleccionar una fuente y un motor ligero.' : 'Select a source and a light engine.')}</p>
            </div>
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
                    caption={es ? 'Burbujas segmentadas en vivo por el modelo SAM sobre el cuadro. Al pasar el cursor se lee cada burbuja; con la rueda se hace zoom.' : 'Bubbles segmented live by the SAM model on the frame. Hover to read each bubble; scroll to zoom.'} />
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

          {result && tab === 'boundary' && (
            <PanelBoundary label="boundary and error">
              <div className="fs-panel">
                <div className="fs-panel-t">{es ? 'Frontera y errores de instancia' : 'Boundary and instance errors'}</div>
                <div className="fs-kpis">
                  <Kpi value={boundaryPixels} label={es ? 'píxeles frontera' : 'boundary pixels'} />
                  <Kpi value={ap?.nPred ?? result.nInstances} label={es ? 'predicciones' : 'predictions'} />
                  <Kpi value={ap?.nGt ?? '--'} label={es ? 'instancias GT' : 'GT instances'} />
                  <Kpi value={ap?.ap50?.toFixed(3) ?? '--'} label="AP50" />
                </div>
                <p className="fs-hint">{gt
                  ? (es ? 'La verdad sintética permite contar fallas; la matriz canónica completa de merge, split, miss y spurious se calcula offline.' : 'Synthetic truth enables error counting; the complete canonical merge, split, miss, and spurious matrix is computed offline.')
                  : (es ? 'Una carga real sin anotación no permite afirmar error de frontera. Exporta la máscara para anotarla y evaluarla offline.' : 'An unannotated real upload cannot support a boundary-error claim. Export the mask for annotation and offline evaluation.')}</p>
              </div>
            </PanelBoundary>
          )}

          {result && tab === 'morphometry' && (
            <PanelBoundary label="morphometry">
              <div className="fs-panel">
                <div className="fs-panel-t">{es ? 'Morfometría del caso seleccionado' : 'Selected-case morphometry'}</div>
                <BsdTable es={es} bsd={result.bsd} scale={scale} />
                <p className="fs-hint">{scale
                  ? (es ? 'Los diámetros se convierten con la escala suministrada; la escala no se estima ni se inventa.' : 'Diameters use the supplied scale; scale is neither estimated nor invented.')
                  : (es ? 'Sin calibración física, los resultados permanecen honestamente en píxeles.' : 'Without physical calibration, outputs honestly remain in pixels.')}</p>
              </div>
            </PanelBoundary>
          )}

          {result && tab === 'confidence' && (
            <PanelBoundary label="confidence and calibration">
              <div className="fs-panel">
                <div className="fs-panel-t">{es ? 'Confianza y calibración' : 'Confidence and calibration'}</div>
                <table className="fs-table">
                  <tbody>
                    <tr><th>{es ? 'motor' : 'engine'}</th><td className="mono">{result.model}</td></tr>
                    <tr><th>{es ? 'umbral IoU' : 'IoU threshold'}</th><td className="num">{method === 'sam' ? predIou.toFixed(2) : 'n/a'}</td></tr>
                    <tr><th>{es ? 'estabilidad' : 'stability'}</th><td className="num">{method === 'sam' ? stability.toFixed(2) : 'deterministic'}</td></tr>
                    <tr><th>{es ? 'calibración local' : 'local calibration'}</th><td>{gt ? (es ? 'AP contra GT disponible' : 'AP against GT available') : (es ? 'no disponible' : 'unavailable')}</td></tr>
                  </tbody>
                </table>
                <p className="fs-note">{es ? 'Los umbrales de interfaz no son incertidumbre calibrada. Brier/ECE pertenecen a los modelos que exponen probabilidades y se calculan offline.' : 'Interface thresholds are not calibrated uncertainty. Brier/ECE belong to probability-producing models and are computed offline.'}</p>
              </div>
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

          {result && tab === 'temporal' && (
            <PanelBoundary label="temporal">
              <div className="fs-panel">
                <div className="fs-panel-t">{es ? 'Secuencia y asociación' : 'Sequence and association'}</div>
                {source === 'sample' && temporalRow ? (
                  <>
                    <div className="fs-kpis">
                      <Kpi value={temporalRow.idf1.toFixed(3)} label="IDF1" />
                      <Kpi value={temporalRow.hota.toFixed(3)} label="HOTA" />
                      <Kpi value={temporalRow.track_fragmentations} label={es ? 'fragmentos' : 'fragments'} />
                      <Kpi value={temporalRow.flow_epe_px?.toFixed(2) ?? '--'} label="flow EPE px" />
                    </div>
                    <p className="fs-hint">{es ? 'Replay offline del U-Net sobre la secuencia exacta de este caso. No se vuelve a inferir al desplegar.' : 'Offline U-Net replay on this case’s exact sequence. Deployment does not rerun inference.'}</p>
                  </>
                ) : (
                  <p className="fs-note">{es ? 'Este cuadro no tiene una secuencia temporal validada. Use el comando de exportación para preparar un trabajo de video offline.' : 'This frame has no validated temporal sequence. Use the export view to prepare an offline video job.'}</p>
                )}
              </div>
            </PanelBoundary>
          )}

          {result && tab === 'provenance' && (
            <PanelBoundary label="provenance">
              <div className="fs-panel">
                <div className="fs-panel-t">{es ? 'Proveniencia de la ejecución' : 'Run provenance'}</div>
                <table className="fs-table"><tbody>
                  <tr><th>{es ? 'fuente' : 'source'}</th><td className="mono">{source === 'sample' ? sampleId : uploadName}</td></tr>
                  <tr><th>{es ? 'carril' : 'lane'}</th><td>{method === 'sam' ? 'live browser model' : 'validated live classical twin'}</td></tr>
                  <tr><th>{es ? 'método' : 'method'}</th><td className="mono">{result.model}</td></tr>
                  <tr><th>{es ? 'dispositivo' : 'device'}</th><td className="mono">{device || result.device}</td></tr>
                  <tr><th>{es ? 'preproceso' : 'preprocess'}</th><td>{[flatten && 'flatten', deglare && 'deglare'].filter(Boolean).join(', ') || 'none'}</td></tr>
                  <tr><th>{es ? 'escala' : 'scale'}</th><td>{scale ? `${scale} px/mm` : 'not supplied'}</td></tr>
                </tbody></table>
              </div>
            </PanelBoundary>
          )}

          {result && tab === 'export' && (
            <PanelBoundary label="export">
              <div className="fs-panel">
                <div className="fs-panel-t">{es ? 'Exportar resultado y trabajo offline' : 'Export result and offline job'}</div>
                <button className="chip on" onClick={() => exportResult({
                  source: source === 'sample' ? sampleId : uploadName,
                  method: result.model,
                  width: result.width,
                  height: result.height,
                  bsd: result.bsd,
                  scale_px_per_mm: scale,
                  labels: Array.from(result.labels),
                })}>{es ? 'Descargar JSON de instancia' : 'Download instance JSON'}</button>
                <pre className="fs-command">python -m fslab.pipeline infer --input &lt;image-or-video&gt; --method {method === 'sam' ? 'sam2_1' : method} --output-root runs/local</pre>
                <p className="fs-hint">{es ? 'El archivo contiene la máscara local. El comando ejecuta el motor científico offline; no se envían datos a un servicio web.' : 'The file contains the local mask. The command runs the offline scientific engine; data is not sent to a web service.'}</p>
              </div>
            </PanelBoundary>
          )}

          {result && tab === 'compare' && (
            <PanelBoundary label="compare">
              <div className="fs-panel">
                <div className="fs-panel-t">{es ? 'Comparación clásica del cuadro seleccionado' : 'Selected-frame classical comparison'}</div>
                <p className="fs-hint">{es ? 'Los siete gemelos clásicos se ejecutan ahora sobre el cuadro seleccionado. AP solo aparece cuando existe verdad sintética.' : 'All seven classical twins run now on the selected frame. AP appears only when synthetic truth exists.'}</p>
                <table className="fs-table" style={{ marginTop: '0.5rem' }}>
                  <thead><tr><th>{es ? 'método' : 'method'}</th><th className="num">{es ? 'instancias' : 'instances'}</th><th className="num">AP</th></tr></thead>
                  <tbody>{liveComparison.map((row) => <tr key={row.id}><th>{row.label}</th><td className="num">{row.count}</td><td className="num">{row.ap?.toFixed(3) ?? '--'}</td></tr>)}</tbody>
                </table>
              </div>
            </PanelBoundary>
          )}
        </div>
      </div>
    </div>
  );
}

function MethodPortfolio({ es }: { es: boolean }) {
  return (
    <section className="fs-method-portfolio" aria-label={es ? 'estado de métodos' : 'method status'}>
      <div className="fs-method-card">
        <span className="fs-method-count">7</span>
        <div><strong>{es ? 'Clásicos ejecutables' : 'Executable classical'}</strong>
          <p>{es ? 'C1-C7, benchmark offline completo; los siete gemelos están disponibles en vivo.' : 'C1-C7, complete offline benchmark; all seven twins are available live.'}</p></div>
        <span className="fs-lane live">{es ? 'fuera de línea + vivo' : 'offline + live'}</span>
      </div>
      <div className="fs-method-card">
        <span className="fs-method-count">7</span>
        <div><strong>{es ? 'Aprendidos y fundacionales' : 'Learned and foundation'}</strong>
          <p>{es ? 'L1-L7: entrenamiento e inferencia offline, checkpoints y evidencia retenida. Cellpose-SAM lidera; aquí solo aparecen motores livianos válidos.' : 'L1-L7: offline training/inference, checkpoints, and held-out evidence. Cellpose-SAM leads; only valid light engines appear here.'}</p></div>
        <span className="fs-lane offline">{es ? 'fuera de línea' : 'offline'}</span>
      </div>
      <div className="fs-method-card">
        <span className="fs-method-count">1</span>
        <div><strong>{es ? 'Frontera evaluada' : 'Evaluated frontier'}</strong>
          <p>{es ? 'N1 LamellaStar está implementado, pero v1 falló la barra. Se publica como resultado negativo, no como “beyond SOTA”.' : 'N1 LamellaStar is implemented, but v1 failed the bar. It is published as a negative result, not “beyond SOTA”.'}</p></div>
        <span className="fs-lane offline">{es ? 'fuera de línea' : 'offline'}</span>
      </div>
    </section>
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
    : t === 'boundary' ? (es ? 'Frontera/error' : 'Boundary/error')
    : t === 'bsd' ? (es ? 'Distribución' : 'Size distribution')
    : t === 'morphometry' ? (es ? 'Morfometría' : 'Morphometry')
    : t === 'confidence' ? (es ? 'Confianza' : 'Confidence')
    : t === 'state' ? (es ? 'Estado' : 'Froth state')
    : t === 'temporal' ? (es ? 'Temporal' : 'Temporal')
    : t === 'provenance' ? (es ? 'Proveniencia' : 'Provenance')
    : t === 'export' ? (es ? 'Exportar' : 'Export')
    : (es ? 'Comparar' : 'Compare');
}

function Kpi({ value, label: kpiLabel }: { value: string | number; label: string }) {
  return <div className="fs-kpi"><div className="fs-kpi-v">{value}</div><div className="fs-kpi-l">{kpiLabel}</div></div>;
}

function countBoundaryPixels(labels: Int32Array, width: number, height: number): number {
  let count = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    if ((x + 1 < width && labels[index] !== labels[index + 1])
      || (y + 1 < height && labels[index] !== labels[index + width])) count++;
  }
  return count;
}

function exportResult(document: Record<string, unknown>) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(document)], { type: 'application/json' }));
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = 'frothseg-result.json';
  anchor.click();
  URL.revokeObjectURL(url);
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
