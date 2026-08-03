import { useEffect, useMemo, useState } from 'react';
import { Callout, Cite, Equation, InlineMath, Refs, SubTabs, Tabs, useShellLang } from '@fasl-work/caos-app-shell';
import { artifactUrl, loadMethodBenchmark } from '../api/artifacts';
import type { MethodBenchmarkDoc, MethodBenchmarkRow, MethodMetricSummary } from '../lib/contract.types';
import { BarChart, type BarDatum } from '../viz/BarChart';
import { PanelBoundary } from '../viz/PanelBoundary';

type MetricKey = 'mean_ap' | 'mean_ap50' | 'mean_pq' | 'mean_boundary_fscore' | 'mean_bsd_wasserstein' | 'mean_d32_relative_error';

/** The transfer artifact (schema frothseg.real-adjacent-benchmark/v1). Declared locally because this
 *  page is its only reader; source: data/derived/real-adjacent-benchmark.json. */
interface RealAdjacentRow {
  id: string;
  slug: string;
  name: string;
  tier: MethodBenchmarkRow['tier'];
  n_scored: number;
  n_failed: number;
  mean_ap: number;
  mean_ap50: number;
  mean_pq: number;
}

interface RealAdjacentDoc {
  domain: string;
  source_id: string;
  license: string;
  split: string;
  n_samples: number;
  device: string;
  methods: RealAdjacentRow[];
}

/** The pooled instance ledger. The evaluator also writes the two froth failure modes (merges, splits)
 *  into this object; the shared contract mirror does not declare them, so they are read as optional
 *  here rather than assumed. Source: data/derived/method-benchmark.json (methods[].test.micro). */
type Micro = NonNullable<MethodMetricSummary['micro']> & { merges?: number; splits?: number };

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
  const [real, setReal] = useState<RealAdjacentDoc | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadMethodBenchmark().then(setBenchmark).catch((reason: unknown) => setError(String(reason)));
    fetch(artifactUrl('real-adjacent-benchmark.json'))
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((doc: RealAdjacentDoc) => setReal(doc))
      .catch(() => setReal(null));
  }, []);

  const groups = [
    {
      id: 'metrics',
      label: es ? 'Métricas' : 'Metrics',
      content: (
        <SubTabs
          ariaLabel={es ? 'Definiciones de métrica' : 'Metric definitions'}
          tabs={[
            { id: 'which-ap', label: es ? 'Qué AP es este' : 'Which AP this is', content: <WhichAp es={es} benchmark={benchmark} /> },
            { id: 'pq', label: es ? 'PQ y los dos fallos' : 'PQ and the two failures', content: <PanopticQuality es={es} benchmark={benchmark} /> },
            { id: 'size', label: es ? 'Frontera y tamaño' : 'Boundary and size', content: <BoundaryAndSize es={es} benchmark={benchmark} /> },
            { id: 'calibration', label: es ? 'Calibración' : 'Calibration', content: <CalibrationMetrics es={es} benchmark={benchmark} /> },
          ]}
        />
      ),
    },
    {
      id: 'protocol',
      label: es ? 'Protocolo' : 'Protocol',
      content: (
        <SubTabs
          ariaLabel={es ? 'Protocolo de medición' : 'Measurement protocol'}
          tabs={[
            { id: 'splits', label: es ? 'Divisiones y agregación' : 'Splits and aggregation', content: <SplitsAndAggregation es={es} benchmark={benchmark} /> },
            { id: 'acceptance', label: es ? 'Aceptación' : 'Acceptance', content: <Acceptance es={es} benchmark={benchmark} /> },
            { id: 'lanes', label: es ? 'Carriles y paridad' : 'Lanes and parity', content: <LanesAndParity es={es} /> },
          ]}
        />
      ),
    },
    {
      id: 'results',
      label: es ? 'Resultados' : 'Results',
      content: (
        <SubTabs
          ariaLabel={es ? 'Resultados retenidos' : 'Held-out results'}
          tabs={[
            { id: 'ranking', label: es ? 'Ranking' : 'Ranking', content: <Ranking es={es} benchmark={benchmark} /> },
            { id: 'conditions', label: es ? 'Condiciones' : 'Conditions', content: <ConditionAnalysis es={es} benchmark={benchmark} /> },
            { id: 'compute', label: es ? 'Costo' : 'Compute', content: <ComputeAnalysis es={es} benchmark={benchmark} /> },
            { id: 'matrix', label: es ? 'Matriz completa' : 'Complete matrix', content: <CompleteMatrix es={es} benchmark={benchmark} /> },
          ]}
        />
      ),
    },
    {
      id: 'transfer',
      label: es ? 'Transferencia' : 'Transfer',
      content: (
        <SubTabs
          ariaLabel={es ? 'Transferencia a dominio real' : 'Real-domain transfer'}
          tabs={[
            { id: 'dataset', label: es ? 'La duda y los datos' : 'The doubt and the data', content: <TransferDataset es={es} real={real} /> },
            { id: 'result', label: es ? 'Resultado' : 'Result', content: <TransferResult es={es} benchmark={benchmark} real={real} /> },
            { id: 'reading', label: es ? 'Lectura honesta' : 'Honest reading', content: <TransferReading es={es} /> },
          ]}
        />
      ),
    },
    { id: 'scope', label: es ? 'Alcance' : 'Scope', content: <Scope es={es} benchmark={benchmark} /> },
  ];

  return (
    <div className="page-body prose">
      <header className="page-head">
        <span className="eyebrow">{es ? 'Definición de la medición y lo que autoriza afirmar' : 'How the measurement is defined and what it licenses'}</span>
        <h1>{es ? 'La medición, antes del ranking' : 'The measurement, before the ranking'}</h1>
        <p className="lede">
          {es
            ? 'Cada número de esta página proviene de un artefacto versionado: 15 métodos, 64 imágenes de prueba intactas, 960 celdas evaluadas. La cifra principal es '
            : 'Every number on this page comes from one committed artifact: 15 methods, 64 untouched test images, 960 scored cells. The headline figure is '}
          <InlineMath tex={String.raw`\mathrm{AP}(\tau)=TP/(TP+FP+FN)`} />
          {es
            ? ' promediada sobre diez umbrales de IoU, la definición que usan Cellpose y StarDist, y no es el AP de COCO. Tampoco es exactitud de planta: las imágenes son sintéticas, y una prueba aparte sobre fotografías reales muestra cuánto del ranking pertenece al generador y no a la dificultad de segmentar.'
            : ' averaged over ten IoU thresholds, the definition Cellpose and StarDist report, and it is not COCO AP. It is also not plant accuracy: the images are synthetic, and a separate test on real photographs shows how much of the ranking belongs to the generator rather than to the difficulty of segmenting.'}
        </p>
      </header>
      {error && <p className="fs-note">error: {error}</p>}
      {!benchmark && !error && <p><span className="fs-spinner" /> {es ? 'Cargando la matriz evaluada…' : 'Loading the scored matrix…'}</p>}
      <section><Tabs tabs={groups} ariaLabel={es ? 'Capítulos del benchmark' : 'Benchmark chapters'} /></section>
    </div>
  );
}

// ============================================================
// METRICS · which AP this is
// ============================================================

function WhichAp({ es, benchmark }: BenchmarkProps) {
  if (!benchmark) return <Loading es={es} />;
  const leader = rankBy(benchmark.methods, 'mean_ap')[0];
  const flooder = benchmark.methods.find((method) => method.id === 'C2');
  const leaderMicro = microOf(leader);
  const flooderMicro = microOf(flooder);
  return (
    <div className="prose">
      <h2>{es ? 'Dos cantidades distintas llevan el mismo nombre' : 'Two different quantities carry the same name'}</h2>
      <p className="measure">{es
        ? 'El AP de COCO ordena las detecciones por confianza e integra la precisión sobre el recall: cada detección adicional mueve el punto de operación a lo largo de una curva, y el área bajo esa curva es la puntuación. Ese procedimiento necesita un ranking de confianza, y la mayor parte de los métodos comparados aquí no lo tiene, porque una watershed no puntúa sus regiones. Forzar un ranking inventado sobre ellas produciría una curva que no describe ninguna decisión real. Por eso este repositorio usa la definición estándar en segmentación de instancias celulares, la que reportan Cellpose y StarDist: para un umbral de IoU dado se emparejan predicciones y verdad de terreno una a una, de forma voraz y en orden descendente de IoU, y la puntuación es la fracción de emparejamientos correctos entre todo lo que participó. Es el índice de Jaccard del emparejamiento de instancias, está acotado por 1 y castiga falsos positivos y falsos negativos de forma simétrica. Los números de esta página, por lo tanto, no son comparables con una tabla de posiciones de COCO, y un artículo que reporte AP de COCO sobre espuma está midiendo otra cosa.'
        : 'COCO AP ranks detections by confidence and integrates precision over recall: each extra detection moves the operating point along a curve, and the area under that curve is the score. That procedure needs a confidence ranking, and most of the methods compared here do not have one, because a watershed does not score its regions. Forcing an invented ranking onto them would produce a curve that describes no real decision. This repository therefore uses the definition standard in cell instance segmentation, the one Cellpose and StarDist report: at a given IoU threshold, predictions and ground truth are matched one to one, greedily and in descending order of IoU, and the score is the fraction of correct matches among everything that took part. It is the Jaccard index of the instance matching, it is bounded by 1, and it penalises false positives and false negatives symmetrically. The numbers on this page are therefore not comparable to a COCO leaderboard, and a paper reporting COCO AP on froth is measuring something else.'}{' '}<Cite id="lin2014coco" paren /> <Cite id="stringer2021cellpose" paren /> <Cite id="schmidt2018stardist" paren /></p>

      {/* AP definition transcribed from docs/metrics/01_definitions.md (Instance agreement) */}
      <Equation
        tex={String.raw`\mathrm{AP}(\tau) = \frac{TP(\tau)}{TP(\tau) + FP(\tau) + FN(\tau)}, \qquad \mathrm{AP} = \frac{1}{10}\sum_{\tau=0.50,0.55,\dots}^{0.95} \mathrm{AP}(\tau)`}
        caption={es
          ? 'AP por umbral y el AP principal: media sobre diez umbrales de IoU de 0,50 a 0,95 en pasos de 0,05 (el barrido de COCO aplicado a la definición de Cellpose y StarDist)'
          : 'per-threshold AP and the headline AP: the mean over ten IoU thresholds from 0.50 to 0.95 in steps of 0.05 (the COCO sweep applied to the Cellpose and StarDist definition)'}
      />
      <ul className="fs-symbol-list">
        <li><strong>TP(τ)</strong><span>{es ? 'pares emparejados con IoU sobre el umbral τ' : 'matched pairs whose IoU exceeds the threshold τ'}</span></li>
        <li><strong>FP(τ)</strong><span>{es ? 'predicciones que quedaron sin pareja' : 'predicted instances left without a partner'}</span></li>
        <li><strong>FN(τ)</strong><span>{es ? 'burbujas reales que quedaron sin pareja' : 'true bubbles left without a partner'}</span></li>
        <li><strong>τ</strong><span>{es ? 'umbral de IoU exigido para aceptar un par' : 'IoU threshold required to accept a pair'}</span></li>
        <li><strong>AP50</strong><span>{es ? 'valor de un solo umbral en 0,50' : 'the single-threshold value at 0.50'}</span></li>
        <li><strong>AP75</strong><span>{es ? 'valor de un solo umbral en 0,75' : 'the single-threshold value at 0.75'}</span></li>
      </ul>

      <p className="measure">{es
        ? 'La consecuencia práctica de esa elección es que no existe un punto de operación gratuito. Bajo el AP de COCO un método puede emitir muchas detecciones de baja confianza y dejar que la curva escoja dónde cortar; bajo esta definición cada predicción sobrante entra en el denominador. La watershed por inmersión de gradiente lo muestra con claridad en la matriz evaluada: '
        : 'The practical consequence of that choice is that there is no free operating point. Under COCO AP a method can emit many low-confidence detections and let the curve pick where to cut; under this definition every surplus prediction enters the denominator. Gradient immersion watershed shows this plainly in the scored matrix: '}
        {/* live values: data/derived/method-benchmark.json methods[C2].test.micro */}
        {flooderMicro
          ? (es
            ? `emite ${flooderMicro.nPred.toLocaleString('es')} instancias frente a ${flooderMicro.nGt.toLocaleString('es')} reales, acierta ${flooderMicro.tp.toLocaleString('es')} de ellas y termina con una precisión de instancia de ${flooderMicro.instance_precision.toFixed(3)}. Su recall no es el peor del banco, pero el exceso de segmentos hunde el AP a ${fmt(flooder?.test?.mean_ap)}.`
            : `it emits ${flooderMicro.nPred.toLocaleString('en')} instances against ${flooderMicro.nGt.toLocaleString('en')} true ones, gets ${flooderMicro.tp.toLocaleString('en')} of them right, and ends with an instance precision of ${flooderMicro.instance_precision.toFixed(3)}. Its recall is not the worst on the bench, but the surplus of segments sinks AP to ${fmt(flooder?.test?.mean_ap)}.`)
          : ''}
        {es
          ? ' Esa simetría es deliberada: en una medición de tamaño de burbuja un segmento inventado contamina la distribución exactamente igual que una burbuja perdida, así que la métrica que ordena el banco tiene que cobrar por ambos.'
          : ' That symmetry is deliberate: in a bubble-size measurement an invented segment contaminates the distribution exactly as much as a missed bubble does, so the metric that orders the bench has to charge for both.'}</p>

      <p className="measure">{es
        ? 'El barrido de umbrales es lo que separa localización de contorno. En 0,50 basta con que la máscara predicha cubra la mitad de la burbuja para que el par cuente; en 0,90 un desplazamiento de pocos píxeles en el borde ya rompe el emparejamiento. La brecha entre AP50 y AP es entonces una lectura directa de cuánto de la puntuación se pierde en el contorno y no en el conteo. '
        : 'The threshold sweep is what separates localization from outline. At 0.50 a predicted mask only has to cover half the bubble for the pair to count; at 0.90 a displacement of a few pixels on the boundary already breaks the match. The gap between AP50 and AP is therefore a direct reading of how much of the score is lost on the outline rather than on the count. '}
        {/* live values: data/derived/method-benchmark.json (leader row by test.mean_ap) */}
        {es
          ? `El método que lidera este banco registra AP50 ${fmt(leader?.test?.mean_ap50)} y AP ${fmt(leader?.test?.mean_ap)}: encontró casi todas las burbujas, y lo que el barrido le cobra es la precisión del borde. Un método con AP50 alto y AP bajo sigue sirviendo para contar y clasificar estado de espuma; no sirve para medir un diámetro.`
          : `The method leading this bench records AP50 ${fmt(leader?.test?.mean_ap50)} and AP ${fmt(leader?.test?.mean_ap)}: it found nearly every bubble, and what the sweep charges it for is boundary precision. A method with high AP50 and low AP is still useful for counting and for froth-state classification; it is not useful for measuring a diameter.`}</p>

      <MatchingLedger es={es} micro={leaderMicro} label={leader ? `${leader.id} ${leader.name}` : ''} />

      <Callout variant="honest" title={es ? 'Lo que un solo AP no puede decir' : 'What a single AP cannot say'}>
        <p>{es
          ? 'El AP principal promedia diez umbrales y agrega tres tipos de error en un solo número, así que por sí mismo no distingue si un método falla contando o falla contorneando, ni en qué dirección sesga la distribución de tamaños. Por eso el mismo artefacto publica PQ separada en sus componentes, los conteos de unión y separación por imagen, la F de frontera con su tolerancia y las distancias entre distribuciones. Leer solo la columna de AP es tomar la parte más resumida de la evidencia disponible.'
          : 'The headline AP averages ten thresholds and aggregates three error types into one number, so on its own it does not distinguish a method that fails at counting from one that fails at outlining, nor which way it biases the size distribution. That is why the same artifact publishes PQ split into its components, per-image merge and split counts, the boundary F-score with its tolerance, and distances between distributions. Reading the AP column alone takes the most compressed part of the available evidence.'}</p>
      </Callout>
      <Refs ids={['lin2014coco', 'stringer2021cellpose', 'schmidt2018stardist']} label="Refs" />
    </div>
  );
}

// ============================================================
// METRICS · panoptic quality and the two froth failure modes
// ============================================================

function PanopticQuality({ es, benchmark }: BenchmarkProps) {
  if (!benchmark) return <Loading es={es} />;
  const rows = benchmark.methods.filter((method) => microOf(method) != null);
  const merger = benchmark.methods.find((method) => method.id === 'C1');
  const splitter = benchmark.methods.find((method) => method.id === 'C2');
  const mergerMicro = microOf(merger);
  const splitterMicro = microOf(splitter);
  return (
    <div className="prose">
      <h2>{es ? 'Reconocer y contornear son dos preguntas' : 'Recognising and outlining are two questions'}</h2>
      <p className="measure">{es
        ? 'La calidad panóptica se factoriza en un término de segmentación y un término de reconocimiento, y esa factorización es la razón de usarla junto al AP. La calidad de segmentación promedia el IoU de los pares aceptados y responde: cuando encontró una burbuja, qué tan bien la contorneó. La calidad de reconocimiento cuenta cuántos pares hay contra los sobrantes de cada lado y responde: encontró el número correcto de burbujas. Los segmentos se emparejan de forma única con IoU estrictamente mayor que 0,5, el umbral en el que el emparejamiento se vuelve único y no requiere ninguna regla de desempate. Separar los dos términos importa porque las dos fallas tienen causas distintas y arreglos distintos: un término de reconocimiento bajo con segmentación alta apunta a marcadores mal sembrados, mientras que reconocimiento alto con segmentación baja apunta a un umbral de primer plano mal calibrado o a un borde sistemáticamente desplazado.'
        : 'Panoptic quality factorises into a segmentation term and a recognition term, and that factorisation is the reason to use it next to AP. Segmentation quality averages the IoU of the accepted pairs and answers: when it found a bubble, how well did it outline it. Recognition quality counts how many pairs exist against the leftovers on each side and answers: did it find the right number of bubbles. Segments match uniquely at IoU strictly greater than 0.5, the threshold at which the matching becomes unique and needs no tiebreak rule. Splitting the two terms matters because the two failures have different causes and different fixes: low recognition with high segmentation points at badly seeded markers, while high recognition with low segmentation points at a miscalibrated foreground threshold or a systematically displaced boundary.'}</p>

      {/* PQ/SQ/RQ transcribed from docs/metrics/01_definitions.md */}
      <Equation
        tex={String.raw`\mathrm{PQ} = \mathrm{SQ} \times \mathrm{RQ}, \qquad \mathrm{SQ} = \frac{\sum_{(p,g)\in TP} \mathrm{IoU}(p,g)}{|TP|}, \qquad \mathrm{RQ} = \frac{|TP|}{|TP| + \tfrac{1}{2}|FP| + \tfrac{1}{2}|FN|}`}
        caption={es
          ? 'PQ como producto de calidad de segmentación (IoU medio de los pares aceptados) y calidad de reconocimiento (conteo correcto contra sobrantes); los pares se aceptan con IoU estrictamente mayor que 0,5'
          : 'PQ as the product of segmentation quality (mean IoU of accepted pairs) and recognition quality (correct count against leftovers); pairs are accepted at IoU strictly greater than 0.5'}
      />

      <h3>{es ? 'Las dos fallas que caracterizan la espuma' : 'The two failures that characterise froth'}</h3>
      <p className="measure">{es
        ? 'Junto a PQ el evaluador retiene los dos modos de error que realmente describen la segmentación de espuma, usando un umbral de cobertura de 0,2. Una separación es una burbuja real cubierta por más de un segmento predicho: es la falla de watershed sobre reflejos, donde el brillo especular dentro de una sola burbuja grande siembra dos marcadores y la parte en dos. Una unión es un segmento predicho que cubre más de una burbuja real: es la falla de Otsu, donde dos burbujas en contacto comparten una región brillante y no se detecta la lamela entre ellas. Los dos conteos se publican por imagen porque un método puede sostener un AP respetable y ser inútil para una distribución de tamaños si sus errores se concentran en un modo. Una unión reduce el conteo y desplaza la media de Sauter hacia diámetros mayores; una separación aumenta el conteo y la desplaza hacia diámetros menores. El sesgo resultante es sistemático, no ruido, así que no se promedia hacia cero sobre muchas imágenes.'
        : 'Alongside PQ the evaluator retains the two error modes that actually describe froth segmentation, using a coverage threshold of 0.2. A split is one true bubble covered by more than one predicted segment: it is the watershed-on-highlights failure, where specular glare inside a single large bubble seeds two markers and cuts it in two. A merge is one predicted segment covering more than one true bubble: it is the Otsu failure, where two touching bubbles share a bright region and no lamella is detected between them. Both counts are published per image because a method can hold a respectable AP and still be useless for a size distribution if its errors concentrate in one mode. A merge reduces the count and shifts the Sauter mean toward larger diameters; a split raises the count and shifts it toward smaller ones. The resulting bias is systematic rather than noise, so it does not average to zero over many images.'}{' '}<Cite id="meyer1994" paren /> <Cite id="wang2003froth" paren /></p>

      <p className="measure">{es
        ? 'Los conteos agrupados de la matriz separan las dos poblaciones sin ambigüedad. '
        : 'The pooled counts in the matrix separate the two populations without ambiguity. '}
        {/* live values: data/derived/method-benchmark.json methods[C1|C2].test.micro */}
        {mergerMicro && splitterMicro
          ? (es
            ? `Otsu con componentes conexas registra ${mergerMicro.merges?.toLocaleString('es')} uniones contra ${mergerMicro.splits?.toLocaleString('es')} separaciones: es un sub-segmentador casi puro, y su precisión de instancia de ${mergerMicro.instance_precision.toFixed(3)} conviven con un recall de ${mergerMicro.instance_recall.toFixed(3)}. La watershed por inmersión invierte el patrón con ${splitterMicro.splits?.toLocaleString('es')} separaciones y ${splitterMicro.merges?.toLocaleString('es')} uniones. Los dos métodos tienen AP bajo; no tienen el mismo defecto, y un ranking de una sola columna los presentaría como si lo tuvieran.`
            : `Otsu with connected components records ${mergerMicro.merges?.toLocaleString('en')} merges against ${mergerMicro.splits?.toLocaleString('en')} splits: it is an almost pure under-segmenter, and its instance precision of ${mergerMicro.instance_precision.toFixed(3)} sits next to a recall of ${mergerMicro.instance_recall.toFixed(3)}. Immersion watershed inverts the pattern with ${splitterMicro.splits?.toLocaleString('en')} splits and ${splitterMicro.merges?.toLocaleString('en')} merges. Both methods have low AP; they do not have the same defect, and a single-column ranking would present them as if they did.`)
          : ''}{' '}<Cite id="vincent1991" paren /></p>

      <div className="fs-matrix-scroll">
        <table className="fs-table">
          <thead>
            <tr>
              <th>ID</th><th>{es ? 'método' : 'method'}</th>
              <th className="num">{es ? 'reales' : 'true'}</th><th className="num">{es ? 'predichas' : 'predicted'}</th>
              <th className="num">TP</th><th className="num">FP</th><th className="num">FN</th>
              <th className="num">{es ? 'uniones' : 'merges'}</th><th className="num">{es ? 'separaciones' : 'splits'}</th>
              <th className="num">{es ? 'precisión' : 'precision'}</th><th className="num">{es ? 'recall' : 'recall'}</th>
              <th className="num">PQ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((method) => {
              const micro = microOf(method)!;
              return (
                <tr key={method.id}>
                  <td>{method.id}</td><td>{method.name}</td>
                  <td className="num">{micro.nGt.toLocaleString(es ? 'es' : 'en')}</td>
                  <td className="num">{micro.nPred.toLocaleString(es ? 'es' : 'en')}</td>
                  <td className="num">{micro.tp.toLocaleString(es ? 'es' : 'en')}</td>
                  <td className="num">{micro.fp.toLocaleString(es ? 'es' : 'en')}</td>
                  <td className="num">{micro.fn.toLocaleString(es ? 'es' : 'en')}</td>
                  <td className="num">{micro.merges?.toLocaleString(es ? 'es' : 'en') ?? '--'}</td>
                  <td className="num">{micro.splits?.toLocaleString(es ? 'es' : 'en') ?? '--'}</td>
                  <td className="num">{micro.instance_precision.toFixed(3)}</td>
                  <td className="num">{micro.instance_recall.toFixed(3)}</td>
                  <td className="num">{fmt(method.test?.mean_pq)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="fs-note">{es
        ? 'Conteos agrupados sobre las 64 muestras retenidas, con asociación a IoU 0,5. Los conteos viajan siempre con su agregado: ninguna media de esta página se publica sin el número de muestras del que salió.'
        : 'Pooled counts over the 64 held-out samples, with association at IoU 0.5. Counts always travel with their aggregate: no mean on this page is published without the sample count it came from.'}</p>

      <Callout variant="honest" title={es ? 'Qué es convención y qué es medición' : 'What is convention and what is measurement'}>
        <p>{es
          ? 'El umbral de cobertura de 0,2 que decide cuándo un solapamiento cuenta como unión o separación es una convención de este evaluador, declarada aquí para que los conteos se puedan reproducir; otro umbral daría otros conteos sobre las mismas máscaras. Lo que no es convención es la asimetría entre métodos: la dirección del sesgo se mantiene bajo cualquier umbral razonable. Estos conteos tampoco reemplazan mirar las máscaras, que es la razón de que el banco de trabajo permita superponerlas sobre la imagen.'
          : 'The coverage threshold of 0.2 that decides when an overlap counts as a merge or a split is a convention of this evaluator, declared here so the counts can be reproduced; another threshold would give other counts over the same masks. What is not convention is the asymmetry between methods: the direction of the bias holds under any reasonable threshold. These counts also do not replace looking at the masks, which is why the workbench lets you overlay them on the image.'}</p>
      </Callout>
      <Refs ids={['meyer1994', 'vincent1991', 'wang2003froth']} label="Refs" />
    </div>
  );
}

// ============================================================
// METRICS · boundary and size
// ============================================================

function BoundaryAndSize({ es, benchmark }: BenchmarkProps) {
  if (!benchmark) return <Loading es={es} />;
  const rows = benchmark.methods.filter((method) => method.test && method.test.mean_d32_relative_error != null);
  const best = [...rows].sort((a, b) => (a.test!.mean_bsd_wasserstein ?? 9e9) - (b.test!.mean_bsd_wasserstein ?? 9e9))[0];
  const worst = [...rows].sort((a, b) => (b.test!.mean_bsd_wasserstein ?? 0) - (a.test!.mean_bsd_wasserstein ?? 0))[0];
  return (
    <div className="prose">
      <h2>{es ? 'De máscaras a una medición de proceso' : 'From masks to a process measurement'}</h2>
      <p className="measure">{es
        ? 'La F de frontera mide precisión y recall sobre píxeles de borde dentro de una tolerancia declarada y toma su media armónica. La tolerancia es una distancia física cuando existe calibración y una distancia en píxeles cuando no, y se reporta siempre junto a la puntuación, porque una F de frontera sin su tolerancia no es interpretable: la misma máscara puede puntuar casi perfecto con tres píxeles de holgura y mal con uno. Esta métrica es la más sensible del conjunto al grosor de la lamela, que es justamente la evidencia que separa dos burbujas en contacto, y por eso los métodos que trazan bordes gruesos pueden ganar aquí mientras pierden en el conteo de instancias. Se publica junto a PQ y no en su lugar.'
        : 'The boundary F-score measures precision and recall over boundary pixels within a declared tolerance and takes their harmonic mean. The tolerance is a physical distance when a calibration exists and a pixel distance when it does not, and it is always reported next to the score, because a boundary F-score without its tolerance is not interpretable: the same mask can score almost perfectly with three pixels of slack and badly with one. This metric is the most sensitive in the set to lamella thickness, which is exactly the evidence separating two touching bubbles, so methods that draw thick boundaries can win here while losing on the instance count. It is published next to PQ, not instead of it.'}{' '}<Cite id="wang2003froth" paren /></p>

      {/* d_eq, d32 and W1 transcribed from docs/metrics/01_definitions.md (Physical descriptors) */}
      <Equation
        tex={String.raw`d_{eq} = 2\sqrt{A/\pi}, \qquad d_{32} = \frac{\sum_i d_i^3}{\sum_i d_i^2}, \qquad \varepsilon_{32} = \frac{|\hat d_{32} - d_{32}|}{d_{32}}`}
        caption={es
          ? 'diámetro equivalente de un área de instancia, media de Sauter ponderada por superficie y su error relativo (unidades en milímetros solo cuando se entrega una calibración de píxeles por milímetro, en píxeles en caso contrario)'
          : 'equivalent diameter of an instance area, the surface-area-weighted Sauter mean, and its relative error (units are millimetres only when a pixels-per-millimetre calibration is supplied, pixels otherwise)'}
      />
      <p className="measure">{es
        ? 'El área de cada instancia se convierte en el diámetro del disco de la misma área, y del conjunto de diámetros el evaluador reporta los percentiles D10, D50 y D90 más la media de Sauter. La media de Sauter es el resumen estándar de tamaño de burbuja en flotación porque el área interfacial por unidad de volumen escala con ella, es decir porque es la estadística que se conecta con la tasa de recuperación y no simplemente una medida de tendencia central. La unidad viaja con el número y la escala nunca se estima desde la imagen: si no hay calibración registrada por cámara, la cifra se publica en píxeles y se etiqueta como tal. Esa regla es la que impide que una comparación entre métodos se convierta en una medición física sin que nadie haya medido nada.'
        : 'Each instance area converts to the diameter of the disc with the same area, and from the set of diameters the evaluator reports the D10, D50 and D90 percentiles plus the Sauter mean. The Sauter mean is the standard bubble-size summary in flotation because interfacial area per unit volume scales with it, that is, because it is the statistic that connects to recovery rate rather than merely a measure of central tendency. The unit travels with the number and scale is never estimated from the image: with no camera-specific recorded calibration, the figure is published in pixels and labelled as such. That rule is what stops a comparison between methods from turning into a physical measurement without anyone having measured anything.'}{' '}<Cite id="sautermean" paren /> <Cite id="aldrich2010" paren /></p>

      <Equation
        tex={String.raw`W_1(P, Q) = \int \left| F_P(x) - F_Q(x) \right| \, dx`}
        caption={es
          ? 'distancia 1-Wasserstein entre la distribución de tamaños predicha y la real, en las mismas unidades que los diámetros: la masa que hay que mover para convertir una en la otra'
          : 'the 1-Wasserstein distance between the predicted and true size distributions, in the same units as the diameters: the mass that must be moved to turn one into the other'}
      />
      <p className="measure">{es
        ? 'Comparar solo el D50 esconde el error de forma, así que las distribuciones completas se comparan con la distancia 1-Wasserstein, que se lee directamente como el error típico de diámetro ponderado por cuántas burbujas están mal. La dispersión entre métodos es grande y no sigue el orden del AP: '
        : 'Comparing D50 alone hides shape error, so full distributions are compared with the 1-Wasserstein distance, which reads directly as the typical diameter error weighted by how many bubbles are wrong. The spread between methods is wide and does not follow the AP order: '}
        {/* live values: data/derived/method-benchmark.json methods[].test.mean_bsd_wasserstein */}
        {best && worst
          ? (es
            ? `el mejor valor del banco es ${fmt(best.test?.mean_bsd_wasserstein)} píxeles (${best.id} ${best.name}) y el peor entre los métodos con morfometría es ${fmt(worst.test?.mean_bsd_wasserstein)} (${worst.id} ${worst.name}).`
            : `the best value on the bench is ${fmt(best.test?.mean_bsd_wasserstein)} pixels (${best.id} ${best.name}) and the worst among the methods with morphometry is ${fmt(worst.test?.mean_bsd_wasserstein)} (${worst.id} ${worst.name}).`)
          : ''}
        {es
          ? ' El diagrama de abajo cruza calidad de instancia con error relativo de la media de Sauter: la región deseada combina AP alto con error morfométrico bajo, y un método puede quedar fuera de ella por cualquiera de los dos ejes.'
          : ' The diagram below crosses instance quality with relative Sauter-mean error: the desired region combines high AP with low morphometric error, and a method can fall outside it along either axis.'}{' '}<Cite id="villani2009ot" paren /> <Cite id="jahedsaravani2017" paren /></p>

      <PanelBoundary label={es ? 'dispersión de morfometría' : 'morphometry scatter'}>
        <MetricScatter
          methods={rows}
          x={(method) => method.test!.mean_ap}
          y={(method) => method.test!.mean_d32_relative_error ?? 0}
          xDomain={[0, .6]}
          yDomain={[0, maxOr(rows.map((method) => method.test!.mean_d32_relative_error ?? 0), 1)]}
          xLabel="Mask AP"
          yLabel={es ? 'error relativo de d32' : 'relative d32 error'}
          invertY
          es={es}
        />
      </PanelBoundary>
      <div className="def-grid">
        <div><strong>{es ? 'Uniones' : 'Merges'}</strong><p>{es ? 'Reducen el conteo y desplazan la media de Sauter hacia tamaños mayores.' : 'Reduce the count and shift the Sauter mean toward larger sizes.'}</p></div>
        <div><strong>{es ? 'Separaciones' : 'Splits'}</strong><p>{es ? 'Aumentan el conteo y desplazan la distribución hacia tamaños menores.' : 'Raise the count and shift the distribution toward smaller sizes.'}</p></div>
        <div><strong>{es ? 'Borde desplazado' : 'Boundary offset'}</strong><p>{es ? 'Puede conservar la identidad de cada instancia y aun así sesgar área, circularidad y media de Sauter.' : 'Can preserve the identity of every instance and still bias area, circularity and the Sauter mean.'}</p></div>
      </div>
      <p className="fs-note">{es
        ? 'Los diámetros están expresados en píxeles en el banco controlado. La conversión a milímetros requiere una escala física registrada por cámara, y ninguna de las fuentes evaluadas hasta ahora la trae.'
        : 'Diameters are expressed in pixels on the controlled benchmark. Conversion to millimetres requires a camera-specific recorded physical scale, and none of the sources evaluated so far carries one.'}</p>
      <Refs ids={['wang2003froth', 'sautermean', 'aldrich2010', 'villani2009ot', 'jahedsaravani2017']} label="Refs" />
    </div>
  );
}

// ============================================================
// METRICS · calibration
// ============================================================

function CalibrationMetrics({ es, benchmark }: BenchmarkProps) {
  if (!benchmark) return <Loading es={es} />;
  const calibrated = benchmark.methods.filter((method) => method.test?.mean_brier != null || method.test?.mean_ece != null);
  const uncalibrated = benchmark.methods.filter((method) => method.test?.mean_brier == null && method.test?.mean_ece == null);
  return (
    <div className="prose">
      <h2>{es ? 'Confianza que corresponde con frecuencia de acierto' : 'Confidence that corresponds to empirical accuracy'}</h2>
      <p className="measure">{es
        ? 'La calibración se reporta solo para los métodos que exponen probabilidades, y se mide sobre una división independiente de la de prueba, con los umbrales de post-proceso ya fijados. El puntaje de Brier es el error cuadrático medio de la probabilidad contra el resultado binario: es una regla de puntuación propia, de modo que no se puede mejorar reportando una confianza distinta de la creída, lo que lo hace resistente a la manipulación del umbral. El error esperado de calibración responde una pregunta distinta: agrupa las predicciones por confianza y promedia, ponderando por ocupación, la diferencia entre la confianza declarada y la exactitud observada en cada intervalo. Un modelo puede tener buen Brier y mala calibración por intervalos si acierta mucho pero declara siempre la misma confianza alta.'
        : 'Calibration is reported only for methods that expose probabilities, and it is measured on a split independent of the test split, with post-processing thresholds already fixed. The Brier score is the mean squared error of the probability against the binary outcome: it is a proper scoring rule, so it cannot be improved by reporting a confidence other than the believed one, which makes it resistant to threshold manipulation. Expected calibration error answers a different question: it bins predictions by confidence and averages, weighted by occupancy, the gap between stated confidence and observed accuracy in each bin. A model can have a good Brier score and poor binned calibration if it is often right but always declares the same high confidence.'}{' '}<Cite id="brier1950" paren /></p>

      {/* Brier and ECE transcribed from docs/metrics/01_definitions.md (Calibration and uncertainty) */}
      <Equation
        tex={String.raw`\mathrm{Brier} = \frac{1}{N}\sum_{i=1}^{N}(p_i - y_i)^2, \qquad \mathrm{ECE} = \sum_{b} \frac{|b|}{N}\,\bigl|\mathrm{acc}(b) - \mathrm{conf}(b)\bigr|`}
        caption={es
          ? 'puntaje probabilístico propio y error de calibración por intervalos (p: probabilidad declarada; y: resultado binario; b: intervalo de confianza; N: número de predicciones)'
          : 'proper probability score and binned calibration error (p: stated probability; y: binary outcome; b: confidence bin; N: number of predictions)'}
      />

      <p className="measure">{es
        ? 'Que esto importe no es un detalle académico. Un umbral de alarma o de rechazo en planta solo tiene significado si una confianza de 0,8 corresponde aproximadamente a ocho aciertos de cada diez dentro del dominio calibrado; sin esa relación, el operador está fijando un número sin unidades. Los métodos que no producen una probabilidad por píxel o por instancia no reciben una cifra inventada: quedan registrados con la razón por la que no se puede calibrarlos, y sus parámetros de umbral se muestran como decisiones operativas y no como incertidumbre. '
        : 'That this matters is not an academic detail. An alarm or rejection threshold at a plant only has meaning if a confidence of 0.8 corresponds to roughly eight correct outcomes out of ten within the calibrated domain; without that relationship, the operator is setting a number with no units. Methods that do not produce a per-pixel or per-instance probability do not receive an invented score: they are recorded with the reason they cannot be calibrated, and their threshold parameters are shown as operating decisions rather than as uncertainty. '}
        {/* live counts: data/derived/method-benchmark.json methods[].test.mean_brier / mean_ece */}
        {es
          ? `En la matriz actual ${calibrated.length} de ${benchmark.methods.length} métodos exponen probabilidades utilizables; los ${uncalibrated.length} restantes aparecen sin columna de calibración a propósito.`
          : `In the current matrix ${calibrated.length} of ${benchmark.methods.length} methods expose usable probabilities; the remaining ${uncalibrated.length} appear with no calibration column on purpose.`}</p>

      {calibrated.length ? (
        <div className="fs-matrix-scroll">
          <table className="fs-table">
            <thead>
              <tr>
                <th>ID</th><th>{es ? 'método' : 'method'}</th><th>{es ? 'familia' : 'family'}</th>
                <th className="num">{es ? 'Brier (menor mejor)' : 'Brier (lower better)'}</th>
                <th className="num">{es ? 'ECE (menor mejor)' : 'ECE (lower better)'}</th>
              </tr>
            </thead>
            <tbody>
              {calibrated.map((method) => (
                <tr key={method.id}>
                  <td>{method.id}</td><td>{method.name}</td>
                  <td>{es ? FAMILY_LABELS[method.tier].es : FAMILY_LABELS[method.tier].en}</td>
                  <td className="num">{fmt(method.test?.mean_brier, 4)}</td>
                  <td className="num">{fmt(method.test?.mean_ece, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Callout variant="honest" title={es ? 'Sin cifra inventada' : 'No invented score'}>
        <p>{es
          ? 'Una watershed no puntúa sus regiones y un umbral de Otsu no declara una probabilidad, así que para esos métodos no existe una calibración que medir. El artefacto guarda para cada uno el motivo en lugar de un número, y esta página lo respeta: la ausencia de una fila aquí es información, no un hueco. Además, la calibración medida vale dentro del dominio en que se calibró; el propio banco es sintético, así que estas cifras no autorizan un umbral de planta.'
          : 'A watershed does not score its regions and an Otsu threshold declares no probability, so for those methods there is no calibration to measure. The artifact stores the reason for each one instead of a number, and this page respects that: a missing row here is information, not a hole. Beyond that, measured calibration holds inside the domain it was calibrated on; the bench itself is synthetic, so these figures do not license a plant threshold.'}</p>
      </Callout>
      <Refs ids={['brier1950']} label="Refs" />
    </div>
  );
}
// ============================================================
// PROTOCOL · splits and aggregation
// ============================================================

function SplitsAndAggregation({ es, benchmark }: BenchmarkProps) {
  if (!benchmark) return <Loading es={es} />;
  return (
    <div className="prose">
      <h2>{es ? 'Una división por grupos, no por imágenes' : 'A split by groups, not by images'}</h2>
      <p className="measure">{es
        ? 'La comparación principal se hace sobre 64 imágenes de prueba intactas. La unidad de división no es la imagen sino el grupo de geometría latente: el generador produce varias imágenes a partir de la misma teselación de celdas, cambiando iluminación, desenfoque, movimiento o ruido, de modo que dos imágenes del mismo grupo comparten la disposición real de burbujas. Dividir por imagen dejaría la misma geometría en entrenamiento y en prueba con distinta apariencia, y un modelo podría memorizar la disposición y aparecer como si generalizara. La división por grupos lo impide por construcción: entrenamiento usa 192 muestras en 96 grupos, validación 64 en 32, calibración 64 en 32 y prueba 64 en 32, sin grupos de reserva sobrantes. Ese último cero es una restricción real y no un detalle: significa que no queda evidencia intacta para una selección adicional, y por eso la fusión de dos modelos quedó registrada como prohibida en lugar de intentada. La literatura de espuma lleva la misma preocupación con nombre propio: un estudio de 2026 en flotación de carbón se titula por la fuga de datos inducida por intervalos de secuencia impropios y su impacto en la confiabilidad de modelos de aprendizaje profundo para reconocimiento de imágenes de espuma, y aquí solo se citan su título, su revista, su fecha y sus autores.'
        : 'The primary comparison runs on 64 untouched test images. The split unit is not the image but the latent geometry group: the generator produces several images from the same cell tessellation, varying illumination, defocus, motion or noise, so two images in one group share the true bubble layout. Splitting per image would leave the same geometry in training and in test under a different appearance, and a model could memorise the layout and look as if it generalised. The grouped split prevents that by construction: training uses 192 samples in 96 groups, validation 64 in 32, calibration 64 in 32 and test 64 in 32, with no spare reserve groups. That final zero is a real constraint and not a detail: it means no untouched evidence is left for a further selection, which is why fusing two models is recorded as prohibited rather than attempted. The froth literature carries the same concern under its own name: a 2026 study in coal flotation is titled after improper sequence interval-induced data leakage and its impact on deep learning model reliability in froth image recognition, and only its title, journal, date and authors are cited here.'}{' '}<Cite id="weaire1999foams" paren /> <Cite id="aurenhammer1987" paren /> <Cite id="zhang2026leakage" paren /></p>

      {/* split sizes, group counts, reserve_groups and the 3 test evaluations:
          verification/n1-preregistered-ablation.json (dataset.splits, protocol) */}
      <SplitChain es={es} />

      <p className="measure">{es
        ? 'Cada división tiene un trabajo y solo uno. La validación selecciona la configuración, siempre por AP medio de validación, con la regla de selección escrita antes de correr cualquier experimento. La calibración fija los umbrales de post-proceso, que en el modelo de investigación son el umbral de primer plano 0,6, el de frontera 0,65, el de marcador 0,15, una distancia mínima entre marcadores de 3 píxeles y un peso de centro de 0,5. La prueba se evalúa al final, con todo fijo, y el programa completo de tres estudios gastó exactamente tres evaluaciones de prueba. Contar las evaluaciones importa porque la prueba deja de ser intacta la primera vez que una decisión la mira: cada mirada adicional es un grado de libertad no declarado, y el número de miradas es la única defensa auditable contra ese sesgo.'
        : 'Each split has one job and only one. Validation selects the configuration, always by validation mean AP, with the selection rule written down before any experiment ran. Calibration fixes the post-processing thresholds, which in the research model are a foreground threshold of 0.6, a boundary threshold of 0.65, a marker threshold of 0.15, a minimum marker distance of 3 pixels and a centre weight of 0.5. Test is evaluated at the end with everything fixed, and the whole three-study programme spent exactly three test evaluations. Counting the evaluations matters because the test split stops being untouched the first time a decision looks at it: every further look is an undeclared degree of freedom, and the number of looks is the only auditable defence against that bias.'}</p>

      <h3>{es ? 'Las reglas de agregación' : 'The aggregation rules'}</h3>
      <p className="measure">{es
        ? 'Las siguientes reglas son propiedades del evaluador, no convenciones que el lector tenga que suponer, y cada una existe porque su alternativa produce un número que se ve mejor de lo que es.'
        : 'The following rules are properties of the evaluator, not conventions a reader has to assume, and each one exists because its alternative produces a number that looks better than it is.'}</p>
      <ol className="measure">
        <li>{es
          ? 'Sin descartes silenciosos. Una celda método-caso que no logra producir un resultado es un error, no una fila ausente, y la compuerta de liberación falla cuando falta cualquier celda requerida. Un método que revienta en las imágenes difíciles no puede subir su media desapareciendo de ellas.'
          : 'No silent drops. A method-case cell that fails to produce a result is an error, not a missing row, and the release gate fails when any required cell is absent. A method that crashes on the hard images cannot raise its mean by vanishing from them.'}</li>
        <li>{es
          ? 'Los conteos viajan con los agregados. Cada media lleva el número de muestras del que salió, de modo que una media sobre cuatro imágenes de una condición nunca se lee como si tuviera el peso de una media sobre 64.'
          : 'Counts travel with aggregates. Every mean carries the sample count it came from, so a mean over the four images of one condition never reads as if it carried the weight of a mean over 64.'}</li>
        <li>{es
          ? 'El control vacío sigue siendo una prueba negativa. El caso sin ninguna burbuja real tiene AP indefinido por construcción, así que se registra como nulo y se excluye del ranking en lugar de puntuarse como perfecto o como cero. Puntuarlo en cualquiera de los dos sentidos premiaría o castigaría a un método por no tener nada que encontrar.'
          : 'The empty control stays a negative test. The case with no true bubbles has AP undefined by construction, so it is recorded as null and excluded from the ranking rather than scored as perfect or as zero. Scoring it either way would reward or punish a method for having nothing to find.'}</li>
        <li>{es
          ? 'Las condiciones se reportan separadas. Las 16 familias de condición se mantienen aparte, porque una media sobre condiciones esconde exactamente la falla que le importa a quien opera: el brillo especular, el movimiento rápido o la nube de microburbujas no se compensan entre sí.'
          : 'Conditions are reported separately. The 16 condition families are kept apart, because a mean over conditions hides exactly the failure an operator cares about: specular glare, fast motion and a microbubble cloud do not compensate for one another.'}</li>
        <li>{es
          ? 'Los protocolos nunca se mezclan. Las métricas de identidad por fotograma y las de propagación de video con indicaciones miden cosas distintas y nunca se promedian ni se rankean juntas.'
          : 'Protocols are never mixed. Framewise identity metrics and prompted video-propagation identity metrics measure different things and are never averaged or ranked together.'}</li>
      </ol>
      <p className="measure">{es
        ? 'La asociación entre instancias, tanto para el conteo agrupado como para la identidad entre fotogramas, se resuelve como un problema de asignación bipartita óptima sobre la matriz de solapamientos, no por vecino más cercano, para que ninguna instancia se empareje dos veces. Las métricas temporales que dependen de esa asociación se factorizan en detección y asociación en lugar de mezclarlas en un solo número.'
        : 'Association between instances, both for the pooled counts and for identity across frames, is solved as an optimal bipartite assignment over the overlap matrix rather than by nearest neighbour, so no instance is matched twice. The temporal metrics that depend on that association factorise detection and association instead of mixing them into a single number.'}{' '}<Cite id="kuhn1955hungarian" paren /> <Cite id="luiten2021hota" paren /></p>

      <Callout variant="honest" title={es ? 'Cobertura y alcance' : 'Coverage and scope'}>
        <p>{es
          ? `Cada uno de los ${benchmark.coverage.expected_methods} métodos tiene exactamente ${benchmark.coverage.expected_test_samples} resultados de prueba, y la matriz versionada contiene ${benchmark.coverage.observed_cells} celdas de las ${benchmark.coverage.expected_cells} esperadas. La suite canónica de casos de presentación es una superficie de diagnóstico y visualización: sus puntajes se conservan aparte y nunca se mezclan con el ranking de prueba. El control vacío permanece como prueba negativa y no como caso de exposición.`
          : `Every one of the ${benchmark.coverage.expected_methods} methods has exactly ${benchmark.coverage.expected_test_samples} test results, and the committed matrix contains ${benchmark.coverage.observed_cells} of the ${benchmark.coverage.expected_cells} expected cells. The canonical suite of presentation cases is a diagnostic and visualization surface: its scores are kept separate and never mixed into the test ranking. The empty control stays a negative test and not a presentation case.`}</p>
      </Callout>
      <Refs ids={['kuhn1955hungarian', 'luiten2021hota', 'weaire1999foams', 'aurenhammer1987', 'zhang2026leakage']} label="Refs" />
    </div>
  );
}

// ============================================================
// PROTOCOL · acceptance
// ============================================================

function Acceptance({ es, benchmark }: BenchmarkProps) {
  if (!benchmark) return <Loading es={es} />;
  const bar = benchmark.current_bar;
  const passes = benchmark.methods.filter((method) => (method.test?.mean_ap ?? 0) >= bar.threshold);
  /** The observed column is recomputed from the per-method rows of the same artifact rather than
   *  echoing the expected value, so a short row or a dropped condition family reads as incomplete.
   *  Sources: data/derived/method-benchmark.json methods[].test.n and
   *  methods[].test.robustness_by_condition. */
  const testCounts = benchmark.methods.map((method) => method.test?.n ?? 0);
  const observedTestSamples = testCounts.length ? Math.min(...testCounts) : 0;
  const sampleRowsComplete = testCounts.length === benchmark.coverage.expected_methods
    && testCounts.every((count) => count === benchmark.coverage.expected_test_samples);
  const observedConditions = new Set(
    benchmark.methods.flatMap((method) => Object.keys(method.test?.robustness_by_condition ?? {})),
  ).size;
  const conditionsComplete = observedConditions === benchmark.coverage.condition_count;
  return (
    <div className="prose">
      <h2>{es ? 'Qué tiene que cumplir una fila para entrar' : 'What a row has to satisfy to be admitted'}</h2>
      <p className="measure">{es
        ? 'Cada método del ladder requiere inferencia ejecutable, proveniencia, métricas retenidas, documentación y una declaración de carril de cómputo. La matriz reporta AP, PQ con sus componentes, F de frontera, errores morfométricos, robustez por condición, tiempo de ejecución y evidencia de modelo; los métodos temporales agregan identidad, fragmentación, eventos y flujo. La compuerta de desarrollo rechaza celdas ausentes y también metadatos de cómputo ausentes, lo que significa que un método no puede entrar mostrando solo su mejor cifra: si no trae latencia media, latencia p95, memoria pico medida, hardware y el tamaño con hash de su artefacto de modelo, la fila no se acepta. Esa exigencia es la que convierte la tabla en algo auditable en lugar de una lista de resultados reportados por sus autores.'
        : 'Every method in the ladder requires executable inference, provenance, held-out metrics, documentation and a compute-lane declaration. The matrix reports AP, PQ with its components, boundary F-score, morphometric errors, per-condition robustness, runtime and model evidence; temporal methods add identity, fragmentation, events and flow. The development gate rejects missing cells and also missing compute metadata, which means a method cannot be admitted by showing only its best figure: without mean latency, p95 latency, measured peak memory, hardware and the sized and hashed model artifact, the row is not accepted. That requirement is what turns the table into something auditable rather than a list of author-reported results.'}</p>

      {/* live coverage + bar: data/derived/method-benchmark.json (coverage, current_bar) */}
      <div className="fs-matrix-scroll">
        <table className="fs-table">
          <thead><tr><th>{es ? 'requisito de cobertura' : 'coverage requirement'}</th><th className="num">{es ? 'esperado' : 'expected'}</th><th className="num">{es ? 'observado' : 'observed'}</th><th>{es ? 'estado' : 'state'}</th></tr></thead>
          <tbody>
            <tr><td>{es ? 'métodos implementados y evaluados' : 'methods implemented and scored'}</td><td className="num">{benchmark.coverage.expected_methods}</td><td className="num">{benchmark.implemented_count}</td><td>{benchmark.implemented_count === benchmark.coverage.expected_methods ? (es ? 'completo' : 'complete') : (es ? 'incompleto' : 'incomplete')}</td></tr>
            {/* observed = min over methods[].test.n; complete only if every row reports the expected count */}
            <tr><td>{es ? 'muestras de prueba por método' : 'test samples per method'}</td><td className="num">{benchmark.coverage.expected_test_samples}</td><td className="num">{observedTestSamples}</td><td>{sampleRowsComplete ? (es ? 'completo' : 'complete') : (es ? 'incompleto' : 'incomplete')}</td></tr>
            <tr><td>{es ? 'celdas método-muestra' : 'method-sample cells'}</td><td className="num">{benchmark.coverage.expected_cells}</td><td className="num">{benchmark.coverage.observed_cells}</td><td>{benchmark.coverage.complete ? (es ? 'completo' : 'complete') : (es ? 'incompleto' : 'incomplete')}</td></tr>
            {/* observed = size of the union of methods[].test.robustness_by_condition keys */}
            <tr><td>{es ? 'familias de condición separadas' : 'condition families kept apart'}</td><td className="num">{benchmark.coverage.condition_count}</td><td className="num">{observedConditions}</td><td>{conditionsComplete ? (es ? 'completo' : 'complete') : (es ? 'incompleto' : 'incomplete')}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="fs-note">{es
        ? 'La columna esperada viene del bloque de cobertura del artefacto; la columna observada se recalcula en el navegador desde las filas por método del mismo archivo. El conteo de muestras es el menor que declara cualquier método y el de condiciones es la unión de las claves de condición presentes, de modo que una fila corta o una familia de condición perdida aparece aquí como incompleta en lugar de repetir el valor esperado.'
        : 'The expected column comes from the coverage block of the artifact; the observed column is recomputed in the browser from the per-method rows of the same file. The sample count is the lowest any method declares and the condition count is the union of the condition keys present, so a short row or a lost condition family shows up here as incomplete instead of echoing the expected value.'}</p>

      <p className="measure">{es
        ? `El umbral de comparación predeclarado es un AP de prueba de ${bar.threshold.toFixed(2)}. Es un umbral de banco sintético controlado y no una afirmación de disponibilidad para planta: dice que un método reconoce instancias lo bastante bien como para que valga la pena seguir midiéndolo, no que sirva en una celda de flotación. Hoy lo superan ${passes.length} métodos (${passes.map((method) => method.id).join(' · ')}), y el líder de la matriz es ${bar.leader?.id ?? '--'} con ${fmt(bar.leader?.mean_ap)}. El umbral se fijó antes de que existieran estos resultados, que es la única forma en que un umbral significa algo.`
        : `The predeclared comparison threshold is a test AP of ${bar.threshold.toFixed(2)}. It is a controlled synthetic-benchmark threshold and not a claim of plant readiness: it says a method recognises instances well enough to be worth measuring further, not that it works in a flotation cell. Today ${passes.length} methods clear it (${passes.map((method) => method.id).join(' · ')}), and the matrix leader is ${bar.leader?.id ?? '--'} at ${fmt(bar.leader?.mean_ap)}. The threshold was fixed before these results existed, which is the only way a threshold means anything.`}</p>

      <h3>{es ? 'La compuerta de finalista' : 'The finalist gate'}</h3>
      <p className="measure">{es
        ? 'Antes de gastar su única evaluación de prueba, el candidato de investigación tuvo que cruzar una compuerta escrita de antemano, y esa compuerta no es solo un mínimo de AP. Exige un AP de validación estrictamente superior al mejor previo de 0,49983, un AP mínimo de 0,075 en la peor condición y un máximo de cuatro condiciones degradadas en más de 0,03 respecto de la corrida de referencia. El candidato seleccionado observó 0,524 en validación, 0,12025 en su peor condición, que fue la nube de microburbujas, y dos condiciones degradadas: reventones con 0,04075 y espuma gruesa con 0,03625. La razón de incluir el peor caso y el conteo de degradaciones es que una media de validación puede subir mientras el método se rompe en la condición que más importa; sin esas dos cláusulas, la compuerta premiaría exactamente ese intercambio.'
        : 'Before spending its single test evaluation, the research candidate had to clear a gate written in advance, and that gate is not just an AP minimum. It requires a validation AP strictly above the previous best of 0.49983, a minimum AP of 0.075 on the worst condition, and at most four conditions degraded by more than 0.03 against the reference run. The selected candidate observed 0.524 on validation, 0.12025 on its worst condition, which was the microbubble cloud, and two degraded conditions: bursting at 0.04075 and coarse froth at 0.03625. The reason for including the worst case and the degradation count is that a validation mean can rise while the method breaks on the condition that matters most; without those two clauses, the gate would reward exactly that trade.'}</p>
      {/* finalist gate thresholds and observations: verification/n1-preregistered-ablation.json
          (studies[2].finalist_gate) */}
      <div className="fs-matrix-scroll">
        <table className="fs-table">
          <thead><tr><th>{es ? 'cláusula, fijada antes de correr' : 'clause, fixed before running'}</th><th className="num">{es ? 'exigido' : 'required'}</th><th className="num">{es ? 'observado' : 'observed'}</th></tr></thead>
          <tbody>
            <tr><td>{es ? 'AP de validación, estrictamente mayor' : 'validation AP, strictly greater'}</td><td className="num">0.49983</td><td className="num">0.52400</td></tr>
            <tr><td>{es ? 'AP medio en la peor condición' : 'mean AP on the worst condition'}</td><td className="num">0.07500</td><td className="num">0.12025</td></tr>
            <tr><td>{es ? 'condiciones degradadas en más de 0,03' : 'conditions degraded by more than 0.03'}</td><td className="num">4</td><td className="num">2</td></tr>
          </tbody>
        </table>
      </div>
      {/* three clauses and passed=true: verification/n1-preregistered-ablation.json studies[2].finalist_gate;
          evaluation count: protocol.final_test_evaluations = 3 and studies[2].untouched_test.evaluation_index = 3 */}
      <p className="fs-note">{es
        ? 'La compuerta llevaba exactamente estas tres cláusulas, escritas antes de correr, y el registro las marca como cumplidas. Gastar la evaluación de prueba fue la consecuencia de cumplirlas y no una cuarta cláusula: este estudio gastó una evaluación, la tercera y única evaluación final de prueba de todo el programa.'
        : 'The gate carried exactly these three clauses, written before running, and the record marks them as passed. Spending the test evaluation was the consequence of clearing them and not a fourth clause: this study spent one evaluation, the third and only final test evaluation of the whole programme.'}</p>

      <h3>{es ? 'Lo que la compuerta de liberación sigue bloqueando' : 'What the release gate still blocks'}</h3>
      <p className="measure">{es
        ? 'La aceptación de producto no depende de esta tabla. Sigue bloqueada hasta que un carril retenido real, licenciado y calibrado cumpla umbrales predeclarados, y el informe de liberación registra hoy exactamente un error: no hay fuente retenida real de espuma licenciada con muestras importadas y calibración. Ese error no es una nota al pie sino la condición de completitud del informe, que por lo tanto marca la versión actual como incompleta. Un inventario de artefactos en verde no puede anular esa compuerta científica, y la separación está escrita en código: las fuentes reales aceptadas se particionan por su campo de dominio, así que una fuente de dominio adyacente no puede satisfacer el requisito de espuma por mucha evidencia que acumule.'
        : 'Product acceptance does not depend on this table. It remains blocked until a licensed, calibrated real held-out lane meets predeclared thresholds, and the release report today records exactly one error: there is no accepted licensed real froth held-out source with imported samples and calibration. That error is not a footnote but the completeness condition of the report, which therefore marks the current version as incomplete. A green artifact inventory cannot override that scientific gate, and the separation is written in code: accepted real sources are partitioned by their domain field, so an adjacent-domain source cannot satisfy the froth requirement however much evidence it accumulates.'}{' '}<Cite id="fu2019" paren /> <Cite id="aldrich2010" paren /></p>

      <Callout variant="honest" title={es ? 'Completitud de implementación no es éxito de calidad' : 'Implementation completeness is not quality success'}>
        <p>{es
          ? `Los ${benchmark.implemented_count} métodos están implementados y evaluados sobre la misma prueba, y eso es una afirmación sobre cobertura, no sobre desempeño. Solo ${passes.length} superan el umbral controlado, la afirmación de superar el estado del arte permanece en falso, y las métricas sintéticas no son exactitud de planta real. Una afirmación de planta requiere un conjunto de datos de espuma real, representativo, etiquetado por expertos y gobernado por separado, más un protocolo de prueba externo bloqueado.`
          : `The ${benchmark.implemented_count} methods are implemented and scored on the same test, and that is a statement about coverage, not about performance. Only ${passes.length} clear the controlled threshold, the beyond-state-of-the-art claim stays false, and synthetic metrics are not real-plant accuracy. A plant claim requires a separately governed, representative, expert-labelled real froth dataset plus a locked external test protocol.`}</p>
      </Callout>
      <Refs ids={['aldrich2010', 'fu2019']} label="Refs" />
    </div>
  );
}

// ============================================================
// PROTOCOL · lanes and parity
// ============================================================

function LanesAndParity({ es }: { es: boolean }) {
  // browser vs offline parity: verification/classical-live-parity.json (acceptance + methods[])
  const parity: Array<{ id: string; name: { en: string; es: string }; delta: number; apAgree: number; boundaryAgree: number; ratio: number }> = [
    { id: 'C1', name: { en: 'Otsu + connected components', es: 'Otsu con componentes conexas' }, delta: 0.00575, apAgree: 0.8346, boundaryAgree: 0.98674, ratio: 1.0436 },
    { id: 'C3', name: { en: 'Marker-controlled watershed', es: 'Watershed controlada por marcadores' }, delta: 0.00200, apAgree: 0.9343, boundaryAgree: 0.99675, ratio: 1.0011 },
    { id: 'C4', name: { en: 'Distance-transform watershed', es: 'Watershed por transformada de distancia' }, delta: 0.02613, apAgree: 0.7056, boundaryAgree: 0.95336, ratio: 0.8777 },
  ];
  return (
    <div className="prose">
      <h2>{es ? 'Por qué el navegador ejecuta menos de lo que se mide' : 'Why the browser runs less than what is measured'}</h2>
      <p className="measure">{es
        ? 'La compuerta de cómputo protege la validez científica en lugar de la comodidad de la demostración. Una carga de trabajo es viva solo cuando el navegador puede ejecutar el mismo método dentro de límites acotados de descarga, memoria, tiempo de ejecución y dependencias; si no, corre fuera de línea y la web reproduce evidencia compacta ya calculada. Quedan necesariamente fuera de línea la generación y materialización del conjunto de datos, los benchmarks autoritativos en Python de los métodos clásicos, el entrenamiento y la calibración en GPU, los runtimes oficiales de investigación, la evaluación de prueba y canónica, la exportación a ONNX, los barridos temporales y el inventario de liberación. Todo eso requiere ruedas de visión por computador en Python, artefactos de modelo grandes, acceso al sistema de archivos o capacidad de GPU que un sitio estático no puede garantizar.'
        : 'The compute gate protects scientific validity rather than the convenience of the demonstration. A workload is live only when the browser can execute the same method within bounded download, memory, runtime and dependency limits; otherwise it runs offline and the web replays compact precomputed evidence. Necessarily offline are dataset generation and materialization, the authoritative Python benchmarks of the classical methods, GPU training and calibration, the official research runtimes, test and canonical evaluation, ONNX export, temporal sweeps and the release inventory. All of that needs Python computer-vision wheels, large model artifacts, filesystem access or GPU capacity that a static site cannot guarantee.'}{' '}<Cite id="onnxruntimeweb" paren /> <Cite id="webgpu" paren /></p>

      <p className="measure">{es
        ? 'Del lado vivo quedan tres gemelos en TypeScript de métodos clásicos para inferencia exploratoria de un solo fotograma, más un modelo de la familia SAM ligero que corre en el navegador con WebGPU y respaldo en WASM, lo que da exactamente cuatro métodos interactivos sobre imagen subida, junto a validación de imagen, corrección ligera de brillo, morfometría, reducción a distribución de tamaños y gráficos. El resto de los métodos clásicos y todos los aprendidos y fundacionales permanecen como implementaciones autoritativas fuera de línea y se muestran en la web solo como reproducción canónica versionada. La distinción es deliberada y está declarada en cada panel: un método que aparece con máscaras precalculadas no se está ejecutando en su navegador.'
        : 'On the live side there are three TypeScript twins of classical methods for exploratory single-frame inference, plus a lightweight SAM-family model that runs in the browser with WebGPU and a WASM fallback, giving exactly four interactive methods over an uploaded image, alongside image validation, light deglare, morphometry, size-distribution reduction and plots. The remaining classical methods and all learned and foundation methods stay authoritative offline implementations and are shown on the web only as committed canonical replay. The distinction is deliberate and declared in every panel: a method appearing with precomputed masks is not executing in your browser.'}{' '}<Cite id="transformersjs" paren /> <Cite id="chen2023slimsam" paren /></p>

      <h3>{es ? 'La paridad que un gemelo debe demostrar' : 'The parity a twin must demonstrate'}</h3>
      <p className="measure">{es
        ? 'Un gemelo de navegador que se desvía convierte el panel vivo en un método distinto usando la misma etiqueta, así que la paridad se mide y se acepta con criterios fijados de antemano. La selección de casos es la primera muestra intacta de prueba de cada una de las 16 condiciones, para que ninguna condición quede fuera de la comparación. Un método se acepta como vivo solo si su diferencia absoluta media de AP contra la implementación de referencia no supera 0,03, si la concordancia media de AP entre navegador y referencia es al menos 0,5, si la concordancia media de F de frontera es al menos 0,95 y si la razón media de conteo de instancias queda entre 0,75 y 1,25. Los tres gemelos expuestos cumplen las cuatro cláusulas; los valores observados están abajo, y las dos cláusulas más ajustadas son ahora la diferencia de AP y la concordancia de frontera, ambas de C4, que queda en 0,0261 contra un techo de 0,03 y en 0,95336 contra un piso de 0,95. La fila de C3 cambió el 2026-08-01: al mover el gemelo a la superficie adoptada apareció un error de marcadores fuera de la máscara de espuma que inflaba su conteo vivo, y al corregirlo su razón de conteo pasó de 1,242 a 1,001.'
        : 'A browser twin that drifts turns the live panel into a different method wearing the same label, so parity is measured and accepted against criteria fixed in advance. The case selection is the first untouched test sample from each of the 16 conditions, so no condition is left out of the comparison. A method is accepted as live only if its mean absolute AP difference against the reference implementation stays at or below 0.03, if the mean AP agreement between browser and reference is at least 0.5, if the mean boundary F-score agreement is at least 0.95, and if the mean instance-count ratio falls between 0.75 and 1.25. The three exposed twins satisfy all four clauses; the observed values are below, and the two tightest clauses are now the AP difference and the boundary agreement, both of them C4, which sits at 0.0261 against a 0.03 ceiling and at 0.95336 against a 0.95 floor. The C3 row moved on 2026-08-01: taking the twin to the adopted surface exposed an out-of-mask marker bug that had been inflating its live instance count, and fixing it took the count ratio from 1.242 to 1.001.'}</p>

      <div className="fs-matrix-scroll">
        <table className="fs-table">
          <thead>
            <tr>
              <th>ID</th><th>{es ? 'gemelo aceptado' : 'accepted twin'}</th>
              <th className="num">{es ? 'dif. abs. de AP (max 0,03)' : 'abs AP delta (max 0.03)'}</th>
              <th className="num">{es ? 'concord. AP (min 0,50)' : 'AP agreement (min 0.50)'}</th>
              <th className="num">{es ? 'concord. frontera (min 0,95)' : 'boundary agreement (min 0.95)'}</th>
              <th className="num">{es ? 'razón de conteo (0,75 a 1,25)' : 'count ratio (0.75 to 1.25)'}</th>
            </tr>
          </thead>
          <tbody>
            {parity.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td><td>{es ? row.name.es : row.name.en}</td>
                <td className="num">{row.delta.toFixed(5)}</td>
                <td className="num">{row.apAgree.toFixed(4)}</td>
                <td className="num">{row.boundaryAgree.toFixed(5)}</td>
                <td className="num">{row.ratio.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fs-note">{es
        ? 'Paridad medida sobre 16 muestras retenidas, una por condición, contra la implementación de referencia fuera de línea con su hash registrado.'
        : 'Parity measured over 16 held-out samples, one per condition, against the offline reference implementation with its recorded hash.'}</p>

      <Callout variant="honest" title={es ? 'El método vivo no es el mejor método' : 'The live method is not the best method'}>
        <p>{es
          ? 'El modelo ligero de la familia SAM que corre en el navegador es interacción acotada, no el método más fuerte del banco ni el que produce los números de esta página. Los mejores resultados provienen de runtimes que necesitan GPU y ruedas de Python, y se reproducen como evidencia versionada. Confundir las dos cosas llevaría a leer la latencia del panel vivo como la latencia del líder del ranking, que son medidas de sistemas distintos.'
          : 'The lightweight SAM-family model running in the browser is bounded interaction, not the strongest method on the bench nor the one producing the numbers on this page. The best results come from runtimes that need a GPU and Python wheels, and they are replayed as committed evidence. Confusing the two would mean reading the live panel latency as the latency of the ranking leader, which are measurements of different systems.'}</p>
      </Callout>
      <Refs ids={['transformersjs', 'onnxruntimeweb', 'webgpu', 'chen2023slimsam']} label="Refs" />
    </div>
  );
}
// ============================================================
// RESULTS · ranking
// ============================================================

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
  const byAp = rankBy(benchmark.methods, 'mean_ap');
  const leader = byAp[0];
  const second = byAp[1];
  const bestClassical = byAp.find((method) => method.tier === 'classical');
  const data: BarDatum[] = ranked.map((method) => ({
    key: method.id,
    label: `${method.id} ${method.name}`,
    value: metricValue(method.test, metric) ?? 0,
    color: FAMILY_COLORS[method.tier],
  }));
  return (
    <div className="prose">
      <h2>{es ? 'Cambie la métrica y cambia la pregunta' : 'Change the metric and the question changes'}</h2>
      <p className="measure">{es
        ? 'El AP favorece la correspondencia estricta de instancias; el AP50 tolera una localización aproximada; la PQ combina reconocimiento y solapamiento en un producto; la F de frontera mide el borde y no el objeto; la distancia entre distribuciones y el error de la media de Sauter miden la utilidad de proceso. Los seis selectores de abajo recorren el mismo artefacto: ninguna cifra se recalcula en el navegador, y el orden cambia porque las métricas preguntan cosas distintas, no porque haya varias versiones de la evidencia. Los dos últimos selectores invierten el sentido, donde menor es mejor, y la nota bajo el gráfico lo declara en cada caso.'
        : 'AP favours strict instance correspondence; AP50 tolerates approximate localization; PQ combines recognition and overlap in a product; the boundary F-score measures the edge rather than the object; the distribution distance and the Sauter-mean error measure process usefulness. The six selectors below all read the same artifact: no figure is recomputed in the browser, and the order changes because the metrics ask different questions, not because there are several versions of the evidence. The last two selectors invert the sense, where lower is better, and the note under the chart declares that in each case.'}</p>

      {/* landscape + bars + every number below: data/derived/method-benchmark.json */}
      <PanelBoundary label={es ? 'panorama de AP' : 'AP landscape'}>
        <BenchmarkLandscape methods={byAp} threshold={benchmark.current_bar.threshold} es={es} />
      </PanelBoundary>

      <div className="fs-metric-picker">
        {([
          ['mean_ap', 'Mask AP'],
          ['mean_ap50', 'AP50'],
          ['mean_pq', 'PQ'],
          ['mean_boundary_fscore', es ? 'F de frontera' : 'Boundary F'],
          ['mean_bsd_wasserstein', es ? 'W1 de tamaños' : 'Size W1'],
          ['mean_d32_relative_error', es ? 'error de d32' : 'd32 error'],
        ] as Array<[MetricKey, string]>).map(([key, label]) => (
          <button key={key} type="button" className={metric === key ? 'on' : ''} onClick={() => setMetric(key)}>{label}</button>
        ))}
      </div>
      <PanelBoundary label={es ? `ranking por ${metricLabel(metric, es)}` : `ranking by ${metricLabel(metric, es)}`}>
        <BarChart
          data={data}
          ariaLabel={es ? `${metricLabel(metric, es)} por método` : `${metricLabel(metric, es)} by method`}
          valueFmt={(value) => value.toFixed(3)}
          defaultBaseline="zero"
          note={lowerIsBetter
            ? (es ? 'Menor es mejor para esta métrica. Valores en píxeles o en fracción relativa, sobre 64 muestras retenidas.' : 'Lower is better for this metric. Values in pixels or as a relative fraction, over 64 held-out samples.')
            : (es ? 'Mayor es mejor para esta métrica, sobre 64 muestras retenidas.' : 'Higher is better for this metric, over 64 held-out samples.')}
        />
      </PanelBoundary>
      <div className="fs-family-legend">
        {Object.entries(FAMILY_LABELS).map(([key, label]) => (
          <span key={key}><i style={{ background: FAMILY_COLORS[key as MethodBenchmarkRow['tier']] }} />{es ? label.es : label.en}</span>
        ))}
      </div>

      <h3>{es ? 'Qué significa el liderazgo aquí' : 'What leadership means here'}</h3>
      {/* ensemble-to-ensemble spread 0.011828 over two disjoint three-seed draws on validation
          (published 0.524, seeds 28-29-30 0.535828), against a test margin of 0.008703:
          verification/p1-ensemble-spread.json, preregistered experiment P-1 */}
      <p className="measure">{es
        ? `El modelo de investigación, publicado como un ensamble de tres semillas, obtiene la mayor correspondencia de instancias en este banco controlado con AP ${fmt(leader?.test?.mean_ap)}, y también lidera en AP50, PQ y F de frontera, cuatro métricas que no están perfectamente correlacionadas, lo que refuerza el resultado. El segundo lugar es ${second?.id} con ${fmt(second?.test?.mean_ap)}, y el mejor método clásico es ${bestClassical?.id} con ${fmt(bestClassical?.test?.mean_ap)}. Sin embargo el margen sobre el segundo es de 0,0087, y la dispersión entre semillas de un modelo individual con la misma configuración, medida en el mismo estudio, es de 0,037: cuatro veces mayor. El ensamble suprime esa varianza por construcción, y un segundo sorteo de tres semillas disjunto, medido solo en validación, sitúa la dispersión entre ensambles en 0,0118, mayor que el margen mismo: los resultados de prueba de N1 y Cellpose-SAM no son distinguibles a la dispersión entre ensambles medida. Esto es un resultado de tabla de posiciones sobre datos sintéticos frente a una línea base con dos pasadas de ajuste fino, y no una afirmación de superioridad.`
        : `The research model, published as a three-seed ensemble, achieves the strongest instance correspondence on this controlled bench at AP ${fmt(leader?.test?.mean_ap)}, and also leads on AP50, PQ and boundary F-score, four metrics that are not perfectly correlated, which strengthens the result. Second place is ${second?.id} at ${fmt(second?.test?.mean_ap)}, and the best classical method is ${bestClassical?.id} at ${fmt(bestClassical?.test?.mean_ap)}. The margin over second place is 0.0087, however, and the seed spread of a single model with the same configuration, measured in the same study, is 0.037: four times larger. The ensemble suppresses that variance by construction, and a second, disjoint three-seed draw, measured on validation only, puts the ensemble-to-ensemble spread at 0.0118, larger than the margin itself: the N1 and Cellpose-SAM test results are not distinguishable at the measured ensemble spread. This is a leaderboard result on synthetic data against a baseline with a two-pass fine-tuning budget, not a superiority claim.`}{' '}<Cite id="stringer2021cellpose" paren /> <Cite id="ronneberger2015unet" paren /></p>

      <div className="fs-matrix-scroll">
        <table className="fs-table">
          <thead><tr><th>#</th><th>ID</th><th>{es ? 'método' : 'method'}</th><th>{es ? 'familia' : 'family'}</th><th className="num">{metricLabel(metric, es)}</th></tr></thead>
          <tbody>
            {ranked.slice(0, 6).map((method, index) => (
              <tr key={method.id}>
                <td>{String(index + 1).padStart(2, '0')}</td><td>{method.id}</td><td>{method.name}</td>
                <td>{es ? FAMILY_LABELS[method.tier].es : FAMILY_LABELS[method.tier].en}</td>
                <td className="num">{fmt(metricValue(method.test, metric))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Callout variant="honest" title={es ? 'Un margen menor que el ruido de semilla' : 'A margin smaller than the seed noise'}>
        <p>{es
          ? 'El primer y el segundo lugar de esta tabla están separados por menos de la dispersión que produce cambiar la semilla de entrenamiento de un solo modelo. La lectura defendible es que ambos están en el mismo grupo de cabeza de este banco, no que uno sea mejor segmentador. Cualquier reordenamiento entre esos dos, en cualquier dirección, no debería sorprender en una repetición del experimento.'
          : 'First and second place in this table are separated by less than the spread produced by changing the training seed of a single model. The defensible reading is that both sit in the same leading group on this bench, not that one is the better segmenter. Any reordering between those two, in either direction, should not be surprising in a repetition of the experiment.'}</p>
      </Callout>
      <Refs ids={['stringer2021cellpose', 'ronneberger2015unet']} label="Refs" />
    </div>
  );
}

// ============================================================
// RESULTS · conditions
// ============================================================

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
    sub: `${es ? 'global' : 'global'} ${global.toFixed(2)}`,
  }));
  const winner = rows[0];
  const sampleCount = benchmark.methods.find((method) => method.test?.robustness_by_condition?.[condition])?.test?.robustness_by_condition?.[condition]?.n;
  return (
    <div className="prose">
      <h2>{es ? 'La robustez es condicional, no absoluta' : 'Robustness is conditional, not absolute'}</h2>
      <p className="measure">{es
        ? `Las ${benchmark.coverage.condition_count} familias de condición se mantienen separadas porque promediarlas esconde exactamente la falla que interesa. Cada condición aporta pocas muestras por método, así que la lectura correcta no es el valor absoluto sino la diferencia contra la media global del propio método: eso separa una debilidad general de una sensibilidad específica, que es la distinción que decide si un método necesita otro post-proceso o otro modelo. La compuerta de finalista usa exactamente esta descomposición, con un piso en la peor condición y un tope al número de condiciones que pueden empeorar, de modo que la robustez condicional no es un análisis posterior sino un criterio de aceptación.`
        : `The ${benchmark.coverage.condition_count} condition families are kept apart because averaging them hides exactly the failure of interest. Each condition contributes few samples per method, so the correct reading is not the absolute value but the difference against the method own global mean: that separates a general weakness from a condition-specific sensitivity, which is the distinction deciding whether a method needs different post-processing or a different model. The finalist gate uses exactly this decomposition, with a floor on the worst condition and a cap on how many conditions may worsen, so conditional robustness is not a post-hoc analysis but an acceptance criterion.`}
        {es
          ? ' Que la condición sea la variable que decide, y no una media global, es la lectura habitual en visión de espuma: el estado de operación se reconoce por rasgos que cambian con la condición de la superficie, y un sensor blando construido sobre una media condicional oculta se rompe cuando la condición cambia.'
          : ' That the condition is the deciding variable, rather than a global mean, is the usual reading in froth vision: the operating state is recognised from features that change with the surface condition, and a soft sensor built on a hidden conditional mean breaks when the condition changes.'}{' '}<Cite id="wang2018" paren /> <Cite id="aldrich2010" paren /></p>

      <Equation
        tex={String.raw`\Delta_{m,c} = \mathrm{AP}_{m,c} - \overline{\mathrm{AP}}_m`}
        caption={es
          ? 'cambio de AP del método m bajo la condición c respecto de su propia media sobre las 64 muestras retenidas'
          : 'AP change for method m under condition c relative to its own mean over the 64 held-out samples'}
      />

      <label className="fs-inline-selector">{es ? 'Condición retenida' : 'Held-out condition'}
        <select value={condition} onChange={(event) => setCondition(event.target.value)}>
          {conditions.map((item) => <option key={item} value={item}>{`${conditionLabel(item, es)} · ${item}`}</option>)}
        </select>
      </label>
      {/* per-condition values: data/derived/method-benchmark.json methods[].test.robustness_by_condition */}
      <PanelBoundary label={es ? `condición ${conditionLabel(condition, es)}` : `condition ${conditionLabel(condition, es)}`}>
        <BarChart
          data={data}
          ariaLabel={es ? `AP de máscara bajo ${conditionLabel(condition, es)}` : `mask AP under ${conditionLabel(condition, es)}`}
          valueFmt={(value) => value.toFixed(3)}
          defaultBaseline="zero"
          note={es
            ? `Verde: esta condición supera el promedio global del propio método. Naranja: queda por debajo. ${sampleCount ?? 0} muestras por método en esta condición.`
            : `Green: this condition exceeds the method own global mean. Orange: it falls below it. ${sampleCount ?? 0} samples per method in this condition.`}
        />
      </PanelBoundary>
      <div className="fs-matrix-scroll">
        <table className="fs-table">
          <thead><tr><th>{es ? 'lectura de la condición' : 'condition reading'}</th><th>{es ? 'valor' : 'value'}</th></tr></thead>
          <tbody>
            <tr><td>{es ? 'mejor método en esta condición' : 'best method under this condition'}</td><td>{winner ? `${winner.method.id} ${winner.method.name}` : '--'}</td></tr>
            <tr><td>{es ? 'su AP en la condición' : 'its AP under the condition'}</td><td className="num">{winner ? winner.value.toFixed(3) : '--'}</td></tr>
            <tr><td>{es ? 'su cambio contra la media global' : 'its change against the global mean'}</td><td className="num">{winner ? signed(winner.value - winner.global) : '--'}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="measure">{conditionInterpretation(condition, es)}</p>
      <Callout variant="honest" title={es ? 'Pocas muestras por celda' : 'Few samples per cell'}>
        <p>{es
          ? 'Una media sobre cuatro imágenes tiene un intervalo amplio, así que un cambio pequeño entre dos condiciones no distingue métodos. Por eso el conteo viaja con el valor en el gráfico y en la matriz, y por eso la compuerta pone un piso en la peor condición en lugar de premiar una media condicional alta.'
          : 'A mean over four images has a wide interval, so a small change between two conditions does not distinguish methods. That is why the count travels with the value in the chart and in the matrix, and why the gate sets a floor on the worst condition instead of rewarding a high conditional mean.'}</p>
      </Callout>
      <Refs ids={['aldrich2010', 'wang2018']} label="Refs" />
    </div>
  );
}

// ============================================================
// RESULTS · compute
// ============================================================

function ComputeAnalysis({ es, benchmark }: BenchmarkProps) {
  if (!benchmark) return <Loading es={es} />;
  const rows = benchmark.methods.filter((method) => method.test && method.compute.mean_inference_ms > 0);
  const maxLatency = maxOr(rows.map((method) => method.compute.mean_inference_ms), 10);
  const fastest = [...rows].sort((a, b) => a.compute.mean_inference_ms - b.compute.mean_inference_ms);
  // The table under the frontier definition must BE the frontier. fastest.slice(0, 6) was
  // rendered there and it is not one: it kept dominated C5 and C3 and omitted frontier members
  // L1 and N1. This computes the stated formula exactly: m stays unless some other method is at
  // least as good on BOTH axes and strictly better on one.
  const frontierRows = fastest.filter((m) => !rows.some((o) => o !== m
    && o.test!.mean_ap >= m.test!.mean_ap
    && o.compute.mean_inference_ms <= m.compute.mean_inference_ms
    && (o.test!.mean_ap > m.test!.mean_ap || o.compute.mean_inference_ms < m.compute.mean_inference_ms)));
  return (
    <div className="prose">
      <h2>{es ? 'La frontera entre calidad y costo' : 'The frontier between quality and cost'}</h2>
      <p className="measure">{es
        ? 'Cada fila de la matriz trae latencia media por imagen, latencia p95, memoria pico medida, el dispositivo y el carril de hardware declarado, y esas cifras se aceptan como parte de la fila: un método sin ellas no entra. La frontera de Pareto reúne los métodos que ningún otro domina en las dos dimensiones a la vez, y es la lectura relevante para decidir dónde puede ejecutarse algo: en una cámara de borde, en un servidor de planta o solo fuera de línea. El p95 importa más que la media cuando el consumidor es un lazo de control, porque un lazo se rompe con la cola y no con el promedio.'
        : 'Every row of the matrix carries mean latency per image, p95 latency, measured peak memory, the device and the declared hardware lane, and those figures are accepted as part of the row: a method without them is not admitted. The Pareto frontier collects the methods that no other dominates in both dimensions at once, and it is the relevant reading for deciding where something can run: on an edge camera, on a plant server or only offline. The p95 matters more than the mean when the consumer is a control loop, because a loop breaks on the tail and not on the average.'}</p>
      <Equation
        tex={String.raw`\mathcal{P} = \{\, m : \nexists\, m' \;(\mathrm{AP}_{m'} \ge \mathrm{AP}_m \;\wedge\; t_{m'} \le t_m) \,\}`}
        caption={es
          ? 'frontera de Pareto: los métodos que ningún otro supera en calidad y a la vez iguala o mejora en latencia media'
          : 'Pareto frontier: the methods that no other one beats on quality while also matching or improving mean latency'}
      />
      {/* latency, memory, device: data/derived/method-benchmark.json methods[].compute */}
      <PanelBoundary label={es ? 'dispersión de costo' : 'compute scatter'}>
        <MetricScatter
          methods={rows}
          x={(method) => method.compute.mean_inference_ms}
          y={(method) => method.test!.mean_ap}
          xDomain={[0, maxLatency]}
          yDomain={[0, .6]}
          xLabel={es ? 'latencia media, ms por imagen (escala logarítmica)' : 'mean latency, ms per image (log scale)'}
          yLabel="Mask AP"
          logX
          bubble={(method) => Math.max(5, Math.min(18, 5 + Math.log10(method.compute.peak_memory_mib + 1) * 3))}
          es={es}
        />
      </PanelBoundary>
      <div className="fs-matrix-scroll">
        <table className="fs-table">
          <thead>
            <tr>
              <th>ID</th><th>{es ? 'método' : 'method'}</th><th>{es ? 'carril' : 'lane'}</th>
              <th className="num">{es ? 'media ms' : 'mean ms'}</th><th className="num">p95 ms</th>
              <th className="num">MiB</th><th className="num">Mask AP</th>
            </tr>
          </thead>
          <tbody>
            {frontierRows.map((method) => (
              <tr key={method.id}>
                <td>{method.id}</td><td>{method.name}</td><td>{method.compute.hardware_lane.toUpperCase()}</td>
                <td className="num">{fmt(method.compute.mean_inference_ms, 1)}</td>
                <td className="num">{fmt(method.compute.p95_inference_ms, 1)}</td>
                <td className="num">{fmt(method.compute.peak_memory_mib, 0)}</td>
                <td className="num">{fmt(method.test?.mean_ap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fs-note">{es
        ? 'La latencia no incluye transferencia de red ni decodificación de video. Los carriles CPU y GPU se comparan como mediciones de sus runtimes declarados, no como hardware equivalente, y la memoria pico se mide con métricas distintas en cada carril, lo que la matriz completa declara fila por fila.'
        : 'Latency excludes network transfer and video decoding. The CPU and GPU lanes are compared as measurements of their declared runtimes, not as equivalent hardware, and peak memory is measured with a different metric in each lane, which the complete matrix declares row by row.'}</p>
    </div>
  );
}

// ============================================================
// RESULTS · complete matrix
// ============================================================

function CompleteMatrix({ es, benchmark }: BenchmarkProps) {
  const [selectedId, setSelectedId] = useState('N1');
  if (!benchmark) return <Loading es={es} />;
  const selected = benchmark.methods.find((method) => method.id === selectedId) ?? benchmark.methods[0];
  return (
    <div className="prose">
      <h2>{es ? 'Todos los valores, sin convertirlos en portada' : 'Every value, without turning it into the front page'}</h2>
      <p className="measure">{es
        ? 'La matriz completa existe para auditoría: cada fila reúne las métricas macro, el costo y el estado de calidad del método bajo el umbral vigente, de modo que cualquier afirmación de las otras pestañas se puede verificar contra la misma fuente. La columna de AP de máscara lleva el barrido de diez umbrales definido en la primera pestaña'
        : 'The complete matrix exists for audit: each row gathers the macro metrics, the cost and the quality state of the method under the current threshold, so any claim made in the other tabs can be checked against the same source. The mask AP column carries the ten-threshold sweep defined in the first tab'}{' '}<Cite id="lin2014coco" paren />
        {es
          ? ', y las dos columnas donde menor es mejor, la distancia 1-Wasserstein entre distribuciones de tamaños'
          : ', and the two columns where lower is better, the 1-Wasserstein distance between size distributions'}{' '}<Cite id="villani2009ot" paren />
        {es
          ? ' y el error relativo de la media de Sauter'
          : ' and the relative error of the Sauter mean'}{' '}<Cite id="sautermean" paren />
        {es
          ? ', quedan señaladas como tales en su encabezado. Seleccione una fila para obtener debajo una lectura técnica compacta con el carril de hardware y el dispositivo en que se midió.'
          : ', are marked as such in their header. Select a row to obtain a compact technical reading below, with the hardware lane and the device it was measured on.'}</p>
      <div className="fs-matrix-scroll">
        <table className="fs-table fs-benchmark-matrix">
          <thead>
            <tr>
              <th>ID</th><th>{es ? 'método' : 'method'}</th><th>{es ? 'familia' : 'family'}</th>
              <th className="num">AP</th><th className="num">AP50</th><th className="num">PQ</th>
              <th className="num">{es ? 'F frontera' : 'Boundary F'}</th>
              <th className="num">{es ? 'W1 (menor mejor)' : 'W1 (lower better)'}</th>
              <th className="num">{es ? 'error d32 (menor mejor)' : 'd32 error (lower better)'}</th>
              <th className="num">ms</th><th className="num">p95</th><th className="num">MiB</th>
              <th>{es ? 'umbral' : 'threshold'}</th>
            </tr>
          </thead>
          <tbody>
            {benchmark.methods.map((method) => (
              <tr key={method.id} className={selectedId === method.id ? 'fs-selected-row' : ''} onClick={() => setSelectedId(method.id)}>
                <td><button type="button" className="fs-method-pick">{method.id}</button></td>
                <td>{method.name}</td>
                <td>{es ? FAMILY_LABELS[method.tier].es : FAMILY_LABELS[method.tier].en}</td>
                <td className="num">{fmt(method.test?.mean_ap)}</td>
                <td className="num">{fmt(method.test?.mean_ap50)}</td>
                <td className="num">{fmt(method.test?.mean_pq)}</td>
                <td className="num">{fmt(method.test?.mean_boundary_fscore)}</td>
                <td className="num">{fmt(method.test?.mean_bsd_wasserstein)}</td>
                <td className="num">{fmt(method.test?.mean_d32_relative_error)}</td>
                <td className="num">{fmt(method.compute.mean_inference_ms, 1)}</td>
                <td className="num">{fmt(method.compute.p95_inference_ms, 1)}</td>
                <td className="num">{fmt(method.compute.peak_memory_mib, 0)}</td>
                <td>{qualityLabel(method.quality_status, es)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <MethodReading method={selected} es={es} />
      <Refs ids={['lin2014coco', 'sautermean', 'villani2009ot']} label="Refs" />
    </div>
  );
}
// ============================================================
// TRANSFER · the doubt and the data
// ============================================================

function TransferDataset({ es, real }: { es: boolean; real: RealAdjacentDoc | null }) {
  const failed = real ? real.methods.reduce((total, row) => total + row.n_failed, 0) : null;
  return (
    <div className="prose">
      <h2>{es ? 'La duda que el banco sintético no puede tocar' : 'The doubt the synthetic bench cannot touch'}</h2>
      <p className="measure">{es
        ? 'Todos los números de la matriz principal provienen del generador de espuma de Laguerre incluido en el repositorio. Es un banco controlado con verdad de terreno exacta, y es la herramienta correcta para comparar métodos bajo condiciones conocidas. Deja intacta una duda grande: el ranking completo de 15 métodos podría ser un artefacto de las estadísticas de un solo generador. Un método afinado, aunque sea indirectamente, a fronteras de lamela sintéticas podría colapsar en cuanto vea un sensor real. Esta prueba es la verificación de esa duda, y es lo único que verifica: no reemplaza validación en planta, no mide exactitud de flotación y no convierte ninguna cifra de esta página en una medición industrial.'
        : 'Every number in the main matrix comes from the Laguerre foam generator included in the repository. It is a controlled bench with exact ground truth, and it is the right tool for comparing methods under known conditions. It leaves one large doubt untouched: the whole 15-method ranking could be an artefact of one generator statistics. A method tuned, however indirectly, to synthetic lamella boundaries might collapse the moment it sees a real sensor. This test is the check on that doubt, and it is the only thing it checks: it does not replace plant validation, it does not measure flotation accuracy, and it does not turn any figure on this page into an industrial measurement.'}{' '}<Cite id="weaire1999foams" paren /> <Cite id="aurenhammer1987" paren /></p>

      <h3>{es ? 'Por qué los datos no son espuma' : 'Why the data is not froth'}</h3>
      <p className="measure">{es
        ? 'No existe un conjunto de datos de espuma real, anotado burbuja por burbuja y con licencia abierta, en los repositorios públicos. La búsqueda quedó verificada contra fuentes primarias el 28 de julio de 2026: el candidato de la plataforma de competencias no declara licencia alguna, el conjunto del portal institucional de datos está tras un muro de pago, el de la plataforma de anotación es no comercial con obra derivada compartida, lo que lo descartó, y el archivo general de investigación no devuelve ningún conjunto de segmentación de espuma. La razón de fondo es estructural: las imágenes de espuma son datos operacionales de planta y las plantas no las publican. La escasez de espuma etiquetada es un obstáculo reconocido en la literatura del área, no una particularidad de esta búsqueda.'
        : 'There is no openly licensed, real, per-bubble-annotated froth dataset in the public repositories. The search was verified against primary sources on 28 July 2026: the competition-platform candidate declares no licence at all, the institutional data-portal set is behind a paywall, the annotation-platform set is non-commercial with share-alike, which dropped it, and the general research archive returns no froth segmentation dataset. The underlying reason is structural: froth imagery is operational plant data and plants do not publish it. The scarcity of labelled froth is an acknowledged obstacle in the field literature, not a peculiarity of this search.'}{' '}<Cite id="fu2019" paren /> <Cite id="aldrich2010" paren /></p>
      <p className="measure">{es
        ? 'Hay una segunda vía que el área ya publicó, y queda registrada aquí porque sigue abierta. Puntuar no exige estrictamente etiquetas burbuja por burbuja: un artículo de congreso de 2025 se titula por la segmentación débil y la evaluación no supervisada aplicadas a imágenes de espuma de flotación, que es la forma de evaluación que admiten los cuadros reales sin etiquetar. Nada en esta página la usa todavía, y aquí no se reporta ninguna cifra obtenida así. Se nombra para que la ausencia de un banco de espuma etiquetado no se lea como la ausencia de toda forma de medir sobre espuma real.'
        : 'There is a second route the field has published, and it is recorded here because it stays open. Scoring does not strictly require per-bubble labels: a 2025 conference paper is titled after weak segmentation and unsupervised evaluation applied to froth flotation images, which is the shape of evaluation that unlabelled real frames admit. Nothing on this page uses it yet, and nothing here reports a number obtained that way. It is named so that the absence of a labelled froth benchmark is not read as the absence of any way to measure on real froth.'}{' '}<Cite id="prokopov2025unsupervised" paren /></p>
      <p className="measure">{es
        ? 'Frente a eso la elección era entre no tener ninguna evidencia real, o tener evidencia real de un dominio adyacente etiquetada precisamente como tal. La segunda vale más que la primera, siempre que nunca se le permita hacerse pasar por la primera. El conjunto adoptado son imágenes reales de microscopía de núcleos celulares publicadas por una colección institucional de bancos de imágenes biológicas bajo renuncia total de derechos, de modo que nada aguas abajo hereda una restricción. Eso importó: el candidato anterior era no comercial, lo que habría gravado la evaluación y discutiblemente cualquier modelo ajustado contra ella.'
        : 'Against that, the choice was between no real evidence at all, or real evidence from an adjacent domain labelled precisely as such. The second is worth more than the first, provided it is never allowed to pass as the first. The adopted collection is real microscopy images of cell nuclei published by an institutional bioimage benchmark collection under a full rights waiver, so nothing downstream inherits a restriction. That mattered: the previous candidate was non-commercial, which would have encumbered the evaluation and arguably any model tuned against it.'}</p>

      {/* dataset facts: data/derived/real-adjacent-dataset-manifest.json
          (sample_count, splits, grouping, calibrated_sample_count, annotation_review);
          instance total = sum of test_samples[].instance_count */}
      <div className="fs-matrix-scroll">
        <table className="fs-table">
          <thead><tr><th>{es ? 'propiedad de la fuente' : 'source property'}</th><th>{es ? 'valor registrado' : 'recorded value'}</th></tr></thead>
          <tbody>
            <tr><td>{es ? 'dominio declarado' : 'declared domain'}</td><td>{real ? real.domain : 'adjacent'}</td></tr>
            <tr><td>{es ? 'licencia' : 'licence'}</td><td>{real ? real.license : 'CC0-1.0'}</td></tr>
            <tr><td>{es ? 'imágenes reales en la colección' : 'real images in the collection'}</td><td className="num">670</td></tr>
            <tr><td>{es ? 'muestras del carril retenido' : 'held-out lane samples'}</td><td className="num">{real ? real.n_samples : 64}</td></tr>
            <tr><td>{es ? 'objetos anotados en ese carril' : 'annotated objects in that lane'}</td><td className="num">4979</td></tr>
            <tr><td>{es ? 'grupos de división, y grupos en prueba' : 'split groups, and groups in test'}</td><td className="num">21 · 2</td></tr>
            <tr><td>{es ? 'muestras con escala física' : 'samples with a physical scale'}</td><td className="num">0</td></tr>
            <tr><td>{es ? 'origen de las anotaciones' : 'origin of the annotations'}</td><td>{es ? 'publicadas y curadas por expertos, no producidas aquí' : 'published and expert-curated, not produced here'}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="measure">{es
        ? 'El carril retenido tiene 64 muestras con 4979 núcleos anotados, elegido para igualar la división de prueba de espuma de 64 muestras y que las dos se lean en el mismo pie. La división es por grupos: la colección no trae metadatos de adquisición, así que el agrupamiento usa tamaño de imagen e intensidad media gruesa para mantener campos de visión casi duplicados del mismo experimento en la misma división. Eso es un sustituto de la adquisición, no la verdad sobre ella, y el manifiesto lo declara así en lugar de insinuar un agrupamiento real por experimento. Tampoco hay escala física: la microscopía de núcleos no trae milímetros por píxel, de modo que los descriptores físicos no se calculan para esta fuente y las métricas de tamaño quedan en píxeles.'
        : 'The held-out lane has 64 samples with 4,979 annotated nuclei, chosen to match the 64-sample froth test split so the two read on the same footing. The split is grouped: the collection ships no acquisition metadata, so grouping uses image size and coarse mean intensity to keep near-duplicate fields of view from one experiment in the same split. That is a proxy for acquisition, not the truth about it, and the manifest declares it as such instead of implying real per-experiment grouping. There is no physical scale either: nuclei microscopy carries no millimetres per pixel, so physical descriptors are not computed for this source and size metrics stay in pixels.'}</p>
      <p className="measure">{es
        ? 'Geométricamente es el mismo problema que la espuma: objetos densamente empacados, aproximadamente convexos, en contacto, donde la frontera entre dos objetos adyacentes es la única evidencia que los separa. Eso es precisamente lo que cada método del ladder está construido para resolver, y es la razón por la que el resultado es informativo en lugar de anecdótico. Lo que no comparte con la espuma es todo lo demás: no hay física de lamela, no hay coalescencia de burbujas, no hay brillo especular de una superficie mojada y no hay escala física.'
        : 'Geometrically it is the same problem as froth: densely packed, roughly convex objects, touching, where the boundary between two adjacent objects is the only evidence separating them. That is precisely what every method in the ladder is built to resolve, and it is the reason the result is informative rather than anecdotal. What it does not share with froth is everything else: there is no lamella physics, no bubble coalescence, no specular glare from a wet surface and no physical scale.'}{' '}<Cite id="wang2003froth" paren /></p>

      <h3>{es ? 'El protocolo, y por qué nada se reentrenó' : 'The protocol, and why nothing was retrained'}</h3>
      <p className="measure">{es
        ? 'El post-proceso calibrado sobre espuma sintética se aplica sin cambios. Ningún método se reentrena, se reajusta ni recibe umbrales nuevos para estos datos, y eso es deliberado. Reajustar mediría qué tan bien se puede afinar cada arquitectura a núcleos celulares, que es una pregunta sobre las arquitecturas y no sobre este repositorio. Aplicar la calibración de espuma sin tocarla mide transferencia: si los ajustes que funcionan sobre el generador se sostienen frente a un sensor real. Un método que colapsa aquí está informando que su calibración era específica del generador, que es exactamente el modo de falla que conviene conocer antes de que alguien apunte el sistema a la cámara de una planta. Un método que lanza una excepción sobre una imagen real se registra como muestra fallida con su error, no se descarta: no poder ejecutar es un resultado.'
        : 'The post-processing calibrated on synthetic froth is applied unchanged. No method is retrained, refitted or given new thresholds for this data, and that is deliberate. Refitting would measure how well each architecture can be tuned to cell nuclei, which is a question about the architectures and not about this repository. Applying the froth calibration untouched measures transfer: whether the settings that work on the generator carry to a real sensor. A method that collapses here is reporting that its calibration was generator-specific, which is exactly the failure mode worth knowing before anyone points the system at a plant camera. A method that raises an exception on a real image is recorded as a failed sample with its error, not dropped: failing to run is a result.'}
        {/* live: sum of methods[].n_failed in data/derived/real-adjacent-benchmark.json */}
        {failed != null
          ? (es ? ` En la corrida versionada las muestras fallidas suman ${failed}.` : ` In the committed run the failed samples total ${failed}.`)
          : ''}</p>

      <Callout variant="honest" title={es ? 'Lo que esta evidencia puede y no puede sostener' : 'What this evidence can and cannot support'}>
        <p>{es
          ? 'Puede sostener una afirmación sobre si el ladder de métodos sobrevive a fotografías reales de instancias densas en contacto, bajo ajustes fijados en espuma. No puede sostener, bajo ninguna circunstancia, una afirmación sobre exactitud de flotación: estos son núcleos celulares. La frontera está aplicada en código y no dejada a la prosa. La fuente lleva su dominio marcado como adyacente y el constructor del informe de liberación particiona las fuentes reales aceptadas por ese campo, así que solo una fuente de espuma puede satisfacer el requisito real de la compuerta. Antes de adoptar esta fuente la compuerta aceptaba cualquier fuente cuyo tipo empezara por real, lo que habría dejado que núcleos celulares cruzaran silenciosamente el bloqueo de espuma y habría convertido el informe en una afirmación falsa.'
          : 'It can support a statement about whether the method ladder survives real photographs of dense touching instances, under froth-fitted settings. It cannot support, under any circumstances, a statement about flotation accuracy: these are cell nuclei. The boundary is enforced in code rather than left to prose. The source carries its domain marked as adjacent and the release-report builder partitions accepted real sources by that field, so only a froth source can satisfy the gate real-data requirement. Before this source was adopted the gate matched any source whose kind began with real, which would have let cell nuclei silently clear the froth blocker and turned the report into a false statement.'}</p>
      </Callout>
      <Refs ids={['fu2019', 'aldrich2010', 'wang2003froth', 'weaire1999foams', 'aurenhammer1987', 'prokopov2025unsupervised']} label="Refs" />
    </div>
  );
}

// ============================================================
// TRANSFER · result
// ============================================================

function TransferResult({ es, benchmark, real }: { es: boolean; benchmark: MethodBenchmarkDoc | null; real: RealAdjacentDoc | null }) {
  const joined = useMemo(() => {
    if (!benchmark || !real) return [];
    return real.methods
      .map((row) => {
        const froth = benchmark.methods.find((method) => method.id === row.id)?.test?.mean_ap ?? null;
        return froth == null ? null : { ...row, froth, delta: row.mean_ap - froth };
      })
      .filter((row): row is RealAdjacentRow & { froth: number; delta: number } => row != null)
      .sort((a, b) => b.mean_ap - a.mean_ap);
  }, [benchmark, real]);

  /** Tier means reproduce the grouped table in the transfer record: classical, trained in this
   *  repository (task-trained + research), and the model pretrained elsewhere (foundation).
   *  Sources: data/derived/real-adjacent-benchmark.json + data/derived/method-benchmark.json. */
  const tiers = useMemo(() => {
    const groups: Array<{ id: string; en: string; es: string; test: (tier: MethodBenchmarkRow['tier']) => boolean }> = [
      { id: 'classical', en: 'classical, no learned prior', es: 'clásicos, sin prior aprendido', test: (tier) => tier === 'classical' },
      { id: 'trained', en: 'trained in this repository', es: 'entrenados en este repositorio', test: (tier) => tier === 'domain-sota' || tier === 'frontier' },
      { id: 'pretrained', en: 'pretrained elsewhere, lightly fine-tuned here', es: 'preentrenados fuera, afinados levemente aquí', test: (tier) => tier === 'foundation' },
    ];
    return groups.map((group) => {
      const members = joined.filter((row) => group.test(row.tier));
      const mean = members.length ? members.reduce((total, row) => total + row.delta, 0) / members.length : null;
      return { ...group, count: members.length, mean };
    });
  }, [joined]);

  if (!benchmark) return <Loading es={es} />;
  if (!real) {
    return (
      <p className="fs-note">{es
        ? 'El artefacto de transferencia no está disponible en esta compilación, así que esta pestaña no muestra ninguna cifra en lugar de estimarlas.'
        : 'The transfer artifact is not available in this build, so this tab shows no figures rather than estimating them.'}</p>
    );
  }

  const leader = joined[0];
  const frothLeader = [...joined].sort((a, b) => b.froth - a.froth)[0];
  const frothLeaderRank = frothLeader ? joined.findIndex((row) => row.id === frothLeader.id) + 1 : 0;
  /** The classical family is not unanimous, so the count is taken from the rows instead of asserted.
   *  After the 2026-08-01 C3/C7 adoption two classical rows fall on the real lane, not one:
   *  C2 gradient immersion watershed 0.017266 to 0.0, and C3 highlight-seeded watershed 0.219578 to
   *  0.127828. C7 moves the other way, 0.232563 to 0.301313.
   *  Sources: data/derived/real-adjacent-benchmark.json methods[] and
   *  data/derived/method-benchmark.json methods[].test.mean_ap. */
  const classicalRows = joined.filter((row) => row.tier === 'classical');
  const classicalUp = classicalRows.filter((row) => row.delta > 0);
  const classicalDown = classicalRows.filter((row) => row.delta <= 0);
  const data: BarDatum[] = joined.map((row) => ({
    key: row.id,
    label: `${row.id} ${row.name}`,
    value: row.delta,
    color: row.delta >= 0 ? 'var(--color-good)' : 'var(--color-warn)',
    sub: `${es ? 'real' : 'real'} ${row.mean_ap.toFixed(3)} · ${es ? 'espuma' : 'froth'} ${row.froth.toFixed(3)}`,
  }));

  return (
    <div className="prose">
      <h2>{es ? 'El ranking sintético no se transfiere' : 'The synthetic ranking does not transfer'}</h2>
      <p className="measure">{es
        ? `Sobre ${real.n_samples} imágenes reales retenidas, con los ajustes de espuma aplicados sin cambios y ningún método reentrenado, el orden se reorganiza por completo. El método que lidera el banco de espuma con ${fmt(frothLeader?.froth)} cae a la posición ${frothLeaderRank} con ${fmt(frothLeader?.mean_ap)}, una caída de ${fmt(frothLeader ? frothLeader.froth - frothLeader.mean_ap : null)}. El nuevo líder es ${leader?.id} ${leader?.name} con ${fmt(leader?.mean_ap)}. El patrón no es ruido: cada modelo entrenado sobre las 192 muestras sintéticas se degrada, y ${classicalUp.length} de los ${classicalRows.length} métodos clásicos, que no tienen prior aprendido que sobreajustar, mejoran. Los ${classicalDown.length} que no mejoran se nombran en vez de promediarse: ${classicalDown.map((row) => `${row.id} ${row.name} cae de ${row.froth.toFixed(3)} a ${row.mean_ap.toFixed(3)} con un AP50 de ${row.mean_ap50.toFixed(4)}`).join('; ')}. Las razones son distintas. C2 ya estaba en 0,017 sobre espuma, y su exceso de segmentos casi no deja emparejamientos aceptados sobre núcleos. C3 es el caso instructivo: la superficie de inundación adoptada el 2026-08-01, la intensidad negada, es un mecanismo DE ESPUMA, porque supone un reflejo especular brillante por burbuja y un borde de Plateau oscuro entre burbujas, y un núcleo celular no tiene ninguno de los dos; en este dominio la transformada de distancia que reemplazó era la mejor superficie. Queda registrado, no reparado: el cambio se adoptó sobre una fuente de espuma y se confirmó sobre una porción de reserva de espuma, y esta partición no autoriza ninguna afirmación sobre espuma. C7, con su watershed restringida adoptada el mismo día, se mueve en la dirección contraria y sube de 0,233 a 0,301. El único método que nunca se entrenó en este repositorio es también el único método aprendido que mejora.`
        : `Over ${real.n_samples} real held-out images, with the froth settings applied unchanged and no method retrained, the order reorganises completely. The method leading the froth bench at ${fmt(frothLeader?.froth)} falls to position ${frothLeaderRank} at ${fmt(frothLeader?.mean_ap)}, a drop of ${fmt(frothLeader ? frothLeader.froth - frothLeader.mean_ap : null)}. The new leader is ${leader?.id} ${leader?.name} at ${fmt(leader?.mean_ap)}. The pattern is not noise: every model trained on the 192 synthetic samples degrades, and ${classicalUp.length} of the ${classicalRows.length} classical methods, which have no learned prior to overfit, improve. The ${classicalDown.length} that do not are named rather than averaged away: ${classicalDown.map((row) => `${row.id} ${row.name} falls from ${row.froth.toFixed(3)} to ${row.mean_ap.toFixed(3)} at an AP50 of ${row.mean_ap50.toFixed(4)}`).join('; ')}. The reasons differ. C2 was already at 0.017 on froth, and its surplus of segments leaves almost no accepted match on nuclei either. C3 is the instructive case: the flooding surface adopted on 2026-08-01, the negated intensity, is a FROTH mechanism, since it assumes a bright specular highlight per bubble and a dark Plateau border between bubbles, and a cell nucleus has neither; on this domain the distance transform it replaced was the better surface. That is recorded, not repaired: the change was adopted on a froth source and confirmed on a froth reserve slice, and this split supports no froth statement. C7, whose constrained watershed was adopted the same day, moves the other way and rises from 0.233 to 0.301. The one method never trained in this repository is also the only learned method that improves.`}{' '}<Cite id="stringer2021cellpose" paren /></p>

      <PanelBoundary label={es ? 'cambio de AP en transferencia' : 'transfer AP change'}>
        <BarChart
          data={data}
          ariaLabel={es ? 'cambio de AP entre imágenes reales y el banco sintético' : 'AP change between real images and the synthetic bench'}
          valueFmt={(value) => signed(value)}
          defaultBaseline="zero"
          note={es
            ? 'Verde: el método gana AP sobre imágenes reales. Naranja: lo pierde. Cada barra lleva su AP real y su AP de espuma.'
            : 'Green: the method gains AP on real images. Orange: it loses AP. Each bar carries its real AP and its froth AP.'}
        />
      </PanelBoundary>

      <div className="fs-matrix-scroll">
        <table className="fs-table">
          <thead><tr><th>ID</th><th>{es ? 'método' : 'method'}</th><th>{es ? 'familia' : 'family'}</th><th className="num">{es ? 'AP real' : 'real AP'}</th><th className="num">{es ? 'AP espuma' : 'froth AP'}</th><th className="num">{es ? 'cambio' : 'delta'}</th><th className="num">{es ? 'fallidas' : 'failed'}</th></tr></thead>
          <tbody>
            {joined.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td><td>{row.name}</td>
                <td>{es ? FAMILY_LABELS[row.tier].es : FAMILY_LABELS[row.tier].en}</td>
                <td className="num">{row.mean_ap.toFixed(3)}</td>
                <td className="num">{row.froth.toFixed(3)}</td>
                <td className="num">{signed(row.delta)}</td>
                <td className="num">{row.n_failed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>{es ? 'Agrupado por familia el patrón es inequívoco' : 'Grouped by family the pattern is unambiguous'}</h3>
      <div className="fs-matrix-scroll">
        <table className="fs-table">
          <thead><tr><th>{es ? 'familia' : 'family'}</th><th className="num">{es ? 'métodos' : 'methods'}</th><th className="num">{es ? 'cambio medio de AP' : 'mean AP change'}</th></tr></thead>
          <tbody>
            {tiers.map((tier) => (
              <tr key={tier.id}>
                <td>{es ? tier.es : tier.en}</td>
                <td className="num">{tier.count}</td>
                <td className="num">{tier.mean == null ? '--' : signed(tier.mean)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="measure">{es
        ? 'Las tres medias se calculan en el navegador a partir de los dos artefactos versionados, así que la tabla no puede desviarse de las filas de arriba. La lectura es directa: el signo del cambio se predice mejor por el origen del prior que por la calidad en el banco sintético. Un método sin prior aprendido no tiene nada específico del generador que perder; un modelo entrenado sobre 192 imágenes sintéticas sí, y lo pierde todo de una vez cuando cambia el sensor.'
        : 'The three means are computed in the browser from the two committed artifacts, so the table cannot drift from the rows above. The reading is direct: the sign of the change is better predicted by the origin of the prior than by quality on the synthetic bench. A method with no learned prior has nothing generator-specific to lose; a model trained on 192 synthetic images does, and it loses all of it at once when the sensor changes.'}</p>

      <DomainGateDiagram es={es} samples={real.n_samples} />

      <Callout variant="honest" title={es ? 'La medición que limita la anterior' : 'The measurement that bounds the previous one'}>
        <p>{es
          ? 'Esta prueba no revoca la matriz principal: la acota. El ranking de espuma sigue siendo una comparación reproducible bajo condiciones conocidas, y ahora se sabe cuánto de ese orden pertenece al generador. Nada de este resultado autoriza una afirmación sobre espuma real, en ninguna dirección, porque no hay espuma real en la evidencia.'
          : 'This test does not revoke the main matrix: it bounds it. The froth ranking remains a reproducible comparison under known conditions, and now it is known how much of that order belongs to the generator. Nothing in this result licenses a statement about real froth, in either direction, because there is no real froth in the evidence.'}</p>
      </Callout>
      <Refs ids={['stringer2021cellpose']} label="Refs" />
    </div>
  );
}

// ============================================================
// TRANSFER · honest reading
// ============================================================

function TransferReading({ es }: { es: boolean }) {
  return (
    <div className="prose">
      <h2>{es ? 'Dos lecturas fáciles, y las dos son erróneas' : 'Two easy readings, and both are wrong'}</h2>
      <p className="measure">{es
        ? 'Sería fácil leer este resultado como que el modelo de investigación es malo, e igual de fácil leerlo como que el ranking no vale nada. Ambas lecturas son incorrectas, y la segunda advertencia importa tanto como la primera. Lo que el resultado sostiene con justicia es que la ventaja del modelo de investigación sobre la línea base en el banco de espuma es específica del dominio y no sobrevive a un cambio de dominio: quien lea el margen de 0,0087 en espuma como evidencia de un segmentador mejor en general lo está sobreinterpretando. El ranking de espuma es una afirmación sobre el generador, y esta es la medición que muestra cuánto de él lo es.'
        : 'It would be easy to read this result as the research model being bad, and equally easy to read it as the ranking being worthless. Both readings are wrong, and the second caveat matters as much as the first. What the result fairly supports is that the advantage of the research model over the baseline on the froth bench is domain-specific and does not survive a change of domain: anyone reading the 0.0087 froth margin as evidence of a generally better segmenter is overreading it. The froth ranking is a statement about the generator, and this is the measurement that shows how much of it is.'}</p>
      <p className="measure">{es
        ? 'Lo que no sostiene es la conclusión de que la línea base sea mejor sobre espuma. El conjunto adyacente es microscopía celular, que es el dominio de preentrenamiento de ese modelo generalista: está jugando de local. Los especialistas de espuma se entrenaron sobre 192 imágenes de espuma y luego recibieron una modalidad de imagen distinta con sus umbrales de espuma intactos; la degradación es el resultado esperado, no un defecto revelado. La lectura justa es que esta prueba mide robustez al cambio de dominio, y en ese eje el generalista preentrenado gana y los especialistas pequeños pierden, que es lo que la literatura predeciría.'
        : 'What it does not support is the conclusion that the baseline is better on froth. The adjacent collection is cell microscopy, which is the pretraining domain of that generalist model: it is playing at home. The froth specialists were trained on 192 froth images and then handed a different imaging modality with their froth thresholds intact; degradation is the expected outcome, not a defect revealed. The fair reading is that this test measures robustness to domain shift, and on that axis the pretrained generalist wins and the small specialists lose, which is what the literature would predict.'}{' '}<Cite id="stringer2021cellpose" paren /> <Cite id="kirillov2023" paren /></p>
      <h3>{es ? 'La mejora de los clásicos también informa' : 'The classical improvement is informative too'}</h3>
      <p className="measure">{es
        ? 'Otsu con componentes conexas, el método más simple del banco, queda segundo aquí con 0,339 después de puntuar 0,065 sobre espuma. Eso no ocurre porque se haya vuelto mejor, sino porque los núcleos celulares son un problema de instancias más fácil que la espuma: son más dispersos, más redondos, de mayor contraste y rara vez comparten frontera como lo hacen las burbujas empacadas. Es un recordatorio útil de cuánta de la dificultad del banco de espuma es intrínseca a la espuma, y una advertencia contra leer cualquier cifra absoluta de esta pestaña como transferible a una celda de flotación. La misma advertencia aplica al líder: 0,709 sobre núcleos no predice 0,709 sobre espuma.'
        : 'Otsu with connected components, the simplest method on the bench, comes second here at 0.339 after scoring 0.065 on froth. That does not happen because it became better, but because cell nuclei are an easier instance problem than froth: they are sparser, rounder, higher contrast, and rarely share a boundary the way packed bubbles do. It is a useful reminder of how much of the froth bench difficulty is intrinsic to froth, and a warning against reading any absolute figure in this tab as transferable to a flotation cell. The same warning applies to the leader: 0.709 on nuclei does not predict 0.709 on froth.'}{' '}<Cite id="meyer1994" paren /></p>
      <Callout variant="honest" title={es ? 'El resumen honesto, exactamente así de estrecho' : 'The honest summary, exactly this narrow'}>
        <p>{es
          ? 'La tabla de posiciones de espuma es un resultado específico del generador, y nada en este repositorio demuestra todavía que algún método sea bueno con espuma real. Eso seguirá siendo verdad hasta que existan datos de espuma real, y el error de la compuerta de liberación lo seguirá diciendo por mucha evidencia adyacente que se acumule.'
          : 'The froth leaderboard is a generator-specific result, and nothing in this repository yet demonstrates that any method is good at real froth. That stays true until real froth data exists, and the release gate error keeps saying so however much adjacent evidence accumulates.'}</p>
      </Callout>
      <Refs ids={['stringer2021cellpose', 'kirillov2023', 'meyer1994']} label="Refs" />
    </div>
  );
}
// ============================================================
// SCOPE
// ============================================================

function Scope({ es, benchmark }: BenchmarkProps) {
  if (!benchmark) return <Loading es={es} />;
  const bar = benchmark.current_bar;
  const passes = benchmark.methods.filter((method) => (method.test?.mean_ap ?? 0) >= bar.threshold);
  return (
    <div className="prose">
      <h2>{es ? 'Lo que esta evidencia permite afirmar' : 'What this evidence supports'}</h2>
      <p className="measure">{es
        ? 'Una afirmación no puede exceder el protocolo, los datos ni las métricas que la sostienen, y las tres cosas están acotadas aquí. El protocolo es una división por grupos con selección en validación, umbrales fijados en calibración y una prueba intacta evaluada un número contado de veces. Los datos son sintéticos, generados por una teselación de espuma seca con verdad de terreno exacta'
        : 'A claim cannot exceed the protocol, the data or the metrics that support it, and all three are bounded here. The protocol is a grouped split with selection on validation, thresholds fixed on calibration, and an untouched test evaluated a counted number of times. The data is synthetic, generated by a dry-foam tessellation with exact ground truth'}{' '}<Cite id="weaire1999foams" paren />
        {es
          ? ', más un carril adyacente real que no es espuma. Las métricas son las definidas en la primera pestaña, con su convención de emparejamiento declarada. Cualquier lectura que salga de ese producto es una extrapolación, y esta página no la hace.'
          : ', plus a real adjacent lane that is not froth. The metrics are the ones defined in the first tab, with their matching convention declared. Any reading outside that product is an extrapolation, and this page does not make it.'}</p>
      <Equation
        tex={String.raw`\mathrm{claim} \subseteq \mathrm{protocol} \times \mathrm{data} \times \mathrm{metrics}`}
        caption={es
          ? 'la regla que ordena esta página: ninguna afirmación puede exceder el protocolo, los datos ni las métricas que la producen'
          : 'the rule that governs this page: no claim may exceed the protocol, the data or the metrics that produce it'}
      />
      <ClaimBoundaryDiagram es={es} methods={benchmark.coverage.expected_methods} samples={benchmark.coverage.expected_test_samples} />
      <div className="two-col">
        <div>
          <h3>{es ? 'Sostenido por la evidencia' : 'Supported by the evidence'}</h3>
          <ul>
            <li>{es ? `${benchmark.implemented_count} implementaciones bajo el mismo protocolo de prueba, con ${benchmark.coverage.observed_cells} celdas completas.` : `${benchmark.implemented_count} implementations under the same test protocol, with ${benchmark.coverage.observed_cells} complete cells.`}</li>
            <li>{es ? 'Ranking, robustez por condición, morfometría, calibración y costo medidos, no reportados por sus autores.' : 'Measured ranking, per-condition robustness, morphometry, calibration and cost, not author-reported.'}</li>
            <li>{es ? `${bar.leader?.id ?? '--'} lidera este banco con AP ${fmt(bar.leader?.mean_ap)}, y ${passes.length} métodos superan el umbral de ${bar.threshold.toFixed(2)}.` : `${bar.leader?.id ?? '--'} leads this bench at AP ${fmt(bar.leader?.mean_ap)}, and ${passes.length} methods clear the ${bar.threshold.toFixed(2)} threshold.`}</li>
            <li>{es ? 'Que ese orden es en buena parte específico del generador, medido sobre 64 fotografías reales de instancias densas.' : 'That the order is substantially generator-specific, measured over 64 real photographs of dense instances.'}</li>
            <li>{es ? 'Paridad demostrada entre los tres métodos vivos del navegador y sus implementaciones de referencia.' : 'Demonstrated parity between the three live browser methods and their reference implementations.'}</li>
          </ul>
        </div>
        <div>
          <h3>{es ? 'No sostenido todavía' : 'Not supported yet'}</h3>
          <ul>
            <li>{es ? 'Exactitud representativa en una celda de flotación real.' : 'Representative accuracy on a real flotation cell.'}</li>
            <li>{es ? 'Transferencia entre cámaras, minerales o circuitos.' : 'Transfer across cameras, ores or circuits.'}</li>
            <li>{es ? 'Calibración física universal de tamaños, en ninguna fuente evaluada.' : 'Universal physical size calibration, in any evaluated source.'}</li>
            <li>{es ? 'Superioridad fuera de este protocolo, ni un umbral de alarma para operación.' : 'Superiority outside this protocol, nor an alarm threshold for operation.'}</li>
            {/* measured spread 0.011828 vs test margin 0.008703: verification/p1-ensemble-spread.json */}
            <li>{es ? 'Distinción entre el líder y la línea base: con una dispersión entre ensambles medida de 0,0118 sobre dos sorteos disjuntos, los resultados de prueba de N1 y Cellpose-SAM no son distinguibles a la dispersión entre ensambles medida.' : 'A distinction between the leader and the baseline: with an ensemble-to-ensemble spread of 0.0118 measured over two disjoint draws, the N1 and Cellpose-SAM test results are not distinguishable at the measured ensemble spread.'}</li>
          </ul>
        </div>
      </div>

      <h3>{es ? 'El resultado de investigación, con sus límites' : 'The research result, with its limits'}</h3>
      {/* study APs, in the order the programme ran them: verification/n1-preregistered-ablation.json
          studies[0].untouched_test_mean_ap = 0.471671875, studies[1].untouched_test.mean_ap = 0.490359375,
          studies[2].untouched_test.mean_ap = 0.51859375; baseline protocol.claim_reference_mean_ap = 0.5098906 */}
      <p className="measure">{es
        ? 'Tres estudios preregistrados registraron sobre la prueba intacta un AP de 0,4717, luego 0,4904 y finalmente 0,5186, por delante de la línea base con 0,5099. El tercer estudio refutó su propia hipótesis: la brecha contra la línea base no era un déficit de entrenamiento que un calendario más largo cerrara. Promediando semillas, pasar de 80 a 120 épocas vale cerca de 0,002, mientras que la dispersión entre semillas de la misma configuración es 0,037, así que la tendencia aparentemente monótona sobre longitudes de entrenamiento era una sola semilla medida en cada longitud. Lo que sí cerró la brecha fue promediar tres semillas en el espacio de logits, porque suprime una varianza mayor que la brecha misma. El estudio se registró antes de correr, con su hipótesis y su regla de selección escritas, y el resultado quedó publicado como refutación en lugar de reescribirse como confirmación.'
        : 'Three preregistered studies recorded an untouched-test AP of 0.4717, then 0.4904 and finally 0.5186, ahead of the baseline at 0.5099. The third study refuted its own hypothesis: the gap to the baseline was not an under-training deficit that a longer schedule would close. Averaged over seeds, going from 80 to 120 epochs is worth about 0.002, while the seed spread of the same configuration is 0.037, so the apparently monotone trend over training lengths was one seed measured at each length. What did close the gap was averaging three seeds in logit space, because it suppresses a variance larger than the gap itself. The study was registered before running, with its hypothesis and its selection rule written down, and the result was published as a refutation instead of being rewritten as a confirmation.'}</p>
      {/* study values, seed spread, margin and compute: verification/n1-preregistered-ablation.json */}
      <div className="fs-matrix-scroll">
        <table className="fs-table">
          <thead><tr><th>{es ? 'cifra del programa preregistrado' : 'figure from the preregistered programme'}</th><th className="num">{es ? 'valor' : 'value'}</th></tr></thead>
          <tbody>
            <tr><td>{es ? 'AP de prueba del modelo publicado' : 'test AP of the published model'}</td><td className="num">0.51859</td></tr>
            <tr><td>{es ? 'AP de prueba de la línea base medida' : 'test AP of the measured baseline'}</td><td className="num">0.50989</td></tr>
            <tr><td>{es ? 'margen sobre la línea base' : 'margin over the baseline'}</td><td className="num">0.00870</td></tr>
            <tr><td>{es ? 'dispersión entre semillas de un modelo individual' : 'seed spread of a single model'}</td><td className="num">0.03744</td></tr>
            <tr><td>{es ? 'ganancia de 80 a 120 épocas, promediando semillas' : 'gain from 80 to 120 epochs, averaged over seeds'}</td><td className="num">0.00200</td></tr>
            <tr><td>{es ? 'evaluaciones de prueba del programa completo' : 'test evaluations across the whole programme'}</td><td className="num">3</td></tr>
            <tr><td>{es ? 'ensambles evaluados' : 'ensembles evaluated'}</td><td className="num">1</td></tr>
          </tbody>
        </table>
      </div>
      <p className="measure">{es
        ? 'El entrenamiento y la evaluación final corrieron en una sola GPU de portátil con 8188 MiB de memoria, con un pico asignado de 920,6 MiB en entrenamiento y 266,5 MiB en la evaluación final. Se registra porque un resultado que solo se reproduce en un clúster no es reproducible para un lector, y porque el tamaño del modelo es parte de la comparación: la línea base es un punto de control preentrenado genéricamente y ajustado en dos pasadas sobre estos datos, mientras que el modelo de investigación se entrenó desde cero sobre 192 imágenes. Comparar los dos es informativo, y no es una comparación entre iguales.'
        : 'Training and the final evaluation ran on a single laptop GPU with 8,188 MiB of memory, with a peak allocation of 920.6 MiB in training and 266.5 MiB in the final evaluation. This is recorded because a result that only reproduces on a cluster is not reproducible for a reader, and because model size is part of the comparison: the baseline is a generically pretrained checkpoint fine-tuned in two passes on this data, while the research model was trained from scratch on 192 images. Comparing the two is informative, and it is not a comparison between equals.'}{' '}<Cite id="stringer2021cellpose" paren /></p>

      <Callout variant="honest" title={es ? 'La afirmación de superar el estado del arte permanece en falso' : 'The beyond-state-of-the-art claim stays false'}>
        <p>{es
          ? 'El banco es sintético, la línea base tuvo dos pasadas de ajuste fino, el margen es menor que la dispersión entre semillas medida en el mismo estudio, solo se evaluó un ensamble y la transferencia a fotografías reales muestra que el orden es en buena parte del generador. Cualquiera de esas cinco razones bastaría para no reclamar estado del arte; las cinco juntas hacen que el campo de la afirmación siga marcado en falso, y la aceptación de producto siga bloqueada hasta que exista un carril retenido de espuma real, licenciado y calibrado.'
          : 'The bench is synthetic, the baseline had a two-pass fine-tuning budget, the margin is smaller than the seed spread measured in the same study, only one ensemble was evaluated, and the transfer to real photographs shows the order is substantially the generator. Any one of those five reasons would be enough not to claim state of the art; the five together keep the claim field marked false, and keep product acceptance blocked until a licensed, calibrated real froth held-out lane exists.'}</p>
      </Callout>
      <Refs ids={['stringer2021cellpose', 'weaire1999foams']} label="Refs" />
    </div>
  );
}

// ============================================================
// DIAGRAMS
// ============================================================

/** The instance ledger: where the three counts in AP(t) come from, with the leader real pooled values. */
function MatchingLedger({ es, micro, label }: { es: boolean; micro: Micro | null; label: string }) {
  if (!micro) return null;
  const locale = es ? 'es' : 'en';
  return (
    <figure>
      <svg viewBox="0 0 920 330" width="100%" role="img" aria-labelledby="ledgerTitle ledgerDesc" style={{ fontFamily: 'var(--font-mono)', display: 'block' }}>
        <title id="ledgerTitle">{es ? 'Libro de emparejamiento de instancias: verdad de terreno y predicciones entran a un emparejador voraz uno a uno y salen como verdaderos positivos, falsos positivos y falsos negativos' : 'Instance matching ledger: ground truth and predictions enter a greedy one-to-one matcher and leave as true positives, false positives and false negatives'}</title>
        <desc id="ledgerDesc">{es ? 'Los conteos mostrados son los valores agrupados del método líder sobre las 64 muestras retenidas, con asociación a IoU 0,5.' : 'The counts shown are the pooled values of the leading method over the 64 held-out samples, with association at IoU 0.5.'}</desc>
        <defs>
          <marker id="ledgerArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0L10 5L0 10z" fill="var(--color-fg-faint)" />
          </marker>
        </defs>

        <g>
          <rect x="20" y="40" width="200" height="72" rx="10" fill="var(--color-surface)" stroke="var(--color-border)" />
          <text x="120" y="66" textAnchor="middle" fontSize="11" fill="var(--color-fg-subtle)">{es ? 'burbujas reales' : 'true bubbles'}</text>
          <text x="120" y="94" textAnchor="middle" fontSize="17" fill="var(--color-fg)">{micro.nGt.toLocaleString(locale)}</text>
        </g>
        <g>
          <rect x="20" y="212" width="200" height="72" rx="10" fill="var(--color-surface)" stroke="var(--color-border)" />
          <text x="120" y="238" textAnchor="middle" fontSize="11" fill="var(--color-fg-subtle)">{es ? 'instancias predichas' : 'predicted instances'}</text>
          <text x="120" y="266" textAnchor="middle" fontSize="17" fill="var(--color-fg)">{micro.nPred.toLocaleString(locale)}</text>
        </g>

        <path d="M220 76 H336" stroke="var(--color-fg-faint)" strokeWidth="1.4" markerEnd="url(#ledgerArrow)" fill="none" />
        <path d="M220 248 H336" stroke="var(--color-fg-faint)" strokeWidth="1.4" markerEnd="url(#ledgerArrow)" fill="none" />
        <text x="278" y="68" textAnchor="middle" fontSize="9" fill="var(--color-fg-subtle)">{es ? 'una sola vez' : 'once only'}</text>
        <text x="278" y="240" textAnchor="middle" fontSize="9" fill="var(--color-fg-subtle)">{es ? 'una sola vez' : 'once only'}</text>

        <g>
          <rect x="340" y="112" width="200" height="100" rx="10" fill="var(--color-surface)" stroke="var(--color-accent)" />
          <text x="440" y="142" textAnchor="middle" fontSize="11" fill="var(--color-fg)">{es ? 'emparejador voraz' : 'greedy matcher'}</text>
          <text x="440" y="164" textAnchor="middle" fontSize="9" fill="var(--color-fg-subtle)">{es ? 'IoU descendente, uno a uno' : 'descending IoU, one to one'}</text>
          <text x="440" y="186" textAnchor="middle" fontSize="9" fill="var(--color-fg-subtle)">{es ? 'acepta el par si IoU supera τ' : 'accepts the pair if IoU exceeds τ'}</text>
        </g>

        <path d="M540 132 H700" stroke="var(--color-good)" strokeWidth="1.4" markerEnd="url(#ledgerArrow)" fill="none" />
        <path d="M540 162 H700" stroke="var(--color-warn)" strokeWidth="1.4" markerEnd="url(#ledgerArrow)" fill="none" />
        <path d="M540 192 H700" stroke="var(--color-warn)" strokeWidth="1.4" markerEnd="url(#ledgerArrow)" fill="none" />
        <text x="620" y="126" textAnchor="middle" fontSize="9" fill="var(--color-fg-subtle)">{es ? 'par aceptado' : 'accepted pair'}</text>
        <text x="620" y="156" textAnchor="middle" fontSize="9" fill="var(--color-fg-subtle)">{es ? 'predicción sin pareja' : 'prediction unmatched'}</text>
        <text x="620" y="186" textAnchor="middle" fontSize="9" fill="var(--color-fg-subtle)">{es ? 'burbuja real sin pareja' : 'true bubble unmatched'}</text>

        <g>
          <rect x="702" y="112" width="196" height="30" rx="6" fill="var(--color-surface)" stroke="var(--color-good)" />
          <text x="716" y="132" fontSize="11" fill="var(--color-fg-subtle)">TP</text>
          <text x="886" y="132" textAnchor="end" fontSize="12" fill="var(--color-fg)">{micro.tp.toLocaleString(locale)}</text>
          <rect x="702" y="147" width="196" height="30" rx="6" fill="var(--color-surface)" stroke="var(--color-warn)" />
          <text x="716" y="167" fontSize="11" fill="var(--color-fg-subtle)">FP</text>
          <text x="886" y="167" textAnchor="end" fontSize="12" fill="var(--color-fg)">{micro.fp.toLocaleString(locale)}</text>
          <rect x="702" y="182" width="196" height="30" rx="6" fill="var(--color-surface)" stroke="var(--color-warn)" />
          <text x="716" y="202" fontSize="11" fill="var(--color-fg-subtle)">FN</text>
          <text x="886" y="202" textAnchor="end" fontSize="12" fill="var(--color-fg)">{micro.fn.toLocaleString(locale)}</text>
        </g>

        <g>
          <rect x="340" y="240" width="558" height="62" rx="10" fill="var(--color-surface)" stroke="var(--color-border)" />
          <text x="360" y="264" fontSize="10" fill="var(--color-fg-subtle)">{es ? 'lectura agrupada a IoU 0,5' : 'pooled reading at IoU 0.5'}</text>
          <text x="360" y="286" fontSize="11" fill="var(--color-fg)">
            {es ? 'precisión' : 'precision'} {micro.instance_precision.toFixed(3)} · recall {micro.instance_recall.toFixed(3)} · F1 {micro.instance_f1.toFixed(3)}
          </text>
        </g>
        <path d="M440 212 V240" stroke="var(--color-fg-faint)" strokeWidth="1.2" markerEnd="url(#ledgerArrow)" fill="none" />
      </svg>
      <figcaption className="equation-caption">{es
        ? `Los tres conteos que entran en AP(τ), con los valores agrupados de ${label} sobre las 64 muestras retenidas. El emparejador consume cada instancia una sola vez, así que un segmento sobrante no puede reciclarse contra otra burbuja.`
        : `The three counts that enter AP(τ), with the pooled values of ${label} over the 64 held-out samples. The matcher consumes each instance once, so a surplus segment cannot be recycled against another bubble.`}</figcaption>
    </figure>
  );
}

/** The grouped split chain, including the forbidden path that would make test not untouched. */
function SplitChain({ es }: { es: boolean }) {
  const boxes = [
    { x: 16, title: es ? 'ENTRENAMIENTO' : 'TRAINING', a: '192', b: es ? '96 grupos' : '96 groups', c: es ? 'ajusta los pesos' : 'fits the weights' },
    { x: 246, title: es ? 'VALIDACIÓN' : 'VALIDATION', a: '64', b: es ? '32 grupos' : '32 groups', c: es ? 'selecciona la configuración' : 'selects the configuration' },
    { x: 476, title: es ? 'CALIBRACIÓN' : 'CALIBRATION', a: '64', b: es ? '32 grupos' : '32 groups', c: es ? 'fija los umbrales' : 'fixes the thresholds' },
    { x: 706, title: es ? 'PRUEBA INTACTA' : 'UNTOUCHED TEST', a: '64', b: es ? '32 grupos' : '32 groups', c: es ? '3 evaluaciones en total' : '3 evaluations in total' },
  ];
  return (
    <figure>
      <svg viewBox="0 0 920 300" width="100%" role="img" aria-labelledby="splitTitle splitDesc" style={{ fontFamily: 'var(--font-mono)', display: 'block' }}>
        <title id="splitTitle">{es ? 'Cadena de divisiones por grupo de geometría latente: entrenamiento, validación, calibración y prueba intacta, con la ruta prohibida tachada' : 'Chain of splits by latent geometry group: training, validation, calibration and untouched test, with the forbidden path struck out'}</title>
        <desc id="splitDesc">{es ? 'Cada división tiene un trabajo. La flecha tachada indica la ruta prohibida: usar la prueba para seleccionar una configuración.' : 'Each split has one job. The struck-out arrow marks the forbidden path: using test to select a configuration.'}</desc>
        <defs>
          <marker id="splitArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0L10 5L0 10z" fill="var(--color-fg-faint)" />
          </marker>
        </defs>
        {boxes.map((box, index) => (
          <g key={box.title}>
            <rect x={box.x} y="66" width="182" height="108" rx="10" fill="var(--color-surface)" stroke={index === 3 ? 'var(--color-accent)' : 'var(--color-border)'} />
            <text x={box.x + 91} y="90" textAnchor="middle" fontSize="10" fill="var(--color-fg-subtle)">{box.title}</text>
            <text x={box.x + 91} y="120" textAnchor="middle" fontSize="18" fill="var(--color-fg)">{box.a}</text>
            <text x={box.x + 91} y="140" textAnchor="middle" fontSize="9" fill="var(--color-fg-subtle)">{box.b}</text>
            <text x={box.x + 91} y="162" textAnchor="middle" fontSize="9" fill="var(--color-fg-subtle)">{box.c}</text>
            {index < 3 ? (
              <path d={`M${box.x + 182} 120 H${box.x + 244}`} stroke="var(--color-fg-faint)" strokeWidth="1.4" markerEnd="url(#splitArrow)" fill="none" />
            ) : null}
          </g>
        ))}
        <text x="228" y="112" textAnchor="middle" fontSize="8" fill="var(--color-fg-subtle)">{es ? 'AP val.' : 'val AP'}</text>
        <text x="458" y="112" textAnchor="middle" fontSize="8" fill="var(--color-fg-subtle)">{es ? 'umbrales' : 'thresholds'}</text>
        <text x="688" y="112" textAnchor="middle" fontSize="8" fill="var(--color-fg-subtle)">{es ? 'todo fijo' : 'all fixed'}</text>

        <path d="M797 174 C797 226 337 226 337 174" stroke="var(--color-warn)" strokeWidth="1.4" strokeDasharray="5 4" fill="none" markerEnd="url(#splitArrow)" />
        <line x1="520" y1="205" x2="614" y2="227" stroke="var(--color-warn)" strokeWidth="2" />
        <text x="567" y="245" textAnchor="middle" fontSize="9" fill="var(--color-warn)">{es ? 'PROHIBIDO: seleccionar mirando la prueba' : 'FORBIDDEN: selecting by looking at test'}</text>
        <text x="460" y="278" textAnchor="middle" fontSize="9" fill="var(--color-fg-subtle)">{es ? 'grupos de reserva restantes: 0' : 'remaining reserve groups: 0'}</text>
      </svg>
      <figcaption className="equation-caption">{es
        ? 'Divisiones por grupo de geometría latente, con el trabajo de cada una y el número de evaluaciones de prueba gastadas. Sin grupos de reserva, no queda evidencia intacta para una selección adicional.'
        : 'Splits by latent geometry group, with the job of each one and the number of test evaluations spent. With no reserve groups, no untouched evidence is left for a further selection.'}</figcaption>
    </figure>
  );
}

/** How an adjacent-domain source is admitted as evidence and still cannot clear the froth blocker. */
function DomainGateDiagram({ es, samples }: { es: boolean; samples: number }) {
  return (
    <figure>
      <svg viewBox="0 0 940 250" width="100%" role="img" aria-labelledby="gateTitle gateDesc" style={{ fontFamily: 'var(--font-mono)', display: 'block' }}>
        <title id="gateTitle">{es ? 'La fuente adyacente se acepta como evidencia de transferencia y no puede satisfacer el requisito de espuma de la compuerta de liberación' : 'The adjacent source is accepted as transfer evidence and cannot satisfy the froth requirement of the release gate'}</title>
        <desc id="gateDesc">{es ? 'El constructor del informe particiona las fuentes reales aceptadas por su campo de dominio, de modo que la evidencia adyacente informa pero no desbloquea.' : 'The report builder partitions accepted real sources by their domain field, so adjacent evidence informs but does not unblock.'}</desc>
        <defs>
          <marker id="gateArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0L10 5L0 10z" fill="currentColor" />
          </marker>
        </defs>
        <g>
          <rect x="14" y="70" width="218" height="106" rx="12" fill="var(--color-surface)" stroke="var(--color-border)" />
          <text x="123" y="98" textAnchor="middle" fontSize="10" fill="var(--color-fg-subtle)">{es ? 'FUENTE REAL ADYACENTE' : 'REAL ADJACENT SOURCE'}</text>
          <text x="123" y="124" textAnchor="middle" fontSize="13" fill="var(--color-fg)">{samples} {es ? 'imágenes' : 'images'} · 4979</text>
          <text x="123" y="146" textAnchor="middle" fontSize="9" fill="var(--color-fg-subtle)">{es ? 'objetos anotados, licencia CC0' : 'annotated objects, CC0 licence'}</text>
          <text x="123" y="166" textAnchor="middle" fontSize="9" fill="var(--color-fg-subtle)">{es ? 'dominio: adyacente' : 'domain: adjacent'}</text>
        </g>
        <path d="M232 122 H320" stroke="var(--color-fg-faint)" strokeWidth="1.4" markerEnd="url(#gateArrow)" fill="none" color="var(--color-fg-faint)" />
        <text x="276" y="114" textAnchor="middle" fontSize="8" fill="var(--color-fg-subtle)">{es ? 'ingesta' : 'ingest'}</text>
        <g>
          <rect x="322" y="70" width="214" height="106" rx="12" fill="var(--color-surface)" stroke="var(--color-accent)" />
          <text x="429" y="104" textAnchor="middle" fontSize="10" fill="var(--color-fg)">{es ? 'PARTICIÓN POR DOMINIO' : 'PARTITION BY DOMAIN'}</text>
          <text x="429" y="130" textAnchor="middle" fontSize="9" fill="var(--color-fg-subtle)">{es ? 'las fuentes aceptadas se separan' : 'accepted sources are separated'}</text>
          <text x="429" y="150" textAnchor="middle" fontSize="9" fill="var(--color-fg-subtle)">{es ? 'por su campo de dominio, en código' : 'by their domain field, in code'}</text>
        </g>
        <path d="M536 100 H648" stroke="var(--color-good)" strokeWidth="1.4" markerEnd="url(#gateArrow)" fill="none" color="var(--color-good)" />
        <path d="M536 148 H648" stroke="var(--color-warn)" strokeWidth="1.4" markerEnd="url(#gateArrow)" fill="none" color="var(--color-warn)" />
        <text x="592" y="92" textAnchor="middle" fontSize="8" fill="var(--color-fg-subtle)">{es ? 'adyacente' : 'adjacent'}</text>
        <text x="592" y="168" textAnchor="middle" fontSize="8" fill="var(--color-fg-subtle)">{es ? 'espuma' : 'froth'}</text>
        <g>
          <rect x="650" y="72" width="276" height="52" rx="10" fill="var(--color-surface)" stroke="var(--color-good)" />
          <text x="788" y="94" textAnchor="middle" fontSize="10" fill="var(--color-fg)">{es ? 'EVIDENCIA DE TRANSFERENCIA' : 'TRANSFER EVIDENCE'}</text>
          <text x="788" y="112" textAnchor="middle" fontSize="9" fill="var(--color-fg-subtle)">{es ? 'reportada, nunca decisiva' : 'reported, never decisive'}</text>
          <rect x="650" y="126" width="276" height="66" rx="10" fill="var(--color-surface)" stroke="var(--color-warn)" />
          <text x="788" y="148" textAnchor="middle" fontSize="10" fill="var(--color-fg)">{es ? 'REQUISITO DE ESPUMA REAL' : 'REAL FROTH REQUIREMENT'}</text>
          <text x="788" y="166" textAnchor="middle" fontSize="9" fill="var(--color-warn)">{es ? 'sin fuente aceptada' : 'no accepted source'}</text>
          <text x="788" y="184" textAnchor="middle" fontSize="9" fill="var(--color-fg-subtle)">{es ? 'liberación incompleta' : 'release incomplete'}</text>
        </g>
      </svg>
      <figcaption className="equation-caption">{es
        ? 'La separación está aplicada en código, no en la prosa: la evidencia adyacente entra al informe y el requisito de espuma sigue sin cumplirse, así que la liberación permanece incompleta.'
        : 'The separation is enforced in code, not in prose: adjacent evidence enters the report and the froth requirement stays unmet, so the release remains incomplete.'}</figcaption>
    </figure>
  );
}

function BenchmarkLandscape({ methods, threshold, es }: { methods: MethodBenchmarkRow[]; threshold: number; es: boolean }) {
  const width = 900;
  const height = 300;
  const max = .6;
  const shown = methods.slice(0, 10);
  return (
    <figure className="fs-landscape">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={es ? 'AP retenido por método, con el umbral predeclarado marcado' : 'held-out AP by method, with the predeclared threshold marked'}>
        {[0, .1, .2, .3, .4, .5, .6].map((tick) => (
          <g key={tick}>
            <line x1="95" x2={width - 25} y1={250 - tick / max * 215} y2={250 - tick / max * 215} />
            <text x="82" y={254 - tick / max * 215} textAnchor="end">{tick.toFixed(1)}</text>
          </g>
        ))}
        <line className="threshold" x1="95" x2={width - 25} y1={250 - threshold / max * 215} y2={250 - threshold / max * 215} />
        {shown.map((method, index) => {
          const x = 120 + index * ((width - 170) / Math.max(1, shown.length - 1));
          const y = 250 - (method.test?.mean_ap ?? 0) / max * 215;
          return (
            <g key={method.id}>
              <line className="stem" x1={x} x2={x} y1="250" y2={y} />
              <circle cx={x} cy={y} r="8" style={{ fill: FAMILY_COLORS[method.tier] }}>
                <title>{`${method.id} ${method.name}: AP ${(method.test?.mean_ap ?? 0).toFixed(3)}`}</title>
              </circle>
              <text x={x} y={y - 14} textAnchor="middle">{(method.test?.mean_ap ?? 0).toFixed(2)}</text>
              <text x={x} y="271" textAnchor="middle">{method.id}</text>
            </g>
          );
        })}
        <text x={width - 25} y={250 - threshold / max * 215 - 7} textAnchor="end" className="threshold-label">
          {es ? `umbral predeclarado ${threshold.toFixed(2)}` : `predeclared threshold ${threshold.toFixed(2)}`}
        </text>
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
      <svg viewBox="0 0 980 480" role="img" aria-label={`${xLabel} · ${yLabel}`}>
        <line x1="85" y1="405" x2="900" y2="405" /><line x1="85" y1="45" x2="85" y2="405" />
        <text x="492" y="458" textAnchor="middle">{xLabel}</text>
        <text x="22" y="225" textAnchor="middle" transform="rotate(-90 22 225)">{yLabel}</text>
        <rect x="85" y="45" width="815" height="360" className="plot-bg" />
        {methods.map((method) => {
          const px = mapX(x(method));
          const py = mapY(y(method));
          const r = bubble?.(method) ?? 8;
          return (
            <g key={method.id}>
              <circle cx={px} cy={py} r={r} style={{ fill: FAMILY_COLORS[method.tier] }}>
                <title>{`${method.id} ${method.name}\n${xLabel} ${x(method).toFixed(3)}\n${yLabel} ${y(method).toFixed(3)}`}</title>
              </circle>
              <text x={px} y={py - r - 5} textAnchor="middle">{method.id}</text>
            </g>
          );
        })}
        <text x="900" y="30" textAnchor="end" className="hint">{es ? 'pase el cursor para leer los valores' : 'hover to read the values'}</text>
      </svg>
    </figure>
  );
}

function ClaimBoundaryDiagram({ es, methods, samples }: { es: boolean; methods: number; samples: number }) {
  return (
    <figure className="fs-claim-diagram">
      <svg viewBox="0 0 1000 300" role="img" aria-label={es ? 'del banco controlado a una afirmación de planta, con la validación externa pendiente en medio' : 'from the controlled bench to a plant claim, with external validation pending in between'}>
        <defs>
          <marker id="claim-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0L10 5L0 10z" fill="currentColor" />
          </marker>
        </defs>
        <g className="supported">
          <rect x="30" y="65" width="265" height="150" rx="18" />
          <text x="162" y="105" textAnchor="middle">{es ? 'BANCO CONTROLADO' : 'CONTROLLED BENCH'}</text>
          <text x="162" y="143" textAnchor="middle">{methods} × {samples}</text>
          <text x="162" y="177" textAnchor="middle" className="small">{es ? 'verdad exacta · AP · PQ · costo' : 'exact truth · AP · PQ · cost'}</text>
        </g>
        <path d="M295 140 H430" markerEnd="url(#claim-arrow)" />
        <g className="gate">
          <path d="M430 45 H610 L650 140 L610 235 H430 L390 140Z" />
          <text x="520" y="119" textAnchor="middle">{es ? 'VALIDACIÓN EXTERNA' : 'EXTERNAL VALIDATION'}</text>
          <text x="520" y="151" textAnchor="middle" className="small">{es ? 'datos licenciados y expertos' : 'licensed data and experts'}</text>
          <text x="520" y="175" textAnchor="middle" className="small">{es ? 'escala física y protocolo bloqueado' : 'physical scale and locked protocol'}</text>
        </g>
        <path d="M650 140 H785" markerEnd="url(#claim-arrow)" />
        <g className="plant">
          <rect x="785" y="65" width="185" height="150" rx="18" />
          <text x="878" y="105" textAnchor="middle">{es ? 'AFIRMACIÓN' : 'CLAIM'}</text>
          <text x="878" y="143" textAnchor="middle">{es ? 'DE PLANTA' : 'AT PLANT'}</text>
          <text x="878" y="178" textAnchor="middle" className="blocked">{es ? 'NO EVALUADA' : 'NOT EVALUATED'}</text>
        </g>
      </svg>
    </figure>
  );
}

function MethodReading({ method, es }: { method: MethodBenchmarkRow; es: boolean }) {
  const micro = microOf(method);
  return (
    <div className="measure">
      <h3>{method.id} · {method.name}</h3>
      <p>{es
        ? `${FAMILY_LABELS[method.tier].es}, motor ${method.engine}, carril ${method.compute.hardware_lane.toUpperCase()} sobre ${method.compute.device}. Registró AP ${fmt(method.test?.mean_ap)}, PQ ${fmt(method.test?.mean_pq)} y F de frontera ${fmt(method.test?.mean_boundary_fscore)} sobre ${method.test?.n ?? 64} muestras retenidas, con ${fmt(method.compute.mean_inference_ms, 1)} ms por imagen de media y ${fmt(method.compute.p95_inference_ms, 1)} ms en el p95.`
        : `${FAMILY_LABELS[method.tier].en}, engine ${method.engine}, ${method.compute.hardware_lane.toUpperCase()} lane on ${method.compute.device}. It recorded AP ${fmt(method.test?.mean_ap)}, PQ ${fmt(method.test?.mean_pq)} and boundary F-score ${fmt(method.test?.mean_boundary_fscore)} over ${method.test?.n ?? 64} held-out samples, at ${fmt(method.compute.mean_inference_ms, 1)} ms per image on average and ${fmt(method.compute.p95_inference_ms, 1)} ms at the p95.`}</p>
      {micro ? (
        <p>{es
          ? `Su error se reparte en ${micro.merges?.toLocaleString('es') ?? '--'} uniones y ${micro.splits?.toLocaleString('es') ?? '--'} separaciones, con precisión de instancia ${micro.instance_precision.toFixed(3)} y recall ${micro.instance_recall.toFixed(3)}. ${qualityLabel(method.quality_status, es)} respecto del umbral vigente.`
          : `Its error splits into ${micro.merges?.toLocaleString('en') ?? '--'} merges and ${micro.splits?.toLocaleString('en') ?? '--'} splits, with instance precision ${micro.instance_precision.toFixed(3)} and recall ${micro.instance_recall.toFixed(3)}. ${qualityLabel(method.quality_status, es)} against the current threshold.`}</p>
      ) : null}
    </div>
  );
}

function Loading({ es }: { es: boolean }) {
  return <p className="fs-hint"><span className="fs-spinner" /> {es ? 'Cargando evidencia…' : 'Loading evidence…'}</p>;
}

// ============================================================
// HELPERS
// ============================================================

interface BenchmarkProps { es: boolean; benchmark: MethodBenchmarkDoc | null }

function microOf(method: MethodBenchmarkRow | undefined): Micro | null {
  return (method?.test?.micro as Micro | undefined) ?? null;
}

function rankBy(methods: MethodBenchmarkRow[], metric: MetricKey): MethodBenchmarkRow[] {
  return [...methods]
    .filter((method) => metricValue(method.test, metric) != null)
    .sort((a, b) => (metricValue(b.test, metric) ?? 0) - (metricValue(a.test, metric) ?? 0));
}

function metricValue(summary: MethodMetricSummary | null, metric: MetricKey): number | null {
  if (!summary) return null;
  const value = summary[metric];
  return typeof value === 'number' ? value : null;
}

function metricLabel(metric: MetricKey, es: boolean): string {
  const map: Record<MetricKey, [string, string]> = {
    mean_ap: ['Mask AP', 'Mask AP'],
    mean_ap50: ['AP50', 'AP50'],
    mean_pq: ['PQ', 'PQ'],
    mean_boundary_fscore: ['F de frontera', 'Boundary F'],
    mean_bsd_wasserstein: ['W1 de tamaños', 'Size W1'],
    mean_d32_relative_error: ['error de d32', 'd32 error'],
  };
  return map[metric][es ? 0 : 1];
}

function qualityLabel(status: MethodBenchmarkRow['quality_status'], es: boolean): string {
  if (status === 'passes-current-bar') return es ? 'Supera el umbral' : 'Clears the threshold';
  if (status === 'below-current-bar') return es ? 'Bajo el umbral' : 'Below the threshold';
  return es ? 'No evaluado' : 'Not evaluated';
}

/** Bilingual display names for the 16 condition families. The artifact key stays visible next to the
 *  name so a reader can match a row back to
 *  data/derived/method-benchmark.json methods[].test.robustness_by_condition. */
function conditionLabel(condition: string, es: boolean): string {
  const map: Record<string, [string, string]> = {
    bursting: ['Bursting topology', 'Topología de ruptura'],
    'coarse-froth': ['Coarse froth', 'Espuma gruesa'],
    'dark-defocus-compound': ['Dark and defocused, compound', 'Oscuridad y desenfoque, compuesta'],
    defocus: ['Optical defocus', 'Desenfoque óptico'],
    'edge-framing': ['Edge framing', 'Encuadre de borde'],
    'fine-froth': ['Fine froth', 'Espuma fina'],
    'glare-motion-compound': ['Glare and motion, compound', 'Brillo y movimiento, compuesta'],
    'glare-storm': ['Specular glare', 'Brillo especular'],
    'high-load': ['High solids loading', 'Alta carga de sólidos'],
    'low-light-noise': ['Low-light sensor noise', 'Ruido de sensor con poca luz'],
    'microbubble-cloud': ['Microbubble cloud', 'Nube de microburbujas'],
    'mono-clean': ['Monodisperse reference', 'Referencia monodispersa'],
    'motion-fast': ['Fast surface motion', 'Movimiento rápido de superficie'],
    'poly-normal': ['Nominal polydisperse froth', 'Espuma polidispersa nominal'],
    watery: ['Thin and watery froth', 'Espuma delgada y acuosa'],
    'wide-bimodal-proxy': ['Wide bimodal size proxy', 'Proxy bimodal de tamaños amplio'],
  };
  return map[condition]?.[es ? 1 : 0] ?? condition;
}

function conditionInterpretation(condition: string, es: boolean): string {
  const map: Record<string, [string, string]> = {
    'glare-storm': ['El brillo especular elimina o duplica la evidencia de lamela: favorece representaciones con contexto amplio y castiga a los sembradores de marcadores que dependen solo de máximos locales, que parten una burbuja grande en dos.', 'Specular glare removes or duplicates lamella evidence: it favours representations with wide context and punishes marker seeders that depend only on local maxima, which cut one large bubble in two.'],
    'motion-fast': ['El movimiento difumina las fronteras en la dirección del flujo y reduce los máximos locales confiables, así que el error migra de separaciones hacia uniones.', 'Motion smears boundaries along the flow direction and reduces reliable local maxima, so the error migrates from splits toward merges.'],
    'microbubble-cloud': ['La densidad extrema acerca los centros, aumenta la competencia entre marcadores y amplifica el filtrado por tamaño; es la condición que fija el piso de la compuerta de finalista.', 'Extreme density brings centres together, increases competition between markers and amplifies size filtering; it is the condition that sets the floor of the finalist gate.'],
    'low-light-noise': ['El bajo contraste reduce la separación entre primer plano y fondo, y el ruido introduce mínimos y bordes falsos que se convierten en instancias inventadas.', 'Low contrast reduces the separation between foreground and background, and noise introduces false minima and edges that become invented instances.'],
    'dark-defocus-compound': ['Dos degradaciones a la vez, oscuridad y desenfoque, no se suman de forma independiente: el desenfoque borra la lamela que el bajo contraste ya había debilitado.', 'Two degradations at once, darkness and defocus, do not add independently: defocus erases the lamella that low contrast had already weakened.'],
  };
  return map[condition]?.[es ? 0 : 1]
    ?? (es
      ? 'Esta vista separa la respuesta a la condición del promedio global de cada método, que es la única forma de distinguir una debilidad general de una sensibilidad específica.'
      : 'This view separates the response to the condition from each method global mean, which is the only way to distinguish a general weakness from a specific sensitivity.');
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
