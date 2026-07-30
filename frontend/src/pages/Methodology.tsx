import { Callout, Cite, Equation, Figure, InlineMath, Refs, SubTabs, Tabs, useShellLang } from '@fasl-work/caos-app-shell';

const refsLabel = 'Refs';

export default function Methodology() {
  const es = useShellLang() === 'es';

  // ============================================================
  // 1a. THE COMMON INSTANCE CONTRACT
  // ============================================================
  const contractTab = (
    <div className="prose">
      <p className="measure">{es
        ? 'Quince métodos no producen la misma cosa. Un umbral global entrega una máscara binaria etiquetada por componentes conexas. Una inundación de watershed entrega cuencas sin puntuación. Un agrupamiento de superpíxeles entrega una partición de textura. Una red densa entrega tres o cuatro campos de probabilidad por píxel. StarDist entrega un polígono estrellado por objeto candidato. Un detector entrega una caja con una máscara y una confianza. Un generador automático de máscaras entrega una lista de máscaras solapadas con su IoU predicho. Un propagador de video entrega la misma cohorte de identidades cuadro tras cuadro. Ninguna de esas salidas es comparable con otra en su forma nativa, y cualquier ranking construido sobre ellas mide el formato tanto como el método.'
        : 'Fifteen methods do not produce the same thing. A global threshold yields a binary mask labelled by connected components. A watershed flood yields unscored basins. A superpixel grouping yields a texture partition. A dense network yields three or four per-pixel probability fields. StarDist yields one star-convex polygon per candidate object. A detector yields a box with a mask and a confidence. An automatic mask generator yields a list of overlapping masks with their predicted IoU. A video propagator yields the same cohort of identities frame after frame. None of those outputs is comparable with another in its native form, and any ranking built over them measures the format as much as it measures the method.'}</p>

      <p className="measure">{es
        ? 'La respuesta de este repositorio es un contrato de salida único y estrecho. Todo método emite un mapa entero de la misma forma que el cuadro de entrada: 0 es fondo y 1 hasta N son identidades de instancia, sin solapamiento y sin huecos dentro de una instancia. El adaptador de cada método hace la conversión y nada se fuerza a pasar por un watershed que ya produce máscaras o polígonos: las máscaras del generador automático se pintan en un mapa disjunto en orden de IoU predicho ascendente, con el área como desempate, de modo que la de mayor IoU predicho se pinta al final y se queda con el píxel disputado, y los polígonos de StarDist y las máscaras del detector se rasterizan directamente. Las puntuaciones por instancia se conservan cuando existen, porque son lo único que permite calibrar una probabilidad; los métodos que no puntúan sus regiones quedan registrados con la razón, nunca con un valor inventado.'
        : 'This repository answers with a single narrow output contract. Every method emits an integer map of the same shape as the input frame: 0 is background and 1 through N are instance identities, without overlap and without holes inside an instance. Each method adapter performs the conversion, and nothing is forced through a watershed that already produces masks or polygons: automatic-generator masks are painted into a disjoint map in ascending predicted-IoU order with area as the tiebreak, so the mask with the highest predicted IoU is painted last and wins the contested pixel, while StarDist polygons and detector masks are rasterised directly. Per-instance scores are preserved where they exist, because they are the only thing that lets a probability be calibrated; methods that do not score their regions are recorded with that rationale rather than given a fabricated value.'}{' '}<Cite id="lin2014coco" paren /></p>

      <Equation
        tex={String.raw`\hat Y:\Omega\to\{0,1,\dots,N\},\qquad \hat Y^{-1}(k)\cap \hat Y^{-1}(l)=\emptyset\ \ \forall\,k\neq l,\qquad \mathrm{IoU}(A,B)=\frac{|A\cap B|}{|A\cup B|}`}
        caption={es
          ? 'El contrato de instancias: Ω es la retícula de píxeles, Ŷ el mapa entero emitido, k y l identidades distintas, N el número de instancias halladas. Toda métrica se calcula sobre este objeto y sobre la IoU entre sus regiones.'
          : 'The instance contract: Ω is the pixel lattice, Ŷ the emitted integer map, k and l distinct identities, N the number of instances found. Every metric is computed on this object and on the IoU between its regions.'}
      />

      <p className="measure">{es
        ? 'El contrato solo sirve si existe una verdad exacta contra la cual medirlo, y no existe un conjunto público de máscaras por burbuja con licencia abierta: verificado el 2026-07-28 contra las fuentes primarias, el candidato de Kaggle no declara licencia, el conjunto de IEEE DataPort está tras un muro de pago, el de Roboflow es CC-BY-NC-SA y Zenodo no devuelve ningún conjunto de segmentación de espuma. La espuma de flotación es dato operacional de planta y las plantas no lo publican. La verdad exacta se construye entonces por generación: la geometría es un diagrama de potencia (Laguerre), la teselación estándar de espuma seca, con centros empacados por adsorción secuencial aleatoria y radios log-normales elegidos para que la media de Sauter objetivo se cumpla. Las etiquetas de celda SON las etiquetas del renderizador, así que el error de anotación es cero por construcción.'
        : 'The contract is only useful if there is an exact truth to measure it against, and no openly licensed public set of per-bubble froth masks exists: verified on 2026-07-28 against primary sources, the Kaggle candidate declares no licence, the IEEE DataPort set is paywalled, the Roboflow set is CC-BY-NC-SA and Zenodo returns no froth segmentation dataset. Flotation froth is operational plant data and plants do not publish it. Exact truth is therefore constructed by generation: the geometry is a power (Laguerre) diagram, the standard dry-foam tessellation, with centres packed by random sequential adsorption and log-normal radii chosen so the target Sauter mean is met. The cell labels ARE the renderer labels, so annotation error is zero by construction.'}{' '}<Cite id="weaire1999foams" paren /> <Cite id="aurenhammer1987" paren /></p>
      {/* licence audit: docs/benchmark/02_real-domain-transfer.md lines 13-16 */}

      <Equation
        tex={String.raw`\mathrm{cell}(p)=\arg\min_i\left(\lVert p-c_i\rVert^2-r_i^2\right),\qquad \mu=\ln d_{32}-2.5\,\sigma_{\ln}^2`}
        caption={es
          ? 'Izquierda: cada píxel p se asigna al sitio de mínima distancia de potencia, con centro c_i y radio r_i; los bordes curvos que aparecen entre celdas son los bordes de Plateau. Derecha: la media log-normal μ que fija la media de Sauter d32 para una dispersión σ_ln dada.'
          : 'Left: each pixel p is assigned to the site of minimum power distance, with centre c_i and radius r_i; the curved edges that appear between cells are the Plateau borders. Right: the log-normal mean μ that fixes the Sauter mean d32 for a given spread σ_ln.'}
      />
      {/* Laguerre assignment + log-normal mu: data-pipeline/fslab/science/froth_gen.py lines 50-96 */}

      <p className="measure">{es
        ? 'La apariencia es una capa separada de la geometría, y esa separación es el mecanismo que impide la fuga de datos. Sobre un gris base de 0.62 menos 0.18 por la carga, el renderizador oscurece hacia el borde de Plateau con un término exp(-D/(1.6+3·watery)) donde D es la transformada de distancia euclidiana EXACTA al borde de celda más cercano, agrega un reflejo especular por burbuja de sigma 0.22·r desplazado 0.35·r desde el centro, y aplica el estresor del caso: brillo, desenfoque de movimiento por convolución con un núcleo de línea, desenfoque óptico gaussiano y ruido de sensor. El reflejo se jitterea con desviación highlight_jitter·r y se omite con probabilidad 0.12·highlight_jitter, deliberadamente, para que un método sembrado en reflejos no pueda ganar de forma artificial. Como la geometría se muestrea una vez y la apariencia dos, cada grupo geométrico latente aparece con dos apariencias distintas y la unidad de partición es la geometría, no la imagen.'
        : 'Appearance is a layer separate from geometry, and that separation is the mechanism that prevents leakage. On a base grey of 0.62 minus 0.18 times the load, the renderer darkens toward the Plateau border with a term exp(-D/(1.6+3·watery)) where D is the EXACT Euclidean distance transform to the nearest cell edge, adds one specular highlight per bubble of sigma 0.22·r offset 0.35·r from the centre, and applies the case stressor: glare, motion blur by convolution with a line kernel, Gaussian optical defocus and sensor noise. The highlight is jittered with standard deviation highlight_jitter·r and dropped with probability 0.12·highlight_jitter, deliberately, so that a highlight-seeded method cannot win artificially. Because geometry is sampled once and appearance twice, each latent geometry group appears with two distinct appearances and the split unit is the geometry, not the image.'}</p>
      {/* render terms + highlight jitter/drop: data-pipeline/fslab/science/froth_gen.py lines 99-135 */}

      <Figure caption={es
        ? 'Entrada común, salidas nativas distintas, un solo mapa entero: el adaptador de cada familia y el evaluador único que consume 960 celdas método-muestra.'
        : 'One common input, different native outputs, a single integer map: each family adapter and the one evaluator that consumes 960 method-sample cells.'}>
        <svg viewBox="0 0 760 300" className="fig-svg wide" role="img" aria-labelledby="ctrTitle ctrDesc">
          <title id="ctrTitle">{es ? 'Diagrama de fan-in del contrato de instancias' : 'Instance-contract fan-in diagram'}</title>
          <desc id="ctrDesc">{es
            ? 'Cuatro tipos de salida nativa (cuencas y componentes, campos densos por píxel, polígonos y cajas, máscaras puntuadas) convergen mediante adaptadores en un mapa entero de instancias, que un evaluador único consume para producir 960 celdas.'
            : 'Four native output kinds (basins and components, dense per-pixel fields, polygons and boxes, scored masks) converge through adapters into one integer instance map, which a single evaluator consumes to produce 960 cells.'}</desc>
          <defs>
            <marker id="ctrArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0L10 5L0 10z" className="dg-arrowhead" />
            </marker>
          </defs>

          {([
            [0, es ? 'C1 a C7' : 'C1 to C7', es ? 'cuencas, componentes' : 'basins, components', es ? 'etiquetar' : 'label'],
            [1, es ? 'L1 a L3, N1' : 'L1 to L3, N1', es ? 'campos densos F,B,D,C' : 'dense fields F,B,D,C', es ? 'umbral + inundar' : 'threshold + flood'],
            [2, 'L4, L6', es ? 'polígonos, cajas' : 'polygons, boxes', es ? 'rasterizar' : 'rasterise'],
            [3, 'L5, L7', es ? 'máscaras puntuadas' : 'scored masks', es ? 'pintar disjunto' : 'paint disjoint'],
          ] as Array<[number, string, string, string]>).map(([row, id, native, adapter]) => (
            <g key={id}>
              <rect x="8" y={20 + row * 66} width="176" height="48" rx="8" className="dg-box" />
              <text x="20" y={40 + row * 66} className="dg-box-title">{id}</text>
              <text x="20" y={57 + row * 66} className="dg-box-sub">{native}</text>
              <path d={`M184 ${44 + row * 66} H300 V140 H312`} className="dg-edge" fill="none" markerEnd="url(#ctrArrow)" />
              <text x="190" y={36 + row * 66} className="dg-edge-label">{adapter}</text>
            </g>
          ))}

          <rect x="316" y="104" width="164" height="72" rx="8" className="dg-box accent" />
          <text x="330" y="126" className="dg-box-title accent">{es ? 'mapa entero' : 'integer map'}</text>
          <text x="330" y="144" className="dg-box-sub">0 = {es ? 'fondo' : 'background'}</text>
          <text x="330" y="161" className="dg-box-sub">1..N = {es ? 'identidades' : 'identities'}</text>

          <path d="M480 140 H556" className="dg-edge" markerEnd="url(#ctrArrow)" />
          <text x="486" y="132" className="dg-edge-label">IoU</text>

          <rect x="560" y="90" width="192" height="100" rx="8" className="dg-box good" />
          <text x="574" y="112" className="dg-box-title">{es ? 'un evaluador' : 'one evaluator'}</text>
          <text x="574" y="132" className="dg-box-sub">AP, PQ, SQ, RQ</text>
          <text x="574" y="149" className="dg-box-sub">{es ? 'frontera F, W1' : 'boundary F, W1'}</text>
          <text x="574" y="166" className="dg-box-sub">{es ? '15 x 64 = 960 celdas' : '15 x 64 = 960 cells'}</text>
          <text x="574" y="183" className="dg-box-sub">{es ? '960 observadas' : '960 observed'}</text>

          <text x="8" y="290" className="dg-note">{es
            ? 'ningún adaptador reescribe la decisión del método; solo traduce su formato de salida'
            : 'no adapter rewrites the decision of a method; it only translates its output format'}</text>
        </svg>
      </Figure>
      {/* 960 expected and observed cells, complete: frontend/public/data/method-benchmark.json coverage block */}

      <p className="measure">{es
        ? 'Sobre esa base, la partición es por grupo y nunca por imagen. El conjunto tiene 384 muestras y 192 grupos geométricos latentes: 192 muestras y 96 grupos en entrenamiento, 64 y 32 en validación, 64 y 32 en calibración, y 64 y 32 en la prueba retenida, con 16 condiciones cruzadas en todo el diseño. Todas las apariencias de una geometría comparten destino, así que dos vistas de la misma espuma no pueden quedar una en entrenamiento y otra en prueba. Los pesos se eligen por AP de validación; los umbrales de postproceso se eligen en calibración, sobre una sola realización de apariencia por grupo para que vistas duplicadas no dominen la selección; y la prueba se lee una vez, por evaluación. La unidad de partición generaliza a datos reales: la clave más fuerte disponible (fuente, video, sitio, campaña o grupo geométrico), no el archivo.'
        : 'On that basis the split is by group and never by image. The set has 384 samples and 192 latent geometry groups: 192 samples and 96 groups in training, 64 and 32 in validation, 64 and 32 in calibration, and 64 and 32 in the held-out test, with 16 conditions crossed through the whole design. All appearances of one geometry share a destination, so two views of the same froth cannot land one in training and the other in test. Weights are chosen by validation AP; post-processing thresholds are chosen on calibration, over a single appearance realisation per group so duplicate views cannot dominate selection; and the test is read once, by evaluation. The split unit generalises to real data: the strongest available key (source, video, site, campaign or geometry group), not the file.'}</p>
      {/* 384 samples, 192 groups, 96/32/32/32 group counts: verification/n1-preregistered-ablation.json dataset block */}
      {/* calibration over one appearance per group: data-pipeline/fslab/learning/train_multitask.py lines 140-145 */}

      <Equation
        tex={String.raw`\mathcal D=\mathcal D_{\text{train}}\,\dot\cup\,\mathcal D_{\text{val}}\,\dot\cup\,\mathcal D_{\text{cal}}\,\dot\cup\,\mathcal D_{\text{test}},\qquad g_i=g_j\Rightarrow s_i=s_j`}
        caption={es
          ? 'Partición disjunta y regla de grupo: g es el grupo geométrico latente de una muestra y s su split, de modo que dos muestras del mismo grupo caen siempre en el mismo split.'
          : 'Disjoint partition and group rule: g is the latent geometry group of a sample and s its split, so two samples of the same group always fall in the same split.'}
      />

      <Figure caption={es
        ? 'La geometría se muestrea una vez y se renderiza dos veces; el grupo, no la imagen, es lo que se reparte. Muestras y grupos por split, y qué decisión consume cada uno.'
        : 'Geometry is sampled once and rendered twice; the group, not the image, is what gets distributed. Samples and groups per split, and which decision consumes each.'}>
        <svg viewBox="0 0 760 268" className="fig-svg wide" role="img" aria-labelledby="splTitle splDesc">
          <title id="splTitle">{es ? 'Diagrama de partición por grupo geométrico' : 'Geometry-group split diagram'}</title>
          <desc id="splDesc">{es
            ? 'Un grupo geométrico latente produce dos apariencias que viajan juntas a un único split. Los cuatro splits llevan 192, 64, 64 y 64 muestras sobre 96, 32, 32 y 32 grupos, y cada uno alimenta una decisión distinta: pesos, checkpoint, umbrales y una sola medición.'
            : 'One latent geometry group produces two appearances that travel together to a single split. The four splits carry 192, 64, 64 and 64 samples over 96, 32, 32 and 32 groups, and each feeds a different decision: weights, checkpoint, thresholds and one single measurement.'}</desc>
          <defs>
            <marker id="splArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0L10 5L0 10z" className="dg-arrowhead" />
            </marker>
          </defs>

          <rect x="8" y="70" width="150" height="94" rx="8" className="dg-box" />
          <text x="20" y="92" className="dg-box-title">{es ? 'grupo latente' : 'latent group'}</text>
          <text x="20" y="110" className="dg-box-sub">{es ? 'geometría' : 'geometry'} g</text>
          <circle cx="46" cy="138" r="16" className="dg-node" />
          <circle cx="86" cy="138" r="16" className="dg-node" />
          <text x="112" y="142" className="dg-box-sub">x2</text>

          <path d="M158 117 H264" className="dg-edge" markerEnd="url(#splArrow)" />
          <text x="162" y="107" className="dg-edge-label">{es ? '2 apariencias' : '2 appearances'}</text>
          <text x="162" y="136" className="dg-note">{es ? 'un solo split' : 'one split only'}</text>

          {([
            ['train', '192', '96', es ? 'pesos' : 'weights', 12],
            ['validation', '64', '32', es ? 'checkpoint' : 'checkpoint', 74],
            ['calibration', '64', '32', es ? 'umbrales' : 'thresholds', 136],
            ['test', '64', '32', es ? 'una medición' : 'one measurement', 198],
          ] as Array<[string, string, string, string, number]>).map(([name, samples, groups, use, y]) => (
            <g key={name}>
              <rect x="268" y={y} width="202" height="50" rx="8" className={name === 'test' ? 'dg-box accent' : 'dg-box'} />
              <text x="282" y={y + 22} className={name === 'test' ? 'dg-box-title accent' : 'dg-box-title'}>{name}</text>
              <text x="282" y={y + 40} className="dg-box-sub">{samples} {es ? 'muestras' : 'samples'} · {groups} {es ? 'grupos' : 'groups'}</text>
              <path d={`M470 ${y + 25} H556`} className="dg-edge" markerEnd="url(#splArrow)" />
              <text x="562" y={y + 29} className="dg-edge-label">{use}</text>
            </g>
          ))}

          <text x="8" y="34" className="dg-box-title">384 {es ? 'muestras' : 'samples'} · 192 {es ? 'grupos' : 'groups'} · 16 {es ? 'condiciones' : 'conditions'}</text>
          <text x="8" y="52" className="dg-note">{es ? 'ninguna geometría cruza una división' : 'no geometry crosses a split'}</text>
          <text x="268" y="264" className="dg-note">{es
            ? 'la flecha de decisión nunca vuelve desde test'
            : 'the decision arrow never returns from test'}</text>
        </svg>
      </Figure>

      <p className="measure">{es
        ? 'La escala física no se estima nunca desde la imagen. Un registro lleva mm_per_px positivo solo cuando existe una calibración trazable; si falta, toda la morfometría queda en píxeles y la unidad viaja junto al número. La validación de importación rechaza licencias desconocidas, claves de agrupación ausentes, dimensiones inválidas, anotaciones vacías y registros que requieren escala sin traerla. Esa regla es la que impide que un diámetro en milímetros aparezca a partir de una suposición, que es la forma más fácil de convertir una medición correcta en una cifra falsa.'
        : 'Physical scale is never estimated from the image. A record carries a positive mm_per_px only when a traceable calibration exists; when it is missing, all morphometry stays in pixels and the unit travels with the number. Import validation rejects unknown licences, missing grouping keys, invalid dimensions, empty annotations, and records that require scale without carrying it. That rule is what stops a diameter in millimetres from appearing out of an assumption, which is the easiest way to turn a correct measurement into a false figure.'}{' '}<Cite id="aldrich2010" paren /></p>

      <Callout variant="honest" title={es ? 'Qué compra el contrato y qué no' : 'What the contract buys and what it does not'}>
        <p>{es
          ? 'El contrato compra comparabilidad y reproducibilidad dentro de un banco controlado: las 960 celdas de prueba existen, ninguna se descarta en silencio, y la comparación no depende de que dos métodos usen la misma regla de decisión. No compra exactitud industrial. Todas las cifras del banco publicado provienen del generador sintético; ninguna fuente real de espuma con licencia ha sido aceptada en el carril puntuado, y el informe de liberación lleva esa ausencia como un error bloqueante, no como una nota al pie. Un inventario de artefactos en verde no puede anular esa compuerta.'
          : 'The contract buys comparability and reproducibility inside a controlled benchmark: all 960 test cells exist, none is silently dropped, and the comparison does not depend on two methods sharing a decision rule. It does not buy industrial accuracy. Every number in the published benchmark comes from the synthetic generator; no licensed real froth source has been accepted into the scored lane, and the release report carries that absence as a blocking error rather than a footnote. A green artifact inventory cannot override that gate.'}</p>
      </Callout>

      <Refs ids={['lin2014coco', 'weaire1999foams', 'aurenhammer1987', 'aldrich2010']} label={refsLabel} />
    </div>
  );

  // ============================================================
  // 1b. WHAT THE NUMBERS MEAN
  // ============================================================
  const metricsTab = (
    <div className="prose">
      <p className="measure">{es
        ? 'La cifra principal se llama AP y no es la AP de COCO. La AP de COCO ordena detecciones por confianza e integra precisión sobre exhaustividad; aquí la mayoría de los métodos no produce confianza alguna, porque un watershed no puntúa sus regiones, de modo que el evaluador usa la definición estándar en segmentación de instancias celular, la que reportan Cellpose y StarDist: en cada umbral, la razón entre verdaderos positivos y la suma de verdaderos positivos, falsos positivos y falsos negativos. Predicciones y verdad se emparejan de forma codiciosa por IoU descendente, uno a uno, y un par cuenta como verdadero positivo cuando supera el umbral. Solo el barrido de umbrales es de estilo COCO. La consecuencia hay que decirla en voz alta: estos números no son comparables con una tabla de posiciones de COCO, y un artículo que reporte AP de COCO sobre espuma está midiendo otra cosa.'
        : 'The headline figure is called AP and it is not COCO AP. COCO AP ranks detections by confidence and integrates precision over recall; here most methods produce no confidence at all, because a watershed does not score its regions, so the evaluator uses the definition standard in cell instance segmentation, the one Cellpose and StarDist report: at each threshold, the ratio of true positives to the sum of true positives, false positives and false negatives. Predictions and truth are matched greedily by descending IoU, one to one, and a pair counts as a true positive when it exceeds the threshold. Only the threshold sweep is COCO-style. The consequence has to be said out loud: these numbers are not comparable with a COCO leaderboard, and a paper reporting COCO AP on froth is measuring something else.'}{' '}<Cite id="lin2014coco" paren /> <Cite id="stringer2021cellpose" paren /></p>

      <Equation
        tex={String.raw`\mathrm{AP}(\tau)=\frac{TP(\tau)}{TP(\tau)+FP(\tau)+FN(\tau)},\qquad \mathrm{AP}=\frac1{10}\sum_{\tau\in\{0.50,0.55,\dots,0.95\}}\mathrm{AP}(\tau)`}
        caption={es
          ? 'τ es el umbral de IoU; TP, FP y FN son instancias emparejadas, sobrantes y faltantes. Es el índice de Jaccard del emparejamiento, acotado por 1, que castiga falsos positivos y falsos negativos por igual.'
          : 'τ is the IoU threshold; TP, FP and FN are matched, spare and missing instances. It is the Jaccard index of the matching, bounded by 1, penalising false positives and false negatives equally.'}
      />

      <p className="measure">{es
        ? 'Un detalle de implementación merece estar aquí porque decide si el banco es ejecutable. La tabla de solapes no se construye instancia por instancia: es un conteo de contingencia vectorizado de orden píxeles más etiquetas al cuadrado, en lugar de etiquetas al cuadrado por píxeles. Eso es lo que permite puntuar una predicción de 71918 instancias, que es exactamente lo que produce el watershed de inmersión sin marcadores sobre 64 muestras con 17846 instancias verdaderas. Un evaluador ingenuo no habría podido medir el piso del banco, y un banco sin piso no puede mostrar cuánto cuesta el piso.'
        : 'One implementation detail belongs here because it decides whether the benchmark is runnable at all. The overlap table is not built instance by instance: it is a vectorised contingency count of order pixels plus labels squared, rather than labels squared times pixels. That is what makes it possible to score a prediction of 71918 instances, which is exactly what marker-less immersion watershed produces over 64 samples holding 17846 true instances. A naive evaluator could not have measured the floor of the benchmark, and a benchmark without a floor cannot show what the floor costs.'}</p>
      {/* 71918 predicted vs 17846 truth instances: frontend/public/data/method-benchmark.json C2 test.micro */}

      <p className="measure">{es
        ? 'La AP sola no distingue las dos formas en que la espuma se rompe, así que junto a ella el evaluador publica calidad panóptica descompuesta. PQ es el producto de SQ por RQ, con emparejamiento único a IoU estrictamente mayor que 0.5, el umbral donde el emparejamiento se vuelve único. SQ responde a la pregunta de qué tan bien se delineó una burbuja cuando se la encontró; RQ responde si se encontró el número correcto de burbujas. Separarlas importa porque las dos fallas tienen causas y arreglos distintos. Junto a PQ se conservan los dos modos de error propios de la espuma, con un umbral de cobertura de 0.2: una SEPARACIÓN es una burbuja verdadera cubierta por más de una predicción, la falla del watershed sembrado en reflejos; una UNIÓN es una predicción que cubre más de una burbuja verdadera, la falla del umbral global.'
        : 'AP alone does not distinguish the two ways froth breaks, so beside it the evaluator publishes decomposed panoptic quality. PQ is SQ times RQ, with unique matching at IoU strictly greater than 0.5, the threshold at which the matching becomes unique. SQ answers how well a bubble was outlined once it was found; RQ answers whether the right number of bubbles was found. Splitting them matters because the two failures have different causes and different fixes. Alongside PQ the evaluator retains the two error modes specific to froth, at a coverage threshold of 0.2: a SPLIT is one true bubble covered by more than one prediction, the watershed-on-highlights failure; a MERGE is one prediction covering more than one true bubble, the global-threshold failure.'}</p>

      <Equation
        tex={String.raw`\mathrm{PQ}=\underbrace{\frac{\sum_{(p,g)\in TP}\mathrm{IoU}(p,g)}{|TP|}}_{\mathrm{SQ}}\times\underbrace{\frac{|TP|}{|TP|+\tfrac12|FP|+\tfrac12|FN|}}_{\mathrm{RQ}}`}
        caption={es
          ? 'p es un segmento predicho, g uno verdadero; SQ es la IoU media sobre los pares emparejados y RQ la tasa de reconocimiento. Un método puede tener SQ alta y RQ baja: dibuja bien las pocas burbujas que encuentra.'
          : 'p is a predicted segment, g a true one; SQ is the mean IoU over matched pairs and RQ the recognition rate. A method can hold high SQ with low RQ: it outlines well the few bubbles it finds.'}
      />

      <Figure caption={es
        ? 'Los dos modos de error a cobertura mayor que 0.2, con los conteos micro reales sobre las 64 muestras retenidas: el piso de inmersión separa, el umbral global une, y los dos líderes hacen ambas cosas mucho menos.'
        : 'The two error modes at coverage above 0.2, with the real micro counts over the 64 held-out samples: the immersion floor splits, the global threshold merges, and the two leaders do far less of both.'}>
        <svg viewBox="0 0 760 300" className="fig-svg wide" role="img" aria-labelledby="pqTitle pqDesc">
          <title id="pqTitle">{es ? 'Descomposición de uniones y separaciones' : 'Merge and split decomposition'}</title>
          <desc id="pqDesc">{es
            ? 'Arriba, dos esquemas: una predicción que cubre dos burbujas verdaderas es una unión; dos predicciones sobre una burbuja verdadera son una separación. Abajo, los conteos micro reales de cuatro métodos.'
            : 'Above, two schematics: one prediction covering two true bubbles is a merge; two predictions over one true bubble is a split. Below, the real micro counts of four methods.'}</desc>

          <text x="8" y="22" className="dg-box-title">{es ? 'UNIÓN (sub-segmentación)' : 'MERGE (under-segmentation)'}</text>
          <g transform="translate(20,34)">
            <ellipse cx="70" cy="46" rx="70" ry="40" className="dg-fill-warn" />
            <circle cx="42" cy="46" r="28" className="dg-curve-faint" />
            <circle cx="100" cy="46" r="24" className="dg-curve-faint" />
            <text x="150" y="36" className="dg-box-sub">{es ? '2 verdaderas' : '2 true'}</text>
            <text x="150" y="54" className="dg-box-sub">{es ? '1 predicha' : '1 predicted'}</text>
            <text x="150" y="72" className="dg-note">{es ? 'tamaño sesgado al alza' : 'size biased upward'}</text>
          </g>

          <text x="392" y="22" className="dg-box-title">{es ? 'SEPARACIÓN (sobre-segmentación)' : 'SPLIT (over-segmentation)'}</text>
          <g transform="translate(404,34)">
            <path d="M70 8A38 38 0 0 0 70 84Z" className="dg-fill-accent" />
            <path d="M70 8A38 38 0 0 1 70 84Z" className="dg-fill-warn" />
            <circle cx="70" cy="46" r="38" className="dg-curve-faint" />
            <text x="150" y="36" className="dg-box-sub">{es ? '1 verdadera' : '1 true'}</text>
            <text x="150" y="54" className="dg-box-sub">{es ? '2 predichas' : '2 predicted'}</text>
            <text x="150" y="72" className="dg-note">{es ? 'tamaño sesgado a la baja' : 'size biased downward'}</text>
          </g>

          <line x1="120" y1="266" x2="740" y2="266" className="dg-axis" />
          <text x="8" y="270" className="dg-axis-label">{es ? 'conteo micro' : 'micro count'}</text>
          <rect x="8" y="142" width="14" height="9" className="dg-bar" />
          <text x="28" y="150" className="dg-box-sub">{es ? 'uniones' : 'merges'}</text>
          <rect x="8" y="160" width="14" height="9" className="dg-bar-2" />
          <text x="28" y="168" className="dg-box-sub">{es ? 'separaciones' : 'splits'}</text>

          {([
            ['C2', 2024, 5507, 150],
            ['C1', 1250, 16, 300],
            ['L5', 1690, 513, 450],
            ['N1', 2250, 539, 600],
          ] as Array<[string, number, number, number]>).map(([id, merges, splits, x]) => (
            <g key={id}>
              <rect x={x} y={266 - merges / 40} width="42" height={merges / 40} className="dg-bar" />
              <rect x={x + 48} y={266 - splits / 40} width="42" height={splits / 40} className="dg-bar-2" />
              <text x={x + 44} y="284" className="dg-bar-label" textAnchor="middle">{id}</text>
              <text x={x + 21} y={260 - merges / 40} className="dg-tick" textAnchor="middle">{merges}</text>
              <text x={x + 69} y={260 - splits / 40} className="dg-tick" textAnchor="middle">{splits}</text>
            </g>
          ))}
        </svg>
      </Figure>
      {/* micro merges/splits per method: frontend/public/data/method-benchmark.json test.micro */}

      <p className="measure">{es
        ? 'Los descriptores físicos convierten instancias en algo que un metalurgista puede leer. El área A de cada instancia da un diámetro equivalente, el del círculo de igual área; del conjunto de diámetros el evaluador reporta los percentiles D10, D50 y D90 y la media de Sauter, el diámetro medio ponderado por superficie, que es el resumen estándar de distribución de tamaño de burbuja en flotación porque el área interfacial por unidad de volumen escala con él. Comparar solo D50 oculta el error de forma, así que las distribuciones completas se comparan con la distancia de Wasserstein de orden 1 entre las funciones de distribución acumulada, en las mismas unidades físicas que los diámetros: es la masa que hay que mover para convertir la distribución predicha en la verdadera.'
        : 'Physical descriptors turn instances into something a metallurgist can read. The area A of each instance gives an equivalent diameter, that of the circle of equal area; from the diameter set the evaluator reports the D10, D50 and D90 percentiles and the Sauter mean, the surface-area-weighted mean diameter, which is the standard bubble-size-distribution summary in flotation because interfacial area per unit volume scales with it. Comparing D50 alone hides shape error, so full distributions are compared with the 1-Wasserstein distance between the cumulative distribution functions, in the same physical units as the diameters: it is the mass that must be moved to turn the predicted distribution into the true one.'}{' '}<Cite id="sautermean" paren /> <Cite id="aldrich2010" paren /> <Cite id="villani2009ot" paren /></p>

      <Equation
        tex={String.raw`d_{\mathrm{eq}}=2\sqrt{A/\pi},\qquad d_{32}=\frac{\sum_i d_i^3}{\sum_i d_i^2},\qquad W_1(P,Q)=\int\bigl|F_P(x)-F_Q(x)\bigr|\,dx`}
        caption={es
          ? 'A es el área de la instancia en píxeles, d_i su diámetro equivalente, d32 la media de Sauter, y F_P y F_Q las acumuladas predicha y verdadera de diámetro. W1 vale 0 cuando las dos distribuciones coinciden.'
          : 'A is the instance area in pixels, d_i its equivalent diameter, d32 the Sauter mean, and F_P and F_Q the predicted and true diameter CDFs. W1 is 0 when the two distributions coincide.'}
      />

      <p className="measure">{es
        ? 'Leer la matriz por Wasserstein cambia el orden y por eso se publica junto a la AP. Sobre las 64 muestras retenidas, W1 en píxeles de diámetro vale 0.583 para Cellpose-SAM, 0.872 para LamellaStar, 1.464 para el detector, 1.616 para la U-Net de frontera, 2.590 para el watershed de distancia, 3.564 para el trazador de lamelas, 10.164 para el umbral global, 16.568 para el watershed de h-mínima y 27.150 para las máscaras automáticas de SAM 2.1. El caso que hay que leer es el watershed de h-mínima: duplica en AP al umbral global (0.1330 contra 0.0652) y empeora su distribución de tamaño (16.568 contra 10.164), y queda 6.4 veces peor en distribución que el watershed de distancia estando solo 0.065 de AP por detrás. Suprimir cuencas someras elimina exactamente la cola de burbujas pequeñas. Un método puede tener una AP respetable y ser inútil para un sensor blando de tamaño si sus errores se concentran en un modo.'
        : 'Reading the matrix through Wasserstein changes the order, which is why it is published beside AP. Over the 64 held-out samples, W1 in diameter pixels is 0.583 for Cellpose-SAM, 0.872 for LamellaStar, 1.464 for the detector, 1.616 for the boundary U-Net, 2.590 for the distance watershed, 3.564 for the lamella tracer, 10.164 for the global threshold, 16.568 for the h-minima watershed and 27.150 for the SAM 2.1 automatic masks. The case to read is the h-minima watershed: it doubles the AP of the global threshold (0.1330 against 0.0652) while making its size distribution worse (16.568 against 10.164), and it sits 6.4 times worse on the distribution than the distance watershed while being only 0.065 AP behind it. Suppressing shallow basins removes exactly the small-bubble tail. A method can hold a respectable AP and be useless as a size soft sensor if its errors concentrate in one mode.'}</p>
      {/* mean_bsd_wasserstein and mean_ap per method: frontend/public/data/method-benchmark.json test block */}

      <p className="measure">{es
        ? 'La frontera y la calibración cierran el contrato de métricas. La F de frontera es la media armónica de precisión y exhaustividad sobre píxeles de borde dentro de una tolerancia declarada, con la prueba simétrica de distancia por transformada euclidiana y una tolerancia por defecto de 2.0 píxeles; la tolerancia se reporta siempre junto al valor, porque una F de frontera sin su tolerancia no es interpretable. La calibración solo se reporta para métodos que exponen probabilidades: el puntaje de Brier, que es una regla de puntuación propia y por lo tanto no puede mejorarse informando mal la confianza, y el error de calibración esperado sobre diez cajas de ancho igual, que responde una pregunta distinta, si un 0.9 declarado significa realmente 0.9. En la prueba retenida, el ensamble publicado de LamellaStar registra Brier 0.0102 y ECE 0.0074; el checkpoint único del segundo estudio preregistrado, que el tercer estudio dejó atrás, registró 0.0125 y 0.0088, y esa cifra pertenece a ese estudio y no al método publicado.'
        : 'Boundary agreement and calibration close the metric contract. Boundary F is the harmonic mean of precision and recall over boundary pixels within a declared tolerance, with the symmetric distance-transform test and a default tolerance of 2.0 pixels; the tolerance is always reported beside the value, because a boundary F without its tolerance is not interpretable. Calibration is reported only for methods that expose probabilities: the Brier score, which is a proper scoring rule and therefore cannot be improved by misreporting confidence, and the expected calibration error over ten equal-width bins, which answers a different question, whether a stated 0.9 really means 0.9. On the held-out test the published LamellaStar ensemble records Brier 0.0102 and ECE 0.0074; the single checkpoint of the second preregistered study, which the third study superseded, recorded 0.0125 and 0.0088, and that pair belongs to that study and not to the published method.'}{' '}<Cite id="brier1950" paren /></p>
      {/* published Brier 0.010241281 and ECE 0.007423547: frontend/public/data/method-benchmark.json methods[14].test (mean_brier, mean_ece) */}
      {/* superseded study-2 checkpoint 0.0125 and 0.0088: verification/n1-preregistered-ablation.json studies[1].untouched_test */}

      <Equation
        tex={String.raw`\mathrm{Brier}=\frac1N\sum_i\left(p_i-y_i\right)^2,\qquad \mathrm{ECE}=\sum_{b=1}^{10}\frac{|b|}{N}\bigl|\mathrm{acc}(b)-\mathrm{conf}(b)\bigr|`}
        caption={es
          ? 'p_i es la probabilidad declarada, y_i el resultado binario observado, b una caja de confianza y |b| su recuento. Brier mide exactitud probabilística; ECE mide la brecha entre confianza y acierto.'
          : 'p_i is the stated probability, y_i the observed binary outcome, b a confidence bin and |b| its count. Brier measures probabilistic accuracy; ECE measures the gap between confidence and correctness.'}
      />

      <p className="measure">{es
        ? 'Las reglas de agregación son propiedades del evaluador, no convenciones que el lector deba suponer. No hay descartes silenciosos: una celda método-caso que no produce resultado es un error, no una fila ausente, y la compuerta de liberación falla cuando falta cualquier celda requerida. Los recuentos viajan con los agregados: toda media lleva el número de muestras del que salió. El control vacío tiene cero instancias verdaderas, así que su AP es indefinida por construcción y queda excluida del ranking en lugar de puntuarse como cero o como perfecta. Las 16 condiciones se reportan separadas, porque una media sobre condiciones esconde exactamente la falla que le importa a un operador. Y los protocolos no se mezclan nunca: las métricas de identidad por cuadro y las de propagación con prompt miden cosas distintas y no se promedian ni se ordenan juntas. Junto a las métricas viaja el cómputo: carril de hardware, dispositivo, latencia media y percentil 95, memoria pico y bytes y SHA-256 del artefacto de modelo.'
        : 'The aggregation rules are properties of the evaluator, not conventions a reader has to assume. There are no silent drops: a method-case cell that fails to produce a result is an error, not a missing row, and the release gate fails when any required cell is absent. Counts travel with aggregates: every mean carries the sample count it came from. The empty control has zero true instances, so its AP is undefined by construction and is excluded from the ranking rather than scored as zero or as perfect. The 16 conditions are reported separately, because a mean over conditions hides exactly the failure an operator cares about. And protocols are never mixed: framewise identity metrics and prompted-propagation identity metrics measure different things and are neither averaged nor ranked together. Compute travels with the metrics: hardware lane, device, mean and 95th-percentile latency, peak memory, and the byte size and SHA-256 of the model artifact.'}</p>

      <Callout variant="honest" title={es ? 'La compuerta AP 0.30 y lo que no significa' : 'The AP 0.30 gate and what it does not mean'}>
        <p>{es
          ? 'El umbral de comparación predeclarado es AP 0.30 en la prueba retenida sintética. Cinco métodos lo superan (LamellaStar 0.5186, Cellpose-SAM 0.5099, la U-Net de frontera 0.4153, el watershed de marcador profundo 0.3247 y el segmentador de contexto global 0.3190) y el detector queda justo debajo en 0.2930. Es una compuerta interna de un banco controlado, no una norma industrial: no implica preparación para planta ni superioridad fuera de este dominio. La aceptación de producto sigue bloqueada hasta que un carril real de espuma, con licencia y calibrado, cumpla umbrales predeclarados.'
          : 'The predeclared comparison threshold is AP 0.30 on the synthetic held-out test. Five methods clear it (LamellaStar 0.5186, Cellpose-SAM 0.5099, the boundary U-Net 0.4153, the deep-marker watershed 0.3247 and the global-context segmenter 0.3190) and the detector sits just below at 0.2930. It is an internal gate of a controlled benchmark, not an industrial standard: it implies neither plant readiness nor superiority outside this domain. Product acceptance stays blocked until a licensed, calibrated real froth lane meets predeclared thresholds.'}</p>
      </Callout>
      {/* current_bar threshold 0.3 and per-method mean_ap: frontend/public/data/method-benchmark.json */}

      <Refs ids={['lin2014coco', 'stringer2021cellpose', 'aldrich2010', 'sautermean', 'villani2009ot', 'brier1950']} label={refsLabel} />
    </div>
  );

  // ============================================================
  // 2a. C1, C2: THRESHOLD AND MARKER-LESS IMMERSION
  // ============================================================
  const thresholdTab = (
    <div className="prose">
      <p className="measure">{es
        ? 'La espuma es difícil por una razón concreta y geométrica: la frontera entre dos burbujas es un valle oscuro de gradiente bajo, el borde de Plateau donde se juntan las películas, mientras que cada burbuja lleva en su interior un reflejo especular brillante de gradiente alto. Los dos indicios apuntan en direcciones opuestas. Un método que busque intensidad alta encuentra los interiores fusionados; un método que busque gradiente alto encuentra los anillos de reflejo y no las costuras. Las dos primeras entradas de la escalera clásica prueban justamente esas dos hipótesis, y las dos fallan de forma opuesta y medible.'
        : 'Froth is hard for a concrete, geometric reason: the boundary between two bubbles is a dark low-gradient valley, the Plateau border where the films meet, while each bubble carries a bright high-gradient specular highlight in its interior. The two cues point in opposite directions. A method that looks for high intensity finds fused interiors; a method that looks for high gradient finds the highlight rings and not the seams. The first two entries of the classical ladder test exactly those two hypotheses, and the two of them fail in opposite, measurable ways.'}{' '}<Cite id="wang2003froth" paren /> <Cite id="aldrich2010" paren /></p>

      <p className="measure">{es
        ? 'C1 es umbral global mas componentes conexas, la hipótesis más débil posible: que el nivel de gris separa interior de fondo. El umbral se calcula maximizando la varianza entre clases del histograma y luego se aplica multiplicado por 0.75, un factor específico de espuma que admite el ala más oscura de una tapa para no erosionarla; se rellenan huecos de hasta 16 píxeles, se eliminan objetos de menos de 12, y el resultado se etiqueta por conectividad. No hay ningún razonamiento de frontera en ninguna parte del método. Por eso cada región brillante conexa es UNA instancia: donde el oscurecimiento del borde es somero, dos tapas vecinas permanecen unidas y se cuentan como una burbuja. En la escena canónica polidispersa devuelve 33 instancias para 197 burbujas verdaderas, con 20 uniones y ninguna separación.'
        : 'C1 is a global threshold plus connected components, the weakest possible hypothesis: that grey level separates interior from background. The threshold is computed by maximising the between-class variance of the histogram and is then applied multiplied by 0.75, a froth-specific factor that admits the darker rim of a cap so it is not eroded; holes up to 16 pixels are filled, objects below 12 pixels are removed, and the result is labelled by connectivity. There is no boundary reasoning anywhere in the method. So every connected bright region is ONE instance: wherever the border darkening is shallow, two neighbouring caps stay joined and are counted as a single bubble. On the canonical polydisperse scene it returns 33 instances for 197 true bubbles, with 20 merges and no splits.'}</p>
      {/* Otsu factor 0.75, hole 16, object 12: data-pipeline/fslab/science/segment.py lines 27-32, 77-81 */}
      {/* 33 predictions for 197 truth, 20 merges, 0 splits: docs/methods/classical.md line 37 */}

      <Equation
        tex={String.raw`t^\star=\arg\max_t\ \omega_0(t)\,\omega_1(t)\bigl[\mu_0(t)-\mu_1(t)\bigr]^2,\qquad \Omega=\bigl\{x:\ I(x)>0.75\,t^\star\bigr\}`}
        caption={es
          ? 'Umbral por varianza entre clases: ω_0 y ω_1 son las masas de las dos clases del histograma y μ_0, μ_1 sus medias. El dominio de espuma Ω usa 0.75 t* para no recortar el ala oscura de cada tapa.'
          : 'Between-class-variance threshold: ω_0 and ω_1 are the two histogram class masses and μ_0, μ_1 their means. The froth domain Ω uses 0.75 t* so the dark rim of each cap is not clipped.'}
      />

      <p className="measure">{es
        ? 'En las 64 muestras retenidas C1 obtiene AP 0.0652, AP50 0.1576 y PQ 0.1706, con la descomposición que delata el mecanismo: SQ 0.6892 contra RQ 0.2444. Delinea decentemente lo que encuentra y encuentra el número equivocado de objetos. La precisión de frontera es 0.9422 y la exhaustividad de frontera 0.7352, que es la firma exacta de un método que dibuja pocas fronteras y las dibuja en el lugar correcto. Los conteos micro cierran el argumento: 3922 instancias predichas contra 17846 verdaderas, 1250 uniones y solo 16 separaciones, con una distancia de Wasserstein de 10.164 píxeles de diámetro. Es el ejemplar de sub-segmentación de la escalera, y cuesta 3.4 milisegundos por muestra con 1.2 MiB de memoria pico.'
        : 'On the 64 held-out samples C1 scores AP 0.0652, AP50 0.1576 and PQ 0.1706, with the decomposition that gives the mechanism away: SQ 0.6892 against RQ 0.2444. It outlines decently what it finds and finds the wrong number of objects. Boundary precision is 0.9422 and boundary recall 0.7352, which is the exact signature of a method that draws few boundaries and draws them in the right place. The micro counts close the argument: 3922 predicted instances against 17846 true ones, 1250 merges and only 16 splits, with a Wasserstein distance of 10.164 diameter pixels. It is the under-segmentation exhibit of the ladder, and it costs 3.4 milliseconds per sample with 1.2 MiB of peak memory.'}</p>
      {/* all C1 held-out values: frontend/public/data/method-benchmark.json methods[0].test and .compute */}

      <p className="measure">{es
        ? 'C2 prueba la hipótesis opuesta: que el gradiente crudo ya contiene las cuencas correctas. Se calcula el gradiente morfológico por rango sobre un disco de radio 1, se toman los máximos locales del gradiente negado con distancia mínima 2 dentro del dominio de espuma, y se inunda el gradiente desde esos marcadores. Como todo mínimo regional del gradiente es una semilla, cada reflejo especular y cada hundimiento de textura se convierte en su propia cuenca. En la escena canónica polidispersa produce 8246 cuencas para 197 burbujas, con AP y PQ exactamente 0.000. En la prueba retenida su AP es 0.0173 con 71918 instancias predichas contra 17846 verdaderas y 5507 separaciones, y tarda 80.8 milisegundos por muestra, veinticuatro veces más que C1 por el volumen de etiquetas que arrastra.'
        : 'C2 tests the opposite hypothesis: that the raw gradient already contains the right basins. The morphological rank gradient is computed over a radius-1 disk, the local maxima of the negated gradient are taken with a minimum distance of 2 inside the froth domain, and the gradient is flooded from those markers. Because every regional minimum of the gradient is a seed, each specular highlight and every texture dip becomes its own basin. On the canonical polydisperse scene it produces 8246 basins for 197 bubbles, with AP and PQ of exactly 0.000. On the held-out test its AP is 0.0173 with 71918 predicted instances against 17846 true ones and 5507 splits, and it takes 80.8 milliseconds per sample, twenty-four times C1, because of the label volume it carries.'}{' '}<Cite id="vincent1991" paren /></p>
      {/* disk(1) rank gradient, min_distance=2: data-pipeline/fslab/science/segment.py lines 84-101 */}
      {/* 8246 basins for 197 bubbles: docs/methods/classical.md line 38 */}

      <Equation
        tex={String.raw`T_f(p,q)=\min_{\gamma\in[p\rightsquigarrow q]}\int_\gamma\lVert\nabla f\rVert\,d\ell,\qquad \hat Y(x)=\arg\min_{m\in M}T_f\bigl(x,m\bigr)`}
        caption={es
          ? 'Distancia topográfica de Meyer: f es la superficie de elevación inundada, γ un camino entre píxeles y M el conjunto de marcadores. Cada píxel se asigna al marcador de mínima distancia topográfica; con M igual a todos los mínimos regionales, el número de cuencas es el número de mínimos.'
          : 'Meyer topographic distance: f is the flooded elevation surface, γ a path between pixels and M the marker set. Each pixel is assigned to the marker of minimum topographic distance; with M equal to every regional minimum, the basin count is the minimum count.'}
      />

      <Figure caption={es
        ? 'Un perfil de intensidad a través de dos burbujas en contacto, con las constantes reales del renderizador y de los dos métodos. En t* la costura cortaría; en 0.75 t* no corta, y las dos tapas quedan como una sola componente conexa. A la derecha, todo mínimo del gradiente es una cuenca.'
        : 'An intensity profile across two touching bubbles, with the real constants of the renderer and of both methods. At t* the seam would cut; at 0.75 t* it does not, and the two caps stay one connected component. On the right, every gradient minimum is a basin.'}>
        <svg viewBox="0 0 760 300" className="fig-svg wide" role="img" aria-labelledby="thrTitle thrDesc">
          <title id="thrTitle">{es ? 'Perfil de intensidad, umbral global y cuencas de gradiente' : 'Intensity profile, global threshold and gradient basins'}</title>
          <desc id="thrDesc">{es
            ? 'La curva superior es la intensidad a lo largo de una línea que cruza dos burbujas: dos picos de reflejo especular y un valle de borde de Plateau entre ellos. Las líneas horizontales marcan el umbral de varianza entre clases y el mismo umbral multiplicado por 0.75. Abajo se marcan los mínimos del gradiente que C2 convierte en semillas.'
            : 'The upper curve is intensity along a line crossing two bubbles: two specular highlight peaks and a Plateau-border valley between them. The horizontal lines mark the between-class-variance threshold and the same threshold times 0.75. Below, the gradient minima that C2 turns into seeds are marked.'}</desc>

          <text x="8" y="18" className="dg-box-title">{es ? 'intensidad I(x) sobre la línea' : 'intensity I(x) along the line'}</text>
          <line x1="70" y1="150" x2="470" y2="150" className="dg-axis" />
          <line x1="70" y1="34" x2="70" y2="150" className="dg-axis" />
          <text x="16" y="40" className="dg-tick">1.0</text>
          <text x="16" y="154" className="dg-tick">0.0</text>

          <path d="M74 132 C96 132 100 52 122 52 C144 52 150 106 172 106 H318 C340 106 346 54 368 54 C390 54 396 132 418 132 C440 132 452 132 466 132" className="dg-curve" />

          <line x1="70" y1="98" x2="470" y2="98" className="dg-asymptote" />
          <text x="474" y="102" className="dg-marker-label">t*</text>
          <line x1="70" y1="122" x2="470" y2="122" className="dg-marker" />
          <text x="474" y="126" className="dg-marker-label">0.75 t*</text>

          <line x1="245" y1="108" x2="245" y2="132" className="dg-grid" />
          <text x="245" y="144" className="dg-note" textAnchor="middle">{es ? 'valle de Plateau' : 'Plateau valley'}</text>
          <text x="122" y="44" className="dg-note" textAnchor="middle">{es ? 'reflejo' : 'highlight'}</text>
          <text x="368" y="46" className="dg-note" textAnchor="middle">{es ? 'reflejo' : 'highlight'}</text>
          <text x="74" y="164" className="dg-marker-label">{es ? 't* cortaría la costura; 0.75 t* no' : 't* would cut the seam; 0.75 t* does not'}</text>

          <text x="8" y="180" className="dg-box-sub">{es ? 'oscurecimiento del borde' : 'border darkening'}</text>
          <text x="8" y="197" className="dg-box-sub">0.32 (1 - 0.6 w) exp(-D / (1.6 + 3 w))</text>
          <text x="8" y="220" className="dg-box-sub">{es ? 'reflejo por burbuja' : 'per-bubble highlight'}</text>
          <text x="8" y="237" className="dg-box-sub">σ = 0.22 r</text>

          <text x="240" y="180" className="dg-box-title">{es ? 'C1: sobre 0.75 t*, etiquetar conexo' : 'C1: above 0.75 t*, label connected'}</text>
          <text x="240" y="199" className="dg-box-sub">{es ? '33 instancias para 197 verdaderas' : '33 instances for 197 true'}</text>
          <text x="240" y="216" className="dg-box-sub">{es ? '20 uniones · 0 separaciones' : '20 merges · 0 splits'}</text>
          <text x="240" y="240" className="dg-box-title">{es ? 'C2: toda cuenca del gradiente' : 'C2: every gradient basin'}</text>
          <text x="240" y="259" className="dg-box-sub">{es ? '8246 cuencas para 197 verdaderas' : '8246 basins for 197 true'}</text>
          <text x="240" y="276" className="dg-box-sub">AP 0.000 · PQ 0.000</text>

          <line x1="540" y1="150" x2="740" y2="150" className="dg-axis" />
          <text x="540" y="18" className="dg-box-title">{es ? 'gradiente morfológico' : 'morphological gradient'}</text>
          <path d="M544 148 C554 148 558 60 566 60 C574 60 578 146 588 146 C596 146 600 92 608 92 C616 92 620 148 630 148 C638 148 642 74 650 74 C658 74 662 148 672 148 C680 148 684 100 692 100 C700 100 704 148 736 148" className="dg-curve-2" />
          {[588, 630, 672].map((x) => (
            <line key={x} x1={x} y1="132" x2={x} y2="160" className="dg-marker" />
          ))}
          <text x="540" y="176" className="dg-note">{es ? 'mínimo local, distancia mínima 2 px' : 'local minimum, min distance 2 px'}</text>
          <text x="540" y="196" className="dg-note">{es ? 'una semilla por hundimiento' : 'one seed per dip'}</text>
        </svg>
      </Figure>

      <p className="measure">{es
        ? 'Los dos ejemplares no están en la escalera para ser candidatos: acotan el espacio de error. C1 y C2 son los extremos opuestos del mismo eje, unión contra separación, y son los que calibran la lectura de la descomposición de PQ para todos los demás. También sirven a un segundo propósito, medido después: en la prueba de transferencia a fotografías reales de objetos densos en contacto, con los mismos ajustes fijados en espuma sintética, C1 sube de 0.065 a 0.339 mientras C2 se queda en 0.000. C1 no mejoró; el problema es más fácil. Ese contraste es la mejor advertencia disponible contra leer cualquier número absoluto de este banco como transferible a una celda de flotación.'
        : 'Neither exhibit is in the ladder to be a candidate: they bound the error space. C1 and C2 are the opposite ends of one axis, merge against split, and they are what calibrates the reading of the PQ decomposition for everything else. They also serve a second purpose, measured later: in the transfer test on real photographs of dense touching objects, with the same settings fitted on synthetic froth, C1 rises from 0.065 to 0.339 while C2 stays at 0.000. C1 did not get better; the problem is easier. That contrast is the best available warning against reading any absolute number from this benchmark as transferable to a flotation cell.'}</p>
      {/* real-domain transfer C1 0.339 vs froth 0.065, C2 0.000: docs/benchmark/02_real-domain-transfer.md lines 83, 95 */}

      <Callout variant="honest" title={es ? 'El piso es un piso' : 'The floor is a floor'}>
        <p>{es
          ? 'AP 0.0173 es el piso real del banco, y se conserva por eso: un banco sin piso no puede mostrar cuánto cuesta el piso. Ninguna de las dos hipótesis es una propuesta de herramienta. Tampoco la subida de C1 en datos reales adyacentes es evidencia de calidad: los núcleos celulares son más escasos, más redondos y de mayor contraste que las burbujas empacadas, y rara vez comparten frontera como lo hacen dos celdas de una espuma.'
          : 'AP 0.0173 is the real floor of the benchmark, and it is kept for that reason: a benchmark without a floor cannot show what the floor costs. Neither hypothesis is a tool proposal. Nor is the rise of C1 on adjacent real data evidence of quality: cell nuclei are sparser, rounder and higher contrast than packed bubbles, and they rarely share a boundary the way two foam cells do.'}</p>
      </Callout>

      <Refs ids={['vincent1991', 'wang2003froth', 'aldrich2010']} label={refsLabel} />
    </div>
  );

  // ============================================================
  // 2b. C3, C4, C5: MARKER-CONTROLLED WATERSHED
  // ============================================================
  const watershedTab = (
    <div className="prose">
      <p className="measure">{es
        ? 'Las tres entradas centrales de la escalera clásica comparten exactamente el mismo motor y difieren solo en una cosa. Un watershed controlado por marcadores toma tres cantidades: una superficie de elevación, un conjunto de marcadores y un dominio admisible; inunda desde los marcadores y traza una línea donde dos cuencas se encuentran. Con marcadores dados, el número de instancias es el número de marcadores, así que la construcción de los marcadores ES el método. C3, C4 y C5 son tres hipótesis distintas sobre qué señal de la imagen indica el centro de una burbuja: el reflejo especular, el máximo de distancia al borde, y el mínimo profundo del mapa de distancia negado. Ese es también el motor que la literatura de medición de distribución de tamaño de burbuja en espuma de flotación usa para contar y medir burbujas, así que las tres variantes son variantes de una práctica publicada y no construcciones ad hoc.'
        : 'The three central entries of the classical ladder share exactly the same engine and differ in one thing only. A marker-controlled watershed takes three quantities: an elevation surface, a marker set and an admissible domain; it floods from the markers and draws a line where two basins meet. With markers given, the instance count is the marker count, so marker construction IS the method. C3, C4 and C5 are three different hypotheses about which image signal indicates the centre of a bubble: the specular highlight, the maximum of distance to the border, and the deep minimum of the negated distance map. That is also the engine the flotation-froth bubble-size-distribution measurement literature uses to count and size bubbles, so the three variants are variants of a published practice and not ad hoc constructions.'}{' '}<Cite id="meyer1994" paren /> <Cite id="jahedsaravani2017" paren /></p>

      <Equation
        tex={String.raw`\hat Y=\operatorname{Watershed}\bigl(E,\,M,\,\Omega\bigr),\qquad E=-D,\quad D(x)=\min_{q\in\partial\Omega}\lVert x-q\rVert_2`}
        caption={es
          ? 'E es la elevación inundada, M los marcadores, Ω el dominio de espuma. Para C3 y C4 la elevación es la transformada de distancia euclidiana exacta D negada: los centros de burbuja son sus valles.'
          : 'E is the flooded elevation, M the markers, Ω the froth domain. For C3 and C4 the elevation is the negated exact Euclidean distance transform D: bubble centres are its valleys.'}
      />

      <p className="measure">{es
        ? 'C4 es el piso genérico y el más fuerte de los tres. Dentro del dominio de espuma se calcula la transformada de distancia euclidiana EXACTA, no una aproximación de chamfer, y sus máximos locales con distancia mínima 4 píxeles se convierten en marcadores; luego se inunda la distancia negada con máscara. La distancia mínima de 4 píxeles es el radio de burbuja más pequeño resoluble y es una de las tres constantes que este carril hereda del tamaño del cuadro. Funciona porque para una celda convexa la distancia al borde tiene exactamente un máximo, así que un marcador por celda es lo correcto por geometría. En la prueba retenida obtiene AP 0.1977, AP50 0.4134, PQ 0.4022 y la mejor distancia de Wasserstein del tier clásico, 2.590, con 9188 instancias predichas y 1009 separaciones. Falla donde la hipótesis de convexidad se rompe: cuando dos celdas quedan fusionadas en la máscara de primer plano, la distancia tiene un solo máximo para las dos.'
        : 'C4 is the generic floor and the strongest of the three. Inside the froth domain the EXACT Euclidean distance transform is computed, not a chamfer approximation, and its local maxima at a minimum distance of 4 pixels become the markers; the negated distance is then flooded under the mask. The 4-pixel minimum distance is the smallest resolvable bubble radius and is one of three constants this lane inherits from the frame size. It works because for a convex cell the distance to the border has exactly one maximum, so one marker per cell is right by geometry. On the held-out test it scores AP 0.1977, AP50 0.4134, PQ 0.4022 and the best Wasserstein distance of the classical tier, 2.590, with 9188 predicted instances and 1009 splits. It fails where the convexity hypothesis breaks: when two cells stay fused in the foreground mask, the distance has a single maximum for both.'}</p>
      {/* exact EDT, min_distance=4: data-pipeline/fslab/science/segment.py lines 35-44 */}
      {/* C4 held-out AP/AP50/PQ/W1/nPred/splits: frontend/public/data/method-benchmark.json methods[3].test */}

      <p className="measure">{es
        ? 'C3 codifica el truco industrial canónico de la visión de espuma: cada burbuja lleva un reflejo bajo la iluminación de anillo, así que los reflejos son los centros. Se aplica la transformada de h-máximos con altura de contraste h = 0.06 sobre la imagen en gris, que suprime todo máximo regional más somero que h y deja solo los puntos brillantes salientes; esos se etiquetan como marcadores y se inunda la distancia negada. Si no sobrevive ningún reflejo limpio el método cae de vuelta a los marcadores de distancia de C4, una guarda honesta para cuadros sin brillo. Y aquí el banco es deliberadamente adverso: el generador jitterea el reflejo con desviación proporcional al radio y lo omite con probabilidad proporcional al mismo parámetro, precisamente para que un método sembrado en reflejos no pueda ganar de forma artificial.'
        : 'C3 encodes the canonical industrial trick of froth machine vision: every bubble carries a highlight under ring illumination, so the highlights are the centres. The h-maxima transform is applied with contrast height h = 0.06 on the grey image, suppressing every regional maximum shallower than h and leaving only the salient bright spots; those are labelled as markers and the negated distance is flooded. If no clean highlight survives, the method falls back to the C4 distance markers, an honest guard for highlight-free frames. And here the benchmark is deliberately adversarial: the generator jitters the highlight with a standard deviation proportional to the radius and drops it with a probability proportional to the same parameter, precisely so a highlight-seeded method cannot win artificially.'}{' '}<Cite id="aldrich2010" paren /></p>
      {/* h=0.06 and the C4 fallback: data-pipeline/fslab/science/segment.py lines 47-56 */}

      <Equation
        tex={String.raw`\mathrm{HMAX}_h(f)=R_f^{\delta}\!\left(f-h\right),\qquad M=\operatorname{label}\bigl(\mathrm{HMAX}_{0.06}(I)\bigr)`}
        caption={es
          ? 'Transformada de h-máximos: R con superíndice δ es la reconstrucción morfológica por dilatación bajo la máscara f, y h la altura de contraste que un máximo debe superar para sobrevivir como marcador. Aquí h = 0.06 sobre la imagen en gris normalizada.'
          : 'H-maxima transform: R with superscript δ is morphological reconstruction by dilation under the mask f, and h the contrast height a maximum must exceed to survive as a marker. Here h = 0.06 on the normalised grey image.'}
      />

      <p className="measure">{es
        ? 'El resultado medido dice que el indicio de reflejo es frágil. En la prueba retenida C3 queda en AP 0.1031 y PQ 0.2490, la mitad de C4, con 29248 instancias predichas y 2666 separaciones: cada brillo espurio y cada reflejo partido en dos aporta un marcador de más. El desglose por condición lo localiza: en la condición nominal polidispersa alcanza 0.227, y bajo la tormenta de brillo cae a 0.041, mientras C4 sostiene 0.089 y el trazador de lamelas 0.105. En el carril de secuencias el mismo mecanismo produce 2292 eventos falsos en ocho cuadros de transporte nominal, porque un reflejo que aparece y desaparece nace y muere como identidad. C5 ataca el problema desde el otro lado: en vez de sembrar donde hay brillo, suprime cuencas someras. Se normaliza el mapa de distancia, se niega, y se aplica la transformada de h-mínimos con h = 0.08, que colapsa todo mínimo menos profundo que h antes de inundar; h es la única perilla y fija en la práctica la burbuja más pequeña resoluble.'
        : 'The measured result says the highlight cue is fragile. On the held-out test C3 lands at AP 0.1031 and PQ 0.2490, half of C4, with 29248 predicted instances and 2666 splits: every spurious glint and every highlight broken in two contributes one marker too many. The per-condition breakdown localises it: on the nominal polydisperse condition it reaches 0.227, and under the glare storm it falls to 0.041, while C4 holds 0.089 and the lamella tracer 0.105. In the sequence lane the same mechanism produces 2292 false events over eight frames of nominal transport, because a highlight that appears and disappears is born and dies as an identity. C5 attacks the problem from the other side: instead of seeding where the glints are, it suppresses shallow basins. The distance map is normalised, negated, and the h-minima transform is applied with h = 0.08, collapsing every minimum shallower than h before flooding; h is the only knob and in practice it sets the smallest resolvable bubble.'}</p>
      {/* C3 held-out and per-condition AP: frontend/public/data/method-benchmark.json methods[2] */}
      {/* 2292 false events on poly-normal: frontend/public/data/temporal/watershed_hmax.json sequences[poly-normal].event_false_positives */}
      {/* h=0.08 on the normalised negated distance: data-pipeline/fslab/science/segment.py lines 104-117 */}

      <Figure caption={es
        ? 'Un solo perfil de elevación con las tres construcciones de marcadores y sus constantes reales; abajo, cuántas instancias produce cada una sobre las 64 muestras retenidas frente a 17846 verdaderas.'
        : 'One elevation profile with the three marker constructions and their real constants; below, how many instances each produces over the 64 held-out samples against 17846 true ones.'}>
        <svg viewBox="0 0 760 322" className="fig-svg wide" role="img" aria-labelledby="wsTitle wsDesc">
          <title id="wsTitle">{es ? 'Tres construcciones de marcadores sobre la misma elevación' : 'Three marker constructions over the same elevation'}</title>
          <desc id="wsDesc">{es
            ? 'La curva es la distancia negada al borde a lo largo de una línea que cruza tres burbujas. C3 siembra en los reflejos de la imagen en gris con h igual a 0.06, C4 en los máximos de distancia separados al menos 4 píxeles, y C5 suprime los mínimos más someros que 0.08 antes de inundar.'
            : 'The curve is the negated distance to the border along a line crossing three bubbles. C3 seeds at the grey-image highlights with h equal to 0.06, C4 at distance maxima separated by at least 4 pixels, and C5 suppresses minima shallower than 0.08 before flooding.'}</desc>

          <text x="8" y="18" className="dg-box-title">{es ? 'elevación E = -D (distancia al borde, negada)' : 'elevation E = -D (negated distance to border)'}</text>
          <line x1="60" y1="40" x2="700" y2="40" className="dg-axis" />
          <text x="704" y="44" className="dg-tick">0</text>

          <path
            d={([[140, 128], [260, 96], [380, 140], [500, 78], [620, 118]] as Array<[number, number]>)
              .map(([x, d]) => `C${x - 34} 42 ${x - 26} ${d} ${x} ${d} C${x + 26} ${d} ${x + 34} 42 ${x + 60} 42`)
              .reduce((acc, seg) => `${acc} ${seg}`, 'M80 42')}
            className="dg-curve"
          />

          {([[140, 128], [260, 96], [380, 140], [500, 78], [620, 118]] as Array<[number, number]>).map(([x, d]) => (
            <circle key={`dt-${x}`} cx={x} cy={d} r="4.5" className="dg-node" />
          ))}
          {[140, 380, 620].map((x) => (
            <line key={`hm-${x}`} x1={x} y1="40" x2={x} y2="164" className="dg-marker" />
          ))}
          <line x1="60" y1="100" x2="700" y2="100" className="dg-asymptote" />
          <text x="704" y="104" className="dg-marker-label">h = 0.08</text>

          <text x="60" y="184" className="dg-box-sub">{es ? 'círculo: máximo de distancia (C4, distancia mínima 4 px)' : 'circle: distance maximum (C4, min distance 4 px)'}</text>
          <text x="60" y="202" className="dg-box-sub">{es ? 'línea vertical: cuenca que sobrevive a h = 0.08 (C5)' : 'vertical line: basin surviving h = 0.08 (C5)'}</text>
          <text x="60" y="220" className="dg-box-sub">{es ? 'C3 no usa esta curva: siembra en los h-máximos del gris con h = 0.06' : 'C3 does not use this curve: it seeds at grey h-maxima with h = 0.06'}</text>

          <line x1="60" y1="302" x2="700" y2="302" className="dg-axis" />
          {([
            ['C3', 29248, 90],
            ['C4', 9188, 250],
            ['C5', 6809, 410],
            [es ? 'verdad' : 'truth', 17846, 570],
          ] as Array<[string, number, number]>).map(([id, n, x]) => (
            <g key={id}>
              <rect x={x} y={302 - n / 700} width="72" height={n / 700} className={id === 'C3' ? 'dg-bar-2' : 'dg-bar'} />
              <text x={x + 36} y="315" className="dg-bar-label" textAnchor="middle">{id}</text>
              <text x={x + 36} y={296 - n / 700} className="dg-tick" textAnchor="middle">{n}</text>
            </g>
          ))}
          <text x="60" y="244" className="dg-box-sub">{es ? 'instancias predichas sobre 64 muestras' : 'predicted instances over 64 samples'}</text>
        </svg>
      </Figure>

      <p className="measure">{es
        ? 'C5 recorta la sobre-segmentación de forma drástica y paga por ello en la distribución de tamaño. En la prueba retenida obtiene AP 0.1330 y PQ 0.2845 con 744 separaciones, 3.6 veces menos que C3, pero 2677 uniones y una distancia de Wasserstein de 16.568, la peor del tier clásico y 6.4 veces peor que la de C4 pese a estar solo 0.065 de AP por detrás. La razón es directa: suprimir cuencas someras elimina exactamente las burbujas pequeñas que forman la cola izquierda de la distribución. Bajo la tormenta de brillo colapsa a 0.001, porque un lobulo saturado destruye la máscara de primer plano de la que depende toda la construcción de distancia. Esa es la lección del trío: dentro de una misma familia, mover el constructor de marcadores mueve la AP y la fidelidad de distribución en direcciones opuestas.'
        : 'C5 cuts over-segmentation drastically and pays for it in the size distribution. On the held-out test it scores AP 0.1330 and PQ 0.2845 with 744 splits, 3.6 times fewer than C3, but 2677 merges and a Wasserstein distance of 16.568, the worst of the classical tier and 6.4 times worse than that of C4 despite trailing it by only 0.065 AP. The reason is direct: suppressing shallow basins removes exactly the small bubbles that form the left tail of the distribution. Under the glare storm it collapses to 0.001, because a saturated lobe destroys the foreground mask the whole distance construction depends on. That is the lesson of the trio: within one family, moving the marker constructor moves AP and distribution fidelity in opposite directions.'}</p>
      {/* C5 held-out AP/PQ/W1/splits/merges and glare-storm 0.001: frontend/public/data/method-benchmark.json methods[4] */}

      <Callout variant="honest" title={es ? 'Tres constantes que no se transfieren' : 'Three constants that do not transfer'}>
        <p>{es
          ? 'Los siete métodos clásicos son ejecutables, deterministas y reproducibles, pero sus parámetros no se transfieren solos. Tres constantes fueron fijadas para cuadros de 256 por 256 con media de Sauter entre 15 y 44 píxeles: el factor 0.75 sobre el umbral, la distancia mínima de 4 píxeles entre marcadores, y la altura h (0.06 para el sembrado en reflejos, 0.08 para la supresión de mínimos). Cambiar de cámara, de iluminación o de régimen de espuma exige recalibrarlas. Este tier es un piso, no un producto: no tiene ningún prior aprendido para las lamelas tenues, así que su calidad está acotada por el ajuste de marcadores y umbrales.'
          : 'All seven classical methods are runnable, deterministic and reproducible, but their parameters do not transfer on their own. Three constants were fixed for 256 by 256 frames with a Sauter mean between 15 and 44 pixels: the 0.75 factor on the threshold, the 4-pixel minimum distance between markers, and the height h (0.06 for highlight seeding, 0.08 for minima suppression). Changing camera, lighting or froth regime requires recalibrating them. This tier is a floor, not a product: it has no learned prior for the faint lamellae, so its quality is bounded by marker and threshold tuning.'}</p>
      </Callout>

      <Refs ids={['meyer1994', 'jahedsaravani2017', 'aldrich2010']} label={refsLabel} />
    </div>
  );

  // ============================================================
  // 2c. C6, C7: REGION MERGING AND THE LAMELLA CUE
  // ============================================================
  const regionTab = (
    <div className="prose">
      <p className="measure">{es
        ? 'Las dos últimas entradas clásicas abandonan el watershed por completo y llegan a resultados separados por un factor de nueve en AP, lo que las convierte en la comparación más informativa del tier. Las dos etiquetan regiones sin inundar nada. Una parte de la similitud de apariencia; la otra parte de la frontera física. C6 sobre-segmenta la imagen en superpíxeles compactos con un k-medias local en cinco dimensiones (color en Lab más posición) y luego fusiona regiones vecinas por distancia de color medio en un grafo de adyacencia; se usan 400 segmentos, compacidad 8, un suavizado previo de sigma 1 y un corte del grafo en 0.08, tras lo cual la partición se enmascara al primer plano de espuma y las islas desconectadas reciben identidades únicas.'
        : 'The last two classical entries abandon watershed entirely and land nine times apart in AP, which makes them the most informative comparison in the tier. Both label regions without flooding anything. One starts from appearance similarity; the other starts from the physical boundary. C6 over-segments the image into compact superpixels with a local k-means in five dimensions (Lab colour plus position) and then merges neighbouring regions by mean-colour distance on an adjacency graph; 400 segments are used, compactness 8, a prior smoothing of sigma 1 and a graph cut at 0.08, after which the partition is masked to the froth foreground and disconnected islands receive unique identities.'}{' '}<Cite id="achanta2012slic" paren /></p>
      {/* n_segments=400, compactness=8, sigma=1, cut_threshold=0.08: data-pipeline/fslab/science/segment.py lines 59-74 */}

      <Equation
        tex={es
          ? String.raw`D=\sqrt{d_c^2+\left(\frac{d_s}{S}\right)^2 m^2},\qquad m=8,\quad n_{\text{seg}}=400,\quad \text{corte RAG}=0.08`
          : String.raw`D=\sqrt{d_c^2+\left(\frac{d_s}{S}\right)^2 m^2},\qquad m=8,\quad n_{\text{seg}}=400,\quad \text{RAG cut}=0.08`}
        caption={es
          ? 'Distancia de SLIC: d_c es la distancia de color, d_s la distancia espacial, S el intervalo de la retícula de semillas y m la compacidad. Un m grande produce superpíxeles regulares; un m pequeño los deja seguir el color.'
          : 'SLIC distance: d_c is the colour distance, d_s the spatial distance, S the seed-grid interval and m the compactness. A large m produces regular superpixels; a small m lets them follow colour.'}
      />

      <p className="measure">{es
        ? 'El problema es que en espuma la similitud de apariencia no es la frontera. Un superpíxel se ancla al reflejo especular, que es el rasgo de mayor contraste dentro de una burbuja, y no a la costura tenue que la separa de su vecina, así que la fusión posterior une o parte por las razones equivocadas. En la prueba retenida C6 obtiene AP 0.0186 y PQ 0.0721 con 39904 instancias predichas y 3247 separaciones, y cuesta 536.0 milisegundos por muestra, veinticuatro veces más que el watershed de distancia. En el carril de secuencias su firma es aún más clara: 105 cambios de identidad y 113 fragmentos de trayectoria sobre ocho cuadros, con 10122 eventos falsos. Se conserva como la primitiva de sobre-segmentación no basada en watershed, no como candidata.'
        : 'The problem is that in froth appearance similarity is not the boundary. A superpixel anchors to the specular highlight, which is the highest-contrast feature inside a bubble, and not to the faint seam separating it from its neighbour, so the subsequent merge joins or cuts for the wrong reasons. On the held-out test C6 scores AP 0.0186 and PQ 0.0721 with 39904 predicted instances and 3247 splits, and it costs 536.0 milliseconds per sample, twenty-four times the distance watershed. In the sequence lane its signature is even clearer: 105 identity switches and 113 track fragments over eight frames, with 10122 false events. It is kept as the non-watershed over-segmentation primitive, not as a candidate.'}</p>
      {/* C6 held-out and latency: frontend/public/data/method-benchmark.json methods[5]; switches/fragments/false events: frontend/public/data/temporal/slic_merge.json poly-normal */}

      <p className="measure">{es
        ? 'C7 invierte el indicio y es el método específico del dominio. En vez de buscar los puntos brillantes busca las costuras oscuras. Un black top-hat con un disco de radio 3 aísla las estructuras oscuras más delgadas que el elemento estructurante, es decir exactamente las películas entre burbujas; la respuesta del top-hat se umbraliza por varianza entre clases para obtener la máscara de costuras, las costuras se restan del primer plano, se eliminan los objetos de menos de 8 píxeles y las tapas encerradas se etiquetan. No hay marcadores, no hay inundación y no hay ningún prior de reflejo. Es robusto a los brillos por construcción, porque un brillo es un máximo y el operador solo mira mínimos delgados.'
        : 'C7 reverses the cue and is the domain-specific method. Instead of looking for the bright spots it looks for the dark seams. A black top-hat with a radius-3 disk isolates dark structures thinner than the structuring element, which is exactly the films between bubbles; the top-hat response is thresholded by between-class variance to obtain the seam mask, the seams are subtracted from the foreground, objects below 8 pixels are removed, and the enclosed caps are labelled. There are no markers, no flooding and no highlight prior. It is robust to glints by construction, because a glint is a maximum and the operator only looks at thin minima.'}{' '}<Cite id="wang2003froth" paren /></p>
      {/* black_tophat disk(3), Otsu on the response, remove_small_objects(8): data-pipeline/fslab/science/segment.py lines 120-130 */}

      <Equation
        tex={es
          ? String.raw`\mathrm{BTH}_B(I)=\bigl(I\bullet B\bigr)-I,\qquad \text{costuras}=\bigl\{x:\mathrm{BTH}_{\mathrm{disco}(3)}(I)(x)>t^\star\bigr\}`
          : String.raw`\mathrm{BTH}_B(I)=\bigl(I\bullet B\bigr)-I,\qquad \text{seams}=\bigl\{x:\mathrm{BTH}_{\mathrm{disk}(3)}(I)(x)>t^\star\bigr\}`}
        caption={es
          ? 'Black top-hat: el punto grueso es el cierre morfológico con el elemento estructurante B, y la resta deja solo las estructuras oscuras más delgadas que B. Con un disco de radio 3, la anchura máxima de costura detectable es del orden de 6 píxeles.'
          : 'Black top-hat: the bullet is the morphological closing with structuring element B, and the subtraction leaves only dark structures thinner than B. With a radius-3 disk, the maximum detectable seam width is of the order of 6 pixels.'}
      />

      <p className="measure">{es
        ? 'La razón por la que este indicio es el correcto es física, no heurística. Las películas de una espuma seca se encuentran de tres en tres a lo largo de un borde de Plateau, y el borde es una estructura oscura delgada que aparece en la imagen aunque el interior de la burbuja esté saturado. En el generador ese oscurecimiento es un término exponencial en la distancia euclidiana exacta al borde de celda, así que el valle es un rasgo geométrico genuino y no una textura añadida; en espuma real es la red de películas. El resultado medido acompaña: en la prueba retenida C7 obtiene AP 0.1673, AP50 0.4121, PQ 0.3632 y la mejor F de frontera del tier clásico, 0.8628, con solo 51 separaciones mientras predice 10809 instancias, frente a 744 separaciones sobre 6809 predicciones del watershed de h-mínima, y a 9.6 milisegundos por muestra. En la escena canónica polidispersa es el clásico más fuerte con AP 0.438 y PQ 0.681, 166 predicciones para 197 verdaderas y cero separaciones.'
        : 'The reason this cue is the right one is physical, not heuristic. The films of a dry foam meet three at a time along a Plateau border, and the border is a thin dark structure that appears in the image even when the bubble interior is saturated. In the generator that darkening is an exponential term in the exact Euclidean distance to the cell edge, so the valley is a genuine geometric feature and not an added texture; in real froth it is the film network. The measured result follows: on the held-out test C7 scores AP 0.1673, AP50 0.4121, PQ 0.3632 and the best boundary F of the classical tier, 0.8628, with only 51 splits while predicting 10809 instances, against 744 splits over 6809 predictions for the h-minima watershed, at 9.6 milliseconds per sample. On the canonical polydisperse scene it is the strongest classical at AP 0.438 and PQ 0.681, with 166 predictions for 197 true bubbles and zero splits.'}{' '}<Cite id="weaire1999foams" paren /></p>
      {/* C7 held-out values: frontend/public/data/method-benchmark.json methods[6].test; canonical 166 preds, AP 0.438, PQ 0.681: docs/methods/classical.md line 43 */}

      <Figure caption={es
        ? 'Los dos indicios dibujados como geometría. Izquierda: la retícula de semillas de SLIC mide 9.6 píxeles de lado (400 segmentos en un cuadro de 192), más fina que una tapa, así que la fusión se detiene en el anillo de reflejo y corta el interior. Derecha: el black top-hat solo aísla una costura más delgada que el diámetro de 6 píxeles de su elemento estructurante.'
        : 'The two cues drawn as geometry. Left: the SLIC seed lattice is 9.6 pixels on a side (400 segments in a 192-pixel frame), finer than a cap, so the merge stops at the highlight ring and cuts the interior. Right: the black top-hat only isolates a seam thinner than the 6-pixel diameter of its structuring element.'}>
        <svg viewBox="0 0 760 300" className="fig-svg wide" role="img" aria-labelledby="regTitle regDesc">
          <title id="regTitle">{es ? 'Geometría de los dos indicios sin watershed' : 'Geometry of the two watershed-free cues'}</title>
          <desc id="regDesc">{es
            ? 'Izquierda: dos celdas que comparten una película recta, con la retícula de semillas de SLIC superpuesta y la frontera de fusión cerrándose alrededor del reflejo especular en lugar de la película, lo que parte la tapa en dos. Derecha: dos perfiles de intensidad a través de una costura sobre un eje en píxeles, con el disco de radio 3 dibujado a la misma escala; cuando la costura es más delgada que 6 píxeles el cierre la puentea y el top-hat la aísla, y cuando es más ancha el disco cabe dentro del valle y la respuesta se anula.'
            : 'Left: two cells sharing one straight film, with the SLIC seed lattice overlaid and the merge boundary closing around the specular highlight instead of the film, which cuts the cap in two. Right: two intensity profiles across a seam over an axis in pixels, with the radius-3 disk drawn to the same scale; when the seam is thinner than 6 pixels the closing bridges it and the top-hat isolates it, and when it is wider the disk fits inside the valley and the response vanishes.'}</desc>
          <defs>
            <marker id="regArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0L10 5L0 10z" className="dg-arrowhead" />
            </marker>
          </defs>

          <text x="8" y="20" className="dg-box-title">{es ? 'C6 · similitud de apariencia' : 'C6 · appearance similarity'}</text>
          <g transform="translate(16,32)">
            <polygon points="30,20 120,14 150,70 118,124 40,128 12,74" className="dg-curve-faint" />
            <polygon points="150,70 118,124 158,176 232,158 248,92" className="dg-curve-faint" />
            <line x1="150" y1="70" x2="118" y2="124" className="dg-asymptote" />
            <text x="196" y="118" className="dg-marker-label">{es ? 'película compartida' : 'shared film'}</text>
            {[0, 1, 2, 3, 4, 5, 6].map((i) => [0, 1, 2, 3, 4].map((j) => (
              <g key={`s-${i}-${j}`}>
                <line x1={11 + i * 34} y1={22 + j * 34} x2={21 + i * 34} y2={22 + j * 34} className="dg-axis" />
                <line x1={16 + i * 34} y1={17 + j * 34} x2={16 + i * 34} y2={27 + j * 34} className="dg-axis" />
              </g>
            )))}
            <circle cx="72" cy="62" r="15" className="dg-fill-warn" />
            <circle cx="72" cy="62" r="40" className="dg-marker" fill="none" />
            <path d="M56 182 C48 160 52 130 64 108" className="dg-edge" markerEnd="url(#regArrow)" />
            <text x="0" y="196" className="dg-marker-label">{es ? 'la fusión cierra en el reflejo' : 'the merge closes on the highlight'}</text>
            <text x="0" y="216" className="dg-note">{es ? 'retícula de semillas: 9.6 px de lado' : 'seed lattice: 9.6 px on a side'}</text>
            <text x="0" y="234" className="dg-note">{es ? 'el corte cae dentro de la tapa, no en la película' : 'the cut lands inside the cap, not on the film'}</text>
          </g>

          <text x="404" y="20" className="dg-box-title">{es ? 'C7 · costura frente al disco de radio 3' : 'C7 · seam versus the radius-3 disk'}</text>
          <g transform="translate(404,0)">
            {([
              [104, 18, es ? 'w menor que 6 px: el cierre puentea, el top-hat aísla' : 'w below 6 px: the closing bridges, the top-hat isolates', true],
              [236, 90, es ? 'w mayor que 6 px: el disco cabe dentro, la respuesta se anula' : 'w above 6 px: the disk fits inside, the response vanishes', false],
            ] as Array<[number, number, string, boolean]>).map(([base, width, note, isolated]) => (
              <g key={base}>
                <line x1="20" y1={base} x2="300" y2={base} className="dg-axis" />
                {[0, 6, 12, 18].map((px) => (
                  <g key={px}>
                    <line x1={20 + px * 9} y1={base} x2={20 + px * 9} y2={base + 7} className="dg-axis" />
                    <text x={20 + px * 9} y={base + 20} className="dg-tick" textAnchor="middle">{px}</text>
                  </g>
                ))}
                <text x="196" y={base + 20} className="dg-axis-label">px</text>
                <path
                  d={`M20 ${base - 62} H${146 - width / 2} C${146 - width / 4} ${base - 62} ${146 - width / 4} ${base - 8} 146 ${base - 8} C${146 + width / 4} ${base - 8} ${146 + width / 4} ${base - 62} ${146 + width / 2} ${base - 62} H300`}
                  className="dg-curve"
                />
                <line x1={146 - width / 2} y1={base - 8} x2={146 - width / 2} y2={base - 70} className="dg-grid" />
                <line x1={146 + width / 2} y1={base - 8} x2={146 + width / 2} y2={base - 70} className="dg-grid" />
                <path d={`M${146 - width / 2} ${base - 74} H${146 + width / 2}`} className="dg-edge" />
                <text x={150 + width / 2} y={base - 70} className="dg-edge-label">{es ? 'ancho w' : 'width w'}</text>
                <circle cx={isolated ? 252 : 146} cy={base - 35} r="27" className="dg-curve-faint" />
                {isolated
                  ? <text x="252" y={base - 70} className="dg-marker-label" textAnchor="middle">{es ? 'disco 3 · 6 px' : 'disk 3 · 6 px'}</text>
                  : <text x="188" y={base - 31} className="dg-marker-label">{es ? 'disco 3 · 6 px' : 'disk 3 · 6 px'}</text>}
                <text x="20" y={base + 38} className="dg-note">{note}</text>
              </g>
            ))}
          </g>
        </svg>
      </Figure>
      {/* SLIC lattice side sqrt(192^2 / 400) = 9.6 px: n_segments=400 in data-pipeline/fslab/science/segment.py line 68 with image_size 192 in data-pipeline/fslab/datasets.py line 128 */}
      {/* 6 px structuring-element diameter: morphology.disk(3) in data-pipeline/fslab/science/segment.py line 126 */}

      <p className="measure">{es
        ? 'El límite de C7 está escrito en su propio operador. El disco de radio 3 fija la anchura máxima de costura que puede aislar, así que un borde ancho de espuma acuosa o un cuadro desenfocado lo rompen: bajo la condición acuosa cae a 0.021 mientras el watershed de distancia sostiene 0.126, y desciende aún más en los dos estresores compuestos, 0.017 con brillo y movimiento y 0.016 con desenfoque oscuro, que son sus dos peores cifras de las 16 condiciones. Y como etiqueta tapas encerradas en lugar de particionar el primer plano completo, sub-cubre de forma sistemática (una tapa es más pequeña que su celda), lo que aparece como error de conteo positivo y una distancia de Wasserstein de 3.564 pese a su buena F de frontera. Bajo brillo, en cambio, es el clásico más fuerte con 0.105, y en espuma gruesa alcanza 0.444, la cifra más alta del tier clásico en esa condición, aunque el carril de SAM 2.1 sin prompts, que tampoco recibió entrenamiento de espuma aquí, llega a 0.459 en la misma condición.'
        : 'The limit of C7 is written into its own operator. The radius-3 disk fixes the maximum seam width it can isolate, so a wide watery border or a defocused frame breaks it: under the watery condition it falls to 0.021 while the distance watershed holds 0.126, and it goes lower still on the two compound stressors, 0.017 under glare with motion and 0.016 under dark defocus, which are its two worst figures of the 16 conditions. And because it labels enclosed caps rather than partitioning the whole foreground, it systematically under-covers (a cap is smaller than its cell), which shows up as a positive count error and a Wasserstein distance of 3.564 despite its good boundary F. Under glare, by contrast, it is the strongest classical at 0.105, and on coarse froth it reaches 0.444, the highest figure of the classical tier on that condition, although the unprompted SAM 2.1 lane, which received no froth training here either, reaches 0.459 on the same condition.'}</p>
      {/* C7 per-condition AP (watery 0.02075, glare-motion-compound 0.0175, dark-defocus-compound 0.01575, glare-storm 0.10475, coarse-froth 0.4435): frontend/public/data/method-benchmark.json methods[6].test.robustness_by_condition */}
      {/* C4 watery 0.12625: methods[3]; L7 coarse-froth 0.45875: methods[13], same file */}

      <Callout variant="honest" title={es ? 'Lo que este par no autoriza a decir' : 'What this pair does not license'}>
        <p>{es
          ? 'C7 lidera el tier clásico y sigue estando 0.35 de AP por debajo del líder aprendido, así que no es una alternativa al carril entrenado sino su referencia. Su procedencia también está declarada con cuidado: es una línea base de valle o cresta del dominio cuya cita exacta permanece bajo compuerta en el registro, de modo que se acredita a la tradición de delineación de espuma y no se presenta como la reproducción de un artículo concreto. C6 se conserva como control negativo, no como método propuesto.'
          : 'C7 leads the classical tier and is still 0.35 AP below the learned leader, so it is not an alternative to the trained lane but its reference. Its provenance is also stated carefully: it is a domain valley or ridge baseline whose exact citation remains gated in the registry, so it is credited to the froth-delineation tradition and is not presented as the reproduction of one specific paper. C6 is kept as a negative control, not as a proposed method.'}</p>
      </Callout>

      <Refs ids={['achanta2012slic', 'wang2003froth', 'weaire1999foams']} label={refsLabel} />
    </div>
  );

  // ============================================================
  // 3a. L1, L2, L3: LEARNED DENSE FIELDS
  // ============================================================
  const denseTab = (
    <div className="prose">
      <p className="measure">{es
        ? 'El tier aprendido no reemplaza el watershed: reemplaza las dos cantidades que el tier clásico tenía que adivinar. En vez de construir la superficie de elevación a partir de una transformada de distancia geométrica y los marcadores a partir de reflejos o máximos, una red predice campos densos y el postproceso sigue siendo el mismo operador inspeccionable. Esa decisión de diseño es deliberada: mantiene la separación entre lo que el modelo cree y la regla de decisión que produce instancias, así que un error puede atribuirse a uno u otro. Los tres modelos de esta familia comparten objetivos, pérdida, calibración y decodificador, y difieren solo en el grafo de la red.'
        : 'The learned tier does not replace watershed: it replaces the two quantities the classical tier had to guess. Instead of building the elevation surface from a geometric distance transform and the markers from highlights or maxima, a network predicts dense fields and the post-processing stays the same inspectable operator. That design decision is deliberate: it keeps the separation between what the model believes and the decision rule that produces instances, so an error can be attributed to one or the other. The three models in this family share targets, loss, calibration and decoder, and differ only in the network graph.'}{' '}<Cite id="ronneberger2015unet" paren /> <Cite id="meyer1994" paren /></p>

      <p className="measure">{es
        ? 'Los objetivos se derivan del mapa de instancias exacto y no de una anotación. El primer plano es simplemente el conjunto de píxeles con etiqueta positiva. La frontera se obtiene marcando dónde cambia la etiqueta en cada dirección, dilatando una iteración y volviendo a intersectar con el primer plano, así que es una banda interior dilatada sobre la lamela y no un contorno de un píxel: una banda es aprendible, un contorno de un píxel es una clase degenerada. La distancia interior es la transformada euclidiana exacta del interior (primer plano menos frontera) normalizada por su percentil 99 y recortada a [0,1]. Esa normalización por imagen es la razón por la cual la inferencia debe correr a la escala de entrenamiento: el modelo aprendió una distancia relativa, así que el cuadro se redimensiona a 192 píxeles, se predicen los campos, se devuelven a la resolución original y la distancia mínima entre marcadores se reescala por el mismo factor.'
        : 'The targets are derived from the exact instance map and not from an annotation. Foreground is simply the set of pixels with a positive label. The boundary is obtained by marking where the label changes in each direction, dilating one iteration and intersecting with foreground again, so it is a dilated interior band over the lamella and not a one-pixel contour: a band is learnable, a one-pixel contour is a degenerate class. The interior distance is the exact Euclidean transform of the interior (foreground minus boundary) normalised by its 99th percentile and clipped to [0,1]. That per-image normalisation is why inference must run at the training scale: the model learned a relative distance, so the frame is resized to 192 pixels, the fields are predicted, they are returned to the original resolution, and the minimum distance between markers is rescaled by the same factor.'}</p>
      {/* target construction and 99th-percentile normalisation: data-pipeline/fslab/learning/multitask_models.py lines 132-159 */}
      {/* resize to the 192 px training scale and marker rescaling: data-pipeline/fslab/learning/unet_watershed.py lines 134-164 */}

      <Equation
        tex={String.raw`F=\mathbf 1[Y>0],\quad B=\delta_1\!\left(\nabla_{\!\text{lab}}Y\right)\cap F,\quad D=\operatorname{clip}_{[0,1]}\!\left(\frac{\operatorname{EDT}(F\setminus B)}{\operatorname{p}_{99}\bigl[\operatorname{EDT}(F\setminus B)\bigr]}\right)`}
        caption={es
          ? 'Los tres objetivos densos: F es interior, B la banda de lamela (δ_1 es una dilatación de una iteración sobre los cambios de etiqueta) y D la distancia interior normalizada por su percentil 99 y recortada al intervalo unidad.'
          : 'The three dense targets: F is interior, B the lamella band (δ_1 is a one-iteration dilation over the label changes) and D the interior distance normalised by its 99th percentile and clipped to the unit interval.'}
      />

      <p className="measure">{es
        ? 'L1 es la vertical compacta y desplegable. Es una U-Net de dos cabezas con 24 canales base: tres bloques de codificación, cada uno con dos convoluciones 3 por 3 seguidas de normalización por lote y activación SiLU, submuestreo por max-pooling de factor 2, decodificación por convolución transpuesta de paso 2 con concatenación de la conexión de salto, y una cabeza 1 por 1 que emite dos logits, interior y frontera. Se entrenó 24 épocas a 192 píxeles con lotes de 8 sobre CUDA. La decodificación es explícita: se umbraliza el interior en 0.5, se calcula la transformada de distancia del primer plano resultante, se forma una superficie de semillas multiplicando esa distancia por uno menos la probabilidad de frontera, se anulan las semillas donde la frontera supera 0.45, se extraen los máximos locales con distancia mínima 3 y se inunda la superficie negada con línea de watershed activada.'
        : 'L1 is the compact deployable vertical. It is a two-head U-Net with 24 base channels: three encoding blocks, each with two 3 by 3 convolutions followed by batch normalisation and a SiLU activation, factor-2 max-pooling downsampling, stride-2 transposed-convolution decoding with skip concatenation, and a 1 by 1 head emitting two logits, interior and boundary. It was trained for 24 epochs at 192 pixels with batches of 8 on CUDA. Decoding is explicit: interior is thresholded at 0.5, the distance transform of the resulting foreground is computed, a seed surface is formed by multiplying that distance by one minus the boundary probability, seeds are zeroed where boundary exceeds 0.45, local maxima are extracted at a minimum distance of 3, and the negated surface is flooded with the watershed line enabled.'}</p>
      {/* two-head U-Net graph and decode thresholds: data-pipeline/fslab/learning/unet_watershed.py lines 11-102 */}
      {/* 24 epochs, 192 px, base 24, batch 8, cuda: docs/frameworks/07_unet-watershed/README.md lines 20-27 */}

      <Equation
        tex={String.raw`S=D\,(1-p_B),\quad S\!\left[p_B\ge0.45\right]=0,\quad M=\operatorname{Maxima}_{d_{\min}=3}(S),\quad \hat Y=\operatorname{Watershed}(-S,M,\{p_F\ge0.5\})`}
        caption={es
          ? 'Decodificación de L1: S es la superficie de semillas, p_B y p_F las probabilidades de frontera e interior, d_min la separación mínima entre marcadores. La frontera hace dos trabajos: baja la semilla y levanta la barrera.'
          : 'L1 decoding: S is the seed surface, p_B and p_F the boundary and interior probabilities, d_min the minimum marker separation. The boundary does two jobs: it lowers the seed and raises the barrier.'}
      />

      <p className="measure">{es
        ? 'La cifra medida sitúa a L1 muy por encima de todo el tier clásico y por debajo del generalista preentrenado. En la prueba retenida obtiene AP 0.4153, AP50 0.6987, PQ 0.6559, F de frontera 0.9590 y una distancia de Wasserstein de 1.616, con 17392 instancias predichas contra 17846 verdaderas, un conteo casi correcto que es lo que el sensor blando de tamaño necesita. Su exportación a ONNX en opset 18 se verifica numéricamente: el error absoluto máximo de logit contra el ejecutor de referencia es 1.046e-5 frente a una tolerancia declarada de 2e-5, y el checkpoint viaja con su SHA-256. Los modos de falla que quedan visibles son la resolución de microburbujas y la sobre-segmentación de burbujas gruesas; el desglose por condición lo confirma, con 0.551 en la condición nominal polidispersa y 0.205 en la nube de microburbujas.'
        : 'The measured figure places L1 far above the whole classical tier and below the pretrained generalist. On the held-out test it scores AP 0.4153, AP50 0.6987, PQ 0.6559, boundary F 0.9590 and a Wasserstein distance of 1.616, with 17392 predicted instances against 17846 true ones, a nearly correct count which is what the size soft sensor needs. Its ONNX export at opset 18 is verified numerically: the maximum absolute logit error against the reference runtime is 1.046e-5 against a declared tolerance of 2e-5, and the checkpoint travels with its SHA-256. The failure modes that remain visible are microbubble resolution and coarse-bubble over-segmentation; the per-condition breakdown confirms it, with 0.551 on the nominal polydisperse condition and 0.205 on the microbubble cloud.'}</p>
      {/* L1 held-out metrics: frontend/public/data/method-benchmark.json methods[7].test */}
      {/* ONNX opset 18, max abs logit error 1.046e-5 at 2e-5 tolerance: docs/frameworks/07_unet-watershed/README.md lines 16, 38 */}

      <p className="measure">{es
        ? 'L2 y L3 agregan una tercera cabeza y con ella un cambio conceptual: la distancia deja de ser geométrica y pasa a ser aprendida, así que la superficie de semillas es el producto de la distancia predicha por uno menos la frontera predicha, y la elevación inundada es la frontera predicha menos la distancia predicha. Eso permite que el modelo invente un centro donde la geometría de la máscara no lo tiene, que es exactamente el caso de dos celdas fusionadas en el primer plano. L2 es una implementación en repositorio de la familia de watershed con marcadores profundos, no una copia de código no disponible; L3 es un segmentador de contexto global de sala limpia inspirado en la familia publicada, con codificador local, un cuello de botella dilatado a factor 2 y luego 4, y una compuerta de canal por excitación y compresión (promedio global, convolución a c canales, SiLU, convolución de vuelta a 4c, sigmoide) que multiplica el contexto antes de la fusión del decodificador.'
        : 'L2 and L3 add a third head and with it a conceptual change: distance stops being geometric and becomes learned, so the seed surface is the predicted distance times one minus the predicted boundary, and the flooded elevation is the predicted boundary minus the predicted distance. That lets the model invent a centre where the mask geometry does not have one, which is exactly the case of two cells fused in the foreground. L2 is an in-repository implementation of the deep-marker watershed family, not a copy of unavailable code; L3 is a clean-room global-context segmenter inspired by the published family, with a local encoder, a bottleneck dilated at factor 2 and then 4, and a squeeze-and-excitation channel gate (global average, convolution to c channels, SiLU, convolution back to 4c, sigmoid) multiplying the context before decoder fusion.'}{' '}<Cite id="zhu2025gcfsegnet" paren /> <Cite id="fan2024parallel" paren /></p>
      {/* three-head graphs, SE gate, dilations 2 and 4: data-pipeline/fslab/learning/multitask_models.py lines 36-129 */}
      {/* learned seed surface and flooded elevation: data-pipeline/fslab/learning/multitask_models.py lines 168-205 */}

      <Figure caption={es
        ? 'De campos densos a instancias: los objetivos, la superficie de semillas y la inundación, con los umbrales que la calibración fija y la rejilla de 81 combinaciones que los elige.'
        : 'From dense fields to instances: the targets, the seed surface and the flood, with the thresholds calibration fixes and the 81-combination grid that chooses them.'}>
        <svg viewBox="0 0 760 306" className="fig-svg wide" role="img" aria-labelledby="dnsTitle dnsDesc">
          <title id="dnsTitle">{es ? 'Decodificación de campos densos a instancias' : 'Dense-field decoding into instances'}</title>
          <desc id="dnsDesc">{es
            ? 'El cuadro entra en la red, que emite interior, frontera y distancia interior. La superficie de semillas es el producto de la distancia por uno menos la frontera, anulada donde la frontera supera su umbral; los máximos locales son marcadores y la inundación usa frontera menos distancia como elevación, restringida al interior.'
            : 'The frame enters the network, which emits interior, boundary and interior distance. The seed surface is distance times one minus boundary, zeroed where boundary exceeds its threshold; local maxima are markers and the flood uses boundary minus distance as elevation, restricted to interior.'}</desc>
          <defs>
            <marker id="dnsArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0L10 5L0 10z" className="dg-arrowhead" />
            </marker>
          </defs>

          <rect x="8" y="112" width="104" height="56" rx="8" className="dg-box" />
          <text x="22" y="136" className="dg-box-title">{es ? 'cuadro' : 'frame'}</text>
          <text x="22" y="154" className="dg-box-sub">192 x 192</text>
          <path d="M112 140 H150" className="dg-edge" markerEnd="url(#dnsArrow)" />

          <rect x="152" y="96" width="96" height="88" rx="8" className="dg-box accent" />
          <text x="164" y="126" className="dg-box-title accent">U-Net</text>
          <text x="164" y="144" className="dg-box-sub">{es ? '3 niveles' : '3 levels'}</text>
          <text x="164" y="162" className="dg-box-sub">SiLU · BN</text>

          {([
            ['F', es ? 'interior' : 'interior', 40],
            ['B', es ? 'frontera' : 'boundary', 112],
            ['D', es ? 'distancia' : 'distance', 184],
          ] as Array<[string, string, number]>).map(([sym, label, y]) => (
            <g key={sym}>
              <path d={`M248 140 C276 140 282 ${y + 22} 306 ${y + 22}`} className="dg-edge" markerEnd="url(#dnsArrow)" />
              <rect x="308" y={y} width="104" height="44" rx="8" className="dg-box" />
              <text x="320" y={y + 20} className="dg-box-title">{sym}</text>
              <text x="320" y={y + 37} className="dg-box-sub">{label}</text>
            </g>
          ))}

          <path d="M412 62 C444 62 448 128 476 128" className="dg-edge" markerEnd="url(#dnsArrow)" />
          <text x="418" y="56" className="dg-edge-label">{es ? 'umbral 0.5' : 'threshold 0.5'}</text>
          <path d="M412 134 H476" className="dg-edge" markerEnd="url(#dnsArrow)" />
          <text x="418" y="126" className="dg-edge-label">0.45</text>
          <path d="M412 206 C444 206 448 150 476 150" className="dg-edge" markerEnd="url(#dnsArrow)" />

          <rect x="478" y="104" width="126" height="72" rx="8" className="dg-box" />
          <text x="490" y="126" className="dg-box-title">S = D (1 - B)</text>
          <text x="490" y="145" className="dg-box-sub">{es ? 'máximos, d = 3' : 'maxima, d = 3'}</text>
          <text x="490" y="163" className="dg-box-sub">{es ? 'marcadores M' : 'markers M'}</text>

          <path d="M604 140 H638" className="dg-edge" markerEnd="url(#dnsArrow)" />
          <rect x="640" y="96" width="112" height="88" rx="8" className="dg-box good" />
          <text x="652" y="120" className="dg-box-title">Watershed</text>
          <text x="652" y="139" className="dg-box-sub">E = B - D</text>
          <text x="652" y="157" className="dg-box-sub">{es ? 'máscara F' : 'mask F'}</text>
          <text x="652" y="175" className="dg-box-sub">{es ? 'línea activa' : 'line on'}</text>

          <text x="8" y="248" className="dg-box-sub">{es ? 'la calibración barre 3 x 3 x 3 x 3 = 81 combinaciones de umbral' : 'calibration sweeps 3 x 3 x 3 x 3 = 81 threshold combinations'}</text>
          <text x="8" y="268" className="dg-box-sub">{es ? 'interior {0.4, 0.5, 0.6} · frontera {0.35, 0.5, 0.65} · marcador {0.15, 0.25, 0.35} · d {1, 2, 3}' : 'interior {0.4, 0.5, 0.6} · boundary {0.35, 0.5, 0.65} · marker {0.15, 0.25, 0.35} · d {1, 2, 3}'}</text>
          <text x="8" y="292" className="dg-note">{es
            ? 'una sola realización de apariencia por grupo de calibración, seleccionada por AP media'
            : 'a single appearance realisation per calibration group, selected by mean AP'}</text>
        </svg>
      </Figure>

      <Equation
        tex={es
          ? String.raw`\mathcal L=\underbrace{\mathrm{BCE}(F)+\bigl(1-\mathrm{Dice}(F)\bigr)}_{\text{interior}}+\underbrace{\overline{(1+4B)\,\mathrm{BCE}(B)}}_{\text{lamela}}+2\,\underbrace{\mathrm{SmoothL1}(D)}_{\text{distancia}}`
          : String.raw`\mathcal L=\underbrace{\mathrm{BCE}(F)+\bigl(1-\mathrm{Dice}(F)\bigr)}_{\text{interior}}+\underbrace{\overline{(1+4B)\,\mathrm{BCE}(B)}}_{\text{lamella}}+2\,\underbrace{\mathrm{SmoothL1}(D)}_{\text{distance}}`}
        caption={es
          ? 'La pérdida real: el interior combina entropía cruzada y Dice; la frontera pesa 1 mas 4 veces el objetivo, de modo que un píxel de lamela cuenta cinco veces uno que no lo es; la distancia entra con peso 2. N1 agrega un cuarto término de centro con peso 1 mas 6 veces el objetivo.'
          : 'The real loss: interior combines cross-entropy and Dice; boundary is weighted 1 plus 4 times the target, so a lamella pixel counts five times a non-lamella one; distance enters with weight 2. N1 adds a fourth centre term weighted 1 plus 6 times the target.'}
      />
      {/* loss terms and weights 4, 2 and 6: data-pipeline/fslab/learning/train_multitask.py lines 102-125 */}

      <p className="measure">{es
        ? 'Los pesos de la pérdida no son decoración: la lamela es una clase minoritaria delgada y sin sobrepeso el modelo aprende a ignorarla, que es precisamente el fracaso que las separaciones y uniones miden. Después del entrenamiento, la calibración barre 81 combinaciones de umbral (interior, frontera, marcador y distancia mínima) sobre una sola realización de apariencia por grupo de calibración y selecciona por AP media, nunca por prueba. El resultado medido de los dos modelos de tres cabezas es casi el mismo: AP 0.3247 y PQ 0.5694 para el de marcadores profundos, AP 0.3190 y PQ 0.5582 para el de contexto global, una diferencia de 0.0057. La lectura honesta es que el bloque de contexto global no se separa de la línea base de tres cabezas en este banco. El desglose por condición sí los separa en un punto: bajo la tormenta de brillo el modelo de marcadores profundos sostiene 0.287 y el de contexto global cae a 0.160, de modo que el contexto agregado no ayuda cuando el indicio local está saturado.'
        : 'The loss weights are not decoration: the lamella is a thin minority class and without overweighting the model learns to ignore it, which is precisely the failure that splits and merges measure. After training, calibration sweeps 81 threshold combinations (interior, boundary, marker and minimum distance) over a single appearance realisation per calibration group and selects by mean AP, never by test. The measured result of the two three-head models is nearly the same: AP 0.3247 and PQ 0.5694 for the deep-marker one, AP 0.3190 and PQ 0.5582 for the global-context one, a difference of 0.0057. The honest reading is that the global-context block does not separate itself from the three-head baseline on this benchmark. The per-condition breakdown does separate them at one point: under the glare storm the deep-marker model holds 0.287 while the global-context one falls to 0.160, so aggregated context does not help when the local cue is saturated.'}</p>
      {/* 81-combination calibration grid: data-pipeline/fslab/learning/train_multitask.py lines 146-151 */}
      {/* L2 and L3 held-out and glare-storm AP: frontend/public/data/method-benchmark.json methods[8], methods[9] */}

      <Callout variant="honest" title={es ? 'Qué está probado y qué solo está nombrado' : 'What is proven and what is only named'}>
        <p>{es
          ? 'L1 supera al mejor clásico y no supera al generalista preentrenado; se acepta como el modelo aprendido compacto y desplegable, no se anuncia como estado del arte. L2 y L3 son implementaciones internas: nombran su categoría de investigación, no una afirmación de rendimiento, y no reclaman equivalencia de código fuente con implementaciones de referencia no disponibles. El artículo citado en cada caso acredita la procedencia arquitectónica, no una reproducción. Los tres modelos se entrenaron sobre 192 muestras sintéticas y su comportamiento fuera de esa distribución se mide aparte, no se supone.'
          : 'L1 beats the best classical method and does not beat the pretrained generalist; it is accepted as the compact deployable learned model, not advertised as state of the art. L2 and L3 are in-repository implementations: they name their research category, not a performance claim, and they claim no source-code equivalence with unavailable reference implementations. The paper cited in each case credits architectural provenance, not a reproduction. All three models were trained on 192 synthetic samples and their behaviour outside that distribution is measured separately, not assumed.'}</p>
      </Callout>

      <Refs ids={['ronneberger2015unet', 'zhu2025gcfsegnet', 'fan2024parallel', 'meyer1994']} label={refsLabel} />
    </div>
  );

  // ============================================================
  // 3b. L4, L6: OBJECT-PARAMETERISED PREDICTION
  // ============================================================
  const objectTab = (
    <div className="prose">
      <p className="measure">{es
        ? 'Existe una alternativa a predecir campos por píxel: parametrizar el objeto. En vez de dejar que el postproceso decida cuántas instancias hay, la red propone objetos completos y la supresión de no máximos decide cuáles sobreviven. Dos métodos del banco toman ese camino por rutas muy distintas, y los dos comparten una propiedad que ninguno de los modelos densos tiene: emiten una confianza por instancia, que es lo único que hace que calibrar una probabilidad tenga sentido a nivel de objeto.'
        : 'There is an alternative to predicting per-pixel fields: parameterise the object. Instead of letting post-processing decide how many instances there are, the network proposes whole objects and non-maximum suppression decides which survive. Two methods in the benchmark take that route by very different paths, and both share a property none of the dense models has: they emit a per-instance confidence, which is the only thing that makes calibrating a probability meaningful at the object level.'}{' '}<Cite id="brier1950" paren /></p>

      <p className="measure">{es
        ? 'L4 es StarDist oficial, versión 0.9.2 con csbdeep, no una reimplementación. La representación es la idea del método: para cada píxel la red predice una probabilidad de objeto y 32 distancias radiales a la frontera del objeto a lo largo de direcciones fijas, de modo que un candidato de instancia es un polígono estrellado centrado en ese píxel. Los candidatos se ordenan por probabilidad y se suprimen por solapamiento. La configuración usada es de 32 rayos con una retícula de submuestreo de 2 por 2, entrenada 12 épocas de 24 pasos sobre la misma caché sin fuga, y los umbrales de probabilidad y de supresión se optimizan sobre los grupos de calibración antes de tocar la prueba.'
        : 'L4 is official StarDist, version 0.9.2 with csbdeep, not a reimplementation. The representation is the idea of the method: for each pixel the network predicts an object probability and 32 radial distances to the object boundary along fixed directions, so an instance candidate is a star-convex polygon centred on that pixel. Candidates are ranked by probability and suppressed by overlap. The configuration used is 32 rays with a 2 by 2 subsampling grid, trained for 12 epochs of 24 steps on the same leakage-safe cache, and the probability and suppression thresholds are optimised on the calibration groups before the test is touched.'}{' '}<Cite id="schmidt2018stardist" paren /></p>
      {/* n_rays=32, grid=(2,2), 12 epochs x 24 steps, optimize_thresholds on calibration: data-pipeline/fslab/learning/train_stardist.py lines 50-119 */}

      <Equation
        tex={String.raw`P(x)=\Bigl\{\,x+r_k(x)\bigl(\cos\theta_k,\sin\theta_k\bigr)\Bigr\}_{k=0}^{31},\qquad \theta_k=\frac{2\pi k}{32}`}
        caption={es
          ? 'Representación estrellada: r_k(x) es la distancia radial predicha en el píxel x hacia la dirección θ_k, y P(x) el polígono candidato de 32 vértices. La forma que el modelo puede expresar está limitada por esa parametrización radial.'
          : 'Star-convex representation: r_k(x) is the predicted radial distance at pixel x toward direction θ_k, and P(x) the 32-vertex candidate polygon. The shape the model can express is limited by that radial parameterisation.'}
      />

      <p className="measure">{es
        ? 'El resultado medido es el más bajo de los métodos aprendidos y la razón no es la que se supondría. En la prueba retenida L4 obtiene AP 0.1119, AP50 0.3473, PQ 0.3242 y F de frontera 0.7104, la más baja de todo el tier aprendido salvo el segmentador fundacional sin prompts, con 4462 uniones y 3592 separaciones. La convexidad estrellada no es la restricción que aprieta: una celda de Laguerre es convexa, así que casi cualquier burbuja del banco es representable como polígono estrellado. Lo que aprieta es que la parametrización está anclada a un solo centro y que 32 rayos no pueden seguir las aristas rectas y las uniones facetadas de una espuma empacada a la resolución donde dos celdas comparten una película corta: el vértice más cercano a la película cae dentro o fuera de ella, y con eso llegan la unión y la separación al mismo tiempo.'
        : 'The measured result is the lowest of the learned methods and the reason is not the one that would be assumed. On the held-out test L4 scores AP 0.1119, AP50 0.3473, PQ 0.3242 and boundary F 0.7104, the lowest of the whole learned tier except the unprompted foundation segmenter, with 4462 merges and 3592 splits. Star convexity is not the binding constraint: a Laguerre cell is convex, so almost every bubble in the benchmark is representable as a star-convex polygon. What binds is that the parameterisation is anchored to a single centre and that 32 rays cannot follow the straight edges and faceted junctions of a packed foam at the resolution where two cells share a short film: the vertex nearest the film lands inside or outside it, and with that come the merge and the split at once.'}</p>
      {/* L4 held-out metrics and micro merges/splits: frontend/public/data/method-benchmark.json methods[10] */}

      <p className="measure">{es
        ? 'Hay una limitación de plataforma que debe declararse porque afecta a la lectura del costo: la rueda oficial de TensorFlow 2.21 es solo CPU en Windows nativo, así que el repositorio fija la variante de CPU en Windows y la variante completa en Linux o WSL2. La corrida completada reporta CPU de forma explícita y su latencia media es 547.0 milisegundos por muestra; no debe describirse como GPU. El resultado queda por debajo de la barra y se conserva de todas formas, con el checkpoint oficial, la configuración, los umbrales, los registros de entrenamiento y la evidencia por caso, porque un resultado negativo implementado con procedencia verificable vale más que una fila ausente.'
        : 'There is a platform limitation that must be declared because it changes how the cost reads: the official TensorFlow 2.21 wheel is CPU-only on native Windows, so the repository pins the CPU variant on Windows and the full variant on Linux or WSL2. The completed run reports CPU explicitly and its mean latency is 547.0 milliseconds per sample; it must not be described as GPU. The result is below the bar and is kept anyway, with the official checkpoint, the configuration, the thresholds, the training logs and the per-case evidence, because an implemented negative result with verifiable provenance is worth more than a missing row.'}</p>
      {/* CPU-only TensorFlow on native Windows: docs/frameworks/10_stardist/README.md lines 12-15; 547.0 ms and hardware_lane cpu: frontend/public/data/method-benchmark.json methods[10].compute */}

      <p className="measure">{es
        ? 'L6 llega al mismo problema desde la detección. Las máscaras exactas se exportan como anotaciones poligonales, se entrena el modelo oficial de segmentación de una etapa (la variante nano de la generación 11) durante 20 épocas a 192 píxeles sobre CUDA, y se predice con umbral de confianza 0.1. Las máscaras se devuelven al contrato común pintándolas en orden ASCENDENTE de confianza, de modo que la instancia más confiable se pinta última y gana los solapes; la confianza por instancia se conserva para calibrar. En la prueba retenida obtiene AP 0.2930, AP50 0.5766, PQ 0.5326 y una distancia de Wasserstein de 1.464, mejor que la de la U-Net de frontera, con 10002 instancias predichas contra 17846 verdaderas y solo 727 separaciones.'
        : 'L6 arrives at the same problem from detection. The exact masks are exported as polygon annotations, the official one-stage segmentation model (the nano variant of the eleventh generation) is trained for 20 epochs at 192 pixels on CUDA, and prediction runs at a confidence threshold of 0.1. Masks are returned to the common contract by painting them in ASCENDING confidence order, so the most confident instance is painted last and wins overlaps; the per-instance confidence is retained for calibration. On the held-out test it scores AP 0.2930, AP50 0.5766, PQ 0.5326 and a Wasserstein distance of 1.464, better than that of the boundary U-Net, with 10002 predicted instances against 17846 true ones and only 727 splits.'}{' '}<Cite id="redmon2016yolo" paren /></p>
      {/* yolo11n-seg, 20 epochs, imgsz 192, conf 0.1, ascending-confidence painting: data-pipeline/fslab/learning/train_yolo_seg.py lines 78-100, 135-190 */}

      <Figure caption={es
        ? 'Dos parametrizaciones de objeto y el mismo mapa entero de salida. Un polígono de 32 rayos no puede seguir una película corta compartida; un detector decide por instancia y su recall queda limitado por el presupuesto de detección.'
        : 'Two object parameterisations and the same integer output map. A 32-ray polygon cannot follow a short shared film; a detector decides per instance and its recall is limited by the detection budget.'}>
        <svg viewBox="0 0 760 300" className="fig-svg wide" role="img" aria-labelledby="objTitle objDesc">
          <title id="objTitle">{es ? 'Polígono estrellado frente a detección por instancia' : 'Star-convex polygon versus per-instance detection'}</title>
          <desc id="objDesc">{es
            ? 'A la izquierda, tres celdas empacadas y un polígono de 32 rayos trazado desde el centro de la celda central: los vértices se separan de la película recta compartida. A la derecha, la misma escena con cajas y máscaras por instancia pintadas en orden ascendente de confianza. Abajo, las cifras medidas de ambos métodos.'
            : 'On the left, three packed cells and a 32-ray polygon drawn from the centre of the middle cell: the vertices depart from the straight shared film. On the right, the same scene with per-instance boxes and masks painted in ascending confidence order. Below, the measured figures of both methods.'}</desc>

          <text x="8" y="20" className="dg-box-title">L4 · 32 {es ? 'rayos' : 'rays'} · {es ? 'retícula 2x2' : 'grid 2x2'}</text>
          <g transform="translate(24,30)">
            {/* two packed Laguerre cells sharing one straight film */}
            <polygon points="20,10 120,10 150,60 120,120 20,120 -6,60" className="dg-curve-faint" />
            <polygon points="150,60 120,120 170,170 240,150 250,80" className="dg-curve-faint" />
            <line x1="150" y1="60" x2="120" y2="120" className="dg-asymptote" />
            <polygon
              points={Array.from({ length: 32 }, (_, k) => {
                const angle = (2 * Math.PI * k) / 32 - Math.PI / 2;
                const radius = 56 + 10 * Math.cos(4 * angle);
                return `${(62 + radius * Math.cos(angle)).toFixed(1)},${(65 + radius * Math.sin(angle)).toFixed(1)}`;
              }).join(' ')}
              className="dg-fill-accent"
            />
            {Array.from({ length: 32 }, (_, k) => {
              const angle = (2 * Math.PI * k) / 32 - Math.PI / 2;
              const radius = 56 + 10 * Math.cos(4 * angle);
              return (
                <line
                  key={k}
                  x1="62"
                  y1="65"
                  x2={(62 + radius * Math.cos(angle)).toFixed(1)}
                  y2={(65 + radius * Math.sin(angle)).toFixed(1)}
                  className="dg-grid"
                />
              );
            })}
            <circle cx="62" cy="65" r="3.5" className="dg-node" />
            <text x="170" y="86" className="dg-marker-label">{es ? 'película recta' : 'straight film'}</text>
            <text x="0" y="176" className="dg-box-sub">{es ? '32 radios desde un centro' : '32 radii from one centre'}</text>
            <text x="0" y="194" className="dg-note">{es ? 'los vértices caen dentro o fuera de la película' : 'the vertices land inside or outside the film'}</text>
          </g>

          <text x="404" y="20" className="dg-box-title">L6 · conf 0.1 · imgsz 192</text>
          <g transform="translate(420,30)">
            <polygon points="20,10 120,10 150,60 120,120 20,120 -6,60" className="dg-curve-faint" />
            <polygon points="150,60 120,120 170,170 240,150 250,80" className="dg-curve-faint" />
            <polygon points="20,10 120,10 150,60 120,120 20,120 -6,60" className="dg-fill-accent" />
            <rect x="-6" y="10" width="156" height="110" className="dg-marker" fill="none" />
            <text x="152" y="24" className="dg-marker-label">0.82</text>
            <polygon points="150,60 120,120 170,170 240,150 250,80" className="dg-fill-warn" />
            <rect x="120" y="60" width="130" height="110" className="dg-marker" fill="none" />
            <text x="252" y="168" className="dg-marker-label">0.64</text>
            <text x="0" y="194" className="dg-note">{es ? 'orden ascendente de confianza: la más confiable pinta última' : 'ascending confidence order: the most confident paints last'}</text>
          </g>

          <line x1="8" y1="240" x2="752" y2="240" className="dg-grid" />
          <text x="8" y="270" className="dg-box-sub">L4: AP 0.1119 · PQ 0.3242 · {es ? 'F de frontera' : 'boundary F'} 0.7104 · 547.0 ms {es ? '(CPU)' : '(CPU)'}</text>
          <text x="8" y="290" className="dg-box-sub">L6: AP 0.2930 · PQ 0.5326 · W1 1.464 · 300.9 ms {es ? '(GPU)' : '(GPU)'}</text>
        </svg>
      </Figure>

      <p className="measure">{es
        ? 'El detector es el único método del banco cuya exhaustividad está limitada por un presupuesto de detección en lugar de por un umbral, y su firma temporal lo muestra: en la secuencia de transporte nominal registra solo 2 cambios de identidad, el segundo mejor de todo el carril por cuadros, y a la vez 52 fragmentos de trayectoria con cobertura media de 0.872. Es decisivo por instancia e intermitente en encontrarlas. Su desglose por condición reparte igual de fuerte: 0.538 en espuma gruesa, donde hay pocos objetos grandes y bien separados, y 0.032 en la nube de microburbujas, donde el número de objetos excede lo que el presupuesto puede proponer.'
        : 'The detector is the only method in the benchmark whose recall is limited by a detection budget rather than by a threshold, and its temporal signature shows it: on the nominal transport sequence it records only 2 identity switches, the second best of the whole framewise lane, and at the same time 52 track fragments with a mean coverage of 0.872. It is decisive per instance and intermittent at finding them. Its per-condition breakdown splits just as sharply: 0.538 on coarse froth, where there are few large well-separated objects, and 0.032 on the microbubble cloud, where the object count exceeds what the budget can propose.'}</p>
      {/* 2 switches, 52 fragments, coverage 0.872 on poly-normal: frontend/public/data/temporal/yolo_froth_seg.json */}
      {/* coarse-froth 0.538 and microbubble-cloud 0.032: frontend/public/data/method-benchmark.json methods[12].test.robustness_by_condition */}

      <Equation
        tex={es
          ? String.raw`\text{objetivo}=\mathbf 1\!\left[\max_g \mathrm{IoU}(p,g)\ge 0.5\right],\qquad \mathrm{Brier}=\frac1N\sum_i\left(c_i-y_i\right)^2`
          : String.raw`\text{target}=\mathbf 1\!\left[\max_g \mathrm{IoU}(p,g)\ge 0.5\right],\qquad \mathrm{Brier}=\frac1N\sum_i\left(c_i-y_i\right)^2`}
        caption={es
          ? 'Calibración a nivel de objeto: c_i es la confianza declarada de la instancia predicha p_i e y_i el resultado observado, que vale 1 cuando esa instancia empareja alguna verdad con IoU al menos 0.5. Solo los métodos con confianza por instancia admiten esta medición.'
          : 'Object-level calibration: c_i is the stated confidence of predicted instance p_i and y_i the observed outcome, which is 1 when that instance matches some truth at IoU of at least 0.5. Only methods with a per-instance confidence admit this measurement.'}
      />
      {/* instance-level calibration target and match_iou 0.5: data-pipeline/fslab/science/segment.py lines 471-501 */}

      <Callout variant="honest" title={es ? 'Dos límites que no son de calidad' : 'Two limits that are not about quality'}>
        <p>{es
          ? 'El primero es de licencia: el paquete del detector es AGPL-3.0 salvo licencia empresarial, y eso es una compuerta de distribución que sigue vigente incluso cuando la calidad pasa la barra. El segundo es de plataforma: la corrida de StarDist es de CPU en Windows nativo por la rueda oficial disponible, así que su latencia no es comparable con las corridas de GPU de la misma tabla. Ninguno de los dos métodos supera la compuerta de AP 0.30, el detector por 0.007 y el modelo estrellado con claridad, y ambos se publican con su evidencia completa en lugar de retirarse.'
          : 'The first is licensing: the detector package is AGPL-3.0 unless an enterprise licence applies, and that is a distribution gate that stands even when quality clears the bar. The second is platform: the StarDist run is CPU on native Windows because of the available official wheel, so its latency is not comparable with the GPU runs in the same table. Neither method clears the AP 0.30 gate, the detector by 0.007 and the star-convex model clearly, and both are published with their full evidence rather than withdrawn.'}</p>
      </Callout>

      <Refs ids={['schmidt2018stardist', 'redmon2016yolo', 'brier1950']} label={refsLabel} />
    </div>
  );

  // ============================================================
  // 4a. L5: THE FLOW-FIELD GENERALIST
  // ============================================================
  const flowTab = (
    <div className="prose">
      <p className="measure">{es
        ? 'Cellpose resuelve la separación de instancias sin watershed, sin marcadores y sin prior de forma, y por eso su mecanismo merece explicarse en detalle: es la única familia del banco que no delega la decisión de cuántos objetos hay a un operador morfológico. La red predice un campo vectorial denso en el que cada píxel de un objeto apunta hacia un punto fijo interior de ese objeto, obtenido por difusión desde su interior, junto con una probabilidad de pertenencia. Para agrupar, se sigue el campo: cada píxel del primer plano se transporta iterativamente en la dirección del vector local hasta converger, y todos los píxeles que llegan al mismo punto fijo forman una instancia. Dos burbujas en contacto se separan porque sus campos apuntan a puntos fijos distintos, no porque exista una barrera detectable entre ellas.'
        : 'Cellpose solves instance separation without watershed, without markers and without a shape prior, which is why its mechanism deserves a detailed explanation: it is the only family in the benchmark that does not delegate the decision of how many objects there are to a morphological operator. The network predicts a dense vector field in which every pixel of an object points toward a fixed interior point of that object, obtained by diffusion from its interior, together with a membership probability. To group, the field is followed: each foreground pixel is transported iteratively along the local vector until it converges, and all pixels arriving at the same fixed point form one instance. Two touching bubbles separate because their fields point to different fixed points, not because a detectable barrier exists between them.'}{' '}<Cite id="stringer2021cellpose" paren /></p>

      <Equation
        tex={String.raw`p_{t+1}=p_t+\mathbf v\bigl(p_t\bigr),\qquad \hat Y^{-1}(k)=\Bigl\{x\in\Omega:\ \lim_{t\to\infty}p_t(x)=z_k\Bigr\}`}
        caption={es
          ? 'Agrupamiento por seguimiento de flujo: v es el campo vectorial predicho, p_t la trayectoria de un píxel y z_k el punto fijo de la instancia k. Una instancia es la cuenca de atracción de su punto fijo, sin marcador externo.'
          : 'Flow-following grouping: v is the predicted vector field, p_t the trajectory of a pixel and z_k the fixed point of instance k. An instance is the basin of attraction of its fixed point, with no external marker.'}
      />

      <p className="measure">{es
        ? 'Cellpose-SAM sustituye la espina dorsal convolucional por un codificador de imagen transformer preentrenado de la familia SAM, de modo que el campo de flujo se predice sobre representaciones aprendidas en un corpus enorme de objetos densos. Lo que este repositorio ejecuta es el paquete oficial, versión 4.2.1.1, sobre CUDA, con ajuste fino de dos épocas completas partiendo del checkpoint preentrenado sobre las 192 muestras de entrenamiento y usando las 64 de validación sin mezclar grupos. La comprobación de dispositivo es dura: si CUDA no está disponible la corrida falla, no cae en silencio a CPU, y el dispositivo del modelo se verifica después de construirlo. El checkpoint resultante pesa 1.22 GB y permanece local; el manifiesto de corrida registra su tamaño exacto en bytes, su SHA-256, el modelo base, la partición de datos, los hiperparámetros, el dispositivo y las pérdidas, para que el resultado sea reproducible sin versionar un binario redundante.'
        : 'Cellpose-SAM replaces the convolutional backbone with a pretrained transformer image encoder of the SAM family, so the flow field is predicted over representations learned on a very large corpus of dense objects. What this repository runs is the official package, version 4.2.1.1, on CUDA, with two complete epochs of fine-tuning from the pretrained checkpoint over the 192 training samples and using the 64 validation samples without mixing groups. The device check is hard: if CUDA is unavailable the run fails, it does not silently fall back to CPU, and the model device is verified after construction. The resulting checkpoint is 1.22 GB and stays local; the run manifest records its exact byte size, its SHA-256, the base model, the data split, the hyperparameters, the device and the losses, so the result is reproducible without versioning a redundant binary.'}{' '}<Cite id="kirillov2023" paren /></p>
      {/* official cellpose 4.2.1.1, cpsam_v2, CUDA-required, 2 epochs, 1.22 GB: docs/frameworks/11_cellpose-sam/README.md lines 3-22 */}
      {/* CUDA assertion and device verification: data-pipeline/fslab/foundation/cellpose_sam.py lines 56-70 */}

      <p className="measure">{es
        ? 'Los parámetros de inferencia se fijaron antes de mirar la prueba y se dejan a la vista porque son la regla de decisión completa del método: diámetro automático, normalización en escala de grises, umbral de flujo 0.4, umbral de probabilidad de celda 0.0 y tamaño mínimo 5 píxeles, en lotes de 8. Nada de eso se reajustó después. El resultado es el más fuerte de todos los métodos individuales medidos: AP 0.5099, AP50 0.8238, PQ 0.7227, F de frontera 0.9675 y una distancia de Wasserstein de 0.583, que es 4.4 veces mejor que la del mejor método clásico y la mejor fidelidad de distribución de toda la matriz, con 13015 instancias predichas, 1690 uniones y 513 separaciones, a 324.5 milisegundos por muestra en la GPU portátil.'
        : 'The inference parameters were fixed before the test was looked at and are left in plain sight because they are the complete decision rule of the method: automatic diameter, grayscale normalisation, flow threshold 0.4, cell-probability threshold 0.0 and a minimum size of 5 pixels, in batches of 8. None of it was retuned afterwards. The result is the strongest of all measured single methods: AP 0.5099, AP50 0.8238, PQ 0.7227, boundary F 0.9675 and a Wasserstein distance of 0.583, which is 4.4 times better than that of the best classical method and the best distribution fidelity in the whole matrix, with 13015 predicted instances, 1690 merges and 513 splits, at 324.5 milliseconds per sample on the laptop GPU.'}</p>
      {/* flow_threshold 0.4, cellprob_threshold 0.0, min_size 5, diameter None, batch 8: data-pipeline/fslab/foundation/cellpose_sam.py lines 74-85 */}
      {/* L5 held-out metrics and latency: frontend/public/data/method-benchmark.json methods[11] */}

      <Equation
        tex={es
          ? String.raw`p_F(x)=\frac{1}{1+e^{-c(x)}}\ \ \text{si}\ \ c\notin[0,1],\qquad \mathrm{Brier}=\frac1{|\Omega|}\sum_{x\in\Omega}\bigl(p_F(x)-\mathbf 1[Y(x)>0]\bigr)^2`
          : String.raw`p_F(x)=\frac{1}{1+e^{-c(x)}}\ \ \text{if}\ \ c\notin[0,1],\qquad \mathrm{Brier}=\frac1{|\Omega|}\sum_{x\in\Omega}\bigl(p_F(x)-\mathbf 1[Y(x)>0]\bigr)^2`}
        caption={es
          ? 'Calibración por píxel del canal de probabilidad de celda: c es el canal crudo que el modelo devuelve, que se pasa por una sigmoide solo cuando cae fuera del intervalo unidad, y luego se compara con la máscara verdadera. Sin ese paso, un canal de logits produciría un Brier sin sentido.'
          : 'Per-pixel calibration of the cell-probability channel: c is the raw channel the model returns, passed through a sigmoid only when it falls outside the unit interval, and then compared with the true mask. Without that step, a logit channel would produce a meaningless Brier score.'}
      />
      {/* sigmoid applied only when the cellprob channel falls outside [0,1], then Brier/ECE against truth: data-pipeline/fslab/foundation/cellpose_sam.py lines 26-40 */}

      <p className="measure">{es
        ? 'El desglose por condición es donde el método deja de ser un número y empieza a ser información. Cellpose-SAM domina donde hay estructura clara: 0.800 en espuma gruesa, 0.649 en la condición nominal polidispersa, 0.585 bajo tormenta de brillo (5.6 veces el mejor clásico en esa misma condición) y 0.484 en espuma fina. Pero en desenfoque óptico cae a 0.275, por debajo de la U-Net compacta de L1 con 0.389 y de LamellaStar con 0.485, y en la nube de microburbujas queda en 0.162. Es decir: el generalista preentrenado gana precisamente donde el indicio existe y es ambiguo, y no gana donde el indicio ha sido borrado por la óptica o donde el objeto es más pequeño que su escala aprendida. Esa es una lectura útil para elegir método por régimen y no por tabla de posiciones.'
        : 'The per-condition breakdown is where the method stops being a number and starts being information. Cellpose-SAM dominates where structure is clear: 0.800 on coarse froth, 0.649 on the nominal polydisperse condition, 0.585 under the glare storm (5.6 times the best classical method on that same condition) and 0.484 on fine froth. But on optical defocus it falls to 0.275, below the L1 compact U-Net at 0.389 and LamellaStar at 0.485, and on the microbubble cloud it lands at 0.162. In other words: the pretrained generalist wins precisely where the cue exists and is ambiguous, and does not win where the cue has been erased by the optics or where the object is smaller than its learned scale. That is a useful reading for choosing a method by regime rather than by leaderboard.'}</p>
      {/* per-condition AP for L5, L1 and N1: frontend/public/data/method-benchmark.json robustness_by_condition */}

      <Figure caption={es
        ? 'AP por condición de los tres métodos que se disputan la cabeza del banco. El generalista preentrenado gana en espuma gruesa y brillo; el modelo con compuertas de lamela gana en desenfoque, movimiento y espuma acuosa; los tres colapsan en la nube de microburbujas.'
        : 'Per-condition AP of the three methods contending for the head of the benchmark. The pretrained generalist wins on coarse froth and glare; the lamella-gated model wins on defocus, motion and watery froth; all three collapse on the microbubble cloud.'}>
        <svg viewBox="0 0 760 300" className="fig-svg wide" role="img" aria-labelledby="condTitle condDesc">
          <title id="condTitle">{es ? 'AP por condición, tres métodos' : 'Per-condition AP, three methods'}</title>
          <desc id="condDesc">{es
            ? 'Barras agrupadas de AP media por condición para Cellpose-SAM, LamellaStar y la U-Net de frontera sobre siete condiciones de la prueba retenida.'
            : 'Grouped bars of mean AP per condition for Cellpose-SAM, LamellaStar and the boundary U-Net over seven held-out conditions.'}</desc>

          <line x1="80" y1="230" x2="748" y2="230" className="dg-axis" />
          <line x1="80" y1="30" x2="80" y2="230" className="dg-axis" />
          {[0, 0.2, 0.4, 0.6, 0.8].map((v) => (
            <g key={v}>
              <line x1="80" y1={230 - v * 240} x2="748" y2={230 - v * 240} className="dg-grid" />
              <text x="72" y={234 - v * 240} className="dg-tick" textAnchor="end">{v.toFixed(1)}</text>
            </g>
          ))}
          <text x="16" y="24" className="dg-axis-label">AP</text>

          {([
            [es ? 'gruesa' : 'coarse', 0.800, 0.530, 0.297],
            [es ? 'polidispersa' : 'polydisperse', 0.649, 0.664, 0.551],
            [es ? 'brillo' : 'glare', 0.585, 0.527, 0.398],
            [es ? 'acuosa' : 'watery', 0.521, 0.536, 0.495],
            [es ? 'movimiento' : 'motion', 0.412, 0.479, 0.387],
            [es ? 'desenfoque' : 'defocus', 0.275, 0.485, 0.389],
            [es ? 'microburbujas' : 'microbubbles', 0.162, 0.120, 0.205],
          ] as Array<[string, number, number, number]>).map(([label, l5, n1, l1], i) => {
            const x = 96 + i * 92;
            return (
              <g key={label}>
                <rect x={x} y={230 - l5 * 240} width="20" height={l5 * 240} className="dg-bar" />
                <rect x={x + 22} y={230 - n1 * 240} width="20" height={n1 * 240} className="dg-bar-2" />
                <rect x={x + 44} y={230 - l1 * 240} width="20" height={l1 * 240} className="dg-fill-accent" />
                <text x={x + 32} y="248" className="dg-bar-label" textAnchor="middle">{label}</text>
              </g>
            );
          })}

          <rect x="96" y="268" width="16" height="10" className="dg-bar" />
          <text x="118" y="278" className="dg-box-sub">L5 Cellpose-SAM</text>
          <rect x="264" y="268" width="16" height="10" className="dg-bar-2" />
          <text x="286" y="278" className="dg-box-sub">N1 LamellaStar</text>
          <rect x="424" y="268" width="16" height="10" className="dg-fill-accent" />
          <text x="446" y="278" className="dg-box-sub">L1 {es ? 'U-Net de frontera' : 'boundary U-Net'}</text>
        </svg>
      </Figure>

      <p className="measure">{es
        ? 'En el carril de secuencias el mismo modelo queda segundo en estabilidad entre los métodos por cuadro: HOTA media 0.913 sobre las cinco secuencias, detrás de LamellaStar con 0.917, y en la de transporte nominal HOTA 0.965 con un único cambio de identidad, 8 fragmentos de trayectoria y cobertura media 0.954, con un error de punto final de flujo de 0.232 píxeles en esa secuencia; 0.435 es la media de las cinco y no una cifra por secuencia. Esa estabilidad no proviene de ningún modelo temporal, porque no tiene ninguno: proviene de que sus máscaras por cuadro son consistentes, que es exactamente lo que el protocolo por cuadros mide. Y es también el único método aprendido cuya cifra MEJORA al pasar a fotografías reales de objetos densos en contacto, de 0.510 a 0.709, con los mismos ajustes de espuma.'
        : 'In the sequence lane the same model comes second in stability among the framewise methods: mean HOTA 0.913 over the five sequences, behind LamellaStar at 0.917, and on nominal transport HOTA 0.965 with a single identity switch, 8 track fragments and a mean coverage of 0.954, with a flow endpoint error of 0.232 pixels on that sequence; 0.435 is the five-sequence mean and not a per-sequence figure. That stability comes from no temporal model, because it has none: it comes from its per-frame masks being consistent, which is exactly what the framewise protocol measures. It is also the only learned method whose figure IMPROVES on real photographs of dense touching objects, from 0.510 to 0.709, with the same froth settings.'}</p>
      {/* mean HOTA 0.913 and mean_flow_epe_px 0.4348: frontend/public/data/temporal/cellpose_sam.json top level */}
      {/* poly-normal hota 0.9649, id_switches 1, track_fragmentations 8, mean_frame_coverage 0.9537, flow_epe_px 0.23245: same file, sequences[0] */}
      {/* real adjacent 0.709 from froth 0.510: docs/benchmark/02_real-domain-transfer.md line 82 */}

      <Callout variant="honest" title={es ? 'Por qué la mejora en datos reales no dice lo que parece' : 'Why the real-data improvement does not say what it looks like'}>
        <p>{es
          ? 'El conjunto real adyacente es microscopía de núcleos celulares, que es el dominio de preentrenamiento de este modelo: juega en casa. Por lo tanto la subida a 0.709 mide robustez al cambio de dominio, no superioridad en espuma, y no autoriza a decir que Cellpose-SAM es mejor EN ESPUMA que los especialistas entrenados aquí. La cifra sintética tampoco es exactitud de planta: es un resultado de banco controlado sobre un generador. Ninguna fuente real de espuma con licencia ha entrado al carril puntuado, así que la comparación entre este modelo y el resto sigue siendo una comparación dentro de un generador.'
          : 'The adjacent real set is cell-nucleus microscopy, which is the pretraining domain of this model: it is playing at home. The rise to 0.709 therefore measures robustness to domain shift, not superiority on froth, and it does not license the statement that Cellpose-SAM is better ON FROTH than the specialists trained here. The synthetic figure is not plant accuracy either: it is a controlled-benchmark result over a generator. No licensed real froth source has entered the scored lane, so the comparison between this model and the rest remains a comparison inside a generator.'}</p>
      </Callout>

      <Refs ids={['stringer2021cellpose', 'kirillov2023']} label={refsLabel} />
    </div>
  );

  // ============================================================
  // 4b. L7: THE PROMPTED SEGMENTER USED WITHOUT PROMPTS
  // ============================================================
  const promptTab = (
    <div className="prose">
      <p className="measure">{es
        ? 'SAM 2.1 no es un segmentador de espuma y no se entrenó aquí sobre ninguna etiqueta de espuma. Es un segmentador promptable, y el generador automático de máscaras es el modo en que se lo usa sin prompts humanos: se codifica la imagen UNA vez, se barre una rejilla de puntos de primer plano contra ese embedding, se conservan las máscaras que el decodificador considera confiables y estables, se eliminan duplicados y las supervivientes se pintan en un mapa disjunto. Todo el diseño existe para que el codificador pesado corra una sola vez y el decodificador ligero corra muchas. Medirlo en este banco responde una pregunta distinta de las anteriores: qué obtiene un modelo fundacional general, sin ningún ajuste al dominio, sobre una superficie densa de objetos translúcidos.'
        : 'SAM 2.1 is not a froth segmenter and was not trained here on any froth label. It is a promptable segmenter, and the automatic mask generator is how it is used without human prompts: the image is encoded ONCE, a grid of foreground points is swept against that embedding, the masks the decoder considers confident and stable are kept, duplicates are removed, and the survivors are painted into a disjoint map. The whole design exists so the heavy encoder runs once and the light decoder runs many times. Measuring it on this benchmark answers a different question from the previous ones: what a general foundation model obtains, without any domain fitting, on a dense surface of translucent objects.'}{' '}<Cite id="kirillov2023" paren /> <Cite id="ravi2024sam2" paren /></p>

      <p className="measure">{es
        ? 'Los ajustes de la corrida oficial están fijados y son la explicación del resultado. La rejilla es de 8 puntos por lado, es decir 64 prompts para todo el cuadro, decodificados en lotes de 64; el umbral de IoU predicho es 0.7 y el de puntaje de estabilidad 0.8; el área mínima de región de máscara es 5 píxeles; el refinamiento máscara a máscara está activo; la salida es máscara binaria. La inferencia exige CUDA y falla si no la encuentra. El código fuente aguas arriba está anclado a un commit concreto bajo licencia Apache-2.0 y el checkpoint oficial de la variante jerárquica tiny, facebook/sam2.1-hiera-tiny, la más pequeña de la familia y no la variante small, viaja con su tamaño y su SHA-256 en el manifiesto de corrida. El adaptador ordena las máscaras por IoU predicho ascendente, con el área como criterio de desempate, y las pinta en ese orden, de modo que la máscara de mayor IoU predicho se pinta última y gana los solapes.'
        : 'The settings of the official run are fixed and they are the explanation of the result. The grid is 8 points per side, that is 64 prompts for the whole frame, decoded in batches of 64; the predicted-IoU threshold is 0.7 and the stability-score threshold is 0.8; the minimum mask-region area is 5 pixels; mask-to-mask refinement is on; the output is a binary mask. Inference requires CUDA and fails without it. The upstream source is pinned to a specific commit under the Apache-2.0 licence and the official checkpoint of the tiny hierarchical variant, facebook/sam2.1-hiera-tiny, the smallest of the family and not the small variant, travels with its size and SHA-256 in the run manifest. The adapter orders masks by ascending predicted IoU, with area as the tiebreak, and paints them in that order, so the mask with the highest predicted IoU is painted last and wins overlaps.'}</p>
      {/* points_per_side 8, points_per_batch 64, pred_iou 0.7, stability 0.8, min area 5, use_m2m, CUDA-required, pinned commit: data-pipeline/fslab/foundation/sam2_1.py lines 23-84 */}
      {/* MODEL_ID facebook/sam2.1-hiera-tiny: data-pipeline/fslab/foundation/sam2_1.py line 23; checkpoint manifest models/sam2-1-hiera-tiny/run.json; docs/frameworks/13_sam2/README.md line 16 */}

      <Equation
        tex={es
          ? String.raw`\mathrm{estabilidad}=\frac{\bigl|\{\ell(p)>+\delta\}\bigr|}{\bigl|\{\ell(p)>-\delta\}\bigr|},\qquad \text{descartar si }\hat\imath<0.7\ \text{o}\ \mathrm{estabilidad}<0.8`
          : String.raw`\mathrm{stability}=\frac{\bigl|\{\ell(p)>+\delta\}\bigr|}{\bigl|\{\ell(p)>-\delta\}\bigr|},\qquad \text{discard if }\hat\imath<0.7\ \text{or}\ \mathrm{stability}<0.8`}
        caption={es
          ? 'Filtro de estabilidad: ℓ es el campo de logits de la máscara, δ el desplazamiento del umbral, y la razón mide cuánto cambia la máscara al mover el umbral. Con IoU predicho î, una máscara sobrevive solo si supera ambos umbrales.'
          : 'Stability filter: ℓ is the mask logit field, δ the threshold offset, and the ratio measures how much the mask changes when the threshold moves. With predicted IoU î, a mask survives only if it clears both thresholds.'}
      />

      <p className="measure">{es
        ? 'El resultado medido es el segundo más bajo de los ocho métodos aprendidos y fundacionales, por debajo también de dos líneas base clásicas, y su causa es la exhaustividad, no la localización. En la prueba retenida obtiene AP 0.1352, AP50 0.1821, PQ 0.2391, F de frontera 0.5493 y una distancia de Wasserstein de 27.150, la peor de la matriz por un factor de 1.6 sobre la siguiente. Los conteos lo explican solos: 2365 instancias predichas sobre 64 cuadros, es decir unas 37 máscaras por cuadro, frente a 17846 instancias verdaderas, unas 279 por cuadro. Una rejilla de 8 por 8 tiene 64 prompts, así que ni en el mejor caso puede proponer una máscara por burbuja; y el filtro de estabilidad elimina precisamente las máscaras de película delgada y translúcida que la espuma produce, porque son las más sensibles al umbral. Su conteo de uniones (289) es el más bajo de todo el banco y el de separaciones (175) solo es superado por el umbral global que sub-segmenta, por la razón trivial de que casi no predice.'
        : 'The measured result is the second lowest of the eight learned and foundation methods, and it also sits below two classical baselines; its cause is recall, not localisation. On the held-out test it scores AP 0.1352, AP50 0.1821, PQ 0.2391, boundary F 0.5493 and a Wasserstein distance of 27.150, the worst in the matrix by a factor of 1.6 over the next one. The counts explain it on their own: 2365 predicted instances over 64 frames, that is roughly 37 masks per frame, against 17846 true instances, roughly 279 per frame. An 8 by 8 grid has 64 prompts, so even at best it cannot propose one mask per bubble; and the stability filter removes exactly the thin translucent film masks froth produces, because they are the most threshold-sensitive. Its merge count (289) is the lowest in the whole benchmark and its split count (175) is bettered only by the under-segmenting global threshold, for the trivial reason that it barely predicts.'}</p>
      {/* L7 held-out metrics and micro counts: frontend/public/data/method-benchmark.json methods[13] */}

      <Figure caption={es
        ? 'Dos geometrías detrás de la exhaustividad. A la izquierda, el mismo filtro de estabilidad sobre dos perfiles de logit: en un borde nítido de tapa los conjuntos de nivel a más δ y a menos δ casi coinciden y la máscara sobrevive; en una película delgada y translúcida se separan y la razón cae por debajo de 0.8. A la derecha, el presupuesto de 64 prompts, las 37 máscaras que sobreviven y las 279 burbujas medias por cuadro.'
        : 'Two geometries behind the recall. On the left, the same stability filter over two logit profiles: on a crisp cap boundary the level sets at plus δ and minus δ almost coincide and the mask survives; on a thin translucent film they separate and the ratio falls below 0.8. On the right, the 64-prompt budget, the 37 masks that survive and the 279 mean bubbles per frame.'}>
        <svg viewBox="0 0 760 300" className="fig-svg wide" role="img" aria-labelledby="samTitle samDesc">
          <title id="samTitle">{es ? 'El filtro de estabilidad y el presupuesto de prompts' : 'The stability filter and the prompt budget'}</title>
          <desc id="samDesc">{es
            ? 'Dos perfiles del campo de logits de una máscara cruzando cero, con las líneas de más δ y menos δ marcadas y el ancho del conjunto de nivel medido en cada una. En el borde nítido los dos anchos casi coinciden y la razón se acerca a 1; en la película delgada el ancho a menos δ es mucho mayor y la razón queda por debajo de 0.8, de modo que la máscara se descarta. A la derecha, barras de 64 prompts, 37 máscaras y 279 burbujas por cuadro.'
            : 'Two profiles of a mask logit field crossing zero, with the plus δ and minus δ lines marked and the level-set width measured at each. On the crisp boundary the two widths almost coincide and the ratio approaches 1; on the thin film the width at minus δ is far larger and the ratio falls below 0.8, so the mask is discarded. On the right, bars of 64 prompts, 37 masks and 279 bubbles per frame.'}</desc>

          {([
            [96, 20, es ? 'borde nítido de tapa' : 'crisp cap boundary', es ? 'razón cercana a 1: sobrevive' : 'ratio near 1: survives', true],
            [226, 112, es ? 'película delgada translúcida' : 'thin translucent film', es ? 'razón bajo 0.8: descartada' : 'ratio below 0.8: discarded', false],
          ] as Array<[number, number, string, string, boolean]>).map(([y0, ramp, title, verdict, survives]) => (
            <g key={y0}>
              <text x="8" y={y0 - 52} className="dg-box-title">{title}</text>
              <line x1="20" y1={y0} x2="404" y2={y0} className="dg-axis" />
              <text x="408" y={y0 + 4} className="dg-tick">0</text>
              <line x1="20" y1={y0 - 16} x2="404" y2={y0 - 16} className="dg-marker" />
              <text x="408" y={y0 - 12} className="dg-marker-label">+δ</text>
              <line x1="20" y1={y0 + 16} x2="404" y2={y0 + 16} className="dg-asymptote" />
              <text x="408" y={y0 + 24} className="dg-marker-label">-δ</text>
              <path
                d={`M20 ${y0 + 38} H${90 - ramp / 2} L${90 + ramp / 2} ${y0 - 38} H${334 - ramp / 2} L${334 + ramp / 2} ${y0 + 38} H404`}
                className={survives ? 'dg-curve' : 'dg-curve-2'}
              />
              <path d={`M${90 + 0.2105 * ramp} ${y0 - 16} H${334 - 0.2105 * ramp}`} className="dg-edge" />
              <line x1={90 + 0.2105 * ramp} y1={y0 - 22} x2={90 + 0.2105 * ramp} y2={y0 - 10} className="dg-edge" />
              <line x1={334 - 0.2105 * ramp} y1={y0 - 22} x2={334 - 0.2105 * ramp} y2={y0 - 10} className="dg-edge" />
              <text x={212} y={y0 - 30} className="dg-edge-label" textAnchor="middle">{es ? 'ancho a +δ' : 'width at +δ'}</text>
              <path d={`M${90 - 0.2105 * ramp} ${y0 + 16} H${334 + 0.2105 * ramp}`} className="dg-edge" />
              <line x1={90 - 0.2105 * ramp} y1={y0 + 10} x2={90 - 0.2105 * ramp} y2={y0 + 22} className="dg-edge" />
              <line x1={334 + 0.2105 * ramp} y1={y0 + 10} x2={334 + 0.2105 * ramp} y2={y0 + 22} className="dg-edge" />
              <text x={212} y={y0 + 40} className="dg-edge-label" textAnchor="middle">{es ? 'ancho a -δ' : 'width at -δ'}</text>
              <text x="8" y={y0 + 60} className="dg-note">{verdict}</text>
            </g>
          ))}

          <line x1="470" y1="266" x2="752" y2="266" className="dg-axis" />
          <text x="470" y="40" className="dg-box-sub">{es ? 'por cuadro' : 'per frame'}</text>
          {([
            [es ? '64 prompts' : '64 prompts', 64, 476],
            [es ? '37 máscaras' : '37 masks', 37, 566],
            [es ? '279 burbujas' : '279 bubbles', 279, 656],
          ] as Array<[string, number, number]>).map(([label, value, x]) => (
            <g key={label}>
              <rect x={x} y={266 - value / 2} width="72" height={value / 2} className={value === 279 ? 'dg-bar-2' : 'dg-bar'} />
              <text x={x + 36} y={260 - value / 2} className="dg-tick" textAnchor="middle">{value}</text>
              <text x={x + 36} y="284" className="dg-bar-label" textAnchor="middle">{label}</text>
            </g>
          ))}
        </svg>
      </Figure>
      {/* stability ratio at offset delta and the 0.8 cut: data-pipeline/fslab/foundation/sam2_1.py lines 23-84 (stability_score_thresh) */}
      {/* 64 prompts (points_per_side 8), 2365 masks over 64 frames (37 per frame) and 17846 truth (279 per frame): frontend/public/data/method-benchmark.json methods[13].test.micro */}

      <p className="measure">{es
        ? 'El desglose por condición confirma el diagnóstico de presupuesto. En espuma gruesa, donde hay pocos objetos grandes, el mismo modelo con la misma rejilla alcanza 0.459, comparable con métodos entrenados; en espuma fina cae a 0.023 y en la nube de microburbujas a 0.000 exacto. El número de objetos, no su apariencia, es lo que decide. Existe además un carril de navegador heredado que usa el mismo algoritmo con un presupuesto mucho mayor: una variante ligera y podada de SAM corre en el cliente con una rejilla de 32 por 32, es decir 1024 prompts, umbral de IoU predicho 0.86, estabilidad 0.90 con desplazamiento 1.0, supresión de duplicados a IoU 0.7, área mínima de 25 píxeles y máxima de la mitad del cuadro, con un margen de 0.02 respecto al borde. Ese carril se etiqueta como heredado porque el generalista de flujo lidera la comparación retenida y no puede reducirse a ese entorno sin una exportación validada aparte.'
        : 'The per-condition breakdown confirms the budget diagnosis. On coarse froth, where there are few large objects, the same model with the same grid reaches 0.459, comparable with trained methods; on fine froth it falls to 0.023 and on the microbubble cloud to exactly 0.000. The number of objects, not their appearance, is what decides. There is also a legacy browser lane that uses the same algorithm with a far larger budget: a pruned lightweight SAM variant runs client-side with a 32 by 32 grid, that is 1024 prompts, a predicted-IoU threshold of 0.86, stability 0.90 at offset 1.0, duplicate suppression at IoU 0.7, a minimum area of 25 pixels and a maximum of half the frame, with a 0.02 inset from the border. That lane is labelled legacy because the flow generalist leads the held-out comparison and cannot be reduced to that runtime without a separately validated export.'}{' '}<Cite id="chen2023slimsam" paren /> <Cite id="onnxruntimeweb" paren /></p>
      {/* L7 per-condition AP: frontend/public/data/method-benchmark.json methods[13].test.robustness_by_condition */}
      {/* browser lane defaults gridSize 32, predIouThresh 0.86, stabilityThresh 0.90, offset 1.0, nmsIou 0.7, minAreaPx 25, maxAreaFrac 0.5, cropMarginFrac 0.02: docs/frameworks/02_sam-method/sam-method.md lines 120-133 */}

      <Equation
        tex={es
          ? String.raw`\text{suprimir }m_j\ \text{si}\ \exists\,m_i\ \text{ya aceptada con}\ \mathrm{IoU}(m_i,m_j)>0.7,\qquad \text{orden por }\hat\imath\cdot\mathrm{estabilidad}`
          : String.raw`\text{suppress }m_j\ \text{if}\ \exists\,m_i\ \text{already accepted with}\ \mathrm{IoU}(m_i,m_j)>0.7,\qquad \text{order by }\hat\imath\cdot\mathrm{stability}`}
        caption={es
          ? 'Supresión de no máximos codiciosa del carril de navegador: m son máscaras candidatas, î el IoU predicho, y el orden de aceptación es el producto de confianza por estabilidad. En el carril oficial el orden equivalente es por IoU predicho con el área como desempate.'
          : 'Greedy non-maximum suppression of the browser lane: m are candidate masks, î the predicted IoU, and the acceptance order is confidence times stability. In the official lane the equivalent order is by predicted IoU with area as the tiebreak.'}
      />

      <Callout variant="honest" title={es ? 'Un resultado negativo que se conserva tal cual' : 'A negative result kept as it is'}>
        <p>{es
          ? '2365 máscaras para 17846 instancias verdaderas es un resultado negativo, y se conserva como tal, con su commit anclado, su checkpoint verificado por hash y su evidencia por caso. No se subió la densidad de la rejilla después de ver la cifra: los ajustes se fijaron antes de evaluar y cambiarlos habría convertido la prueba retenida en un tablero de optimización. Tampoco se presenta este número como el techo del modelo: mide el generador automático con 64 prompts sobre espuma densa, no la capacidad del segmentador cuando alguien le da prompts, que es el uso para el que fue construido. La comparación con el generalista de flujo es asimétrica por construcción, porque ese sí recibió ajuste fino en este dominio.'
          : '2365 masks for 17846 true instances is a negative result, and it is kept as one, with its pinned commit, its hash-verified checkpoint and its per-case evidence. The grid density was not raised after the figure was seen: the settings were fixed before evaluating and changing them would have turned the held-out test into an optimisation dashboard. Nor is this number presented as the ceiling of the model: it measures the automatic generator with 64 prompts on dense froth, not the capability of the segmenter when someone gives it prompts, which is what it was built for. The comparison with the flow generalist is asymmetric by construction, because that one did receive fine-tuning in this domain.'}</p>
      </Callout>

      <Refs ids={['kirillov2023', 'ravi2024sam2', 'chen2023slimsam', 'onnxruntimeweb']} label={refsLabel} />
    </div>
  );

  // ============================================================
  // 5. N1 LAMELLASTAR
  // ============================================================
  const frontierTab = (
    <div className="prose">
      <p className="measure">{es
        ? 'La hipótesis de N1 sale de dos hechos medidos en el resto del banco y no de una intuición. Primero: en el tier clásico el método más fuerte es el que ignora los reflejos y traza la lamela oscura, así que la señal específica de la espuma es el valle de película y no el brillo. Segundo: en el tier aprendido denso el modo de error que sobrevive es la separación bajo brillo y movimiento, es decir marcadores de más donde el indicio local se rompe. De ahí las dos adiciones concretas: una cuarta cabeza que predice evidencia de centro por instancia, para que la construcción de semillas no dependa solo de la distancia interior, y compuertas multiplicativas en las conexiones de salto, para que el decodificador pueda atenuar los rasgos del codificador que llevan reflejo en lugar de película.'
        : 'The N1 hypothesis comes out of two facts measured elsewhere in the benchmark and not out of an intuition. First: in the classical tier the strongest method is the one that ignores highlights and traces the dark lamella, so the froth-specific signal is the film valley and not the glint. Second: in the dense learned tier the surviving error mode is splitting under glare and motion, that is extra markers where the local cue breaks. Hence the two concrete additions: a fourth head predicting per-instance centre evidence, so that seed construction does not depend on interior distance alone, and multiplicative gates on the skip connections, so the decoder can attenuate the encoder features that carry highlight rather than film.'}{' '}<Cite id="wang2003froth" paren /></p>

      <p className="measure">{es
        ? 'El grafo es explícito. Dos niveles de codificación con el mismo bloque doble de convolución, normalización por lote y SiLU; un puente de dos bloques dilatados a factor 2 y luego 3, que amplía el campo receptivo sin submuestrear más; y en cada nivel del decodificador una compuerta que concatena la señal ascendente con la conexión de salto, la pasa por una convolución 1 por 1 y una sigmoide, y usa el resultado para multiplicar la conexión de salto ANTES de concatenarla. La cabeza final es una convolución 1 por 1 a cuatro canales: interior, frontera de lamela, distancia interior y centro. Los objetivos de centro se construyen poniendo un uno en el argmax de la transformada de distancia de cada instancia, suavizando el campo de puntos con una gaussiana de sigma 1.25 y normalizando el máximo a uno, porque un centro es un solo píxel antes de suavizar y una clase de un píxel no es aprendible.'
        : 'The graph is explicit. Two encoding levels with the same double block of convolution, batch normalisation and SiLU; a bridge of two blocks dilated at factor 2 and then 3, which widens the receptive field without further downsampling; and at each decoder level a gate that concatenates the upsampled signal with the skip connection, passes it through a 1 by 1 convolution and a sigmoid, and uses the result to multiply the skip connection BEFORE concatenating it. The final head is a 1 by 1 convolution to four channels: interior, lamella boundary, interior distance and centre. The centre targets are built by placing a one at the argmax of the distance transform of each instance, smoothing the point field with a Gaussian of sigma 1.25 and normalising the maximum to one, because a centre is a single pixel before smoothing and a one-pixel class is not learnable.'}{' '}<Cite id="ronneberger2015unet" paren /></p>
      {/* gated skips, dilations 2 and 3, 4-channel head: data-pipeline/fslab/learning/multitask_models.py lines 92-122 */}
      {/* centre target: per-instance EDT argmax, Gaussian sigma 1.25, max-normalised: data-pipeline/fslab/learning/multitask_models.py lines 144-158 */}

      <Equation
        tex={String.raw`g_\ell=\sigma\!\left(W_\ell\ast\bigl[u_\ell,\,e_\ell\bigr]\right),\qquad d_\ell=\operatorname{block}\!\left(\bigl[u_\ell,\ e_\ell\odot g_\ell\bigr]\right)`}
        caption={es
          ? 'Compuerta de salto: u es la señal ascendente del decodificador, e la conexión de salto del codificador, W la convolución 1 por 1 de la compuerta, σ la sigmoide y el círculo con punto el producto elemento a elemento. La compuerta decide qué parte del codificador entra al decodificador.'
          : 'Skip gate: u is the upsampled decoder signal, e the encoder skip connection, W the 1 by 1 gate convolution, σ the sigmoid and the circled dot the elementwise product. The gate decides which part of the encoder enters the decoder.'}
      />

      <Equation
        tex={es
          ? String.raw`S=(1-w)\,\underbrace{D\,(1-B)}_{\text{distancia}}+w\,\underbrace{C}_{\text{centro}},\qquad w\in\{0,\ 0.25,\ 0.5,\ 0.75,\ 1\}`
          : String.raw`S=(1-w)\,\underbrace{D\,(1-B)}_{\text{distance}}+w\,\underbrace{C}_{\text{centre}},\qquad w\in\{0,\ 0.25,\ 0.5,\ 0.75,\ 1\}`}
        caption={es
          ? 'Mezcla de semillas: D es la distancia interior predicha, B la frontera predicha, C la evidencia de centro y w el peso de centro, elegido en calibración dentro de esa rejilla de cinco valores. Con w igual a 0 el modelo se comporta como uno de tres cabezas.'
          : 'Seed blend: D is the predicted interior distance, B the predicted boundary, C the centre evidence and w the centre weight, chosen on calibration within that five-value grid. At w equal to 0 the model behaves like a three-head one.'}
      />
      {/* centre-weight sweep {0, 0.25, 0.5, 0.75, 1}: data-pipeline/fslab/learning/train_multitask.py line 146 */}

      <p className="measure">{es
        ? 'La parte que importa de N1 no es la arquitectura sino el registro de selección, porque es lo que separa un resultado de una historia contada al revés. Hubo tres estudios preregistrados, todos seleccionados por AP de validación únicamente, y en total tres evaluaciones sobre la prueba retenida. El primero comparó anchos 16, 24 y 32 durante 24 épocas y luego repitió el ancho ganador durante 40 épocas con tres semillas; la semilla ganadora alcanzó AP de validación 0.4766 y ese único checkpoint se evaluó una vez en la prueba, dando 0.4717. El segundo comparó ensambles de probabilidad y de logits, promediado de test-time con las ocho simetrías del cuadrado, promediado de ensamble con las mismas simetrías, aumento geométrico y fotométrico durante el entrenamiento, y continuación hasta 80 épocas; ganó la continuación con validación 0.4998, con una compuerta de robustez fijada de antemano que exigía AP mínima por condición de 0.075 y a lo más cuatro condiciones degradadas en más de 0.03: se observaron 0.0828 y cero condiciones degradadas. Ese finalista se evaluó una vez en la prueba: 0.4904, AP50 0.7891, PQ 0.7089, Brier 0.0125 y ECE 0.0088.'
        : 'The part of N1 that matters is not the architecture but the selection record, because that is what separates a result from a story told backwards. There were three preregistered studies, all selected on validation AP only, and three held-out test evaluations in total. The first compared widths 16, 24 and 32 for 24 epochs and then repeated the winning width for 40 epochs with three seeds; the winning seed reached a validation AP of 0.4766 and that single checkpoint was evaluated once on the test, giving 0.4717. The second compared probability and logit ensembles, test-time averaging over the eight square symmetries, ensemble averaging over the same symmetries, geometric and photometric training augmentation, and continuation to 80 epochs; the continuation won with validation 0.4998, under a robustness gate fixed in advance requiring a minimum per-condition AP of 0.075 and at most four conditions degraded by more than 0.03: 0.0828 and zero degraded conditions were observed. That finalist was evaluated once on the test: 0.4904, AP50 0.7891, PQ 0.7089, Brier 0.0125 and ECE 0.0088.'}</p>
      {/* study 1 and 2 validation, gates and test values: verification/n1-preregistered-ablation.json studies[0], studies[1] */}

      <p className="measure">{es
        ? 'El tercer estudio es el interesante porque su hipótesis fue refutada y quedó escrita. La hipótesis preregistrada decía que la brecha restante frente al generalista de flujo era un déficit de entrenamiento que un calendario más largo cerraría. No lo era: a 120 épocas, la dispersión entre semillas de la misma configuración es 0.03744 alrededor de una media de 0.50198, y promediando sobre semillas las 120 épocas valen unos 0.002 sobre las 80. Es decir, la aparente tendencia monótona a lo largo de 24, 40, 80 y 120 épocas era una semilla medida en cada longitud. La regla de selección fijada antes de correr, que era la mayor AP de validación sin criterio de desempate, eligió entonces un ensamble de tres semillas por promedio de logits, con validación 0.524 y peor condición 0.1202 en la nube de microburbujas. La tercera y única evaluación final del estudio dio AP 0.51859, AP50 0.8279, PQ 0.7359 y F de frontera 0.9876.'
        : 'The third study is the interesting one because its hypothesis was refuted and the refutation stayed written down. The preregistered hypothesis said the remaining gap to the flow generalist was a training deficit that a longer schedule would close. It was not: at 120 epochs, the seed spread of the same configuration is 0.03744 around a mean of 0.50198, and averaged over seeds 120 epochs is worth about 0.002 over 80. That is, the apparent monotone trend across 24, 40, 80 and 120 epochs was one seed measured at each length. The selection rule fixed before any run, which was the highest validation AP with no tiebreak, then chose a three-seed logit-mean ensemble, with validation 0.524 and a worst condition of 0.1202 on the microbubble cloud. The third and only final evaluation of the study returned AP 0.51859, AP50 0.8279, PQ 0.7359 and boundary F 0.9876.'}</p>
      {/* refuted hypothesis, seed spread 0.03744 around 0.50198, e120 worth ~0.002 over e80, ensemble selection and final test: verification/n1-preregistered-ablation.json studies[2] */}

      <Figure caption={es
        ? 'Las tres evaluaciones de prueba, el líder medido y la dispersión entre semillas de una sola configuración. El margen sobre el líder es 0.008703; la dispersión entre semillas de un modelo individual es 0.03744, cuatro veces mayor.'
        : 'The three test evaluations, the measured leader and the seed spread of a single configuration. The margin over the leader is 0.008703; the seed spread of a single model is 0.03744, four times larger.'}>
        <svg viewBox="0 0 760 260" className="fig-svg wide" role="img" aria-labelledby="n1Title n1Desc">
          <title id="n1Title">{es ? 'Margen sobre el líder frente a dispersión entre semillas' : 'Margin over the leader versus seed spread'}</title>
          <desc id="n1Desc">{es
            ? 'Una recta de AP entre 0.46 y 0.54. Se marcan las tres evaluaciones de prueba de LamellaStar (0.4717, 0.4904 y 0.5186), la cifra medida de Cellpose-SAM (0.5099) y una banda que representa la dispersión de 0.03744 entre semillas de la configuración de 120 épocas, centrada en su media 0.50198. La banda es cuatro veces más ancha que el margen.'
            : 'An AP line between 0.46 and 0.54. It marks the three LamellaStar test evaluations (0.4717, 0.4904 and 0.5186), the measured Cellpose-SAM figure (0.5099) and a band representing the 0.03744 seed spread of the 120-epoch configuration, centred on its mean of 0.50198. The band is four times wider than the margin.'}</desc>

          <rect x="251.9" y="96" width="308.9" height="40" className="dg-fill-warn" />
          <text x="256" y="90" className="dg-marker-label">{es ? 'dispersión entre semillas, 120 épocas: 0.03744' : 'seed spread, 120 epochs: 0.03744'}</text>

          <line x1="60" y1="136" x2="740" y2="136" className="dg-axis" />
          {([[60, '0.46'], [225, '0.48'], [390, '0.50'], [555, '0.52'], [720, '0.54']] as Array<[number, string]>).map(([x, label]) => (
            <g key={label}>
              <line x1={x} y1="136" x2={x} y2="144" className="dg-axis" />
              <text x={x} y="158" className="dg-tick" textAnchor="middle">{label}</text>
            </g>
          ))}
          <text x="60" y="178" className="dg-axis-label">{es ? 'AP media en la prueba retenida (64 muestras)' : 'mean AP on the held-out test (64 samples)'}</text>

          {([
            [156.5, '0.4717', es ? 'estudio 1' : 'study 1', 60],
            [310.8, '0.4904', es ? 'estudio 2' : 'study 2', 60],
            [543.5, '0.5186', es ? 'estudio 3' : 'study 3', 30],
          ] as Array<[number, string, string, number]>).map(([x, value, label, dy]) => (
            <g key={value}>
              <line x1={x} y1="136" x2={x} y2={dy + 6} className="dg-marker" />
              <circle cx={x} cy="136" r="5" className="dg-node" />
              <text x={x} y={dy} className="dg-node-label" textAnchor="middle">{value}</text>
              <text x={x} y={dy - 16} className="dg-box-sub" textAnchor="middle">{label}</text>
            </g>
          ))}

          <line x1="471.7" y1="136" x2="471.7" y2="196" className="dg-asymptote" />
          <text x="471.7" y="214" className="dg-marker-label" textAnchor="middle">L5 0.5099</text>
          <path d="M471.7 232 H543.5" className="dg-edge" />
          <line x1="471.7" y1="226" x2="471.7" y2="238" className="dg-edge" />
          <line x1="543.5" y1="226" x2="543.5" y2="238" className="dg-edge" />
          <text x="556" y="236" className="dg-edge-label">{es ? 'margen 0.008703' : 'margin 0.008703'}</text>
        </svg>
      </Figure>

      <p className="measure">{es
        ? 'La afirmación que este resultado sostiene es estrecha y conviene decirla completa. Sobre este banco controlado, el ensamble de tres semillas supera al generalista de flujo en cuatro métricas que no están perfectamente correlacionadas (AP, AP50, PQ y F de frontera), bajo un protocolo fijado antes de correr y con una sola evaluación de prueba. El margen en AP es 0.008703. Ese margen es MENOR que la dispersión entre semillas de un modelo individual medida en el mismo estudio, 0.03744. Ensamblar suprime esa varianza por construcción, pero solo se evaluó un sorteo de ensamble, así que la estabilidad de ensamble a ensamble no está medida. La línea base tuvo un presupuesto de ajuste fino de dos pasadas. Y la prueba de transferencia a fotografías reales, medida después de la promoción, muestra a N1 cayendo de 0.519 a 0.125 mientras el generalista sube de 0.510 a 0.709, lo que sitúa la ventaja como específica del generador.'
        : 'The claim this result supports is narrow and it is worth stating in full. On this controlled benchmark the three-seed ensemble exceeds the flow generalist on four metrics that are not perfectly correlated (AP, AP50, PQ and boundary F), under a protocol fixed before any run and with a single test evaluation. The AP margin is 0.008703. That margin is SMALLER than the single-model seed spread measured in the same study, 0.03744. Ensembling suppresses that variance by construction, but only one ensemble draw was evaluated, so ensemble-to-ensemble stability is unmeasured. The baseline had a two-pass fine-tuning budget. And the transfer test on real photographs, measured after promotion, shows N1 falling from 0.519 to 0.125 while the generalist rises from 0.510 to 0.709, which places the advantage as generator-specific.'}{' '}<Cite id="stringer2021cellpose" paren /> <Cite id="lin2014coco" paren /></p>
      {/* margin 0.008703, wins_on four metrics, single ensemble draw, seed spread: verification/n1-preregistered-ablation.json studies[2].outcome */}
      {/* N1 0.519 to 0.125, L5 0.510 to 0.709: docs/benchmark/02_real-domain-transfer.md lines 82, 89 */}

      <p className="measure">{es
        ? 'El resto de la evidencia existe para que nada de lo anterior tenga que creerse. Cada uno de los tres miembros del ensamble viaja con su archivo de pesos y su SHA-256, cada uno tiene su exportación ONNX con su propia verificación de paridad numérica aprobada, y la corrida registra el dispositivo (una GPU portátil de 8188 MiB), la memoria pico asignada en entrenamiento (920.6 MiB) y en evaluación final (266.5 MiB), y los tiempos de continuación de entrenamiento con validación (602.573 segundos) y de calibración y prueba final (305.437 segundos). Por condición, el modelo publicado alcanza 0.664 en la condición nominal polidispersa, 0.536 en espuma acuosa, 0.530 en gruesa, 0.527 bajo brillo, 0.485 en desenfoque y 0.479 en movimiento, y 0.120 en la nube de microburbujas, que sigue siendo su peor condición y la del banco entero.'
        : 'The rest of the evidence exists so that none of the above has to be taken on faith. Each of the three ensemble members travels with its weight file and its SHA-256, each has its ONNX export with its own passed numerical-parity check, and the run records the device (a laptop GPU with 8188 MiB), the peak allocated memory in training (920.6 MiB) and in final evaluation (266.5 MiB), and the times for continued training with validation (602.573 seconds) and for final calibration and test (305.437 seconds). Per condition, the published model reaches 0.664 on the nominal polydisperse condition, 0.536 on watery froth, 0.530 on coarse, 0.527 under glare, 0.485 on defocus and 0.479 on motion, and 0.120 on the microbubble cloud, which remains its worst condition and the worst of the whole benchmark.'}</p>
      {/* member hashes, ONNX parity, compute block: verification/n1-preregistered-ablation.json artifacts, compute */}
      {/* N1 per-condition AP: frontend/public/data/method-benchmark.json methods[14].test.robustness_by_condition */}

      <Callout variant="honest" title={es ? 'Lo que este resultado no es' : 'What this result is not'}>
        <p>{es
          ? 'No es una afirmación de estado del arte, y la bandera correspondiente permanece en falso en el artefacto de banco publicado. Es un resultado de tabla de posiciones sobre datos sintéticos frente a una línea base preentrenada de forma genérica y ajustada en dos pasadas, con un margen menor que el ruido entre semillas y un solo sorteo de ensamble evaluado. No queda ningún grupo de reserva sin tocar tras los tres estudios, de modo que una fusión entre el generalista de flujo y este modelo NO puede seleccionarse ahora sin reutilizar evidencia ya observada, y queda registrada como pendiente de protocolo futuro en lugar de intentarse. Y ninguna cifra de aquí es exactitud de planta.'
          : 'It is not a state-of-the-art claim, and the corresponding flag stays false in the published benchmark artifact. It is a leaderboard result on synthetic data against a generically pretrained baseline fine-tuned in two passes, with a margin smaller than the seed noise and a single evaluated ensemble draw. No untouched reserve groups remain after the three studies, so a fusion between the flow generalist and this model CANNOT be selected now without reusing already-observed evidence, and it is recorded as pending a future protocol rather than attempted. And no figure here is plant accuracy.'}</p>
      </Callout>
      {/* beyond_sota_claim false and deferred candidates: frontend/public/data/method-benchmark.json current_bar; verification/n1-preregistered-ablation.json deferred_candidates */}

      <Refs ids={['ronneberger2015unet', 'wang2003froth', 'stringer2021cellpose', 'lin2014coco']} label={refsLabel} />
    </div>
  );

  // ============================================================
  // 6. SEQUENCES: TWO PROTOCOLS THAT ANSWER DIFFERENT QUESTIONS
  // ============================================================
  const sequenceTab = (
    <div className="prose">
      <p className="measure">{es
        ? 'Una imagen fija pregunta qué tan buena es una máscara. Una celda de flotación pregunta otra cosa: mientras la superficie avanza, brilla y revienta, un método conserva la misma burbuja como la misma burbuja. Responder eso para un método es una anécdota; el carril de secuencias lo responde para la escalera completa bajo un solo protocolo. La cobertura es de 15 métodos, 5 secuencias y 8 cuadros: 75 pares publicados de método y secuencia y 600 cuadros de predicción. La expectativa se deriva del registro de métodos y no de una lista escrita a mano, así que un método no puede entrar a la escalera y saltarse este carril en silencio.'
        : 'A still image asks how good a mask is. A flotation cell asks something else: while the surface advects, glares and bursts, does a method keep the same bubble as the same bubble. Answering that for one method is an anecdote; the sequence lane answers it for the whole ladder under one protocol. Coverage is 15 methods, 5 sequences and 8 frames: 75 published method-sequence pairs and 600 prediction frames. The expectation is derived from the method registry and not from a hand-written list, so a method cannot join the ladder and silently skip this lane.'}</p>
      {/* 15 methods, 5 sequences, 8 frames, 75 pairs, 600 frames, registry-derived expectation: docs/temporal/02_the-full-method-matrix.md lines 10-13 */}

      <p className="measure">{es
        ? 'La verdad temporal es exacta y no rematchada. La geometría se muestrea una vez por secuencia y cada cuadro aplica un desplazamiento suave de sub-burbuja, con amplitud de 3.0 píxeles y fase recorriendo una vuelta completa en los ocho cuadros, junto con una semilla de apariencia distinta por cuadro. Las identidades son por lo tanto exactas y persistentes por construcción, no reemparejadas después. Las cinco secuencias aíslan cinco formas distintas en que la identidad se rompe: transporte nominal con identidades persistentes, espuma fina y densa donde la separación de instancias compite con la continuidad de trayectoria, tormenta de brillo donde los reflejos móviles borran la evidencia de lamela e inventan candidatos de evento, movimiento rápido que pone a prueba la asociación, y reventado donde el cambio topológico es la señal misma, con un nacimiento exacto en el cuadro 2 y una coalescencia en el cuadro 5.'
        : 'The temporal truth is exact and not rematched. Geometry is sampled once per sequence and each frame applies a smooth sub-bubble displacement, with an amplitude of 3.0 pixels and a phase completing one full turn over the eight frames, together with a distinct appearance seed per frame. Identities are therefore exact and persistent by construction, not rematched afterwards. The five sequences isolate five different ways identity breaks: nominal transport with persistent identities, dense fine froth where instance separation competes with track continuity, a glare storm where moving highlights erase lamella evidence and invent event candidates, fast motion that stresses association, and bursting where topological change is the signal itself, with an exact birth on frame 2 and a coalescence on frame 5.'}</p>
      {/* displacement 3.0 px, one phase turn over 8 frames, per-frame appearance seed, birth at frames//3 and coalescence at 2*frames//3: data-pipeline/fslab/science/froth_gen.py lines 162-232 */}

      <p className="measure">{es
        ? 'Sobre esa verdad corren DOS protocolos que responden preguntas distintas, y la distinción decide si los números significan algo. El primero es segmentación por cuadro con asociación de identidad por IoU, y cubre C1 a C7, L1 a L6 y N1. Ninguno de esos catorce métodos posee un modelo temporal: cada uno segmenta cada cuadro de forma independiente y las identidades se asignan DESPUÉS, construyendo la matriz de solape entre cuadros consecutivos, resolviendo la asignación bipartita óptima sobre el negativo de la IoU y conservando un par solo cuando su IoU alcanza 0.25, con una identidad nueva cuando no hay pareja. Sus puntajes de identidad miden por lo tanto la estabilidad de las máscaras a lo largo del tiempo, no la calidad de un rastreador que el método contenga.'
        : 'Over that truth run TWO protocols that answer different questions, and the distinction decides whether the numbers mean anything. The first is framewise segmentation with IoU identity association, and it covers C1 to C7, L1 to L6 and N1. None of those fourteen methods owns a temporal model: each segments every frame independently and identities are assigned AFTERWARDS, by building the overlap matrix between consecutive frames, solving the optimal bipartite assignment over the negated IoU and keeping a pair only when its IoU reaches 0.25, with a new identity when there is no match. Their identity scores therefore measure the stability of the masks over time, not the quality of a tracker the method contains.'}{' '}<Cite id="kuhn1955hungarian" paren /></p>
      {/* framewise mode, association threshold 0.25, linear_sum_assignment on negated IoU: data-pipeline/fslab/temporal.py lines 28-85 */}

      <Equation
        tex={es
          ? String.raw`C_{ij}=1-\mathrm{IoU}\!\left(Y^{t-1}_i,\,Y^{t}_j\right),\qquad \pi^\star=\arg\min_\pi\sum_i C_{i\,\pi(i)},\qquad \text{aceptar si }\mathrm{IoU}\ge0.25`
          : String.raw`C_{ij}=1-\mathrm{IoU}\!\left(Y^{t-1}_i,\,Y^{t}_j\right),\qquad \pi^\star=\arg\min_\pi\sum_i C_{i\,\pi(i)},\qquad \text{accept if }\mathrm{IoU}\ge0.25`}
        caption={es
          ? 'Asociación por cuadros: C es la matriz de costo entre las instancias del cuadro anterior y las del actual, π una asignación uno a uno y π* la óptima. Un par por debajo de 0.25 de IoU no se acepta y la instancia recibe una identidad nueva.'
          : 'Framewise association: C is the cost matrix between the instances of the previous frame and those of the current one, π a one-to-one assignment and π* the optimal one. A pair below 0.25 IoU is not accepted and the instance receives a new identity.'}
      />

      <p className="measure">{es
        ? 'El segundo protocolo es propagación nativa de video con prompt, y cubre un solo método, L7. Ese modelo lleva su propia memoria a través de los cuadros, se le entrega UNA vez las máscaras exactas de verdad de una cohorte de 12 instancias en el cuadro 0, y propaga hacia adelante sobre cuadros posteriores intactos. Nunca se le pide descubrir nada. La consecuencia es aritmética y no evidencia: IDF1 y HOTA valen 1.000 en las cinco secuencias, la cobertura es 1.000 y las fragmentaciones de trayectoria son cero, porque se le dieron doce identidades y se lo evalúa sobre si todavía tiene doce. Su cifra honesta de calidad es otra: la IoU media de identidad, 0.8985 sobre las cinco secuencias, con exhaustividad de identidad a 0.5 de 0.9854 y un error de punto final de centroide de 0.411 píxeles. Eso mide cuán bien las máscaras propagadas siguen cubriendo los objetos que se le entregaron.'
        : 'The second protocol is native prompted video propagation, and it covers a single method, L7. That model carries its own memory across frames, is handed ONCE the exact ground-truth masks of a 12-instance cohort on frame 0, and propagates forward over untouched later frames. It is never asked to discover anything. The consequence is arithmetic and not evidence: IDF1 and HOTA are 1.000 on all five sequences, coverage is 1.000 and track fragmentations are zero, because it was given twelve identities and is evaluated on whether it still has twelve. Its honest quality figure is a different one: the mean identity IoU, 0.8985 over the five sequences, with identity recall at 0.5 of 0.9854 and a centroid endpoint error of 0.411 pixels. That measures how well the propagated masks still cover the objects it was handed.'}{' '}<Cite id="ravi2024sam2" paren /></p>
      {/* 12-instance cohort, first-frame truth prompts, IDF1/HOTA 1.000, mean identity IoU 0.8985, recall@0.5 0.9854, EPE 0.411, zero fragmentations: frontend/public/data/temporal/sam2_1.json */}

      <Figure caption={es
        ? 'Dos protocolos, dos preguntas. Los mismos ocho cuadros y la misma verdad exacta, pero uno mide estabilidad de máscara y el otro retención de una cohorte entregada; sus métricas de identidad nunca se ordenan juntas.'
        : 'Two protocols, two questions. The same eight frames and the same exact truth, but one measures mask stability and the other retention of a handed cohort; their identity metrics are never ranked together.'}>
        <svg viewBox="0 0 760 320" className="fig-svg wide" role="img" aria-labelledby="seqTitle seqDesc">
          <title id="seqTitle">{es ? 'Los dos protocolos temporales' : 'The two temporal protocols'}</title>
          <desc id="seqDesc">{es
            ? 'Carril superior: catorce métodos segmentan cada cuadro por separado y una asignación bipartita con umbral de IoU 0.25 asigna identidades después, produciendo HOTA entre 0.150 y 0.917. Carril inferior: un método recibe doce máscaras verdaderas en el cuadro 0 y propaga, produciendo HOTA 1.000 por construcción y una IoU de identidad de 0.8985.'
            : 'Upper lane: fourteen methods segment each frame separately and a bipartite assignment with an IoU threshold of 0.25 assigns identities afterwards, producing HOTA between 0.150 and 0.917. Lower lane: one method receives twelve true masks on frame 0 and propagates, producing HOTA 1.000 by construction and an identity IoU of 0.8985.'}</desc>
          <defs>
            <marker id="seqArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0L10 5L0 10z" className="dg-arrowhead" />
            </marker>
          </defs>

          <text x="8" y="20" className="dg-box-title">{es ? 'A · por cuadro + asociación IoU · C1-C7, L1-L6, N1' : 'A · framewise + IoU association · C1-C7, L1-L6, N1'}</text>
          {[0, 1, 2, 3].map((frame) => {
            const x = 8 + frame * 132;
            return (
              <g key={`a-${frame}`}>
                <rect x={x} y="32" width="108" height="76" rx="8" className="dg-box" />
                <text x={x + 10} y="48" className="dg-box-sub">t{frame}</text>
                <circle cx={x + 40 + frame * 3} cy="76" r="18" className="dg-node" />
                <circle cx={x + 82 - frame * 2} cy="86" r="13" className="dg-node" />
                {frame < 3 && (
                  <>
                    <path d={`M${x + 108} 70 H${x + 130}`} className="dg-edge" markerEnd="url(#seqArrow)" />
                    <text x={x + 100} y="124" className="dg-edge-label">IoU 0.25</text>
                  </>
                )}
              </g>
            );
          })}
          <rect x="540" y="32" width="212" height="76" rx="8" className="dg-box accent" />
          <text x="554" y="52" className="dg-box-title accent">{es ? 'mide estabilidad de máscara' : 'measures mask stability'}</text>
          <text x="554" y="72" className="dg-box-sub">{es ? 'HOTA 0.150 a 0.917' : 'HOTA 0.150 to 0.917'}</text>
          <text x="554" y="90" className="dg-box-sub">{es ? 'ningún modelo temporal' : 'no temporal model'}</text>

          <line x1="8" y1="150" x2="752" y2="150" className="dg-grid" />

          <text x="8" y="178" className="dg-box-title">{es ? 'B · propagación nativa con prompt · L7' : 'B · native prompted propagation · L7'}</text>
          {[0, 1, 2, 3].map((frame) => {
            const x = 8 + frame * 132;
            return (
              <g key={`b-${frame}`}>
                <rect x={x} y="190" width="108" height="76" rx="8" className={frame === 0 ? 'dg-box good' : 'dg-box'} />
                <text x={x + 10} y="206" className="dg-box-sub">t{frame}</text>
                {frame === 0 && (
                  <text x={x + 40} y="206" className="dg-marker-label">{es ? '12 dadas' : '12 given'}</text>
                )}
                <circle cx={x + 40 + frame * 3} cy="234" r="18" className={frame === 0 ? 'dg-fill-accent' : 'dg-node'} />
                <circle cx={x + 82 - frame * 2} cy="244" r="13" className={frame === 0 ? 'dg-fill-accent' : 'dg-node'} />
                {frame < 3 && (
                  <>
                    <path d={`M${x + 108} 228 H${x + 130}`} className="dg-edge" markerEnd="url(#seqArrow)" />
                    <text x={x + 92} y="286" className="dg-edge-label">{es ? 'memoria' : 'memory'}</text>
                  </>
                )}
              </g>
            );
          })}
          <rect x="540" y="190" width="212" height="76" rx="8" className="dg-box accent" />
          <text x="554" y="210" className="dg-box-title accent">{es ? 'mide retención' : 'measures retention'}</text>
          <text x="554" y="230" className="dg-box-sub">HOTA 1.000 · IDF1 1.000</text>
          <text x="554" y="248" className="dg-box-sub">{es ? 'IoU de identidad 0.8985' : 'identity IoU 0.8985'}</text>
          <text x="8" y="312" className="dg-note">{es ? 'los dos carriles no se promedian ni se ordenan juntos: miden preguntas distintas' : 'the two lanes are neither averaged nor ranked together: they measure different questions'}</text>
        </svg>
      </Figure>

      <p className="measure">{es
        ? 'Ordenar L7 contra el carril por cuadros le acreditaría una ventaja que el protocolo le entrega, así que el modo viaja con cada fila publicada, el selector de método agrupa por modo, y la tabla de comparación pone los métodos de video nativo en una sección aparte con la razón declarada en el lugar. Ningún agregado los mezcla, y esa es la quinta regla del contrato de agregación, no una cortesía editorial. Dentro del carril por cuadros el orden sí es informativo. Promediado sobre las cinco secuencias, la HOTA vale 0.917 para LamellaStar, 0.913 para Cellpose-SAM, 0.879 para la U-Net de frontera, 0.823 para el watershed de marcadores profundos, 0.806 para el de contexto global, 0.769 para el detector, 0.668 para el modelo estrellado, 0.631 para el watershed de distancia, 0.597 para el trazador de lamelas, 0.451 y 0.435 para los dos watershed restantes, 0.341 para el umbral global, 0.263 para la fusión de superpíxeles y 0.150 para la inmersión sin marcadores.'
        : 'Ranking L7 against the framewise lane would credit it with an advantage the protocol hands it, so the mode travels with every published row, the method picker groups by mode, and the comparison table puts native-video methods in a separate section with the reason stated in place. No aggregate mixes them, and that is the fifth rule of the aggregation contract, not an editorial courtesy. Inside the framewise lane the order is informative. Averaged over the five sequences, HOTA is 0.917 for LamellaStar, 0.913 for Cellpose-SAM, 0.879 for the boundary U-Net, 0.823 for the deep-marker watershed, 0.806 for the global-context one, 0.769 for the detector, 0.668 for the star-convex model, 0.631 for the distance watershed, 0.597 for the lamella tracer, 0.451 and 0.435 for the two remaining watersheds, 0.341 for the global threshold, 0.263 for superpixel merging and 0.150 for marker-less immersion.'}</p>
      {/* five-sequence mean_hota per method: frontend/public/data/temporal/*.json */}

      <Equation
        tex={String.raw`\mathrm{HOTA}=\sqrt{\mathrm{DetA}\cdot\mathrm{AssA}},\qquad \mathrm{IDF1}=\frac{2\,IDTP}{2\,IDTP+IDFP+IDFN}`}
        caption={es
          ? 'HOTA factoriza detección (DetA, emparejamientos sobre emparejamientos mas falsos positivos mas falsos negativos) y asociación (AssA, consistencia de las parejas a lo largo del tiempo). IDF1 es la F1 de identidad sobre detecciones acumuladas de todos los cuadros.'
          : 'HOTA factorises detection (DetA, matches over matches plus false positives plus false negatives) and association (AssA, the consistency of the pairings over time). IDF1 is the identity F1 over accumulated detections across all frames.'}
      />

      <p className="measure">{es
        ? 'Hay tres cosas en esa tabla que conviene leer en los conteos y no en el orden. La primera: un número bajo de cambios de identidad no es un buen resultado por sí mismo. El umbral global registra solo 8 cambios en la secuencia de transporte nominal, menos que casi cualquier método aprendido, y queda en el fondo con HOTA 0.499: encuentra tan poco (cobertura 0.364) que no tiene mucha identidad que perder. La segunda: el detector cambia fragmentos por estabilidad, con 2 cambios de identidad y 52 fragmentos de trayectoria, porque es decisivo cuadro a cuadro y su exhaustividad es intermitente. La tercera: la inmersión sin marcadores es el piso honesto, con 370 cambios de identidad en ocho cuadros, porque sobre-segmenta de forma distinta en cada cuadro y nada sobrevive a la asociación.'
        : 'There are three things in that table worth reading in the counts rather than in the order. First: a low identity-switch count is not a good result by itself. The global threshold records only 8 switches on the nominal transport sequence, fewer than almost any learned method, and it sits near the bottom with HOTA 0.499: it finds so little (coverage 0.364) that there is not much identity to lose. Second: the detector trades fragments for stability, with 2 identity switches and 52 track fragments, because it is decisive frame to frame and its recall is intermittent. Third: marker-less immersion is the honest floor, with 370 identity switches over eight frames, because it over-segments differently on every frame and nothing survives association.'}</p>
      {/* poly-normal switches, coverage and fragments per method: frontend/public/data/temporal/*.json sequences[poly-normal] */}

      <p className="measure">{es
        ? 'Los eventos son la parte del carril donde la medición es más cruda y se publica igual. Los nacimientos y desapariciones derivados de asociación se disparan cada vez que una máscara parpadea, así que un método con máscaras inestables fabrica cientos de eventos espurios. En la secuencia de transporte nominal, la U-Net de frontera registra 2 eventos verdaderos contra 164 falsos positivos: exhaustividad 1.0 y precisión 0.012. Publicar solo la exhaustividad sería deshonesto, así que se publican las dos y la vista de eventos muestra los conteos por cuadro. El mismo patrón aparece amplificado en los métodos que sobre-segmentan: 2292 eventos falsos para el watershed sembrado en reflejos y 10122 para la fusión de superpíxeles, sobre los mismos 8 cuadros y los mismos 2 eventos verdaderos.'
        : 'Events are the part of the lane where the measurement is crudest, and it is published anyway. Association-derived births and disappearances fire whenever a mask flickers, so a method with unstable masks manufactures hundreds of spurious events. On the nominal transport sequence, the boundary U-Net records 2 true events against 164 false positives: recall 1.0 and precision 0.012. Publishing recall alone would be dishonest, so both are published and the events view shows the per-frame counts. The same pattern appears amplified in the over-segmenting methods: 2292 false events for the highlight-seeded watershed and 10122 for superpixel merging, over the same 8 frames and the same 2 true events.'}{' '}<Cite id="luiten2021hota" paren /></p>
      {/* L1 2 true events vs 164 false positives, precision 0.012; C3 2292 and C6 10122 false events: frontend/public/data/temporal/*.json sequences[poly-normal] */}

      <Callout variant="honest" title={es ? 'Alcance del carril temporal' : 'Scope of the temporal lane'}>
        <p>{es
          ? 'La detección de eventos por cuadro bajo este protocolo es una medición experimental, no una capacidad industrial, y así queda dicho en el lugar donde se muestra. Las cinco secuencias son sintéticas: no existe todavía ninguna secuencia real con licencia en este repositorio, así que estos números son evidencia controlada sobre cómo se comportan los métodos cuando la escena se mueve, y no exactitud de seguimiento en planta. Las cifras de identidad de L7 se publican aparte y nunca se ordenan contra las demás, porque miden retención de una cohorte entregada y no descubrimiento.'
          : 'Framewise event detection under this protocol is an experimental measurement, not an industrial capability, and it is stated as such where it is shown. The five sequences are synthetic: no licensed real sequence exists in this repository yet, so these numbers are controlled evidence about how methods behave when the scene moves, and not plant tracking accuracy. The L7 identity figures are published separately and never ranked against the rest, because they measure retention of a handed cohort and not discovery.'}</p>
      </Callout>

      <Refs ids={['kuhn1955hungarian', 'luiten2021hota', 'ravi2024sam2']} label={refsLabel} />
    </div>
  );

  // ============================================================
  // TAB ASSEMBLY
  // ============================================================
  const tabs = [
    {
      id: 'contract',
      label: es ? 'Contrato y métricas' : 'Contract and metrics',
      content: (
        <SubTabs
          ariaLabel={es ? 'Contrato de evidencia' : 'Evidence contract'}
          tabs={[
            { id: 'output', label: es ? 'Contrato de instancias' : 'Instance contract', content: contractTab },
            { id: 'metrics', label: es ? 'Qué significan las cifras' : 'What the numbers mean', content: metricsTab },
          ]}
        />
      ),
    },
    {
      id: 'classical',
      label: es ? 'Piso clásico · C1-C7' : 'Classical floor · C1-C7',
      content: (
        <SubTabs
          ariaLabel={es ? 'Familias clásicas' : 'Classical families'}
          tabs={[
            { id: 'threshold', label: es ? 'Umbral e inmersión · C1, C2' : 'Threshold and immersion · C1, C2', content: thresholdTab },
            { id: 'watershed', label: es ? 'Watershed con marcadores · C3-C5' : 'Marker watershed · C3-C5', content: watershedTab },
            { id: 'region', label: es ? 'Regiones y lamelas · C6, C7' : 'Regions and lamellae · C6, C7', content: regionTab },
          ]}
        />
      ),
    },
    {
      id: 'learned',
      label: es ? 'Aprendidos · L1-L4, L6' : 'Learned · L1-L4, L6',
      content: (
        <SubTabs
          ariaLabel={es ? 'Familias aprendidas' : 'Learned families'}
          tabs={[
            { id: 'dense', label: es ? 'Campos densos · L1-L3' : 'Dense fields · L1-L3', content: denseTab },
            { id: 'object', label: es ? 'Objeto parametrizado · L4, L6' : 'Parameterised object · L4, L6', content: objectTab },
          ]}
        />
      ),
    },
    {
      id: 'foundation',
      label: es ? 'Fundacionales · L5, L7' : 'Foundation · L5, L7',
      content: (
        <SubTabs
          ariaLabel={es ? 'Modelos fundacionales' : 'Foundation models'}
          tabs={[
            { id: 'flow', label: es ? 'Campo de flujo · L5' : 'Flow field · L5', content: flowTab },
            { id: 'prompt', label: es ? 'Segmentador promptable · L7' : 'Promptable segmenter · L7', content: promptTab },
          ]}
        />
      ),
    },
    { id: 'frontier', label: es ? 'Frontera · N1' : 'Frontier · N1', content: frontierTab },
    { id: 'sequences', label: es ? 'Secuencias' : 'Sequences', content: sequenceTab },
  ];

  return (
    <div className="page-body">
      <div className="page-head prose">
        <h1>{es ? 'Cómo una imagen se convierte en evidencia comparable' : 'How an image becomes comparable evidence'}</h1>
        <p className="lede">
          {es
            ? 'Quince métodos, familia por familia: el mecanismo real de cada uno, su ecuación cuando existe, su límite honesto, y el contrato único que hace que sus salidas nativas incompatibles terminen en el mismo mapa de instancias y en el mismo evaluador. Los dos protocolos temporales responden preguntas distintas y nunca se ordenan juntos.'
            : 'Fifteen methods, family by family: the real mechanism of each one, its equation where one exists, its honest limit, and the single contract that makes their incompatible native outputs end in the same instance map and the same evaluator. The two temporal protocols answer different questions and are never ranked together.'}{' '}
          <InlineMath tex={String.raw`\hat Y:\Omega\to\{0,\dots,N\}`} />
        </p>
      </div>
      <Tabs tabs={tabs} ariaLabel={es ? 'Familias de métodos' : 'Method families'} />
    </div>
  );
}
