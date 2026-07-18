import { useEffect, useMemo, useState } from 'react';
import { Refs, useShellLang } from '@fasl-work/caos-app-shell';
import { loadMasks, loadSamBenchmark, artifactUrl } from '../api/artifacts';
import type { SamBenchmarkDoc, SamCaseScore } from '../lib/contract.types';
import { decodeLabels } from '../lib/rle';
import { BarChart, type BarDatum } from '../viz/BarChart';
import { MaskOverlay } from '../viz/MaskOverlay';
import { PanelBoundary } from '../viz/PanelBoundary';

export default function Experiments() {
  const es = useShellLang() === 'es';
  const [bench, setBench] = useState<SamBenchmarkDoc | null>(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState('');
  const [gt, setGt] = useState<{ labels: Int32Array; w: number; h: number } | null>(null);

  useEffect(() => {
    loadSamBenchmark()
      .then((b) => { setBench(b); setSel(b.cases[0]?.case_id ?? ''); })
      .catch((e: unknown) => setErr(String(e)));
  }, []);

  useEffect(() => {
    if (!sel) return;
    setGt(null);
    loadMasks(sel).then((doc) => setGt({ labels: decodeLabels(doc), w: doc.width, h: doc.height })).catch(() => setGt(null));
  }, [sel]);

  const apBars = useMemo<BarDatum[]>(() => {
    if (!bench) return [];
    return bench.cases.map((c) => ({
      key: c.case_id,
      label: c.case_id,
      value: c.sam_ap ?? 0,
      color: c.floor_ap != null && (c.sam_ap ?? 0) >= c.floor_ap ? 'var(--color-good)' : '#f0883e',
      sub: c.floor_ap != null ? `floor ${c.floor_ap.toFixed(2)}` : '',
    }));
  }, [bench]);

  const deltaBars = useMemo<BarDatum[]>(() => {
    if (!bench) return [];
    return bench.cases
      .filter((c) => c.sam_ap != null && c.floor_ap != null)
      .map((c) => ({ key: c.case_id, label: c.case_id, value: (c.sam_ap! - c.floor_ap!), color: c.sam_ap! >= c.floor_ap! ? 'var(--color-good)' : '#f0883e' }));
  }, [bench]);

  const selCase = bench?.cases.find((c) => c.case_id === sel) ?? null;

  return (
    <div className="page-body prose">
      <div className="page-head">
        <h1>{es ? 'Experimentos' : 'Experiments'}</h1>
        <p className="lede">
          {es ? 'El segmentador SAM en vivo contra el piso clásico, caso por caso, con las mismas métricas de máscara sobre verdad de terreno exacta. Dónde gana el modelo fundacional y dónde el piso es complementario.' : 'The live SAM segmenter against the classical floor, case by case, with the same mask metrics on exact ground truth. Where the foundation model wins and where the floor is complementary.'}
        </p>
      </div>

      {err && <p className="fs-note">error: {err}</p>}
      {!bench && !err && <p><span className="fs-spinner" /> {es ? 'cargando benchmark...' : 'loading benchmark...'}</p>}

      {bench && (
        <>
          <section>
            <div className="fs-kpis">
              <div className="fs-kpi"><div className="fs-kpi-v">{bench.summary.mean_sam_ap?.toFixed(3) ?? '-'}</div><div className="fs-kpi-l">{es ? 'AP medio SAM' : 'mean SAM AP'}</div></div>
              <div className="fs-kpi"><div className="fs-kpi-v">{bench.summary.mean_floor_ap?.toFixed(3) ?? '-'}</div><div className="fs-kpi-l">{es ? 'AP medio piso' : 'mean floor AP'}</div></div>
              <div className="fs-kpi"><div className="fs-kpi-v" style={{ color: 'var(--color-good)' }}>{bench.summary.delta != null ? (bench.summary.delta >= 0 ? '+' : '') + bench.summary.delta.toFixed(3) : '-'}</div><div className="fs-kpi-l">{es ? 'ventaja SAM' : 'SAM advantage'}</div></div>
              <div className="fs-kpi"><div className="fs-kpi-v">{bench.summary.sam_wins}/{bench.summary.n_cases}</div><div className="fs-kpi-l">{es ? 'casos ganados' : 'cases won'}</div></div>
            </div>
            <p className="fs-hint small" style={{ marginTop: '0.5rem' }}>
              {es ? 'Modelo' : 'Model'}: <span className="mono">{bench.model}</span> · {es ? 'grilla' : 'grid'} {bench.grid}x{bench.grid} · {bench.provenance}
            </p>
          </section>

          <section>
            <h2>{es ? 'AP de máscara por caso: SAM vs piso' : 'Per-case mask AP: SAM vs floor'}</h2>
            <PanelBoundary label="AP chart">
              <BarChart data={apBars} ariaLabel="SAM mask AP per case" valueFmt={(v) => v.toFixed(3)} defaultBaseline="zero"
                note={es ? 'Verde: SAM iguala o supera el piso. Naranja: el piso gana (casos con desenfoque intenso). El readout secundario es el AP del piso.' : 'Green: SAM matches or beats the floor. Orange: the floor wins (heavy-blur cases). The secondary readout is the floor AP.'} />
            </PanelBoundary>
          </section>

          <section>
            <h2>{es ? 'Ventaja de SAM (AP SAM − AP piso)' : 'SAM advantage (SAM AP − floor AP)'}</h2>
            <PanelBoundary label="delta chart">
              <BarChart data={deltaBars} ariaLabel="SAM minus floor AP per case" valueFmt={(v) => (v >= 0 ? '+' : '') + v.toFixed(3)} defaultBaseline="zero" />
            </PanelBoundary>
            <p>
              {es ? 'SAM gana con claridad bajo brillo (donde el watershed sembrado por realce colapsa), en espuma gruesa y en el caso nominal. El piso clásico es complementario bajo desenfoque de movimiento y de foco fuertes, donde el borrón elimina la estructura que los prompts puntuales necesitan y SAM produce pocas máscaras confiables. Por eso la app ofrece ambos.' : 'SAM wins clearly under glare (where highlight-seeded watershed collapses), on coarse froth, and on the nominal case. The classical floor is complementary under heavy motion and defocus blur, where the smear removes the structure point prompts need and SAM yields few confident masks. That is why the app offers both.'}
            </p>
          </section>

          <section>
            <h2>{es ? 'Inspección por caso (verdad de terreno)' : 'Per-case inspection (ground truth)'}</h2>
            <label className="fs-hint small">{es ? 'caso' : 'case'}:{' '}
              <select className="fs-sel" style={{ width: 'auto', display: 'inline-block' }} value={sel} onChange={(e) => setSel(e.target.value)}>
                {bench.cases.map((c) => <option key={c.case_id} value={c.case_id}>{c.case_id}</option>)}
              </select>
            </label>
            <div className="fs-layout" style={{ gridTemplateColumns: '1fr 1fr', marginTop: '0.6rem' }}>
              <PanelBoundary label="ground-truth overlay">
                {gt ? (
                  <MaskOverlay baseUrl={artifactUrl(`synth/${sel}/frame.png`)} labels={gt.labels} width={gt.w} height={gt.h}
                    caption={es ? 'Máscaras de verdad de terreno (sintéticas, exactas). En la App, SAM se ejecuta en vivo sobre este mismo cuadro.' : 'Ground-truth masks (synthetic, exact). In the App, SAM runs live on this same frame.'} />
                ) : <p className="fs-hint small"><span className="fs-spinner" /> {es ? 'cargando máscaras...' : 'loading masks...'}</p>}
              </PanelBoundary>
              <PanelBoundary label="case scores">
                {selCase && <CaseScores c={selCase} es={es} />}
              </PanelBoundary>
            </div>
          </section>

          <p className="fs-note good">
            {es ? 'El AP sintético mide el método contra verdad conocida; no es exactitud de planta real. La capacidad real es sobre la espuma que carga el usuario en la App.' : 'Synthetic AP measures the method against known truth; it is not real-plant accuracy. The real capability is on the froth the user uploads in the App.'}
          </p>
          <Refs ids={['kirillov2023', 'lin2014coco', 'aldrich2010']} label="Refs" />
        </>
      )}
    </div>
  );
}

function CaseScores({ c, es }: { c: SamCaseScore; es: boolean }) {
  const win = c.sam_ap != null && c.floor_ap != null && c.sam_ap >= c.floor_ap;
  return (
    <table className="fs-table">
      <tbody>
        <tr><th>{es ? 'categoría' : 'category'}</th><td>{c.category}</td></tr>
        <tr><th>SAM AP</th><td className={`num ${win ? 'win' : ''}`}>{c.sam_ap?.toFixed(3) ?? '-'}</td></tr>
        <tr><th>SAM AP50</th><td className="num">{c.sam_ap50?.toFixed(3) ?? '-'}</td></tr>
        <tr><th>{es ? 'piso' : 'floor'} ({c.floor_method ?? '-'})</th><td className="num">{c.floor_ap?.toFixed(3) ?? '-'}</td></tr>
        <tr><th>{es ? 'burbujas SAM / verdad' : 'bubbles SAM / truth'}</th><td className="num">{c.sam_n} / {c.gt_n}</td></tr>
        <tr><th>d32 SAM / {es ? 'verdad' : 'truth'}</th><td className="num">{c.sam_d32 ?? '-'} / {c.gt_d32 ?? '-'}</td></tr>
        <tr><th>BSD Wasserstein-1</th><td className="num">{c.sam_bsd_w?.toFixed(2) ?? '-'}</td></tr>
      </tbody>
    </table>
  );
}
