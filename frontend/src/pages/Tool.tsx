import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Maximize2 } from 'lucide-react';
import { SubTabs, Tabs, useShellLang, type TabDef } from '@fasl-work/caos-app-shell';
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
import { ApCurve } from '../viz/ApCurve';
import { Gauge } from '../viz/Gauge';
import { PanelBoundary } from '../viz/PanelBoundary';
import {
  LIVE_CLASSICAL_METHODS, runClassical, type ClassicalMethod,
} from '../classical/methods';
import { bsdFromLabels } from '../sam/morphometry';
import {
  groupOfTab, primaryShowcaseCases, stillGroups,
  type StillTab, type WorkbenchSource,
} from '../lib/workbench';
import { SequenceControls, SequenceStage, useSequenceLane } from './SequenceWorkbench';

type Tab = StillTab;

export default function Tool() {
  const es = useShellLang() === 'es';
  const [index, setIndex] = useState<CaseIndex | null>(null);
  const [methodBenchmark, setMethodBenchmark] = useState<MethodBenchmarkDoc | null>(null);
  // Returning from focus carries the lane and the scenario, so the round trip preserves
  // the user's selection instead of resetting it (ADR-0070 8).
  const [workbenchSource, setWorkbenchSource] = useState<WorkbenchSource>(
    () => (new URLSearchParams(window.location.search).get('source') === 'sequence' ? 'sequence' : 'still'),
  );
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
  const [gt, setGt] = useState<Int32Array | null>(null);
  const [ap, setAp] = useState<MaskApResult | null>(null);
  const [tab, setTab] = useState<Tab>('segment');
  const [analysisFrame, setAnalysisFrame] = useState<Float32Array | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // The sequence lane's state lives here so its controls can share the single rail.
  const lane = useSequenceLane(es);

  const restoredCase = searchParams.get('case');
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !restoredCase || !lane.manifest) return;
    const index = lane.manifest.sequences.findIndex((s) => s.case_id === restoredCase);
    if (index >= 0) lane.setSequenceIndex(index);
    restoredRef.current = true;
  }, [restoredCase, lane]);

  useEffect(() => {
    loadIndex().then(setIndex).catch(() => setIndex(null));
    loadMethodBenchmark().then(setMethodBenchmark).catch(() => setMethodBenchmark(null));
  }, []);

  // Always show the selected frame as a base preview, and clear any stale result/error, whenever the source or
  // case changes. Without this the image only appeared as part of a successful segmentation, so a failed run (or
  // just switching cases) left the panel blank / showed the previous case's masks.
  useEffect(() => {
    let cancelled = false;
    setResult(null); setAp(null); setGt(null); setErrMsg(''); setStatus('idle'); setDevice('');
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
  const groups = stillGroups(source === 'sample' ? 'canonical' : 'upload', Boolean(result));
  const activeGroup = groupOfTab(tab);
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

  const sequenceMode = workbenchSource === 'sequence';
  const focusCase = sequenceMode ? (lane.sequence?.case_id ?? sampleId) : sampleId;


  /* ADR-0016 6 and ADR-0017 1.1: the App composes the shell's Tabs primitive. It does not
     define its own tab strip. The reference app does exactly this in its own Tool.tsx, and the
     hand-rolled `.fs-tab` strip that used to live here was the violation Felipe rejected. */
  const busy = status === 'running' || status === 'loading-model';
  const pending = (showFrame: boolean) => (
    <>
      {source === 'sample' && !result && (
            <div className="fs-panel fs-result-loading">
              <span className="fs-spinner" aria-hidden="true" />
              <div>
                <strong>{es ? 'Cargando el artefacto seleccionado' : 'Loading the selected artifact'}</strong>
                <p>{es ? 'La vista se habilitará con la misma máscara precalculada, sin recomputar el método.' : 'This view will use the same precomputed mask without rerunning the method.'}</p>
              </div>
            </div>)}
      {source === 'upload' && !result && !busy && (
            <div className="fs-panel">
              {frameUrl && showFrame && <img className="fs-frame-preview" src={frameUrl} alt={es ? 'cuadro de espuma' : 'froth frame'} />}
              <p className="fs-hint" style={{ marginTop: frameUrl && showFrame ? '0.6rem' : 0 }}>{frameUrl
                ? (es ? 'Cuadro seleccionado. Elija uno de los cuatro métodos interactivos para segmentarlo. Los 15 métodos evaluados están disponibles en Resultados precalculados.' : 'Selected frame. Choose one of the four interactive methods to segment it. All 15 evaluated methods are available under Precomputed results.')
                : (es ? 'Seleccione una fuente y un método interactivo.' : 'Select a source and an interactive method.')}</p>
            </div>)}
      {busy && (
            <div className="fs-panel"><p className="fs-hint"><span className="fs-spinner" /> {status === 'loading-model' ? (es ? 'descargando el modelo SAM...' : 'downloading the SAM model...') : (es ? `segmentando, ${progress}%` : `segmenting, ${progress}%`)}</p></div>)}
    </>
  );

  const stillPanels: Record<StillTab, ReactNode> = {
    segment: (
      <>
        {source === 'sample' && !result && (
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
            </PanelBoundary>)}
        {result && (
            <PanelBoundary label="segment">
              {/* ADR-0071 8: the instrument takes the majority of the surface. A square frame in a
                  1220px stage cannot reach that on its own, since its ceiling is the stage HEIGHT
                  squared, so the horizontal remainder carries the readouts and the size
                  distribution instead of sitting empty. Measured before: 31% and two dead bands. */}
              <div className="fs-segment-view">
                <div className="fs-overlay-slot">
                  <MaskOverlay baseUrl={frameUrl} labels={result.labels} width={result.width} height={result.height} pxPerMm={scale}
                    caption={source === 'sample'
                      ? (es ? 'Máscara de instancias precalculada para el caso canónico seleccionado. Pase el cursor para inspeccionar cada burbuja.' : 'Precomputed instance mask for the selected canonical case. Hover to inspect each bubble.')
                      : method === 'sam'
                        ? (es ? 'Burbujas segmentadas en la imagen cargada por SlimSAM. Pase el cursor para inspeccionar cada burbuja.' : 'Bubbles segmented in the uploaded image by SlimSAM. Hover to inspect each bubble.')
                        : (es ? 'Burbujas segmentadas en la imagen cargada por el método clásico seleccionado.' : 'Bubbles segmented in the uploaded image by the selected classical method.')} />
                </div>
                <aside className="fs-companion">
                  <div className="fs-kpis fs-kpis-stack">
                    <div className="fs-kpi"><div className="fs-kpi-v">{result.nInstances}</div><div className="fs-kpi-l">{es ? 'burbujas' : 'bubbles'}</div></div>
                    <div className="fs-kpi"><div className="fs-kpi-v">{result.bsd.d32 ?? '-'}</div><div className="fs-kpi-l">d32 (px)</div></div>
                    <div className="fs-kpi"><div className="fs-kpi-v">{ap?.ap != null ? ap.ap.toFixed(3) : '--'}</div><div className="fs-kpi-l">{es ? 'AP vs verdad' : 'AP vs truth'}</div></div>
                    <div className="fs-kpi"><div className="fs-kpi-v">{result.totalMs}<span style={{ fontSize: '0.7rem' }}>ms</span></div><div className="fs-kpi-l">{es ? 'tiempo' : 'time'}</div></div>
                  </div>
                  <div className="fs-companion-plot">
                    <div className="fs-panel-t">{es ? 'Distribución de tamaño' : 'Size distribution'}</div>
                    <BsdHistogram ariaLabel="bubble-size distribution" unit="px"
                      series={gtDiams.length
                        ? [{ label: source === 'sample' ? showcaseMethodId : result.model, diameters: diams }, { label: es ? 'verdad' : 'truth', diameters: gtDiams }]
                        : [{ label: result.model, diameters: diams }]} />
                  </div>
                  {ap?.ap != null && <p className="fs-hint small">{source === 'sample' ? (es ? 'AP del artefacto precalculado respecto de la anotación sintética.' : 'Precomputed artifact AP against the synthetic annotation.') : (es ? 'AP de la máscara interactiva respecto de la anotación sintética.' : 'Interactive mask AP against the synthetic annotation.')} AP50 {ap.ap50} · {ap.nPred} {es ? 'predichas' : 'pred'} / {ap.nGt} GT</p>}
                </aside>
              </div>
            </PanelBoundary>)}
        {!result && pending(true)}
      </>
    ),
    bsd: result ? (
            <PanelBoundary label="bsd">
              <>
                <div className="fs-panel">
                  <div className="fs-panel-t">{es ? 'Distribución de tamaño de burbuja' : 'Bubble-size distribution'}</div>
                  <BsdHistogram ariaLabel="bubble-size distribution" unit={scale ? 'px' : 'px'}
                    series={gtDiams.length ? [{ label: source === 'sample' ? showcaseMethodId : result.model, diameters: diams }, { label: es ? 'verdad' : 'truth', diameters: gtDiams }] : [{ label: result.model, diameters: diams }]} />
                </div>
                <BsdTable es={es} bsd={result.bsd} scale={scale} />
              </>
            </PanelBoundary>) : pending(false),
    boundary: result ? (
            <PanelBoundary label="boundary and error">
              {/* This panel used to be four cards and one sentence over an empty stage. The AP
                  it reports is an average over ten IoU thresholds that maskAp already computes
                  and used to discard, so the curve is shown rather than described, next to the
                  instance outcomes at the standard 0.5 operating point. */}
              <div className="fs-quality-view">
                <div className="fs-panel">
                  <div className="fs-panel-t">{es ? 'AP contra el umbral IoU' : 'AP against the IoU threshold'}</div>
                  <ApCurve curve={ap?.curve ?? []} ap={ap?.ap ?? null} es={es}
                    ariaLabel={es ? 'AP por umbral de IoU' : 'AP by IoU threshold'} />
                  <p className="fs-hint small">{es
                    ? 'Cada punto es TP/(TP+FP+FN) al emparejar con ese IoU. La media de los diez es el AP publicado; no es el AP de COCO.'
                    : 'Each point is TP/(TP+FP+FN) when matching at that IoU. The mean of the ten is the published AP; it is not COCO AP.'}</p>
                </div>

                <aside className="fs-companion">
                  <div className="fs-kpis fs-kpis-stack">
                    <Kpi value={ap?.tp50 ?? '--'} label={es ? 'emparejadas' : 'matched'} />
                    <Kpi value={ap?.fn50 ?? '--'} label={es ? 'no detectadas' : 'missed'} />
                    <Kpi value={ap?.fp50 ?? '--'} label={es ? 'espurias' : 'spurious'} />
                    <Kpi value={boundaryPixels} label={es ? 'pixeles frontera' : 'boundary pixels'} />
                  </div>
                  <div className="fs-companion-plot">
                    <div className="fs-panel-t">{es ? 'En IoU 0.50' : 'At IoU 0.50'}</div>
                    <table className="fs-table">
                      <tbody>
                        <tr><th>{es ? 'predicciones' : 'predictions'}</th><td className="num">{ap?.nPred ?? result.nInstances}</td></tr>
                        <tr><th>{es ? 'instancias GT' : 'GT instances'}</th><td className="num">{ap?.nGt ?? '--'}</td></tr>
                        <tr><th>AP50</th><td className="num">{ap?.ap50?.toFixed(3) ?? '--'}</td></tr>
                        <tr><th>AP75</th><td className="num">{ap?.ap75?.toFixed(3) ?? '--'}</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="fs-hint small">{gt
                    ? (es ? 'La verdad sintetica permite contar fallas; la matriz canonica completa de merge, split, miss y spurious se calcula offline.' : 'Synthetic truth enables error counting; the complete canonical merge, split, miss, and spurious matrix is computed offline.')
                    : (es ? 'Una carga real sin anotacion no permite afirmar error de frontera. Exporte la mascara para anotarla y evaluarla offline.' : 'An unannotated real upload cannot support a boundary-error claim. Export the mask for annotation and offline evaluation.')}</p>
                </aside>
              </div>
            </PanelBoundary>) : pending(false),
    morphometry: result ? (
            <PanelBoundary label="morphometry">
              <div className="fs-panel">
                <div className="fs-panel-t">{es ? 'Morfometría del caso seleccionado' : 'Selected-case morphometry'}</div>
                <BsdTable es={es} bsd={result.bsd} scale={scale} />
                <p className="fs-hint">{scale
                  ? (es ? 'Los diámetros se convierten con la escala suministrada; la escala no se estima ni se inventa.' : 'Diameters use the supplied scale; scale is neither estimated nor invented.')
                  : (es ? 'Sin calibración física, los resultados permanecen honestamente en píxeles.' : 'Without physical calibration, outputs honestly remain in pixels.')}</p>
              </div>
            </PanelBoundary>) : pending(false),
    confidence: result ? (
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
            </PanelBoundary>) : pending(false),
    state: result && froth ? (
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
            </PanelBoundary>) : pending(false),
    compare: (
      <>
        {source === 'sample' && (
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
            </PanelBoundary>)}
        {source === 'upload' && result && (
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
            </PanelBoundary>)}
        {source === 'upload' && !result && pending(false)}
      </>
    ),
    provenance: result ? (
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
            </PanelBoundary>) : pending(false),
    export: result ? (
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
                <pre className="fs-command">python -m fslab.pipeline infer --input &lt;image-or-frame-directory&gt; --method {source === 'sample' ? showcaseMethodId : liveMethodRegistryId(method)} --output runs/local --px-per-mm &lt;scale&gt;</pre>
                <p className="fs-hint">{es
                  ? 'El archivo contiene la máscara mostrada. El comando ejecuta cualquiera de los 14 métodos sin prompt sobre una imagen propia o un directorio de cuadros; los datos no salen de su máquina.'
                  : 'The file contains the mask shown here. The command runs any of the 14 unprompted methods over your own image, or a directory of frames; the data never leaves your machine.'}</p>
                <p className="fs-note">{es
                  ? 'Devuelve máscaras y descriptores de tamaño, nunca una exactitud: una imagen propia no tiene anotación contra la cual medir. Añada --associate para asignar identidades a un directorio de cuadros. No decodifica video; extraiga los cuadros primero.'
                  : 'It returns masks and size descriptors, never an accuracy: your own image has no annotation to measure against. Add --associate to assign identities across a directory of frames. It does not decode video; extract the frames first.'}</p>
              </div>
            </PanelBoundary>) : pending(false),
  };

  /* ADR-0071 5: at most about six peers, each named for the QUESTION the user is asking, with
     the views of the current group only. Nine flat nouns were a list, not an architecture. */
  const stillTabs: TabDef[] = groups.map((group) => {
    const views = group.tabs;
    return {
      id: group.id,
      label: groupLabel(group.id, es),
      content: views.length > 1
        ? <SubTabs initial={views.includes(tab) ? tab : views[0]} ariaLabel={es ? 'Vista' : 'View'} tabs={views.map((v) => ({ id: v, label: label(v, es), content: stillPanels[v] }))} />
        : stillPanels[views[0]],
    };
  });

  return (
    <div className="page-body fs-layout">
      <aside className="fs-side">
        {/* ADR-0017 1.2: the source model is a control, so it belongs in the control rail,
            not in a full-width banner above the workbench. */}
        <div className="fs-rail-block">
          <span className="fs-rail-kicker">{es ? 'Fuente de análisis' : 'Analysis source'}</span>
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
              className={sequenceMode ? 'on' : ''}
              aria-pressed={sequenceMode}
              onClick={() => setWorkbenchSource('sequence')}
            >
              <span>02</span>{es ? 'Secuencia' : 'Sequence'}
            </button>
          </div>
          <p className="fs-rail-desc">{sequenceMode
            ? (es ? 'Reproduzca cuadros, identidades, seguimiento y eventos medidos offline.' : 'Replay frames, identities, tracking, and events measured offline.')
            : (es ? 'Compare artefactos precalculados o evalúe una imagen local.' : 'Compare precomputed artifacts or evaluate a local image.')}</p>
        </div>

        {sequenceMode ? <SequenceControls lane={lane} es={es} /> : (
          <>
            <div className="fs-rail-block">
              <span className="fs-rail-kicker">{es ? 'Entrada' : 'Input'}</span>
              <div className="fs-seg">
                <button className={source === 'sample' ? 'chip on' : 'chip'} onClick={() => setSource('sample')}>{es ? 'Galería' : 'Gallery'}</button>
                <button className={source === 'upload' ? 'chip on' : 'chip'} onClick={() => setSource('upload')}>{es ? 'Imagen local' : 'Local image'}</button>
              </div>
              {source === 'sample' ? (
                <label className="fs-ctl">{es ? 'caso (12)' : 'case (12)'}
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
            </div>

            {source === 'sample' && <div className="fs-rail-block">
              <span className="fs-rail-kicker">{es ? 'Método' : 'Method'}</span>
              <label className="fs-ctl">{es ? 'los 15 evaluados' : 'all 15 evaluated'}
                <select className="fs-sel" value={showcaseMethodId} onChange={(event) => setShowcaseMethodId(event.target.value)}>
                  <optgroup label={es ? 'Clásicos' : 'Classical'}>
                    {methodBenchmark?.methods.filter((c) => c.id.startsWith('C')).map((c) => (
                      <option key={c.id} value={c.id}>{c.id} · {c.name}</option>))}
                  </optgroup>
                  <optgroup label={es ? 'Entrenados y fundacionales' : 'Trained and foundation'}>
                    {methodBenchmark?.methods.filter((c) => c.id.startsWith('L')).map((c) => (
                      <option key={c.id} value={c.id}>{c.id} · {c.name}</option>))}
                  </optgroup>
                  <optgroup label={es ? 'Investigación' : 'Research'}>
                    {methodBenchmark?.methods.filter((c) => c.id.startsWith('N')).map((c) => (
                      <option key={c.id} value={c.id}>{c.id} · {c.name}</option>))}
                  </optgroup>
                </select>
              </label>
              {showcaseMethod?.test && (
                <p className="fs-hint small">AP {showcaseMethod.test.mean_ap.toFixed(3)} · PQ {showcaseMethod.test.mean_pq?.toFixed(3) ?? '--'} · {es ? '64 casos' : '64 cases'}</p>
              )}
            </div>}

            {source === 'upload' && <div className="fs-rail-block">
              <span className="fs-rail-kicker">{es ? 'Motor interactivo' : 'Interactive engine'}</span>
              <label className="fs-ctl">{es ? '4 disponibles' : '4 available'}
                <select className="fs-sel" value={method} onChange={(e) => setMethod(e.target.value as 'sam' | ClassicalMethod)}>
                  <option value="sam">SlimSAM zero-shot</option>
                  {LIVE_CLASSICAL_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </label>
              {method === 'sam' && (
                <>
                  <label className="fs-ctl">{es ? 'grilla' : 'grid'}: {grid}x{grid}
                    <input type="range" min={12} max={40} step={4} value={grid} onChange={(e) => setGrid(+e.target.value)} />
                  </label>
                  <label className="fs-ctl">{es ? 'IoU predicha' : 'predicted IoU'}: {predIou.toFixed(2)}
                    <input type="range" min={0.5} max={0.95} step={0.02} value={predIou} onChange={(e) => setPredIou(+e.target.value)} />
                  </label>
                  <label className="fs-ctl">{es ? 'estabilidad' : 'stability'}: {stability.toFixed(2)}
                    <input type="range" min={0.5} max={0.98} step={0.02} value={stability} onChange={(e) => setStability(+e.target.value)} />
                  </label>
                </>
              )}
              <div className="fs-seg">
                <button className={flatten ? 'chip on' : 'chip'} onClick={() => setFlatten((v) => !v)}>{es ? 'Aplanar' : 'Flatten'}</button>
                <button className={deglare ? 'chip on' : 'chip'} onClick={() => setDeglare((v) => !v)}>{es ? 'Sin brillo' : 'Deglare'}</button>
              </div>
              <label className="fs-ctl">{es ? 'escala px/mm' : 'scale px/mm'}
                <input className="fs-sel" type="number" min={0} step={0.1} value={pxPerMm} onChange={(e) => setPxPerMm(e.target.value)} placeholder="px/mm" />
              </label>
              <button className="chip on fs-run" onClick={run} disabled={status === 'running' || status === 'loading-model'}>
                {status === 'loading-model' ? (es ? 'Cargando modelo...' : 'Loading model...') : status === 'running' ? (es ? 'Segmentando ' + progress + '%' : 'Segmenting ' + progress + '%') : (es ? 'Segmentar' : 'Segment')}
              </button>
            </div>}
          </>
        )}

        {/* ADR-0070 8: the entry control is on the same surface as the scenario selector,
            visible and obvious, and it opens the CURRENTLY selected scenario. */}
        <button type="button" className="fs-focus-enter" onClick={() => navigate('/focus/' + focusCase)}>
          <Maximize2 size={15} aria-hidden="true" />
          {es ? 'Abrir en modo foco' : 'Open focus mode'}
        </button>

        {!sequenceMode && result && device && (
          <p className="fs-hint small fs-rail-foot">{source === 'sample' ? (es ? 'artefacto' : 'artifact') : (es ? 'motor' : 'engine')}: <span className="mono">{device}</span></p>
        )}
        {errMsg && <p className="fs-note">{errMsg}</p>}
      </aside>

      {/* ADR-0017 1.2: aside + 1fr main, mirroring the reference app rather than re-deriving. */}
      <div className="fs-main">
        {sequenceMode
          ? <SequenceStage lane={lane} es={es} />
          : <Tabs key={`${source}-${activeGroup}`} initial={activeGroup} tabs={stillTabs} ariaLabel={es ? 'Analisis de imagen fija' : 'Still-image analysis'} />}
      </div>
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

/** ADR-0071 §5 asks for groups "named for the QUESTION the user is asking". Its own worked
 *  example answers what that means in practice: ChargeCascade's five groups are Charge motion,
 *  Power, Learned, Validation, Custom mill. Short noun phrases that name the user's concern,
 *  not interrogative sentences. An earlier pass wrote literal questions here ("What did it
 *  find?"), which read as a different product from the sequence lane's plain labels and cost
 *  roughly twice the width in a tab row that gets exactly one line.
 *
 *  Both lanes share one vocabulary, and the two views that exist in both (Methods, Provenance)
 *  carry the same name in the same position, so switching lane does not relearn the nav. */
function groupLabel(id: string, es: boolean): string {
  const labels: Record<string, [string, string]> = {
    segmentation: ['Segmentation', 'Segmentación'],
    size: ['Size', 'Tamaño'],
    quality: ['Quality', 'Calidad'],
    state: ['Froth state', 'Estado de espuma'],
    compare: ['Methods', 'Métodos'],
    provenance: ['Provenance', 'Proveniencia'],
  };
  return labels[id]?.[es ? 1 : 0] ?? id;
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

/** The browser lane names engines by slug; the CLI names them by registry id. SlimSAM has no
 *  registry entry, so its nearest offline equivalent is offered instead of an invalid id. */
function liveMethodRegistryId(method: 'sam' | ClassicalMethod): string {
  const ids: Record<ClassicalMethod, string> = {
    otsu_cc: 'C1',
    watershed_immersion: 'C2',
    watershed_hmax: 'C3',
    watershed_dt: 'C4',
    watershed_hmin: 'C5',
    slic_merge: 'C6',
    valley_edge: 'C7',
  };
  return method === 'sam' ? 'L5' : ids[method];
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
