import { useEffect, useMemo, useState } from 'react';
import { Refs, SubTabs, useShellLang } from '@fasl-work/caos-app-shell';
import {
  artifactUrl, loadMasks, loadMethodBenchmark, loadSamBenchmark, loadTemporalBenchmark,
} from '../api/artifacts';
import type {
  MethodBenchmarkDoc, MethodBenchmarkRow, SamBenchmarkDoc, SamCaseScore, TemporalBenchmarkDoc,
} from '../lib/contract.types';
import { decodeLabels } from '../lib/rle';
import { BarChart, type BarDatum } from '../viz/BarChart';
import { MaskOverlay } from '../viz/MaskOverlay';
import { PanelBoundary } from '../viz/PanelBoundary';

export default function Experiments() {
  const es = useShellLang() === 'es';
  const [methods, setMethods] = useState<MethodBenchmarkDoc | null>(null);
  const [temporal, setTemporal] = useState<TemporalBenchmarkDoc | null>(null);
  const [sam, setSam] = useState<SamBenchmarkDoc | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([loadMethodBenchmark(), loadTemporalBenchmark(), loadSamBenchmark()])
      .then(([methodDoc, temporalDoc, samDoc]) => {
        setMethods(methodDoc);
        setTemporal(temporalDoc);
        setSam(samDoc);
      })
      .catch((reason: unknown) => setError(String(reason)));
  }, []);

  const tabs = [
    { id: 'design', label: es ? 'Diseño' : 'Design', content: <ExperimentalDesign es={es} /> },
    { id: 'studies', label: es ? 'Estudios' : 'Studies', content: <RegisteredStudies es={es} methods={methods} /> },
    { id: 'robustness', label: es ? 'Robustez' : 'Robustness', content: <Robustness es={es} methods={methods} /> },
    { id: 'temporal', label: es ? 'Temporal' : 'Temporal', content: <TemporalStudy es={es} temporal={temporal} /> },
    { id: 'errors', label: es ? 'Anatomía del error' : 'Error anatomy', content: <ErrorAnatomy es={es} methods={methods} /> },
    { id: 'sam-study', label: es ? 'Estudio de prompts' : 'Prompt study', content: <SamStudy es={es} benchmark={sam} /> },
    { id: 'provenance', label: es ? 'Proveniencia' : 'Provenance', content: <ExperimentProvenance es={es} methods={methods} temporal={temporal} /> },
  ];

  return (
    <div className="page-body prose fs-science-page">
      <header className="page-head fs-science-head">
        <span className="eyebrow">{es ? 'Diseño experimental y análisis' : 'Experimental design and analysis'}</span>
        <h1>{es ? 'Experimentos que aíslan causas, no solo resultados' : 'Experiments that isolate causes, not only scores'}</h1>
        <p className="lede">
          {es
            ? 'La matriz experimental separa familias de método, degradaciones visuales, dinámica temporal y costo computacional para explicar por qué cada sistema acierta o falla.'
            : 'The experimental matrix separates method families, visual degradations, temporal dynamics, and compute cost to explain why each system succeeds or fails.'}
        </p>
      </header>
      {error && <p className="fs-note">error: {error}</p>}
      {!methods && !error && <p><span className="fs-spinner" /> {es ? 'Cargando evidencia experimental…' : 'Loading experimental evidence…'}</p>}
      <section><SubTabs tabs={tabs} ariaLabel={es ? 'Capítulos experimentales' : 'Experiment chapters'} /></section>
    </div>
  );
}

function ExperimentalDesign({ es }: { es: boolean }) {
  return (
    <div className="fs-experiment-chapter">
      <ExperimentLead n="01" title={es ? 'Una matriz factorial con verdad exacta' : 'A factorial matrix with exact truth'} text={es ? 'La geometría de burbujas, la apariencia y las degradaciones se controlan por separado. Esto permite atribuir una caída de calidad a una condición y no a un cambio oculto de contenido.' : 'Bubble geometry, appearance, and degradations are controlled separately. This makes it possible to attribute a quality drop to a condition rather than to a hidden content change.'} />
      <ExperimentMatrixDiagram es={es} />
      <div className="fs-experiment-facts">
        <article><span>16</span><strong>{es ? 'condiciones' : 'conditions'}</strong><p>{es ? 'Espuma, óptica, movimiento y compuestos.' : 'Froth, optics, motion, and compounds.'}</p></article>
        <article><span>12</span><strong>{es ? 'grupos / condición' : 'groups / condition'}</strong><p>{es ? 'Geometrías latentes independientes.' : 'Independent latent geometries.'}</p></article>
        <article><span>2</span><strong>{es ? 'apariencias / grupo' : 'appearances / group'}</strong><p>{es ? 'Variación sin fuga de geometría.' : 'Variation without geometry leakage.'}</p></article>
        <article><span>15</span><strong>{es ? 'métodos' : 'methods'}</strong><p>{es ? 'Mismo test, salida y evaluador.' : 'Same test, output, and evaluator.'}</p></article>
      </div>
      <h3>{es ? 'Preguntas predefinidas' : 'Predefined questions'}</h3>
      <ol className="fs-research-questions">
        <li><span>Q1</span><p>{es ? '¿Qué señal clásica separa mejor burbujas en contacto: intensidad, gradiente, distancia o valles de lamela?' : 'Which classical signal best separates touching bubbles: intensity, gradient, distance, or lamella valleys?'}</p></li>
        <li><span>Q2</span><p>{es ? '¿Los campos aprendidos de borde y distancia superan los marcadores hechos a mano?' : 'Do learned boundary and distance fields outperform hand-crafted markers?'}</p></li>
        <li><span>Q3</span><p>{es ? '¿La preinicialización fundacional mejora el AP sin destruir fidelidad morfométrica?' : 'Does foundation pretraining improve AP without damaging morphometric fidelity?'}</p></li>
        <li><span>Q4</span><p>{es ? '¿Qué condiciones causan uniones, separaciones, pérdida de frontera o pérdida de identidad temporal?' : 'Which conditions cause merges, splits, boundary loss, or temporal identity loss?'}</p></li>
      </ol>
      <p className="fs-note good">{es ? 'La unidad de comparación principal es la muestra retenida. El caso canónico es una herramienta visual, no una réplica adicional del test.' : 'The primary comparison unit is the held-out sample. A canonical case is a visual diagnostic tool, not an extra test replicate.'}</p>
    </div>
  );
}

function RegisteredStudies({ es, methods }: { es: boolean; methods: MethodBenchmarkDoc | null }) {
  const leader = methods?.current_bar.leader;
  const groups = [
    ['E1', 'C1–C7', es ? 'Señal física y postproceso' : 'Physical signal and post-processing', es ? 'Umbral, inmersión, marcadores, distancia, H-minima, superpíxeles y valles.' : 'Threshold, immersion, markers, distance, H-minima, superpixels, and valleys.'],
    ['E2', 'L1–L3', es ? 'Representación densa' : 'Dense representation', es ? 'Foreground/borde/distancia frente a contexto global y marcadores profundos.' : 'Foreground/boundary/distance versus global context and deep markers.'],
    ['E3', 'L4–L7', es ? 'Geometría y preentrenamiento' : 'Geometry and pretraining', es ? 'Star-convex, detector de instancias y dos familias fundacionales.' : 'Star-convex, instance detector, and two foundation families.'],
    ['E4', 'N1', es ? 'Hipótesis de centro y lamela' : 'Center and lamella hypothesis', es ? 'Ablación de evidencia central, compuertas y postproceso.' : 'Ablation of center evidence, gates, and post-processing.'],
    ['E5', 'L1 · L7', es ? 'Consistencia temporal' : 'Temporal consistency', es ? 'Asociación cuadro a cuadro frente a propagación con memoria.' : 'Framewise association versus memory-based propagation.'],
    ['E6', 'C1–N1', es ? 'Costo y despliegue' : 'Cost and deployment', es ? 'Latencia, p95, memoria pico, tamaño y dispositivo.' : 'Latency, p95, peak memory, size, and device.'],
  ];
  return (
    <div className="fs-experiment-chapter">
      <ExperimentLead n="02" title={es ? 'Seis estudios conectados por un test común' : 'Six studies connected by a common test'} text={es ? 'Cada estudio cambia una familia de decisiones y conserva el resto del protocolo. Los resultados completos permanecen disponibles incluso cuando una hipótesis falla.' : 'Each study changes one family of decisions while preserving the rest of the protocol. Complete results remain available even when a hypothesis fails.'} />
      <div className="fs-study-map">
        {groups.map(([id, methodsLabel, title, description]) => <article key={id}><span>{id}</span><div><small>{methodsLabel}</small><strong>{title}</strong><p>{description}</p></div></article>)}
      </div>
      {methods && (
        <div className="fs-study-result">
          <div><span>{es ? 'comparaciones observadas' : 'observed comparisons'}</span><strong>{methods.coverage.observed_cells}</strong></div>
          <div><span>{es ? 'cobertura' : 'coverage'}</span><strong>{methods.coverage.complete ? '100%' : 'incomplete'}</strong></div>
          <div><span>{es ? 'mejor AP retenido' : 'best held-out AP'}</span><strong>{leader ? `${leader.id} · ${leader.mean_ap.toFixed(3)}` : '—'}</strong></div>
        </div>
      )}
      <p>{es ? 'Los resultados no se reducen a “ganó/perdió”. Por ejemplo, un método puede mejorar AP y empeorar distribución de tamaños, o conservar fronteras y fallar en conteo. Los capítulos de Robustez y Anatomía del error exponen esas diferencias.' : 'Results are not reduced to “won/lost.” A method may improve AP while worsening the size distribution, or preserve boundaries while failing at count. The Robustness and Error anatomy chapters expose those differences.'}</p>
    </div>
  );
}

function Robustness({ es, methods }: { es: boolean; methods: MethodBenchmarkDoc | null }) {
  const conditions = useMemo(() => {
    const first = methods?.methods.find((method) => method.test?.robustness_by_condition)?.test?.robustness_by_condition;
    return first ? Object.keys(first) : [];
  }, [methods]);
  const rows = methods?.methods.filter((method) => method.test?.robustness_by_condition) ?? [];
  if (!methods) return <Loading es={es} />;
  return (
    <div className="fs-experiment-chapter">
      <ExperimentLead n="03" title={es ? 'El promedio esconde la condición que rompe el método' : 'The average hides the condition that breaks a method'} text={es ? 'El mapa muestra AP por condición para los 15 métodos. Lea horizontalmente para estudiar robustez de un método y verticalmente para comparar soluciones bajo una perturbación.' : 'The map shows AP by condition for all 15 methods. Read horizontally to study one method’s robustness and vertically to compare solutions under one perturbation.'} />
      <div className="fs-heatmap-legend"><span>AP 0.00</span><i /><i /><i /><i /><i /><span>AP 0.70+</span></div>
      <div className="fs-robustness-scroll">
        <div className="fs-robustness-map" style={{ gridTemplateColumns: `175px repeat(${conditions.length}, 42px)` }}>
          <div />
          {conditions.map((condition) => <div key={condition} className="fs-condition-label"><span>{shortCondition(condition)}</span></div>)}
          {rows.map((method) => (
            <RobustnessRow key={method.id} method={method} conditions={conditions} />
          ))}
        </div>
      </div>
      <div className="fs-robustness-reading">
        <article><strong>{es ? 'Brillo y movimiento' : 'Glare and motion'}</strong><p>{es ? 'Prueban estabilidad de textura y recuperación de lamelas débiles.' : 'Test texture stability and weak-lamella recovery.'}</p></article>
        <article><strong>{es ? 'Microburbujas' : 'Microbubbles'}</strong><p>{es ? 'Prueban resolución, marcadores cercanos y supresión de objetos.' : 'Test resolution, close markers, and object suppression.'}</p></article>
        <article><strong>{es ? 'Espuma gruesa' : 'Coarse froth'}</strong><p>{es ? 'Prueba forma no circular, borde parcial y contexto amplio.' : 'Tests non-circular shape, partial boundary, and wide context.'}</p></article>
        <article><strong>{es ? 'Bimodalidad' : 'Bimodality'}</strong><p>{es ? 'Prueba si un único parámetro de escala puede cubrir dos poblaciones.' : 'Tests whether one scale parameter can cover two populations.'}</p></article>
      </div>
    </div>
  );
}

function RobustnessRow({ method, conditions }: { method: MethodBenchmarkRow; conditions: string[] }) {
  const values = method.test?.robustness_by_condition ?? {};
  return (
    <>
      <div className="fs-method-label"><strong>{method.id}</strong><span>{method.name}</span></div>
      {conditions.map((condition) => {
        const value = values[condition]?.mean_ap ?? 0;
        return <div key={`${method.id}-${condition}`} className="fs-heat-cell" style={{ '--heat': heatColor(value) } as React.CSSProperties} title={`${method.id} · ${condition}: AP ${value.toFixed(3)}`}><span>{value.toFixed(2)}</span></div>;
      })}
    </>
  );
}

function TemporalStudy({ es, temporal }: { es: boolean; temporal: TemporalBenchmarkDoc | null }) {
  if (!temporal) return <Loading es={es} />;
  return (
    <div className="fs-experiment-chapter">
      <ExperimentLead n="04" title={es ? 'Separar detección de asociación' : 'Separate detection from association'} text={es ? 'Una máscara correcta en cada cuadro no garantiza una trayectoria correcta. El experimento temporal mide explícitamente si una identidad se mantiene, desaparece, se fragmenta o cambia.' : 'A correct mask in every frame does not guarantee a correct track. The temporal experiment explicitly measures whether an identity persists, disappears, fragments, or switches.'} />
      <TemporalExperimentDiagram es={es} />
      <div className="fs-temporal-results">
        <article><span>IDF1</span><strong>{temporal.mean_idf1.toFixed(3)}</strong><p>{es ? 'identidad global' : 'global identity'}</p></article>
        <article><span>HOTA</span><strong>{temporal.mean_hota.toFixed(3)}</strong><p>{es ? 'detección × asociación' : 'detection × association'}</p></article>
        <article><span>Flow EPE</span><strong>{temporal.mean_flow_epe_px.toFixed(2)} px</strong><p>{es ? 'error de movimiento' : 'motion error'}</p></article>
        <article><span>{es ? 'Fragmentaciones' : 'Fragmentations'}</span><strong>{temporal.total_track_fragmentations}</strong><p>{es ? 'sobre 40 cuadros' : 'across 40 frames'}</p></article>
      </div>
      <div className="fs-sequence-strips">
        {temporal.sequences.map((sequence) => (
          <article key={sequence.condition_id}>
            <div><strong>{sequence.condition_id}</strong><span>{sequence.frames} {es ? 'cuadros' : 'frames'}</span></div>
            <div className="fs-sequence-meter"><i style={{ width: `${sequence.idf1 * 100}%` }} /></div>
            <span>IDF1 {sequence.idf1.toFixed(3)} · HOTA {sequence.hota.toFixed(3)} · {sequence.track_fragmentations} {es ? 'fragmentos' : 'fragments'}</span>
          </article>
        ))}
      </div>
      <p className="fs-note">{es ? 'SAM 2.1 se evalúa en un protocolo distinto: recibe doce máscaras exactas en el primer cuadro y propaga esas identidades. Ese resultado mide propagación, no descubrimiento automático.' : 'SAM 2.1 is evaluated under a different protocol: it receives twelve exact masks on the first frame and propagates those identities. That result measures propagation, not automatic discovery.'}</p>
    </div>
  );
}

function ErrorAnatomy({ es, methods }: { es: boolean; methods: MethodBenchmarkDoc | null }) {
  const [selectedId, setSelectedId] = useState('L5');
  const selected = methods?.methods.find((method) => method.id === selectedId) ?? null;
  if (!methods || !selected?.test) return <Loading es={es} />;
  const test = selected.test;
  const countBias = test.mean_count_relative_error ?? 0;
  const sizeBias = test.mean_d32_relative_error ?? 0;
  return (
    <div className="fs-experiment-chapter">
      <ExperimentLead n="05" title={es ? 'Un AP no explica qué salió mal' : 'AP does not explain what went wrong'} text={es ? 'Seleccione un método para leer su error como una cadena causal: detección de instancia, frontera, conteo y distribución de tamaño.' : 'Select a method to read its error as a causal chain: instance detection, boundary, count, and size distribution.'} />
      <label className="fs-inline-selector">{es ? 'Método analizado' : 'Analyzed method'}
        <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          {methods.methods.map((method) => <option key={method.id} value={method.id}>{method.id} · {method.name}</option>)}
        </select>
      </label>
      <div className="fs-error-chain">
        <ErrorStage label="AP" value={test.mean_ap} status={quality(test.mean_ap, .3, .5)} text={es ? 'correspondencia de instancias' : 'instance correspondence'} />
        <ErrorStage label="Boundary F" value={test.mean_boundary_fscore ?? 0} status={quality(test.mean_boundary_fscore ?? 0, .8, .93)} text={es ? 'fidelidad de lamela' : 'lamella fidelity'} />
        <ErrorStage label={es ? 'Error de conteo' : 'Count error'} value={countBias} status={inverseQuality(countBias, .3, .12)} text={es ? 'sesgo en número de burbujas' : 'bubble-count bias'} inverse />
        <ErrorStage label="D32 error" value={sizeBias} status={inverseQuality(sizeBias, .3, .12)} text={es ? 'sesgo de tamaño de proceso' : 'process-size bias'} inverse />
        <ErrorStage label="BSD W1" value={test.mean_bsd_wasserstein ?? 0} status={inverseQuality(test.mean_bsd_wasserstein ?? 0, 4, 1.5)} text={es ? 'distancia entre distribuciones' : 'distribution distance'} inverse />
      </div>
      <div className="fs-causal-reading">
        <strong>{selected.id} · {selected.name}</strong>
        <p>{explainError(selected, es)}</p>
      </div>
      {test.micro && (
        <div className="fs-confusion-flow">
          <div><span>GT</span><strong>{test.micro.nGt.toLocaleString()}</strong></div>
          <div className="good"><span>TP</span><strong>{test.micro.tp.toLocaleString()}</strong></div>
          <div className="bad"><span>FN</span><strong>{test.micro.fn.toLocaleString()}</strong></div>
          <div className="bad"><span>FP</span><strong>{test.micro.fp.toLocaleString()}</strong></div>
          <div><span>F1</span><strong>{test.micro.instance_f1.toFixed(3)}</strong></div>
        </div>
      )}
    </div>
  );
}

function SamStudy({ es, benchmark }: { es: boolean; benchmark: SamBenchmarkDoc | null }) {
  const [selected, setSelected] = useState('');
  const [groundTruth, setGroundTruth] = useState<{ labels: Int32Array; w: number; h: number } | null>(null);
  useEffect(() => {
    if (benchmark && !selected) setSelected(benchmark.cases[0]?.case_id ?? '');
  }, [benchmark, selected]);
  useEffect(() => {
    if (!selected) return;
    setGroundTruth(null);
    loadMasks(selected)
      .then((doc) => setGroundTruth({ labels: decodeLabels(doc), w: doc.width, h: doc.height }))
      .catch(() => setGroundTruth(null));
  }, [selected]);
  const bars = useMemo<BarDatum[]>(() => benchmark?.cases.map((item) => ({
    key: item.case_id,
    label: item.case_id,
    value: item.sam_ap ?? 0,
    color: item.floor_ap != null && (item.sam_ap ?? 0) >= item.floor_ap ? 'var(--color-good)' : '#f0883e',
    sub: item.floor_ap != null ? `floor ${item.floor_ap.toFixed(2)}` : '',
  })) ?? [], [benchmark]);
  const selectedCase = benchmark?.cases.find((item) => item.case_id === selected) ?? null;
  if (!benchmark) return <Loading es={es} />;
  return (
    <div className="fs-experiment-chapter">
      <ExperimentLead n="06" title={es ? 'Prompts puntuales como estudio de sensibilidad' : 'Point prompts as a sensitivity study'} text={es ? 'Este experimento histórico pregunta si una grilla regular de puntos recupera instancias sin ajuste específico. Se conserva como evidencia secundaria, separada de la matriz principal de 15 métodos.' : 'This historical experiment asks whether a regular point grid can recover instances without task-specific tuning. It is retained as secondary evidence, separate from the primary 15-method matrix.'} />
      <div className="fs-study-result">
        <div><span>{es ? 'AP medio' : 'mean AP'}</span><strong>{benchmark.summary.mean_sam_ap?.toFixed(3) ?? '—'}</strong></div>
        <div><span>{es ? 'referencia clásica' : 'classical reference'}</span><strong>{benchmark.summary.mean_floor_ap?.toFixed(3) ?? '—'}</strong></div>
        <div><span>{es ? 'casos ganados' : 'cases won'}</span><strong>{benchmark.summary.sam_wins}/{benchmark.summary.n_cases}</strong></div>
      </div>
      <PanelBoundary label="prompt-grid sensitivity">
        <BarChart data={bars} ariaLabel="prompt-grid mask AP per case" valueFmt={(value) => value.toFixed(3)} defaultBaseline="zero" note={es ? 'Verde: iguala o supera la referencia del caso. Naranja: la referencia clásica conserva ventaja.' : 'Green: matches or exceeds the case reference. Orange: the classical reference retains the advantage.'} />
      </PanelBoundary>
      <label className="fs-inline-selector">{es ? 'Inspeccionar caso' : 'Inspect case'}
        <select value={selected} onChange={(event) => setSelected(event.target.value)}>
          {benchmark.cases.map((item) => <option key={item.case_id} value={item.case_id}>{item.case_id}</option>)}
        </select>
      </label>
      <div className="fs-sam-inspection">
        <PanelBoundary label="ground truth">
          {groundTruth ? <MaskOverlay baseUrl={artifactUrl(`synth/${selected}/frame.png`)} labels={groundTruth.labels} width={groundTruth.w} height={groundTruth.h} caption={es ? 'Referencia exacta del caso controlado.' : 'Exact reference for the controlled case.'} /> : <Loading es={es} />}
        </PanelBoundary>
        {selectedCase && <CaseScoreCards score={selectedCase} es={es} />}
      </div>
      <Refs ids={['kirillov2023']} label="Refs" />
    </div>
  );
}

function ExperimentProvenance({ es, methods, temporal }: { es: boolean; methods: MethodBenchmarkDoc | null; temporal: TemporalBenchmarkDoc | null }) {
  return (
    <div className="fs-experiment-chapter">
      <ExperimentLead n="07" title={es ? 'Qué evidencia sostiene cada experimento' : 'Evidence supporting each experiment'} text={es ? 'La interfaz consume documentos versionados. La cobertura, el split y el dispositivo no son texto editorial: son campos verificados del artefacto.' : 'The interface consumes versioned documents. Coverage, split, and device are not editorial prose: they are verified artifact fields.'} />
      <div className="fs-provenance-chain">
        <article><span>01</span><strong>frothseg.learned-dataset/v2</strong><p>{es ? '384 muestras, grupos y divisiones.' : '384 samples, groups, and splits.'}</p></article>
        <article><span>02</span><strong>method-benchmark/v2</strong><p>{methods ? `${methods.coverage.observed_cells} ${es ? 'celdas observadas' : 'observed cells'}` : 'loading'}</p></article>
        <article><span>03</span><strong>temporal-benchmark/v1</strong><p>{temporal ? `${temporal.sequences.length} × ${temporal.sequences[0]?.frames ?? 0} ${es ? 'cuadros ·' : 'frames ·'} ${temporal.device}` : 'loading'}</p></article>
        <article><span>04</span><strong>release-report/v1</strong><p>{es ? 'Cobertura, bloqueos y puerta de afirmación.' : 'Coverage, blockers, and claim gate.'}</p></article>
      </div>
      <pre className="fs-command">{`python scripts/build_method_benchmark.py
python scripts/benchmark_temporal.py
python scripts/benchmark_sam2_video.py
python scripts/build_release_report.py
python scripts/check_product_completeness.py --profile development`}</pre>
      <p className="fs-note">{es ? 'La evidencia sintética permite comparación controlada. La transferencia a planta sigue requiriendo una fuente licenciada, representativa y calibrada físicamente.' : 'Synthetic evidence enables controlled comparison. Plant transfer still requires a licensed, representative, physically calibrated source.'}</p>
    </div>
  );
}

function ExperimentLead({ n, title, text }: { n: string; title: string; text: string }) {
  return <div className="fs-chapter-lead"><span>{n}</span><div><h2>{title}</h2><p>{text}</p></div></div>;
}

function ExperimentMatrixDiagram({ es }: { es: boolean }) {
  const rows = es ? ['Geometría', 'Apariencia', 'Degradación', 'Método'] : ['Geometry', 'Appearance', 'Degradation', 'Method'];
  return (
    <figure className="fs-experiment-matrix-diagram">
      <svg viewBox="0 0 1060 340" role="img">
        <defs><marker id="exp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker></defs>
        <g className="matrix">
          {rows.map((row, r) => <g key={row}><text x="32" y={78 + r * 58}>{row}</text>{Array.from({ length: r === 3 ? 15 : r === 2 ? 8 : 6 }, (_, c) => <rect key={c} x={170 + c * 46} y={52 + r * 58} width="34" height="34" rx="6" style={{ opacity: .28 + ((c + r) % 4) * .18 }} />)}</g>)}
        </g>
        <path d="M875 68V262" markerEnd="url(#exp-arrow)" />
        <g className="output"><rect x="910" y="98" width="120" height="120" rx="17" /><text x="970" y="142" textAnchor="middle">960</text><text x="970" y="168" textAnchor="middle" className="small">{es ? 'celdas' : 'cells'}</text><text x="970" y="190" textAnchor="middle" className="small">{es ? 'retenidas' : 'held out'}</text></g>
        <text x="530" y="315" textAnchor="middle" className="caption">{es ? 'cada factor se registra; ninguna celda se elige por conveniencia visual' : 'every factor is recorded; no cell is selected for visual convenience'}</text>
      </svg>
    </figure>
  );
}

function TemporalExperimentDiagram({ es }: { es: boolean }) {
  return (
    <figure className="fs-temporal-experiment-diagram">
      <svg viewBox="0 0 1050 280" role="img">
        <defs><marker id="temporal-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker></defs>
        {[0, 1, 2, 3, 4].map((frame) => <g key={frame} transform={`translate(${26 + frame * 203} 35)`}><rect width="160" height="150" rx="14" /><text x="14" y="24">t{frame}</text><circle cx={50 + frame * 5} cy={77 + frame * 2} r="27" className="a" /><circle cx={111 - frame * 4} cy={96 - frame} r="21" className="b" /><text x={50 + frame * 5} y={82 + frame * 2} textAnchor="middle">17</text><text x={111 - frame * 4} y={101 - frame} textAnchor="middle">31</text>{frame < 4 && <path d="M160 76H197" markerEnd="url(#temporal-arrow)" />}</g>)}
        <text x="525" y="230" textAnchor="middle" className="caption">{es ? 'detección por cuadro + asociación = trayectoria evaluable' : 'frame detection + association = evaluable trajectory'}</text>
      </svg>
    </figure>
  );
}

function ErrorStage({ label, value, status, text, inverse = false }: { label: string; value: number; status: string; text: string; inverse?: boolean }) {
  return <article className={status}><span>{label}</span><strong>{inverse ? `${(value * 100).toFixed(1)}%` : value.toFixed(3)}</strong><p>{text}</p></article>;
}

function CaseScoreCards({ score, es }: { score: SamCaseScore; es: boolean }) {
  return (
    <div className="fs-case-score-cards">
      <article><span>SAM AP</span><strong>{score.sam_ap?.toFixed(3) ?? '—'}</strong></article>
      <article><span>{es ? 'AP referencia' : 'reference AP'}</span><strong>{score.floor_ap?.toFixed(3) ?? '—'}</strong></article>
      <article><span>{es ? 'burbujas pred. / GT' : 'pred. / GT bubbles'}</span><strong>{score.sam_n} / {score.gt_n}</strong></article>
      <article><span>BSD W1</span><strong>{score.sam_bsd_w?.toFixed(2) ?? '—'}</strong></article>
      <article><span>d32 SAM / GT</span><strong>{score.sam_d32 ?? '—'} / {score.gt_d32 ?? '—'}</strong></article>
      <article><span>{es ? 'categoría' : 'category'}</span><strong>{score.category}</strong></article>
    </div>
  );
}

function Loading({ es }: { es: boolean }) {
  return <p className="fs-hint"><span className="fs-spinner" /> {es ? 'Cargando evidencia…' : 'Loading evidence…'}</p>;
}

function shortCondition(value: string): string {
  return value.replace('compound', 'mix').replace('microbubble', 'micro').replace('wide-bimodal-proxy', 'bimodal');
}

function heatColor(value: number): string {
  const normalized = Math.max(0, Math.min(1, value / .7));
  const hue = 8 + normalized * 164;
  const light = 25 + normalized * 28;
  return `hsl(${hue} 68% ${light}%)`;
}

function quality(value: number, medium: number, good: number): string {
  return value >= good ? 'good' : value >= medium ? 'medium' : 'bad';
}

function inverseQuality(value: number, medium: number, good: number): string {
  return value <= good ? 'good' : value <= medium ? 'medium' : 'bad';
}

function explainError(method: MethodBenchmarkRow, es: boolean): string {
  const test = method.test;
  if (!test) return '';
  const ap = test.mean_ap;
  const boundary = test.mean_boundary_fscore ?? 0;
  const count = test.mean_count_relative_error ?? 0;
  if (ap >= .5) return es ? 'La correspondencia de instancias es la más fuerte del banco. Los errores restantes deben leerse en conteo y morfometría antes de usar la salida como variable de proceso.' : 'Instance correspondence is the strongest in the benchmark. Remaining errors must still be read through count and morphometry before using the output as a process variable.';
  if (boundary >= .9 && ap < .3) return es ? 'Las fronteras locales se aproximan bien, pero la asociación por instancia es débil: el sistema dibuja bordes plausibles sin cerrar correctamente burbujas individuales.' : 'Local boundaries are close, but instance association is weak: the system draws plausible edges without closing individual bubbles correctly.';
  if (count > .5) return es ? 'El principal efecto es un sesgo fuerte de conteo. Uniones u objetos omitidos distorsionan después d32 y la distribución completa.' : 'The dominant effect is strong count bias. Merges or missed objects subsequently distort d32 and the complete distribution.';
  return es ? 'El error combina correspondencia, frontera y tamaño; no existe una única etapa que explique toda la caída.' : 'The error combines correspondence, boundary, and size; no single stage explains the full drop.';
}
