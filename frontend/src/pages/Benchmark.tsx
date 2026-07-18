import { useEffect, useMemo, useState } from 'react';
import { Refs, useShellLang } from '@fasl-work/caos-app-shell';
import { loadBenchmark, loadIndex, loadSamBenchmark } from '../api/artifacts';
import type { BenchmarkDoc, SamBenchmarkDoc } from '../lib/contract.types';
import { BarChart, type BarDatum } from '../viz/BarChart';
import { PanelBoundary } from '../viz/PanelBoundary';

const FLOOR_METHODS = ['watershed_dt', 'watershed_hmax', 'slic_merge'];

export default function Benchmark() {
  const es = useShellLang() === 'es';
  const [sam, setSam] = useState<SamBenchmarkDoc | null>(null);
  const [floors, setFloors] = useState<Record<string, BenchmarkDoc>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [ix, sb] = await Promise.all([loadIndex(), loadSamBenchmark().catch(() => null)]);
        setSam(sb);
        const ids = ix.cases.map((c) => c.case_id);
        setOrder(ids);
        const docs = await Promise.all(ids.map((id) => loadBenchmark(id).catch(() => null)));
        const map: Record<string, BenchmarkDoc> = {};
        ids.forEach((id, i) => { if (docs[i]) map[id] = docs[i]!; });
        setFloors(map);
      } catch (e) {
        setErr(String(e));
      }
    })();
  }, []);

  const samByCase = useMemo(() => {
    const m: Record<string, number | null> = {};
    sam?.cases.forEach((c) => (m[c.case_id] = c.sam_ap));
    return m;
  }, [sam]);

  const apFor = (caseId: string, method: string): number | null => {
    const d = floors[caseId];
    if (!d) return null;
    const m = d.methods.find((x) => x.method === method);
    return m?.ap ?? null;
  };

  const methodMeans = useMemo<BarDatum[]>(() => {
    const rows: BarDatum[] = [];
    for (const method of FLOOR_METHODS) {
      const vals = order.map((c) => apFor(c, method)).filter((v): v is number => v != null);
      if (vals.length) rows.push({ key: method, label: method, value: vals.reduce((a, b) => a + b, 0) / vals.length });
    }
    if (sam?.summary.mean_sam_ap != null) rows.unshift({ key: 'sam', label: 'SAM (live)', value: sam.summary.mean_sam_ap, color: 'var(--color-good)', mark: '★' });
    return rows;
  }, [order, floors, sam]);

  return (
    <div className="page-body prose">
      <div className="page-head">
        <h1>Benchmark</h1>
        <p className="lede">
          {es ? 'El barrido offline completo sobre todos los casos sintéticos: cada método del piso clásico y el segmentador SAM en vivo, con AP de máscara de instancia contra verdad de terreno exacta. Estos son los artefactos commiteados (vía de precómputo).' : 'The full offline sweep across all synthetic cases: every classical-floor method and the live SAM segmenter, with instance mask AP against exact ground truth. These are the committed artifacts (precompute lane).'}
        </p>
      </div>

      {err && <p className="fs-note">error: {err}</p>}
      {!order.length && !err && <p><span className="fs-spinner" /> {es ? 'cargando...' : 'loading...'}</p>}

      {order.length > 0 && (
        <>
          <section>
            <h2>{es ? 'AP medio por método' : 'Mean AP by method'}</h2>
            <PanelBoundary label="mean AP bars">
              <BarChart data={methodMeans} ariaLabel="mean mask AP by method" valueFmt={(v) => v.toFixed(3)} defaultBaseline="zero" highlightKey="sam"
                note={es ? 'Media sobre todos los casos. SAM (★, en vivo) es el modelo fundacional; el resto son los pisos clásicos deterministas.' : 'Mean over all cases. SAM (★, live) is the foundation model; the rest are the deterministic classical floors.'} />
            </PanelBoundary>
          </section>

          <section>
            <h2>{es ? 'Barrido completo (AP de máscara @[.5:.95])' : 'Full sweep (mask AP @[.5:.95])'}</h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="fs-table">
                <thead>
                  <tr>
                    <th>{es ? 'caso' : 'case'}</th>
                    <th className="num">SAM ★</th>
                    <th className="num">watershed_dt</th>
                    <th className="num">watershed_hmax</th>
                    <th className="num">slic_merge</th>
                    <th className="num">{es ? 'burbujas (verdad)' : 'bubbles (truth)'}</th>
                  </tr>
                </thead>
                <tbody>
                  {order.map((c) => {
                    const samAp = samByCase[c];
                    const floorAps = FLOOR_METHODS.map((m) => apFor(c, m));
                    const bestFloor = Math.max(...floorAps.filter((v): v is number => v != null), -1);
                    const nGt = floors[c]?.methods[0]?.n_gt ?? '-';
                    return (
                      <tr key={c}>
                        <td>{c}</td>
                        <td className={`num ${samAp != null && samAp >= bestFloor ? 'win' : ''}`}>{fmt(samAp)}</td>
                        {floorAps.map((v, i) => <td key={i} className={`num ${v != null && v === bestFloor && !(samAp != null && samAp >= bestFloor) ? 'win' : ''}`}>{fmt(v)}</td>)}
                        <td className="num">{nGt}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="fs-hint small">{es ? 'Verde = mejor método en ese caso. SAM en vivo se ejecuta en el navegador; los pisos se precalculan offline con scikit-image.' : 'Green = best method for that case. SAM live runs in the browser; the floors are baked offline with scikit-image.'}</p>
          </section>

          {sam && (
            <>
              <p className="fs-note good">
                {es ? `Resumen: AP medio SAM ${sam.summary.mean_sam_ap} vs piso ${sam.summary.mean_floor_ap} (ventaja ${sam.summary.delta}), SAM gana ${sam.summary.sam_wins}/${sam.summary.n_cases} casos. El AP sintético es un banco controlado, no exactitud de planta real.` : `Summary: mean SAM AP ${sam.summary.mean_sam_ap} vs floor ${sam.summary.mean_floor_ap} (advantage ${sam.summary.delta}), SAM wins ${sam.summary.sam_wins}/${sam.summary.n_cases} cases. Synthetic AP is a controlled harness, not real-plant accuracy.`}
              </p>
              <Refs ids={['kirillov2023', 'meyer1994', 'achanta2012slic', 'lin2014coco']} label="Refs" />
            </>
          )}
        </>
      )}
    </div>
  );
}

const fmt = (v: number | null | undefined): string => (v == null ? '-' : v.toFixed(3));
