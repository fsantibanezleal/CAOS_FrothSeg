/** ADR-0070 focus mode: one scenario, the stage owning the viewport, controls to hand.
 *
 *  The App route is a documented workbench. It carries the selector, the tabs, the prose and
 *  the citations because a reader arriving cold has to understand what the product is. That
 *  framing is right for reading and wrong for working: measured before this route existed, the
 *  instrument held 15% of the viewport at 2560x1440.
 *
 *  This route is the same engine and the same scenario with the explanation removed. It renders
 *  OUTSIDE the shell chrome (`position: fixed; inset: 0`) because the header and footer are
 *  exactly what it exists to escape, and it is deep-linkable per scenario so one case can be
 *  shared and taught from.
 *
 *  Per ADR-0070 8 the flow is the feature: the entry control lives in the App rail beside the
 *  scenario selector and the return control lands back on the App with the same scenario. A
 *  route reachable only by typing its URL is not implemented.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Minimize2, Pause, Play } from 'lucide-react';
import { useShellLang } from '@fasl-work/caos-app-shell';
import { artifactUrl, loadTemporalShowcase } from '../api/artifacts';
import { decodeShowcaseLabels } from '../lib/showcaseLabels';
import { isNativeVideoMode, type TemporalShowcaseManifest } from '../lib/workbench';

const PLAY_SPEEDS = [1, 2, 4] as const;

export default function Focus() {
  const es = useShellLang() === 'es';
  const navigate = useNavigate();
  const { caseId } = useParams<{ caseId: string }>();
  // ADR-0070 8: leaving returns to the App on the SAME scenario. Without this the App
  // remounted on its defaults and the round trip silently discarded the user's selection.
  const backToApp = useCallback(
    () => navigate(`/?source=sequence&case=${encodeURIComponent(caseId ?? '')}`),
    [navigate, caseId],
  );
  const [manifest, setManifest] = useState<TemporalShowcaseManifest | null>(null);
  const [error, setError] = useState('');
  const [frameIndex, setFrameIndex] = useState(0);
  const [predictionIndex, setPredictionIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(2);
  const [showTruth, setShowTruth] = useState(false);
  const [opacity, setOpacity] = useState(0.55);
  const [advanced, setAdvanced] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadTemporalShowcase()
      .then((doc) => { if (!cancelled) setManifest(doc); })
      .catch((reason) => {
        if (!cancelled) setError(String(reason instanceof Error ? reason.message : reason));
      });
    return () => { cancelled = true; };
  }, []);

  const sequence = useMemo(
    () => manifest?.sequences.find((s) => s.case_id === caseId) ?? manifest?.sequences[0] ?? null,
    [manifest, caseId],
  );
  const frames = sequence?.frames ?? [];
  const predictions = useMemo(() => sequence?.predictions ?? [], [sequence]);
  const prediction = predictions[predictionIndex] ?? null;
  const frame = frames[frameIndex] ?? null;
  const predictionFrame = prediction?.frames.find((f) => f.frame_index === frameIndex) ?? null;
  const metrics = prediction?.metrics ?? null;

  // ADR-0070 6: every exposed parameter redraws live. Also honours the no-autoplay rule:
  // motion starts paused and stops when the tab is hidden.
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
      if (event.key === 'Escape') backToApp();
      if (event.key === ' ') { event.preventDefault(); setPlaying((v) => !v); }
      if (event.key === 'ArrowRight') { setPlaying(false); setFrameIndex((c) => (c + 1) % Math.max(frames.length, 1)); }
      if (event.key === 'ArrowLeft') { setPlaying(false); setFrameIndex((c) => (c - 1 + frames.length) % Math.max(frames.length, 1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [backToApp, frames.length]);

  const labelPath = showTruth ? frame?.truth_path : (predictionFrame?.prediction_path ?? frame?.truth_path);

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !frame || !labelPath) return;
    const [source, labels] = await Promise.all([
      new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = artifactUrl(frame.source_path);
      }),
      fetch(artifactUrl(labelPath))
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
        .then(decodeShowcaseLabels),
    ]);
    canvas.width = labels.width;
    canvas.height = labels.height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(source, 0, 0, labels.width, labels.height);
    const raster = context.getImageData(0, 0, labels.width, labels.height);
    for (let i = 0; i < labels.labels.length; i += 1) {
      const instance = labels.labels[i];
      if (instance === 0) continue;
      const o = i * 4;
      const hue = (instance * 0.61803398875) % 1;
      const [r, g, b] = hslToRgb(hue, 0.72, 0.58);
      raster.data[o] = Math.round(raster.data[o] * (1 - opacity) + r * opacity);
      raster.data[o + 1] = Math.round(raster.data[o + 1] * (1 - opacity) + g * opacity);
      raster.data[o + 2] = Math.round(raster.data[o + 2] * (1 - opacity) + b * opacity);
    }
    context.putImageData(raster, 0, 0);
  }, [frame, labelPath, opacity]);

  useEffect(() => { void draw(); }, [draw]);

  if (error || (manifest && !sequence)) {
    return (
      <div className="fs-focus">
        <div className="fs-focus-stage fs-focus-empty">
          <p>{error || (es ? 'Escenario no encontrado.' : 'Scenario not found.')}</p>
          <button className="fs-focus-exit" onClick={backToApp}>
            <Minimize2 size={15} />{es ? 'Volver a la App' : 'Back to the App'}
          </button>
        </div>
      </div>
    );
  }

  const name = sequence ? scenarioName(sequence.case_id, es) : '';

  return (
    <div className="fs-focus">
      <div className="fs-focus-stage">
        <canvas ref={canvasRef} role="img" aria-label={name} />

        {/* ADR-0070 4: the stage is labelled in place, so the view teaches on its own. */}
        <div className="fs-focus-label">
          <strong>{name}</strong>
          <p>{scenarioBlurb(sequence?.case_id ?? '', es)}</p>
        </div>

        {/* ADR-0070 3: KPIs overlay the stage as a HUD, never stacked as cards in flow. */}
        {metrics && (
          <div className="fs-focus-hud">
            <div><span>{es ? 'cobertura' : 'coverage'}</span><strong>{(metrics.mean_frame_coverage * 100).toFixed(1)}%</strong></div>
            <div><span>IDF1</span><strong>{metrics.idf1.toFixed(3)}</strong></div>
            <div><span>HOTA</span><strong>{metrics.hota.toFixed(3)}</strong></div>
            <div><span>{es ? 'cambios ID' : 'ID switches'}</span><strong>{metrics.id_switches ?? '--'}</strong></div>
            <div><span>{es ? 'cuadro' : 'frame'}</span><strong>{String(frameIndex + 1).padStart(2, '0')}/{String(frames.length).padStart(2, '0')}</strong></div>
          </div>
        )}

        <button className="fs-focus-exit" onClick={backToApp} title={es ? 'Salir (Esc)' : 'Exit (Esc)'}>
          <Minimize2 size={15} aria-hidden="true" />{es ? 'Salir del foco' : 'Exit focus'}
        </button>

        <div className="fs-focus-transport">
          <button onClick={() => { setPlaying(false); setFrameIndex((v) => (v - 1 + frames.length) % Math.max(frames.length, 1)); }} aria-label={es ? 'Anterior' : 'Previous'}><ChevronLeft size={17} /></button>
          <button className="primary" onClick={() => setPlaying((v) => !v)} aria-label={playing ? (es ? 'Pausar' : 'Pause') : (es ? 'Reproducir' : 'Play')}>
            {playing ? <Pause size={17} /> : <Play size={17} />}
          </button>
          <button onClick={() => { setPlaying(false); setFrameIndex((v) => (v + 1) % Math.max(frames.length, 1)); }} aria-label={es ? 'Siguiente' : 'Next'}><ChevronRight size={17} /></button>
          <input
            type="range" min={0} max={Math.max(frames.length - 1, 0)} value={frameIndex}
            onChange={(e) => { setPlaying(false); setFrameIndex(Number(e.target.value)); }}
            aria-label={es ? 'Cuadro' : 'Frame'}
          />
        </div>
      </div>

      {/* ADR-0070 2: one parameter column on the right, scrollable independently of the stage. */}
      <aside className="fs-focus-rail">
        <div className="fs-focus-railhead">
          <span>{es ? 'Escenario' : 'Scenario'}</span>
          <strong>{name}</strong>
        </div>

        <label className="fs-ctl">{es ? 'escenario' : 'scenario'}
          <select
            className="fs-sel"
            value={sequence?.case_id ?? ''}
            onChange={(e) => { setFrameIndex(0); setPlaying(false); navigate(`/focus/${e.target.value}`); }}
          >
            {manifest?.sequences.map((s) => (
              <option key={s.case_id} value={s.case_id}>{scenarioName(s.case_id, es)}</option>
            ))}
          </select>
        </label>

        {predictions.length > 0 && (
          <label className="fs-ctl">{es ? 'método' : 'method'}
            <select className="fs-sel" value={predictionIndex} onChange={(e) => setPredictionIndex(Number(e.target.value))}>
              {predictions.map((item, index) => (
                <option key={item.method_id} value={index}>
                  {item.method_id}{isNativeVideoMode(item.mode) ? (es ? ' (no comparable)' : ' (not comparable)') : ''}
                </option>
              ))}
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

        <label className="fs-ctl">{es ? 'velocidad' : 'speed'}
          <select className="fs-sel" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {PLAY_SPEEDS.map((s) => <option key={s} value={s}>{s} fps</option>)}
          </select>
        </label>

        {/* ADR-0070 5: progressive disclosure inside the view, never split across tabs. */}
        <button className="fs-focus-more" onClick={() => setAdvanced((v) => !v)}>
          {advanced ? (es ? 'Menos detalle' : 'Less detail') : (es ? 'Más detalle' : 'More detail')}
        </button>

        {advanced && metrics && (
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

        <p className="fs-hint small fs-focus-foot">{es
          ? 'Espacio reproduce, flechas avanzan cuadro, Esc vuelve a la App.'
          : 'Space plays, arrows step frames, Esc returns to the App.'}</p>
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

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const f = (offset: number) => {
    const k = (offset + hue * 12) % 12;
    const a = saturation * Math.min(lightness, 1 - lightness);
    return lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
