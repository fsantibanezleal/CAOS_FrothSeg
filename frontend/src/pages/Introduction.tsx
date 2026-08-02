import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, ScanSearch } from 'lucide-react';
import { Callout, Cite, Equation, Figure, InlineMath, Refs, useShellLang } from '@fasl-work/caos-app-shell';
import { artifactUrl, loadMethodBenchmark, loadTemporalShowcase } from '../api/artifacts';
import type { MethodBenchmarkDoc, MethodBenchmarkRow } from '../lib/contract.types';
import type { TemporalShowcaseManifest } from '../lib/workbench';

const REFS = 'Refs';

/** The published method benchmark, loaded once per page mount and shared by every figure that
 *  states a number. The rule this hook enforces is scoped to the FIGURES: every counter drawn
 *  inside them either comes from `data/derived/method-benchmark.json` at runtime or renders a
 *  dash, never an invented value. That rule exists because the earlier version of this page
 *  opened with three hard-coded literals (214 instances, d32 3.84 mm, 91.6% coverage), and
 *  `3.84 mm` was not merely wrong but IMPOSSIBLE, because the product has no pixel/mm calibration
 *  and the App itself prints "no pixel/mm scale entered, sizes shown in pixels".
 *
 *  The PROSE is a different case, and the rule must not be read as covering it: the paragraphs do
 *  state constants by hand (the split sizes, the ingestion contract thresholds, the metric
 *  thresholds, the per-case instance counts, the transfer deltas). Each of those carries, in a
 *  comment beside it, the repository path it was read from. Those comments are the audit trail, so
 *  re-check a number against the file it names, never against this docstring. */
function useMethodBenchmark(): MethodBenchmarkDoc | null {
  const [doc, setDoc] = useState<MethodBenchmarkDoc | null>(null);
  useEffect(() => { loadMethodBenchmark().then(setDoc).catch(() => setDoc(null)); }, []);
  return doc;
}

const DASH = '--';
const num = (value: number | null | undefined, digits = 3): string => (value == null ? DASH : value.toFixed(digits));
const int = (value: number | null | undefined): string => (value == null ? DASH : String(value));

export default function Introduction() {
  const es = useShellLang() === 'es';
  const bench = useMethodBenchmark();

  return (
    <div className="page-body prose">
      <div className="page-head">
        <h1>{es
          ? 'De una superficie de espuma en movimiento a una distribución de tamaños medible'
          : 'From a moving froth surface to a measurable size distribution'}</h1>
        <p className="lede">
          {es
            ? 'La única parte de una celda de flotación permanentemente expuesta a una cámara es la cara superior de la espuma. FrothSeg estudia el paso que convierte esa proyección en una medición: la partición de la imagen en burbujas individuales, una región por burbuja, de la que se derivan los percentiles de diámetro y la media de Sauter '
            : 'The only part of a flotation cell permanently exposed to a camera is the top face of the froth. FrothSeg studies the step that turns that projection into a measurement: partitioning the image into individual bubbles, one region per bubble, from which diameter percentiles and the Sauter mean '}
          <InlineMath tex="d_{32}" />
          {es
            ? '. Es un banco controlado sobre espuma sintética con verdad exacta por construcción, no un sistema de control de planta ni una estimación de recuperación, y sin una calibración px/mm sus tamaños quedan en píxeles.'
            : '. It is a controlled benchmark over synthetic froth whose truth is exact by construction, not a plant-control system and not a recovery estimator, and without a px/mm calibration its sizes stay in pixels.'}
        </p>
      </div>

      <section>
        <h2>{es ? 'El problema de medición dentro de una celda de flotación' : 'The measurement problem inside a flotation cell'}</h2>

        {/* No dimensional quantity is stated for the froth layer: this repository holds no froth
            depth measurement, and the App has no px/mm calibration, so a depth in centimetres
            would be prose with no in-repo trace. The physics of the layer is covered by the
            Aldrich et al. 2010 review cited at the end of the paragraph. */}
        <p className="measure">{es
          ? 'Una celda de flotación es un tanque agitado o inyectado en el que se introduce aire en una pulpa mineral acondicionada. Los reactivos colectores vuelven hidrofóbicas las superficies del mineral de interés, el espumante estabiliza la dispersión de gas, y las partículas hidrofóbicas se adhieren a las burbujas ascendentes. Las burbujas cargadas se acumulan en la parte superior de la celda como una capa de espuma y esa capa rebalsa el labio del canal de concentrado. Casi todo lo que le importa al metalurgista ocurre dentro de la pulpa, donde nada se observa de forma continua sin muestreo invasivo. La superficie de espuma es la excepción: es la única parte del proceso permanentemente expuesta a una cámara montada sobre la celda, bajo iluminación controlada, y es la razón por la que la imagenología de espuma existe como instrumento industrial. Lo que la cámara ve es la cara superior de la capa más alta de burbujas, una proyección bidimensional de una dispersión tridimensional, y toda inferencia que este producto sostiene debe extraerse de esa proyección.'
          : 'A flotation cell is a stirred or sparged tank into which air is injected through a conditioned mineral pulp. Collector reagents make the surfaces of the target mineral hydrophobic, frother stabilises the gas dispersion, and hydrophobic particles attach to rising bubbles. The loaded bubbles accumulate at the top of the cell as a froth layer, and that layer overflows the launder lip as concentrate. Almost everything that matters to the metallurgist happens inside the pulp, where nothing can be observed continuously without invasive sampling. The froth surface is the exception: it is the one part of the process permanently exposed to a camera mounted over the cell, under controlled illumination, and it is why froth imaging exists as an industrial instrument at all. What the camera sees is the top face of the topmost layer of bubbles, a two-dimensional projection of a three-dimensional dispersion, and every inference this product supports has to be drawn from that projection.'}{' '}<Cite id="aldrich2010" paren /></p>

        <p className="measure">{es
          ? 'La apariencia de la espuma no es decorativa: covaría con las variables manipuladas del circuito. El flujo de aire, la dosis de espumante, el nivel de pulpa y la carga mineral sobre las superficies de las burbujas modifican el tamaño, la forma, la estabilidad, el color y la velocidad de las celdas que llegan a la superficie. Por eso la literatura de visión de máquina trata la distribución de tamaños de burbuja y la clase de espuma como sensores blandos: cantidades baratas de medir ópticamente y correlacionadas con cantidades caras o lentas de medir directamente, como la ley y la recuperación. Se han fusionado descriptores morfológicos con estadísticas del conjunto de píxeles para reconocer condiciones de operación, y se han entrenado clasificadores convolucionales para nombrar el estado de la espuma directamente; en ese trabajo el bloqueador reportado una y otra vez es la escasez de imágenes de espuma etiquetadas, no la capacidad del modelo.'
          : 'Froth appearance is not decorative: it covaries with the manipulated variables of the circuit. Air rate, frother dose, pulp level and the mineral loading on the bubble surfaces all change the size, shape, stability, colour and velocity of the cells that reach the surface. The machine-vision literature therefore treats bubble-size distribution and froth class as soft sensors: quantities that are cheap to measure optically and correlated with quantities that are expensive or slow to measure directly, such as grade and recovery. Morphological descriptors have been fused with pixel-set statistics for operating-condition recognition, and convolutional classifiers have been trained to name the froth state directly; in that work the blocker reported over and over is the scarcity of labelled froth imagery, not model capacity.'}{' '}<Cite id="wang2018" paren />{' '}<Cite id="fu2019" paren /></p>

        {/* "fifteen implementations": data/derived/method-benchmark.json method_count = 15
            (also README.md "Release evidence", C1-C7 + L1-L7 + N1). The same count is READ from
            that artifact in the figure below, so the prose and the figure cannot drift apart. */}
        <p className="measure">{es
          ? 'Ahí la segmentación deja de ser un paso preliminar y se vuelve el cuello de botella. Un sensor blando basado en tamaño de burbuja necesita una distribución sobre burbujas individuales: percentiles, una media ponderada por superficie, una fracción de finos. Ninguna de esas cantidades existe hasta que la imagen se ha particionado en burbujas, una región por burbuja, con cada región separable de las que toca. Los algoritmos dedicados de segmentación de espuma se construyeron exactamente para esa medición, y su propósito declarado es la distribución de tamaños, no un contorno vistoso. FrothSeg es un estudio de ese paso: quince implementaciones del problema de partición, evaluadas contra verdad exacta bajo estresores controlados, más las mediciones de tamaño, forma e identidad que la partición hace posibles.'
          : 'That is where segmentation stops being a preliminary and becomes the bottleneck. A soft sensor built on bubble size needs a distribution over individual bubbles: percentiles, a surface-weighted mean, a fines fraction. None of those quantities exists until the image has been partitioned into bubbles, one region per bubble, with each region separable from the ones it touches. Dedicated froth segmentation algorithms were built for exactly that measurement, and their stated purpose is the size distribution rather than a handsome outline. FrothSeg is a study of that step: fifteen implementations of the partitioning problem, scored against exact truth under controlled stressors, plus the size, shape and identity measurements the partition makes possible.'}{' '}<Cite id="jahedsaravani2017" paren /></p>

        {/* Title-level statements only. Crossref records for these three DOIs were read on 2026-08-01
            and are recorded in verification/froth-citations-2026-08-01.json; their abstracts are not
            retrievable, so nothing below the title is asserted about any of them. */}
        <p className="measure">{es
          ? 'Ese paso sigue siendo literatura activa. Una revisión de 2025 recorre los avances recientes del análisis de imágenes de espuma de flotación mediante aprendizaje profundo, y dos trabajos posteriores operan exactamente en la capa de medición que este producto usa: una representación por máscaras de instancia para la distribución de tamaños de burbuja en una columna de flotación bifásica, y un método de extracción de rasgos morfológicos de espuma de flotación de carbón basado en segmentación de instancias. Sus títulos nombran el mismo objetivo que se mide aquí. Ninguna cifra reportada por ellos se repite en este producto, y ninguna sería comparable con el banco sintético que sigue.'
          : 'That step is still an active literature. A 2025 review covers recent advances in flotation froth image analysis via deep learning, and two later papers work at exactly the measurement layer this product uses: an instance mask representation for bubble size distribution in a two-phase bubble flotation column, and an extraction method for the morphological features of coal flotation froth based on instance segmentation. Their titles name the same target measured here. No number reported in them is repeated in this product, and none would be comparable to the synthetic bench that follows.'}{' '}<Cite id="chen2025frothreview" paren />{' '}<Cite id="wen2025instancemask" paren />{' '}<Cite id="yang2026morphological" paren /></p>

        <MeasurementChainFigure es={es} bench={bench} />

        <Refs ids={['aldrich2010', 'wang2018', 'fu2019', 'jahedsaravani2017', 'chen2025frothreview', 'wen2025instancemask', 'yang2026morphological']} label={REFS} />
      </section>

      <section>
        <h2>{es ? 'Qué es físicamente una imagen de espuma' : 'What a froth image physically is'}</h2>

        <p className="measure">{es
          ? 'Una espuma es una dispersión de gas en un volumen pequeño de líquido. Por encima de una fracción líquida baja, las celdas de gas no pueden mantenerse esféricas: se presionan entre sí y se vuelven poliédricas, separadas por películas líquidas delgadas llamadas lamelas. Tres lamelas se encuentran a lo largo de un canal líquido, el borde de Plateau, y cuatro canales se encuentran en un vértice; esa es la geometría de equilibrio que la física de espumas describe para una espuma seca. La consecuencia óptica es toda la base de la imagenología de espuma. Una lamela es delgada y casi transparente; un borde de Plateau es un canal líquido curvo que refracta y absorbe luz, por lo que se lee como un valle oscuro y de gradiente bajo; y cada cúpula actúa como un espejo curvo que devuelve un reflejo especular brillante de la fuente de luz cerca de su centro. Una imagen de espuma es entonces un campo de cúpulas brillantes separadas por costuras oscuras, y esas costuras son la única evidencia de que dos cúpulas vecinas son dos burbujas y no una.'
          : 'A froth is a dispersion of gas in a small volume of liquid. Above a low liquid fraction the gas cells cannot stay spherical: they press against each other and become polyhedral, separated by thin liquid films called lamellae. Three lamellae meet along a liquid channel, the Plateau border, and four channels meet at a vertex; that is the equilibrium geometry the physics of foams describes for a dry foam. The optical consequence is the whole basis of froth imaging. A lamella is thin and nearly transparent; a Plateau border is a curved liquid channel that refracts and absorbs light, so it reads as a dark, low-gradient valley; and each cap acts as a curved mirror, returning a bright specular highlight of the light source near its centre. A froth image is therefore a field of bright caps separated by dark seams, and those seams are the only evidence that two neighbouring caps are two bubbles rather than one.'}{' '}<Cite id="weaire1999foams" paren /></p>

        <p className="measure">{es
          ? 'La fuerza de esa evidencia no es constante, y eso distingue a la espuma de casi cualquier otro dominio de segmentación por instancias. Al subir la fracción líquida la espuma se vuelve húmeda: las celdas se redondean, los bordes se ensanchan y se aclaran, y la costura oscura que separaba dos cúpulas se desvanece. La espuma seca muestra lamelas delgadas y oscuras; la espuma acuosa las suprime. Un lóbulo de brillo saturado de la iluminación crea una región clara que abarca varias celdas y borra las costuras interiores, lo que produce un interior falso y no simplemente ruido. El desenfoque por movimiento del transporte rápido de espuma corre las costuras en la dirección de avance; el desenfoque de foco las elimina de forma isotrópica. Las burbujas finas y densas llevan el ancho de la costura al límite de resolución del sensor. El recorte de cuadro corta burbujas en el borde, lo que distorsiona la morfometría incluso cuando la segmentación es correcta. Cada condición degrada una parte distinta de la evidencia, por lo que cada una produce una falla distinta, y ser robusto a una no implica ser robusto a otra.'
          : 'The strength of that evidence is not constant, and this separates froth from most other instance-segmentation domains. As the liquid fraction rises the foam becomes wet: cells round off, borders widen and brighten, and the dark seam that separated two caps fades. Dry froth shows thin dark lamellae; watery froth suppresses them. A saturated glare lobe from the illumination creates a bright region spanning several cells and erases the seams inside it, which produces a false interior rather than noise. Motion blur from fast froth travel smears the seams along the direction of travel; defocus removes them isotropically. Dense fine bubbles put the seam width at the sensor resolution limit. Frame truncation cuts bubbles at the border, which distorts morphometry even when the segmentation is correct. Each condition degrades a different part of the evidence, so each produces a different failure, and being robust to one does not imply being robust to another.'}{' '}<Cite id="wang2003froth" paren /></p>

        {/* Generator mechanism and both equations below: data-pipeline/fslab/science/froth_gen.py
            (`laguerre_labels` for the power-distance assignment, `_lognormal_radii` for
            mu = ln d32 - 2.5 sigma^2, `render` for the EDT border darkening and the jittered or
            dropped highlights) and docs/cases/01_coverage.md section "Theory: how a case is built
            and scored". */}
        <p className="measure">{es
          ? 'Como no existe ninguna anotación por burbuja de espuma con licencia abierta, la verdad de referencia aquí se construye en lugar de anotarse. Cada cuadro es un diagrama de potencia, también llamado teselación de Laguerre, que es el modelo estándar de una espuma seca porque sus celdas se encuentran en la geometría de Plateau. Los centros se empacan por adsorción secuencial aleatoria con radios log-normales, y cada píxel se asigna al sitio de mínima distancia de potencia. La apariencia se agrega sobre esa partición exacta: el gris base se oscurece hacia las costuras según la transformada de distancia euclidiana exacta de las fronteras de celda, cada cúpula recibe un reflejo especular cuya posición se perturba y que a veces se omite por completo para que un método sembrado en reflejos no pueda ganar artificialmente, y el estresor de cada caso se aplica al final. Las etiquetas son los propios índices de celda del render, así que la verdad no arrastra error de anotación, y un caso es una función pura de su especificación y su semilla.'
          : 'Because no openly licensed per-bubble froth annotation exists, the truth here is constructed rather than annotated. Each frame is a power diagram, also called a Laguerre tessellation, which is the standard model of a dry foam because its cells meet in the Plateau geometry. Centres are packed by random sequential adsorption with log-normal radii, and every pixel is assigned to the site of minimum power distance. Appearance is then added over that exact partition: the base grey darkens toward the seams according to the exact Euclidean distance transform of the cell boundaries, each cap receives a specular highlight whose position is jittered and which is sometimes dropped entirely so a highlight-seeded method cannot win artificially, and the per-case stressor is applied last. The labels are the render own cell indices, so the truth carries no annotation error, and a case is a pure function of its specification and its seed.'}{' '}<Cite id="aurenhammer1987" paren /></p>

        <Equation
          tex={String.raw`\mathrm{cell}(p) = \arg\min_i \bigl( \lVert p - c_i \rVert^2 - r_i^2 \bigr)`}
          caption={es
            ? 'Asignación de celda de Laguerre: el píxel p pertenece al sitio i de mínima distancia de potencia, con centro cᵢ y radio de peso rᵢ. Con r constante se reduce a Voronoi; los pesos distintos son los que producen celdas de tamaño variado que se encuentran en costuras curvas.'
            : 'Laguerre cell assignment: pixel p belongs to the site i of minimum power distance, with centre cᵢ and weight radius rᵢ. With constant r it reduces to Voronoi; the unequal weights are what produce differently sized cells meeting along curved seams.'}
        />

        <Equation
          tex={String.raw`\mu = \ln d_{32} - \tfrac{5}{2}\,\sigma_{\ln}^2, \qquad d \sim \mathrm{Lognormal}(\mu, \sigma_{\ln})`}
          caption={es
            ? 'Los radios se toman de una log-normal cuyo parámetro μ se despeja para que la media de Sauter del render iguale el d32 objetivo del caso; σ_ln fija el ancho de la distribución de tamaños, que es el eje entre espuma monodispersa y polidispersa.'
            : 'Radii are drawn from a log-normal whose parameter μ is solved so the render Sauter mean equals the case target d32; σ_ln sets the width of the size distribution, which is the axis between monodisperse and polydisperse froth.'}
        />

        {/* Only this section's cited works: weaire1999foams (foam geometry), aurenhammer1987 (power
            diagrams) and wang2003froth (condition-dependent froth appearance). jahedsaravani2017 is
            cited in the section above and listed there; it carried no citation point here. */}
        <Refs ids={['weaire1999foams', 'aurenhammer1987', 'wang2003froth']} label={REFS} />
      </section>

      <section>
        <h2>{es ? 'Por qué segmentación por instancias y no una máscara binaria' : 'Why per-instance segmentation, and not a binary mask'}</h2>

        {/* The fine/coarse instance counts and Sauter means are the measured ground truth of two
            canonical cases: docs/cases/01_coverage.md, per-case table (`fine-froth` GT n = 593,
            GT d32 = 12.92 px; `coarse-froth` GT n = 68, GT d32 = 39.51 px), generated by the
            specs in data-pipeline/fslab/science/froth_gen.py CASES (seeds 103 and 104). */}
        <p className="measure">{es
          ? 'Conviene ser preciso sobre qué puede entregar una máscara binaria y qué no. Una máscara espuma / no espuma sobre el campo de visión responde una sola pregunta: qué fracción del cuadro es interior de espuma. Esa es una cantidad real, la cobertura, y se reporta aquí. También es la única cantidad que una máscara binaria puede producir, porque no retiene información sobre cómo está dividido ese interior. Dos cuadros con la misma cobertura pueden estar divididos de formas opuestas, y las magnitudes están medidas en los casos canónicos de este repositorio: la verdad exacta del cuadro fine-froth contiene 593 burbujas con una media de Sauter de 12.92 px, y la de coarse-froth contiene 68 con 39.51 px. Esos dos estados corresponden a condiciones de operación opuestas y una cobertura no los distingue. La medición que el proceso realmente pide es una distribución sobre burbujas individuales, lo que exige un mapa entero de instancias: una imagen de etiquetas donde cada burbuja lleva su propio índice, de modo que su área, perímetro, elongación y posición sean medibles por separado y su diámetro entre una sola vez en la distribución.'
          : 'It is worth being precise about what a binary mask can and cannot deliver. A froth / not-froth mask over the field of view answers one question: what fraction of the frame is froth interior. That is a real quantity, coverage, and it is reported here. It is also the only quantity a binary mask can produce, because it retains no information about how that interior is divided. Two frames at the same coverage can be divided in opposite ways, and the magnitudes involved are measured in the canonical cases of this repository: the exact truth of the fine-froth frame holds 593 bubbles at a Sauter mean of 12.92 px, and coarse-froth holds 68 at 39.51 px. Those two states correspond to opposite operating conditions, and a coverage number cannot tell them apart. The measurement the process actually asks for is a distribution over individual bubbles, which requires an integer instance map: a label image in which every bubble carries its own index, so its area, perimeter, elongation and position are separately measurable and its diameter enters the distribution exactly once.'}</p>

        <Equation
          tex={String.raw`\phi = \frac{1}{|\Omega|}\sum_{x \in \Omega} \mathbf{1}\bigl[\hat{Y}(x) > 0\bigr], \qquad d_i = 2\sqrt{A_i/\pi}, \qquad d_{32} = \frac{\sum_i d_i^{\,3}}{\sum_i d_i^{\,2}}`}
          caption={es
            ? 'Lo único que da una máscara binaria (cobertura φ sobre la región válida Ω) frente a lo que da un mapa entero de instancias Ŷ: el diámetro circular equivalente dᵢ de cada instancia y la media de Sauter ponderada por superficie d32, el resumen estándar de la distribución de tamaños en flotación.'
            : 'All a binary mask yields (coverage φ over the valid region Ω) against what an integer instance map Ŷ yields: the equivalent circular diameter dᵢ of each instance and the surface-weighted Sauter mean d32, the standard size-distribution summary in flotation.'}
        />

        {/* The split/merge coverage threshold of 0.2, the unique-match threshold IoU > 0.5 used by
            PQ, and the ten-threshold sweep 0.50:0.05:0.95 in the equations below are all defined in
            docs/metrics/01_definitions.md against the code that computes them
            (data-pipeline/fslab/science/segment.py, `panoptic_quality` and `mask_ap`). */}
        <p className="measure">{es
          ? 'Una vez que la primitiva es por instancia, los errores se vuelven contables de una forma que una máscara binaria no puede expresar. Dos fallas dominan el trabajo con espuma y son opuestas. Una unión, o sub-segmentación, es un segmento predicho que cubre más de una burbuja verdadera: es la falla del umbral con componentes conexas, donde dos cúpulas en contacto comparten una región brillante y no se detecta costura entre ellas. Una división, o sobre-segmentación, es una burbuja verdadera cubierta por más de un segmento predicho: es la falla del watershed sin marcadores, donde un reflejo especular o una depresión de textura dentro de una misma cúpula grande siembra una segunda cuenca. Ambas se cuentan aquí con un umbral de cobertura de 0.2 y ambas se publican por imagen en lugar de plegarse en un solo puntaje. La calidad panóptica mantiene la misma distinción en forma continua: se factoriza como calidad de segmentación, el traslape medio sobre los pares emparejados, por calidad de reconocimiento, que penaliza simétricamente predicciones sin pareja y verdades sin pareja. La primera responde qué tan bien se dibujó un contorno; la segunda, si se encontró el número correcto de burbujas.'
          : 'Once the primitive is per-instance, the errors become countable in a way a binary mask cannot express. Two failures dominate froth work and they are opposites. A merge, or under-segmentation, is one predicted segment covering more than one true bubble: it is the threshold-with-connected-components failure, where two touching caps share a bright region and no seam is detected between them. A split, or over-segmentation, is one true bubble covered by more than one predicted segment: it is the marker-less watershed failure, where a specular highlight or a texture dip inside one large cap seeds a second basin. Both are counted here at a coverage threshold of 0.2, and both are published per image rather than folded into a single score. Panoptic quality keeps the same distinction in continuous form: it factorises as segmentation quality, the mean overlap over matched pairs, times recognition quality, which penalises unmatched predictions and unmatched truths symmetrically. The first answers how well an outline was drawn; the second answers whether the right number of bubbles was found.'}{' '}<Cite id="meyer1994" paren />{' '}<Cite id="vincent1991" paren /></p>

        <Equation
          tex={String.raw`\mathrm{PQ} = \underbrace{\frac{\sum_{(p,g) \in TP} \mathrm{IoU}(p,g)}{|TP|}}_{\mathrm{SQ}} \times \underbrace{\frac{|TP|}{|TP| + \tfrac{1}{2}|FP| + \tfrac{1}{2}|FN|}}_{\mathrm{RQ}}`}
          caption={es
            ? 'Calidad panóptica separada en sus dos preguntas: SQ (qué tan bien se delineó una burbuja encontrada, sobre pares emparejados con IoU estrictamente mayor que 0.5) y RQ (si se encontró la cantidad correcta). Se separan porque las dos fallas tienen causas distintas.'
            : 'Panoptic quality split into its two questions: SQ (how well a found bubble was outlined, over pairs matched at IoU strictly greater than 0.5) and RQ (whether the right number was found). They are separated because the two failures have different causes.'}
        />

        <Equation
          tex={String.raw`\mathrm{AP}(\tau) = \frac{TP(\tau)}{TP(\tau) + FP(\tau) + FN(\tau)}, \qquad \mathrm{AP} = \frac{1}{10} \sum_{\tau = 0.50}^{0.95} \mathrm{AP}(\tau)`}
          caption={es
            ? 'Concordancia de instancias: emparejamiento voraz por IoU descendente, uno a uno, y promedio sobre los diez umbrales τ de 0.50 a 0.95 en pasos de 0.05. No es el AP de COCO: sin ranking de confianza (un watershed no puntúa sus regiones) no hay precisión a integrar sobre recall, así que esta cantidad es el índice de Jaccard del emparejamiento, la definición estándar en segmentación celular. Los números no son comparables con una tabla COCO.'
            : 'Instance agreement: greedy matching by descending IoU, one to one, averaged over the ten thresholds τ from 0.50 to 0.95 in steps of 0.05. This is not COCO AP: with no confidence ranking (a watershed does not score its regions) there is no precision to integrate over recall, so the quantity is the Jaccard index of the matching, the definition standard in cell-segmentation work. The numbers are not comparable to a COCO leaderboard.'}
        />

        {/* Every boundary and AP figure in this paragraph is data/derived/method-benchmark.json,
            methods[*].test: the two methods the figure below selects are L4 StarDist 2D
            (micro.merges 4462, mean_boundary_fscore 0.7104) and C2 gradient immersion watershed
            (micro.splits 5507, mean_boundary_fscore 0.7424), which are the second and third lowest
            boundary scores of the fifteen; the highest is N1 at 0.9876, which still carries
            micro.merges 2250; the lowest is L7 at 0.5493. The AP range over the same rows is C2
            0.0173 to N1 0.5186, and coverage.expected_test_samples is 64. */}
        <p className="measure">{es
          ? 'Por eso también un puntaje de frontera no puede sustituir la concordancia de instancias, y la evidencia medida de eso está en este build. Un F-score de frontera compara píxeles de borde dentro de una tolerancia declarada, así que omitir la única costura entre dos burbujas vecinas cuesta unos pocos píxeles de borde mientras destruye una instancia completa. La figura siguiente lee del artefacto publicado los dos extremos de esa contabilidad, y la comparación honesta no es la cómoda. Las dos implementaciones que el artefacto elige, la de mayor conteo de uniones y la de mayor conteo de divisiones sobre el test intocado, quedan abajo en el eje de frontera, con 0.710 y 0.742: un puntaje de frontera sí registra una falla de instancias gruesa. Lo que no registra es el caso ordinario. El F-score de frontera más alto de toda la escalera, 0.988, pertenece a un método que aun así acumula 2250 uniones sobre las mismas 64 imágenes de test, y sobre las quince filas el eje de frontera abarca apenas 0.549 a 0.988 mientras el AP de instancias sobre esas mismas filas abarca 0.017 a 0.519. Son dos preguntas distintas y ninguno de los dos números se deduce del otro. El efecto se propaga directo a la distribución de tamaños, y de forma asimétrica. Las uniones combinan dos áreas en una, lo que mueve la distribución hacia lo grueso; las divisiones parten un área, lo que la mueve hacia lo fino. Como la media de Sauter está ponderada por superficie, la dominan los diámetros mayores, de modo que una sola unión de dos cúpulas grandes cuesta más que varias divisiones de cúpulas pequeñas. Por eso el error de distribución se mide directamente, como la distancia 1-Wasserstein entre las distribuciones de diámetro predicha y verdadera, que se lee como el error típico de diámetro ponderado por cuántas burbujas están mal.'
          : 'This is also why a boundary score cannot stand in for instance agreement, and the measured evidence for that is in this build. A boundary F-score compares boundary pixels within a declared tolerance, so omitting the single seam between two neighbouring bubbles costs a handful of boundary pixels while destroying one whole instance. The figure below reads the two extremes of that accounting off the published artifact, and the honest comparison is not the comfortable one. The two implementations the artifact selects, the largest merge count and the largest split count over the untouched test, do sit near the bottom of the boundary axis at 0.710 and 0.742, so a boundary score does register gross instance failure. What it cannot register is the ordinary case. The highest boundary F-score in the whole ladder, 0.988, belongs to a method that still carries 2250 merges over the same 64 test images, and across the fifteen rows the boundary axis spans only 0.549 to 0.988 while instance AP over those same rows spans 0.017 to 0.519. They are two different questions, and neither number can be read off the other. The effect propagates straight into the size distribution, and asymmetrically. Merges combine two areas into one, which moves the distribution coarse; splits divide one area, which moves it fine. Because the Sauter mean is surface weighted, it is dominated by the largest diameters, so a single merge of two large caps costs more than several splits of small ones. Distribution error is therefore measured directly, as the 1-Wasserstein distance between the predicted and true diameter distributions, which reads as the typical diameter error weighted by how many bubbles are wrong.'}{' '}<Cite id="villani2009ot" paren />{' '}<Cite id="sautermean" paren /></p>

        <Equation
          tex={String.raw`W_1(P, Q) = \int_{-\infty}^{\infty} \bigl| F_P(x) - F_Q(x) \bigr| \, dx`}
          caption={es
            ? 'Distancia de distribución: el área entre las funciones de distribución acumulada de los diámetros predichos P y verdaderos Q, en las mismas unidades físicas que los diámetros; vale 0 cuando las dos distribuciones coinciden. Comparar solo D50 esconde el error de forma.'
            : 'Distribution distance: the area between the cumulative distribution functions of the predicted diameters P and the true diameters Q, in the same physical units as the diameters; it is 0 when the two distributions coincide. Comparing D50 alone hides shape error.'}
        />

        {/* Provenance split on purpose: the run-length mask ENCODING and the 0.50:0.05:0.95
            threshold GRID are two separate things that the lin2014coco entry in
            frontend/src/data/citations.ts covers together ("the instance-mask AP@[.5:.95] protocol
            + the RLE mask format"). The grid is the evaluation protocol's choice, implemented in
            data-pipeline/fslab/science/segment.py `mask_ap` and declared in
            docs/metrics/01_definitions.md; the format only encodes masks. */}
        <p className="measure">{es
          ? 'Las mismas mediciones exigen una convención de unidades explícita, y aquí es deliberadamente conservadora. Un área de máscara está en píxeles. Se convierte a milímetros solo cuando se entrega una calibración px/mm, y la escala nunca se estima desde la imagen: no hay forma de recuperar el tamaño físico de una burbuja desde una fotografía monocular sin una referencia externa. La unidad viaja junto al número en cada salida, y la tolerancia de un F-score de frontera se reporta al lado del puntaje, porque un puntaje de frontera sin su tolerancia no es interpretable. La verdad de instancias se guarda en el formato compacto estándar de máscaras por longitud de corrida que lee cualquier toolkit de evaluación, y la rejilla de umbrales, de 0.50 a 0.95 en pasos de 0.05, es la que fijó el protocolo de evaluación COCO y no algo que el formato implique: el formato codifica máscaras, el protocolo eligió los umbrales. Con ambas cosas declaradas, un lector puede volver a puntuar estos cuadros con sus propias herramientas.'
          : 'The same measurements demand an explicit unit convention, and here it is deliberately conservative. A mask area is in pixels. It converts to millimetres only when a px/mm calibration is supplied, and scale is never estimated from the image: there is no way to recover a bubble physical size from a monocular photograph without an external reference. The unit travels with the number in every output, and the tolerance of a boundary F-score is reported next to the score, because a boundary score without its tolerance is not interpretable. The instance truth itself is stored in the standard compact run-length mask format every evaluation toolkit reads, and the threshold grid, 0.50 to 0.95 in steps of 0.05, is the one the COCO evaluation protocol fixed rather than anything the format implies: the format encodes masks, the protocol chose the thresholds. With both declared, a reader can rescore these frames with their own tooling.'}{' '}<Cite id="lin2014coco" paren /></p>

        <ul className="measure">
          <li><strong>Aᵢ</strong>{' '}{es ? 'área de la instancia i, en píxeles' : 'area of instance i, in pixels'}</li>
          <li><strong>dᵢ</strong>{' '}{es ? 'diámetro circular equivalente de la instancia i' : 'equivalent circular diameter of instance i'}</li>
          <li><strong>D10 · D50 · D90</strong>{' '}{es ? 'percentiles de la distribución de diámetros' : 'percentiles of the diameter distribution'}</li>
          <li><strong>d32</strong>{' '}{es ? 'media de Sauter, ponderada por superficie' : 'Sauter mean, surface weighted'}</li>
          <li><strong>σ_ln</strong>{' '}{es ? 'ancho log-normal de la distribución de tamaños generada' : 'log-normal width of the generated size distribution'}</li>
          <li><strong>cᵢ · rᵢ</strong>{' '}{es ? 'centro y radio de peso del sitio i del diagrama de potencia' : 'centre and weight radius of site i of the power diagram'}</li>
          <li><strong>Ω</strong>{' '}{es ? 'región válida de medición' : 'valid measurement region'}</li>
          <li><strong>Ŷ</strong>{' '}{es ? 'mapa entero de instancias predicho' : 'predicted integer instance map'}</li>
          <li><strong>φ</strong>{' '}{es ? 'cobertura de espuma, lo único que una máscara binaria entrega' : 'froth coverage, all a binary mask yields'}</li>
          <li><strong>τ</strong>{' '}{es ? 'umbral de IoU del emparejamiento de instancias' : 'IoU threshold of the instance matching'}</li>
          <li><strong>TP · FP · FN</strong>{' '}{es ? 'instancias emparejadas, predichas sin pareja y verdaderas sin pareja' : 'matched, unmatched-predicted and unmatched-true instances'}</li>
          <li><strong>SQ · RQ · PQ</strong>{' '}{es ? 'calidad de segmentación, de reconocimiento y su producto' : 'segmentation quality, recognition quality and their product'}</li>
          <li><strong>W₁</strong>{' '}{es ? 'distancia 1-Wasserstein entre distribuciones de diámetro' : '1-Wasserstein distance between diameter distributions'}</li>
          <li><strong>IDF1 · HOTA</strong>{' '}{es ? 'continuidad de identidad y balance detección/asociación en secuencias' : 'identity continuity and detection-association balance over sequences'}</li>
          <li><strong>κ</strong>{' '}{es ? 'calibración física de cámara en px/mm; sin ella los tamaños quedan en píxeles' : 'physical camera calibration in px/mm; without it sizes stay in pixels'}</li>
        </ul>

        <ErrorModeFigure es={es} bench={bench} />

        {/* aldrich2010 dropped from this list: it is cited in the first section and in the last one,
            and had no citation point in this section, which is metric definitions. */}
        <Refs ids={['lin2014coco', 'meyer1994', 'vincent1991', 'villani2009ot', 'sautermean']} label={REFS} />
      </section>

      <section>
        <h2>{es ? 'Las secuencias miden otra cosa: la identidad' : 'Sequences measure something else: identity'}</h2>

        <p className="measure">{es
          ? 'Una distribución de tamaños de un cuadro aislado no dice nada sobre estabilidad. La espuma se transporta hacia el labio del canal, las burbujas se deforman, coalescen y revientan, y son esos eventos los que indican una capa inestable o un exceso de arrastre. Contar un reventón exige más que segmentar cada cuadro: exige saber que la burbuja del cuadro siete es la misma burbuja del cuadro seis. Esa es una segunda medición, con sus propios modos de falla, y no se sigue de una buena segmentación por cuadro. Una propagación temporal puede mantener las máscaras y corromper las identidades al mismo tiempo.'
          : 'A size distribution from an isolated frame says nothing about stability. Froth is transported toward the launder lip, bubbles deform, coalesce and burst, and it is those events that indicate an unstable layer or excessive entrainment. Counting a burst takes more than segmenting each frame: it takes knowing that the bubble in frame seven is the same bubble as in frame six. That is a second measurement, with its own failure modes, and it does not follow from good per-frame segmentation. Temporal propagation can hold the masks and corrupt the identities at the same time.'}</p>

        <p className="measure">{es
          ? 'Aquí la identidad se asigna de dos maneras que nunca se promedian ni se rankean juntas. Los métodos por cuadro segmentan cada cuadro de forma independiente y reciben identidades después, por asignación bipartita óptima sobre el traslape de máscaras, el método de asignación húngaro. Un rastreador con memoria propia, en cambio, recibe las máscaras exactas del primer cuadro como prompt y propaga su cohorte fija por los cuadros siguientes, que quedan intactos: eso mide propagación, no descubrimiento automático. Las dos preguntas son distintas, así que los dos protocolos se reportan separados. La evaluación entrega IDF1, HOTA (que factoriza detección y asociación en lugar de mezclarlas), cambios de identidad, fragmentaciones de traza, cobertura por cuadro y error de punto final de flujo sobre los emparejamientos persistentes válidos. Esos números se leen juntos: un método que encuentra casi nada tiene pocas identidades que perder, así que un conteo bajo de cambios junto a una cobertura baja no es un buen resultado.'
          : 'Here identity is assigned in two ways that are never averaged or ranked together. Framewise methods segment each frame independently and receive identities afterwards, by optimal bipartite assignment over mask overlap, the Hungarian assignment method. A tracker with its own memory instead receives the exact first-frame masks as a prompt and propagates its fixed cohort through the later frames, which are left untouched: that measures propagation, not automatic discovery. The two questions differ, so the two protocols are reported apart. Evaluation returns IDF1, HOTA (which factorises detection and association rather than mixing them), identity switches, track fragmentations, per-frame coverage and flow endpoint error over valid persistent matches only. Those numbers are read together: a method that finds almost nothing has few identities to lose, so a low switch count next to low coverage is not a good result.'}{' '}<Cite id="kuhn1955hungarian" paren />{' '}<Cite id="luiten2021hota" paren /></p>

        <p className="measure">{es
          ? 'Lo que se reproduce abajo es la referencia temporal, no una predicción: secuencias generadas de forma determinista con identidades persistentes exactas, y la superposición coloreada es la verdad. La secuencia de reventones exporta eventos exactos de nacimiento y coalescencia; las secuencias de arrastre ordinario son controles negativos, para que la precisión y el recall de eventos expongan nacimientos falsos del rastreador en lugar de esconderlos. Un detalle que conviene decir explícito: en este repositorio no hay video y ningún módulo decodifica video. Una secuencia es una pila de cuadros PNG.'
          : 'What replays below is the temporal reference, not a prediction: deterministically generated sequences with exact persistent identities, and the coloured overlay is the truth. The bursting sequence exports exact birth and coalescence events; ordinary drift sequences are negative controls, so event precision and recall expose false tracker births instead of hiding them. One detail worth stating outright: there is no video in this repository and no module decodes video. A sequence is a stack of PNG frames.'}{' '}<Cite id="ravi2024sam2" paren /></p>

        <TemporalShowcase es={es} />

        <Refs ids={['kuhn1955hungarian', 'luiten2021hota', 'ravi2024sam2']} label={REFS} />
      </section>

      <section>
        <h2>{es ? 'La escalera de métodos y para qué existe' : 'The method ladder and what it is for'}</h2>

        <p className="measure">{es
          ? 'El repositorio no propone un segmentador; implementa una escalera y la evalúa completa, porque el objeto de estudio son los modos de falla y no un ranking. El piso clásico es transparente y sin entrenamiento: umbral de Otsu con componentes conexas (el exhibit de sub-segmentación), watershed por inmersión sin marcadores (el exhibit de sobre-segmentación), watershed controlado por marcadores en variantes sembradas por reflejos, por transformada de distancia y por supresión de mínimos, mezcla de superpíxeles por adyacencia de regiones, y una watershed restringida de valle de lamela que delinea por las costuras oscuras en lugar de los brillos, que es el método específico del dominio. Sobre ese piso está el nivel aprendido en el dominio: predicción de frontera y distancia con watershed, marcadores profundos, una red de segmentación de espuma con contexto global y un modelo de polígonos estrella-convexos, junto a un detector de una etapa con cabeza de segmentación. Encima, dos integraciones oficiales de modelos fundacionales, y por último un modelo de investigación interno de cuatro cabezas cuya cabeza de centro modula las semillas del watershed, en la línea de los diseños de ramas paralelas con supervisión de pérdida híbrida que la literatura de espuma ha propuesto.'
          : 'The repository does not propose one segmenter; it implements a ladder and evaluates all of it, because the object of study is the failure modes rather than a ranking. The classical floor is transparent and training-free: Otsu threshold with connected components (the under-segmentation exhibit), marker-less immersion watershed (the over-segmentation exhibit), marker-controlled watershed in highlight-seeded, distance-transform and minima-suppression variants, superpixel merging over a region adjacency graph, and a lamella-valley constrained watershed that delineates by the dark seams rather than the highlights, which is the domain-specific method. Above that floor sits the domain-learned tier: boundary and distance prediction with watershed, deep markers, a froth segmentation network with global context, and a star-convex polygon model, alongside a one-stage detector with a segmentation head. Above that, two official foundation-model integrations, and finally an in-repository research model with four heads whose centre head modulates the watershed seeds, in the line of the parallel-branch designs with hybrid loss supervision the froth literature has proposed.'}{' '}<Cite id="wang2003froth" paren />{' '}<Cite id="achanta2012slic" paren />{' '}<Cite id="ronneberger2015unet" paren />{' '}<Cite id="zhu2025gcfsegnet" paren />{' '}<Cite id="fan2024parallel" paren />{' '}<Cite id="schmidt2018stardist" paren />{' '}<Cite id="redmon2016yolo" paren /></p>

        {/* The basin/bubble ratio is measured, not rhetorical: data/derived/method-benchmark.json
            C2 (marker-less immersion watershed) test.micro.nPred = 71918 predicted regions against
            nGt = 17846 true instances over coverage.expected_test_samples = 64 images, i.e. about
            1124 predicted basins per image against about 279 true bubbles. */}
        <p className="measure">{es
          ? 'Esa escalera existe porque las fallas son informativas y opuestas. Un umbral global produce pocas instancias y muchas uniones; un watershed sin marcadores inunda unas mil cien cuencas por imagen donde hay unas doscientas ochenta burbujas verdaderas, cuatro predicciones por burbuja; un método sembrado en reflejos hereda exactamente la debilidad que la espuma real castiga, porque el brillo desaparece bajo un lóbulo saturado; un modelo estrella-convexo está limitado por su propia parametrización cuando una celda no lo es; los modelos fundacionales cambian ajuste al dominio por priors más amplios. Publicar la escalera completa, con las dos cuentas de error por imagen, deja esas mecánicas inspeccionables en lugar de comprimirlas en un solo número.'
          : 'That ladder exists because the failures are informative and opposite. A global threshold produces few instances and many merges; a marker-less watershed floods about eleven hundred basins per image where about two hundred and eighty true bubbles exist, four predictions for every bubble; a highlight-seeded method inherits exactly the weakness real froth punishes, because the highlight disappears under a saturated lobe; a star-convex model is limited by its own parametrisation when a cell is not star convex; foundation models trade domain fit for broader priors. Publishing the whole ladder, with the two error counts per image, leaves those mechanics inspectable instead of compressing them into one number.'}{' '}<Cite id="stringer2021cellpose" paren />{' '}<Cite id="kirillov2023" paren /></p>

        <p className="measure">{es
          ? 'Reproducibilidad y calidad predictiva se tratan como cosas separadas. Un método puede tener checkpoint, ruta de inferencia, evaluación y exportación sin liderar la comparación, y el modelo de investigación interno se retiene precisamente así: como una ablación positiva reproducible y un no líder medido. La barra vigente que lee el artefacto publicado es una sola: '
          : 'Reproducibility and predictive quality are treated as separate things. A method can have a checkpoint, an inference path, an evaluation and an export without leading the comparison, and the in-repository research model is retained exactly that way: as a reproducible positive ablation and a measured non-leader. The current bar the published artifact carries is a single one: '}
          <strong>{bench ? `${bench.current_bar.metric} ${num(bench.current_bar.threshold, 2)}` : DASH}</strong>
          {es
            ? ', y la bandera de reclamo por sobre el estado del arte del mismo artefacto vale '
            : ', and the beyond-state-of-the-art claim flag in that same artifact reads '}
          <strong>{bench ? (bench.current_bar.beyond_sota_claim ? (es ? 'verdadero' : 'true') : (es ? 'falso' : 'false')) : DASH}</strong>
          {es
            ? '. Se mantiene en falso: es una afirmación sobre el dominio, no sobre esta tabla.'
            : '. It stays false: it is a claim about the domain, not about this table.'}
        </p>

        {/* Query budget: num_q 200 in both released COCO instance configs of github.com/tue-mps/eomt
            (configs/dinov2|dinov3/coco/instance/eomt_large_640.yaml), and models/eomt.py builds the
            queries as nn.Embedding(num_q, ...), so the cap is structural. Instance counts: nGt max 1335
            and mean 278.8 over the 64-image test split, both read from data/derived/classical-heldout.json
            and reproduced from data/cache/learned-v2-192.npz. Evidence:
            verification/froth-citations-2026-08-01.json. */}
        <p className="measure">{es
          ? 'Una familia está deliberadamente ausente, y esa ausencia es una medición y no un olvido. Los transformadores de máscara basados en consultas, cuyo representante de linaje es EoMT, de solo codificador, y cuya cabeza actual son VidEoMT para video y PMT sobre codificadores congelados, emiten un número fijo de consultas de máscara por imagen. Las configuraciones de instancias sobre COCO publicadas por la implementación de referencia fijan ese número en 200, y las consultas se construyen como una tabla de embeddings de tamaño fijo, de modo que el tope es estructural y no un parámetro de ajuste. La verdad de terreno de este banco llega a 1.335 burbujas en un solo cuadro de 192 por 192 píxeles y promedia 279. Una fila construida sobre esa familia obtendría un mal puntaje aquí por una razón ajena a la espuma, así que se cita como comparación contextual y se deja fuera de la escalera a propósito.'
          : 'One family is deliberately absent, and that absence is a measurement rather than an oversight. The query-based mask transformers, whose lineage representative is the encoder-only EoMT and whose current head is VidEoMT for video and PMT over frozen encoders, emit a fixed number of mask queries per image. The COCO instance configurations released by the reference implementation set that number to 200, and the queries are built as a fixed-size embedding table, so the cap is structural and not a tuning parameter. The ground truth on this bench reaches 1,335 bubbles in a single 192 by 192 pixel frame and averages 279. A row built on that family would score badly here for a reason unrelated to froth, so it is cited as a contextual comparison and deliberately left out of the ladder.'}{' '}<Cite id="kerssies2025eomt" paren />{' '}<Cite id="norouzi2026videomt" paren />{' '}<Cite id="cavagnero2026pmt" paren /></p>

        <Refs ids={['wang2003froth', 'achanta2012slic', 'ronneberger2015unet', 'zhu2025gcfsegnet', 'fan2024parallel', 'schmidt2018stardist', 'redmon2016yolo', 'stringer2021cellpose', 'kirillov2023', 'kerssies2025eomt', 'norouzi2026videomt', 'cavagnero2026pmt']} label={REFS} />
      </section>

      <section>
        <h2>{es ? 'La cadena completa, y dónde corre cada parte' : 'The full chain, and where each part runs'}</h2>

        <p className="measure">{es
          ? 'El producto es un repositorio offline y este sitio es su acompañante. El orden importa porque cada paso impone una restricción al siguiente, y la restricción que sostiene todo lo demás es el aislamiento de grupos: cada grupo latente de geometría se renderiza en dos variantes de apariencia independientes, y un grupo pertenece a exactamente una partición, así que dos renders de la misma geometría de burbujas no pueden filtrarse entre entrenamiento, validación, calibración y el test intocado.'
          : 'The product is an offline repository and this site is its companion. The order matters because each step constrains the next, and the constraint holding up everything else is group isolation: each latent geometry group is rendered as two independent appearance variants, and a group belongs to exactly one split, so two renders of the same bubble geometry cannot leak across training, validation, calibration and the untouched test.'}</p>

        <ol className="measure">
          <li>{es
            ? 'generar imágenes fijas etiquetadas exactas o secuencias con identidades persistentes, como función pura de la especificación y la semilla;'
            : 'generate exact labelled stills or sequences with persistent identities, as a pure function of the specification and the seed;'}</li>
          <li>{es
            ? 'materializar un cache local del dataset con checksums fijados;'
            : 'materialize a checksum-pinned local dataset cache;'}</li>
          <li>{es
            ? 'entrenar el método, o cargar su checkpoint oficial preentrenado;'
            : 'train the method, or load its official pretrained checkpoint;'}</li>
          <li>{es
            ? 'calibrar el post-procesamiento solo sobre la partición de calibración;'
            : 'calibrate post-processing on the calibration split only;'}</li>
          <li>{es
            ? 'evaluar una sola vez sobre la partición de test intocada;'
            : 'evaluate once on the untouched test split;'}</li>
          <li>{es
            ? 'correr aparte el diagnóstico canónico de casos, que es una suite legible de modos de falla y no el test primario;'
            : 'separately run the canonical case diagnostic, which is a readable failure-mode suite and not the primary test;'}</li>
          <li>{es
            ? 'exportar checkpoints, ONNX portable donde aplica, máscaras, manifiestos de corrida, evidencia temporal y el reporte unificado de release;'
            : 'export checkpoints, portable ONNX where applicable, masks, run manifests, temporal evidence and the unified release report;'}</li>
          <li>{es
            ? 'copiar solo evidencia compacta al sitio estático acompañante.'
            : 'copy only compact evidence into the static companion website.'}</li>
        </ol>

        <PipelineFigure es={es} bench={bench} />

        <p className="measure">{es
          ? 'La frontera entre lo que corre offline y lo que corre en el navegador no es una preferencia de diseño, es una restricción técnica que se declara en lugar de disimularse. El entrenamiento y el benchmark completo necesitan bibliotecas de visión en Python, runtimes oficiales de investigación, checkpoints grandes y CUDA, así que nada de eso se traslada al navegador. La web lee resultados versionados y ofrece únicamente interacciones que son técnicamente válidas dentro del navegador: gemelos en TypeScript de tres métodos clásicos, validados contra sus implementaciones offline, más un lane liviano heredado de un SAM destilado que corre sobre WebGPU con respaldo en WASM-SIMD. Los métodos restantes quedan disponibles como exportación de un trabajo offline, no como sustitutos en el navegador. Una imagen subida se queda en el cliente.'
          : 'The boundary between what runs offline and what runs in the browser is not a design preference, it is a technical constraint that is declared rather than papered over. Training and the full benchmark need Python vision libraries, official research runtimes, large checkpoints and CUDA, so none of that moves into the browser. The web reads versioned results and offers only interactions that are technically valid inside a browser: TypeScript twins of three classical methods, validated against their offline implementations, plus a legacy lightweight lane running a distilled SAM over WebGPU with a WASM-SIMD fallback. The remaining methods stay available as an offline job export, not as browser substitutes. An uploaded image stays on the client.'}{' '}<Cite id="chen2023slimsam" paren />{' '}<Cite id="onnxruntimeweb" paren /></p>

        {/* Every ingestion constant in this paragraph (MIN_SIDE 64, MAX_SIDE 8192,
            DYN_RANGE_MIN 0.06, DYN_RANGE_FLAG 0.15, SAT_FRAC_FLAG 20%, DARK_FRAC_FLAG 55%) is the
            CONTRACT-1 table in docs/architecture/08_data-contracts.md, implemented in
            data-pipeline/fslab/io/contract.py and mirrored in frontend/src/lib/imageGate.ts. */}
        <p className="measure">{es
          ? 'Para que la herramienta pueda apuntarse a espuma que no salió del generador, la ingesta es un contrato explícito y no una conversión silenciosa. Un cuadro se rechaza con una razón si no es una imagen usable: forma que no sea gris 2D ni RGB[A], valores no finitos, lado mínimo bajo 64 px o máximo sobre 8192 px, o rango dinámico bajo 0.06, que es un cuadro plano. Se acepta pero se marca cuando es usable y degradado: rango dinámico bajo 0.15, más del 20 por ciento de píxeles casi saturados (brillo fuerte) o más del 55 por ciento casi negros (mayormente pulpa y no espuma). El navegador reimplementa esos mismos umbrales, así que la misma regla decide la ingesta offline y en línea, y las marcas activan el frente de corrección de brillo e iluminación antes de gastar una inferencia.'
          : 'So the tool can be pointed at froth that did not come out of the generator, ingestion is an explicit contract rather than a silent coercion. A frame is rejected with a reason if it is not a usable image: a shape that is neither 2D grey nor RGB[A], non-finite values, a minimum side below 64 px or a maximum side above 8192 px, or a dynamic range below 0.06, which is a flat frame. It is accepted but flagged when it is usable and degraded: dynamic range below 0.15, more than 20 per cent near-saturated pixels (heavy glare), or more than 55 per cent near-black pixels (mostly pulp rather than froth). The browser reimplements those same thresholds, so one rule decides ingestion offline and online, and the flags engage the deglare and illumination-flattening front end before an inference is spent.'}{' '}<Cite id="transformersjs" paren />{' '}<Cite id="webgpu" paren /></p>

        <Refs ids={['chen2023slimsam', 'transformersjs', 'onnxruntimeweb', 'webgpu']} label={REFS} />
      </section>

      <section>
        <h2>{es ? 'Qué es exacto, qué es ilustrativo y qué no se afirma' : 'What is exact, what is illustrative, and what is not claimed'}</h2>

        <p className="measure">{es
          ? 'Tres cosas en este producto son exactas en sentido estricto. Las máscaras de instancia de referencia son los propios índices de celda del render, así que la verdad no tiene error de anotación: no hay anotador con quien discrepar. La generación es determinista, un caso es una función pura de su especificación y su semilla, sin reloj de pared, así que los cuadros, las máscaras y los puntajes se regeneran bit a bit y una nueva corrida no ensucia el repositorio. Y las definiciones de las métricas están fijadas al código que las computa, con los casos borde declarados en lugar de asumidos: un caso sin instancias verdaderas reporta AP nulo y no cero, y queda fuera del ranking en vez de puntuarse como perfecto; una celda método-caso que no produce resultado es un error y no una fila ausente.'
          : 'Three things in this product are exact in the strict sense. The reference instance masks are the render own cell indices, so the truth has no annotation error: there is no annotator to disagree with. Generation is deterministic, a case is a pure function of its specification and its seed with no wall clock, so frames, masks and scores regenerate bit for bit and a re-run does not dirty the repository. And the metric definitions are pinned to the code that computes them, with the edge cases declared rather than assumed: a case with no true instances reports a null AP rather than zero and is excluded from the ranking instead of being scored as perfect; a method-case cell that fails to produce a result is an error, not a missing row.'}</p>

        <p className="measure">{es
          ? 'Lo que es ilustrativo, en cambio, es el dominio mismo. No hay imágenes reales de espuma en este repositorio, y eso es un hallazgo cerrado, no una búsqueda abierta ni una adquisición pendiente. Lo registran dos pasadas independientes. El 2026-07-28 se verificó cada candidato público de espuma contra su fuente primaria y todos resultaron sin licencia, no comerciales o de pago, con la interfaz de datasets de Zenodo devolviendo cero resultados de segmentación de espuma en tres consultas. El 2026-07-31, una pasada de investigación separada llegó al mismo resultado nulo: no existe en repositorios públicos un banco de espuma de flotación con revisión por pares, licencia abierta y anotación de máscaras por instancia. La afirmación es que no hay ninguno disponible, no que no pueda existir. La imagenología de espuma es dato operacional de planta y las plantas no lo publican, así que la única ruta registrada hacia una afirmación de exactitud en espuma es un conjunto anotado a propósito para este trabajo, del orden de 50 a 100 cuadros de una sola celda, con procedencia y licencia propias. Mientras tanto, el único lane real aceptado es de un dominio adyacente, fotografías reales de objetos densos que se tocan, y está etiquetado como tal en el código, no solo en la prosa: la fuente lleva el campo de dominio como adyacente y el reporte de release particiona por ese campo, de modo que solo una fuente de espuma puede levantar el requisito de dato real. Sin eso, el error de release sigue diciendo que no hay fuente real de espuma con licencia y calibración aceptada, y seguirá diciéndolo por mucha evidencia adyacente que se acumule.'
          : 'What is illustrative, by contrast, is the domain itself. There are no real froth images in this repository, and that is a settled finding rather than an open search or a pending acquisition. Two independent passes record it. On 2026-07-28 every public froth candidate was verified against its primary source and each one turned out to be unlicensed, non-commercial or paywalled, with the Zenodo dataset interface returning zero froth segmentation results across three queries. On 2026-07-31 a separate research pass reached the same null: no peer-reviewed, openly licensed, instance-mask-annotated flotation froth benchmark exists in public repositories. The claim is that none is available, not that none can exist. Froth imagery is operational plant data and plants do not publish it, so the only route on record towards a froth accuracy claim is a set annotated on purpose for this work, on the order of 50 to 100 frames from a single cell, with provenance and licence owned. Meanwhile the only accepted real lane is from an adjacent domain, real photographs of dense touching objects, and it is labelled as such in code and not only in prose: the source carries its domain field as adjacent and the release report partitions by that field, so only a froth source can lift the real-data requirement. Failing that, the release error still reads that no licensed, calibrated real froth held-out source has been accepted, and it will keep reading that no matter how much adjacent evidence accumulates.'}</p>

        {/* Sources for the settled data finding above, all outside the app bundle and recorded in
            CAOS_MANAGE: the 2026-07-28 candidate-by-candidate search with every licence checked at a
            primary source, including the three Zenodo dataset queries that return nothing, is
            wip/frothseg/real-data-source-search-2026-07-28.md; the independent 2026-07-31 research
            null ("no peer-reviewed, openly licensed, instance-mask-annotated flotation froth
            benchmark exists") is plans/frothseg/research-2026-07-31/SYNTHESIS.md section 7 item 13
            and blocker B-3; the settlement of BL-012 as a state of the world rather than an open
            task, decided 2026-08-01, is plans/frothseg/backlog.md BL-012 and plans/frothseg/status.md.
            In this repository, the Kaggle candidate's absent licence is recorded in
            manifests/source-registry.json under license_verification, and the blocking release error
            is data/derived/release-report.json. NOTE for whoever edits this next: settled means the
            search is closed, NOT that the constraint is lifted. Do not soften any sentence below. */}

        <p className="measure">{es
          ? 'Ese lane adyacente ya entregó el resultado más incómodo del repositorio, y está publicado en lugar de omitido. Corrido sin cambios, con los ajustes calibrados en espuma sintética intactos, sobre 64 imágenes reales retenidas, el ranking sintético no se transfiere: el líder interno del banco de espuma cae de AP 0.519 a 0.125, los seis modelos entrenados en el repositorio se degradan sin excepción (delta medio -0.243) y cinco de los siete métodos clásicos mejoran, con un delta medio clásico de +0.071. Los dos que no mejoran se nombran en vez de promediarse. El watershed por inmersión sin marcadores ya estaba en 0.017 sobre espuma y entrega 0.0 sobre las imágenes reales, un delta de -0.017, así que el nivel clásico gana como nivel mientras su miembro más débil no tiene nada que ganar. El segundo apareció al rehornear este carril el 2026-08-01, tras adoptar la superficie de inundación de C3: C3 cae de 0.297 a 0.216, porque inundar la intensidad negada supone un reflejo especular brillante por burbuja y un borde de Plateau oscuro entre burbujas, y un núcleo celular no tiene ninguno de los dos. Queda registrado, no reparado, porque ese cambio se adoptó sobre una fuente de espuma y se confirmó sobre una porción de reserva de espuma. C7, adoptado el mismo día, se mueve al revés y sube de 0.233 a 0.301. La lectura honesta es angosta y conviene decirla exacta: el ranking de espuma es en buena parte una propiedad del generador, y nada aquí demuestra todavía que algún método sea bueno en espuma real. Tampoco muestra lo contrario, que el modelo fundacional sea mejor en espuma: ese dataset es su dominio de preentrenamiento y juega de local, mientras los especialistas reciben otra modalidad con sus umbrales de espuma puestos. Lo que la prueba mide es robustez al cambio de dominio. Una evaluación posterior, prerregistrada, sobre un split real fresco y nunca observado de 72 muestras situó al mismo ensamble publicado en AP 0.045, materialmente por debajo del 0.125 medido en el split anterior de 64 imágenes, mientras su cifra sintética se replicó dentro de 0.005 en una reserva intacta: el desplome por cambio de dominio es más profundo de lo que sugería la primera medición, no menos.'
          : 'That adjacent lane has already produced the most uncomfortable result in the repository, and it is published rather than omitted. Run unchanged, with the settings calibrated on synthetic froth left intact, over 64 real held-out images, the synthetic ranking does not transfer: the internal froth-benchmark leader falls from AP 0.519 to 0.125, all six models trained in the repository degrade without exception (mean delta -0.243) and five of the seven classical methods improve, at a classical mean delta of +0.071. The two that do not are named rather than averaged away. The marker-less immersion watershed was already at 0.017 on froth and returns 0.0 on the real images, a delta of -0.017, so the classical tier gains as a tier while its weakest member has nothing to gain. The second appeared when this lane was re-baked on 2026-08-01 after the C3 flooding surface was adopted: C3 falls from 0.297 to 0.216, because flooding the negated intensity assumes a bright specular highlight per bubble and a dark Plateau border between bubbles, and a cell nucleus has neither. It is recorded, not repaired, because that change was adopted on a froth source and confirmed on a froth reserve slice. C7, adopted the same day, moves the other way and rises from 0.233 to 0.301. The honest reading is narrow and worth stating exactly: the froth ranking is substantially a property of the generator, and nothing here yet demonstrates that any method is good at real froth. Nor does it show the converse, that the foundation model is better on froth: that dataset is its pretraining domain and it is playing at home, while the specialists are handed a different modality with their froth thresholds intact. What the test measures is robustness to domain shift. A later pre-registered evaluation on a fresh, previously unobserved real split of 72 samples put the same published ensemble at AP 0.045, materially below the 0.125 measured on the earlier 64-image split, while its synthetic score replicated within 0.005 on an untouched reserve slice: the domain-shift collapse is deeper than the first measurement suggested, not shallower.'}{' '}<Cite id="stringer2021cellpose" paren /></p>

        {/* Sources for the transfer figures above, all in this repository:
            docs/benchmark/02_real-domain-transfer.md (the 64 real held-out images, N1 0.519 -> 0.125,
            classical mean delta +0.071 over 7 methods, in-repo trained mean delta -0.243 over 6) and
            the machine-readable data/derived/real-adjacent-benchmark.json it is written from. The
            AP 0.519 froth figure is also data/derived/method-benchmark.json current_bar.leader.mean_ap,
            which this page reads at runtime for the bar and the flag rather than restating the leader.
            The two counterexamples are those same two artifacts read row by row: real-adjacent
            mean_ap 0.0 for C2 gradient immersion watershed against method-benchmark
            test.mean_ap 0.017265625, a delta of -0.017; and real-adjacent mean_ap 0.21648438 for C3
            against method-benchmark test.mean_ap 0.2975, a delta of -0.081, which appeared when
            this lane was re-baked on 2026-08-01 after the C3 flooding-surface adoption
            (verification/phase1-adoption.json). C7 moves the other way, 0.23256250 to 0.30131250.
            NOTE for whoever edits this next: the universal "every classical method improves" was false
            for C2 and has been corrected everywhere it was published (2026-07-31, Phase 0 item 7), and
            the count moved again from six to five on 2026-08-01 when C3 joined C2:
            scripts/build_method_benchmark.py now writes "five of the seven classical methods improve"
            into current_bar.leader_note, data/derived/method-benchmark.json was regenerated from it,
            and README.md carries the same wording. Do not reintroduce the universal.
            The fresh-split sentence that closes the paragraph is the P-2 result, and its artifact is
            verification/p2-domain-randomization.json: surface_replication.real_axis.fresh_split_mean_ap
            is 0.04455555555555555 over surface_replication.real_axis.fresh_split_n 72, against
            surface_replication.real_axis.burned_split_mean_ap 0.12485937500000001 over 64, with the
            published no-augmentation ensemble, its weights and its post-processing thresholds held
            fixed so the only thing that changes is the split. results.A.synthetic_reserve_mean_ap is
            0.5226875 against the 0.51859375 reference, a difference of 0.00409375 recorded at
            verdict_detail.synthetic_clause.absolute_difference. The same file records why the fresh
            number is lower: fresh_mean_instances_truth 92.51 against fresh_mean_instances_predicted
            39.38, and fresh_samples_scoring_zero 20 of 72. Its verdict is "null". */}

        <p className="measure">{es
          ? 'Y hay un conjunto de cosas que este producto simplemente no afirma. No es un sistema de control de planta ni un estimador de recuperación metalúrgica, y ningún número publicado aquí es exactitud de planta: son evidencia algorítmica controlada, que sostiene afirmaciones sobre cómo se comparan los métodos bajo condiciones conocidas y reproducibles, y ninguna afirmación sobre exactitud en una celda de flotación real. Los tamaños quedan en píxeles sin calibración física. Las lecturas de estado de espuma son proxies basados en literatura, no setpoints calibrados de planta. La aceptación del producto permanece bloqueada hasta que un lane real de espuma, con licencia y calibrado, cumpla umbrales predeclarados, y un inventario de artefactos en verde no puede anular esa compuerta científica.'
          : 'And there is a set of things this product simply does not claim. It is not a plant-control system and not a metallurgical recovery estimator, and no number published here is plant accuracy: these are controlled algorithm evidence, which supports statements about how methods compare under known, reproducible conditions, and no statement about accuracy on a real flotation cell. Sizes stay in pixels without a physical calibration. Froth-state readouts are literature-based proxies, not calibrated plant setpoints. Product acceptance remains blocked until a licensed, calibrated real froth lane meets predeclared thresholds, and a green artifact inventory cannot override that scientific gate.'}{' '}<Cite id="aldrich2010" paren /></p>

        <Callout variant="honest" title={es ? 'Qué demuestra y qué no' : 'What this proves and what it does not'}>
          <p className="measure">{es
            ? 'Los resultados publicados corresponden a un banco sintético controlado con verdad exacta. Permiten comparar algoritmos y medir sus fallas, pero no representan exactitud en planta. Los datos industriales requieren anotación externa, calibración y validación por dominio. Sobre eso, la prueba de transferencia de 2026-07-28 muestra que el orden de mérito medido aquí es en buena parte específico del generador, así que ni siquiera la comparación entre métodos debe leerse como transferible a una cámara de planta sin volver a medirla. Un despliegue real exige validación en sitio, revisión de licencias, calibración, monitoreo y gobernanza de operadores.'
            : 'The published results belong to a controlled synthetic benchmark with exact truth. They support algorithm comparison and failure measurement, but they do not represent plant accuracy. Industrial data requires external annotation, calibration and domain-specific validation. On top of that, the 2026-07-28 transfer test shows the order of merit measured here is substantially generator-specific, so not even the comparison between methods should be read as transferable to a plant camera without measuring it again. A real deployment requires site-specific validation, licensing review, calibration, monitoring and operator governance.'}</p>
        </Callout>

        <Refs ids={['aldrich2010', 'stringer2021cellpose']} label={REFS} />
      </section>
    </div>
  );
}

/* ============================================================================
 * FIGURES. Every number inside these comes from data/derived/method-benchmark.json,
 * loaded at runtime; the drawn shapes (bubbles, seams, histogram bars) are schematic
 * and their captions say so. All text uses the shell's dg-* diagram classes, so the
 * figures follow light/dark and this page declares no typography of its own.
 * ========================================================================== */

const ARROW = (
  <marker id="fs-intro-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0 0 L10 5 L0 10 z" className="dg-arrowhead" />
  </marker>
);

/** Stage 1 of the page: what the sensor records, what the method must recover, what the process reads.
 *  The three figures on the right are the published benchmark's own coverage counters. */
function MeasurementChainFigure({ es, bench }: { es: boolean; bench: MethodBenchmarkDoc | null }) {
  const bestTestAp = bench
    ? bench.methods.reduce<number | null>((best, m) => {
      const ap = m.test?.mean_ap;
      return ap != null && (best == null || ap > best) ? ap : best;
    }, null)
    : null;
  // Drawn cells: a schematic Laguerre-like packing sized to fit a 174 x 150 panel interior,
  // not a rendered case.
  const cells: Array<[number, number, number]> = [
    [46, 54, 26], [104, 42, 21], [144, 66, 27], [36, 112, 23], [88, 108, 26], [140, 122, 21],
  ];
  return (
    <Figure caption={es
      ? 'Esquema de la cadena de medición: campo observado, mapa entero de instancias, distribución de diámetros. Las burbujas y las barras del histograma son formas dibujadas, ilustrativas, no un caso renderizado. Las tres cifras del panel derecho se leen del benchmark publicado; si el artefacto no carga, muestran guiones en lugar de un número inventado.'
      : 'Schematic of the measurement chain: observed field, integer instance map, diameter distribution. The bubbles and the histogram bars are drawn shapes, illustrative, not a rendered case. The three figures in the right-hand panel are read from the published benchmark; if the artifact does not load they show dashes instead of an invented number.'}>
      <svg viewBox="0 0 760 300" className="fig-svg wide" role="img"
        aria-label={es ? 'Cadena de medición de espuma en tres etapas' : 'Three-stage froth measurement chain'}>
        <defs>{ARROW}</defs>

        {/* stage 1, what the sensor records */}
        <g>
          <rect x="8" y="26" width="190" height="186" rx="10" className="dg-box" />
          <text x="8" y="18" className="dg-box-title">{es ? '1 · lo que registra el sensor' : '1 · what the sensor records'}</text>
          <g transform="translate(16 34)">
            {cells.map(([cx, cy, r]) => <circle key={`a${cx}-${cy}`} cx={cx} cy={cy} r={r} className="dg-box" />)}
            {cells.map(([cx, cy, r]) => <circle key={`h${cx}-${cy}`} cx={cx - r * 0.35} cy={cy - r * 0.35} r={r * 0.16} className="dg-fill-warn" />)}
          </g>
          <text x="8" y="234" className="dg-edge-label">{es ? 'cúpulas claras' : 'bright caps'}</text>
          <text x="8" y="252" className="dg-edge-label">{es ? 'costuras oscuras (Plateau)' : 'dark seams (Plateau borders)'}</text>
          <text x="8" y="272" className="dg-note">{es ? 'un reflejo por cúpula' : 'one specular highlight per cap'}</text>
        </g>

        {/* stage 1 to stage 2 */}
        <path d="M204 124 H274" className="dg-edge" markerEnd="url(#fs-intro-arrow)" />
        <text x="240" y="112" textAnchor="middle" className="dg-edge-label">{es ? 'partición' : 'partition'}</text>

        {/* stage 2, what the method must recover */}
        <g>
          <rect x="282" y="26" width="190" height="186" rx="10" className="dg-box" />
          <text x="282" y="18" className="dg-box-title">{es ? '2 · mapa de instancias' : '2 · integer instance map'}</text>
          <g transform="translate(290 34)">
            {cells.map(([cx, cy, r], i) => (
              <g key={`b${cx}-${cy}`}>
                <circle cx={cx} cy={cy} r={r} className="dg-node" />
                <text x={cx} y={cy + 4} textAnchor="middle" className="dg-node-label">{i + 1}</text>
              </g>
            ))}
            {/* a dimension line under one instance: the measurement the instance map makes possible */}
            <path d="M119 152 H161 M119 147 V157 M161 147 V157" className="dg-marker" />
            <text x="140" y="170" textAnchor="middle" className="dg-marker-label">d₆</text>
          </g>
          <text x="282" y="234" className="dg-edge-label">{es ? 'un índice por burbuja' : 'one index per bubble'}</text>
          <text x="282" y="252" className="dg-edge-label">{es ? 'área, perímetro, elongación' : 'area, perimeter, elongation'}</text>
          <text x="282" y="272" className="dg-note">{es ? 'lo que no retiene una binaria' : 'what a binary mask loses'}</text>
        </g>

        {/* stage 2 to stage 3 */}
        <path d="M478 124 H548" className="dg-edge" markerEnd="url(#fs-intro-arrow)" />
        <text x="514" y="112" textAnchor="middle" className="dg-edge-label">{es ? 'morfometría' : 'morphometry'}</text>

        {/* stage 3, what the process reads */}
        <g>
          <rect x="556" y="26" width="190" height="186" rx="10" className="dg-box" />
          <text x="556" y="18" className="dg-box-title">{es ? '3 · distribución y evidencia' : '3 · distribution and evidence'}</text>
          <g transform="translate(562 32)">
            <path d="M0 96 H168" className="dg-axis" />
            {[10, 26, 46, 62, 52, 34, 20, 12].map((h, i) => (
              <rect key={`bar${i}`} x={2 + i * 20} y={96 - h} width="14" height={h} className="dg-bar" />
            ))}
            <path d="M62 100 V16" className="dg-marker" />
            <text x="62" y="12" textAnchor="middle" className="dg-marker-label">D50</text>
            <text x="84" y="112" textAnchor="middle" className="dg-axis-label">{es ? 'diámetro equiv. (px)' : 'equivalent diameter (px)'}</text>
          </g>
          <g transform="translate(562 164)">
            <text x="0" y="0" className="dg-box-sub">{es ? 'métodos implementados' : 'implemented methods'}</text>
            <text x="172" y="0" textAnchor="end" className="dg-node-label">{bench ? int(bench.implemented_count) : DASH}</text>
            <text x="0" y="20" className="dg-box-sub">{es ? 'muestras de test' : 'untouched test samples'}</text>
            <text x="172" y="20" textAnchor="end" className="dg-node-label">{bench ? int(bench.coverage.expected_test_samples) : DASH}</text>
            <text x="0" y="40" className="dg-box-sub">{es ? 'mejor AP de test medido' : 'best measured test AP'}</text>
            <text x="172" y="40" textAnchor="end" className="dg-node-label">{num(bestTestAp)}</text>
          </g>
          <text x="556" y="234" className="dg-edge-label">D10 · D50 · D90 · d32</text>
          <text x="556" y="252" className="dg-edge-label">{es ? 'luego AP, PQ, F frontera, W1' : 'then AP, PQ, boundary F, W1'}</text>
          <text x="556" y="272" className="dg-note">{es ? 'del artefacto publicado' : 'from the published artifact'}</text>
        </g>
      </svg>
    </Figure>
  );
}

/** The two opposite error modes, with the measured counts that show a boundary score cannot see them.
 *  The two methods shown are SELECTED BY THE DATA (largest merge count, largest split count in the
 *  untouched-test micro accounting), so the figure cannot be accused of cherry-picking a method. */
function ErrorModeFigure({ es, bench }: { es: boolean; bench: MethodBenchmarkDoc | null }) {
  const worst = (key: 'merges' | 'splits'): MethodBenchmarkRow | null => {
    if (!bench) return null;
    return bench.methods.reduce<MethodBenchmarkRow | null>((acc, m) => {
      const value = m.test?.micro?.[key];
      if (value == null) return acc;
      const best = acc?.test?.micro?.[key];
      return best == null || value > best ? m : acc;
    }, null);
  };
  const merger = worst('merges');
  const splitter = worst('splits');
  const line = (row: MethodBenchmarkRow | null, key: 'merges' | 'splits'): string => {
    if (!row) return DASH;
    const micro = row.test?.micro;
    const value = micro ? micro[key] : null;
    return `${row.id} · ${int(value)}`;
  };
  const other = (row: MethodBenchmarkRow | null, key: 'merges' | 'splits'): string => {
    if (!row) return DASH;
    const micro = row.test?.micro;
    return int(micro ? micro[key] : null);
  };
  const bf = (row: MethodBenchmarkRow | null): string => num(row?.test?.mean_boundary_fscore ?? null, 3);

  return (
    <Figure caption={es
      ? 'Los dos modos de error opuestos y su contabilidad medida. Los círculos punteados son burbujas verdaderas y las regiones sombreadas son segmentos predichos: formas dibujadas, esquemáticas. Los conteos y los F-score de frontera se leen del benchmark publicado, y los dos métodos mostrados los elige el propio artefacto (mayor conteo de uniones y mayor conteo de divisiones sobre el test intocado), no una selección a mano.'
      : 'The two opposite error modes and their measured accounting. The dotted circles are true bubbles and the shaded regions are predicted segments: drawn, schematic shapes. The counts and boundary F-scores are read from the published benchmark, and the two methods shown are chosen by the artifact itself (largest merge count and largest split count over the untouched test), not hand-picked.'}>
      <svg viewBox="0 0 760 238" className="fig-svg wide" role="img"
        aria-label={es ? 'Uniones y divisiones frente al puntaje de frontera' : 'Merges and splits against the boundary score'}>

        {/* merge, under-segmentation */}
        <g>
          <rect x="10" y="26" width="360" height="174" rx="10" className="dg-box" />
          <text x="20" y="18" className="dg-box-title">{es ? 'unión · sub-segmentación' : 'merge · under-segmentation'}</text>
          <g transform="translate(26 44)">
            {/* One stadium-shaped predicted segment spanning two true circles. The two true bubbles
                are drawn r = 32 with centres 58 px apart, so they are separately visible and overlap
                only in the 27 px lens where their shared film sits; the seam marker is that exact
                chord (the circles cross at x = 65, y = 60 +/- 13.5), not a full-height divider. */}
            <path d="M36 28 H94 A32 32 0 0 1 94 92 H36 A32 32 0 0 1 36 28 Z" className="dg-fill-warn" />
            <circle cx="36" cy="60" r="32" className="dg-curve-faint" />
            <circle cx="94" cy="60" r="32" className="dg-curve-faint" />
            <path d="M65 46 V74" className="dg-marker" />
            <text x="65" y="112" textAnchor="middle" className="dg-marker-label">{es ? 'costura no detectada' : 'seam not detected'}</text>
          </g>
          <text x="180" y="66" className="dg-edge-label">{es ? '2 burbujas verdaderas' : '2 true bubbles'}</text>
          <text x="180" y="84" className="dg-edge-label">{es ? '1 segmento predicho' : '1 predicted segment'}</text>
          <text x="180" y="108" className="dg-note">{es ? 'la distribución se engruesa' : 'the distribution moves coarse'}</text>
          <text x="180" y="136" className="dg-box-sub">{es ? 'más uniones' : 'worst merges'}</text>
          <text x="360" y="136" textAnchor="end" className="dg-node-label">{line(merger, 'merges')}</text>
          <text x="180" y="160" className="dg-box-sub">{es ? 'sus divisiones' : 'its splits'}</text>
          <text x="360" y="160" textAnchor="end" className="dg-node-label">{other(merger, 'splits')}</text>
          <text x="180" y="184" className="dg-box-sub">{es ? 'su F de frontera' : 'its boundary F'}</text>
          <text x="360" y="184" textAnchor="end" className="dg-node-label">{bf(merger)}</text>
        </g>

        {/* split, over-segmentation */}
        <g>
          <rect x="390" y="26" width="360" height="174" rx="10" className="dg-box" />
          <text x="400" y="18" className="dg-box-title">{es ? 'división · sobre-segmentación' : 'split · over-segmentation'}</text>
          <g transform="translate(420 40)">
            <path d="M64 8 A52 52 0 0 0 64 112 Z" className="dg-fill-accent" />
            <path d="M64 8 A52 52 0 0 1 64 112 Z" className="dg-fill-warn" />
            <circle cx="64" cy="60" r="52" className="dg-curve-faint" />
            <circle cx="46" cy="42" r="7" className="dg-fill-warn" />
            <text x="64" y="128" textAnchor="middle" className="dg-marker-label">{es ? 'el reflejo interior' : 'the inner highlight'}</text>
            <text x="64" y="144" textAnchor="middle" className="dg-marker-label">{es ? 'siembra 2 cuencas' : 'seeds 2 basins'}</text>
          </g>
          <text x="560" y="66" className="dg-edge-label">{es ? '1 burbuja verdadera' : '1 true bubble'}</text>
          <text x="560" y="84" className="dg-edge-label">{es ? '2 segmentos predichos' : '2 predicted segments'}</text>
          <text x="560" y="108" className="dg-note">{es ? 'la distribución se afina' : 'the distribution moves fine'}</text>
          <text x="560" y="136" className="dg-box-sub">{es ? 'más divisiones' : 'worst splits'}</text>
          <text x="740" y="136" textAnchor="end" className="dg-node-label">{line(splitter, 'splits')}</text>
          <text x="560" y="160" className="dg-box-sub">{es ? 'sus uniones' : 'its merges'}</text>
          <text x="740" y="160" textAnchor="end" className="dg-node-label">{other(splitter, 'merges')}</text>
          <text x="560" y="184" className="dg-box-sub">{es ? 'su F de frontera' : 'its boundary F'}</text>
          <text x="740" y="184" textAnchor="end" className="dg-node-label">{bf(splitter)}</text>
        </g>

        <text x="380" y="224" textAnchor="middle" className="dg-note">
          {es
            ? 'el método de cada panel lo elige el artefacto: el mayor conteo de ese error sobre el test intocado'
            : 'the method in each panel is chosen by the artifact: the largest count of that error over the untouched test'}
        </text>
      </svg>
    </Figure>
  );
}

/** The offline-heavy chain and the two gates that make its numbers mean anything: group isolation
 *  before training, and one single evaluation on the untouched split. Counts read at runtime. */
function PipelineFigure({ es, bench }: { es: boolean; bench: MethodBenchmarkDoc | null }) {
  const cells = bench ? `${int(bench.coverage.observed_cells)} / ${int(bench.coverage.expected_cells)}` : DASH;
  const pairs = bench ? int(bench.method_count * bench.canonical_case_count) : DASH;
  return (
    <Figure caption={es
      ? 'La cadena offline y sus dos compuertas: aislamiento de grupos antes de entrenar y una sola evaluación sobre la partición intocada. Los conteos de métodos, condiciones, muestras de test y celdas observadas frente a esperadas se leen del benchmark publicado; el número de pares de replay es el producto de métodos por casos canónicos del mismo artefacto.'
      : 'The offline chain and its two gates: group isolation before training and one single evaluation on the untouched split. The counts of methods, conditions, test samples and observed against expected cells are read from the published benchmark; the replay-pair number is the product of methods and canonical cases from that same artifact.'}>
      <svg viewBox="0 0 760 336" className="fig-svg wide" role="img"
        aria-label={es ? 'Cadena offline del producto y sus compuertas' : 'The product offline chain and its gates'}>
        <defs>{ARROW}</defs>

        {/* Row 1: generator, split gate, ladder. The three columns are 200 / 200 / 176 wide with
            86 px gaps, sized so every edge label fits INSIDE the gap directly above its own arrow
            (dg-edge-label is 11px monospace, about 6.3 px per character). No label sits in the
            figure margin, and no arrow is left unlabelled. */}
        <g>
          <rect x="6" y="18" width="200" height="88" rx="10" className="dg-box" />
          <text x="20" y="44" className="dg-box-title">{es ? 'generador' : 'generator'}</text>
          <text x="20" y="64" className="dg-box-sub">{es ? 'diagrama de potencia' : 'Laguerre power diagram'}</text>
          <text x="20" y="82" className="dg-box-sub">{es ? 'familias de condición' : 'condition families'} {bench ? int(bench.coverage.condition_count) : DASH}</text>
          <text x="20" y="99" className="dg-note">{es ? 'función pura de (spec, semilla)' : 'pure function of (spec, seed)'}</text>
        </g>
        <path d="M212 62 H286" className="dg-edge" markerEnd="url(#fs-intro-arrow)" />
        <text x="249" y="42" textAnchor="middle" className="dg-edge-label">{es ? 'grupos' : 'latent'}</text>
        <text x="249" y="55" textAnchor="middle" className="dg-edge-label">{es ? 'latentes' : 'groups'}</text>
        <g>
          <rect x="292" y="18" width="200" height="88" rx="10" className="dg-box accent" />
          <text x="306" y="44" className="dg-box-title accent">{es ? 'compuerta 1 · particiones' : 'gate 1 · splits'}</text>
          {/* 192 latent geometry groups, 2 appearance variants per group (384 samples), and the
              192 train / 64 validation / 64 calibration / 64 untouched-test split: README.md
              section "Data and compute pipeline" + docs/architecture/01_overview.md section
              "Data separation". The test count in the same line is read at runtime from
              data/derived/method-benchmark.json coverage.expected_test_samples. */}
          <text x="306" y="64" className="dg-box-sub">{es ? '192 grupos · 2 variantes' : '192 groups · 2 variants'}</text>
          <text x="306" y="82" className="dg-box-sub">192 / 64 / 64 / {bench ? int(bench.coverage.expected_test_samples) : DASH}</text>
          <text x="306" y="99" className="dg-note">{es ? 'un grupo, una sola partición' : 'one group, exactly one split'}</text>
        </g>
        <path d="M498 62 H572" className="dg-edge" markerEnd="url(#fs-intro-arrow)" />
        <text x="535" y="55" textAnchor="middle" className="dg-edge-label">{es ? 'entrenar' : 'train'}</text>
        <g>
          <rect x="578" y="18" width="176" height="88" rx="10" className="dg-box" />
          <text x="592" y="44" className="dg-box-title">{es ? 'escalera' : 'ladder'}</text>
          <text x="592" y="64" className="dg-box-sub">{bench ? int(bench.method_count) : DASH} {es ? 'métodos' : 'methods'}</text>
          <text x="592" y="82" className="dg-box-sub">C1-C7 · L1-L7 · N1</text>
          <text x="592" y="99" className="dg-note">{es ? 'clásico a fundacional' : 'classical to foundation'}</text>
        </g>

        {/* row 1 to row 2: the label ends 12 px to the left of the vertical arrow it annotates */}
        <path d="M666 112 V156" className="dg-edge" markerEnd="url(#fs-intro-arrow)" />
        <text x="654" y="138" textAnchor="end" className="dg-edge-label">{es ? 'calibrar solo en calibración' : 'calibrate on the calibration split only'}</text>

        {/* row 2: test gate, diagnostic bake, static web */}
        <g>
          <rect x="578" y="162" width="176" height="88" rx="10" className="dg-box accent" />
          <text x="592" y="188" className="dg-box-title accent">{es ? 'compuerta 2 · test' : 'gate 2 · test'}</text>
          <text x="592" y="208" className="dg-box-sub">{es ? 'celdas' : 'cells'} {cells}</text>
          <text x="592" y="226" className="dg-box-sub">{es ? 'sin celdas ausentes' : 'no missing cells'}</text>
          <text x="592" y="243" className="dg-note">{es ? 'se evalúa una sola vez' : 'evaluated exactly once'}</text>
        </g>
        <path d="M572 206 H498" className="dg-edge" markerEnd="url(#fs-intro-arrow)" />
        <text x="535" y="198" textAnchor="middle" className="dg-edge-label">{es ? 'hornear' : 'bake'}</text>
        <g>
          <rect x="292" y="162" width="200" height="88" rx="10" className="dg-box" />
          <text x="306" y="188" className="dg-box-title">{es ? 'diagnóstico y replay' : 'diagnostic and replay'}</text>
          <text x="306" y="208" className="dg-box-sub">{bench ? int(bench.canonical_case_count) : DASH} {es ? 'casos canónicos' : 'canonical cases'}</text>
          <text x="306" y="226" className="dg-box-sub">{pairs} {es ? 'pares método-caso' : 'method-case pairs'}</text>
          <text x="306" y="243" className="dg-note">{es ? 'suite legible, no el test' : 'readable suite, not the test'}</text>
        </g>
        <path d="M286 206 H212" className="dg-edge" markerEnd="url(#fs-intro-arrow)" />
        <text x="249" y="186" textAnchor="middle" className="dg-edge-label">{es ? 'evidencia' : 'compact'}</text>
        <text x="249" y="199" textAnchor="middle" className="dg-edge-label">{es ? 'compacta' : 'evidence'}</text>
        <g>
          <rect x="6" y="162" width="200" height="88" rx="10" className="dg-box" />
          <text x="20" y="188" className="dg-box-title">{es ? 'web estática' : 'static web'}</text>
          <text x="20" y="208" className="dg-box-sub">{es ? 'artefactos comprometidos' : 'committed artifacts only'}</text>
          <text x="20" y="226" className="dg-box-sub">{es ? '3 gemelos + lane SlimSAM' : '3 twins + SlimSAM lane'}</text>
          <text x="20" y="243" className="dg-note">{es ? 'las subidas quedan en el cliente' : 'uploads stay on the client'}</text>
        </g>

        <text x="380" y="296" textAnchor="middle" className="dg-note">
          {es
            ? 'Nada de entrenamiento ni de benchmark completo en el navegador: requieren'
            : 'No training and no full benchmark in the browser: they need Python vision'}
        </text>
        <text x="380" y="312" textAnchor="middle" className="dg-note">
          {es
            ? 'visión en Python, runtimes de investigación, checkpoints grandes y CUDA.'
            : 'libraries, research runtimes, large checkpoints and CUDA.'}
        </text>
        <text x="380" y="330" textAnchor="middle" className="dg-note">
          {es
            ? 'La aceptación sigue bloqueada hasta que exista un lane real de espuma con licencia.'
            : 'Acceptance stays blocked until a licensed, calibrated real froth lane exists.'}
        </text>
      </svg>
    </Figure>
  );
}

/** Precomputed temporal replay: real committed artifacts (source frame + exact ground-truth overlay),
 *  five sequences of eight frames, no compute during the visit. */
function TemporalShowcase({ es }: { es: boolean }) {
  const [manifest, setManifest] = useState<TemporalShowcaseManifest | null>(null);
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => { loadTemporalShowcase().then(setManifest).catch(() => setManifest(null)); }, []);

  const sequence = manifest?.sequences[sequenceIndex] ?? null;
  const frames = sequence?.frames ?? [];
  useEffect(() => {
    if (!playing || frames.length < 2) return undefined;
    const timer = window.setInterval(() => setFrameIndex((value) => (value + 1) % frames.length), 420);
    return () => window.clearInterval(timer);
  }, [playing, frames.length]);

  useEffect(() => setFrameIndex(0), [sequenceIndex]);
  const frame = frames[frameIndex];
  const frameLabel = useMemo(
    () => `${String(frameIndex + 1).padStart(2, '0')} / ${String(frames.length).padStart(2, '0')}`,
    [frameIndex, frames.length],
  );

  if (!manifest || !sequence || !frame) {
    return (
      <div className="fs-temporal-loading">
        <ScanSearch aria-hidden="true" />
        <div>
          <strong>{es ? 'Preparando la reproducción temporal' : 'Preparing temporal replay'}</strong>
          <span>{es ? 'Los artefactos verificados se cargarán desde el paquete offline.' : 'Verified artifacts will load from the offline package.'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fs-temporal-showcase">
      <div className="fs-temporal-stage">
        <img src={artifactUrl(frame.source_path)} alt={es ? `Cuadro ${frameIndex + 1} de ${sequence.label}` : `Frame ${frameIndex + 1} of ${sequence.label}`} />
        {frame.overlay_path ? <img className="fs-temporal-overlay" src={artifactUrl(frame.overlay_path)} alt="" aria-hidden="true" /> : null}
        <div className="fs-temporal-divider" aria-hidden="true" />
        <span className="fs-temporal-side raw">{es ? 'Cuadro' : 'Frame'}</span>
        <span className="fs-temporal-side labels">{es ? 'Instancias exactas' : 'Exact instances'}</span>
        <div className="fs-temporal-stamp"><span>{sequence.label}</span><strong>{frameLabel}</strong></div>
      </div>
      <div className="fs-temporal-controls">
        <button type="button" className="fs-play-button" onClick={() => setPlaying((value) => !value)}
          aria-label={playing ? (es ? 'Pausar' : 'Pause') : (es ? 'Reproducir' : 'Play')}>
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <input type="range" min={0} max={frames.length - 1} value={frameIndex}
          onChange={(event) => { setPlaying(false); setFrameIndex(Number(event.target.value)); }}
          aria-label={es ? 'Cuadro de secuencia' : 'Sequence frame'} />
        <select value={sequenceIndex} onChange={(event) => setSequenceIndex(Number(event.target.value))}
          aria-label={es ? 'Secuencia' : 'Sequence'}>
          {manifest.sequences.map((item, index) => <option key={item.case_id} value={index}>{item.label}</option>)}
        </select>
      </div>
      {/* Every counter here is a field of showcase/temporal/manifest.json, read at runtime. */}
      <div className="fs-temporal-context">
        <div>
          <strong>{int(manifest.sequence_count)} × {int(manifest.frames_per_sequence)}</strong>
          <span>{es ? 'secuencias × cuadros' : 'sequences × frames'}</span>
        </div>
        <div>
          <strong>{int(manifest.prediction_frame_count)}</strong>
          <span>{es ? 'cuadros de predicción publicados' : 'published prediction frames'}</span>
        </div>
        <div>
          <strong>{int(manifest.prediction_sequence_count)}</strong>
          <span>{es ? 'pares método-secuencia' : 'method-sequence pairs'}</span>
        </div>
      </div>
      <p className="fs-hint">
        {es
          ? 'Secuencia sintética controlada con referencia de instancia exacta. La superposición coloreada muestra la verdad temporal, no una predicción ni video de planta; el repositorio no contiene video y ningún módulo decodifica video.'
          : 'Controlled synthetic sequence with exact instance reference. The coloured overlay shows temporal ground truth, not a prediction and not plant video; the repository contains no video and no module decodes video.'}
      </p>
    </div>
  );
}
