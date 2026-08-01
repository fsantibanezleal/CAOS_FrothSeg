/** ADR-0070 focus mode: one scenario, the stage owning the viewport, controls to hand.
 *
 *  This rewrite fixes three faults Felipe called out on the shipped version:
 *
 *  1. It only worked for the sequence lane. The App's entry navigated to `/focus/<case>` from
 *     BOTH lanes, but this page resolved the id against the temporal manifest only, so from the
 *     still lane it either landed on a different artifact that happened to share the id
 *     (poly-normal is both a still case and a sequence) or on "Scenario not found". The route
 *     now names the lane (`/focus/still/:caseId`, `/focus/sequence/:caseId`) and the still lane
 *     is a first-class focus surface: the same canvas, the method ladder as the selector, and
 *     the per-case AP against truth, with no transport because a still case has no time axis.
 *
 *  2. The scenario switcher was a wrapping list of five chip buttons. ADR-0071 rule 7: a
 *     one-of-N choice from a categorised set is a `select` with `optgroup`, not N buttons. The
 *     ADR-0070 style note that asked for chips is Proposed and predates that accepted rule; one
 *     grouped select now covers every scenario the App itself offers: the primary still cases
 *     (empty-control is excluded exactly as in the App, because no showcase artifacts exist
 *     for it) plus the temporal sequences. The count in the label is derived from those two
 *     catalogues, never hard-coded.
 *
 *  3. The in-stage label and the HUD were anchored to the STAGE, but the frame letterboxes
 *     inside it: at 1600x900 the picture starts 198px in, so the label straddled the dead
 *     margin and the image with a broken shape, and the HUD floated in the black. Every overlay
 *     now lives in the info column beside `.fs-focus-frame`, so nothing covers the picture.
 *
 *  The 2026-07-31 adversarial pass added: method preservation for the SEQUENCE lane in both
 *  directions (`?method=` on entry, exit, and scenario switches), a keydown handler that leaves
 *  form controls alone, and a friendly bilingual error state that keeps the rail mounted so an
 *  unknown id, an unknown method, or a broken artifact never strands the user.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Minimize2, Pause, Play } from 'lucide-react';
import { useShellLang } from '@fasl-work/caos-app-shell';
import {
  artifactUrl, loadIndex, loadMasks, loadMethodBenchmark, loadTemporalShowcase,
} from '../api/artifacts';
import type { CaseIndex, MethodBenchmarkDoc } from '../lib/contract.types';
import { decodeLabels } from '../lib/rle';
import { decodeShowcaseLabels } from '../lib/showcaseLabels';
import { bsdFromLabels } from '../sam/morphometry';
import { maskAp, type MaskApResult } from '../sam/score';
import {
  isNativeVideoMode, primaryShowcaseCases, type TemporalShowcaseManifest,
} from '../lib/workbench';
import { temporalMethodLabel } from './SequenceWorkbench';

const PLAY_SPEEDS = [1, 2, 4] as const;

type LaneKind = 'still' | 'sequence';

export default function Focus() {
  const es = useShellLang() === 'es';
  const navigate = useNavigate();
  const params = useParams<{ laneKind?: string; caseId: string }>();
  const [searchParams] = useSearchParams();
  // Old deep links (`/focus/<id>`) carried no lane and were always sequences; they keep working.
  const laneKind: LaneKind = params.laneKind === 'still' ? 'still' : 'sequence';
  const caseId = params.caseId ?? '';

  // Both catalogues load regardless of lane: the scenario select lists them all.
  const [manifest, setManifest] = useState<TemporalShowcaseManifest | null>(null);
  const [index, setIndex] = useState<CaseIndex | null>(null);
  const [bench, setBench] = useState<MethodBenchmarkDoc | null>(null);
  // A raw decoder or JSON-parse string is never shown to the user; the flag selects the
  // bilingual message and the detail goes to the console for whoever is debugging.
  const [artifactError, setArtifactError] = useState(false);

  const [frameIndex, setFrameIndex] = useState(0);
  const [predictionIndex, setPredictionIndex] = useState(0);
  const [methodId, setMethodId] = useState(searchParams.get('method') ?? 'L5');
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(2);
  const [showTruth, setShowTruth] = useState(false);
  const [opacity, setOpacity] = useState(0.55);
  const [advanced, setAdvanced] = useState(false);
  const [stillStats, setStillStats] = useState<{ ap: MaskApResult; d32: number | null; n: number; truthD32: number | null; truthN: number } | null>(null);
  const [frameAspect, setFrameAspect] = useState('1 / 1');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadTemporalShowcase().then((d) => { if (!cancelled) setManifest(d); }).catch(() => {});
    loadIndex().then((d) => { if (!cancelled) setIndex(d); }).catch(() => {});
    loadMethodBenchmark().then((d) => { if (!cancelled) setBench(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // The still list mirrors the App exactly: primaryShowcaseCases excludes empty-control, for
  // which no showcase/<method>/<case>/ artifacts exist (data/manifests/index.json lists it,
  // the showcase bake skips it). Offering it here broke the view AND the round trip.
  const primaryCases = useMemo(() => primaryShowcaseCases(index?.cases ?? []), [index]);

  const sequence = useMemo(
    () => (laneKind === 'sequence'
      ? manifest?.sequences.find((s) => s.case_id === caseId) ?? null
      : null),
    [manifest, laneKind, caseId],
  );
  const stillCase = useMemo(
    () => (laneKind === 'still' ? primaryCases.find((c) => c.case_id === caseId) ?? null : null),
    [primaryCases, laneKind, caseId],
  );
  const frames = sequence?.frames ?? [];
  const predictions = useMemo(() => sequence?.predictions ?? [], [sequence]);
  const prediction = predictions[predictionIndex] ?? null;
  const frame = frames[frameIndex] ?? null;
  const predictionFrame = prediction?.frames.find((f) => f.frame_index === frameIndex) ?? null;
  const metrics = prediction?.metrics ?? null;
  const benchMethod = bench?.methods.find((m) => m.id === methodId) ?? null;

  // ADR-0070 8: entering preserves the selected method in BOTH lanes. The sequence entry and
  // every scenario switch carry `?method=<id>`; this starts the lane on it (or on the first
  // prediction when the sequence does not publish that method).
  const requestedMethod = searchParams.get('method');
  useEffect(() => {
    if (laneKind !== 'sequence' || !sequence) return;
    const wanted = requestedMethod
      ? (sequence.predictions ?? []).findIndex((p) => p.method_id === requestedMethod)
      : -1;
    setPredictionIndex(wanted >= 0 ? wanted : 0);
  }, [laneKind, sequence, requestedMethod]);

  // ADR-0070 8: leaving returns to the App on the SAME scenario, same lane, same method.
  const backToApp = useCallback(() => {
    const method = laneKind === 'still' ? methodId : prediction?.method_id;
    const suffix = method ? `&method=${encodeURIComponent(method)}` : '';
    navigate(`/?source=${laneKind}&case=${encodeURIComponent(caseId)}${suffix}`);
  }, [navigate, laneKind, caseId, methodId, prediction]);

  // ADR-0070 6: every exposed parameter redraws live; motion starts paused and stops hidden.
  useEffect(() => {
    if (!playing || frames.length < 2) return undefined;
    const timer = window.setInterval(
      () => setFrameIndex((c) => (c + 1) % frames.length),
      Math.round(1000 / speed),
    );
    return () => window.clearInterval(timer);
  }, [playing, speed, frames.length]);

  useEffect(() => {
    const onHide = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A key aimed at a rail control must act on that control only: without this guard the
      // arrows on the opacity slider also stepped frames and Space on a select started
      // playback (measured 2026-07-31). Form controls keep their native keyboard behaviour.
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement
        || target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement) return;
      if (event.key === 'Escape') backToApp();
      if (laneKind !== 'sequence') return;
      if (event.key === ' ') { event.preventDefault(); setPlaying((v) => !v); }
      if (event.key === 'ArrowRight') { setPlaying(false); setFrameIndex((c) => (c + 1) % Math.max(frames.length, 1)); }
      if (event.key === 'ArrowLeft') { setPlaying(false); setFrameIndex((c) => (c - 1 + frames.length) % Math.max(frames.length, 1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [backToApp, laneKind, frames.length]);

  /** Paint source + instance overlay. Shared by both lanes: only the artifact paths differ. */
  const paint = useCallback(async (
    sourcePath: string,
    labelData: { width: number; height: number; labels: Int32Array } | null,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = artifactUrl(sourcePath);
    });
    const width = labelData?.width ?? source.naturalWidth;
    const height = labelData?.height ?? source.naturalHeight;
    canvas.width = width;
    canvas.height = height;
    setFrameAspect(`${width} / ${height}`);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(source, 0, 0, width, height);
    if (!labelData) return;
    const raster = context.getImageData(0, 0, width, height);
    for (let i = 0; i < labelData.labels.length; i += 1) {
      const instance = labelData.labels[i];
      if (instance === 0) continue;
      const o = i * 4;
      const hue = (instance * 0.61803398875) % 1;
      const [r, g, b] = hslToRgb(hue, 0.72, 0.58);
      raster.data[o] = Math.round(raster.data[o] * (1 - opacity) + r * opacity);
      raster.data[o + 1] = Math.round(raster.data[o + 1] * (1 - opacity) + g * opacity);
      raster.data[o + 2] = Math.round(raster.data[o + 2] * (1 - opacity) + b * opacity);
    }
    context.putImageData(raster, 0, 0);
  }, [opacity]);

  // Sequence lane: the selected prediction frame (or truth) over its source frame.
  useEffect(() => {
    if (laneKind !== 'sequence' || !frame) return;
    let cancelled = false;
    const labelPath = showTruth ? frame.truth_path : (predictionFrame?.prediction_path ?? frame.truth_path);
    (async () => {
      try {
        const labels = labelPath
          ? decodeShowcaseLabels(await (await fetch(artifactUrl(labelPath))).arrayBuffer())
          : null;
        if (!cancelled) { await paint(frame.source_path, labels); setArtifactError(false); }
      } catch (reason) {
        if (!cancelled) { console.error('focus sequence artifact failed', reason); setArtifactError(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [laneKind, frame, predictionFrame, showTruth, paint]);

  // An id the index lists but the App never offers (empty-control), or one it does not list at
  // all, must never reach the artifact fetches: the SPA fallback answers 200 with index.html
  // and the decoder throws an internal string.
  const missing = laneKind === 'sequence'
    ? (manifest != null && !sequence)
    : (index != null && !stillCase);
  // An unknown `?method=` (e.g. hand-edited to ZZ) has no artifact directory either.
  const invalidMethod = laneKind === 'still' && bench != null
    && !bench.methods.some((m) => m.id === methodId);

  // Still lane: the selected method's precomputed mask (or truth) over the canonical frame,
  // with the same per-case AP the App reports. All artifacts, nothing recomputed.
  useEffect(() => {
    if (laneKind !== 'still' || !caseId || !index) return;
    if (!stillCase || invalidMethod) return;
    let cancelled = false;
    (async () => {
      try {
        const [labelBuffer, truthDoc] = await Promise.all([
          fetch(artifactUrl(`showcase/${methodId}/${caseId}/labels.rle`)).then((r) => {
            if (!r.ok) throw new Error(`label artifact HTTP ${r.status}`);
            return r.arrayBuffer();
          }),
          loadMasks(caseId),
        ]);
        if (cancelled) return;
        const decoded = decodeShowcaseLabels(labelBuffer);
        const truth = decodeLabels(truthDoc);
        const shown = showTruth
          ? { width: truthDoc.width, height: truthDoc.height, labels: truth }
          : decoded;
        await paint(`synth/${caseId}/frame.png`, shown);
        const ids = new Set(decoded.labels); ids.delete(0);
        const truthIds = new Set(truth); truthIds.delete(0);
        setStillStats({
          ap: maskAp(decoded.labels, truth),
          d32: bsdFromLabels(decoded.labels).d32 ?? null,
          n: ids.size,
          truthD32: bsdFromLabels(truth).d32 ?? null,
          truthN: truthIds.size,
        });
        setArtifactError(false);
      } catch (reason) {
        if (!cancelled) { console.error('focus still artifact failed', reason); setArtifactError(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [laneKind, caseId, index, stillCase, invalidMethod, methodId, showTruth, paint]);

  const problem = missing
    ? (es ? 'Escenario no encontrado.' : 'Scenario not found.')
    : (invalidMethod || artifactError)
      ? (es ? 'Artefacto no disponible para este escenario o método.' : 'Artifact not available for this scenario or method.')
      : '';

  const name = laneKind === 'sequence'
    ? scenarioName(caseId, es)
    : (stillCase ? caseLabel(stillCase.case_id, stillCase.category) : caseId);
  const goTo = (kind: LaneKind, id: string) => {
    setFrameIndex(0); setPlaying(false); setStillStats(null); setArtifactError(false);
    // Scenario switches preserve the current method too: the still method ladder id, or the
    // sequence prediction's method id when moving between sequences.
    const method = kind === 'still'
      ? methodId
      : (laneKind === 'sequence' ? prediction?.method_id : undefined);
    navigate(`/focus/${kind}/${id}${method ? `?method=${encodeURIComponent(method)}` : ''}`);
  };

  // The scenario count is derived from the two catalogues rendered in the select below
  // (data/manifests/index.json primary cases + data/showcase/temporal/manifest.json
  // sequences); a hard-coded count shipped false once already.
  const scenarioCount = primaryCases.length + (manifest?.sequences.length ?? 0);
  const scenarioLabel = scenarioCount > 0
    ? `${es ? 'escenario' : 'scenario'} (${scenarioCount})`
    : (es ? 'escenario' : 'scenario');

  return (
    <div className="fs-focus">
      <div className="fs-focus-stage">
        {problem ? (
          /* The rail stays mounted beside this message, so the scenario and method selects
             remain the recovery path; "Back to the App" is never the only way out. */
          <div
            className="fs-focus-empty"
            style={{
              margin: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: '1rem', padding: '1rem', textAlign: 'center', color: '#eafffc',
            }}
          >
            <p>{problem}</p>
            <button className="fs-focus-exit" onClick={backToApp}>
              <Minimize2 size={15} />{es ? 'Volver a la App' : 'Back to the App'}
            </button>
          </div>
        ) : (
          <>
            {/* The stage is [info column][picture]. Anchoring the label and HUD ON the picture hid
                the bubbles under them, which Felipe rejected: the image is the whole point of this
                view. The info column occupies the letterbox band the picture cannot use, so the
                stage stays fully owned (ADR-0070 1) and the picture is never covered by anything. */}
            <aside className="fs-focus-side">
              <button className="fs-focus-exit" onClick={backToApp} title={es ? 'Salir (Esc)' : 'Exit (Esc)'}>
                <Minimize2 size={15} aria-hidden="true" />{es ? 'Salir del foco' : 'Exit focus'}
              </button>

              {/* ADR-0070 4: the stage is labelled in place, so the view teaches on its own. */}
              <div className="fs-focus-label">
                <strong>{name}</strong>
                <p>{laneKind === 'sequence' ? scenarioBlurb(caseId, es) : (stillCase ? categoryBlurb(stillCase.category, es) : '')}</p>
                <em>{showTruth
                  ? (es ? 'Mostrando la referencia exacta' : 'Showing the exact reference')
                  : laneKind === 'sequence'
                    ? (prediction
                      ? `${prediction.method_id} · ${temporalMethodLabel(prediction.method_id, prediction.method_slug)}`
                      : (es ? 'Sin predicción publicada' : 'No published prediction'))
                    : `${methodId} · ${benchMethod?.name ?? ''}`}</em>
              </div>

              {/* ADR-0070 3: value first, label second, a left column under the label. */}
              {laneKind === 'sequence' && metrics && (
                <div className="fs-focus-hud">
                  <div><span>{es ? 'cobertura' : 'coverage'}</span><strong>{(metrics.mean_frame_coverage * 100).toFixed(1)}%</strong></div>
                  <div><span>IDF1</span><strong>{metrics.idf1.toFixed(3)}</strong></div>
                  <div><span>HOTA</span><strong>{metrics.hota.toFixed(3)}</strong></div>
                  <div><span>{es ? 'cambios ID' : 'ID switches'}</span><strong>{metrics.id_switches ?? '--'}</strong></div>
                  <div><span>{es ? 'cuadro' : 'frame'}</span><strong>{String(frameIndex + 1).padStart(2, '0')}/{String(frames.length).padStart(2, '0')}</strong></div>
                </div>
              )}
              {laneKind === 'still' && stillStats && (
                <div className="fs-focus-hud">
                  <div><span>{es ? 'burbujas' : 'bubbles'}</span><strong>{showTruth ? stillStats.truthN : stillStats.n}</strong></div>
                  <div><span>d32 (px)</span><strong>{(showTruth ? stillStats.truthD32 : stillStats.d32) ?? '--'}</strong></div>
                  <div><span>{es ? 'AP vs verdad' : 'AP vs truth'}</span><strong>{stillStats.ap.ap?.toFixed(3) ?? '--'}</strong></div>
                  <div><span>AP50</span><strong>{stillStats.ap.ap50?.toFixed(3) ?? '--'}</strong></div>
                </div>
              )}

              {laneKind === 'sequence' && frames.length > 1 && (
                <div className="fs-focus-transport">
                  <button className="fs-play-button" aria-label={es ? 'Cuadro anterior' : 'Previous frame'}
                    onClick={() => { setPlaying(false); setFrameIndex((c) => (c - 1 + frames.length) % frames.length); }}>
                    <ChevronLeft size={18} />
                  </button>
                  <button className="fs-play-button primary" aria-label={playing ? (es ? 'Pausar' : 'Pause') : (es ? 'Reproducir' : 'Play')}
                    onClick={() => setPlaying((v) => !v)}>
                    {playing ? <Pause size={18} /> : <Play size={18} />}
                  </button>
                  <button className="fs-play-button" aria-label={es ? 'Cuadro siguiente' : 'Next frame'}
                    onClick={() => { setPlaying(false); setFrameIndex((c) => (c + 1) % frames.length); }}>
                    <ChevronRight size={18} />
                  </button>
                  <input type="range" min={0} max={frames.length - 1} value={frameIndex}
                    onChange={(event) => { setPlaying(false); setFrameIndex(Number(event.target.value)); }}
                    aria-label={es ? 'Cuadro de secuencia' : 'Sequence frame'} />
                </div>
              )}
            </aside>

            {/* The picture: canvas only. Nothing is ever drawn over it. */}
            <div className="fs-focus-frame">
              <div className="fs-focus-picture" style={{ ['--fs-focus-ar' as string]: frameAspect }}>
                <canvas ref={canvasRef} role="img" aria-label={name} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ADR-0070 2: one parameter column on the right, scrollable independently of the stage. */}
      <aside className="fs-focus-rail">
        <div className="fs-focus-railhead">
          <span>{laneKind === 'sequence' ? (es ? 'Secuencia' : 'Sequence') : (es ? 'Caso canónico' : 'Canonical case')}</span>
          <strong>{name}</strong>
          <code>{caseId}</code>
        </div>

        <button className="fs-focus-more" onClick={() => setAdvanced((v) => !v)}>
          {advanced ? (es ? 'Menos detalle' : 'Less detail') : (es ? 'Más detalle' : 'More detail')}
        </button>

        {/* ADR-0071 rule 7: a one-of-N choice from a categorised set is a select with optgroup.
            The previous chip list showed 5 of the scenarios and wrapped badly. The still group
            is the App's primary list (empty-control excluded: it has no showcase artifacts). */}
        <label className="fs-ctl">{scenarioLabel}
          <select
            className="fs-sel"
            value={`${laneKind}:${caseId}`}
            onChange={(e) => {
              const [kind, id] = e.target.value.split(':');
              goTo(kind as LaneKind, id);
            }}
          >
            {/* An id outside the catalogues (bad deep link) must not make the select DISPLAY
                the first real option while holding junk; the placeholder keeps it honest. */}
            {missing && <option value={`${laneKind}:${caseId}`} disabled>{caseId}</option>}
            <optgroup label={es ? 'Casos canónicos (imagen fija)' : 'Canonical cases (still image)'}>
              {primaryCases.map((c) => (
                <option key={c.case_id} value={`still:${c.case_id}`}>{caseLabel(c.case_id, c.category)}</option>
              ))}
            </optgroup>
            <optgroup label={es ? 'Secuencias temporales' : 'Temporal sequences'}>
              {manifest?.sequences.map((s) => (
                <option key={s.case_id} value={`sequence:${s.case_id}`}>{scenarioName(s.case_id, es)}</option>
              ))}
            </optgroup>
          </select>
        </label>

        {laneKind === 'sequence' && predictions.length > 0 && (
          <label className="fs-ctl">{es ? 'método' : 'method'}
            <select className="fs-sel" value={predictionIndex} onChange={(e) => setPredictionIndex(Number(e.target.value))}>
              {predictions.map((item, i) => (
                <option key={item.method_id} value={i}>
                  {item.method_id} · {temporalMethodLabel(item.method_id, item.method_slug)}
                  {isNativeVideoMode(item.mode) ? (es ? ' (no comparable)' : ' (not comparable)') : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        {laneKind === 'still' && bench && (
          /* The evaluated-method count is bench.methods.length from data/method-benchmark.json,
             the same document that fills the options; never a literal. */
          <label className="fs-ctl">{es ? `método (${bench.methods.length} evaluados)` : `method (${bench.methods.length} evaluated)`}
            <select className="fs-sel" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
              <optgroup label={es ? 'Clásicos' : 'Classical'}>
                {bench.methods.filter((m) => m.id.startsWith('C')).map((m) => (
                  <option key={m.id} value={m.id}>{m.id} · {m.name}</option>))}
              </optgroup>
              <optgroup label={es ? 'Entrenados y fundacionales' : 'Trained and foundation'}>
                {bench.methods.filter((m) => m.id.startsWith('L')).map((m) => (
                  <option key={m.id} value={m.id}>{m.id} · {m.name}</option>))}
              </optgroup>
              <optgroup label={es ? 'Investigación' : 'Research'}>
                {bench.methods.filter((m) => m.id.startsWith('N')).map((m) => (
                  <option key={m.id} value={m.id}>{m.id} · {m.name}</option>))}
              </optgroup>
            </select>
          </label>
        )}

        <div className="fs-seg">
          <button className={showTruth ? 'chip' : 'chip on'} onClick={() => setShowTruth(false)}>{es ? 'Predicción' : 'Prediction'}</button>
          <button className={showTruth ? 'chip on' : 'chip'} onClick={() => setShowTruth(true)}>{es ? 'Referencia' : 'Truth'}</button>
        </div>

        <label className="fs-ctl">{es ? 'opacidad de máscara' : 'mask opacity'}: {opacity.toFixed(2)}
          <input type="range" min={0} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
        </label>

        {laneKind === 'sequence' && (
          <label className="fs-ctl">{es ? 'velocidad' : 'speed'}
            <select className="fs-sel" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              {PLAY_SPEEDS.map((s) => <option key={s} value={s}>{s} fps</option>)}
            </select>
          </label>
        )}

        {advanced && laneKind === 'sequence' && metrics && (
          <div className="fs-focus-detail">
            <table className="fs-table">
              <tbody>
                <tr><th>{es ? 'fragmentaciones' : 'fragmentations'}</th><td className="num">{metrics.track_fragmentations}</td></tr>
                <tr><th>{es ? 'precisión ID' : 'ID precision'}</th><td className="num">{metrics.id_precision?.toFixed(3) ?? 'n/a'}</td></tr>
                <tr><th>{es ? 'recobrado ID' : 'ID recall'}</th><td className="num">{metrics.id_recall?.toFixed(3) ?? 'n/a'}</td></tr>
                <tr><th>flow EPE px</th><td className="num">{metrics.flow_epe_px?.toFixed(2) ?? 'n/a'}</td></tr>
                <tr><th>{es ? 'eventos F1' : 'event F1'}</th><td className="num">{metrics.event_f1?.toFixed(3) ?? 'n/a'}</td></tr>
              </tbody>
            </table>
            {prediction && isNativeVideoMode(prediction.mode) && (
              <p className="fs-note">{es
                ? 'Recibe las máscaras exactas del primer cuadro y solo debe conservarlas; sus métricas de identidad no son comparables.'
                : 'It is given the exact first-frame masks and only has to keep them; its identity metrics are not comparable.'}</p>
            )}
          </div>
        )}
        {advanced && laneKind === 'still' && stillStats && (
          <div className="fs-focus-detail">
            <table className="fs-table">
              <tbody>
                <tr><th>AP75</th><td className="num">{stillStats.ap.ap75?.toFixed(3) ?? '--'}</td></tr>
                <tr><th>{es ? 'emparejadas (IoU 0.50)' : 'matched (IoU 0.50)'}</th><td className="num">{stillStats.ap.tp50}</td></tr>
                <tr><th>{es ? 'no detectadas' : 'missed'}</th><td className="num">{stillStats.ap.fn50}</td></tr>
                <tr><th>{es ? 'espurias' : 'spurious'}</th><td className="num">{stillStats.ap.fp50}</td></tr>
                <tr><th>{es ? 'AP media (test, 64 casos)' : 'mean AP (test, 64 cases)'}</th><td className="num">{benchMethod?.test?.mean_ap.toFixed(3) ?? '--'}</td></tr>
              </tbody>
            </table>
          </div>
        )}

        {/* ADR-0070: "a provenance note naming the models and their sources". */}
        <div className="fs-focus-prov">
          <span>{es ? 'Proveniencia' : 'Provenance'}</span>
          <p>{es
            ? 'Cuadros y máscaras precalculados offline y servidos como artefactos verificados por sha256. El navegador no ejecuta el modelo.'
            : 'Frames and masks are precomputed offline and served as sha256-verified artifacts. The browser does not run the model.'}</p>
          {laneKind === 'sequence' && prediction && (
            <p className="mono">{prediction.method_id} · {temporalMethodLabel(prediction.method_id, prediction.method_slug)}
              {' · '}{prediction.method_slug}
              {prediction.model_provenance?.device ? ` · ${prediction.model_provenance.device}` : ''}</p>
          )}
          {laneKind === 'still' && benchMethod && (
            <p className="mono">{benchMethod.id} · {benchMethod.name}
              {benchMethod.test ? ` · AP ${benchMethod.test.mean_ap.toFixed(3)}` : ''}</p>
          )}
        </div>

        <p className="fs-hint small fs-focus-foot">{laneKind === 'sequence'
          ? (es ? 'Espacio reproduce, flechas avanzan cuadro, Esc vuelve a la App.' : 'Space plays, arrows step frames, Esc returns to the App.')
          : (es ? 'Esc vuelve a la App con este caso y este método seleccionados.' : 'Esc returns to the App with this case and method selected.')}</p>
      </aside>
    </div>
  );
}

function scenarioName(caseId: string, es: boolean): string {
  const labels: Record<string, [string, string]> = {
    'poly-normal': ['Nominal polydisperse flow', 'Flujo polidisperso nominal'],
    'fine-froth': ['Fine-bubble field', 'Campo de burbujas finas'],
    'glare-storm': ['Specular-glare stress', 'Estrés por brillo especular'],
    'motion-fast': ['Fast surface motion', 'Movimiento rápido de superficie'],
    bursting: ['Bursting and topology change', 'Ruptura y cambio topológico'],
  };
  return labels[caseId]?.[es ? 1 : 0] ?? caseId;
}

function scenarioBlurb(caseId: string, es: boolean): string {
  const blurbs: Record<string, [string, string]> = {
    'poly-normal': [
      'Bubbles advect steadily and keep their identities. This is what a healthy cell looks like: colours persist frame to frame.',
      'Las burbujas avanzan de forma estable y conservan su identidad. Así se ve una celda sana: los colores persisten entre cuadros.'],
    'fine-froth': [
      'Dense fine bubbles. Watch identities flicker where neighbours touch: separation, not detection, is the limit here.',
      'Burbujas finas y densas. Observe el parpadeo de identidades donde se tocan: el límite es la separación, no la detección.'],
    'glare-storm': [
      'Moving highlights erase the lamella between bubbles, so a single bubble can split into two and back again.',
      'Los brillos móviles borran la lamela entre burbujas, así que una burbuja puede dividirse en dos y volver.'],
    'motion-fast': [
      'Rapid advection. Association has to bridge a larger displacement each frame, and identity is the first thing lost.',
      'Advección rápida. La asociación debe salvar un desplazamiento mayor por cuadro, y la identidad es lo primero que se pierde.'],
    bursting: [
      'Bubbles burst and merge, so instances genuinely appear and vanish. Not every identity change here is an error.',
      'Las burbujas revientan y se fusionan, así que las instancias aparecen y desaparecen de verdad. No todo cambio de identidad es un error.'],
  };
  return blurbs[caseId]?.[es ? 1 : 0] ?? '';
}

/** Still cases are named from the committed index (id plus its category); nothing is invented. */
function caseLabel(caseId: string, category: string): string {
  return `${caseId} · ${category}`;
}

function categoryBlurb(category: string, es: boolean): string {
  return es
    ? `Caso canónico de la categoría "${category}". La máscara mostrada es el artefacto precalculado del método seleccionado.`
    : `Canonical case in the "${category}" category. The mask shown is the selected method's precomputed artifact.`;
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const f = (offset: number) => {
    const k = (offset + hue * 12) % 12;
    const a = saturation * Math.min(lightness, 1 - lightness);
    return lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
