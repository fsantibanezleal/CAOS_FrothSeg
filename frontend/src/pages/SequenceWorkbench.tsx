import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Tabs } from '@fasl-work/caos-app-shell';
import { PanelBoundary } from '../viz/PanelBoundary';
import { MetricBars } from '../viz/MetricBars';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { artifactUrl, loadTemporalShowcase } from '../api/artifacts';
import type { TemporalSequenceMetrics } from '../lib/contract.types';
import { decodeShowcaseLabels, type DecodedShowcaseLabels } from '../lib/showcaseLabels';
import {
  availableSequenceViews, isNativeVideoMode, type SequenceView, type TemporalEvent,
  type TemporalEventLog, type TemporalPrediction, type TemporalShowcaseFrame,
  type TemporalShowcaseManifest,
} from '../lib/workbench';

type SequenceTab = 'replay' | 'tracking' | 'events' | 'compare' | 'provenance';

/** The sequence lane's state. Lifted out of the component so its controls can live in the
 *  App's single left rail (ADR-0017 1.2) while its stage owns the main column. */
export function useSequenceLane(es: boolean) {
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
  const [eventLog, setEventLog] = useState<TemporalEventLog | null>(null);
  const [eventError, setEventError] = useState('');

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
  // Framewise and native-video predictions answer different questions, so they are offered as
  // two labelled groups and never merged into one ranking.
  const predictions = useMemo(() => sequence?.predictions ?? [], [sequence]);
  const framewisePredictions = useMemo(
    () => predictions.filter((item) => !isNativeVideoMode(item.mode)),
    [predictions],
  );
  const nativePredictions = useMemo(
    () => predictions.filter((item) => isNativeVideoMode(item.mode)),
    [predictions],
  );
  const prediction = predictions[predictionIndex] ?? null;
  const predictionFrame = prediction?.frames.find((item) => item.frame_index === frameIndex) ?? null;
  const displayFrame = frame ? {
    ...frame,
    prediction_path: predictionFrame?.prediction_path ?? null,
    prediction_sha256: predictionFrame?.prediction_sha256 ?? null,
  } : null;
  const metrics = prediction?.metrics ?? null;
  const views = displayFrame ? availableSequenceViews(displayFrame) : [];
  const tabs: SequenceTab[] = metrics
    ? ['replay', 'tracking', 'events', 'compare', 'provenance']
    : ['replay', 'compare', 'provenance'];

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

  // The event logs live beside their prediction frames rather than in the manifest, so only the
  // pair the reader actually opened is downloaded.
  //
  // The trigger is VISIBILITY, not the lane's `tab` state. The shell's Tabs primitive owns its
  // own selection and mounts every panel (hiding the inactive ones), so `tab` never left
  // 'replay' once the hand-rolled strip was removed and this fetch was never issued: the Events
  // panel sat on "Loading this pair's event log" forever, with zero network requests to show
  // for it. A hidden panel has no layout box, so an intersection check is the honest signal.
  const [eventsWanted, setEventsWanted] = useState(false);
  useEffect(() => {
    const path = prediction?.events_path;
    setEventLog(null);
    setEventError('');
    if (!path || !eventsWanted) return undefined;
    let cancelled = false;
    fetch(artifactUrl(path))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<TemporalEventLog>;
      })
      .then((document) => { if (!cancelled) setEventLog(document); })
      .catch((reason) => {
        if (!cancelled) setEventError(String(reason instanceof Error ? reason.message : reason));
      });
    return () => { cancelled = true; };
  }, [prediction?.events_path, eventsWanted]);

  const frameLabel = frames.length
    ? `${String(frameIndex + 1).padStart(2, '0')} / ${String(frames.length).padStart(2, '0')}`
    : '';
  const displayLabel = sequence ? sequenceLabel(sequence.case_id, es) : '';

  return {
    manifest, loadError, sequence, frames, frame, predictions, framewisePredictions,
    nativePredictions, prediction, displayFrame, metrics, views, tabs, tab, setTab,
    sequenceIndex, setSequenceIndex, predictionIndex, setPredictionIndex,
    frameIndex, setFrameIndex, playing, setPlaying, speed, setSpeed, view, setView,
    eventLog, eventError, requestEvents: setEventsWanted, frameLabel, displayLabel,
    ready: Boolean(manifest && sequence && frame),
  };
}

export type SequenceLane = ReturnType<typeof useSequenceLane>;

/** Rail slot: every control that selects what the stage shows. */
export function SequenceControls({ lane, es }: { lane: SequenceLane; es: boolean }) {
  const {
    manifest, sequence, predictions, framewisePredictions, nativePredictions,
    prediction, frames, sequenceIndex, setSequenceIndex, predictionIndex, setPredictionIndex,
  } = lane;
  if (!manifest || !sequence) return null;
  return (
    <>
      <div className="fs-rail-block">
        <span className="fs-rail-kicker">{es ? 'Secuencia' : 'Sequence'}</span>
        <p className="fs-rail-desc">{sequenceDescription(sequence.case_id, es)}</p>
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
            {es ? `método (${predictions.length} disponibles)` : `method (${predictions.length} available)`}
            <select
              className="fs-sel"
              value={predictionIndex}
              onChange={(event) => setPredictionIndex(Number(event.target.value))}
              aria-label={es ? 'Método temporal precalculado' : 'Precomputed temporal method'}
            >
              <optgroup label={es
                ? 'Segmentación por cuadro + asociación IoU'
                : 'Per-frame segmentation + IoU association'}>
                {framewisePredictions.map((item) => (
                  <option key={item.method_id} value={predictions.indexOf(item)}>
                    {item.method_id} · {temporalMethodLabel(item.method_id, item.method_slug)}
                  </option>
                ))}
              </optgroup>
              {nativePredictions.length > 0 && (
                <optgroup label={es
                  ? 'Propagación de video con prompt (no comparable)'
                  : 'Prompted video propagation (not comparable)'}>
                  {nativePredictions.map((item) => (
                    <option key={item.method_id} value={predictions.indexOf(item)}>
                      {item.method_id} · {temporalMethodLabel(item.method_id, item.method_slug)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
        )}
        {prediction && isNativeVideoMode(prediction.mode) && (
          <p className="fs-note">
            {es
              ? 'Este método recibe las máscaras exactas del primer cuadro y solo debe conservarlas. Sus métricas de identidad no son comparables con los métodos que redescubren cada instancia en cada cuadro; use la IoU de identidad.'
              : 'This method is given the exact first-frame masks and only has to keep them. Its identity metrics are not comparable with methods that rediscover every instance on every frame; read the identity IoU instead.'}
          </p>
        )}
        <div className="fs-sequence-facts">
          <div><span>{es ? 'cuadros' : 'frames'}</span><strong>{frames.length}</strong></div>
          <div><span>{es ? 'referencia' : 'reference'}</span><strong>{es ? 'IDs exactos' : 'Exact IDs'}</strong></div>
          <div><span>{es ? 'análisis' : 'analysis'}</span><strong>{prediction ? `${prediction.method_id} · ${temporalMethodLabel(prediction.method_id)}` : 'not published'}</strong></div>
        </div>
      </div>
    </>
  );
}

/** Stage slot: the tab row and the instrument. */
export function SequenceStage({ lane, es }: { lane: SequenceLane; es: boolean }) {
  const {
    manifest, loadError, sequence, frames, frame, predictions, framewisePredictions,
    nativePredictions, prediction, displayFrame, metrics, views, tabs, tab, setTab,
    setPredictionIndex, frameIndex, setFrameIndex, playing, setPlaying, speed, setSpeed,
    view, setView, eventLog, eventError, requestEvents, frameLabel, displayLabel,
  } = lane;

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

  // Same shape as the still lane: ONE auto row of tab chrome, then a `minmax(0, 1fr)` body.
  // ADR-0016 6: the shell's Tabs primitive, same as the still lane and the reference app.
  const panels: Record<SequenceTab, ReactNode> = {
    replay: (
          <div className="fs-replay">
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

            <div className="fs-replay-stage">
            <div className="fs-sequence-stage">
              <SequenceFrame frame={displayFrame ?? frame} view={view} es={es} label={displayLabel} />
              <div className="fs-sequence-stamp">
                <span>{displayLabel}</span>
                <strong>{frameLabel}</strong>
              </div>

              {/* The transport and the summary ride ON the frame rather than under it. As stacked
                  rows they consumed 117px of an 508px stage and shrank the square instrument to
                  7.5% of the viewport; overlaid, the frame keeps the whole free height and the
                  controls stay where the eye already is. Same HUD pattern as focus mode. */}
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
            </div>

            {/* The frame is square; on a wide stage the remainder used to be empty background.
                It carries the per-frame evidence now, so the replay reads as an instrument and
                not as a picture with margins (ADR-0071 8). */}
            <aside className="fs-companion">
              <div className="fs-companion-plot">
                <div className="fs-panel-t">{es ? 'Este cuadro' : 'This frame'}</div>
                <table className="fs-table">
                  <tbody>
                    <tr><th>{es ? 'cuadro' : 'frame'}</th><td className="num">{frameIndex + 1} / {frames.length}</td></tr>
                    <tr><th>{es ? 'vista' : 'view'}</th><td>{sequenceViewLabel(view, displayFrame ?? frame, es, prediction?.method_id)}</td></tr>
                    <tr><th>{es ? 'metodo' : 'method'}</th><td>{prediction ? `${prediction.method_id} · ${temporalMethodLabel(prediction.method_id, prediction.method_slug)}` : '--'}</td></tr>
                    <tr><th>{es ? 'artefacto' : 'artifact'}</th><td className="mono">{(displayFrame?.prediction_sha256 ?? displayFrame?.truth_sha256 ?? '').slice(0, 10) || '--'}</td></tr>
                  </tbody>
                </table>
              </div>
              {metrics && (
                <div className="fs-companion-plot">
                  <div className="fs-panel-t">{es ? 'Sobre la secuencia' : 'Across the sequence'}</div>
                  <table className="fs-table">
                    <tbody>
                      <tr><th>{es ? 'cobertura media' : 'mean coverage'}</th><td className="num">{(metrics.mean_frame_coverage * 100).toFixed(1)}%</td></tr>
                      <tr><th>IDF1</th><td className="num">{metrics.idf1.toFixed(3)}</td></tr>
                      <tr><th>HOTA</th><td className="num">{metrics.hota.toFixed(3)}</td></tr>
                      <tr><th>{es ? 'cambios de ID' : 'ID switches'}</th><td className="num">{(metrics.id_switch_rate * 100).toFixed(2)}%</td></tr>
                    </tbody>
                  </table>
                  <p className="fs-hint small">{isNativeVideoMode(prediction?.method_id ?? '')
                    ? (es ? 'Protocolo de propagacion nativa: no se ordena junto al protocolo por cuadro.' : 'Native propagation protocol: not ranked against the framewise protocol.')
                    : (es ? 'Protocolo por cuadro con asociacion por IoU.' : 'Framewise protocol with IoU association.')}</p>
                </div>
              )}
            </aside>
            </div>
          </div>
        ),
    tracking: metrics ? (
      <TrackingEvidence metrics={metrics} methodId={prediction?.method_id} es={es} />
    ) : null,
    events: metrics ? (
          <EventEvidence
            metrics={metrics}
            truthEvents={eventLog?.truth_events ?? []}
            predictedEvents={eventLog?.predicted_events ?? []}
            loading={!eventLog && !eventError}
            error={eventError}
            frameIndex={frameIndex}
            frameCount={frames.length}
            es={es}
            onVisible={requestEvents}
          />
    ) : null,
    compare: (
          <SequenceComparison
            framewise={framewisePredictions}
            native={nativePredictions}
            selectedMethodId={prediction?.method_id}
            onSelect={(methodId) => {
              const index = predictions.findIndex((item) => item.method_id === methodId);
              if (index >= 0) { setPredictionIndex(index); setTab('replay'); }
            }}
            es={es}
          />
    ),
    provenance: (
          <SequenceProvenance
            manifest={manifest}
            frame={displayFrame ?? frame}
            sequenceId={sequence.case_id}
            method={prediction ? `${prediction.method_id} · ${prediction.method_slug}` : null}
            device={prediction?.model_provenance?.device ?? null}
            evidencePath={prediction?.evidence_path ?? null}
            evidenceSha={prediction?.evidence_sha256 ?? null}
            es={es}
          />
    ),
  };

  return (
    <Tabs
      key={sequence.case_id}
      initial={tab}
      ariaLabel={es ? 'Analisis de secuencia' : 'Sequence analysis'}
      tabs={tabs.map((item) => ({
        id: item,
        label: sequenceTabLabel(item, es),
        content: <PanelBoundary key={item} label={item}>{panels[item]}</PanelBoundary>,
      }))}
    />
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
    // Composited here rather than fetched: the prediction overlay is source + labels, and
    // shipping it as 600 pre-rendered PNGs cost 63 MB for pixels the client can draw itself.
    const labelPath = frame.prediction_path || frame.truth_path;
    if (labelPath) {
      return (
        <InstanceRaster
          path={labelPath}
          sourcePath={frame.source_path}
          ariaLabel={es ? `Superposición de ${label}` : `${label} overlay`}
        />
      );
    }
    return frame.overlay_path
      ? <img src={artifactUrl(frame.overlay_path)} alt={es ? `Superposición de ${label}` : `${label} overlay`} />
      : null;
  }
  const path = view === 'truth' ? frame.truth_path : frame.prediction_path;
  if (!path) return null;
  if (path.endsWith('.rle')) {
    return <InstanceRaster path={path} ariaLabel={`${sequenceViewLabel(view, frame, es)} · ${label}`} />;
  }
  return <img src={artifactUrl(path)} alt={`${sequenceViewLabel(view, frame, es)} · ${label}`} />;
}

/** Paints instance labels. With `sourcePath` it composites them over the grey frame, which is
 *  what the "source + prediction" view is; without it, labels are drawn on a dark field. */
function InstanceRaster({
  path,
  sourcePath,
  ariaLabel,
}: {
  path: string;
  sourcePath?: string;
  ariaLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [decoded, setDecoded] = useState<DecodedShowcaseLabels | null>(null);
  const [source, setSource] = useState<HTMLImageElement | null>(null);
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
    if (!sourcePath) { setSource(null); return undefined; }
    let cancelled = false;
    const image = new Image();
    image.onload = () => { if (!cancelled) setSource(image); };
    image.src = artifactUrl(sourcePath);
    return () => { cancelled = true; };
  }, [sourcePath]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !decoded) return;
    if (sourcePath && !source) return;
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    const context = canvas.getContext('2d');
    if (!context) return;
    if (source) {
      context.drawImage(source, 0, 0, decoded.width, decoded.height);
    }
    const image = source
      ? context.getImageData(0, 0, decoded.width, decoded.height)
      : context.createImageData(decoded.width, decoded.height);
    for (let index = 0; index < decoded.labels.length; index += 1) {
      const instance = decoded.labels[index];
      const offset = index * 4;
      if (instance === 0) {
        if (source) continue;
        image.data[offset] = 5;
        image.data[offset + 1] = 16;
        image.data[offset + 2] = 22;
        image.data[offset + 3] = 255;
        continue;
      }
      const hue = (instance * 0.61803398875) % 1;
      const [red, green, blue] = hslToRgb(hue, 0.72, 0.58);
      if (source) {
        // Keep the froth texture readable underneath the identity colour.
        image.data[offset] = Math.round(image.data[offset] * 0.45 + red * 0.55);
        image.data[offset + 1] = Math.round(image.data[offset + 1] * 0.45 + green * 0.55);
        image.data[offset + 2] = Math.round(image.data[offset + 2] * 0.45 + blue * 0.55);
      } else {
        image.data[offset] = red;
        image.data[offset + 1] = green;
        image.data[offset + 2] = blue;
      }
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }, [decoded, source, sourcePath]);

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

      {/* All five of these are fractions of the same unit, so they were being compared in the
          reader's head from a column of numbers. On one scale the shape is the point: identity
          precision far above identity recall says the method keeps the tracks it commits to and
          drops the rest, which is a different failure from switching them around. */}
      <MetricBars
        rows={[
          { label: 'IDF1', value: metrics.idf1 },
          { label: 'HOTA', value: metrics.hota },
          { label: es ? 'precisión de identidad' : 'identity precision', value: metrics.id_precision },
          { label: es ? 'recobrado de identidad' : 'identity recall', value: metrics.id_recall },
          { label: es ? 'exactitud de asociación' : 'association accuracy', value: metrics.association_accuracy },
          { label: es ? 'cobertura media' : 'mean coverage', value: metrics.mean_frame_coverage },
        ]}
        caption={es
          ? 'Todas en la misma escala 0 a 1. Los conteos (fragmentaciones, cambios de ID) quedan en la tabla porque no lo son.'
          : 'All on the same 0 to 1 scale. The counts (fragmentations, ID switches) stay in the table because they are not.'}
      />
      <table className="fs-table">
        <tbody>
          <tr><th>{es ? 'instancias GT asociadas' : 'matched GT instances'}</th><td className="num">{metrics.matched_gt_instances ?? 'n/a'}</td></tr>
          <tr><th>{es ? 'cambios de identidad' : 'identity switches'}</th><td className="num">{metrics.id_switches ?? 'n/a'}</td></tr>
          <tr><th>{es ? 'fragmentaciones de traza' : 'track fragmentations'}</th><td className="num">{metrics.track_fragmentations ?? 'n/a'}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

/** Cross-method comparison for one sequence: the point of baking every method is that the
 *  behaviours can be put side by side. Grouped by prediction mode, never merged. */
function SequenceComparison({
  framewise,
  native,
  selectedMethodId,
  onSelect,
  es,
}: {
  framewise: TemporalPrediction[];
  native: TemporalPrediction[];
  selectedMethodId?: string;
  onSelect: (methodId: string) => void;
  es: boolean;
}) {
  const ranked = [...framewise].sort((a, b) => b.metrics.hota - a.metrics.hota);
  return (
    <div className="fs-evidence-panel">
      <header>
        <span>{es ? 'Comparación en esta secuencia' : 'Comparison on this sequence'}</span>
        <h3>{es
          ? 'Cada método sobre los mismos ocho cuadros'
          : 'Every method over the same eight frames'}</h3>
        <p>
          {es
            ? 'Todos los métodos se ejecutaron cuadro a cuadro con el mismo protocolo y recibieron identidades por asociación IoU. La tabla ordena por HOTA, que equilibra detección y asociación. Seleccione una fila para reproducirla.'
            : 'Every method ran frame by frame under the same protocol and received identities by IoU association. The table is ordered by HOTA, which balances detection and association. Pick a row to replay it.'}
        </p>
      </header>
      <div style={{ overflowX: 'auto' }}>
        <table className="fs-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>{es ? 'método' : 'method'}</th>
              <th className="num">HOTA</th>
              <th className="num">IDF1</th>
              <th className="num">{es ? 'cobertura' : 'coverage'}</th>
              <th className="num">{es ? 'cambios ID' : 'ID switches'}</th>
              <th className="num">{es ? 'fragment.' : 'fragments'}</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((item) => (
              <tr key={item.method_id} className={item.method_id === selectedMethodId ? 'fs-selected-row' : undefined}>
                <td className="mono">{item.method_id}</td>
                <th>
                  <button className="fs-method-pick" onClick={() => onSelect(item.method_id)}>
                    {temporalMethodLabel(item.method_id, item.method_slug)}
                  </button>
                </th>
                <td className="num">{item.metrics.hota.toFixed(3)}</td>
                <td className="num">{item.metrics.idf1.toFixed(3)}</td>
                <td className="num">{(item.metrics.mean_frame_coverage * 100).toFixed(1)}%</td>
                <td className="num">{item.metrics.id_switches ?? 'n/a'}</td>
                <td className="num">{item.metrics.track_fragmentations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {native.length > 0 && (
        <>
          <p className="fs-note">
            {es
              ? 'Los métodos siguientes no aparecen en la tabla anterior porque responden otra pregunta: reciben las máscaras exactas del primer cuadro y solo deben conservarlas. Ordenarlos junto a los demás sugeriría una ventaja que el protocolo les regala.'
              : 'The methods below are kept out of that table because they answer a different question: they are given the exact first-frame masks and only have to keep them. Ranking them alongside the rest would credit them with an advantage the protocol hands them.'}
          </p>
          <table className="fs-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{es ? 'método' : 'method'}</th>
                <th>{es ? 'protocolo' : 'protocol'}</th>
                <th className="num">{es ? 'cobertura' : 'coverage'}</th>
              </tr>
            </thead>
            <tbody>
              {native.map((item) => (
                <tr key={item.method_id}>
                  <td className="mono">{item.method_id}</td>
                  <th>
                    <button className="fs-method-pick" onClick={() => onSelect(item.method_id)}>
                      {temporalMethodLabel(item.method_id, item.method_slug)}
                    </button>
                  </th>
                  <td className="fs-hint small">{item.protocol}</td>
                  <td className="num">{(item.metrics.mean_frame_coverage * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function EventEvidence({
  metrics,
  truthEvents,
  predictedEvents,
  loading,
  error,
  frameIndex,
  frameCount,
  es,
  onVisible,
}: {
  metrics: TemporalSequenceMetrics;
  truthEvents: TemporalEvent[];
  predictedEvents: TemporalEvent[];
  loading: boolean;
  error: string;
  frameIndex: number;
  frameCount: number;
  es: boolean;
  onVisible: (wanted: boolean) => void;
}) {
  const truthAtFrame = truthEvents.filter((event) => event.frame_index === frameIndex);
  const predictedAtFrame = predictedEvents.filter((event) => event.frame_index === frameIndex);

  // The shell mounts every tab panel and hides the inactive ones, so "am I mounted" says
  // nothing about whether the reader opened this view. A hidden panel has no layout box, so
  // an intersection observer is what actually distinguishes the two.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onVisible(true);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [onVisible]);

  return (
    <div className="fs-evidence-panel" ref={root}>
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
      {error && <p className="fs-note">{error}</p>}
      {loading && (
        <p className="fs-hint">
          <span className="fs-spinner" aria-hidden="true" />{' '}
          {es ? 'Cargando el registro de eventos de este par' : 'Loading this pair’s event log'}
        </p>
      )}
      {/* The whole log is in the browser, but the panel only ever reported the CURRENT frame,
          so a sequence with events in frames 3 and 6 read as "no published events in this
          frame" on the frame the reader happened to be on. The timeline shows where the events
          actually are, truth above and prediction below, on a shared frame axis. */}
      {!loading && !error && (truthEvents.length > 0 || predictedEvents.length > 0) && (
        <div className="fs-event-timeline">
          <div className="fs-event-track">
            <span>{es ? 'referencia' : 'truth'}</span>
            <div>
              {Array.from({ length: frameCount }, (_, i) => {
                const n = truthEvents.filter((e) => e.frame_index === i).length;
                return (
                  <i
                    key={i}
                    className={`${n > 0 ? 'on' : ''}${i === frameIndex ? ' now' : ''}`}
                    title={`${es ? 'cuadro' : 'frame'} ${i + 1}: ${n}`}
                  >{n > 0 ? n : ''}</i>
                );
              })}
            </div>
          </div>
          <div className="fs-event-track">
            <span>{es ? 'prediccion' : 'prediction'}</span>
            <div>
              {Array.from({ length: frameCount }, (_, i) => {
                const n = predictedEvents.filter((e) => e.frame_index === i).length;
                return (
                  <i
                    key={i}
                    className={`${n > 0 ? 'on pred' : ''}${i === frameIndex ? ' now' : ''}`}
                    title={`${es ? 'cuadro' : 'frame'} ${i + 1}: ${n}`}
                  >{n > 0 ? n : ''}</i>
                );
              })}
            </div>
          </div>
          <p className="fs-hint small">{es
            ? 'Cada casilla es un cuadro; el numero es cuantos eventos se reportaron en el. El cuadro seleccionado esta resaltado.'
            : 'Each cell is a frame; the number is how many events were reported in it. The selected frame is highlighted.'}</p>
        </div>
      )}

      {!loading && !error && (
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
      )}
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

const TEMPORAL_METHOD_LABELS: Record<string, string> = {
  C1: 'Otsu + connected components',
  C2: 'Gradient immersion watershed',
  C3: 'Marker-controlled watershed',
  C4: 'Distance-transform watershed',
  C5: 'H-minima watershed',
  C6: 'SLIC + RAG merge',
  C7: 'Lamella-valley watershed',
  L1: 'Boundary/distance U-Net',
  L2: 'Deep-marker watershed',
  L3: 'GC-FSegNet',
  L4: 'StarDist 2D',
  L5: 'Cellpose-SAM',
  L6: 'YOLO froth segmentation',
  L7: 'SAM 2.1 video propagation',
  N1: 'LamellaStar',
};

export function temporalMethodLabel(methodId: string, slug?: string): string {
  return TEMPORAL_METHOD_LABELS[methodId] ?? slug ?? methodId;
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

/** Same vocabulary as the still lane (see `groupLabel` in Tool.tsx): short noun phrases, with
 *  Methods and Provenance named identically in both lanes so the nav does not change meaning
 *  when the analysis source does. "Compare methods" here versus "Compare" there was the same
 *  view under two names. */
function sequenceTabLabel(tab: SequenceTab, es: boolean): string {
  if (tab === 'replay') return es ? 'Reproducción' : 'Replay';
  if (tab === 'tracking') return es ? 'Seguimiento' : 'Tracking';
  if (tab === 'events') return es ? 'Eventos' : 'Events';
  if (tab === 'compare') return es ? 'Métodos' : 'Methods';
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
