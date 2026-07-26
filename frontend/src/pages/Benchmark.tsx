import { useEffect, useMemo, useState } from 'react';
import { Refs, useShellLang } from '@fasl-work/caos-app-shell';
import { loadMethodBenchmark } from '../api/artifacts';
import type { MethodBenchmarkDoc, MethodBenchmarkRow } from '../lib/contract.types';
import { BarChart, type BarDatum } from '../viz/BarChart';
import { PanelBoundary } from '../viz/PanelBoundary';

const TIER_LABELS = {
  classical: 'Classical',
  'domain-sota': 'Domain learned',
  foundation: 'Foundation',
  frontier: 'Frontier experiment',
};

export default function Benchmark() {
  const es = useShellLang() === 'es';
  const [benchmark, setBenchmark] = useState<MethodBenchmarkDoc | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadMethodBenchmark().then(setBenchmark).catch((reason) => setError(String(reason)));
  }, []);

  const testBars = useMemo<BarDatum[]>(() => {
    if (!benchmark) return [];
    return benchmark.methods
      .filter((method) => method.test)
      .sort((a, b) => b.test!.mean_ap - a.test!.mean_ap)
      .map((method) => ({
        key: method.slug,
        label: `${method.id} ${method.name}`,
        value: method.test!.mean_ap,
        color: method.id === benchmark.current_bar.leader?.id
          ? 'var(--color-accent)' : undefined,
      }));
  }, [benchmark]);

  const canonicalBars = useMemo<BarDatum[]>(() => {
    if (!benchmark) return [];
    return benchmark.methods
      .filter((method) => method.canonical)
      .sort((a, b) => b.canonical!.mean_ap - a.canonical!.mean_ap)
      .map((method) => ({
        key: method.slug,
        label: `${method.id} ${method.name}`,
        value: method.canonical!.mean_ap,
      }));
  }, [benchmark]);

  return (
    <div className="page-body prose">
      <div className="page-head">
        <span className="eyebrow">{es ? 'Evidencia precalculada' : 'Precomputed evidence'}</span>
        <h1>{es ? 'Matriz completa de métodos' : 'Complete method matrix'}</h1>
        <p className="lede">
          {es
            ? 'Clásicos, modelos entrenados, fundacionales y experimentos de frontera evaluados bajo contratos explícitos. El navegador lee estos artefactos; no vuelve a entrenar ni recalcula el benchmark.'
            : 'Classical, trained, foundation, and frontier methods evaluated under explicit contracts. The browser reads these artifacts; it does not retrain or recompute the benchmark.'}
        </p>
      </div>

      {error && <p className="fs-note">error: {error}</p>}
      {!benchmark && !error && <p><span className="fs-spinner" /> loading benchmark...</p>}

      {benchmark && (
        <>
          <section className="fs-method-portfolio" aria-label="benchmark status">
            <MetricCard value={benchmark.implemented_count} label={es ? 'implementados' : 'implemented'} detail={`${benchmark.method_count} total`} />
            <MetricCard value={benchmark.missing_count} label={es ? 'faltantes' : 'missing'} detail={es ? 'sin herramientas falsas' : 'no fake tools'} muted={benchmark.missing_count > 0} />
            <MetricCard
              value={benchmark.current_bar.leader?.id ?? '-'}
              label={es ? 'líder en prueba' : 'test leader'}
              detail={benchmark.current_bar.leader ? `AP ${benchmark.current_bar.leader.mean_ap.toFixed(3)}` : '-'}
            />
          </section>

          <section>
            <h2>{es ? 'Comparación retenida' : 'Held-out comparison'}</h2>
            <p className="fs-hint">
              {es
                ? 'Solo métodos con prueba intocable de 64 muestras. Esta es la comparación principal.'
                : 'Only methods with the untouched 64-sample test split. This is the primary comparison.'}
            </p>
            <PanelBoundary label="held-out test AP">
              <BarChart
                data={testBars}
                ariaLabel="held-out test mean mask AP by method"
                valueFmt={(value) => value.toFixed(3)}
                defaultBaseline="zero"
                note={`${benchmark.current_bar.metric}; bar ${benchmark.current_bar.threshold.toFixed(2)}. Synthetic controlled harness, not plant accuracy.`}
              />
            </PanelBoundary>
          </section>

          <section>
            <h2>{es ? 'Diagnóstico canónico, 13 casos' : 'Canonical diagnostic, 13 cases'}</h2>
            <PanelBoundary label="canonical diagnostic AP">
              <BarChart
                data={canonicalBars}
                ariaLabel="canonical diagnostic mean mask AP by method"
                valueFmt={(value) => value.toFixed(3)}
                defaultBaseline="zero"
                note={es ? 'Incluye C1-C7; no mezclar con la prueba retenida.' : 'Includes C1-C7; do not mix this with held-out test scores.'}
              />
            </PanelBoundary>
          </section>

          <section>
            <h2>{es ? 'Estado, motor y calidad' : 'Status, engine, and quality'}</h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="fs-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>{es ? 'método' : 'method'}</th>
                    <th>{es ? 'clase' : 'tier'}</th>
                    <th>{es ? 'motor' : 'engine'}</th>
                    <th>{es ? 'estado' : 'state'}</th>
                    <th className="num">AP test</th>
                    <th className="num">AP canon.</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmark.methods.map((method) => <MethodRow key={method.id} method={method} es={es} />)}
                </tbody>
              </table>
            </div>
          </section>

          <p className="fs-note">
            {benchmark.current_bar.beyond_sota_claim
              ? 'A frontier claim has passed the registered gate.'
              : es
                ? 'No existe afirmación “beyond SOTA”: LamellaStar v1 falló su hipótesis y se conserva como resultado negativo.'
                : 'There is no “beyond SOTA” claim: LamellaStar v1 failed its hypothesis and is retained as a negative result.'}
          </p>
          <Refs ids={['kirillov2023', 'meyer1994', 'achanta2012slic', 'lin2014coco']} label="Refs" />
        </>
      )}
    </div>
  );
}

function MetricCard({ value, label, detail, muted = false }: {
  value: number | string; label: string; detail: string; muted?: boolean;
}) {
  return (
    <div className={`fs-method-card ${muted ? 'muted' : ''}`}>
      <span className="fs-method-count">{value}</span>
      <div><strong>{label}</strong><p>{detail}</p></div>
    </div>
  );
}

function MethodRow({ method, es }: { method: MethodBenchmarkRow; es: boolean }) {
  const state = method.state === 'implemented'
    ? (es ? 'implementado' : 'implemented')
    : (es ? 'faltante' : 'missing');
  const quality = method.quality_status === 'passes-current-bar' ? 'win' : '';
  return (
    <tr>
      <td className="mono">{method.id}</td>
      <td><strong>{method.name}</strong><br /><span className="fs-hint small">{method.lane}</span></td>
      <td>{TIER_LABELS[method.tier]}</td>
      <td>{method.engine}</td>
      <td>{state}<br /><span className="fs-hint small">{method.quality_status}</span></td>
      <td className={`num ${quality}`}>{fmt(method.test?.mean_ap)}</td>
      <td className="num">{fmt(method.canonical?.mean_ap)}</td>
    </tr>
  );
}

const fmt = (value: number | null | undefined): string =>
  value == null ? '-' : value.toFixed(3);
