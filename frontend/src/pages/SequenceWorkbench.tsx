import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { artifactUrl, loadTemporalShowcase } from '../api/artifacts';
import type { TemporalBenchmarkDoc, TemporalSequenceMetrics } from '../lib/contract.types';
import { decodeShowcaseLabels, type DecodedShowcaseLabels } from '../lib/showcaseLabels';
import {
  availableSequenceViews, type SequenceView, type TemporalShowcaseFrame,
  type TemporalShowcaseManifest,
} from '../lib/workbench';

type SequenceTab = 'replay' | 'tracking' | 'events' | 'provenance';

export function SequenceWorkbench({
  es,
  temporal,
}: {
  es: boolean;
  temporal: TemporalBenchmarkDoc | null;
}) {
  const [manifest, setManifest] = useState<TemporalShowcaseManifest | null>(null);
  const [loadError, setLoadError] = useState('');
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [predictionIndex, setPredictionIndex] = useState(0);
  const [frameIndex, setFrameIndex] = useState(0);
  // Replay starts paused. An animation that runs on mount burns a timer on a tab the user may
  // never look at, and it moves the frame out from under anyone reading the per-frame evidence.
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [view, setView] = useState<SequenceView>('overlay');
  const [tab, setTab] = useState<SequenceTab>('replay');

  useEffect(() => {
    let cancelled = false;
    loadTemporalShowcase()
      .then((document) => { if (!cancelled) setManifest(document); })
      .catch((reason) => {
        if (!cancelled) setLoadError(String(reason instanceof Error ? reason.message : reason));
      });
    return () => { cancelled = true; };
  }, []);

  const sequence = manifest?.sequences[sequenceIndex] ?? null;
  const frames = sequence?.frames ?? [];
  const frame = frames[frameIndex] ?? null;
  const predictions = sequence?.predictions ?? [];
  const prediction = predictions[predictionIndex] ?? null;
  const predictionFrame = prediction?.frames.find((item) => item.frame_index === frameIndex) ?? null;
  const displayFrame = frame ? {
    ...frame,
    prediction_path: predictionFrame?.prediction_path ?? null,
    prediction_sha256: predictionFrame?.prediction_sha256 ?? null,
    prediction_overlay_path: predictionFrame?.overlay_path ?? null,
  } : null;
  const metrics = prediction?.metrics
    ?? temporal?.sequences.find((row) => row.condition_id === sequence?.case_id)
    ?? null;
  const views = displayFrame ? availableSequenceViews(displayFrame) : [];
  const tabs: SequenceTab[] = metrics
    ? ['replay', 'tracking', 'events', 'provenance']
    : ['replay', 'provenance'];

  useEffect(() => {
    if (!playing || frames.length < 2) return undefined;
    const timer = window.setInterval(
      () => setFrameIndex((current) => (current + 1) % frames.length),
      Math.round(1000 / speed),
    );
    return () => window.clearInterval(timer);
  }, [playing, speed, frames.length]);

  // A background tab must not keep advancing frames and decoding rasters.
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    setFrameIndex(0);
    setPredictionIndex(0);
    setPlaying(false);
    setTab('replay');
  }, [sequenceIndex]);

  useEffect(() => {
    if (predictionIndex >= predictions.length) setPredictionIndex(0);
  }, [predictionIndex, predictions.length]);

  useEffect(() => {
    if (views.length > 0 && !views.includes(view)) {
      setView(views.includes('overlay') ? 'overlay' : views[0]);
    }
  }, [view, views]);

  if (!manifest || !sequence || !frame) {
    return (
      <div className="fs-sequence-loading">
        <span className="fs-spinner" aria-hidden="true" />
        <div>
          <strong>{es ? 'Cargando secuencias verificadas' : 'Loading verified sequences'}</strong>
          <p>{loadError || (es
            ? 'Los cuadros y sus referencias se leen desde el paquete offline.'
            : 'Frames and their references are read from the offline artifact package.')}</p>
        </div>
      </div>
    );
  }

  const frameLabel = `${String(frameIndex + 1).padStart(2, '0')} / ${String(frames.length).padStart(2, '0')}`;
  const displayLabel = sequenceLabel(sequence.case_id, es);

  return (
    <div className="fs-sequence-workbench">
      <aside className="fs-sequence-sidebar">
        <div>
          <span className="fs-sequence-kicker">{es ? 'Secuencia precalculada' : 'Precomputed sequence'}</span>
          <h2>{displayLabel}</h2>
          <p>
            {sequenceDescription(sequence.case_id, es)}
          </p>
        </div>
        <label className="fs-ctl">
          {es ? 'secuencia (5 disponibles)' : 'sequence (5 available)'}
          <select
            className="fs-sel"
            value={sequenceIndex}
            onChange={(event) => setSequenceIndex(Number(event.target.value))}
            aria-label={es ? 'Secuencia precalculada' : 'Precomputed sequence'}
          >
            {manifest.sequences.map((item, index) => (
              <option key={item.case_id} value={index}>{sequenceLabel(item.case_id, es)}</option>
            ))}
          </select>
        </label>
        {predictions.length > 0 && (
          <label className="fs-ctl">
            {es ? `predicción (${predictions.length} disponible${predictions.length === 1 ? '' : 's'})` : `prediction (${predictions.length} available)`}
            <select
              className="fs-sel"
              value={predictionIndex}
              onChange={(event) => setPredictionIndex(Number(event.target.value))}
              aria-label={es ? 'Método temporal precalculado' : 'Precomputed temporal method'}
            >
              {predictions.map((item, index) => (
                <option key={item.method_id} value={index}>{item.method_id} · {temporalMethodLabel(item.method_id)}</option>
              ))}
            </select>
          </label>
        )}
        <div className="fs-sequence-facts">
          <div><span>{es ? 'cuadros' : 'frames'}</span><strong>{frames.length}</strong></div>
          <div><span>{es ? 'referencia' : 'reference'}</span><strong>{es ? 'IDs exactos' : 'Exact IDs'}</strong></div>
          <div><span>{es ? 'análisis' : 'analysis'}</span><strong>{prediction ? `${prediction.method_id} · ${temporalMethodLabel(prediction.method_id)}` : 'not published'}</strong></div>
        </div>
        <p className="fs-note good">
          {es
            ? 'La reproducción usa artefactos generados y verificados antes del despliegue.'
            : 'Replay uses artifacts generated and verified before deployment.'}
        </p>
      </aside>

      <section className="fs-sequence-main">
        <div className="fs-tabs" role="tablist" aria-label={es ? 'Análisis de secuencia' : 'Sequence analysis'}>
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              className={`fs-tab${tab === item ? ' on' : ''}`}
              onClick={() => setTab(item)}
            >
              {sequenceTabLabel(item, es)}
            </button>
          ))}
        </div>

        {tab === 'replay' && (
          <>
            <div className="fs-sequence-toolbar">
              <div className="fs-view-picker" role="group" aria-label={es ? 'Vista del cuadro' : 'Frame view'}>
                {views.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={view === item ? 'on' : ''}
                    aria-pressed={view === item}
                    onClick={() => setView(item)}
                  >
                    {sequenceViewLabel(item, displayFrame ?? frame, es, prediction?.method_id)}
                  </button>
                ))}
              </div>
              {!views.includes('prediction') && (
                <span className="fs-evidence-status">
                  {es ? 'Vista de predicción no publicada para este artefacto' : 'Prediction view not published for this artifact'}
                </span>
              )}
            </div>

            <div className="fs-sequence-stage">
              <SequenceFrame frame={displayFrame ?? frame} view={view} es={es} label={displayLabel} />
              <div className="fs-sequence-stamp">
                <span>{displayLabel}</span>
                <strong>{frameLabel}</strong>
              </div>
            </div>

            <div className="fs-sequence-timeline">
              <button
                type="button"
                className="fs-play-button"
                aria-label={es ? 'Cuadro anterior' : 'Previous frame'}
                onClick={() => { setPlaying(false); setFrameIndex((value) => (value - 1 + frames.length) % frames.length); }}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                className="fs-play-button primary"
                aria-label={playing ? (es ? 'Pausar' : 'Pause') : (es ? 'Reproducir' : 'Play')}
                onClick={() => setPlaying((value) => !value)}
              >
                {playing ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <button
                type="button"
                className="fs-play-button"
                aria-label={es ? 'Cuadro siguiente' : 'Next frame'}
                onClick={() => { setPlaying(false); setFrameIndex((value) => (value + 1) % frames.length); }}
              >
                <ChevronRight size={18} />
              </button>
              <input
                type="range"
                min={0}
                max={frames.length - 1}
                value={frameIndex}
                onChange={(event) => { setPlaying(false); setFrameIndex(Number(event.target.value)); }}
                aria-label={es ? 'Cuadro de secuencia' : 'Sequence frame'}
              />
              <label>
                {es ? 'velocidad' : 'speed'}
                <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
                  <option value={1}>1 fps</option>
                  <option value={2}>2 fps</option>
                  <option value={4}>4 fps</option>
                </select>
              </label>
            </div>

            {metrics && (
              <div className="fs-kpis fs-sequence-summary">
                <SequenceKpi value={`${(metrics.mean_frame_coverage * 100).toFixed(1)}%`} label={es ? 'cobertura' : 'coverage'} />
                <SequenceKpi value={metrics.idf1.toFixed(3)} label="IDF1" />
                <SequenceKpi value={metrics.hota.toFixed(3)} label="HOTA" />
                <SequenceKpi value={`${(metrics.id_switch_rate * 100).toFixed(2)}%`} label={es ? 'cambios de ID' : 'ID switches'} />
              </div>
            )}
          </>
        )}

        {tab === 'tracking' && metrics && (
          <TrackingEvidence metrics={metrics} methodId={prediction?.method_id} es={es} />
        )}
        {tab === 'events' && metrics && (
          <EventEvidence
            metrics={metrics}
            truthEvents={prediction?.truth_events ?? []}
            predictedEvents={prediction?.predicted_events ?? []}
            frameIndex={frameIndex}
            es={es}
          />
        )}
        {tab === 'provenance' && (
          <SequenceProvenance
            manifest={manifest}
            frame={displayFrame ?? frame}
            sequenceId={sequence.case_id}
            method={prediction ? `${prediction.method_id} · ${prediction.method_slug}` : temporal?.method ?? null}
            device={temporal?.device ?? null}
            evidencePath={prediction?.evidence_path ?? null}
            evidenceSha={prediction?.evidence_sha256 ?? null}
            es={es}
          />
        )}
      </section>
    </div>
  );
}

function SequenceFrame({
  frame,
  view,
  es,
  label,
}: {
  frame: TemporalShowcaseFrame;
  view: SequenceView;
  es: boolean;
  label: string;
}) {
  if (view === 'source') {
    return <img src={artifactUrl(frame.source_path)} alt={es ? `Cuadro fuente de ${label}` : `${label} source frame`} />;
  }
  if (view === 'overlay') {
    const path = frame.prediction_overlay_path || frame.overlay_path;
    return path
      ? <img src={artifactUrl(path)} alt={es ? `Superposición de ${label}` : `${label} overlay`} />
      : null;
  }
  const path = view === 'truth' ? frame.truth_path : frame.prediction_path;
  if (!path) return null;
  if (path.endsWith('.rle')) {
    return <InstanceRaster path={path} ariaLabel={`${sequenceViewLabel(view, frame, es)} · ${label}`} />;
  }
  return <img src={artifactUrl(path)} alt={`${sequenceViewLabel(view, frame, es)} · ${label}`} />;
}

function InstanceRaster({ path, ariaLabel }: { path: string; ariaLabel: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [decoded, setDecoded] = useState<DecodedShowcaseLabels | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(artifactUrl(path))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buffer) => { if (!cancelled) setDecoded(decodeShowcaseLabels(buffer)); })
      .catch((reason) => {
        if (!cancelled) setError(String(reason instanceof Error ? reason.message : reason));
      });
    return () => { cancelled = true; };
  }, [path]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !decoded) return;
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    const context = canvas.getContext('2d');
    if (!context) return;
    const image = context.createImageData(decoded.width, decoded.height);
    for (let index = 0; index < decoded.labels.length; index += 1) {
      const instance = decoded.labels[index];
      const offset = index * 4;
      if (instance === 0) {
        image.data[offset] = 5;
        image.data[offset + 1] = 16;
        image.data[offset + 2] = 22;
        image.data[offset + 3] = 255;
        continue;
      }
      const hue = (instance * 0.61803398875) % 1;
      const [red, green, blue] = hslToRgb(hue, 0.72, 0.58);
      image.data[offset] = red;
      image.data[offset + 1] = green;
      image.data[offset + 2] = blue;
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }, [decoded]);

  if (error) return <div className="fs-sequence-frame-error">{error}</div>;
  return <canvas ref={canvasRef} role="img" aria-label={ariaLabel} />;
}

function TrackingEvidence({
  metrics,
  methodId,
  es,
}: {
  metrics: TemporalSequenceMetrics;
  methodId?: string;
  es: boolean;
}) {
  const method = methodId ?? (es ? 'método publicado' : 'published method');
  return (
    <div className="fs-evidence-panel">
      <header>
        <span>{es ? 'Asociación cuadro a cuadro' : 'Frame-to-frame association'}</span>
        <h3>{es ? 'La identidad se evalúa separada de la detección' : 'Identity is evaluated separately from detection'}</h3>
        <p>
          {es
            ? `IDF1 mide la conservación de identidad; HOTA equilibra detección y asociación. Estos valores provienen de la evaluación temporal offline de ${method}.`
            : `IDF1 measures identity preservation; HOTA balances detection and association. These values come from the offline ${method} temporal evaluation.`}
        </p>
      </header>
      <div className="fs-kpis">
        <SequenceKpi value={metrics.idf1.toFixed(3)} label="IDF1" />
        <SequenceKpi value={metrics.hota.toFixed(3)} label="HOTA" />
        <SequenceKpi value={metrics.track_fragmentations} label={es ? 'fragmentaciones' : 'fragmentations'} />
        <SequenceKpi value={metrics.flow_epe_px?.toFixed(2) ?? 'n/a'} label="flow EPE px" />
      </div>
      <table className="fs-table">
        <tbody>
          <tr><th>{es ? 'instancias GT asociadas' : 'matched GT instances'}</th><td className="num">{metrics.matched_gt_instances ?? 'n/a'}</td></tr>
          <tr><th>{es ? 'cambios de identidad' : 'identity switches'}</th><td className="num">{metrics.id_switches ?? 'n/a'}</td></tr>
          <tr><th>{es ? 'precisión de identidad' : 'identity precision'}</th><td className="num">{formatMetric(metrics.id_precision)}</td></tr>
          <tr><th>{es ? 'recobrado de identidad' : 'identity recall'}</th><td className="num">{formatMetric(metrics.id_recall)}</td></tr>
          <tr><th>{es ? 'exactitud de asociación' : 'association accuracy'}</th><td className="num">{formatMetric(metrics.association_accuracy)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function EventEvidence({
  metrics,
  truthEvents,
  predictedEvents,
  frameIndex,
  es,
}: {
  metrics: TemporalSequenceMetrics;
  truthEvents: Array<{ frame_index: number; instance_id: number; type: string }>;
  predictedEvents: Array<{ frame_index: number; instance_id: number; type: string }>;
  frameIndex: number;
  es: boolean;
}) {
  const truthAtFrame = truthEvents.filter((event) => event.frame_index === frameIndex);
  const predictedAtFrame = predictedEvents.filter((event) => event.frame_index === frameIndex);
  return (
    <div className="fs-evidence-panel">
      <header>
        <span>{es ? 'Eventos temporales' : 'Temporal events'}</span>
        <h3>{es ? 'Coalescencia y ruptura se reportan con sus errores' : 'Coalescence and bursting are reported with their errors'}</h3>
        <p>
          {es
            ? 'La detección de eventos es evidencia experimental, no una afirmación de preparación industrial. La baja precisión visible evita ocultar falsos positivos.'
            : 'Event detection is experimental evidence, not an industrial-readiness claim. Visible low precision keeps false positives from being hidden.'}
        </p>
      </header>
      <div className="fs-kpis">
        <SequenceKpi value={formatMetric(metrics.event_precision)} label={es ? 'precisión' : 'precision'} />
        <SequenceKpi value={formatMetric(metrics.event_recall)} label={es ? 'recobrado' : 'recall'} />
        <SequenceKpi value={formatMetric(metrics.event_f1)} label="F1" />
        <SequenceKpi value={metrics.event_true_positives ?? 'n/a'} label={es ? 'eventos correctos' : 'true events'} />
      </div>
      <table className="fs-table">
        <tbody>
          <tr><th>{es ? 'verdaderos positivos' : 'true positives'}</th><td className="num">{metrics.event_true_positives ?? 'n/a'}</td></tr>
          <tr><th>{es ? 'falsos positivos' : 'false positives'}</th><td className="num">{metrics.event_false_positives ?? 'n/a'}</td></tr>
          <tr><th>{es ? 'falsos negativos' : 'false negatives'}</th><td className="num">{metrics.event_false_negatives ?? 'n/a'}</td></tr>
        </tbody>
      </table>
      <div className="fs-event-columns">
        <article>
          <span>{es ? `Referencia · cuadro ${frameIndex + 1}` : `Truth · frame ${frameIndex + 1}`}</span>
          <strong>{truthAtFrame.length}</strong>
          <p>{eventSummary(truthAtFrame, es)}</p>
        </article>
        <article>
          <span>{es ? `Predicción · cuadro ${frameIndex + 1}` : `Prediction · frame ${frameIndex + 1}`}</span>
          <strong>{predictedAtFrame.length}</strong>
          <p>{eventSummary(predictedAtFrame, es)}</p>
        </article>
      </div>
    </div>
  );
}

function SequenceProvenance({
  manifest,
  frame,
  sequenceId,
  method,
  device,
  evidencePath,
  evidenceSha,
  es,
}: {
  manifest: TemporalShowcaseManifest;
  frame: TemporalShowcaseFrame;
  sequenceId: string;
  method: string | null;
  device: string | null;
  evidencePath: string | null;
  evidenceSha: string | null;
  es: boolean;
}) {
  return (
    <div className="fs-evidence-panel">
      <header>
        <span>{es ? 'Trazabilidad' : 'Traceability'}</span>
        <h3>{es ? 'Cada cuadro conserva su origen y su referencia' : 'Every frame retains its source and reference'}</h3>
      </header>
      <table className="fs-table">
        <tbody>
          <tr><th>{es ? 'secuencia' : 'sequence'}</th><td className="mono">{sequenceId}</td></tr>
          <tr><th>{es ? 'cuadro' : 'frame'}</th><td className="mono">{String(frame.frame_index).padStart(3, '0')}</td></tr>
          <tr><th>{es ? 'esquema' : 'schema'}</th><td className="mono">{manifest.schema}</td></tr>
          <tr><th>{es ? 'origen' : 'source kind'}</th><td>{manifest.source_kind}</td></tr>
          <tr><th>{es ? 'método analizado' : 'analysis method'}</th><td className="mono">{method ?? 'not published'}</td></tr>
          <tr><th>{es ? 'dispositivo offline' : 'offline device'}</th><td className="mono">{device ?? 'not published'}</td></tr>
          {evidencePath && <tr><th>{es ? 'evidencia' : 'evidence'}</th><td className="mono">{evidencePath}</td></tr>}
          {evidenceSha && <tr><th>SHA-256 · evidence</th><td className="mono fs-hash">{evidenceSha}</td></tr>}
          <tr><th>SHA-256 · source</th><td className="mono fs-hash">{frame.source_sha256 ?? 'not published'}</td></tr>
          <tr><th>SHA-256 · truth</th><td className="mono fs-hash">{frame.truth_sha256 ?? 'not published'}</td></tr>
          {frame.prediction_sha256 && <tr><th>SHA-256 · prediction</th><td className="mono fs-hash">{frame.prediction_sha256}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function SequenceKpi({ value, label }: { value: string | number; label: string }) {
  return <div className="fs-kpi"><div className="fs-kpi-v">{value}</div><div className="fs-kpi-l">{label}</div></div>;
}

function sequenceLabel(caseId: string, es: boolean): string {
  const labels: Record<string, [string, string]> = {
    'poly-normal': ['Nominal polydisperse flow', 'Flujo polidisperso nominal'],
    'fine-froth': ['Fine-bubble field', 'Campo de burbujas finas'],
    'glare-storm': ['Specular-glare stress', 'Estrés por brillo especular'],
    'motion-fast': ['Fast surface motion', 'Movimiento rápido de superficie'],
    bursting: ['Bursting and topology change', 'Ruptura y cambio topológico'],
  };
  return labels[caseId]?.[es ? 1 : 0] ?? caseId;
}

function sequenceDescription(caseId: string, es: boolean): string {
  const descriptions: Record<string, [string, string]> = {
    'poly-normal': ['Nominal transport with persistent identities and moderate size diversity.', 'Transporte nominal con identidades persistentes y diversidad moderada de tamaños.'],
    'fine-froth': ['Dense fine bubbles challenge instance separation and track continuity.', 'Las burbujas finas densas desafían la separación y continuidad de trayectorias.'],
    'glare-storm': ['Moving highlights erase lamella evidence and create false event candidates.', 'Los brillos móviles borran lamelas y crean falsos candidatos de evento.'],
    'motion-fast': ['Rapid advection tests motion estimation and identity association.', 'La advección rápida prueba la estimación de movimiento y asociación de identidad.'],
    bursting: ['Topological changes expose burst and coalescence event behavior.', 'Los cambios topológicos exponen el comportamiento de ruptura y coalescencia.'],
  };
  return descriptions[caseId]?.[es ? 1 : 0] ?? '';
}

function temporalMethodLabel(methodId: string): string {
  if (methodId === 'L1') return 'Boundary/distance U-Net';
  if (methodId === 'L7') return 'SAM 2.1 video propagation';
  return methodId;
}

function sequenceViewLabel(
  view: SequenceView,
  frame: TemporalShowcaseFrame,
  es: boolean,
  methodId?: string,
): string {
  if (view === 'source') return es ? 'Fuente' : 'Source';
  if (view === 'truth') return es ? 'Referencia exacta' : 'Exact truth';
  if (view === 'prediction') {
    const method = methodId ?? 'prediction';
    return es ? `Predicción ${method}` : `${method} prediction`;
  }
  return frame.prediction_overlay_path
    ? (es ? 'Fuente + predicción' : 'Source + prediction')
    : (es ? 'Fuente + referencia' : 'Source + truth');
}

function sequenceTabLabel(tab: SequenceTab, es: boolean): string {
  if (tab === 'replay') return es ? 'Reproducción' : 'Replay';
  if (tab === 'tracking') return es ? 'Seguimiento' : 'Tracking';
  if (tab === 'events') return es ? 'Eventos' : 'Events';
  return es ? 'Proveniencia' : 'Provenance';
}

function formatMetric(value: number | undefined): string {
  return value == null ? 'n/a' : value.toFixed(3);
}

function eventSummary(
  events: Array<{ instance_id: number; type: string }>,
  es: boolean,
): string {
  if (events.length === 0) return es ? 'Sin eventos publicados en este cuadro.' : 'No published events in this frame.';
  const counts = new Map<string, number>();
  events.forEach((event) => counts.set(event.type, (counts.get(event.type) ?? 0) + 1));
  return [...counts.entries()].map(([type, count]) => `${type} × ${count}`).join(' · ');
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const f = (offset: number) => {
    const k = (offset + hue * 12) % 12;
    const a = saturation * Math.min(lightness, 1 - lightness);
    return lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
