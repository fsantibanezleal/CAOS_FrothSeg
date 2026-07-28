import { useEffect, useState } from 'react';
import { Callout, Equation, Refs, SubTabs, useShellLang } from '@fasl-work/caos-app-shell';
import { loadMethodBenchmark } from '../api/artifacts';
import type { MethodBenchmarkDoc, MethodBenchmarkRow, MethodMetricSummary } from '../lib/contract.types';
import { BarChart, type BarDatum } from '../viz/BarChart';
import { PanelBoundary } from '../viz/PanelBoundary';

type MetricKey = 'mean_ap' | 'mean_ap50' | 'mean_pq' | 'mean_boundary_fscore' | 'mean_bsd_wasserstein' | 'mean_d32_relative_error';

const FAMILY_LABELS: Record<MethodBenchmarkRow['tier'], { en: string; es: string }> = {
  classical: { en: 'Classical image processing', es: 'Procesamiento clásico' },
  'domain-sota': { en: 'Task-trained model', es: 'Modelo entrenado para la tarea' },
  foundation: { en: 'Foundation model', es: 'Modelo fundacional' },
  frontier: { en: 'Research model', es: 'Modelo de investigación' },
};

const FAMILY_COLORS: Record<MethodBenchmarkRow['tier'], string> = {
  classical: 'var(--color-good)',
  'domain-sota': 'var(--color-accent)',
  foundation: 'var(--color-fg-subtle)',
  frontier: 'var(--color-warn)',
};

export default function Benchmark() {
  const es = useShellLang() === 'es';
  const [benchmark, setBenchmark] = useState<MethodBenchmarkDoc | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    loadMethodBenchmark().then(setBenchmark).catch((reason) => setError(String(reason)));
  }, []);

  const tabs = [
    { id: 'overview', label: es ? 'Panorama' : 'Overview', content: <Overview es={es} benchmark={benchmark} /> },
    { id: 'ranking', label: es ? 'Ranking' : 'Ranking', content: <Ranking es={es} benchmark={benchmark} /> },
    { id: 'robustness', label: es ? 'Robustez' : 'Robustness', content: <ConditionAnalysis es={es} benchmark={benchmark} /> },
    { id: 'morphometry', label: es ? 'Morfometría' : 'Morphometry', content: <MorphometryAnalysis es={es} benchmark={benchmark} /> },
    { id: 'compute', label: es ? 'Costo' : 'Compute', content: <ComputeAnalysis es={es} benchmark={benchmark} /> },
    { id: 'calibration', label: es ? 'Calibración' : 'Calibration', content: <CalibrationAnalysis es={es} benchmark={benchmark} /> },
    { id: 'matrix', label: es ? 'Matriz completa' : 'Complete matrix', content: <CompleteMatrix es={es} benchmark={benchmark} /> },
    { id: 'limits', label: es ? 'Alcance' : 'Scope', content: <Scope es={es} benchmark={benchmark} /> },
  ];

  return (
    <div className="page-body prose fs-science-page">
      <header className="page-head fs-science-head">
        <span className="eyebrow">{es ? 'Comparación retenida y diagnóstico' : 'Held-out comparison and diagnosis'}</span>
        <h1>{es ? 'Calidad, robustez y costo bajo un protocolo común' : 'Quality, robustness, and cost under one protocol'}</h1>
        <p className="lede">
          {es
            ? 'Quince métodos, 64 muestras retenidas por método y 16 condiciones. El ranking es solo el punto de partida: la distribución de errores determina si una máscara sirve como medición.'
            : 'Fifteen methods, 64 held-out samples per method, and 16 conditions. Ranking is only the starting point: the error distribution determines whether a mask is useful as a measurement.'}
        </p>
      </header>
      {error && <p className="fs-note">error: {error}</p>}
      {!benchmark && !error && <p><span className="fs-spinner" /> {es ? 'Cargando benchmark…' : 'Loading benchmark…'}</p>}
      <section><SubTabs tabs={tabs} ariaLabel={es ? 'Análisis del benchmark' : 'Benchmark analysis'} /></section>
    </div>
  );
}

function Overview({ es, benchmark }: BenchmarkProps) {
  if (!benchmark) return <Loading es={es} />;
  const ranked = rankBy(benchmark.methods, 'mean_ap');
  const leader = ranked[0];
  const second = ranked[1];
  const bestClassical = ranked.find((method) => method.tier === 'classical');
  const thresholdPasses = ranked.filter((method) => (method.test?.mean_ap ?? 0) >= benchmark.current_bar.threshold);
  return (
    <div className="fs-benchmark-chapter">
      <BenchmarkLead n="01" title={es ? 'Una lectura en cuatro niveles' : 'A four-level reading'} text={es ? 'Cobertura confirma que la comparación es completa; AP ordena instancias; morfometría prueba utilidad de proceso; costo define dónde puede ejecutarse.' : 'Coverage confirms that the comparison is complete; AP orders instances; morphometry tests process usefulness; compute determines where a method can run.'} />
      <div className="fs-benchmark-hero">
        <div className="fs-leader-block">
          <span>{es ? 'Mayor AP retenido' : 'Highest held-out AP'}</span>
          <strong>{leader?.id} · {leader?.name}</strong>
          <b>{leader?.test?.mean_ap.toFixed(3)}</b>
          <p>{es ? `AP50 ${fmt(leader?.test?.mean_ap50)} · PQ ${fmt(leader?.test?.mean_pq)} · 64 muestras` : `AP50 ${fmt(leader?.test?.mean_ap50)} · PQ ${fmt(leader?.test?.mean_pq)} · 64 samples`}</p>
        </div>
        <BenchmarkLandscape methods={ranked} threshold={benchmark.current_bar.threshold} es={es} />
      </div>
      <div className="fs-overview-facts">
        <article><span>{benchmark.coverage.observed_cells}</span><strong>{es ? 'celdas completas' : 'complete cells'}</strong><p>15 × 64</p></article>
        <article><span>{thresholdPasses.length}</span><strong>{es ? 'métodos sobre AP 0.30' : 'methods above AP 0.30'}</strong><p>{thresholdPasses.map((item) => item.id).join(' · ')}</p></article>
        <article><span>{second?.id}</span><strong>{es ? 'segundo método' : 'runner-up'}</strong><p>AP {fmt(second?.test?.mean_ap)}</p></article>
        <article><span>{bestClassical?.id}</span><strong>{es ? 'mejor clásico' : 'best classical'}</strong><p>AP {fmt(bestClassical?.test?.mean_ap)}</p></article>
      </div>
      <Equation tex={String.raw`\mathrm{AP}=\frac{1}{10}\sum_{\tau=0.50}^{0.95}\mathrm{AP}_{\tau}`} caption={es ? 'El ranking promedia correspondencia de instancias en diez umbrales IoU.' : 'Ranking averages instance correspondence over ten IoU thresholds.'} />
      <h3>{es ? 'Qué significa el liderazgo' : 'What leadership means'}</h3>
      <p>{es ? 'LamellaStar, publicado como un ensamble de tres semillas, obtiene la mayor correspondencia de instancias en este banco controlado y también lidera en AP50, PQ y F de frontera. El margen sobre Cellpose-SAM (+0,009) es menor que la dispersión entre semillas de un modelo individual (0,037) medida en el mismo estudio, y solo se evaluó un ensamble, por lo que esto es un resultado de tabla y no una afirmación de superioridad.' : 'LamellaStar, published as a three-seed ensemble, achieves the strongest instance correspondence on this controlled benchmark and also leads on AP50, PQ and boundary F-score. Its margin over Cellpose-SAM (+0.009) is smaller than the single-model seed spread (0.037) measured in the same study, and only one ensemble was evaluated, so this is a leaderboard result and not a superiority claim.'}</p>
      <Callout variant="honest" title={es ? 'Cobertura y alcance' : 'Coverage and scope'}>{es ? 'Cada uno de los 15 métodos tiene exactamente 64 resultados de prueba. Los casos canónicos se mantienen fuera del ranking y el control vacío permanece como prueba negativa, no como caso de exposición.' : 'Every one of the 15 methods has exactly 64 test results. Canonical presentation cases remain outside the ranking and the empty control stays a negative test, not a presentation case.'}</Callout>
      <Refs ids={['lin2014coco', 'aldrich2010']} label="Refs" />
    </div>
  );
}

function Ranking({ es, benchmark }: BenchmarkProps) {
  const [metric, setMetric] = useState<MetricKey>('mean_ap');
  if (!benchmark) return <Loading es={es} />;
  const lowerIsBetter = metric === 'mean_bsd_wasserstein' || metric === 'mean_d32_relative_error';
  const ranked = [...benchmark.methods]
    .filter((method) => metricValue(method.test, metric) != null)
    .sort((a, b) => {
      const delta = (metricValue(b.test, metric) ?? 0) - (metricValue(a.test, metric) ?? 0);
      return lowerIsBetter ? -delta : delta;
    });
  const data: BarDatum[] = ranked.map((method) => ({
    key: method.id,
    label: `${method.id} ${method.name}`,
    value: metricValue(method.test, metric) ?? 0,
    color: FAMILY_COLORS[method.tier],
  }));
  return (
    <div className="fs-benchmark-chapter">
      <BenchmarkLead n="02" title={es ? 'Cambie la métrica, cambie la pregunta' : 'Change the metric, change the question'} text={es ? 'AP favorece correspondencia estricta; AP50 tolera localización aproximada; PQ combina reconocimiento y solapamiento; frontera y morfometría revelan errores que el ranking principal puede ocultar.' : 'AP favors strict correspondence; AP50 tolerates approximate localization; PQ combines recognition and overlap; boundary and morphometry expose errors the primary ranking may hide.'} />
      <div className="fs-metric-picker">
        {([
          ['mean_ap', 'Mask AP'],
          ['mean_ap50', 'AP50'],
          ['mean_pq', 'PQ'],
          ['mean_boundary_fscore', 'Boundary F'],
          ['mean_bsd_wasserstein', 'BSD W1 ↓'],
          ['mean_d32_relative_error', 'd32 error ↓'],
        ] as Array<[MetricKey, string]>).map(([key, label]) => <button key={key} type="button" className={metric === key ? 'on' : ''} onClick={() => setMetric(key)}>{label}</button>)}
      </div>
      <PanelBoundary label={`ranking ${metric}`}>
        <BarChart data={data} ariaLabel={`${metric} by method`} valueFmt={(value) => value.toFixed(3)} defaultBaseline="zero" note={lowerIsBetter ? (es ? 'Menor es mejor para esta métrica.' : 'Lower is better for this metric.') : (es ? 'Mayor es mejor para esta métrica.' : 'Higher is better for this metric.')} />
      </PanelBoundary>
      <div className="fs-family-legend">
        {Object.entries(FAMILY_LABELS).map(([key, label]) => <span key={key}><i style={{ background: FAMILY_COLORS[key as MethodBenchmarkRow['tier']] }} />{es ? label.es : label.en}</span>)}
      </div>
      <div className="fs-ranking-notes">
        {ranked.slice(0, 4).map((method, index) => <article key={method.id}><span>{String(index + 1).padStart(2, '0')}</span><strong>{method.id} · {method.name}</strong><p>{metricExplanation(method, metric, es)}</p></article>)}
      </div>
      <Refs ids={['lin2014coco', 'villani2009ot', 'sautermean']} label="Refs" />
    </div>
  );
}

function ConditionAnalysis({ es, benchmark }: BenchmarkProps) {
  const [condition, setCondition] = useState('glare-storm');
  if (!benchmark) return <Loading es={es} />;
  const conditions = Object.keys(benchmark.methods.find((method) => method.test?.robustness_by_condition)?.test?.robustness_by_condition ?? {});
  const rows = benchmark.methods
    .map((method) => ({ method, value: method.test?.robustness_by_condition?.[condition]?.mean_ap ?? null, global: method.test?.mean_ap ?? 0 }))
    .filter((row): row is { method: MethodBenchmarkRow; value: number; global: number } => row.value != null)
    .sort((a, b) => b.value - a.value);
  const data: BarDatum[] = rows.map(({ method, value, global }) => ({
    key: method.id,
    label: `${method.id} ${method.name}`,
    value,
    color: value >= global ? 'var(--color-good)' : 'var(--color-warn)',
    sub: `global ${global.toFixed(2)}`,
  }));
  const winner = rows[0];
  return (
    <div className="fs-benchmark-chapter">
      <BenchmarkLead n="03" title={es ? 'La robustez es condicional, no absoluta' : 'Robustness is conditional, not absolute'} text={es ? 'Seleccione una perturbación para comparar el AP de cada método con su propio promedio global. Así se distingue una caída general de una sensibilidad específica.' : 'Select a perturbation to compare each method’s AP with its own global mean. This separates general weakness from condition-specific sensitivity.'} />
      <Equation tex={String.raw`\Delta_{m,c}=\mathrm{AP}_{m,c}-\overline{\mathrm{AP}}_m`} caption={es ? 'Cambio de AP del método m bajo la condición c respecto de su media.' : 'AP change for method m under condition c relative to its mean.'} />
      <label className="fs-inline-selector">{es ? 'Condición retenida' : 'Held-out condition'}
        <select value={condition} onChange={(event) => setCondition(event.target.value)}>
          {conditions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <div className="fs-condition-summary">
        <div><span>{es ? 'Mejor método' : 'Best method'}</span><strong>{winner?.method.id} · {winner?.method.name}</strong></div>
        <div><span>AP {condition}</span><strong>{winner?.value.toFixed(3)}</strong></div>
        <div><span>{es ? 'Cambio vs global' : 'Change vs global'}</span><strong>{winner ? signed(winner.value - winner.global) : '--'}</strong></div>
      </div>
      <PanelBoundary label={`condition ${condition}`}>
        <BarChart data={data} ariaLabel={`mask AP under ${condition}`} valueFmt={(value) => value.toFixed(3)} defaultBaseline="zero" note={es ? 'Verde: esta condición supera el promedio propio del método. Naranja: cae por debajo.' : 'Green: this condition exceeds the method’s own mean. Orange: it falls below it.'} />
      </PanelBoundary>
      <p>{conditionInterpretation(condition, es)}</p>
      <Refs ids={['aldrich2010', 'wang2018', 'fu2019']} label="Refs" />
    </div>
  );
}

function MorphometryAnalysis({ es, benchmark }: BenchmarkProps) {
  if (!benchmark) return <Loading es={es} />;
  const rows = benchmark.methods.filter((method) => method.test && method.test.mean_d32_relative_error != null);
  return (
    <div className="fs-benchmark-chapter">
      <BenchmarkLead n="04" title={es ? 'Una máscara útil debe conservar la distribución de tamaños' : 'A useful mask must preserve the size distribution'} text={es ? 'El diagrama cruza calidad de instancia con error relativo de d32. La zona deseada combina AP alto con error morfométrico bajo.' : 'The diagram crosses instance quality with relative d32 error. The desired region combines high AP with low morphometric error.'} />
      <Equation tex={String.raw`d_{32}=\frac{\sum_i d_i^3}{\sum_i d_i^2},\qquad \varepsilon_{32}=\frac{|\hat d_{32}-d_{32}|}{d_{32}}`} caption={es ? 'Media de Sauter y su error relativo.' : 'Sauter mean and its relative error.'} />
      <MetricScatter
        methods={rows}
        x={(method) => method.test!.mean_ap}
        y={(method) => method.test!.mean_d32_relative_error ?? 0}
        xDomain={[0, .6]}
        yDomain={[0, maxOr(rows.map((method) => method.test!.mean_d32_relative_error ?? 0), 1)]}
        xLabel="Mask AP →"
        yLabel={es ? 'Error relativo d32 →' : 'Relative d32 error →'}
        invertY
        es={es}
      />
      <div className="fs-morphometry-explain">
        <article><strong>{es ? 'Uniones' : 'Merges'}</strong><p>{es ? 'Reducen el conteo y desplazan d32 hacia tamaños mayores.' : 'Reduce count and shift d32 toward larger sizes.'}</p></article>
        <article><strong>{es ? 'Separaciones' : 'Splits'}</strong><p>{es ? 'Aumentan el conteo y desplazan la distribución hacia tamaños menores.' : 'Increase count and shift the distribution toward smaller sizes.'}</p></article>
        <article><strong>{es ? 'Borde desplazado' : 'Boundary offset'}</strong><p>{es ? 'Puede conservar identidad y aun sesgar área, circularidad y d32.' : 'Can preserve identity while biasing area, circularity, and d32.'}</p></article>
      </div>
      <p className="fs-note">{es ? 'Los diámetros están expresados en píxeles en el banco controlado. La conversión a milímetros requiere una escala física registrada por cámara.' : 'Diameters are expressed in pixels on the controlled benchmark. Conversion to millimeters requires a camera-specific recorded physical scale.'}</p>
      <Refs ids={['sautermean', 'villani2009ot', 'jahedsaravani2017']} label="Refs" />
    </div>
  );
}

function ComputeAnalysis({ es, benchmark }: BenchmarkProps) {
  if (!benchmark) return <Loading es={es} />;
  const rows = benchmark.methods.filter((method) => method.test && method.compute.mean_inference_ms > 0);
  const maxLatency = maxOr(rows.map((method) => method.compute.mean_inference_ms), 10);
  return (
    <div className="fs-benchmark-chapter">
      <BenchmarkLead n="05" title={es ? 'La frontera de calidad y costo' : 'The quality–cost frontier'} text={es ? 'Cada punto combina AP y latencia media. El tamaño representa memoria pico; el color identifica la familia. CPU y GPU se comparan como mediciones de sus runtimes declarados, no como hardware equivalente.' : 'Each point combines AP and mean latency. Size represents peak memory; color identifies the family. CPU and GPU are compared as measurements of their declared runtimes, not as equivalent hardware.'} />
      <Equation tex={String.raw`\mathcal P=\{m:\nexists m'\;(\mathrm{AP}_{m'}\ge\mathrm{AP}_m\land t_{m'}\le t_m)\}`} caption={es ? 'Frontera de Pareto: calidad mayor y latencia menor sin dominación.' : 'Pareto frontier: higher quality and lower latency without domination.'} />
      <MetricScatter
        methods={rows}
        x={(method) => method.compute.mean_inference_ms}
        y={(method) => method.test!.mean_ap}
        xDomain={[0, maxLatency]}
        yDomain={[0, .6]}
        xLabel={es ? 'Latencia media ms/imagen →' : 'Mean latency ms/image →'}
        yLabel="Mask AP →"
        logX
        bubble={(method) => Math.max(5, Math.min(18, 5 + Math.log10(method.compute.peak_memory_mib + 1) * 3))}
        es={es}
      />
      <div className="fs-compute-cards">
        {rows.sort((a, b) => a.compute.mean_inference_ms - b.compute.mean_inference_ms).slice(0, 5).map((method) => <article key={method.id}><span>{method.id}</span><strong>{method.compute.mean_inference_ms.toFixed(1)} ms</strong><p>{method.compute.hardware_lane.toUpperCase()} · {method.compute.peak_memory_mib.toFixed(0)} MiB · AP {method.test!.mean_ap.toFixed(3)}</p></article>)}
      </div>
      <p className="fs-note">{es ? 'La latencia no incluye transferencia de red ni decodificación de video. El p95 y la memoria pico permanecen en la matriz completa.' : 'Latency excludes network transfer and video decoding. p95 and peak memory remain available in the complete matrix.'}</p>
      <Refs ids={['transformersjs', 'onnxruntimeweb']} label="Refs" />
    </div>
  );
}

function CalibrationAnalysis({ es, benchmark }: BenchmarkProps) {
  if (!benchmark) return <Loading es={es} />;
  const calibrated = benchmark.methods.filter((method) => method.test?.mean_brier != null || method.test?.mean_ece != null);
  return (
    <div className="fs-benchmark-chapter">
      <BenchmarkLead n="06" title={es ? 'Confianza que corresponde con frecuencia de acierto' : 'Confidence that corresponds to empirical accuracy'} text={es ? 'La calibración usa una división independiente. Brier penaliza probabilidades equivocadas; ECE compara confianza y exactitud por intervalos.' : 'Calibration uses an independent split. Brier penalizes incorrect probabilities; ECE compares confidence and accuracy across bins.'} />
      <CalibrationDiagram es={es} />
      <Equation tex={String.raw`\mathrm{Brier}=\frac1N\sum_i(p_i-y_i)^2,\qquad ECE=\sum_b\frac{|b|}{N}|\mathrm{acc}(b)-\mathrm{conf}(b)|`} caption={es ? 'Puntuación probabilística y error de calibración por intervalos.' : 'Probability score and binned calibration error.'} />
      {calibrated.length ? (
        <div className="fs-calibration-methods">
          {calibrated.map((method) => <article key={method.id}><div><span>{method.id}</span><strong>{method.name}</strong></div><div><small>Brier ↓</small><b>{fmt(method.test?.mean_brier)}</b></div><div><small>ECE ↓</small><b>{fmt(method.test?.mean_ece)}</b></div></article>)}
        </div>
      ) : <p className="fs-note">{es ? 'Los métodos sin probabilidades calibrables no reciben una cifra inventada. Sus parámetros de umbral se muestran como decisiones operativas, no como incertidumbre.' : 'Methods without calibratable probabilities do not receive an invented score. Their thresholds are shown as operating decisions, not uncertainty.'}</p>}
      <h3>{es ? 'Por qué importa' : 'Why it matters'}</h3>
      <p>{es ? 'Una confianza de 0.8 debería corresponder aproximadamente a ocho aciertos de cada diez bajo el dominio calibrado. Sin esa relación, un umbral de alarma o rechazo no tiene significado probabilístico.' : 'A confidence of 0.8 should correspond to approximately eight correct outcomes out of ten within the calibrated domain. Without that relationship, an alarm or rejection threshold has no probabilistic meaning.'}</p>
      <Refs ids={['brier1950']} label="Refs" />
    </div>
  );
}

function CompleteMatrix({ es, benchmark }: BenchmarkProps) {
  const [selectedId, setSelectedId] = useState('L5');
  if (!benchmark) return <Loading es={es} />;
  const selected = benchmark.methods.find((method) => method.id === selectedId) ?? benchmark.methods[0];
  return (
    <div className="fs-benchmark-chapter">
      <BenchmarkLead n="07" title={es ? 'Todos los valores, sin convertirlos en portada' : 'Every value, without turning it into the front page'} text={es ? 'La matriz sirve para auditoría y exportación. Seleccione una fila para obtener una lectura técnica compacta debajo.' : 'The matrix supports audit and export. Select a row to obtain a compact technical reading below.'} />
      <div className="fs-matrix-scroll">
        <table className="fs-table fs-benchmark-matrix">
          <thead><tr><th>ID</th><th>{es ? 'método' : 'method'}</th><th>{es ? 'familia' : 'family'}</th><th className="num">AP</th><th className="num">AP50</th><th className="num">PQ</th><th className="num">Boundary F</th><th className="num">BSD W1</th><th className="num">d32 err.</th><th className="num">ms</th><th className="num">p95</th><th className="num">MiB</th></tr></thead>
          <tbody>{benchmark.methods.map((method) => <tr key={method.id} className={selectedId === method.id ? 'fs-selected-row' : ''} onClick={() => setSelectedId(method.id)}><td><button type="button" className="fs-method-pick">{method.id}</button></td><td>{method.name}</td><td>{es ? FAMILY_LABELS[method.tier].es : FAMILY_LABELS[method.tier].en}</td><td className="num">{fmt(method.test?.mean_ap)}</td><td className="num">{fmt(method.test?.mean_ap50)}</td><td className="num">{fmt(method.test?.mean_pq)}</td><td className="num">{fmt(method.test?.mean_boundary_fscore)}</td><td className="num">{fmt(method.test?.mean_bsd_wasserstein)}</td><td className="num">{fmt(method.test?.mean_d32_relative_error)}</td><td className="num">{fmt(method.compute.mean_inference_ms, 1)}</td><td className="num">{fmt(method.compute.p95_inference_ms, 1)}</td><td className="num">{fmt(method.compute.peak_memory_mib, 0)}</td></tr>)}</tbody>
        </table>
      </div>
      <MethodReading method={selected} es={es} />
      <Refs ids={['lin2014coco', 'sautermean', 'villani2009ot']} label="Refs" />
    </div>
  );
}

function Scope({ es, benchmark }: BenchmarkProps) {
  if (!benchmark) return <Loading es={es} />;
  return (
    <div className="fs-benchmark-chapter">
      <BenchmarkLead n="08" title={es ? 'Lo que este benchmark permite afirmar' : 'What this benchmark supports'} text={es ? 'La evidencia establece una comparación reproducible dentro de un banco controlado. No reemplaza validación externa ni convierte una diferencia sintética en rendimiento industrial.' : 'The evidence establishes a reproducible comparison within a controlled benchmark. It does not replace external validation or turn a synthetic difference into industrial performance.'} />
      <Equation tex={String.raw`\mathrm{claim}\subseteq\mathrm{protocol}\times\mathrm{data}\times\mathrm{metrics}`} caption={es ? 'Una afirmación no puede exceder el protocolo, los datos ni las métricas que la sostienen.' : 'A claim cannot exceed the protocol, data, or metrics that support it.'} />
      <ClaimBoundaryDiagram es={es} />
      <div className="fs-scope-columns">
        <article className="supported"><span>✓</span><div><strong>{es ? 'Sostenido por la evidencia' : 'Supported by the evidence'}</strong><ul><li>{es ? '15 implementaciones bajo el mismo test.' : '15 implementations under the same test.'}</li><li>{es ? 'Ranking, robustez, morfometría y costo medidos.' : 'Measured ranking, robustness, morphometry, and compute.'}</li><li>{es ? 'LamellaStar lidera este banco con AP 0,519; Cellpose-SAM sigue con 0,510.' : 'LamellaStar leads this benchmark at AP 0.519; Cellpose-SAM follows at 0.510.'}</li><li>{es ? 'Cinco métodos superan el umbral AP 0.30.' : 'Five methods exceed the AP 0.30 threshold.'}</li></ul></div></article>
        <article className="unsupported"><span>×</span><div><strong>{es ? 'No sostenido todavía' : 'Not supported yet'}</strong><ul><li>{es ? 'Exactitud representativa en una planta.' : 'Representative accuracy at a plant.'}</li><li>{es ? 'Transferencia entre cámaras, minerales o circuitos.' : 'Transfer across cameras, ores, or circuits.'}</li><li>{es ? 'Calibración física universal de tamaños.' : 'Universal physical size calibration.'}</li><li>{es ? 'Superioridad fuera de este protocolo.' : 'Superiority outside this protocol.'}</li></ul></div></article>
      </div>
      <h3>{es ? 'Resultado de investigación' : 'Research result'}</h3>
      <p>{es ? 'Tres estudios preregistrados llevaron LamellaStar a AP 0,519, por delante de Cellpose-SAM (0,510). El tercero refutó su propia hipótesis: entrenar más no cierra la brecha, y promediar semillas sí, porque suprime una dispersión (0,037) mayor que la brecha misma. El banco es sintético y la línea base tuvo dos pasadas de ajuste, así que beyond_sota_claim sigue en false.' : 'Three preregistered studies took LamellaStar to AP 0.519, ahead of Cellpose-SAM at 0.510. The third refuted its own hypothesis: training longer does not close the gap, averaging seeds does, because it suppresses a spread (0.037) larger than the gap itself. The benchmark is synthetic and the baseline had a two-pass fine-tuning budget, so beyond_sota_claim remains false.'}</p>
      <Refs ids={['lin2014coco', 'aldrich2010', 'meyer1994', 'achanta2012slic']} label="Refs" />
    </div>
  );
}

function BenchmarkLandscape({ methods, threshold, es }: { methods: MethodBenchmarkRow[]; threshold: number; es: boolean }) {
  const width = 600;
  const height = 300;
  const max = .6;
  return (
    <figure className="fs-landscape">
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        {[0, .1, .2, .3, .4, .5, .6].map((tick) => <g key={tick}><line x1="95" x2="575" y1={250 - tick / max * 215} y2={250 - tick / max * 215} /><text x="82" y={254 - tick / max * 215} textAnchor="end">{tick.toFixed(1)}</text></g>)}
        <line className="threshold" x1="95" x2="575" y1={250 - threshold / max * 215} y2={250 - threshold / max * 215} />
        {methods.slice(0, 10).map((method, index) => {
          const x = 115 + index * 48;
          const y = 250 - (method.test?.mean_ap ?? 0) / max * 215;
          return <g key={method.id}><line className="stem" x1={x} x2={x} y1="250" y2={y} /><circle cx={x} cy={y} r="8" style={{ fill: FAMILY_COLORS[method.tier] }} /><text x={x} y="271" textAnchor="middle">{method.id}</text></g>;
        })}
        <text x="575" y={250 - threshold / max * 215 - 7} textAnchor="end" className="threshold-label">{es ? 'umbral 0.30' : 'threshold 0.30'}</text>
      </svg>
    </figure>
  );
}

function MetricScatter({ methods, x, y, xDomain, yDomain, xLabel, yLabel, invertY = false, logX = false, bubble, es }: {
  methods: MethodBenchmarkRow[];
  x: (method: MethodBenchmarkRow) => number;
  y: (method: MethodBenchmarkRow) => number;
  xDomain: [number, number];
  yDomain: [number, number];
  xLabel: string;
  yLabel: string;
  invertY?: boolean;
  logX?: boolean;
  bubble?: (method: MethodBenchmarkRow) => number;
  es: boolean;
}) {
  const mapX = (value: number) => {
    if (logX) {
      const min = Math.log10(Math.max(.1, xDomain[0] || .1));
      const max = Math.log10(Math.max(.2, xDomain[1]));
      return 85 + (Math.log10(Math.max(.1, value)) - min) / (max - min) * 790;
    }
    return 85 + (value - xDomain[0]) / Math.max(.0001, xDomain[1] - xDomain[0]) * 790;
  };
  const mapY = (value: number) => {
    const ratio = (value - yDomain[0]) / Math.max(.0001, yDomain[1] - yDomain[0]);
    return invertY ? 55 + ratio * 350 : 405 - ratio * 350;
  };
  return (
    <figure className="fs-metric-scatter">
      <svg viewBox="0 0 980 480" role="img">
        <line x1="85" y1="405" x2="900" y2="405" /><line x1="85" y1="45" x2="85" y2="405" />
        <text x="492" y="458" textAnchor="middle">{xLabel}</text>
        <text x="22" y="225" textAnchor="middle" transform="rotate(-90 22 225)">{yLabel}</text>
        <rect x="85" y="45" width="815" height="360" className="plot-bg" />
        {methods.map((method) => {
          const px = mapX(x(method));
          const py = mapY(y(method));
          const r = bubble?.(method) ?? 8;
          return <g key={method.id}><circle cx={px} cy={py} r={r} style={{ fill: FAMILY_COLORS[method.tier] }}><title>{`${method.id} ${method.name}\nX ${x(method).toFixed(3)} · Y ${y(method).toFixed(3)}`}</title></circle><text x={px} y={py - r - 5} textAnchor="middle">{method.id}</text></g>;
        })}
        <text x="900" y="30" textAnchor="end" className="hint">{es ? 'pase el cursor para valores' : 'hover for values'}</text>
      </svg>
    </figure>
  );
}

function CalibrationDiagram({ es }: { es: boolean }) {
  return (
    <figure className="fs-calibration-diagram">
      <svg viewBox="0 0 900 350" role="img">
        <line x1="90" y1="285" x2="810" y2="285" /><line x1="90" y1="45" x2="90" y2="285" />
        <line className="ideal" x1="90" y1="285" x2="810" y2="45" />
        <path className="observed" d="M90 285 L162 273 L234 248 L306 230 L378 196 L450 177 L522 147 L594 124 L666 91 L738 70 L810 55" />
        {[0, .2, .4, .6, .8, 1].map((tick) => <g key={tick}><text x={90 + tick * 720} y="310" textAnchor="middle">{tick.toFixed(1)}</text><text x="76" y={289 - tick * 240} textAnchor="end">{tick.toFixed(1)}</text></g>)}
        <text x="450" y="338" textAnchor="middle">{es ? 'confianza predicha' : 'predicted confidence'}</text>
        <text x="25" y="165" textAnchor="middle" transform="rotate(-90 25 165)">{es ? 'frecuencia empírica' : 'empirical frequency'}</text>
        <text x="705" y="112" className="ideal-label">{es ? 'calibración perfecta' : 'perfect calibration'}</text>
      </svg>
    </figure>
  );
}

function MethodReading({ method, es }: { method: MethodBenchmarkRow; es: boolean }) {
  return (
    <div className="fs-method-reading">
      <div><span>{method.id}</span><strong>{method.name}</strong><small>{es ? FAMILY_LABELS[method.tier].es : FAMILY_LABELS[method.tier].en} · {method.engine}</small></div>
      <p>{metricExplanation(method, 'mean_ap', es)} {es ? `Se ejecutó en ${method.compute.hardware_lane.toUpperCase()} (${method.compute.device}) y registró ${method.compute.mean_inference_ms.toFixed(1)} ms por imagen.` : `It ran on ${method.compute.hardware_lane.toUpperCase()} (${method.compute.device}) and recorded ${method.compute.mean_inference_ms.toFixed(1)} ms per image.`}</p>
    </div>
  );
}

function ClaimBoundaryDiagram({ es }: { es: boolean }) {
  return (
    <figure className="fs-claim-diagram">
      <svg viewBox="0 0 1000 300" role="img">
        <defs><marker id="claim-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker></defs>
        <g className="supported"><rect x="30" y="65" width="265" height="150" rx="18" /><text x="162" y="105" textAnchor="middle">{es ? 'BANCO CONTROLADO' : 'CONTROLLED BENCHMARK'}</text><text x="162" y="143" textAnchor="middle">15 × 64 · exact truth</text><text x="162" y="177" textAnchor="middle" className="small">AP · PQ · BSD · compute</text></g>
        <path d="M295 140 H430" markerEnd="url(#claim-arrow)" />
        <g className="gate"><path d="M430 45 H610 L650 140 L610 235 H430 L390 140Z" /><text x="520" y="119" textAnchor="middle">{es ? 'VALIDACIÓN EXTERNA' : 'EXTERNAL VALIDATION'}</text><text x="520" y="151" textAnchor="middle" className="small">{es ? 'datos licenciados + expertos' : 'licensed data + experts'}</text><text x="520" y="175" textAnchor="middle" className="small">{es ? 'escala + protocolo bloqueado' : 'scale + locked protocol'}</text></g>
        <path d="M650 140 H785" markerEnd="url(#claim-arrow)" />
        <g className="plant"><rect x="785" y="65" width="185" height="150" rx="18" /><text x="878" y="105" textAnchor="middle">{es ? 'AFIRMACIÓN' : 'CLAIM'}</text><text x="878" y="143" textAnchor="middle">{es ? 'DE PLANTA' : 'AT PLANT'}</text><text x="878" y="178" textAnchor="middle" className="blocked">{es ? 'NO EVALUADA' : 'NOT EVALUATED'}</text></g>
      </svg>
    </figure>
  );
}

function BenchmarkLead({ n, title, text }: { n: string; title: string; text: string }) {
  return <div className="fs-chapter-lead"><span>{n}</span><div><h2>{title}</h2><p>{text}</p></div></div>;
}

function Loading({ es }: { es: boolean }) {
  return <p className="fs-hint"><span className="fs-spinner" /> {es ? 'Cargando evidencia…' : 'Loading evidence…'}</p>;
}

interface BenchmarkProps { es: boolean; benchmark: MethodBenchmarkDoc | null }

function rankBy(methods: MethodBenchmarkRow[], metric: MetricKey): MethodBenchmarkRow[] {
  return [...methods].filter((method) => metricValue(method.test, metric) != null).sort((a, b) => (metricValue(b.test, metric) ?? 0) - (metricValue(a.test, metric) ?? 0));
}

function metricValue(summary: MethodMetricSummary | null, metric: MetricKey): number | null {
  if (!summary) return null;
  const value = summary[metric];
  return typeof value === 'number' ? value : null;
}

function metricExplanation(method: MethodBenchmarkRow, metric: MetricKey, es: boolean): string {
  const value = metricValue(method.test, metric);
  const metricName: Record<MetricKey, string> = { mean_ap: 'AP', mean_ap50: 'AP50', mean_pq: 'PQ', mean_boundary_fscore: 'Boundary F', mean_bsd_wasserstein: 'BSD W1', mean_d32_relative_error: 'd32 error' };
  const family = es ? FAMILY_LABELS[method.tier].es : FAMILY_LABELS[method.tier].en;
  return es ? `${family}. ${metricName[metric]} ${value?.toFixed(3) ?? '--'} sobre 64 muestras retenidas.` : `${family}. ${metricName[metric]} ${value?.toFixed(3) ?? '--'} across 64 held-out samples.`;
}

function conditionInterpretation(condition: string, es: boolean): string {
  const map: Record<string, [string, string]> = {
    'glare-storm': ['El brillo especular elimina o duplica evidencia de lamela; favorece representaciones con contexto y penaliza semillas basadas solo en máximos.', 'Specular glare removes or duplicates lamella evidence; it favors contextual representations and penalizes markers based only on maxima.'],
    'motion-fast': ['El movimiento difumina fronteras en la dirección del flujo y reduce máximos locales confiables.', 'Motion smears boundaries along the flow direction and reduces reliable local maxima.'],
    'microbubble-cloud': ['La densidad extrema aproxima centros, aumenta competencia entre marcadores y amplifica el filtrado por tamaño.', 'Extreme density brings centers together, increases marker competition, and amplifies size filtering.'],
    'low-light-noise': ['El bajo contraste reduce separación foreground/fondo; el ruido introduce mínimos y bordes falsos.', 'Low contrast reduces foreground/background separation; noise introduces false minima and boundaries.'],
  };
  return map[condition]?.[es ? 0 : 1] ?? (es ? 'Esta vista separa la respuesta a la condición del promedio global de cada método.' : 'This view separates the response to the condition from each method’s global mean.');
}

function fmt(value: number | null | undefined, digits = 3): string {
  return value == null ? '--' : value.toFixed(digits);
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;
}

function maxOr(values: number[], fallback: number): number {
  return values.length ? Math.max(fallback, ...values) : fallback;
}
