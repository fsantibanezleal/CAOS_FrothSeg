import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShellLang } from '@fasl-work/caos-app-shell';
import {
  artifactUrl, loadIndex, loadMasks, loadMethodBenchmark,
} from '../api/artifacts';
import type {
  CaseIndex, MethodBenchmarkDoc, MethodBenchmarkRow,
} from '../lib/contract.types';
import { decodeLabels } from '../lib/rle';
import { validateImage } from '../lib/imageGate';
import { loadImage, grayToRawImage } from '../lib/imageLoad';
import { decodeShowcaseLabels } from '../lib/showcaseLabels';
import { preprocess } from '../preprocess/deglare';
import type { FrothSegmenter } from '../sam/autoMask';
import type { SegResult } from '../sam/types';
import { classifyFroth } from '../sam/frothState';
import { maskAp, type MaskApResult } from '../sam/score';
import { MaskOverlay } from '../viz/MaskOverlay';
import { BsdHistogram } from '../viz/BsdHistogram';
import { Gauge } from '../viz/Gauge';
import { PanelBoundary } from '../viz/PanelBoundary';
import {
  CLASSICAL_METHODS, LIVE_CLASSICAL_METHODS, runClassical, type ClassicalMethod,
} from '../classical/methods';
import { bsdFromLabels } from '../sam/morphometry';
import {
  primaryShowcaseCases, visibleStillTabs, type StillTab, type WorkbenchSource,
} from '../lib/workbench';
import { SequenceWorkbench } from './SequenceWorkbench';

type Tab = StillTab;

export default function Tool() {
  const es = useShellLang() === 'es';
  const [index, setIndex] = useState<CaseIndex | null>(null);
  const [methodBenchmark, setMethodBenchmark] = useState<MethodBenchmarkDoc | null>(null);
  const [workbenchSource, setWorkbenchSource] = useState<WorkbenchSource>('still');
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
  const [method, setMethod] = useState<'sam' | ClassicalMethod>('watershed_dt');
  const [showcaseMethodId, setShowcaseMethodId] = useState('L5');

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
    loadMethodBenchmark().then(setMethodBenchmark).catch(() => setMethodBenchmark(null));
  }, []);

  // Always show the selected frame as a base preview, and clear any stale result/error, whenever the source or
  // case changes. Without this the image only appeared as part of a successful segmentation, so a failed run (or
  // just switching cases) left the panel blank / showed the previous case's masks.
  useEffect(() => {
    let cancelled = false;
    setResult(null); setAp(null); setGt(null); setErrMsg(''); setGateFlags([]); setStatus('idle'); setDevice('');
    if (workbenchSource !== 'still') {
      setFrameUrl('');
      return;
    }
    const src = source === 'sample' ? artifactUrl(`synth/${sampleId}/frame.png`) : uploadUrl;
    if (!src) { setFrameUrl(''); return; }
    loadImage(src)
      .then((img) => { if (!cancelled) setFrameUrl(makePngUrl(img.gray, img.width, img.height)); })
      .catch(() => { if (!cancelled) setFrameUrl(''); });
    return () => { cancelled = true; };
  }, [workbenchSource, source, sampleId, uploadUrl]);

  useEffect(() => {
    setTab('segment');
  }, [workbenchSource, source]);

  useEffect(() => {
    if (workbenchSource !== 'still' || source !== 'sample') return;
    let cancelled = false;
    setStatus('running');
    setErrMsg('');
    Promise.all([
      fetch(artifactUrl(`showcase/${showcaseMethodId}/${sampleId}/labels.rle`)).then((response) => {
        if (!response.ok) throw new Error(`label artifact HTTP ${response.status}`);
        return response.arrayBuffer();
      }),
      loadMasks(sampleId),
      loadImage(artifactUrl(`synth/${sampleId}/frame.png`)),
    ]).then(([buffer, truthDocument, image]) => {
      if (cancelled) return;
      const decoded = decodeShowcaseLabels(buffer);
      const truth = decodeLabels(truthDocument);
      const ids = new Set(decoded.labels);
      ids.delete(0);
      const selected = methodBenchmark?.methods.find(
        (candidate) => candidate.id === showcaseMethodId,
      );
      const precomputed: SegResult = {
        width: decoded.width,
        height: decoded.height,
        labels: decoded.labels,
        masks: [],
        nInstances: ids.size,
        device: 'offline artifact',
        model: `precomputed/${selected?.slug ?? showcaseMethodId}`,
        bsd: bsdFromLabels(decoded.labels),
        encoderMs: 0,
        totalMs: Math.round(selected?.compute.mean_inference_ms ?? 0),
      };
      setResult(precomputed);
      setGt(truth);
      setAp(maskAp(decoded.labels, truth));
      setAnalysisFrame(image.gray);
      setDevice('precomputed offline inference');
      setStatus('done');
    }).catch((reason) => {
      if (cancelled) return;
      setStatus('error');
      setErrMsg(String(reason instanceof Error ? reason.message : reason));
    });
    return () => { cancelled = true; };
  }, [workbenchSource, source, sampleId, showcaseMethodId, methodBenchmark]);

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
        // 4a) validated live classical twins (C1/C3/C4), pure CPU and no model download.
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
          const { FrothSegmenter, DEFAULT_MODEL } = await import('../sam/autoMask');
          const seg = new FrothSegmenter(DEFAULT_MODEL);
          await seg.load('auto');
          segRef.current = seg;
          setDevice(seg.device);
        }
        // 5) segment. If a non-wasm device (WebGPU) fails at inference, transparently reload on wasm and retry
        //    once, so a GPU that loads the model but cannot run it still produces a result instead of a dead panel.
        setStatus('running');
        setProgress(0);
        const raw = await grayToRawImage(gray, img.width, img.height);
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
            const { FrothSegmenter, DEFAULT_MODEL } = await import('../sam/autoMask');
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
  const boundaryPixels = result ? countBoundaryPixels(result.labels, result.width, result.height) : 0;
  const showcaseMethod = methodBenchmark?.methods.find((candidate) => candidate.id === showcaseMethodId) ?? null;
  const primaryCases = useMemo(() => primaryShowcaseCases(index?.cases ?? []), [index]);
  const visibleTabs = visibleStillTabs(source === 'sample' ? 'canonical' : 'upload', Boolean(result));
  const liveComparison = useMemo(() => {
    if (!analysisFrame || !result) return [];
    return LIVE_CLASSICAL_METHODS.map((candidate) => {
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
        <h1>{es ? 'Banco de trabajo de segmentación' : 'Froth segmentation workbench'}</h1>
        <p className="lede">
          {es
            ? 'Examine 15 métodos en 12 imágenes canónicas o reproduzca cinco secuencias con referencia temporal. Las cargas locales usan solo cuatro motores interactivos.'
            : 'Examine 15 methods on 12 canonical stills or replay five sequences with temporal reference. Local uploads use only four interactive engines.'}
        </p>
      </div>

      <section className="fs-source-model" aria-label={es ? 'Modelo de fuente' : 'Source model'}>
        <div>
          <span className="fs-source-kicker">{es ? 'Fuente de análisis' : 'Analysis source'}</span>
          <strong>{workbenchSource === 'still'
            ? (es ? 'Imagen fija' : 'Still image')
            : (es ? 'Secuencia temporal' : 'Temporal sequence')}</strong>
          <p>{workbenchSource === 'still'
            ? (es ? 'Compare artefactos precalculados o evalúe una imagen local.' : 'Compare precomputed artifacts or evaluate a local image.')
            : (es ? 'Reproduzca cuadros, identidades, seguimiento y eventos medidos offline.' : 'Replay frames, identities, tracking, and events measured offline.')}</p>
        </div>
        <div className="fs-source-switch" role="group" aria-label={es ? 'Tipo de fuente' : 'Source type'}>
          <button
            type="button"
            className={workbenchSource === 'still' ? 'on' : ''}
            aria-pressed={workbenchSource === 'still'}
            onClick={() => setWorkbenchSource('still')}
          >
            <span>01</span>{es ? 'Imagen fija' : 'Still image'}
          </button>
          <button
            type="button"
            className={workbenchSource === 'sequence' ? 'on' : ''}
            aria-pressed={workbenchSource === 'sequence'}
            onClick={() => setWorkbenchSource('sequence')}
          >
            <span>02</span>{es ? 'Secuencia' : 'Sequence'}
          </button>
        </div>
      </section>

      {workbenchSource === 'still' && (
      <div className="fs-layout">
        {/* ---- controls ---- */}
        <div className="fs-controls">
          <div className="fs-panel">
            <div className="fs-panel-t">{es ? 'Fuente de imagen fija' : 'Still-image input'}</div>
            <div className="fs-seg" style={{ marginBottom: '0.5rem' }}>
              <button className={`chip${source === 'sample' ? ' on' : ''}`} onClick={() => setSource('sample')}>{es ? 'Galería precalculada' : 'Precomputed gallery'}</button>
              <button className={`chip${source === 'upload' ? ' on' : ''}`} onClick={() => setSource('upload')}>{es ? 'Imagen local' : 'Local image'}</button>
            </div>
            {source === 'sample' ? (
              <label className="fs-ctl">{es ? 'caso principal (12 disponibles)' : 'primary case (12 available)'}
                <select className="fs-sel" value={sampleId} onChange={(e) => setSampleId(e.target.value)}>
                  {primaryCases.map((c) => <option key={c.case_id} value={c.case_id}>{caseLabel(c.case_id, c.category, es)}</option>)}
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
                ? (es ? 'Caso sintético anotado para explicación visual. Los controles diagnósticos permanecen en Benchmark y Metodología.' : 'Annotated synthetic case for visual analysis. Diagnostic controls remain documented in Benchmark and Methodology.')
                : (es ? 'La imagen permanece en este navegador. Sin anotación local no se afirma exactitud.' : 'The image stays in this browser. Without a local annotation, no accuracy claim is made.')}
            </p>
          </div>

          {source === 'upload' && <div className="fs-panel">
            <div className="fs-panel-t">{es ? 'Segmentación interactiva' : 'Interactive segmentation'}</div>
            <label className="fs-ctl">{es ? 'método interactivo (4 disponibles)' : 'interactive method (4 available)'}
              <select className="fs-sel" value={method} onChange={(e) => setMethod(e.target.value as 'sam' | ClassicalMethod)}>
                <option value="sam">{es ? 'SlimSAM cero-shot (modelo de navegador)' : 'SlimSAM zero-shot (browser model)'}</option>
                {LIVE_CLASSICAL_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            {method !== 'sam' && (
              <p className="fs-hint small">{classicalMethodNote(method, es)}. {es ? 'Se ejecuta sobre esta imagen en CPU, sin descargar un modelo.' : 'Runs on this image in the CPU, with no model download.'}</p>
            )}
            {method === 'sam' && (
              <>
                <label className="fs-ctl">{es ? 'densidad de grilla' : 'grid density'}: {grid}x{grid} ({grid * grid} {es ? 'puntos' : 'points'})
                  <input type="range" min={12} max={40} step={4} value={grid} onChange={(e) => setGrid(+e.target.value)} />
                </label>
                <label className="fs-ctl">{es ? 'umbral IoU predicha' : 'predicted-IoU threshold'}: {predIou.toFixed(2)}
                  <input type="range" min={0.5} max={0.95} step={0.02} value={predIou} onChange={(e) => setPredIou(+e.target.value)} />
                </label>
                <label className="fs-ctl">{es ? 'umbral estabilidad' : 'stability threshold'}: {stability.toFixed(2)}
                  <input type="range" min={0.5} max={0.98} step={0.02} value={stability} onChange={(e) => setStability(+e.target.value)} />
                </label>
                <p className="fs-hint small">{es ? 'Grilla más densa y umbrales más bajos hallan más burbujas (y más falsos positivos). Ajustar y volver a ejecutar.' : 'Denser grid and lower thresholds find more bubbles (and more false positives). Adjust and re-run.'}</p>
              </>
            )}
          </div>}

          {source === 'sample' && <div className="fs-panel">
            <div className="fs-panel-t">{es ? 'Inferencia precalculada' : 'Precomputed inference'}</div>
            <label className="fs-ctl">{es ? 'método (15 disponibles)' : 'method (all 15 available)'}
              <select className="fs-sel" value={showcaseMethodId} onChange={(event) => setShowcaseMethodId(event.target.value)}>
                <optgroup label={es ? 'Métodos clásicos' : 'Classical methods'}>
                  {methodBenchmark?.methods.filter((candidate) => candidate.id.startsWith('C')).map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{candidate.id} · {candidate.name}</option>
                  ))}
                </optgroup>
                <optgroup label={es ? 'Modelos entrenados y fundacionales' : 'Trained and foundation models'}>
                  {methodBenchmark?.methods.filter((candidate) => candidate.id.startsWith('L')).map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{candidate.id} · {candidate.name}</option>
                  ))}
                </optgroup>
                <optgroup label={es ? 'Experimento de investigación' : 'Research experiment'}>
                  {methodBenchmark?.methods.filter((candidate) => candidate.id.startsWith('N')).map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{candidate.id} · {candidate.name}</option>
                  ))}
                </optgroup>
              </select>
            </label>
            {showcaseMethod?.test && (
              <p className="fs-hint small">
                AP {showcaseMethod.test.mean_ap.toFixed(3)} · AP50 {showcaseMethod.test.mean_ap50.toFixed(3)} · PQ {showcaseMethod.test.mean_pq?.toFixed(3) ?? '--'} · {es ? '64 casos retenidos' : '64 held-out cases'}
              </p>
            )}
          </div>}

          {source === 'upload' && <div className="fs-panel">
            <div className="fs-panel-t">{es ? 'Front-end de imagen real' : 'Real-image front-end'}</div>
            <div className="fs-seg">
              <button className={`chip${flatten ? ' on' : ''}`} onClick={() => setFlatten((v) => !v)}>{es ? 'Aplanar luz' : 'Flatten light'}</button>
              <button className={`chip${deglare ? ' on' : ''}`} onClick={() => setDeglare((v) => !v)}>{es ? 'Quitar brillo' : 'Deglare'}</button>
            </div>
            <label className="fs-ctl" style={{ marginTop: '0.5rem' }}>{es ? 'escala (px por mm, opcional)' : 'scale (px per mm, optional)'}
              <input className="fs-sel" type="number" min={0} step={0.1} value={pxPerMm} onChange={(e) => setPxPerMm(e.target.value)} placeholder="px/mm" />
            </label>
          </div>}

          {source === 'upload' && <button className="chip on" style={{ padding: '0.5rem', fontSize: '0.9rem' }} onClick={run} disabled={status === 'running' || status === 'loading-model'}>
            {status === 'loading-model' ? (es ? 'Cargando modelo...' : 'Loading model...') : status === 'running' ? (es ? `Segmentando ${progress}%` : `Segmenting ${progress}%`) : (es ? 'Segmentar' : 'Segment')}
          </button>}
          {result && device && <p className="fs-hint small">{source === 'sample' ? (es ? 'artefacto' : 'artifact') : (es ? 'motor' : 'engine')}: <span className="mono">{device}</span> · {result.model.split('/').pop()}</p>}
          {gateFlags.length > 0 && <p className="fs-note">{es ? 'avisos del cuadro: ' : 'frame flags: '}{gateFlags.join('; ')}</p>}
          {errMsg && <p className="fs-note">{errMsg}</p>}
        </div>

        {/* ---- main ---- */}
        <div className="fs-main">
          {visibleTabs.length > 0 && <div className="fs-tabs" role="tablist" aria-label={es ? 'Análisis de imagen fija' : 'Still-image analysis'}>
            {visibleTabs.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={`fs-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
                {label(t, es)}
              </button>
            ))}
          </div>}

          {source === 'sample' && tab === 'segment' && !result && (
            <PanelBoundary label="precomputed instance segmentation">
              <div className="fs-panel">
                <div className="fs-panel-t">{showcaseMethod ? `${showcaseMethod.id} · ${showcaseMethod.name}` : showcaseMethodId}</div>
                <img
                  className="fs-frame-preview"
                  src={artifactUrl(`showcase/${showcaseMethodId}/${sampleId}/preview.png`)}
                  alt={es ? `resultado precalculado ${showcaseMethodId} para ${sampleId}` : `precomputed ${showcaseMethodId} result for ${sampleId}`}
                />
                {showcaseMethod?.test && (
                  <div className="fs-kpis" style={{ marginTop: '0.7rem' }}>
                    <Kpi value={showcaseMethod.test.mean_ap.toFixed(3)} label="AP test" />
                    <Kpi value={showcaseMethod.test.mean_ap50.toFixed(3)} label="AP50" />
                    <Kpi value={showcaseMethod.test.mean_pq?.toFixed(3) ?? '--'} label="PQ" />
                    <Kpi value={showcaseMethod.compute.mean_inference_ms.toFixed(1)} label="ms/image" />
                  </div>
                )}
                <p className="fs-hint">{es ? 'Máscara de instancias generada por inferencia offline para este caso canónico. El navegador carga el artefacto validado y no vuelve a ejecutar el modelo.' : 'Instance mask generated by offline inference for this canonical case. The browser loads the validated artifact and does not rerun the model.'}</p>
              </div>
            </PanelBoundary>
          )}

          {source === 'sample' && !result && tab !== 'segment' && tab !== 'compare' && (
            <div className="fs-panel fs-result-loading">
              <span className="fs-spinner" aria-hidden="true" />
              <div>
                <strong>{es ? 'Cargando el artefacto seleccionado' : 'Loading the selected artifact'}</strong>
                <p>{es ? 'La vista se habilitará con la misma máscara precalculada, sin recomputar el método.' : 'This view will use the same precomputed mask without rerunning the method.'}</p>
              </div>
            </div>
          )}

          {source === 'upload' && !result && status !== 'running' && status !== 'loading-model' && (
            <div className="fs-panel">
              {frameUrl && tab === 'segment' && <img className="fs-frame-preview" src={frameUrl} alt={es ? 'cuadro de espuma' : 'froth frame'} />}
              <p className="fs-hint" style={{ marginTop: frameUrl && tab === 'segment' ? '0.6rem' : 0 }}>{frameUrl
                ? (es ? 'Cuadro seleccionado. Elija uno de los cuatro métodos interactivos para segmentarlo. Los 15 métodos evaluados están disponibles en Resultados precalculados.' : 'Selected frame. Choose one of the four interactive methods to segment it. All 15 evaluated methods are available under Precomputed results.')
                : (es ? 'Seleccione una fuente y un método interactivo.' : 'Select a source and an interactive method.')}</p>
            </div>
          )}

          {source === 'sample' && tab === 'compare' && (
            <PanelBoundary label="held-out method evaluation">
              <div className="fs-panel">
                <div className="fs-panel-t">{es ? 'Los 15 métodos · prueba retenida de 64 casos' : 'All 15 methods · 64-case held-out test'}</div>
                <p className="fs-hint">{es ? 'Todos los resultados fueron generados offline con el mismo protocolo.' : 'Every result was generated offline under the same protocol.'}</p>
                <div style={{ overflowX: 'auto' }}>
                  <table className="fs-table">
                    <thead><tr><th>ID</th><th>{es ? 'método' : 'method'}</th><th>{es ? 'familia' : 'family'}</th><th className="num">AP</th><th className="num">AP50</th><th className="num">PQ</th><th className="num">Boundary F</th><th className="num">ms/image</th></tr></thead>
                    <tbody>
                      {methodBenchmark?.methods.map((candidate) => (
                        <tr key={candidate.id} className={candidate.id === showcaseMethodId ? 'fs-selected-row' : undefined}>
                          <td className="mono">{candidate.id}</td>
                          <th><button className="fs-method-pick" onClick={() => { setShowcaseMethodId(candidate.id); setTab('segment'); }}>{candidate.name}</button></th>
                          <td>{methodFamily(candidate, es)}</td>
                          <td className="num">{candidate.test?.mean_ap.toFixed(3) ?? '--'}</td>
                          <td className="num">{candidate.test?.mean_ap50.toFixed(3) ?? '--'}</td>
                          <td className="num">{candidate.test?.mean_pq?.toFixed(3) ?? '--'}</td>
                          <td className="num">{candidate.test?.mean_boundary_fscore?.toFixed(3) ?? '--'}</td>
                          <td className="num">{candidate.compute.mean_inference_ms.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </PanelBoundary>
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
                    caption={source === 'sample'
                      ? (es ? 'Máscara de instancias precalculada para el caso canónico seleccionado. Pase el cursor para inspeccionar cada burbuja.' : 'Precomputed instance mask for the selected canonical case. Hover to inspect each bubble.')
                      : method === 'sam'
                        ? (es ? 'Burbujas segmentadas en la imagen cargada por SlimSAM. Pase el cursor para inspeccionar cada burbuja.' : 'Bubbles segmented in the uploaded image by SlimSAM. Hover to inspect each bubble.')
                        : (es ? 'Burbujas segmentadas en la imagen cargada por el método clásico seleccionado.' : 'Bubbles segmented in the uploaded image by the selected classical method.')} />
                </div>
                {ap?.ap != null && <p className="fs-hint small">{source === 'sample' ? (es ? 'AP del artefacto precalculado respecto de la anotación sintética.' : 'Precomputed artifact AP against the synthetic annotation.') : (es ? 'AP de la máscara interactiva respecto de la anotación sintética.' : 'Interactive mask AP against the synthetic annotation.')} AP50 {ap.ap50} · {ap.nPred} {es ? 'predichas' : 'pred'} / {ap.nGt} GT</p>}
              </>
            </PanelBoundary>
          )}

          {result && tab === 'bsd' && (
            <PanelBoundary label="bsd">
              <>
                <div className="fs-panel">
                  <div className="fs-panel-t">{es ? 'Distribución de tamaño de burbuja' : 'Bubble-size distribution'}</div>
                  <BsdHistogram ariaLabel="bubble-size distribution" unit={scale ? 'px' : 'px'}
                    series={gtDiams.length ? [{ label: source === 'sample' ? showcaseMethodId : result.model, diameters: diams }, { label: es ? 'verdad' : 'truth', diameters: gtDiams }] : [{ label: result.model, diameters: diams }]} />
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
                    <tr><th>{es ? 'método' : 'method'}</th><td className="mono">{result.model}</td></tr>
                    {source === 'sample' ? (
                      <>
                        <tr><th>{es ? 'AP del caso' : 'case AP'}</th><td className="num">{ap?.ap?.toFixed(3) ?? '--'}</td></tr>
                        <tr><th>Brier ({es ? 'test, 64 casos' : 'test, 64 cases'})</th><td className="num">{showcaseMethod?.test?.mean_brier?.toFixed(4) ?? 'n/a'}</td></tr>
                        <tr><th>ECE ({es ? 'test, 64 casos' : 'test, 64 cases'})</th><td className="num">{showcaseMethod?.test?.mean_ece?.toFixed(4) ?? 'n/a'}</td></tr>
                      </>
                    ) : (
                      <>
                        <tr><th>{es ? 'umbral IoU' : 'IoU threshold'}</th><td className="num">{method === 'sam' ? predIou.toFixed(2) : 'n/a'}</td></tr>
                        <tr><th>{es ? 'estabilidad' : 'stability'}</th><td className="num">{method === 'sam' ? stability.toFixed(2) : 'deterministic'}</td></tr>
                        <tr><th>{es ? 'anotación local' : 'local annotation'}</th><td>{gt ? (es ? 'AP disponible' : 'AP available') : (es ? 'no disponible' : 'unavailable')}</td></tr>
                      </>
                    )}
                  </tbody>
                </table>
                <p className="fs-note">{source === 'sample'
                  ? (es ? 'Brier y ECE solo se reportan para modelos que producen probabilidades; son métricas agregadas del test retenido, no del cuadro canónico.' : 'Brier and ECE are reported only for probability-producing models; they are held-out test aggregates, not canonical-frame values.')
                  : (es ? 'Los umbrales de interfaz no representan incertidumbre calibrada.' : 'Interface thresholds do not represent calibrated uncertainty.')}</p>
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

          {result && tab === 'provenance' && (
            <PanelBoundary label="provenance">
              <div className="fs-panel">
                <div className="fs-panel-t">{es ? 'Proveniencia de la ejecución' : 'Run provenance'}</div>
                <table className="fs-table"><tbody>
                  <tr><th>{es ? 'fuente' : 'source'}</th><td className="mono">{source === 'sample' ? sampleId : uploadName}</td></tr>
                  <tr><th>{es ? 'ejecución' : 'execution'}</th><td>{source === 'sample' ? (es ? 'inferencia offline precalculada' : 'precomputed offline inference') : method === 'sam' ? (es ? 'modelo de navegador, imagen actual' : 'browser model, current image') : (es ? 'método clásico, imagen actual' : 'classical method, current image')}</td></tr>
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
                <pre className="fs-command">python -m fslab.pipeline all --output runs/local</pre>
                <p className="fs-hint">{es
                  ? 'El archivo contiene la máscara mostrada. El comando reproduce el horneado canónico completo (13 casos, 15 métodos) en un directorio de trabajo; no se envían datos a un servicio web.'
                  : 'The file contains the mask shown here. The command reproduces the complete canonical bake (13 cases, 15 methods) into a sandbox directory; data is not sent to a web service.'}</p>
                <p className="fs-note">{es
                  ? 'Todavía no existe un comando de inferencia por archivo. El repositorio ejecuta métodos sobre los casos registrados y sobre secuencias de imágenes; no decodifica video.'
                  : 'A per-file inference command does not exist yet. The repository runs methods over registered cases and over image sequences; it does not decode video.'}</p>
              </div>
            </PanelBoundary>
          )}

          {source === 'upload' && result && tab === 'compare' && (
            <PanelBoundary label="compare">
              <div className="fs-panel">
                <div className="fs-panel-t">{es ? 'Cuatro métodos interactivos · imagen actual' : 'Four interactive methods · current image'}</div>
                <p className="fs-hint">{es ? 'C1, C3 y C4 se calculan ahora. SlimSAM aparece con resultado solo cuando es el motor seleccionado; el navegador no simula métodos offline.' : 'C1, C3, and C4 are computed now. SlimSAM has a result only when selected; the browser does not imitate offline methods.'}</p>
                <table className="fs-table" style={{ marginTop: '0.5rem' }}>
                  <thead><tr><th>{es ? 'método' : 'method'}</th><th>{es ? 'ejecución' : 'execution'}</th><th className="num">{es ? 'instancias' : 'instances'}</th><th className="num">AP</th></tr></thead>
                  <tbody>
                    <tr>
                      <th>SlimSAM zero-shot</th>
                      <td>{method === 'sam' ? (es ? 'resultado actual' : 'current result') : (es ? 'seleccionar para ejecutar' : 'select to run')}</td>
                      <td className="num">{method === 'sam' ? result.nInstances : '--'}</td>
                      <td className="num">{method === 'sam' ? (ap?.ap?.toFixed(3) ?? '--') : '--'}</td>
                    </tr>
                    {LIVE_CLASSICAL_METHODS.map((candidate) => {
                      const live = liveComparison.find((row) => row.id === candidate.id);
                      return <tr key={candidate.id}>
                        <th>{candidate.label}</th>
                        <td>{es ? 'CPU · imagen actual' : 'CPU · current image'}</td>
                        <td className="num">{live?.count ?? '--'}</td>
                        <td className="num">{live?.ap?.toFixed(3) ?? '--'}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
                <p className="fs-note">{es ? 'Los otros 11 métodos permanecen disponibles para los 12 casos precalculados y en Benchmark; no se ofrecen como ejecución sobre cargas.' : 'The other 11 methods remain available for all 12 precomputed cases and in Benchmark; they are not offered as upload execution.'}</p>
              </div>
            </PanelBoundary>
          )}
        </div>
      </div>
      )}
      {workbenchSource === 'sequence' && <SequenceWorkbench es={es} />}
    </div>
  );
}

function methodFamily(method: MethodBenchmarkRow, es: boolean): string {
  if (method.tier === 'classical') return es ? 'clásico' : 'classical';
  if (method.tier === 'domain-sota') return es ? 'entrenado' : 'trained';
  if (method.tier === 'foundation') return es ? 'modelo fundacional' : 'foundation model';
  return es ? 'modelo de investigación' : 'research model';
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
    : t === 'provenance' ? (es ? 'Proveniencia' : 'Provenance')
    : t === 'export' ? (es ? 'Exportar' : 'Export')
    : (es ? 'Comparar' : 'Compare');
}

function caseLabel(caseId: string, category: string, es: boolean): string {
  const labels: Record<string, [string, string]> = {
    bursting: ['Bursting topology', 'Topología de ruptura'],
    'coarse-froth': ['Coarse froth', 'Espuma gruesa'],
    defocus: ['Optical defocus', 'Desenfoque óptico'],
    'edge-framing': ['Edge framing', 'Encuadre de borde'],
    'fine-froth': ['Fine froth', 'Espuma fina'],
    'glare-storm': ['Specular glare', 'Brillo especular'],
    'high-load': ['High solids loading', 'Alta carga de sólidos'],
    'low-light-noise': ['Low-light sensor noise', 'Ruido de sensor con poca luz'],
    'mono-clean': ['Monodisperse reference', 'Referencia monodispersa'],
    'motion-fast': ['Fast surface motion', 'Movimiento rápido de superficie'],
    'poly-normal': ['Nominal polydisperse froth', 'Espuma polidispersa nominal'],
    watery: ['Thin and watery froth', 'Espuma delgada y acuosa'],
  };
  return labels[caseId]?.[es ? 1 : 0] ?? category;
}

function classicalMethodNote(method: ClassicalMethod, es: boolean): string {
  if (!es) return CLASSICAL_METHODS.find((candidate) => candidate.id === method)?.note ?? '';
  const notes: Partial<Record<ClassicalMethod, string>> = {
    otsu_cc: 'línea base que subsegmenta burbujas en contacto',
    watershed_hmax: 'método clásico de espuma con marcadores de brillos',
    watershed_dt: 'referencia clásica genérica basada en distancia',
  };
  return notes[method] ?? '';
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
