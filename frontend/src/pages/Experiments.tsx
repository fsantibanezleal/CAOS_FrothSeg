import { useEffect, useMemo, useState } from 'react';
import {
  Callout, Cite, Equation, Figure, InlineMath, Refs, SubTabs, useShellLang,
} from '@fasl-work/caos-app-shell';
import {
  artifactUrl, loadMasks, loadMethodBenchmark, loadSamBenchmark, loadTemporalBenchmark,
} from '../api/artifacts';
import type {
  MethodBenchmarkDoc, MethodBenchmarkRow, MethodMetricSummary, SamBenchmarkDoc, TemporalBenchmarkDoc,
} from '../lib/contract.types';
import { decodeLabels } from '../lib/rle';
import { BarChart, type BarDatum } from '../viz/BarChart';
import { MaskOverlay } from '../viz/MaskOverlay';
import { PanelBoundary } from '../viz/PanelBoundary';

/* Every number on this page is transcribed from a file in this repository. The source path is given
   in a comment next to the claim. Live values are read from the committed artifacts at run time. */

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
    { id: 'design', label: es ? 'Diseño' : 'Design', content: <Design es={es} methods={methods} /> },
    { id: 'cases', label: es ? 'Casos canónicos' : 'Canonical cases', content: <Cases es={es} benchmark={sam} /> },
    { id: 'splits', label: es ? 'Divisiones' : 'Splits', content: <Splits es={es} methods={methods} /> },
    { id: 'robustness', label: es ? 'Robustez' : 'Robustness', content: <Robustness es={es} methods={methods} /> },
    { id: 'temporal', label: es ? 'Temporal' : 'Temporal', content: <Temporal es={es} temporal={temporal} /> },
    { id: 'errors', label: es ? 'Anatomía del error' : 'Error anatomy', content: <ErrorAnatomy es={es} methods={methods} /> },
    { id: 'transfer', label: es ? 'Transferencia' : 'Transfer', content: <Transfer es={es} /> },
    { id: 'provenance', label: es ? 'Proveniencia' : 'Provenance', content: <Provenance es={es} methods={methods} temporal={temporal} /> },
  ];

  return (
    <div className="page-body prose">
      <header className="page-head">
        <h1>{es ? 'Experimentos que aíslan causas, no solo resultados' : 'Experiments that isolate causes, not only scores'}</h1>
        <p className="lede">
          {es
            ? 'Dos superficies experimentales salen del mismo generador de espuma de Laguerre: trece casos canónicos, cada uno construido para provocar un modo de falla con nombre, y una matriz estratificada de dieciséis condiciones cuya división es por grupo de geometría latente. La primera diagnostica, la segunda ordena, y nunca se promedian. Ninguna de las dos mide exactitud en planta: la métrica es '
            : 'Two experimental surfaces come out of one Laguerre foam generator: thirteen canonical cases, each built to provoke a named failure mode, and a stratified sixteen-condition matrix split by latent geometry group. The first diagnoses, the second ranks, and the two are never averaged. Neither measures plant accuracy: the metric is '}
          <InlineMath tex={String.raw`\mathrm{AP}(\tau)=TP/(TP+FP+FN)`} />
          {es
            ? ', un acuerdo de instancias contra una verdad sintética conocida por construcción.'
            : ', an instance agreement against a synthetic truth known by construction.'}
        </p>
      </header>
      {error && <p className="banner error">{es ? 'No se pudo leer la evidencia comprometida.' : 'The committed evidence could not be read.'}</p>}
      <section><SubTabs tabs={tabs} ariaLabel={es ? 'Capítulos experimentales' : 'Experiment chapters'} /></section>
    </div>
  );
}

/* ============================================================================
   1. DESIGN
   ========================================================================== */

function Design({ es, methods }: { es: boolean; methods: MethodBenchmarkDoc | null }) {
  return (
    <div className="prose">
      <h2>{es ? 'Por qué la verdad es sintética, y qué se pierde con eso' : 'Why the truth is synthetic, and what that costs'}</h2>

      {/* Source: docs/benchmark/02_real-domain-transfer.md (2026-07-28 verification of public sources);
          docs/cases/README.md; data/README.md (request-only froth ground truth). */}
      <p className="measure">
        {es
          ? 'No existe un conjunto público, con licencia abierta y anotación por burbuja, de espuma de flotación. La verificación contra fuentes primarias del 28 de julio de 2026 encontró un candidato en Kaggle sin licencia alguna, un conjunto en IEEE DataPort tras un muro de pago, un conjunto en Roboflow con licencia no comercial (descartado por eso) y ninguna respuesta en Zenodo para segmentación de espuma. Las imágenes de espuma son datos operacionales de planta y las plantas no las publican. El diseño experimental hereda esa restricción de forma directa: o no hay métrica de máscara en absoluto, o la verdad se construye. Este repositorio construye la verdad, y lo declara en cada celda.'
          : 'There is no openly licensed, real, per-bubble-annotated froth dataset in public repositories. The verification against primary sources on 28 July 2026 found a Kaggle candidate carrying no licence at all, an IEEE DataPort set behind a paywall, a Roboflow set under a non-commercial licence (dropped for that reason), and no Zenodo record for froth segmentation. Froth imagery is operational plant data and plants do not publish it. The experimental design inherits that constraint directly: either there is no mask metric at all, or the truth is constructed. This repository constructs the truth, and labels every cell as such.'}
        {' '}<Cite id="fu2019" paren />
      </p>

      {/* Source: data-pipeline/fslab/science/froth_gen.py (laguerre_labels, pack_bubbles);
          docs/cases/01_coverage.md "Theory: how a case is built and scored". */}
      <p className="measure">
        {es
          ? 'El generador es una teselación de espuma de Laguerre, es decir un diagrama de potencia, que es el modelo estándar de espuma seca y satisface las leyes de Plateau: las celdas se encuentran en bordes de Plateau curvos, las uniones oscuras que muestra la espuma real. Los centros de burbuja se empacan por adsorción secuencial aleatoria con radios log-normales, y cada píxel se asigna al sitio de mínima distancia de potencia. La consecuencia experimental es la que importa: la etiqueta de celda por píxel no es una anotación de la imagen, es la imagen. No hay error de anotación, no hay varianza entre anotadores, no hay burbujas pequeñas omitidas por cansancio del anotador, y el recuento verdadero de instancias es exacto hasta el píxel. Eso permite medir un error de recuento y una distancia entre distribuciones de tamaño con un cero verdadero, algo imposible sobre etiquetas humanas.'
          : 'The generator is a Laguerre foam tessellation, that is a power diagram, which is the standard dry-foam model and satisfies Plateau’s laws: cells meet at curved Plateau borders, the dark junctions real froth shows. Bubble centres are packed by random sequential adsorption with log-normal radii, and every pixel is assigned to the site of minimum power distance. The experimental consequence is the one that matters: the per-pixel cell label is not an annotation of the image, it is the image. There is no annotation error, no inter-annotator variance, no small bubbles missed through annotator fatigue, and the true instance count is exact to the pixel. That is what makes a count error and a size-distribution distance measurable against a true zero, which is impossible on human labels.'}
        {' '}<Cite id="weaire1999foams" paren /> <Cite id="aurenhammer1987" paren />
      </p>

      <Equation
        tex={String.raw`\mathrm{cell}(p) = \arg\min_i \bigl(\lVert p - c_i \rVert^2 - r_i^2\bigr), \qquad p \notin \text{cell} \iff \lVert p - c_i \rVert > 1.35\,r_i \ \forall i`}
        caption={es
          ? 'Asignación de Laguerre: p es un píxel, c_i el centro de la burbuja i y r_i su radio; un píxel fuera de 1.35 radios de todo sitio queda como fondo.'
          : 'Laguerre assignment: p is a pixel, c_i the centre of bubble i and r_i its radius; a pixel farther than 1.35 radii from every site stays background.'}
      />

      <h3>{es ? 'Dos superficies experimentales, nunca promediadas' : 'Two experimental surfaces, never averaged'}</h3>

      {/* Sources: docs/architecture/06_model-evaluation.md (primary protocol, diagnostic surface);
          docs/architecture/03_the-gate.md (195 precomputed method-case pairs);
          data/derived/method-benchmark.json coverage (960 cells, 64 test samples, 16 conditions);
          data-pipeline/fslab/science/froth_gen.py CASES (13 specs, seeds 101-113, 256 px). */}
      <p className="measure">
        {es
          ? 'La primera superficie son trece casos canónicos de 256 por 256 píxeles con semillas fijas de 101 a 113. Cada uno existe para provocar un modo de falla con nombre, así que su valor es diagnóstico: se mira una imagen y se ve por qué un método se rompió. Los quince métodos del repositorio corren sobre los trece casos, lo que da ciento noventa y cinco pares método-caso reproducidos por la web. La segunda superficie es la matriz estratificada de dieciséis familias de condición a 192 por 192 píxeles, y es la que ordena: su división retenida son sesenta y cuatro muestras que ningún ajuste ha visto, lo que da novecientas sesenta celdas comparables. Los puntajes canónicos nunca entran en el ranking retenido, y el evaluador no permite mezclarlos.'
          : 'The first surface is thirteen canonical cases at 256 by 256 pixels with fixed seeds 101 to 113. Each exists to provoke a named failure mode, so its value is diagnostic: you look at one image and see why a method broke. The fifteen methods in the repository run over the thirteen cases, giving one hundred and ninety-five method-case pairs replayed by the web. The second surface is the stratified matrix of sixteen condition families at 192 by 192 pixels, and it is the one that ranks: its held-out split is sixty-four samples that no fitting step has seen, giving nine hundred and sixty comparable cells. Canonical scores never enter the held-out ranking, and the evaluator does not permit mixing them.'}
      </p>

      <TwoSurfacesFigure es={es} />

      {methods && (
        <table className="fs-table">
          <caption className="hint">
            {es
              ? 'Cobertura leída del artefacto comprometido de comparación, no escrita a mano.'
              : 'Coverage read from the committed comparison artifact, not typed in.'}
          </caption>
          <tbody>
            <tr>
              <th>{es ? 'Métodos comparados' : 'Methods compared'}</th>
              <td className="num">{methods.coverage.expected_methods}</td>
              <th>{es ? 'Muestras retenidas' : 'Held-out samples'}</th>
              <td className="num">{methods.coverage.expected_test_samples}</td>
            </tr>
            <tr>
              <th>{es ? 'Familias de condición' : 'Condition families'}</th>
              <td className="num">{methods.coverage.condition_count}</td>
              <th>{es ? 'Celdas observadas / esperadas' : 'Cells observed / expected'}</th>
              <td className="num">{methods.coverage.observed_cells} / {methods.coverage.expected_cells}</td>
            </tr>
            <tr>
              <th>{es ? 'Casos canónicos' : 'Canonical cases'}</th>
              <td className="num">{methods.canonical_case_count}</td>
              <th>{es ? 'Umbral predeclarado' : 'Predeclared threshold'}</th>
              <td className="num">AP {methods.current_bar.threshold.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      )}

      <h3>{es ? 'Qué AP es este, exactamente' : 'Which AP this is, exactly'}</h3>

      {/* Source: docs/metrics/01_definitions.md "Average precision, and which AP this is";
          data-pipeline/fslab/science/segment.py mask_ap (thresholds np.arange(0.5, 1.0, 0.05)). */}
      <p className="measure">
        {es
          ? 'La cifra titular no es AP de COCO. COCO ordena detecciones por confianza e integra precisión sobre exhaustividad; la mayoría de los métodos de este banco no tiene un puntaje de confianza (una watershed no puntúa sus regiones), así que el evaluador usa la definición estándar en segmentación de instancias celulares, la que reportan Cellpose y StarDist. Las instancias predichas y verdaderas se emparejan de forma codiciosa por IoU descendente, una a una, y un par cuenta como verdadero positivo cuando su IoU supera el umbral. La cifra reportada promedia sobre diez umbrales de 0.50 a 0.95 en pasos de 0.05. Esta cantidad está acotada por 1, penaliza falsos positivos y falsos negativos de forma simétrica, y es el índice de Jaccard del emparejamiento de instancias. Por lo mismo, estos números no son comparables con una tabla de posiciones de COCO, y un artículo que reporta AP de COCO sobre espuma está midiendo otra cosa.'
          : 'The headline figure is not COCO AP. COCO ranks detections by confidence and integrates precision over recall; most methods in this benchmark have no confidence score (a watershed does not score its regions), so the evaluator uses the definition standard in cell instance segmentation, the one Cellpose and StarDist report. Predicted and ground-truth instances are matched greedily by descending IoU, one to one, and a pair counts as a true positive when its IoU exceeds the threshold. The reported figure averages over ten thresholds from 0.50 to 0.95 in steps of 0.05. This quantity is bounded by 1, penalises false positives and false negatives symmetrically, and is the Jaccard index of the instance matching. For that reason these numbers are not comparable to a COCO leaderboard, and a paper reporting COCO AP on froth is measuring something else.'}
        {' '}<Cite id="stringer2021cellpose" paren /> <Cite id="schmidt2018stardist" paren />
      </p>

      <Equation
        tex={String.raw`\mathrm{AP}(\tau) = \frac{TP(\tau)}{TP(\tau)+FP(\tau)+FN(\tau)}, \qquad \mathrm{AP} = \frac{1}{10}\sum_{\tau \in \{0.50,\,0.55,\,\dots,\,0.95\}} \mathrm{AP}(\tau)`}
        caption={es
          ? 'Acuerdo de instancias: TP, FP y FN son conteos de instancias emparejadas al umbral de IoU τ; AP50 y AP75 son los valores de un solo umbral.'
          : 'Instance agreement: TP, FP and FN are counts of matched instances at IoU threshold τ; AP50 and AP75 are the single-threshold values.'}
      />
      <p className="hint">
        {es
          ? 'El formato de máscara y el barrido de umbrales siguen el protocolo de instancias de COCO; la razón TP/(TP+FP+FN) no.'
          : 'The mask format and the threshold sweep follow the COCO instance protocol; the TP/(TP+FP+FN) ratio does not.'}
        {' '}<Cite id="lin2014coco" paren />
      </p>

      <h3>{es ? 'Reglas de agregación que son código, no convenciones' : 'Aggregation rules that are code, not conventions'}</h3>

      {/* Source: docs/metrics/01_definitions.md "Aggregation rules" (five numbered rules). */}
      <ul className="measure">
        <li>{es ? 'Sin descartes silenciosos: una celda método-caso que no produce resultado es un error, no una fila ausente, y la puerta de liberación falla si falta una celda requerida.' : 'No silent drops: a method-case cell that fails to produce a result is an error, not a missing row, and the release gate fails when any required cell is absent.'}</li>
        <li>{es ? 'Los conteos viajan con los agregados: cada media lleva el número de muestras del que salió.' : 'Counts travel with aggregates: every mean carries the sample count it came from.'}</li>
        <li>{es ? 'Los controles vacíos siguen siendo pruebas negativas: el caso vacío tiene cero instancias verdaderas, así que su AP es indefinido por construcción y queda fuera del ranking en vez de puntuarse como perfecto o como cero.' : 'Empty controls stay negative tests: the empty case has zero ground-truth instances, so its AP is undefined by construction and it is excluded from the ranking rather than scored as perfect or as zero.'}</li>
        <li>{es ? 'Las condiciones se reportan por separado: las dieciséis familias se mantienen aparte porque una media sobre condiciones esconde justamente la falla que le importa a un operador.' : 'Conditions are reported separately: all sixteen families are kept apart because a mean over conditions hides exactly the failure a practitioner cares about.'}</li>
        <li>{es ? 'Los protocolos nunca se mezclan: las métricas de identidad cuadro a cuadro y las de propagación de video con prompt miden cosas distintas y no se promedian ni se ordenan juntas.' : 'Protocols are never mixed: framewise identity metrics and prompted video-propagation identity metrics measure different things and are never averaged or ranked together.'}</li>
      </ul>

      <Callout variant="honest" title={es ? 'Qué no puede decir esta página' : 'What this page cannot say'}>
        <p className="measure">
          {es
            ? 'Todo número del banco publicado viene del generador sintético. Son evidencia algorítmica controlada: sostienen afirmaciones sobre cómo se comparan los métodos bajo condiciones conocidas y reproducibles, y no sostienen ninguna afirmación sobre exactitud en una celda de flotación real. El umbral de comparación predeclarado es un umbral de banco sintético, no una declaración de aptitud para planta. Ninguna fuente real de espuma con licencia ha sido aceptada en el carril puntuado, y la puerta de liberación lleva eso como error bloqueante, no como nota al pie.'
            : 'Every number in the published benchmark comes from the synthetic generator. They are controlled algorithm evidence: they support statements about how methods compare under known, reproducible conditions, and they support no statement about accuracy on a real flotation cell. The predeclared comparison threshold is a controlled synthetic-benchmark threshold, not a claim of plant readiness. No licensed real froth source has been accepted into the scored lane, and the release gate carries that as a blocking error rather than a footnote.'}
        </p>
      </Callout>

      <Refs ids={['weaire1999foams', 'aurenhammer1987', 'lin2014coco', 'stringer2021cellpose', 'schmidt2018stardist', 'fu2019']} label="Refs" />
    </div>
  );
}

/* ============================================================================
   2. CANONICAL CASES
   ========================================================================== */

/* Every row below is transcribed from data-pipeline/fslab/science/froth_gen.py (CASES: seed and
   stressor knobs) and data-pipeline/fslab/cases/froth_cases.py (_META: category + expected band). */
const CANONICAL_CASES: Array<{
  id: string;
  seed: number;
  bucket_en: string; bucket_es: string;
  probe_en: string; probe_es: string;
  /** Knob strings are language-neutral generator identifiers plus units; `knobs_es` exists only where the
   *  value is an English word rather than an identifier. */
  knobs: string; knobs_es?: string;
}> = [
  {
    id: 'mono-clean', seed: 101, bucket_en: 'control (positive)', bucket_es: 'control (positivo)',
    probe_en: 'near-single-size bubbles with clean specular highlights: every method should pass',
    probe_es: 'burbujas de tamaño casi único con brillos especulares limpios: todo método debería aprobar',
    knobs: 'd32 30 px, sigma_ln 0.12',
  },
  {
    id: 'poly-normal', seed: 102, bucket_en: 'size regime (nominal)', bucket_es: 'régimen de tamaño (nominal)',
    probe_en: 'wide bubble-size range with dark Plateau borders: the nominal operating case',
    probe_es: 'rango amplio de tamaños con bordes de Plateau oscuros: el caso nominal de operación',
    knobs: 'd32 26 px, sigma_ln 0.5',
  },
  {
    id: 'fine-froth', seed: 103, bucket_en: 'size regime', bucket_es: 'régimen de tamaño',
    probe_en: 'many small bubbles (high-recovery regime): resolution and marker separation',
    probe_es: 'muchas burbujas pequeñas (régimen de alta recuperación): resolución y separación de marcadores',
    knobs: 'd32 15 px, sigma_ln 0.45',
  },
  {
    id: 'coarse-froth', seed: 104, bucket_en: 'size regime', bucket_es: 'régimen de tamaño',
    probe_en: 'few large bubbles (collapsing or coalescing froth): non-circular shape and wide context',
    probe_es: 'pocas burbujas grandes (espuma que colapsa o coalesce): forma no circular y contexto amplio',
    knobs: 'd32 44 px, sigma_ln 0.4',
  },
  {
    id: 'glare-storm', seed: 105, bucket_en: 'stress (negative control)', bucket_es: 'estrés (control negativo)',
    probe_en: 'a saturated glare lobe: highlight-seeded methods must fail here',
    probe_es: 'un lóbulo de brillo saturado: los métodos sembrados por brillo deben fallar aquí',
    knobs: 'glare 0.8, highlight_jitter 0.6',
  },
  {
    id: 'watery', seed: 106, bucket_en: 'stress', bucket_es: 'estrés',
    probe_en: 'thin watery froth with weak borders at low load: borders hard to resolve at all',
    probe_es: 'espuma acuosa y delgada con bordes débiles y baja carga: bordes difíciles de resolver',
    knobs: 'watery 0.9, load 0.35',
  },
  {
    id: 'motion-fast', seed: 107, bucket_en: 'stress', bucket_es: 'estrés',
    probe_en: 'horizontal motion blur from fast froth travel: smeared borders',
    probe_es: 'desenfoque de movimiento horizontal por avance rápido de espuma: bordes barridos',
    knobs: 'motion_blur 11 px',
  },
  {
    id: 'defocus', seed: 108, bucket_en: 'stress', bucket_es: 'estrés',
    probe_en: 'out-of-focus frame: soft borders and merged bubbles',
    probe_es: 'cuadro fuera de foco: bordes suaves y burbujas fusionadas',
    knobs: 'defocus 2.4',
  },
  {
    id: 'high-load', seed: 109, bucket_en: 'stress', bucket_es: 'estrés',
    probe_en: 'dense dark froth (high pull): low contrast between bubble and border',
    probe_es: 'espuma densa y oscura (tiraje alto): bajo contraste entre burbuja y borde',
    knobs: 'load 0.9',
  },
  {
    id: 'low-light-noise', seed: 110, bucket_en: 'stress', bucket_es: 'estrés',
    probe_en: 'under-lit noisy sensor: grain competes with true borders',
    probe_es: 'sensor subexpuesto y ruidoso: el grano compite con los bordes verdaderos',
    knobs: 'noise 0.09, load 0.7',
  },
  {
    id: 'bursting', seed: 111, bucket_en: 'transient', bucket_es: 'transitorio',
    probe_en: 'bubbles bursting: many missing highlights and irregular cells',
    probe_es: 'burbujas reventando: muchos brillos ausentes y celdas irregulares',
    knobs: 'highlight_jitter 0.5, sigma_ln 0.6',
  },
  {
    id: 'edge-framing', seed: 112, bucket_en: 'stress', bucket_es: 'estrés',
    probe_en: 'off-centre framing with a glare band near the edge: truncated bubbles distort morphometry',
    probe_es: 'encuadre descentrado con una banda de brillo junto al borde: burbujas truncadas distorsionan la morfometría',
    knobs: 'glare 0.3, d32 22 px',
  },
  {
    id: 'empty-control', seed: 113, bucket_en: 'control (negative)', bucket_es: 'control (negativo)',
    probe_en: 'no froth (launder or empty cell): the segmenter must return zero bubbles',
    probe_es: 'sin espuma (canaleta o celda vacía): el segmentador debe devolver cero burbujas',
    knobs: 'empty', knobs_es: 'vacío',
  },
];

function Cases({ es, benchmark }: { es: boolean; benchmark: SamBenchmarkDoc | null }) {
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

  /* data/derived/sam_benchmark.json records sam_ap: null and floor_ap: null on empty-control (it has zero
     ground-truth instances), and docs/metrics/01_definitions.md aggregation rule 3 forbids scoring that case
     as perfect or as zero. A null AP is therefore dropped from the chart, never drawn as a 0.000 bar. */
  const bars = useMemo<BarDatum[]>(() => (benchmark?.cases ?? [])
    .filter((item): item is typeof item & { sam_ap: number } => item.sam_ap != null)
    .map((item) => ({
      key: item.case_id,
      label: item.case_id,
      value: item.sam_ap,
      color: item.floor_ap != null && item.sam_ap >= item.floor_ap ? 'var(--color-good)' : 'var(--color-warn)',
      sub: item.floor_ap != null ? `${es ? 'piso' : 'floor'} ${item.floor_ap.toFixed(2)}` : '',
    })), [benchmark, es]);

  /* Cases whose AP is undefined by construction, counted from the same artifact rather than hardcoded. */
  const undefinedApCases = (benchmark?.cases ?? []).filter((item) => item.sam_ap == null).length;

  const selectedCase = benchmark?.cases.find((item) => item.case_id === selected) ?? null;

  return (
    <div className="prose">
      <h2>{es ? 'Trece casos, cada uno con un modo de falla con nombre' : 'Thirteen cases, each with a named failure mode'}</h2>

      {/* Source: docs/cases/README.md "The category taxonomy" (four buckets, two explicit controls);
          data-pipeline/fslab/cases/froth_cases.py (Case: id, category, spec, expected_band). */}
      <p className="measure">
        {es
          ? 'Un caso canónico es una especificación de generador más una semilla fija, más una declaración de qué debería ver un experto en visión de espuma. Los trece cubren cuatro grupos: control, régimen de tamaño, estrés y transitorio. Dos son controles explícitos, y esa es la parte del diseño que hace verificable el resto. El control positivo es espuma casi monodispersa con brillos limpios, donde todo método debería aprobar; el control negativo es un cuadro sin espuma, donde todo método debe devolver cero burbujas. Si un método falla el control positivo o inventa burbujas en el cuadro vacío, sus victorias en el resto de la matriz no son confiables, y eso se detecta antes de mirar cualquier ranking.'
          : 'A canonical case is one generator specification plus a fixed seed, plus a statement of what a froth-vision expert should see. The thirteen span four buckets: control, size regime, stress, and transient. Two of them are explicit controls, and that is the part of the design that makes the rest checkable. The positive control is near-monodisperse froth with clean highlights, where every method should pass; the negative control is a frame with no froth, where every method must return zero bubbles. If a method fails the positive control or invents bubbles on the empty frame, its wins elsewhere in the matrix are not trustworthy, and that is caught before any ranking is read.'}
      </p>

      {/* Source: data-pipeline/fslab/science/froth_gen.py (_lognormal_radii: mu = ln(d32) - 2.5 s^2;
          pack_bubbles: n_target = 1.6*h*w/(pi*mean_r^2), rejection at 0.72*(r+r'), radii clipped at 4 px). */}
      <p className="measure">
        {es
          ? 'La geometría se controla por dos números, y ambos son físicos. Los radios salen de una log-normal cuyo parámetro de localización se elige para que la media de Sauter alcance exactamente el objetivo, lo que permite fijar el tamaño característico de burbuja sin tocar la dispersión; el segundo número es esa dispersión en el logaritmo. El empaque es por adsorción secuencial aleatoria con una prueba de rechazo que admite solapamiento entre discos, de modo que las celdas se toquen: en espuma real no hay burbujas separadas por fondo, y un banco que las separara premiaría a los métodos por resolver un problema que la espuma no plantea. El número objetivo de sitios se fija por área para que la fracción cubierta no dependa del tamaño elegido, y los diámetros se recortan por abajo para que ninguna celda quede bajo el límite de resolución del propio renderizador.'
          : 'Geometry is controlled by two numbers, and both are physical. Radii come from a log-normal whose location parameter is chosen so the Sauter mean hits the target exactly, which lets the characteristic bubble size be set without touching the spread; the second number is that spread in the logarithm. Packing is random sequential adsorption with a rejection test that allows disc overlap, so cells touch: real froth has no bubbles separated by background, and a benchmark that separated them would reward methods for solving a problem froth does not pose. The target number of sites is set by area so the covered fraction does not depend on the chosen size, and diameters are clipped from below so no cell falls under the renderer’s own resolution limit.'}
        {' '}<Cite id="sautermean" paren />
      </p>

      <Equation
        tex={String.raw`\mu = \ln d_{32} - 2.5\,\sigma_{\ln}^2 \;\Longrightarrow\; d_{32} = \frac{\sum_i d_i^3}{\sum_i d_i^2} = e^{\,\mu + 2.5\,\sigma_{\ln}^2}, \qquad d_{\mathrm{eq}} = 2\sqrt{A/\pi}`}
        caption={es
          ? 'Radios log-normales calibrados a la media de Sauter objetivo: sigma_ln es la dispersión logarítmica, A el área de una máscara de instancia y d_eq el diámetro del disco de igual área.'
          : 'Log-normal radii calibrated to the target Sauter mean: sigma_ln is the logarithmic spread, A the area of one instance mask, and d_eq the diameter of the disc with the same area.'}
      />

      {/* Source: data-pipeline/fslab/science/froth_gen.py render(): base 0.62 - 0.18*load; border term
          exp(-bd/(1.6 + 3.0*watery)) scaled by 0.32*(1 - 0.6*watery); highlight offset -0.35r, sigma 0.22r,
          dropped with probability 0.12*highlight_jitter; docs/cases/README.md "Honesty". */}
      <p className="measure">
        {es
          ? 'La apariencia se construye en capas separables, y una de ellas es una decisión de diseño dirigida contra un método concreto. Sobre un gris base que baja con la carga se resta un oscurecimiento de borde de Plateau calculado con la transformada de distancia euclídea exacta, cuya longitud de decaimiento crece con el parámetro de espuma acuosa: subir ese parámetro engrosa y desvanece la lamela a la vez, que es lo que hace una espuma delgada. Encima se pone un brillo especular por burbuja, desplazado hacia el cuadrante superior izquierdo del centro y con un ancho proporcional al radio. Ese brillo se sacude en posición y se omite por completo con probabilidad proporcional al parámetro de sacudida. La razón es experimental: una watershed sembrada en brillos obtendría un marcador limpio por burbuja y ganaría el banco leyendo una pista que una cámara de espuma real no entrega de forma confiable. El generador retira esa pista a propósito.'
          : 'Appearance is built in separable layers, and one of them is a design decision aimed at a specific method. On a base grey that darkens with load, a Plateau-border darkening computed from the exact Euclidean distance transform is subtracted, and its decay length grows with the watery parameter: raising that parameter thickens and fades the lamella at once, which is what a thin froth does. On top of that goes a per-bubble specular highlight, offset toward the upper-left quadrant of the centre and with a width proportional to the radius. That highlight is jittered in position and dropped entirely with a probability proportional to the jitter parameter. The reason is experimental: a watershed seeded on highlights would get one clean marker per bubble and win the benchmark by reading a cue a real froth camera does not reliably deliver. The generator withdraws that cue on purpose.'}
        {' '}<Cite id="weaire1999foams" paren /> <Cite id="meyer1994" paren /> <Cite id="wang2003froth" paren />
      </p>

      <h3>{es ? 'El estresor de cada caso y lo que prueba' : 'Each case’s stressor and what it probes'}</h3>

      <table className="fs-table">
        <caption className="hint">
          {es
            ? 'Todos los casos son sintéticos. Cuadros de 256 por 256 en gris; los tamaños son en píxeles de ese cuadro.'
            : 'Every case is synthetic. Frames are 256 by 256 grey; sizes are in pixels of that frame.'}
        </caption>
        <thead>
          <tr>
            <th>{es ? 'caso' : 'case'}</th>
            <th>{es ? 'grupo' : 'bucket'}</th>
            <th>{es ? 'modo de falla que provoca' : 'failure mode it provokes'}</th>
            <th>{es ? 'estresor' : 'stressor'}</th>
            <th className="num">{es ? 'semilla' : 'seed'}</th>
          </tr>
        </thead>
        <tbody>
          {CANONICAL_CASES.map((row) => (
            <tr key={row.id}>
              <td>{row.id}</td>
              <td>{es ? row.bucket_es : row.bucket_en}</td>
              <td>{es ? row.probe_es : row.probe_en}</td>
              <td>{es && row.knobs_es ? row.knobs_es : row.knobs}</td>
              <td className="num">{row.seed}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Source: docs/cases/01_coverage.md "Reading the result by bucket" and the per-case detail table
          (defocus 37 masks and motion-fast 25 masks against 170 and 197 GT instances; mono-clean AP50
          0.974 with 113 predicted against 114 GT). The glare-storm floor is data/derived/sam_benchmark.json
          cases[glare-storm]: it moved from watershed_dt 0.081 to valley_edge 0.182 when the per-case
          bakes were re-run after the 2026-08-01 C3 and C7 adoption, because the floor of that study is
          the BEST classical method on each case and C7 took that place on 8 of the 12 scored cases. */}
      <p className="measure">
        {es
          ? 'Los estresores no son ruido decorativo: cada uno corresponde a un modo de falla documentado de una cámara de espuma. El brillo saturado crea interiores falsos y borra la evidencia de lamela, y es el caso donde la separación se decide: sobre él el mejor clásico del caso cae a un AP de 0.182 mientras la segmentación promptable sin ajuste se mantiene en 0.407, algo más del doble. Esa brecha era de cinco veces hasta el 2026-08-01: el piso del caso era entonces el watershed por transformada de distancia con 0.081, y la watershed restringida de C7 lo reemplazó con 0.182 tras la adopción. Los dos casos de borrosidad van en la dirección contraria y se reportan así. El desenfoque gaussiano y el barrido de movimiento eliminan la estructura promptable, de modo que el conteo de máscaras confiables se derrumba a treinta y siete y veinticinco frente a ciento setenta y ciento noventa y siete instancias verdaderas, y el piso clásico queda por delante. Ese resultado no se esconde: la borrosidad se documenta como territorio del piso clásico, que es la razón por la que la aplicación ofrece los dos motores en vez de uno.'
          : 'The stressors are not decorative noise: each corresponds to a documented failure mode of a froth camera. Saturated glare creates false interiors and erases lamella evidence, and it is the case where the separation is decided: on it the best classical method of the case falls to an AP of 0.182 while untuned promptable segmentation holds 0.407, a little over twice. That gap was fivefold until 2026-08-01: the case floor was then the distance-transform watershed at 0.081, and the C7 constrained watershed replaced it at 0.182 after the adoption. The two blur cases run the other way, and they are reported that way. Gaussian defocus and motion smear remove the promptable structure, so the confident-mask count collapses to thirty-seven and twenty-five against one hundred and seventy and one hundred and ninety-seven true instances, and the classical floor comes out ahead. That result is not hidden: blur is documented as the classical floor’s territory, which is why the application ships both engines rather than one.'}
        {' '}<Cite id="kirillov2023" paren /> <Cite id="chen2023slimsam" paren />
      </p>

      {/* Source: docs/cases/01_coverage.md (empty-control returns 0 instances, AP and BSD-W reported as
          null; downstream code must treat a null AP as valid) and docs/metrics/01_definitions.md rule 3. */}
      <p className="measure">
        {es
          ? 'El control vacío merece una nota propia porque es el único caso cuyo resultado correcto es la nada. No tiene instancias verdaderas, así que el AP y la distancia entre distribuciones son indefinidos y se reportan como nulos, no como cero: un cero afirmaría que el método erró, y un uno afirmaría que acertó perfectamente, cuando lo que corresponde es que la cantidad no existe. El requisito sobre el método es devolver cero máscaras, y el requisito sobre el código aguas abajo es tratar un AP nulo y una distribución vacía como válidos en vez de como una caída. Es la prueba más simple del banco y la que más veces rompe una tubería escrita suponiendo que siempre hay algo que medir.'
          : 'The empty control deserves its own note because it is the only case whose correct result is nothing. It has no ground-truth instances, so AP and the distribution distance are undefined and are reported as null rather than zero: a zero would assert the method got it wrong, and a one would assert it got it perfectly right, when the correct statement is that the quantity does not exist. The requirement on the method is to return zero masks, and the requirement on downstream code is to treat a null AP and an empty distribution as valid rather than as a failure. It is the simplest test in the benchmark and the one that most often breaks a pipeline written on the assumption that there is always something to measure.'}
      </p>

      <h3>{es ? 'Evidencia por caso del estudio de grilla de prompts' : 'Per-case evidence from the prompt-grid study'}</h3>

      {/* Source: data/derived/sam_benchmark.json (model, grid, provenance, summary) loaded live below. */}
      <p className="measure">
        {es
          ? 'La evidencia puntuada más antigua sobre estos trece casos es un estudio de sensibilidad: preguntar si una grilla regular de puntos recupera instancias sin ningún ajuste específico a la tarea. Se conserva porque responde una pregunta que la matriz retenida no hace, y se conserva separada porque su protocolo no es el de la comparación principal. Las barras muestran el AP por caso contra la referencia clásica del mismo caso; el verde indica que la grilla de prompts iguala o supera esa referencia. Esa referencia es el mejor método clásico de cada caso, así que la adopción del 2026-08-01 la movió sin tocar una sola predicción de la grilla: el AP medio de la referencia subió de 0.262 a 0.351, la ventaja media de la grilla se redujo de 0.103 a 0.014 y los casos ganados pasaron de 10 a 5 sobre 12. El estudio se conserva con su nueva lectura en vez de con la anterior.'
          : 'The oldest scored evidence over these thirteen cases is a sensitivity study: asking whether a regular point grid recovers instances with no task-specific tuning at all. It is retained because it answers a question the held-out matrix does not ask, and it is kept separate because its protocol is not that of the primary comparison. The bars show per-case AP against the same case’s classical reference; green marks where the prompt grid matches or exceeds that reference. That reference is the best classical method on each case, so the 2026-08-01 adoption moved it without touching a single grid prediction: the mean reference AP rose from 0.262 to 0.351, the grid’s mean advantage shrank from 0.103 to 0.014, and cases won went from 10 to 5 out of 12. The study is kept with its new reading rather than its old one.'}
      </p>

      <Equation
        tex={String.raw`\mathcal{P} = \{(x_i, y_j) : x_i = i\,\Delta_x,\; y_j = j\,\Delta_y\},\qquad |\mathcal{P}| = 32 \times 32 = 1024`}
        caption={es
          ? 'La grilla regular de prompts del estudio histórico: 32 por 32 puntos sobre el cuadro, sin selección por caso.'
          : 'The regular prompt grid of the historical study: 32 by 32 points over the frame, with no per-case selection.'}
      />

      {benchmark && (
        <>
          <table className="fs-table">
            {/* Source: data/derived/sam_benchmark.json summary (n_cases 13, of which empty-control carries
                sam_ap: null, so the case count is not a count of scored cases). */}
            <caption className="hint">
              {es
                ? 'Resumen del estudio de grilla de prompts, leído del artefacto comprometido. El control vacío cuenta como caso del estudio pero no tiene AP definido, así que no entra en las medias ni en las victorias.'
                : 'Prompt-grid study summary, read from the committed artifact. The empty control counts as a case of the study but has no defined AP, so it enters neither the means nor the wins.'}
            </caption>
            <tbody>
              <tr>
                <th>{es ? 'Casos del estudio' : 'Cases in the study'}</th>
                <td className="num">{benchmark.summary.n_cases}</td>
                <th>{es ? 'AP medio de la grilla' : 'Mean grid AP'}</th>
                <td className="num">{benchmark.summary.mean_sam_ap?.toFixed(3) ?? 'n/a'}</td>
              </tr>
              <tr>
                <th>{es ? 'AP medio de la referencia clásica' : 'Mean classical reference AP'}</th>
                <td className="num">{benchmark.summary.mean_floor_ap?.toFixed(3) ?? 'n/a'}</td>
                <th>{es ? 'Casos ganados' : 'Cases won'}</th>
                {/* Denominator is the number of cases that carry an AP at all: data/derived/sam_benchmark.json
                    holds 13 cases and 12 non-null sam_ap values, and the artifact's sam_wins (5 after the
                    2026-08-01 re-bake, 10 before it) is counted over those 12, so 13 would understate the
                    win rate against its own definition. */}
                <td className="num">{benchmark.summary.sam_wins} / {benchmark.summary.n_cases - undefinedApCases}</td>
              </tr>
            </tbody>
          </table>
          <PanelBoundary label={es ? 'sensibilidad de la grilla de prompts' : 'prompt-grid sensitivity'}>
            <BarChart
              data={bars}
              ariaLabel={es ? 'AP de máscara de la grilla de prompts por caso' : 'prompt-grid mask AP per case'}
              valueFmt={(value) => value.toFixed(3)}
              defaultBaseline="zero"
              note={es
                ? `Verde: iguala o supera la referencia del caso. Naranja: la referencia clásica conserva ventaja. Los casos sin instancias verdaderas quedan fuera del gráfico (aquí ${undefinedApCases}): su AP es indefinido, no cero.`
                : `Green: matches or exceeds the case reference. Orange: the classical reference retains the advantage. Cases with no ground-truth instances are left out of the chart (${undefinedApCases} here): their AP is undefined, not zero.`}
            />
          </PanelBoundary>

          <label className="hint">
            {es ? 'Inspeccionar caso' : 'Inspect case'}{' '}
            <select className="select" value={selected} onChange={(event) => setSelected(event.target.value)}>
              {benchmark.cases.map((item) => <option key={item.case_id} value={item.case_id}>{item.case_id}</option>)}
            </select>
          </label>

          <div className="two-col">
            <PanelBoundary label={es ? 'verdad exacta' : 'ground truth'}>
              {groundTruth
                ? (
                  <MaskOverlay
                    baseUrl={artifactUrl(`synth/${selected}/frame.png`)}
                    labels={groundTruth.labels}
                    width={groundTruth.w}
                    height={groundTruth.h}
                    caption={es ? 'Referencia exacta del caso controlado.' : 'Exact reference for the controlled case.'}
                  />
                )
                : <p className="hint">{es ? 'Cargando máscaras exactas.' : 'Loading exact masks.'}</p>}
            </PanelBoundary>
            {selectedCase && (
              <table className="fs-table">
                <tbody>
                  <tr><th>{es ? 'categoría' : 'category'}</th><td>{selectedCase.category}</td></tr>
                  <tr><th>AP</th><td className="num">{selectedCase.sam_ap?.toFixed(3) ?? 'n/a'}</td></tr>
                  <tr><th>AP50</th><td className="num">{selectedCase.sam_ap50?.toFixed(3) ?? 'n/a'}</td></tr>
                  <tr><th>{es ? 'AP de referencia' : 'reference AP'}</th><td className="num">{selectedCase.floor_ap?.toFixed(3) ?? 'n/a'}</td></tr>
                  <tr><th>{es ? 'instancias predichas / verdaderas' : 'predicted / true instances'}</th><td className="num">{selectedCase.sam_n} / {selectedCase.gt_n}</td></tr>
                  <tr><th>{es ? 'd32 predicho / verdadero (px)' : 'predicted / true d32 (px)'}</th><td className="num">{selectedCase.sam_d32 ?? 'n/a'} / {selectedCase.gt_d32 ?? 'n/a'}</td></tr>
                  <tr><th>{es ? 'distancia W1 entre distribuciones (px)' : 'distribution W1 distance (px)'}</th><td className="num">{selectedCase.sam_bsd_w?.toFixed(2) ?? 'n/a'}</td></tr>
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <Callout variant="honest" title={es ? 'Alcance de esta superficie' : 'Scope of this surface'}>
        <p className="measure">
          {es
            ? 'Un AP sintético mide un método contra un objetivo conocido y controlable; no mide cómo le va sobre la cámara de espuma de una concentradora real, y ningún número de esta pestaña debe citarse como exactitud de planta. El estudio de grilla de prompts, además, es evidencia histórica: no reemplaza la comparación retenida de los quince métodos ni se ordena por encima de ella. Sobre espuma real subida por un usuario no hay verdad, así que no hay AP; ahí la aplicación reporta máscaras y distribución de tamaños sin puntaje.'
            : 'A synthetic AP measures a method against a known, controllable target; it does not measure how it does on a real concentrator’s froth camera, and no number in this tab should be quoted as plant accuracy. The prompt-grid study is additionally historical evidence: it does not replace the held-out fifteen-method comparison and does not rank above it. On real froth uploaded by a user there is no truth, so there is no AP; there the application reports masks and a size distribution without a score.'}
        </p>
      </Callout>

      <Refs ids={['weaire1999foams', 'meyer1994', 'wang2003froth', 'kirillov2023', 'chen2023slimsam', 'sautermean']} label="Refs" />
    </div>
  );
}

/* ============================================================================
   3. SPLITS
   ========================================================================== */

function Splits({ es, methods }: { es: boolean; methods: MethodBenchmarkDoc | null }) {
  return (
    <div className="prose">
      <h2>{es ? 'La unidad de división no es la imagen' : 'The split unit is not the image'}</h2>

      {/* Source: docs/data-contract/01_records-and-splits.md (split unit = strongest related-data key;
          record fields; calibration split used for threshold selection; test read only by evaluation). */}
      <p className="measure">
        {es
          ? 'Cada registro puntuable lleva un identificador de muestra, un identificador de fuente, un identificador de grupo, las direcciones de imagen y anotación, ancho, alto y división. Los datos de video agregan identificador de video e índice de cuadro; los datos de planta deben llevar una clave de sitio o campaña. La regla que ordena todo lo demás es que la unidad de división es la clave de relación más fuerte disponible, no el archivo: fuente, video, sitio y grupo de geometría latente sintética. Un cuadro de video adyacente y una variante de apariencia de la misma escena no son muestras independientes, y tratarlas como tales convierte una prueba retenida en una prueba de memorización. Además, la selección de umbrales usa la división de calibración, y las anotaciones de la división de prueba solo las lee la evaluación.'
          : 'Every scoreable record carries a sample id, a source id, a group id, image and annotation addresses, width, height, and split. Video data adds a video id and a frame index; plant data must carry a site or campaign key. The rule that orders everything else is that the split unit is the strongest available related-data key, not the file: source, video, site, and latent synthetic geometry group. An adjacent video frame and an appearance variant of the same scene are not independent samples, and treating them as such turns a held-out test into a memorisation test. Threshold selection additionally uses the calibration split, and test annotations are read only by evaluation.'}
      </p>

      {/* Source: data-pipeline/fslab/datasets.py learned_dataset_matrix (16 conditions x 12 latent groups,
          split_counts train 6 / validation 2 / calibration 2 / test 2, appearance_variants 2, image_size 192)
          and _condition_specs (12 non-empty canonical specs + 4 added families). */}
      <p className="measure">
        {es
          ? 'La matriz se construye de forma explícita en vez de sortearse. Hay dieciséis familias de condición: las doce especificaciones canónicas no vacías más cuatro añadidas para cubrir huecos que los casos canónicos no tocan, una nube de microburbujas en el límite de resolución, una distribución muy ancha como sustituto de bimodalidad, un compuesto de brillo con movimiento y un compuesto de oscuridad con desenfoque. Cada familia posee doce geometrías latentes independientes, repartidas en seis de entrenamiento, dos de validación, dos de calibración y dos de prueba intocada. De cada geometría latente se renderizan dos variantes de apariencia que comparten el identificador de grupo y la geometría de instancias, así que difieren en iluminación, brillos y ruido pero no en dónde están las burbujas. El total es trescientas ochenta y cuatro muestras y la prueba retenida son sesenta y cuatro.'
          : 'The matrix is constructed explicitly rather than drawn by lot. There are sixteen condition families: the twelve non-empty canonical specifications plus four added to cover gaps the canonical cases do not touch, a microbubble cloud at the resolution limit, a very wide distribution as a bimodality proxy, a glare-with-motion compound, and a darkness-with-defocus compound. Each family owns twelve independent latent geometries, allotted as six train, two validation, two calibration, and two untouched test. From each latent geometry two appearance variants are rendered that share the group id and the instance geometry, so they differ in illumination, highlights and noise but not in where the bubbles are. The total is three hundred and eighty-four samples and the held-out test is sixty-four.'}
      </p>

      <Equation
        tex={String.raw`N = 16 \times 12 \times 2 = 384, \qquad N_{\mathrm{test}} = 16 \times 2 \times 2 = 64, \qquad 15 \text{ methods} \times 64 = 960 \text{ cells}`}
        caption={es
          ? 'Dieciséis condiciones por doce geometrías latentes por dos apariencias; la prueba usa las dos geometrías retenidas de cada condición.'
          : 'Sixteen conditions by twelve latent geometries by two appearances; the test uses the two held-out geometries of each condition.'}
      />

      <LeakageFigure es={es} />

      {/* Source: data-pipeline/fslab/datasets.py _bucket (sha256 of "seed:group_id", first 8 bytes mod 100)
          and grouped_split (thresholds 65 / 80 / 90 giving 65/15/10/10). */}
      <p className="measure">
        {es
          ? 'Para fuentes que no llegan con una matriz declarada, la división es una función hash del grupo y no un sorteo con estado. Se toma un resumen criptográfico de la semilla concatenada con la clave de grupo, se leen los primeros ocho bytes como entero y se reduce módulo cien; los cortes en 65, 80 y 90 dan entrenamiento, validación, calibración y prueba en proporciones 65, 15, 10 y 10. Esta construcción tiene dos propiedades que un barajado no tiene. Es determinista sin guardar estado de generador, así que dos máquinas producen la misma división a partir del mismo par semilla-grupo. Y es estable al crecer: agregar muestras nuevas no reasigna las viejas, porque el balde de un grupo depende solo de su clave, de modo que una prueba retenida sigue siendo retenida después de que llega más datos.'
          : 'For sources that do not arrive with a declared matrix, the split is a hash function of the group rather than a stateful draw. A cryptographic digest of the seed concatenated with the group key is taken, its first eight bytes are read as an integer, and the result is reduced modulo one hundred; cuts at 65, 80 and 90 give train, validation, calibration and test in proportions 65, 15, 10 and 10. This construction has two properties a shuffle does not. It is deterministic without storing generator state, so two machines produce the same split from the same seed and group key. And it is stable under growth: adding new samples does not reassign the old ones, because a group’s bucket depends only on its key, so a held-out test stays held out after more data arrives.'}
      </p>

      <Equation
        tex={String.raw`b(g) = \bigl(\mathrm{SHA\text{-}256}(s \Vert g)_{[0:8]} \bmod 100\bigr), \quad \text{split}(g) = \begin{cases} \text{train} & b < 65 \\ \text{validation} & 65 \le b < 80 \\ \text{calibration} & 80 \le b < 90 \\ \text{test} & b \ge 90 \end{cases}`}
        caption={es
          ? 'Balde de grupo: s es la semilla de división, g la clave de grupo y b el entero de los primeros ocho bytes del resumen, módulo cien.'
          : 'Group bucket: s is the split seed, g the group key, and b the integer from the first eight bytes of the digest, modulo one hundred.'}
      />

      {/* Source: data-pipeline/fslab/datasets.py validate_splits (duplicate ids, group leakage, scoreable
          without mask, non-positive mm_per_px, missing licence) and validate_learned_matrix (16 conditions,
          6/2/2/2 groups per condition); docs/architecture/06_model-evaluation.md (thresholds fixed before test). */}
      <p className="measure">
        {es
          ? 'La ausencia de fuga no se declara, se verifica, y el verificador rechaza cinco cosas por separado: un identificador de muestra duplicado, un grupo que aparece en dos divisiones, una muestra puntuable sin máscara, una escala de calibración no positiva y una licencia ausente. Sobre la matriz sintética se agrega una comprobación estructural: exactamente dieciséis familias de condición, y exactamente seis, dos, dos y dos grupos por condición en entrenamiento, validación, calibración y prueba. Como las dos variantes de apariencia de una geometría comparten el identificador de grupo, una fuga por variantes no queda como sospecha estadística: aparece como el mismo grupo en dos divisiones y el verificador la nombra. Los parámetros y los umbrales de posprocesamiento quedan fijos antes de evaluar la prueba, así que la prueba retenida se lee una vez.'
          : 'The absence of leakage is not asserted, it is checked, and the checker rejects five things separately: a duplicate sample id, a group appearing in two splits, a scoreable sample with no mask, a non-positive calibration scale, and a missing licence. On the synthetic matrix a structural check is added: exactly sixteen condition families, and exactly six, two, two and two groups per condition in train, validation, calibration and test. Because the two appearance variants of a geometry share the group id, a variant leak is not left as a statistical suspicion: it shows up as the same group in two splits and the checker names it. Parameters and post-processing thresholds are fixed before test evaluation, so the held-out test is read once.'}
      </p>

      {/* Source: docs/data-contract/01_records-and-splits.md (mm_per_px positive only with traceable
          calibration, never silently imputed); data-pipeline/fslab/datasets.py (mm_per_px=None for every
          synthetic sample); docs/metrics/01_definitions.md (units travel with the number). */}
      <p className="measure">
        {es
          ? 'Una última regla de construcción decide en qué unidades se puede hablar. La escala física es positiva solo cuando existe una calibración trazable; si falta, toda la morfometría queda en píxeles y nunca se imputa en silencio. En esta matriz sintética la escala es nula en cada muestra, de modo que cada tamaño publicado en el banco es un tamaño en píxeles de un cuadro de 192 por 192, y la unidad viaja junto al número en vez de suponerse. Los estresores que se miden en píxeles se reescalan por el cociente de tamaños cuando la condición canónica de 256 se instancia a 192, para que un desenfoque signifique la misma cosa física en las dos superficies.'
          : 'One last construction rule decides what units the results may be discussed in. The physical scale is positive only when a traceable calibration exists; when it is missing, all morphometry stays in pixels and is never silently imputed. In this synthetic matrix the scale is null on every sample, so every size published in the benchmark is a size in pixels of a 192 by 192 frame, and the unit travels with the number instead of being assumed. Stressors measured in pixels are rescaled by the size ratio when a 256-pixel canonical condition is instantiated at 192, so a defocus means the same physical thing on both surfaces.'}
      </p>

      {methods && (
        <table className="fs-table">
          <caption className="hint">
            {es ? 'Cobertura de la matriz retenida, leída del artefacto comprometido.' : 'Held-out matrix coverage, read from the committed artifact.'}
          </caption>
          <tbody>
            <tr>
              <th>{es ? 'Unidad de división' : 'Split unit'}</th>
              <td>{es ? 'grupo de geometría latente' : 'latent geometry group'}</td>
              <th>{es ? 'Muestras de prueba' : 'Test samples'}</th>
              <td className="num">{methods.coverage.expected_test_samples}</td>
            </tr>
            <tr>
              <th>{es ? 'Celdas completas' : 'Cells complete'}</th>
              <td>{methods.coverage.complete ? (es ? 'sí' : 'yes') : (es ? 'no' : 'no')}</td>
              <th>{es ? 'Errores de cobertura' : 'Coverage errors'}</th>
              <td className="num">{methods.coverage.errors.length}</td>
            </tr>
          </tbody>
        </table>
      )}

      <Callout variant="honest" title={es ? 'Una división sin fuga es necesaria, no suficiente' : 'A leakage-safe split is necessary, not sufficient'}>
        <p className="measure">
          {es
            ? 'Agrupar por geometría latente protege contra una cosa concreta: que un modelo apruebe la prueba porque ya vio esa escena con otra iluminación. No protege contra el problema mayor, que las trescientas ochenta y cuatro muestras salen de un solo generador, y ese problema no es una elección de este repositorio: la escasez de espuma real etiquetada es el bloqueo documentado del campo. Un modelo puede respetar perfectamente la división y seguir aprendiendo la estadística de lamela de este renderizador en vez de la de la espuma. Esa duda no se resuelve con un mejor sorteo; se resuelve saliendo del generador, que es lo que hace la pestaña de transferencia.'
            : 'Grouping by latent geometry protects against one concrete thing: a model passing the test because it already saw that scene under different illumination. It does not protect against the larger problem, which is that all three hundred and eighty-four samples come from one generator, and that problem is not this repository’s choice: the scarcity of labelled real froth is the field’s documented blocker. A model can respect the split perfectly and still learn this renderer’s lamella statistics rather than froth’s. That doubt is not resolved by a better draw; it is resolved by leaving the generator, which is what the transfer tab does.'}
          {' '}<Cite id="fu2019" paren />
        </p>
      </Callout>

      <Refs ids={['fu2019']} label="Refs" />
    </div>
  );
}

/* ============================================================================
   4. ROBUSTNESS
   ========================================================================== */

function Robustness({ es, methods }: { es: boolean; methods: MethodBenchmarkDoc | null }) {
  const conditions = useMemo(() => {
    const first = methods?.methods.find((method) => method.test?.robustness_by_condition)?.test?.robustness_by_condition;
    return first ? Object.keys(first) : [];
  }, [methods]);
  const rows = methods?.methods.filter((method) => method.test?.robustness_by_condition) ?? [];

  return (
    <div className="prose">
      <h2>{es ? 'La media esconde la condición que rompe el método' : 'The mean hides the condition that breaks a method'}</h2>

      {/* Source: docs/metrics/01_definitions.md aggregation rule 4 (robustness_by_condition keeps all 16
          condition families apart because a mean over conditions hides the failure that matters). */}
      <p className="measure">
        {es
          ? 'El evaluador mantiene las dieciséis familias de condición separadas y publica el AP de cada una junto a su desviación respecto de la media global del método. No es una comodidad de presentación: es una regla de agregación, porque un promedio sobre condiciones esconde exactamente la falla que le importa a un operador. Un método con un AP global respetable puede estar comprando ese promedio con un desempeño excelente en el caso nominal y un colapso en la condición que su cámara sufre todos los turnos. El mapa de abajo se lee en dos direcciones: en horizontal es el perfil de robustez de un método, y en vertical es la comparación entre soluciones bajo una misma perturbación.'
          : 'The evaluator keeps all sixteen condition families apart and publishes each one’s AP next to its deviation from the method’s global mean. This is not a presentation convenience: it is an aggregation rule, because a mean over conditions hides exactly the failure a practitioner cares about. A method with a respectable global AP may be buying that average with excellent performance on the nominal case and a collapse on the condition its camera suffers every shift. The map below reads in two directions: horizontally it is one method’s robustness profile, vertically it is the comparison between solutions under one perturbation.'}
      </p>

      <Equation
        tex={String.raw`\Delta_{m,c} = \mathrm{AP}(m, c) - \mathrm{AP}(m, \text{all}), \qquad \mathrm{AP}(m, c) = \frac{1}{n_c}\sum_{i \in c} \mathrm{AP}(m, i), \quad n_c = 4`}
        caption={es
          ? 'Desviación de robustez del método m en la condición c: cada condición aporta cuatro muestras retenidas (dos geometrías por dos apariencias).'
          : 'Robustness deviation of method m under condition c: each condition contributes four held-out samples (two geometries by two appearances).'}
      />

      {!methods && <p className="hint">{es ? 'Cargando el mapa de robustez.' : 'Loading the robustness map.'}</p>}

      {methods && (
        <>
          <div className="fs-heatmap-legend"><span>AP 0.00</span><i /><i /><i /><i /><i /><span>AP 0.70+</span></div>
          <div className="fs-robustness-scroll">
            <div className="fs-robustness-map" style={{ gridTemplateColumns: `175px repeat(${conditions.length}, 42px)` }}>
              <div />
              {conditions.map((condition) => (
                <div key={condition} className="fs-condition-label"><span>{shortCondition(condition)}</span></div>
              ))}
              {rows.map((method) => <RobustnessRow key={method.id} method={method} conditions={conditions} />)}
            </div>
          </div>
        </>
      )}

      {/* Source: data-pipeline/fslab/datasets.py _condition_specs (microbubble-cloud d32 10 px sigma 0.35;
          wide-bimodal-proxy sigma 0.9; glare-motion-compound glare 0.65 with motion_blur 9;
          dark-defocus-compound load 0.88 with defocus 2.8). */}
      <p className="measure">
        {es
          ? 'Cuatro de las dieciséis condiciones existen solo en esta matriz, y cada una prueba una hipótesis de método distinta. La nube de microburbujas baja el tamaño característico a diez píxeles: ahí la pregunta no es la calidad del borde sino si dos marcadores pueden sostenerse a esa separación, y un método que dependa de una supresión de máximos con radio fijo se queda sin resolución. La distribución muy ancha lleva la dispersión logarítmica a 0.9 y pregunta si un único parámetro de escala puede cubrir dos poblaciones de tamaño a la vez, que es el sustituto de una espuma bimodal. Los dos compuestos existen porque la robustez a un estresor no predice la robustez al par: una cámara real entrega el brillo junto con el movimiento, y la oscuridad junto con el desenfoque, y probar por separado deja sin medir la interacción.'
          : 'Four of the sixteen conditions exist only in this matrix, and each tests a different hypothesis about methods. The microbubble cloud drops the characteristic size to ten pixels: there the question is not boundary quality but whether two markers can hold at that separation, and a method depending on a fixed-radius maximum suppression runs out of resolution. The very wide distribution takes the logarithmic spread to 0.9 and asks whether one scale parameter can cover two size populations at once, which is the bimodal-froth proxy. The two compounds exist because robustness to one stressor does not predict robustness to the pair: a real camera delivers glare together with motion, and darkness together with defocus, and testing separately leaves the interaction unmeasured.'}
        {' '}<Cite id="zhu2025gcfsegnet" paren /> <Cite id="fan2024parallel" paren />
      </p>

      {/* Source: docs/problem-types/01_failure-modes.md (thin dark lamellae, wet froth suppression, glare
          false interiors, blur erasing ridges, dense fine bubbles, frame truncation; a method may hold a
          high boundary score while catastrophically merging bubbles). */}
      <p className="measure">
        {es
          ? 'Los mecanismos detrás de las columnas son los de la espuma, no los de una tabla de puntajes. Las lamelas de espuma seca pueden ser finas y oscuras, y la espuma húmeda las suprime; el brillo crea interiores falsos, la borrosidad borra las crestas, la espuma fina y densa desafía la resolución, y el truncamiento del cuadro distorsiona la morfometría de las burbujas del borde. Por eso una fila del mapa no se resume en un número: un método puede lograr un puntaje de frontera alto y a la vez fusionar burbujas de forma catastrófica, o conservar el recuento y desplazar la distribución de tamaños. El producto expone la falla específica de cada método en vez de comprimirla en un solo orden.'
          : 'The mechanisms behind the columns are froth’s, not a scoreboard’s. Dry-froth lamellae can be thin and dark, and wet froth suppresses them; glare creates false interiors, blur erases ridges, dense fine bubbles challenge resolution, and frame truncation distorts the morphometry of edge bubbles. That is why a row of the map does not reduce to one number: a method may achieve a high boundary score while catastrophically merging bubbles, or preserve count while shifting the size distribution. The product exposes each method’s specific failure rather than compressing it into one rank.'}
        {' '}<Cite id="wang2018" paren />
      </p>

      <Callout variant="honest" title={es ? 'Degradación honesta, no un cien por ciento' : 'Honest degradation, not a flat hundred per cent'}>
        <p className="measure">
          {es
            ? 'El mapa está publicado con sus celdas malas a la vista. Hay condiciones donde métodos completos caen cerca de cero, y hay métodos cuyo mejor número global convive con una columna colapsada. Ninguna de esas celdas se recorta ni se promedia hacia arriba, porque el propósito de la matriz es localizar el punto de ruptura, no producir una curva plana. Un banco que solo muestra su mejor condición no informa una decisión de despliegue.'
            : 'The map is published with its bad cells visible. There are conditions where entire methods fall near zero, and methods whose best global number sits next to a collapsed column. None of those cells is trimmed or averaged upward, because the purpose of the matrix is to locate the breaking point, not to produce a flat curve. A benchmark that shows only its best condition does not inform a deployment decision.'}
        </p>
      </Callout>

      <Refs ids={['zhu2025gcfsegnet', 'fan2024parallel', 'wang2018']} label="Refs" />
    </div>
  );
}

function RobustnessRow({ method, conditions }: { method: MethodBenchmarkRow; conditions: string[] }) {
  const values = method.test?.robustness_by_condition ?? {};
  return (
    <>
      <div className="fs-method-label"><strong>{method.id}</strong><span>{method.name}</span></div>
      {conditions.map((condition) => {
        /* A condition with no entry in data/derived/method-benchmark.json test.robustness_by_condition is a
           gap in the evidence, never an AP of 0: it is drawn as a neutral cell reading n/a. The committed
           artifact has coverage.complete true (960 of 960 cells), so this branch is the guard, not the norm. */
        const cell = values[condition];
        if (!cell) {
          return (
            <div
              key={`${method.id}-${condition}`}
              className="fs-heat-cell"
              style={{ '--heat': 'var(--color-fg-faint)' } as React.CSSProperties}
              title={`${method.id} · ${condition}: AP n/a`}
            >
              <span>n/a</span>
            </div>
          );
        }
        const value = cell.mean_ap;
        return (
          <div
            key={`${method.id}-${condition}`}
            className="fs-heat-cell"
            style={{ '--heat': heatColor(value) } as React.CSSProperties}
            title={`${method.id} · ${condition}: AP ${value.toFixed(3)}`}
          >
            <span>{value.toFixed(2)}</span>
          </div>
        );
      })}
    </>
  );
}

/* ============================================================================
   5. TEMPORAL
   ========================================================================== */

function Temporal({ es, temporal }: { es: boolean; temporal: TemporalBenchmarkDoc | null }) {
  return (
    <div className="prose">
      <h2>{es ? 'Una máscara correcta por cuadro no es una trayectoria correcta' : 'A correct mask per frame is not a correct track'}</h2>

      {/* Source: docs/temporal/02_the-full-method-matrix.md (geometry sampled once per sequence, smooth
          sub-bubble displacement, distinct appearance seed, identities exact by construction; 15 methods,
          5 sequences, 8 frames, 75 pairs, 600 prediction frames);
          data-pipeline/fslab/science/froth_gen.py generate_sequence (displacement_px 3.0, phase 2*pi*i/frames). */}
      <p className="measure">
        {es
          ? 'Una celda de flotación no pregunta si la máscara de este cuadro es buena; pregunta si la burbuja de este cuadro es la misma burbuja del cuadro anterior mientras la superficie avanza, brilla y revienta. Para medir eso hace falta una verdad de identidad, no una segmentación por cuadro reetiquetada, y el generador la produce por construcción: la geometría se muestrea una vez por secuencia, cada cuadro aplica un desplazamiento suave menor que una burbuja y una semilla de apariencia distinta, y los identificadores de instancia se arrastran sin reemparejar. Así la referencia temporal es una referencia de identidad real. La cobertura del carril es de quince métodos por cinco secuencias por ocho cuadros, es decir setenta y cinco pares publicados y seiscientos cuadros de predicción, y la expectativa se deriva del registro de métodos en vez de una lista escrita a mano, de modo que un método no puede entrar a la escalera y saltarse este carril en silencio.'
          : 'A flotation cell does not ask whether this frame’s mask is good; it asks whether this frame’s bubble is the same bubble as the previous frame’s while the surface advects, glares and bursts. Measuring that requires an identity truth, not a per-frame segmentation relabelled, and the generator produces one by construction: geometry is sampled once per sequence, each frame applies a smooth sub-bubble displacement and a distinct appearance seed, and instance ids are carried through without rematching. The temporal reference is therefore a real identity reference. Lane coverage is fifteen methods by five sequences by eight frames, that is seventy-five published pairs and six hundred prediction frames, and the expectation is derived from the method registry rather than a hand-written list, so a method cannot join the ladder and quietly skip this lane.'}
      </p>

      {/* Source: docs/temporal/02_the-full-method-matrix.md, the five-sequence table. */}
      <table className="fs-table">
        <caption className="hint">{es ? 'Las cinco secuencias y la forma en que cada una rompe la identidad.' : 'The five sequences and the way each one breaks identity.'}</caption>
        <thead><tr><th>{es ? 'secuencia' : 'sequence'}</th><th>{es ? 'qué estresa' : 'what it stresses'}</th></tr></thead>
        <tbody>
          <tr><td>poly-normal</td><td>{es ? 'transporte nominal con identidades persistentes y diversidad moderada de tamaño' : 'nominal transport with persistent identities and moderate size diversity'}</td></tr>
          <tr><td>fine-froth</td><td>{es ? 'espuma fina y densa, donde la separación de instancias y la continuidad de trayectoria compiten' : 'dense fine bubbles, where instance separation and track continuity compete'}</td></tr>
          <tr><td>glare-storm</td><td>{es ? 'brillos especulares en movimiento que borran la evidencia de lamela e inventan candidatos a evento' : 'moving specular highlights that erase lamella evidence and invent event candidates'}</td></tr>
          <tr><td>motion-fast</td><td>{es ? 'advección rápida, que prueba la estimación de movimiento y la asociación de identidad' : 'rapid advection, testing motion estimation and identity association'}</td></tr>
          <tr><td>bursting</td><td>{es ? 'cambio topológico, donde los nacimientos y las coalescencias son la señal' : 'topological change, where births and coalescences are the signal'}</td></tr>
        </tbody>
      </table>

      <TemporalProtocolFigure es={es} />

      {/* Source: docs/temporal/02_the-full-method-matrix.md (two prediction modes; greedy IoU association at
          0.25; L7 prompted with 12 exact first-frame masks; L7 IDF1 and HOTA 1.000 by construction and its
          honest number is mean identity IoU 0.898); docs/architecture/06_model-evaluation.md. */}
      <p className="measure">
        {es
          ? 'Hay dos modos de predicción y no se juntan nunca, porque de eso depende que los números signifiquen algo. En el modo cuadro a cuadro, catorce métodos segmentan cada cuadro de forma independiente y la identidad se asigna después por asociación codiciosa de IoU a un umbral de 0.25; su puntaje de identidad mide cuán estables son las máscaras entre cuadros, no la calidad de un rastreador que el método no tiene. En el modo de propagación nativa con prompt, un método con memoria propia recibe las máscaras exactas de una cohorte de doce instancias en el cuadro cero y propaga hacia adelante, sin que se le pida descubrir nada. La consecuencia es aritmética y conviene decirla sin adornos: ese método marca identidad perfecta en todas las secuencias porque se le entregan doce identidades y se le evalúa si todavía tiene doce. Su número honesto es el IoU medio de identidad, 0.898 sobre las cinco secuencias, que mide cuán bien las máscaras propagadas siguen cubriendo los objetos que le dieron.'
          : 'There are two prediction modes and they are never merged, because whether the numbers mean anything depends on that. In the framewise mode, fourteen methods segment every frame independently and identity is assigned afterwards by greedy IoU association at a 0.25 threshold; their identity score measures how stable the masks are from frame to frame, not the quality of a tracker the method does not have. In the native prompted propagation mode, a method with its own memory receives the exact masks of a twelve-instance cohort on frame zero and propagates forward, and is never asked to discover anything. The consequence is arithmetic and is worth stating plainly: that method posts perfect identity on every sequence because it is handed twelve identities and evaluated on whether it still has twelve. Its honest number is the mean identity IoU, 0.898 across the five sequences, which measures how well the propagated masks still cover the objects they were given.'}
        {' '}<Cite id="ravi2024sam2" paren /> <Cite id="kuhn1955hungarian" paren />
      </p>

      <Equation
        tex={String.raw`\mathrm{IDF1} = \frac{2\,IDTP}{2\,IDTP + IDFP + IDFN}, \qquad \mathrm{HOTA} = \sqrt{\mathrm{DetA}\cdot\mathrm{AssA}}`}
        caption={es
          ? 'Continuidad de identidad agregada sobre todos los cuadros, y la media geométrica que factoriza exactitud de detección (DetA) y de asociación (AssA) en vez de mezclarlas.'
          : 'Identity continuity aggregated over all frames, and the geometric mean that factorises detection accuracy (DetA) from association accuracy (AssA) instead of mixing them.'}
      />
      <p className="hint">
        {es
          ? 'IDF1 es el F1 de identidad de la literatura de seguimiento multiobjeto, publicado aquí en la forma que la revisión de HOTA reformula; la factorización de detección y asociación es la razón por la que se publica HOTA junto a IDF1 y no en su lugar.'
          : 'IDF1 is the identity F-score of the multi-object tracking literature, published here in the form the HOTA analysis restates; the factorisation of detection from association is why HOTA is published next to IDF1 rather than in place of it.'}
        {' '}<Cite id="luiten2021hota" paren />
      </p>

      {!temporal && <p className="hint">{es ? 'Cargando el reporte temporal.' : 'Loading the temporal report.'}</p>}

      {temporal && (
        <table className="fs-table">
          <caption className="hint">
            {es
              ? 'Carril cuadro a cuadro, leído del reporte temporal comprometido. Umbral de asociación y dispositivo son campos del artefacto.'
              : 'Framewise lane, read from the committed temporal report. Association threshold and device are artifact fields.'}
          </caption>
          <thead>
            <tr>
              <th>{es ? 'secuencia' : 'sequence'}</th>
              <th className="num">{es ? 'cuadros' : 'frames'}</th>
              <th className="num">IDF1</th>
              <th className="num">HOTA</th>
              <th className="num">{es ? 'cobertura' : 'coverage'}</th>
              <th className="num">{es ? 'cambios de id' : 'id switches'}</th>
              <th className="num">{es ? 'fragmentos' : 'fragments'}</th>
              <th className="num">{es ? 'prec. / rec. de eventos' : 'event prec. / rec.'}</th>
              <th className="num">{es ? 'EPE de flujo (px)' : 'flow EPE (px)'}</th>
            </tr>
          </thead>
          <tbody>
            {temporal.sequences.map((sequence) => (
              <tr key={sequence.condition_id}>
                <td>{sequence.condition_id}</td>
                <td className="num">{sequence.frames}</td>
                <td className="num">{sequence.idf1.toFixed(3)}</td>
                <td className="num">{sequence.hota.toFixed(3)}</td>
                <td className="num">{(sequence.mean_frame_coverage * 100).toFixed(1)}%</td>
                <td className="num">{sequence.id_switches ?? '-'}</td>
                <td className="num">{sequence.track_fragmentations}</td>
                <td className="num">{sequence.event_precision.toFixed(3)} / {sequence.event_recall.toFixed(3)}</td>
                <td className="num">{sequence.flow_epe_px != null ? sequence.flow_epe_px.toFixed(2) : 'n/a'}</td>
              </tr>
            ))}
            <tr>
              <td><strong>{es ? 'media' : 'mean'}</strong></td>
              <td className="num">{temporal.sequences.reduce((sum, item) => sum + item.frames, 0)}</td>
              <td className="num">{temporal.mean_idf1.toFixed(3)}</td>
              <td className="num">{temporal.mean_hota.toFixed(3)}</td>
              <td className="num">-</td>
              <td className="num">-</td>
              <td className="num">{temporal.total_track_fragmentations}</td>
              <td className="num">{temporal.mean_event_precision.toFixed(3)} / {temporal.mean_event_recall.toFixed(3)}</td>
              <td className="num">{temporal.mean_flow_epe_px.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      )}

      {/* Source: docs/temporal/01_tracking-and-events.md (bursting exports exact birth/coalescence events,
          drift sequences are negative controls) and docs/temporal/02_the-full-method-matrix.md (on the
          nominal sequence, 2 true events against 164 false positives, recall 1.0, precision 0.012). */}
      <p className="measure">
        {es
          ? 'Los eventos son la parte del carril donde el resultado honesto es incómodo. Solo la secuencia de reventado exporta nacimientos y coalescencias exactos; las secuencias de deriva son controles negativos, donde cualquier evento detectado es falso por construcción. La precisión de eventos es baja para todo método cuadro a cuadro, y eso se reporta en vez de suavizarse: un nacimiento o una muerte derivados de la asociación se disparan cada vez que una máscara titila, así que un método con máscaras inestables fabrica cientos de eventos espurios. En la secuencia nominal el método aprendido de referencia registra dos eventos verdaderos contra ciento sesenta y cuatro falsos positivos, lo que da exhaustividad 1.0 y precisión 0.012. Presentar solo la exhaustividad sería deshonesto, así que se publican las dos y los conteos por cuadro quedan visibles.'
          : 'Events are the part of the lane where the honest result is uncomfortable. Only the bursting sequence exports exact births and coalescences; the drift sequences are negative controls, where any detected event is false by construction. Event precision is low for every framewise method, and that is reported rather than smoothed: an association-derived birth or death fires whenever a mask flickers, so a method with unstable masks manufactures hundreds of spurious events. On the nominal sequence the reference learned method records two true events against one hundred and sixty-four false positives, giving recall 1.0 and precision 0.012. Presenting the recall alone would be dishonest, so both are published and the per-frame counts stay visible.'}
      </p>

      <Callout variant="honest" title={es ? 'Protocolos no equivalentes' : 'Non-equivalent protocols'}>
        <p className="measure">
          {es
            ? 'El método de propagación recibe doce máscaras exactas en el primer cuadro y arrastra esas identidades; ese resultado mide propagación, no descubrimiento automático, y ordenarlo contra el carril cuadro a cuadro le acreditaría una ventaja que le da el protocolo. Por eso el modo viaja con cada fila publicada y ningún agregado los mezcla. Y la lectura completa del carril es igual de estrecha: la detección de eventos cuadro a cuadro bajo este protocolo es una medición experimental, no una capacidad industrial.'
            : 'The propagation method receives twelve exact masks in the first frame and carries those identities; that result measures propagation, not automatic discovery, and ranking it against the framewise lane would credit it with an advantage the protocol hands it. So the mode travels with every published row and no aggregate mixes them. And the full reading of the lane is just as narrow: framewise event detection under this protocol is an experimental measurement, not an industrial capability.'}
        </p>
      </Callout>

      <Refs ids={['luiten2021hota', 'kuhn1955hungarian', 'ravi2024sam2']} label="Refs" />
    </div>
  );
}

/* ============================================================================
   6. ERROR ANATOMY
   ========================================================================== */

function ErrorAnatomy({ es, methods }: { es: boolean; methods: MethodBenchmarkDoc | null }) {
  const [selectedId, setSelectedId] = useState('L5');
  const selected = methods?.methods.find((method) => method.id === selectedId) ?? null;
  const test = selected?.test ?? null;

  return (
    <div className="prose">
      <h2>{es ? 'El AP no dice qué salió mal' : 'AP does not say what went wrong'}</h2>

      {/* Source: docs/metrics/01_definitions.md "Panoptic quality, and the two froth failure modes";
          data-pipeline/fslab/science/segment.py panoptic_quality (cov_thresh 0.2, unique match at IoU > 0.5). */}
      <p className="measure">
        {es
          ? 'Un solo número de acuerdo de instancias mezcla dos preguntas que tienen causas y arreglos distintos. La calidad panóptica las separa: la componente de segmentación responde cuán bien se delineó una burbuja cuando se encontró, y la componente de reconocimiento responde si se encontró el número correcto de burbujas. Los segmentos se emparejan de forma única sobre un IoU estrictamente mayor que un medio, que es el umbral en el que el emparejamiento se vuelve único y por lo tanto no requiere una regla de desempate. Separar las dos componentes importa porque un método puede sostener un puntaje respetable y ser inútil para una distribución de tamaños si su error se concentra en una sola de ellas.'
          : 'A single instance-agreement number mixes two questions that have different causes and different fixes. Panoptic quality separates them: the segmentation component answers how well a bubble was outlined when it was found, and the recognition component answers whether the right number of bubbles was found. Segments match uniquely above an IoU strictly greater than one half, which is the threshold at which the matching becomes unique and therefore needs no tie-break rule. Separating the two components matters because a method can hold a respectable score and be useless for a size distribution if its error concentrates in only one of them.'}
      </p>

      <Equation
        tex={String.raw`\mathrm{PQ} = \mathrm{SQ}\times\mathrm{RQ}, \qquad \mathrm{SQ} = \frac{\sum_{(p,g)\in TP}\mathrm{IoU}(p,g)}{|TP|}, \qquad \mathrm{RQ} = \frac{|TP|}{|TP| + \tfrac12|FP| + \tfrac12|FN|}`}
        caption={es
          ? 'Calidad panóptica: SQ es la calidad de segmentación sobre los pares verdaderos positivos (p predicho, g verdadero) y RQ la calidad de reconocimiento.'
          : 'Panoptic quality: SQ is segmentation quality over the true-positive pairs (p predicted, g ground truth) and RQ is recognition quality.'}
      />

      {/* Source: docs/metrics/01_definitions.md (splits = over-segmentation, the watershed-on-highlights
          failure; merges = under-segmentation, the Otsu failure; coverage threshold 0.2);
          data/derived/release-report.json C1 test_micro (merges 1250, splits 16, nGt 17846, nPred 3922). */}
      <p className="measure">
        {es
          ? 'Junto a la calidad panóptica el evaluador conserva los dos modos de error que de verdad caracterizan la segmentación de espuma, contados con un umbral de cobertura de 0.2. Una separación es una sobresegmentación: una burbuja verdadera cubierta por más de un segmento predicho, y es la falla de la watershed sembrada en brillos, donde el reflejo especular dentro de una sola burbuja grande siembra dos marcadores. Una fusión es una subsegmentación: un segmento predicho que cubre más de una burbuja verdadera, y es la falla del umbral global, donde dos burbujas en contacto comparten una región brillante y no se detecta lamela entre ellas. Los dos conteos se publican por imagen porque son diagnósticos opuestos. El umbral simple del banco lo muestra en cifras: sobre las sesenta y cuatro muestras retenidas acumula mil doscientas cincuenta fusiones contra dieciséis separaciones, y predice tres mil novecientas veintidós instancias donde hay diecisiete mil ochocientas cuarenta y seis; su error es de un solo signo y ninguna corrección de frontera lo arregla.'
          : 'Alongside panoptic quality the evaluator retains the two error modes that actually characterise froth segmentation, counted with a coverage threshold of 0.2. A split is over-segmentation: one ground-truth bubble covered by more than one predicted segment, and it is the watershed-on-highlights failure, where the specular reflection inside a single large bubble seeds two markers. A merge is under-segmentation: one predicted segment covering more than one ground-truth bubble, and it is the global-threshold failure, where two touching bubbles share a bright region and no lamella is detected between them. Both counts are published per image because they are opposite diagnoses. The benchmark’s simple threshold method shows it in figures: over the sixty-four held-out samples it accumulates one thousand two hundred and fifty merges against sixteen splits, and predicts three thousand nine hundred and twenty-two instances where there are seventeen thousand eight hundred and forty-six; its error has one sign, and no boundary refinement fixes it.'}
        {' '}<Cite id="meyer1994" paren /> <Cite id="vincent1991" paren />
      </p>

      {/* Source: data-pipeline/fslab/science/segment.py boundary_fscore (tolerance_px default 2.0, reported
          as boundary_tolerance_px next to the score); docs/metrics/01_definitions.md "Boundary F-score". */}
      <p className="measure">
        {es
          ? 'El puntaje de frontera es precisión y exhaustividad sobre los píxeles de borde dentro de una tolerancia declarada, y luego su media armónica. La tolerancia es una distancia física cuando existe calibración y una distancia en píxeles cuando no, y siempre se reporta junto al puntaje, porque un puntaje de frontera sin su tolerancia no es interpretable: la misma predicción puede leerse como excelente o mediocre según cuántos píxeles de holgura se conceden. En este banco la tolerancia por omisión es de dos píxeles, y el valor viaja en el mismo registro que el puntaje para que nadie tenga que suponerlo.'
          : 'The boundary score is precision and recall over boundary pixels within a declared tolerance, then their harmonic mean. The tolerance is a physical distance when a calibration exists and a pixel distance when it does not, and it is always reported next to the score, because a boundary F-score without its tolerance is not interpretable: the same prediction can read as excellent or mediocre depending on how many pixels of slack are granted. In this benchmark the default tolerance is two pixels, and the value travels in the same record as the score so nobody has to assume it.'}
      </p>

      {/* Source: docs/metrics/01_definitions.md "Physical descriptors" and "Distribution distance"
          (d_eq, d32 surface-weighted, W1 in the same physical units, D50 alone hides shape error). */}
      <p className="measure">
        {es
          ? 'La cadena termina en las cantidades que un sensor blando de flotación consume. El área de cada instancia se convierte al diámetro del disco de igual área; de ese conjunto de diámetros salen los percentiles D10, D50 y D90 y la media de Sauter, que es la media ponderada por superficie y es el resumen estándar en flotación porque el área interfacial por unidad de volumen escala con ella. Comparar solo el D50 esconde el error de forma, así que las distribuciones completas se comparan con la distancia de Wasserstein de orden uno, en las mismas unidades que los diámetros: es la masa que hay que mover para convertir la distribución predicha en la verdadera, y se lee directamente como el error típico de diámetro ponderado por cuántas burbujas están mal.'
          : 'The chain ends in the quantities a flotation soft sensor consumes. Each instance area converts to the diameter of the disc with the same area; from that set of diameters come the percentiles D10, D50 and D90 and the Sauter mean, which is the surface-area-weighted mean and is the standard summary in flotation because interfacial area per unit volume scales with it. Comparing D50 alone hides shape error, so full distributions are compared with the order-one Wasserstein distance, in the same units as the diameters: it is the mass that must be moved to turn the predicted distribution into the true one, and it reads directly as the typical diameter error weighted by how many bubbles are wrong.'}
        {' '}<Cite id="aldrich2010" paren /> <Cite id="sautermean" paren /> <Cite id="villani2009ot" paren />
      </p>

      <Equation
        tex={String.raw`W_1(P,Q) = \int_{-\infty}^{\infty}\bigl|F_P(x) - F_Q(x)\bigr|\,dx, \qquad d_{32} = \frac{\sum_i d_i^3}{\sum_i d_i^2}`}
        caption={es
          ? 'Distancia entre distribuciones de diámetro: F_P y F_Q son las acumuladas predicha y verdadera; W1 es cero cuando las dos distribuciones coinciden.'
          : 'Distance between diameter distributions: F_P and F_Q are the predicted and true cumulatives; W1 is zero when the two distributions coincide.'}
      />

      {/* Source: docs/metrics/01_definitions.md "Calibration and uncertainty" (Brier, ECE, and the rule that
          a method without probabilities gets a calibration_status rationale, never a fabricated value). */}
      <p className="measure">
        {es
          ? 'La calibración se reporta solo para los métodos que exponen probabilidades, y ahí van dos cifras que responden preguntas distintas. El puntaje cuadrático es el error cuadrático medio de la probabilidad contra el resultado binario, y es una regla de puntaje propia, así que no se puede mejorar declarando una confianza falsa. El error de calibración esperado es la brecha promedio, ponderada por bin, entre confianza declarada y exactitud observada, y responde si un 0.9 declarado significa de verdad 0.9. Un método que no expone probabilidades no recibe un valor inventado: queda registrado con la razón por la que la cifra no existe.'
          : 'Calibration is reported only for methods that expose probabilities, and there two figures answer different questions. The quadratic score is the mean squared error of the probability against the binary outcome, and it is a proper scoring rule, so it cannot be improved by misreporting confidence. The expected calibration error is the bin-weighted average gap between stated confidence and observed accuracy, and it answers whether a stated 0.9 really means 0.9. A method that does not expose probabilities is not given a fabricated value: it is recorded with the reason the figure does not exist.'}
        {' '}<Cite id="brier1950" paren />
      </p>

      <h3>{es ? 'Leer un método como una cadena causal' : 'Reading one method as a causal chain'}</h3>

      {!methods && <p className="hint">{es ? 'Cargando la comparación de métodos.' : 'Loading the method comparison.'}</p>}

      {methods && (
        <>
          <label className="hint">
            {es ? 'Método analizado' : 'Analyzed method'}{' '}
            <select className="select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {methods.methods.map((method) => <option key={method.id} value={method.id}>{method.id} · {method.name}</option>)}
            </select>
          </label>

          {test && (
            <>
              <table className="fs-table">
                <caption className="hint">
                  {es
                    ? 'Etapas del error para el método seleccionado, todas leídas de la comparación retenida comprometida.'
                    : 'Error stages for the selected method, all read from the committed held-out comparison.'}
                </caption>
                <thead>
                  <tr>
                    <th>{es ? 'etapa' : 'stage'}</th>
                    <th className="num">{es ? 'valor' : 'value'}</th>
                    <th>{es ? 'qué falla si esta etapa cae' : 'what fails if this stage drops'}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>AP</td>
                    <td className="num">{test.mean_ap.toFixed(3)}</td>
                    <td>{es ? 'correspondencia de instancias: ninguna cifra posterior es interpretable sin ella' : 'instance correspondence: no later figure is interpretable without it'}</td>
                  </tr>
                  <tr>
                    <td>PQ</td>
                    <td className="num">{test.mean_pq != null ? test.mean_pq.toFixed(3) : 'n/a'}</td>
                    <td>{es ? 'delineado por reconocimiento: separa forma de recuento' : 'outlining times recognition: separates shape from count'}</td>
                  </tr>
                  <tr>
                    <td>{es ? 'frontera F (tolerancia 2 px)' : 'boundary F (2 px tolerance)'}</td>
                    <td className="num">{test.mean_boundary_fscore != null ? test.mean_boundary_fscore.toFixed(3) : 'n/a'}</td>
                    <td>{es ? 'fidelidad de lamela: un valor alto junto a un AP bajo indica bordes plausibles sin burbujas cerradas' : 'lamella fidelity: a high value next to a low AP indicates plausible edges with no closed bubbles'}</td>
                  </tr>
                  <tr>
                    <td>{es ? 'error relativo de recuento' : 'relative count error'}</td>
                    <td className="num">{test.mean_count_relative_error != null ? `${(test.mean_count_relative_error * 100).toFixed(1)}%` : 'n/a'}</td>
                    <td>{es ? 'sesgo en número de burbujas: arrastra la media de Sauter y la distribución completa' : 'bubble-count bias: drags the Sauter mean and the whole distribution'}</td>
                  </tr>
                  <tr>
                    <td>{es ? 'error relativo de d32' : 'relative d32 error'}</td>
                    <td className="num">{test.mean_d32_relative_error != null ? `${(test.mean_d32_relative_error * 100).toFixed(1)}%` : 'n/a'}</td>
                    <td>{es ? 'sesgo del tamaño de proceso: es la variable que consumiría un sensor blando' : 'process-size bias: this is the variable a soft sensor would consume'}</td>
                  </tr>
                  <tr>
                    <td>{es ? 'distancia W1 de distribución (px)' : 'distribution W1 distance (px)'}</td>
                    <td className="num">{test.mean_bsd_wasserstein != null ? test.mean_bsd_wasserstein.toFixed(2) : 'n/a'}</td>
                    <td>{es ? 'error de forma de la distribución, invisible en un solo percentil' : 'distribution shape error, invisible in a single percentile'}</td>
                  </tr>
                </tbody>
              </table>

              <p className="measure">
                {explainError(test, es, { methodId: selectedId, leader: methods.current_bar.leader })}
              </p>

              {test.micro && (
                <>
                  <Equation
                    tex={String.raw`\mathrm{precision} = \frac{TP}{TP+FP}, \qquad \mathrm{recall} = \frac{TP}{TP+FN}, \qquad F_1 = \frac{2\,\mathrm{precision}\cdot\mathrm{recall}}{\mathrm{precision}+\mathrm{recall}}`}
                    caption={es
                      ? 'Conteos micro agrupados sobre las sesenta y cuatro muestras retenidas al IoU de asociación de 0.5, no promedios de promedios.'
                      : 'Micro counts pooled over the sixty-four held-out samples at the 0.5 association IoU, not averages of averages.'}
                  />
                  <table className="fs-table">
                    <caption className="hint">
                      {es ? 'Conteos micro agrupados del método seleccionado.' : 'Pooled micro counts for the selected method.'}
                    </caption>
                    <tbody>
                      <tr>
                        <th>{es ? 'instancias verdaderas' : 'true instances'}</th><td className="num">{test.micro.nGt.toLocaleString(es ? 'es' : 'en')}</td>
                        <th>{es ? 'instancias predichas' : 'predicted instances'}</th><td className="num">{test.micro.nPred.toLocaleString(es ? 'es' : 'en')}</td>
                      </tr>
                      <tr>
                        <th>TP</th><td className="num">{test.micro.tp.toLocaleString(es ? 'es' : 'en')}</td>
                        <th>FP / FN</th><td className="num">{test.micro.fp.toLocaleString(es ? 'es' : 'en')} / {test.micro.fn.toLocaleString(es ? 'es' : 'en')}</td>
                      </tr>
                      <tr>
                        <th>{es ? 'precisión / exhaustividad' : 'precision / recall'}</th>
                        <td className="num">{test.micro.instance_precision.toFixed(3)} / {test.micro.instance_recall.toFixed(3)}</td>
                        <th>F1</th><td className="num">{test.micro.instance_f1.toFixed(3)}</td>
                      </tr>
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
          {!test && <p className="hint">{es ? 'Ese método no tiene evidencia retenida en el artefacto.' : 'That method has no held-out evidence in the artifact.'}</p>}
        </>
      )}

      <Callout variant="honest" title={es ? 'Un AP alto no autoriza una lectura de proceso' : 'A high AP does not authorise a process reading'}>
        <p className="measure">
          {es
            ? 'Incluso el método que lidera esta matriz debe leerse por recuento y morfometría antes de usar su salida como variable de proceso: la correspondencia de instancias más fuerte del banco puede convivir con un sesgo de tamaño que un sensor blando propagaría directo a una decisión. Y todos estos errores están medidos contra una verdad sintética, así que describen el comportamiento del método sobre este generador, no su exactitud sobre una celda real.'
            : 'Even the method leading this matrix must be read through count and morphometry before its output is used as a process variable: the strongest instance correspondence in the benchmark can coexist with a size bias that a soft sensor would propagate straight into a decision. And all of these errors are measured against a synthetic truth, so they describe the method’s behaviour on this generator, not its accuracy on a real cell.'}
        </p>
      </Callout>

      <Refs ids={['meyer1994', 'vincent1991', 'aldrich2010', 'sautermean', 'villani2009ot', 'brier1950']} label="Refs" />
    </div>
  );
}

/* ============================================================================
   7. TRANSFER (what the synthetic benchmark cannot support)
   ========================================================================== */

/* Every number in this tab comes from docs/benchmark/02_real-domain-transfer.md and the committed
   artifacts data/derived/real-adjacent-benchmark.json + data/derived/real-adjacent-dataset-manifest.json. */
type Tier = 'classical' | 'trained' | 'foundation';
const TRANSFER_ROWS: Array<{ id: string; name: string; tier: Tier; real: number; froth: number }> = [
  { id: 'L5', name: 'Cellpose-SAM', tier: 'foundation', real: 0.709, froth: 0.510 },
  { id: 'C1', name: 'Otsu + connected components', tier: 'classical', real: 0.339, froth: 0.065 },
  // C7 and C3 carry their post-adoption values: both engines changed on 2026-08-01 and this lane
  // was re-baked from them. C7 rose on both surfaces; C3 rose on froth (0.103 to 0.220) and FELL
  // here (0.182 to 0.128), because the adopted negated-intensity flooding surface is a froth
  // mechanism and cell nuclei carry neither a specular highlight nor a Plateau border.
  // Sources: data/derived/real-adjacent-benchmark.json and data/derived/method-benchmark.json.
  { id: 'C7', name: 'Lamella-valley constrained watershed', tier: 'classical', real: 0.301, froth: 0.233 },
  { id: 'C5', name: 'H-minima watershed', tier: 'classical', real: 0.264, froth: 0.133 },
  { id: 'C4', name: 'Distance-transform watershed', tier: 'classical', real: 0.256, froth: 0.198 },
  { id: 'L6', name: 'YOLO froth segmentation', tier: 'trained', real: 0.144, froth: 0.293 },
  { id: 'C3', name: 'Marker-controlled watershed', tier: 'classical', real: 0.128, froth: 0.220 },
  // Every row here is measured on the SAME burned 64-image split, so the values stay
  // comparable to each other. N1 was later re-measured alone on a fresh pre-registered
  // 72-sample split at AP 0.045 (verification/p2-domain-randomization.json); that number
  // is not put in this table because no other method has been scored on that surface.
  { id: 'N1', name: 'LamellaStar', tier: 'trained', real: 0.125, froth: 0.519 },
  { id: 'L3', name: 'GC-FSegNet', tier: 'trained', real: 0.110, froth: 0.319 },
  { id: 'L1', name: 'Boundary/distance U-Net', tier: 'trained', real: 0.094, froth: 0.415 },
  { id: 'C6', name: 'SLIC + RAG merge', tier: 'classical', real: 0.084, froth: 0.019 },
  { id: 'L2', name: 'Deep-marker watershed', tier: 'trained', real: 0.042, froth: 0.325 },
  { id: 'L4', name: 'StarDist 2D', tier: 'trained', real: 0.012, froth: 0.112 },
  { id: 'C2', name: 'Gradient immersion watershed', tier: 'classical', real: 0.000, froth: 0.017 },
];

function tierLabel(tier: Tier, es: boolean): string {
  if (tier === 'classical') return es ? 'clásico' : 'classical';
  if (tier === 'trained') return es ? 'entrenado aquí' : 'trained here';
  return es ? 'fundacional, nunca entrenado aquí' : 'foundation, never trained here';
}

function Transfer({ es }: { es: boolean }) {
  return (
    <div className="prose">
      <h2>{es ? 'La duda que el banco sintético no puede resolver solo' : 'The doubt the synthetic benchmark cannot resolve on its own'}</h2>

      {/* Source: docs/benchmark/02_real-domain-transfer.md, opening section. */}
      <p className="measure">
        {es
          ? 'Todo número del banco principal viene del generador de espuma de Laguerre del repositorio. Es un arnés controlado con verdad exacta y es la herramienta correcta para comparar métodos bajo condiciones conocidas, pero deja intacta una duda grande: el ranking completo de quince métodos podría ser un artefacto de la estadística de un solo generador. Un método afinado, aunque sea de forma indirecta, a las fronteras de lamela sintéticas podría colapsar en el momento en que ve un sensor real. Esta pestaña es la comprobación de esa duda, y es lo único que comprueba.'
          : 'Every number in the main benchmark comes from the repository’s Laguerre foam generator. It is a controlled harness with exact ground truth and it is the right tool for comparing methods under known conditions, but it leaves one large doubt untouched: the entire fifteen-method ranking could be an artefact of one generator’s statistics. A method tuned, however indirectly, to synthetic lamella boundaries might collapse the moment it sees a real sensor. This tab is the check on that doubt, and it is the only thing it checks.'}
      </p>

      {/* Source: data/derived/real-adjacent-dataset-manifest.json (source_id, license CC0-1.0, 670 samples,
          splits test 64, grouping method + 21 groups + 2 test groups, annotation_review, calibration_note)
          and docs/benchmark/02_real-domain-transfer.md (4,979 annotated nuclei in the held-out split). */}
      <p className="measure">
        {es
          ? 'La elección real era entre no tener evidencia real alguna o tener evidencia real de un dominio adyacente etiquetada exactamente como tal, y la segunda vale más que la primera siempre que nunca se disfrace de la primera. El conjunto adoptado es un banco público de microscopía de núcleos celulares con dedicación al dominio público, seiscientas setenta imágenes reales con máscaras por objeto curadas por expertos y verificadas no solapadas al ingresar. La división retenida son sesenta y cuatro muestras con cuatro mil novecientos setenta y nueve núcleos anotados, elegida de ese tamaño para que se lea en el mismo pie que la prueba retenida de espuma. La agrupación usa alto por ancho y una intensidad media gruesa, veintiún grupos de los que dos quedan en prueba, porque la fuente no trae metadatos de adquisición: es un sustituto de la adquisición, no la verdad sobre ella, y el manifiesto lo dice. Geométricamente es el mismo problema que la espuma, objetos densamente empacados, aproximadamente convexos y en contacto, donde la frontera entre dos vecinos es la única evidencia que los separa.'
          : 'The real choice was between having no real evidence at all and having real evidence from an adjacent domain labelled precisely as such, and the second is worth more than the first provided it never gets to pretend it is the first. The adopted set is a public microscopy benchmark of cell nuclei with a public-domain dedication, six hundred and seventy real images with expert-curated per-object masks, verified non-overlapping at ingest. The held-out split is sixty-four samples containing four thousand nine hundred and seventy-nine annotated nuclei, chosen at that size so it reads on the same footing as the froth held-out test. Grouping uses height by width and a coarse mean intensity, twenty-one groups of which two land in test, because the source ships no acquisition metadata: it is a proxy for acquisition, not ground truth about it, and the manifest says so. Geometrically it is the same problem as froth, densely packed, roughly convex, touching objects where the boundary between two neighbours is the only evidence separating them.'}
        {' '}<Cite id="stringer2021cellpose" paren />
      </p>

      {/* Source: data/derived/real-adjacent-benchmark.json (protocol, scope, n_samples 64, device cuda,
          14 methods with n_failed 0) and docs/benchmark/02_real-domain-transfer.md "The protocol". */}
      <p className="measure">
        {es
          ? 'El protocolo es deliberadamente rígido: el posprocesamiento calibrado sobre espuma sintética se aplica sin cambios, y ningún método se reentrena, se reajusta ni recibe umbrales nuevos para estos datos. Reajustar mediría cuán bien se puede afinar cada arquitectura a núcleos, que es una pregunta sobre las arquitecturas y no sobre este repositorio. Aplicar la calibración de espuma sin tocarla mide transferencia: si los ajustes que funcionan sobre el generador sobreviven a un sensor real. Un método que colapsa aquí está informando que su calibración era específica del generador, que es justo el modo de falla que conviene conocer antes de apuntar cualquier cosa a una cámara de planta. Un método que lanza una excepción sobre una imagen real se registra como muestra fallida con su error, no se descarta, porque no correr es un resultado. Ninguno falló al correr.'
          : 'The protocol is deliberately rigid: post-processing calibrated on synthetic froth is applied unchanged, and no method is retrained, refitted, or given new thresholds for this data. Refitting would measure how well each architecture can be tuned to nuclei, which is a question about the architectures and not about this repository. Applying the froth calibration unchanged measures transfer: whether the settings that work on the generator survive a real sensor. A method that collapses here is reporting that its calibration was generator-specific, which is exactly the failure mode worth knowing before anything is pointed at a plant camera. A method that raises an exception on a real image is recorded as a failed sample with its error, not dropped, because failing to run is a result. None failed to run.'}
      </p>

      <table className="fs-table">
        <caption className="hint">
          {es
            ? 'AP retenido sobre sesenta y cuatro imágenes reales de instancias densas, con los ajustes de espuma sin cambios, junto al AP retenido de espuma sintética del mismo método.'
            : 'Held-out AP over sixty-four real dense-instance images with froth settings unchanged, next to the same method’s synthetic froth held-out AP.'}
        </caption>
        <thead>
          <tr>
            <th>id</th>
            <th>{es ? 'método' : 'method'}</th>
            <th>{es ? 'nivel' : 'tier'}</th>
            <th className="num">{es ? 'AP real' : 'real AP'}</th>
            <th className="num">{es ? 'AP espuma' : 'froth AP'}</th>
            <th className="num">delta</th>
          </tr>
        </thead>
        <tbody>
          {TRANSFER_ROWS.map((row) => (
            <tr key={row.id}>
              <td>{row.id}</td>
              <td>{row.name}</td>
              <td>{tierLabel(row.tier, es)}</td>
              <td className="num">{row.real.toFixed(3)}</td>
              <td className="num">{row.froth.toFixed(3)}</td>
              <td className="num">{(row.real - row.froth >= 0 ? '+' : '') + (row.real - row.froth).toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Source: docs/benchmark/02_real-domain-transfer.md, the per-tier table re-baked on 2026-08-01
          (classical 7 methods +0.070 with 5 of 7 improving, in-repo trained 6 methods -0.243,
          foundation never trained here +0.199). The classical tier mean moved from +0.088 to +0.070
          and the improving count from 6 to 5 because C3 changed direction with its adopted
          flooding surface: data/derived/real-adjacent-benchmark.json against
          data/derived/method-benchmark.json methods[].test.mean_ap. */}
      <p className="measure">
        {es
          ? 'Agrupado por nivel el patrón es claro, con dos excepciones nombradas: el nivel clásico mejora en promedio 0.070, con cinco de sus siete métodos al alza, los seis modelos entrenados dentro del repositorio caen en promedio 0.243 sin excepción, y el único método aprendido que nunca se entrenó aquí mejora 0.199 y pasa a liderar con holgura. Las dos excepciones clásicas son C2, que ya estaba en 0.017 sobre espuma y entrega 0.000 aquí, y C3, que cae de 0.220 a 0.128 desde que el 2026-08-01 adoptó la inundación de la intensidad negada, un mecanismo de espuma que un núcleo celular no ofrece. El ranking sintético no transfiere. El método que lidera el banco de espuma cae del primer lugar al octavo sobre imágenes reales, y el nivel clásico, que no tiene un prior aprendido que sobreajustar, sube como nivel. Ese es el resultado, y es la razón por la que existe esta pestaña.'
          : 'Grouped by tier the pattern is clear, with two named exceptions: the classical tier improves by 0.070 on average, five of its seven methods rising, the six models trained inside the repository fall by 0.243 on average without exception, and the single learned method never trained here improves by 0.199 and becomes the clear leader. The two classical exceptions are C2, already at 0.017 on froth and returning 0.000 here, and C3, which falls from 0.220 to 0.128 since it adopted negated-intensity flooding on 2026-08-01, a froth mechanism a cell nucleus does not offer. The synthetic ranking does not transfer. The method leading the froth benchmark falls from first to eighth on real images, and the classical tier, which has no learned prior to overfit, rises as a tier. That is the result, and it is why this tab exists.'}
      </p>

      {/* Source: docs/benchmark/02_real-domain-transfer.md "What this does and does not say about N1"
          and "The classical improvement is informative too". */}
      <p className="measure">
        {es
          ? 'La lectura correcta es estrecha en las dos direcciones, y la segunda advertencia importa tanto como la primera. Lo que la evidencia sostiene con justicia es que la ventaja del método líder de espuma sobre el modelo fundacional es específica del dominio y no sobrevive un cambio de dominio; leer un margen de espuma de nueve milésimas como evidencia de un mejor segmentador en general es sobreleerlo. Lo que no sostiene es que el modelo fundacional sea mejor sobre espuma: el conjunto adyacente es microscopía celular, que es su dominio de preentrenamiento, así que juega de local, mientras que los especialistas de espuma reciben otra modalidad de imagen con sus umbrales de espuma intactos, y su degradación es el resultado esperado, no un defecto revelado. La mejora de los clásicos apunta en la misma dirección: el umbral global salta de 0.065 a 0.339 no porque haya mejorado, sino porque los núcleos son un problema de instancias más fácil que la espuma, más dispersos, más redondos y con más contraste. Es un recordatorio de cuánta de la dificultad del banco de espuma es intrínseca a la espuma.'
          : 'The correct reading is narrow in both directions, and the second warning matters as much as the first. What the evidence fairly supports is that the froth leader’s advantage over the foundation model is domain-specific and does not survive a change of domain; reading a nine-thousandth froth margin as evidence of a generally better segmenter is overreading it. What it does not support is that the foundation model is better on froth: the adjacent set is cell microscopy, which is its pretraining domain, so it plays at home, while the froth specialists are handed a different imaging modality with their froth thresholds intact, and their degradation is the expected outcome, not a defect revealed. The classical improvement points the same way: the global threshold jumps from 0.065 to 0.339 not because it got better, but because nuclei are an easier instance problem than froth, sparser, rounder and higher contrast. It is a reminder of how much of the froth benchmark’s difficulty is intrinsic to froth.'}
      </p>

      <h3>{es ? 'Las fuentes de datos, con su licencia y su estado' : 'The data sources, with licence and status'}</h3>

      {/* Sources: data-pipeline/fslab/datasets.py (source_id frothseg-synthetic-v2, license
          "Apache-2.0-generated", 384 samples, 64 test); data/README.md (committed derived artifacts per case,
          raw never committed); docs/architecture/03_the-gate.md (195 replayed method-case pairs);
          docs/temporal/02_the-full-method-matrix.md (5 sequences x 8 frames, RLE label rasters published);
          data/derived/real-adjacent-dataset-manifest.json (CC0-1.0, 670 samples, 64 test);
          docs/benchmark/02_real-domain-transfer.md (public froth candidates rejected on licence);
          data/derived/release-report.json errors (no accepted licensed real froth held-out source). */}
      <table className="fs-table">
        <thead>
          <tr>
            <th>{es ? 'fuente' : 'source'}</th>
            <th>{es ? 'clase' : 'kind'}</th>
            <th>{es ? 'licencia' : 'licence'}</th>
            <th>{es ? 'redistribución' : 'redistribution'}</th>
            <th className="num">{es ? 'muestras' : 'samples'}</th>
            <th>{es ? 'estado' : 'status'}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{es ? 'Matriz de dieciséis condiciones' : 'Sixteen-condition matrix'}</td>
            <td>{es ? 'sintética' : 'synthetic'}</td>
            <td>{es ? 'generada, permisiva' : 'generated, permissive'}</td>
            <td>{es ? 'espejo: los artefactos derivados están comprometidos' : 'mirror: derived artifacts are committed'}</td>
            <td className="num">384 (64 test)</td>
            <td>{es ? 'en vivo, es el ranking' : 'live, it is the ranking'}</td>
          </tr>
          <tr>
            <td>{es ? 'Trece casos canónicos' : 'Thirteen canonical cases'}</td>
            <td>{es ? 'sintética' : 'synthetic'}</td>
            <td>{es ? 'generada, permisiva' : 'generated, permissive'}</td>
            <td>{es ? 'espejo: cuadro, máscaras exactas y morfometría por caso' : 'mirror: frame, exact masks and morphometry per case'}</td>
            <td className="num">13 (195 {es ? 'pares' : 'pairs'})</td>
            <td>{es ? 'en vivo, superficie diagnóstica' : 'live, diagnostic surface'}</td>
          </tr>
          <tr>
            <td>{es ? 'Secuencias temporales' : 'Temporal sequences'}</td>
            <td>{es ? 'sintética' : 'synthetic'}</td>
            <td>{es ? 'generada, permisiva' : 'generated, permissive'}</td>
            <td>{es ? 'espejo: solo el ráster de etiquetas comprimido, la superposición se compone en el navegador' : 'mirror: only the compressed label raster, the overlay is composited in the browser'}</td>
            <td className="num">5 x 8 = 40</td>
            <td>{es ? 'en vivo, carril temporal' : 'live, temporal lane'}</td>
          </tr>
          <tr>
            <td>{es ? 'Microscopía de núcleos (dominio adyacente)' : 'Nuclei microscopy (adjacent domain)'}</td>
            <td>{es ? 'real, no espuma' : 'real, not froth'}</td>
            <td>CC0-1.0</td>
            <td>{es ? 'solo enlace: se descarga en el paso de ingesta, no se rehospeda' : 'link-only: downloaded by the ingest step, never re-hosted'}</td>
            <td className="num">670 (64 test)</td>
            <td>{es ? 'en vivo, solo como prueba de transferencia' : 'live, as a transfer test only'}</td>
          </tr>
          <tr>
            <td>{es ? 'Espuma real con máscaras por burbuja' : 'Real froth with per-bubble masks'}</td>
            <td>{es ? 'real, espuma' : 'real, froth'}</td>
            <td>{es ? 'sin licencia abierta: candidatos sin licencia, tras muro de pago o no comerciales' : 'no open licence: candidates unlicensed, paywalled, or non-commercial'}</td>
            <td>{es ? 'ninguna: no se acepta ni se rehospeda' : 'none: not accepted, not re-hosted'}</td>
            <td className="num">0</td>
            <td>{es ? 'pendiente, bloquea la aceptación del producto' : 'roadmap, it blocks product acceptance'}</td>
          </tr>
        </tbody>
      </table>

      {/* Source: docs/benchmark/02_real-domain-transfer.md "What this evidence can and cannot support"
          (domain: adjacent field partitions accepted real sources; the earlier gate matched any kind
          beginning with real) and data/derived/release-report.json errors. */}
      <p className="measure">
        {es
          ? 'El límite está impuesto en código, no dejado a la prosa. La fuente adyacente lleva su dominio declarado y el constructor del reporte de liberación reparte las fuentes reales aceptadas por ese campo, así que solo una fuente de espuma puede satisfacer el requisito de datos reales de la puerta. Antes de adoptar este conjunto la puerta aceptaba cualquier fuente cuya clase empezara por real, lo que habría permitido que unos núcleos celulares limpiaran en silencio el bloqueo de espuma y convirtieran el reporte de liberación en una declaración falsa. El error de liberación sigue diciendo que no hay fuente real de espuma retenida con licencia aceptada, y seguirá diciéndolo hasta que exista espuma real, por mucha evidencia adyacente que se acumule. La escasez de imágenes de espuma etiquetadas es una condición del campo y no de este repositorio, y por eso el bloqueo se registra y se deja en pie en vez de rodearlo.'
          : 'The boundary is enforced in code, not left to prose. The adjacent source carries its declared domain and the release-report builder partitions accepted real sources by that field, so only a froth source can satisfy the gate’s real-data requirement. Before this set was adopted the gate matched any source whose kind began with real, which would have let cell nuclei silently clear the froth blocker and turned the release report into a false statement. The release error still reads that there is no accepted licensed real froth held-out source, and it will keep reading that until real froth exists, no matter how much adjacent evidence accumulates. The scarcity of labelled froth imagery is a condition of the field rather than of this repository, which is why the blocker is recorded and left standing instead of being worked around.'}
        {' '}<Cite id="fu2019" paren />
      </p>

      <Callout variant="honest" title={es ? 'El resumen honesto, exacto y estrecho' : 'The honest summary, exact and narrow'}>
        <p className="measure">
          {es
            ? 'La tabla de posiciones de espuma es un resultado específico del generador, y nada en este repositorio demuestra todavía que algún método sea bueno sobre espuma real. Eso seguirá siendo cierto hasta que existan datos reales de espuma. La evidencia adyacente sostiene una sola afirmación, que la escalera de métodos sobrevive o no a fotografías reales de instancias densas y en contacto bajo ajustes hechos para espuma; no sostiene, bajo ninguna circunstancia, una afirmación sobre exactitud de flotación, porque son núcleos celulares: no hay espuma, no hay física de lamela, no hay coalescencia de burbujas, no hay brillo especular de una superficie mojada y no hay escala física.'
            : 'The froth leaderboard is a generator-specific result, and nothing in this repository yet demonstrates that any method is good at real froth. That remains true until real froth data exists. The adjacent evidence supports one statement only, that the method ladder does or does not survive real photographs of dense touching instances under froth-fitted settings; it does not support, under any circumstances, a statement about flotation accuracy, because these are cell nuclei: there is no froth, no lamella physics, no bubble coalescence, no specular glare from a wet surface, and no physical scale.'}
        </p>
      </Callout>

      <Refs ids={['stringer2021cellpose', 'fu2019']} label="Refs" />
    </div>
  );
}

/* ============================================================================
   8. PROVENANCE
   ========================================================================== */

function Provenance({ es, methods, temporal }: {
  es: boolean; methods: MethodBenchmarkDoc | null; temporal: TemporalBenchmarkDoc | null;
}) {
  return (
    <div className="prose">
      <h2>{es ? 'Qué hace que un número de esta página sea re-verificable' : 'What makes a number on this page re-checkable'}</h2>

      {/* Source: docs/architecture/02_determinism-and-trace.md "Synthetic data" (pure function of FrothSpec,
          separate geometry and appearance seeds, manifest fields, a latent group belongs to exactly one split,
          the canonical export table) and data/README.md CONTRACT 2. */}
      <p className="measure">
        {es
          ? 'Un caso fijo es una función pura de su especificación, y la geometría y la apariencia llevan semillas separadas. Esa separación es lo que permite renderizar dos variantes de apariencia desde la misma geometría latente de instancias conservando la identidad de grupo explícita, y es también lo que hace que la prueba de fuga sea mecánica en vez de una cuestión de confianza. El manifiesto guarda el identificador de muestra, la condición, el grupo latente, la semilla de geometría, la semilla de apariencia y la división, y un grupo latente pertenece exactamente a una división. Cada exportación canónica lleva el cuadro renderizado de ocho bits, las instancias exactas comprimidas por longitud de tramo, la morfometría por instancia con su distribución de tamaños, los resultados del piso clásico, un registro compacto para la web y un manifiesto con parámetros, carril, tamaños en bytes y resumen criptográfico. Regenerar o re-verificar esos artefactos es un paso del propio flujo, así que una deriva silenciosa falla la verificación en vez de pasar desapercibida.'
          : 'A still case is a pure function of its specification, and geometry and appearance carry separate seeds. That separation is what allows two appearance variants to be rendered from the same latent instance geometry while retaining explicit group identity, and it is also what makes the leakage test mechanical rather than a matter of trust. The manifest stores the sample id, the condition, the latent group, the geometry seed, the appearance seed and the split, and a latent group belongs to exactly one split. Every canonical export carries the rendered eight-bit frame, the exact run-length-encoded instances, the per-instance morphometry with its size distribution, the classical-floor results, a compact web record, and a manifest with parameters, lane, byte sizes and a cryptographic digest. Regenerating or re-hashing those artifacts is a step of the workflow itself, so silent drift fails verification rather than passing unnoticed.'}
      </p>

      {/* Source: docs/architecture/02_determinism-and-trace.md "Learned and foundation runs". */}
      <p className="measure">
        {es
          ? 'Los métodos aprendidos y fundacionales no pueden prometer reproducibilidad bit a bit, y el sistema lo admite en vez de fingirla: el punto flotante de GPU y las versiones de los motores oficiales pueden cambiar la salida a nivel de byte. En consecuencia sus manifiestos registran las entradas de reproducibilidad y la evidencia resultante: la suma de verificación del caché de datos y la división usada, la semilla, los hiperparámetros y la elección de calibración, las versiones de lenguaje, marco, cómputo de GPU y dispositivo, el linaje del punto de control con su tamaño y su resumen, las métricas de la prueba intocada con los errores por muestra, las métricas diagnósticas canónicas y la paridad de exportación cuando corresponde. Los puntos de control pequeños y los archivos de exportación están versionados; los pesos oficiales grandes se quedan en sus cachés de origen con identificadores inmutables y el resumen del archivo local registrado en el manifiesto de la corrida.'
          : 'Learned and foundation methods cannot promise bit-level reproducibility, and the system admits that rather than faking it: GPU floating point and official engine versions can change byte-level outputs. Their manifests therefore record the reproducibility inputs and the resulting evidence: the dataset cache checksum and the split used, the seed, the hyperparameters and the calibration choice, the language, framework, GPU-compute and device versions, the checkpoint lineage with its byte size and digest, the untouched-test metrics with per-sample errors, the canonical diagnostic metrics, and export parity where an export applies. Small checkpoints and export files are versioned; large official weights stay in their upstream caches with immutable identifiers and the local file digest recorded in the run manifest.'}
      </p>

      <Equation
        tex={String.raw`H_{\mathrm{run}} = H\bigl(\text{config} \Vert \text{data} \Vert \text{checkpoint} \Vert \text{metrics}\bigr)`}
        caption={es
          ? 'La identidad de corrida enlaza configuración, datos, pesos y resultados en un solo resumen, de modo que cambiar cualquiera de los cuatro cambia el identificador.'
          : 'Run identity binds configuration, data, weights and results into one digest, so changing any of the four changes the identifier.'}
      />

      {/* Source: data/derived/release-report.json (methods: 15 rows, of which the 8 with a trained or
          downloaded artifact carry a run manifest with its sha256 and the 7 classical rows carry run: null;
          temporal_evidence: 15 entries, one per registered method, matching the 15 reports in
          data/derived/temporal/) and docs/benchmark/01_matrix-and-acceptance.md (the development gate rejects
          missing cells or compute metadata; a green artifact-inventory check cannot override the gate). */}
      <p className="measure">
        {es
          ? 'La traza de liberación cierra el círculo. El artefacto de comparación une los resultados de los quince métodos, y el reporte de liberación registra su resumen criptográfico, el de cada uno de los ocho manifiestos de corrida (los siete métodos clásicos no tienen artefacto entrenado que resumir, así que su campo de corrida queda nulo en vez de rellenarse) y el de los quince reportes temporales, uno por método registrado. La puerta rechaza un registro incompleto o evidencia ausente, y rechaza además una celda ausente o metadatos de cómputo ausentes, de modo que la cobertura no es una afirmación editorial sino un campo verificado. El experimento legado del navegador se conserva como artefacto histórico separado y no reemplaza ni se ordena por encima de la comparación retenida vigente.'
          : 'The release trace closes the loop. The comparison artifact joins the results of all fifteen methods, and the release report records its cryptographic digest, that of each of the eight run manifests (the seven classical methods have no trained artifact to digest, so their run field is null rather than filled in), and that of the fifteen temporal reports, one per registered method. The gate rejects an incomplete registry or missing evidence, and it additionally rejects a missing cell or missing compute metadata, so coverage is not an editorial claim but a verified field. The legacy browser experiment is retained as a separate historical artifact and neither replaces nor ranks above the current held-out comparison.'}
      </p>

      {/* Source: docs/architecture/03_the-gate.md (live only within bounded download, memory, runtime and
          dependency constraints; C1/C3/C4 TypeScript twins passed 16-condition browser and offline parity;
          the web copies derived evidence at build and replays 195 method-case pairs without recomputing). */}
      <p className="measure">
        {es
          ? 'La puerta de cómputo decide qué corre en el navegador, y existe para proteger la validez científica, no para lucir una demostración. Una carga es de ejecución en vivo solo cuando el navegador puede ejecutar el mismo método dentro de límites acotados de descarga, memoria, tiempo de ejecución y dependencias; si no, corre fuera de línea y la web reproduce evidencia compacta. Tres métodos clásicos tienen gemelos en el lenguaje de la web que pasaron las comprobaciones de paridad entre navegador y ejecución fuera de línea sobre las dieciséis condiciones. Los motores pesados, las comprobaciones de las bibliotecas científicas, el entrenamiento y las evaluaciones de la prueba intocada se quedan fuera de línea, y lo que la web muestra de ellos son los ciento noventa y cinco pares método-caso ya calculados y comprometidos, con sus métricas retenidas y sus hallazgos negativos, incluso cuando no hay acelerador ni acceso a un repositorio de modelos.'
          : 'The compute gate decides what runs in the browser, and it exists to protect scientific validity, not to showcase a demo. A workload is live only when the browser can execute the same method within bounded download, memory, runtime and dependency constraints; otherwise it runs offline and the web replays compact evidence. Three classical methods have twins in the web language that passed the browser-versus-offline parity checks across all sixteen conditions. Heavy engines, the scientific-library baselines, training and untouched-test evaluations stay offline, and what the web shows of them is the one hundred and ninety-five already-computed, committed method-case pairs, with their held-out metrics and their negative findings, even when no accelerator or model hub is available.'}
        {' '}<Cite id="onnxruntimeweb" paren /> <Cite id="webgpu" paren />
      </p>

      {(methods || temporal) && (
        <table className="fs-table">
          <caption className="hint">
            {es
              ? 'Campos verificados de los artefactos comprometidos que sostienen las pestañas anteriores.'
              : 'Verified fields of the committed artifacts that support the previous tabs.'}
          </caption>
          <thead>
            <tr>
              <th>{es ? 'evidencia' : 'evidence'}</th>
              <th>{es ? 'qué fija' : 'what it fixes'}</th>
              <th>{es ? 'campo verificado' : 'verified field'}</th>
            </tr>
          </thead>
          <tbody>
            {methods && (
              <>
                <tr>
                  <td>{es ? 'manifiesto del conjunto aprendido' : 'learned-dataset manifest'}</td>
                  <td>{es ? 'muestras, grupos y divisiones' : 'samples, groups and splits'}</td>
                  <td>{es ? `unidad de división: grupo de geometría latente; ${methods.coverage.expected_test_samples} muestras de prueba` : `split unit: latent geometry group; ${methods.coverage.expected_test_samples} test samples`}</td>
                </tr>
                <tr>
                  <td>{es ? 'comparación de métodos' : 'method comparison'}</td>
                  <td>{es ? 'cobertura de la matriz retenida' : 'held-out matrix coverage'}</td>
                  <td>{methods.coverage.observed_cells} / {methods.coverage.expected_cells} {es ? 'celdas' : 'cells'}; {methods.coverage.condition_count} {es ? 'condiciones' : 'conditions'}</td>
                </tr>
                <tr>
                  <td>{es ? 'puerta de afirmación' : 'claim gate'}</td>
                  <td>{es ? 'umbral predeclarado y liderazgo' : 'predeclared threshold and leadership'}</td>
                  <td>
                    AP {methods.current_bar.threshold.toFixed(2)}
                    {methods.current_bar.leader ? ` · ${methods.current_bar.leader.id} ${methods.current_bar.leader.mean_ap.toFixed(3)}` : ''}
                    {' · '}
                    {methods.current_bar.beyond_sota_claim
                      ? (es ? 'afirmación de superioridad: sí' : 'superiority claim: yes')
                      : (es ? 'sin afirmación de superioridad' : 'no superiority claim')}
                  </td>
                </tr>
              </>
            )}
            {temporal && (
              <tr>
                <td>{es ? 'reporte temporal' : 'temporal report'}</td>
                <td>{es ? 'secuencias, cuadros y dispositivo' : 'sequences, frames and device'}</td>
                <td>
                  {temporal.sequences.length} x {temporal.sequences[0]?.frames ?? 0} {es ? 'cuadros' : 'frames'}; {temporal.device}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <Callout variant="honest" title={es ? 'Un inventario verde no es una aprobación científica' : 'A green inventory is not a scientific pass'}>
        <p className="measure">
          {es
            ? 'Completar la implementación no implica éxito de calidad. Los quince métodos están implementados y varios superan el umbral vigente, y eso no autoriza ninguna afirmación de aptitud para planta: la aceptación del producto sigue bloqueada hasta que un carril real retenido, con licencia y calibración, cumpla umbrales predeclarados. Una comprobación de inventario de artefactos en verde no puede anular esa puerta científica. La evidencia sintética permite comparación controlada; la transferencia a planta sigue exigiendo una fuente con licencia, representativa y calibrada físicamente.'
            : 'Implementation completeness does not imply quality success. All fifteen methods are implemented and several clear the current threshold, and that authorises no claim of plant readiness: product acceptance remains blocked until a licensed, calibrated real held-out lane meets predeclared thresholds. A green artifact-inventory check cannot override that scientific gate. Synthetic evidence enables controlled comparison; plant transfer still requires a licensed, representative, physically calibrated source.'}
        </p>
      </Callout>

      <Refs ids={['onnxruntimeweb', 'webgpu']} label="Refs" />
    </div>
  );
}

/* ============================================================================
   FIGURES (hand-authored, theme-aware, values transcribed from the repo)
   ========================================================================== */

function TwoSurfacesFigure({ es }: { es: boolean }) {
  return (
    <Figure
      caption={es
        ? 'Un generador, dos superficies con protocolos distintos: la canónica diagnostica un modo de falla por imagen, la retenida ordena métodos. El evaluador prohíbe promediarlas.'
        : 'One generator, two surfaces with different protocols: the canonical one diagnoses a failure mode per image, the held-out one ranks methods. The evaluator forbids averaging them.'}
    >
      <svg className="fig-svg wide" viewBox="0 0 760 270" role="img" aria-label={es ? 'Dos superficies experimentales derivadas de un generador' : 'Two experimental surfaces derived from one generator'}>
        <defs>
          <marker id="ex-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path className="dg-arrowhead" d="M0 0L10 5L0 10z" />
          </marker>
        </defs>

        <rect className="dg-box accent" x="14" y="106" width="152" height="72" rx="9" />
        <text className="dg-box-title accent" x="90" y="132" textAnchor="middle">{es ? 'generador Laguerre' : 'Laguerre generator'}</text>
        <text className="dg-box-sub" x="90" y="152" textAnchor="middle">f(spec, seed)</text>
        <text className="dg-box-sub" x="90" y="168" textAnchor="middle">{es ? 'etiquetas = verdad' : 'labels = truth'}</text>

        <path className="dg-edge" d="M166 130 C210 130 210 62 252 62" markerEnd="url(#ex-a)" />
        <text className="dg-edge-label" x="186" y="80">{es ? '1 semilla / falla' : '1 seed / failure'}</text>
        <path className="dg-edge" d="M166 156 C210 156 210 222 252 222" markerEnd="url(#ex-a)" />
        <text className="dg-edge-label" x="180" y="244">{es ? '6/2/2/2 grupos' : '6/2/2/2 groups'}</text>

        <rect className="dg-box" x="256" y="26" width="182" height="72" rx="9" />
        <text className="dg-box-title" x="347" y="52" textAnchor="middle">{es ? '13 casos canónicos' : '13 canonical cases'}</text>
        <text className="dg-box-sub" x="347" y="72" textAnchor="middle">256 px · seeds 101-113</text>
        <text className="dg-box-sub" x="347" y="88" textAnchor="middle">{es ? '4 grupos · 2 controles' : '4 buckets · 2 controls'}</text>

        <rect className="dg-box" x="256" y="186" width="182" height="72" rx="9" />
        <text className="dg-box-title" x="347" y="212" textAnchor="middle">{es ? '16 condiciones' : '16 conditions'}</text>
        <text className="dg-box-sub" x="347" y="232" textAnchor="middle">192 px · 12 x 2 = 384</text>
        <text className="dg-box-sub" x="347" y="248" textAnchor="middle">{es ? 'grupo latente = unidad' : 'latent group = unit'}</text>

        <path className="dg-edge" d="M438 62H526" markerEnd="url(#ex-a)" />
        <text className="dg-edge-label" x="446" y="52">15 x 13</text>
        <path className="dg-edge" d="M438 222H526" markerEnd="url(#ex-a)" />
        <text className="dg-edge-label" x="446" y="212">15 x 64</text>

        <rect className="dg-box" x="530" y="26" width="216" height="72" rx="9" />
        <text className="dg-box-title" x="638" y="52" textAnchor="middle">{es ? 'superficie diagnóstica' : 'diagnostic surface'}</text>
        <text className="dg-box-sub" x="638" y="72" textAnchor="middle">195 {es ? 'pares reproducidos' : 'replayed pairs'}</text>
        <text className="dg-box-sub" x="638" y="88" textAnchor="middle">{es ? 'AP nulo en el control vacío' : 'null AP on the empty control'}</text>

        <rect className="dg-box good" x="530" y="186" width="216" height="72" rx="9" />
        <text className="dg-box-title" x="638" y="212" textAnchor="middle">{es ? 'prueba intocada' : 'untouched test'}</text>
        <text className="dg-box-sub" x="638" y="232" textAnchor="middle">960 {es ? 'celdas comparables' : 'comparable cells'}</text>
        <text className="dg-box-sub" x="638" y="248" textAnchor="middle">{es ? 'umbral AP 0.30' : 'AP 0.30 threshold'}</text>

        <line className="dg-asymptote" x1="638" y1="104" x2="638" y2="180" />
        <text className="dg-marker-label" x="630" y="146" textAnchor="end">{es ? 'nunca se promedian' : 'never averaged'}</text>
      </svg>
    </Figure>
  );
}

function LeakageFigure({ es }: { es: boolean }) {
  return (
    <Figure
      caption={es
        ? 'La división agrupa por geometría latente: las dos variantes de apariencia comparten grupo y caen en la misma división. Repartir por imagen (derecha) pone la misma geometría en entrenamiento y en prueba, y el verificador lo rechaza por nombre.'
        : 'The split groups by latent geometry: the two appearance variants share a group and land in the same split. Splitting by image (right) puts the same geometry in train and test, and the checker rejects it by name.'}
    >
      <svg className="fig-svg wide" viewBox="0 0 760 300" role="img" aria-label={es ? 'División sin fuga frente al antipatrón de repartir por imagen' : 'Leakage-safe split versus the split-by-image anti-pattern'}>
        <defs>
          <marker id="lk-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path className="dg-arrowhead" d="M0 0L10 5L0 10z" />
          </marker>
        </defs>

        <text className="dg-box-title accent" x="14" y="22">{es ? 'adoptado: unidad = grupo de geometría latente' : 'adopted: unit = latent geometry group'}</text>

        <rect className="dg-box accent" x="130" y="40" width="150" height="58" rx="9" />
        <text className="dg-box-title accent" x="205" y="64" textAnchor="middle">{es ? 'geometría latente g' : 'latent geometry g'}</text>
        <text className="dg-box-sub" x="205" y="84" textAnchor="middle">{es ? '12 por condición' : '12 per condition'}</text>

        <path className="dg-edge" d="M170 98 C140 118 130 122 104 138" markerEnd="url(#lk-a)" />
        <text className="dg-edge-label" x="96" y="126" textAnchor="end">a00</text>
        <path className="dg-edge" d="M240 98 C268 118 278 122 296 138" markerEnd="url(#lk-a)" />
        <text className="dg-edge-label" x="306" y="126">a01</text>

        <rect className="dg-box" x="20" y="140" width="168" height="58" rx="9" />
        <text className="dg-box-sub" x="104" y="164" textAnchor="middle">{es ? 'apariencia 1' : 'appearance 1'}</text>
        <text className="dg-box-sub" x="104" y="182" textAnchor="middle">{es ? 'misma geometría' : 'same geometry'}</text>
        <rect className="dg-box" x="212" y="140" width="168" height="58" rx="9" />
        <text className="dg-box-sub" x="296" y="164" textAnchor="middle">{es ? 'apariencia 2' : 'appearance 2'}</text>
        <text className="dg-box-sub" x="296" y="182" textAnchor="middle">{es ? 'misma geometría' : 'same geometry'}</text>

        <path className="dg-edge" d="M104 198V240" markerEnd="url(#lk-a)" />
        <path className="dg-edge" d="M296 198V240" markerEnd="url(#lk-a)" />
        <rect className="dg-box good" x="60" y="244" width="280" height="44" rx="9" />
        <text className="dg-box-sub" x="200" y="271" textAnchor="middle">{es ? 'una sola división (2 de 12 en prueba)' : 'one split only (2 of 12 in test)'}</text>

        <line className="dg-grid" x1="410" y1="30" x2="410" y2="296" />

        <text className="dg-box-title" x="424" y="22">{es ? 'rechazado: unidad = imagen' : 'rejected: unit = image'}</text>
        <rect className="dg-box" x="430" y="60" width="160" height="56" rx="9" />
        <text className="dg-box-sub" x="510" y="84" textAnchor="middle">a00 {es ? 'a entrenamiento' : 'to train'}</text>
        <text className="dg-box-sub" x="510" y="102" textAnchor="middle">{es ? 'geometría g' : 'geometry g'}</text>
        <rect className="dg-box" x="430" y="140" width="160" height="56" rx="9" />
        <text className="dg-box-sub" x="510" y="164" textAnchor="middle">a01 {es ? 'a prueba' : 'to test'}</text>
        <text className="dg-box-sub" x="510" y="182" textAnchor="middle">{es ? 'geometría g' : 'geometry g'}</text>

        <line className="dg-asymptote" x1="418" y1="50" x2="602" y2="206" />
        <line className="dg-asymptote" x1="602" y1="50" x2="418" y2="206" />

        <path className="dg-edge" d="M510 196V222" markerEnd="url(#lk-a)" />
        <rect className="dg-box" x="424" y="226" width="324" height="62" rx="9" />
        <text className="dg-marker-label" x="586" y="248" textAnchor="middle">{es ? 'fuga de grupo' : 'group leakage'}</text>
        <text className="dg-box-sub" x="586" y="266" textAnchor="middle">{es ? 'la prueba mediría memoria, no generalización' : 'the test would measure memory, not generalisation'}</text>
        <text className="dg-box-sub" x="586" y="282" textAnchor="middle">{es ? 'el verificador la nombra y falla' : 'the checker names it and fails'}</text>
      </svg>
    </Figure>
  );
}

function TemporalProtocolFigure({ es }: { es: boolean }) {
  return (
    <Figure
      caption={es
        ? 'Dos protocolos temporales que nunca se agregan juntos: catorce métodos segmentan cada cuadro y la identidad se asigna después; uno recibe doce identidades exactas en el cuadro cero y solo propaga.'
        : 'Two temporal protocols that are never aggregated together: fourteen methods segment each frame and identity is assigned afterwards; one receives twelve exact identities on frame zero and only propagates.'}
    >
      <svg className="fig-svg wide" viewBox="0 0 760 286" role="img" aria-label={es ? 'Carril cuadro a cuadro frente a propagación nativa con prompt' : 'Framewise lane versus native prompted propagation'}>
        <defs>
          <marker id="tp-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path className="dg-arrowhead" d="M0 0L10 5L0 10z" />
          </marker>
        </defs>

        <text className="dg-box-title accent" x="16" y="24">{es ? 'carril A: segmentación cuadro a cuadro (14 métodos)' : 'lane A: framewise segmentation (14 methods)'}</text>
        {[0, 1, 2].map((index) => (
          <g key={index}>
            <rect className="dg-box" x={16 + index * 150} y="38" width="112" height="56" rx="8" />
            <text className="dg-node-label" x={72 + index * 150} y="62" textAnchor="middle">{index === 2 ? 't7' : `t${index}`}</text>
            <text className="dg-box-sub" x={72 + index * 150} y="82" textAnchor="middle">{es ? 'máscaras' : 'masks'}</text>
          </g>
        ))}
        {/* t0 to t1 is a real adjacency: identity is associated between consecutive frames at IoU 0.25. */}
        <path className="dg-edge" d="M128 66H162" markerEnd="url(#tp-a)" />
        <text className="dg-edge-label" x="130" y="56">IoU 0.25</text>
        {/* t1 to t7 is NOT an adjacency: every sequence is 8 frames (data/derived/temporal/*.json frames: 8),
            so five frames are omitted here and the edge is drawn broken instead of continuous. */}
        <path className="dg-edge" d="M278 66H312" markerEnd="url(#tp-a)" />
        <line className="dg-axis" x1="288" y1="58" x2="294" y2="74" />
        <line className="dg-axis" x1="294" y1="58" x2="300" y2="74" />
        <text className="dg-edge-label" x="294" y="106" textAnchor="middle">{es ? 't2 a t6 omitidos' : 't2 to t6 omitted'}</text>
        <text className="dg-box-sub" x="126" y="114" textAnchor="middle">{es ? '5 secuencias x 8 cuadros' : '5 sequences x 8 frames'}</text>
        <path className="dg-edge" d="M432 66H520" markerEnd="url(#tp-a)" />
        <rect className="dg-box" x="524" y="38" width="222" height="56" rx="9" />
        <text className="dg-box-title" x="635" y="62" textAnchor="middle">{es ? 'identidad por asociación' : 'identity from association'}</text>
        <text className="dg-box-sub" x="635" y="82" textAnchor="middle">{es ? 'mide estabilidad de máscara' : 'measures mask stability'}</text>

        <line className="dg-grid" x1="16" y1="140" x2="746" y2="140" />

        <text className="dg-box-title accent" x="16" y="188">{es ? 'carril B: propagación nativa con prompt (1 método)' : 'lane B: native prompted propagation (1 method)'}</text>
        <rect className="dg-box accent" x="16" y="206" width="150" height="62" rx="9" />
        <text className="dg-node-label" x="91" y="230" textAnchor="middle">t0</text>
        <text className="dg-box-sub" x="91" y="250" textAnchor="middle">{es ? '12 máscaras exactas' : '12 exact masks'}</text>
        <path className="dg-edge" d="M166 236H236" markerEnd="url(#tp-a)" />
        <text className="dg-edge-label" x="170" y="226">{es ? 'memoria' : 'memory'}</text>
        <rect className="dg-box" x="240" y="206" width="184" height="62" rx="9" />
        <text className="dg-box-sub" x="332" y="230" textAnchor="middle">{es ? 't1 a t7 intocados' : 't1 to t7 untouched'}</text>
        <text className="dg-box-sub" x="332" y="250" textAnchor="middle">{es ? 'sin descubrimiento' : 'no discovery'}</text>
        <path className="dg-edge" d="M424 236H520" markerEnd="url(#tp-a)" />
        <rect className="dg-box" x="524" y="200" width="222" height="74" rx="9" />
        <text className="dg-box-title" x="635" y="224" textAnchor="middle">{es ? 'identidad entregada' : 'identity handed over'}</text>
        <text className="dg-box-sub" x="635" y="244" textAnchor="middle">IDF1 = HOTA = 1.000</text>
        <text className="dg-box-sub" x="635" y="262" textAnchor="middle">{es ? 'IoU de identidad 0.898' : 'identity IoU 0.898'}</text>
      </svg>
    </Figure>
  );
}

/* ============================================================================
   HELPERS
   ========================================================================== */

function shortCondition(value: string): string {
  return value.replace('compound', 'mix').replace('microbubble', 'micro').replace('wide-bimodal-proxy', 'bimodal');
}

function heatColor(value: number): string {
  const normalized = Math.max(0, Math.min(1, value / .7));
  const hue = 8 + normalized * 164;
  const light = 25 + normalized * 28;
  return `hsl(${hue} 68% ${light}%)`;
}

function explainError(
  test: MethodMetricSummary,
  es: boolean,
  /* The leader is read from data/derived/method-benchmark.json current_bar.leader (N1 at 0.51859), not
     assumed from the selection: the AP >= 0.5 band holds both N1 and L5 (0.50989), so a method in that band
     is only called the strongest when the artifact names it the leader. */
  context: { methodId: string; leader: { id: string; mean_ap: number } | null },
): string {
  const ap = test.mean_ap;
  const boundary = test.mean_boundary_fscore ?? 0;
  const count = test.mean_count_relative_error ?? 0;
  if (ap >= .5) {
    const { leader, methodId } = context;
    if (leader && leader.id === methodId) {
      return es
        ? `La correspondencia de instancias es la más fuerte del banco, con el AP retenido más alto del artefacto (${leader.mean_ap.toFixed(3)}), así que el error restante hay que leerlo en recuento y morfometría antes de usar la salida como variable de proceso.`
        : `Instance correspondence is the strongest in the benchmark, holding the artifact’s highest held-out AP (${leader.mean_ap.toFixed(3)}), so the remaining error must be read through count and morphometry before the output is used as a process variable.`;
    }
    const comparison = leader
      ? (es
        ? `, ${(leader.mean_ap - ap).toFixed(3)} por debajo del líder ${leader.id} (AP ${leader.mean_ap.toFixed(3)})`
        : `, ${(leader.mean_ap - ap).toFixed(3)} below the leader ${leader.id} (AP ${leader.mean_ap.toFixed(3)})`)
      : '';
    return es
      ? `La correspondencia de instancias está entre las más fuertes del banco${comparison}, así que el error restante hay que leerlo en recuento y morfometría antes de usar la salida como variable de proceso.`
      : `Instance correspondence is among the strongest in the benchmark${comparison}, so the remaining error must be read through count and morphometry before the output is used as a process variable.`;
  }
  if (boundary >= .9 && ap < .3) {
    return es
      ? 'Las fronteras locales se aproximan bien, pero la asociación por instancia es débil: el método dibuja bordes plausibles sin cerrar correctamente burbujas individuales, que es la firma de una separación o una fusión sistemática.'
      : 'Local boundaries are close, but instance association is weak: the method draws plausible edges without correctly closing individual bubbles, which is the signature of a systematic split or merge.';
  }
  if (count > .5) {
    return es
      ? 'El efecto dominante es un sesgo fuerte de recuento. Las fusiones o los objetos omitidos distorsionan después la media de Sauter y la distribución completa, así que la salida no sirve como sensor blando aunque los bordes se vean bien.'
      : 'The dominant effect is a strong count bias. Merges or missed objects then distort the Sauter mean and the whole distribution, so the output is unusable as a soft sensor even where the edges look right.';
  }
  return es
    ? 'El error combina correspondencia, frontera y tamaño; no hay una sola etapa que explique toda la caída, y por eso las cinco cifras se publican juntas.'
    : 'The error combines correspondence, boundary and size; no single stage explains the whole drop, which is why all five figures are published together.';
}
