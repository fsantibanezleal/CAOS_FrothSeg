import { Callout, Equation, Refs, SubTabs, useShellLang } from '@fasl-work/caos-app-shell';

export default function Methodology() {
  const es = useShellLang() === 'es';
  const tabs = [
    { id: 'protocol', label: es ? 'Protocolo' : 'Protocol', content: <Protocol es={es} /> },
    { id: 'data', label: es ? 'Datos y splits' : 'Data & splits', content: <DataProtocol es={es} /> },
    { id: 'classical', label: es ? 'Métodos clásicos' : 'Classical methods', content: <Classical es={es} /> },
    { id: 'learned', label: es ? 'Métodos aprendidos' : 'Learned methods', content: <Learned es={es} /> },
    { id: 'training', label: es ? 'Entrenamiento' : 'Training', content: <Training es={es} /> },
    { id: 'inference', label: es ? 'Inferencia' : 'Inference', content: <Inference es={es} /> },
    { id: 'temporal', label: es ? 'Secuencias' : 'Sequences', content: <Temporal es={es} /> },
    { id: 'evaluation', label: es ? 'Evaluación' : 'Evaluation', content: <Evaluation es={es} /> },
  ];
  return (
    <div className="page-body prose fs-science-page">
      <header className="page-head fs-science-head">
        <span className="eyebrow">{es ? 'Métodos y protocolo experimental' : 'Methods and experimental protocol'}</span>
        <h1>{es ? 'Cómo se convierte una imagen en evidencia comparable' : 'How an image becomes comparable evidence'}</h1>
        <p className="lede">
          {es
            ? 'Todos los métodos reciben el mismo dato, producen el mismo contrato de instancias y se evalúan con splits, calibración y métricas fijados antes de tocar la prueba.'
            : 'Every method receives the same input, produces the same instance contract, and is evaluated with splits, calibration, and metrics fixed before the test set is touched.'}
        </p>
      </header>
      <section><SubTabs tabs={tabs} ariaLabel={es ? 'Capítulos de metodología' : 'Methodology chapters'} /></section>
    </div>
  );
}

function Protocol({ es }: { es: boolean }) {
  return (
    <div className="fs-method-chapter">
      <ChapterLead
        index="01"
        title={es ? 'Una cadena experimental cerrada' : 'A closed experimental chain'}
        text={es
          ? 'El protocolo separa decisiones que pueden aprenderse de los datos de la medición final. La prueba retenida solo se abre después de congelar pesos, umbrales y postproceso.'
          : 'The protocol separates decisions that may be learned from data from the final measurement. The held-out test is opened only after weights, thresholds, and post-processing are frozen.'}
      />
      <MethodFlowDiagram es={es} />
      <div className="fs-principle-grid">
        <Principle n="1" title={es ? 'Unidad experimental' : 'Experimental unit'} text={es ? 'La geometría latente, no la imagen renderizada.' : 'The latent geometry, not the rendered image.'} />
        <Principle n="2" title={es ? 'Salida común' : 'Common output'} text={es ? 'Mapa entero: 0 fondo, 1…N identidades.' : 'Integer map: 0 background, 1…N identities.'} />
        <Principle n="3" title={es ? 'Selección separada' : 'Separate selection'} text={es ? 'Validación para pesos; calibración para umbrales.' : 'Validation for weights; calibration for thresholds.'} />
        <Principle n="4" title={es ? 'Prueba única' : 'Single test'} text={es ? '64 muestras retenidas para los 15 métodos.' : '64 held-out samples for all 15 methods.'} />
      </div>
      <h3>{es ? 'Contratos invariantes' : 'Invariant contracts'}</h3>
      <p>
        {es
          ? 'La ingesta valida forma, rango dinámico y metadatos de agrupación. La inferencia emite etiquetas de instancia y probabilidades cuando existen. La evaluación consume únicamente esos contratos: ningún evaluador conoce detalles internos del modelo.'
          : 'Ingestion validates shape, dynamic range, and grouping metadata. Inference emits instance labels and probabilities when available. Evaluation consumes only those contracts: no evaluator knows model internals.'}
      </p>
      <Equation
        tex={String.raw`\mathcal D=\mathcal D_{\mathrm{train}}\;\dot\cup\;\mathcal D_{\mathrm{val}}\;\dot\cup\;\mathcal D_{\mathrm{cal}}\;\dot\cup\;\mathcal D_{\mathrm{test}}`}
        caption={es ? 'Partición disjunta: ninguna unidad geométrica aparece en más de un split.' : 'Disjoint partition: no geometry unit appears in more than one split.'}
      />
      <Equation
        tex={String.raw`\hat\theta=\arg\max_{\theta}\operatorname{AP}_{\mathrm{val}}(\theta),\qquad \hat\tau=\arg\max_{\tau}\operatorname{AP}_{\mathrm{cal}}(\hat\theta,\tau)`}
        caption={es ? 'Los pesos se seleccionan en validación y los umbrales en calibración.' : 'Weights are selected on validation and thresholds on calibration.'}
      />
      <p>{es
        ? 'El contrato impide comparar métodos con reglas de decisión distintas. Una falla de inferencia permanece como una celda fallida; nunca se elimina del denominador ni se reemplaza por cero sin registrar el estado.'
        : 'The contract prevents comparing methods under different decision rules. An inference failure remains a failed cell; it is never dropped from the denominator or silently replaced by zero.'}</p>
      <p>{es
        ? 'Los casos canónicos explican mecanismos y errores, mientras que las 64 muestras retenidas determinan el ranking. Esta separación evita escoger imágenes visualmente convenientes después de conocer los resultados.'
        : 'Canonical cases explain mechanisms and failures, while the 64 held-out samples determine the ranking. This separation prevents selecting visually convenient images after results are known.'}</p>
      <Callout variant="honest" title={es ? 'Alcance de la evidencia' : 'Evidence scope'}>
        {es
          ? 'La cadena demuestra reproducibilidad en el banco controlado. No convierte datos sintéticos en exactitud industrial ni permite ajustar el sistema después de consultar test.'
          : 'The chain demonstrates reproducibility on the controlled benchmark. It does not turn synthetic data into industrial accuracy or permit tuning after inspecting the test set.'}
      </Callout>
      <Refs ids={['lin2014coco', 'aldrich2010']} label="Refs" />
    </div>
  );
}

function DataProtocol({ es }: { es: boolean }) {
  return (
    <div className="fs-method-chapter">
      <ChapterLead
        index="02"
        title={es ? 'Diseño de datos sin fuga geométrica' : 'Leakage-resistant data design'}
        text={es
          ? 'Cada escena latente genera dos apariencias. Ambas permanecen en el mismo split para impedir que el modelo vea en entrenamiento la geometría que luego se evalúa.'
          : 'Each latent scene produces two appearances. Both stay in the same split so the model cannot see test geometry during training.'}
      />
      <SplitDiagram es={es} />
      <div className="fs-explain-grid">
        <article>
          <span>384</span><strong>{es ? 'muestras' : 'samples'}</strong>
          <p>{es ? '16 condiciones × 12 grupos geométricos × 2 apariencias.' : '16 conditions × 12 geometry groups × 2 appearances.'}</p>
        </article>
        <article>
          <span>192</span><strong>train</strong>
          <p>{es ? 'Optimización de parámetros aprendidos.' : 'Optimization of learned parameters.'}</p>
        </article>
        <article>
          <span>64</span><strong>validation</strong>
          <p>{es ? 'Selección de época y arquitectura.' : 'Epoch and architecture selection.'}</p>
        </article>
        <article>
          <span>64</span><strong>calibration</strong>
          <p>{es ? 'Umbrales, marcadores y probabilidades.' : 'Thresholds, markers, and probabilities.'}</p>
        </article>
        <article>
          <span>64</span><strong>test</strong>
          <p>{es ? 'Comparación final, abierta una sola vez.' : 'Final comparison, opened once.'}</p>
        </article>
      </div>
      <h3>{es ? 'Cobertura de condiciones' : 'Condition coverage'}</h3>
      <p>
        {es
          ? 'El diseño cruza espuma fina, gruesa, bimodal, acuosa y cargada con brillo, baja luz, desenfoque, movimiento, encuadre parcial y combinaciones compuestas. La verdad exacta conserva área, contorno e identidad de cada burbuja.'
          : 'The design crosses fine, coarse, bimodal, watery, and loaded froth with glare, low light, defocus, motion, edge framing, and compound degradations. Exact truth preserves every bubble’s area, boundary, and identity.'}
      </p>
      <Equation
        tex={String.raw`g_i=g_j\Longrightarrow s_i=s_j,\qquad g_i\ne g_j\;\not\Longrightarrow\;s_i=s_j`}
        caption={es ? 'Todas las apariencias de una geometría latente g comparten el mismo split s.' : 'All appearances of one latent geometry g share the same split s.'}
      />
      <Equation
        tex={String.raw`d_{\mathrm{mm}}=\frac{d_{\mathrm{px}}}{\kappa},\qquad \kappa\;[\mathrm{px/mm}]`}
        caption={es ? 'La conversión física requiere una calibración de cámara κ suministrada.' : 'Physical conversion requires a supplied camera calibration κ.'}
      />
      <p>{es
        ? 'La unidad de partición incluye fuente, sitio, campaña, video y semilla geométrica. Dos cuadros adyacentes no pueden separarse entre train y test aunque sus píxeles no sean idénticos.'
        : 'The split unit includes source, site, campaign, video, and geometry seed. Adjacent frames cannot be divided between train and test even when their pixels are not identical.'}</p>
      <Callout variant="honest" title={es ? 'Datos reales' : 'Real data'}>
        {es
          ? 'Una imagen real sin máscara manual puede demostrar comportamiento y costo, pero no AP ni error de frontera. Las cifras de test real requieren anotación independiente y escala gobernada.'
          : 'A real image without an independent manual mask can demonstrate behavior and cost, but not AP or boundary error. Real-test claims require independent annotation and governed scale.'}
      </Callout>
      <Refs ids={['weaire1999foams', 'aurenhammer1987', 'aldrich2010']} label="Refs" />
      <h3>{es ? 'Ingreso de datos industriales' : 'Industrial-data ingestion'}</h3>
      <p>
        {es
          ? 'Las fuentes reales se incorporan mediante manifiestos con licencia, sitio, cámara, escala física y grupo de secuencia. Los cuadros de un mismo video o campaña permanecen juntos. No se publica una cifra de planta sin un test externo gobernado.'
          : 'Real sources enter through manifests recording license, site, camera, physical scale, and sequence group. Frames from one video or campaign remain together. No plant-accuracy number is published without a governed external test.'}
      </p>
    </div>
  );
}

function Classical({ es }: { es: boolean }) {
  const methods = [
    ['C1', 'Otsu + connected components', es ? 'Umbral global; expone uniones entre burbujas en contacto.' : 'Global threshold; exposes merges between touching bubbles.'],
    ['C2', 'Gradient immersion watershed', es ? 'Inunda mínimos del gradiente; expone sobresegmentación por textura.' : 'Floods gradient minima; exposes texture-driven over-segmentation.'],
    ['C3', 'Marker-controlled watershed', es ? 'Máximos brillantes como semillas; sensible a reflejos saturados.' : 'Bright maxima as seeds; sensitive to saturated glare.'],
    ['C4', 'Distance-transform watershed', es ? 'Picos de distancia como centros de burbuja.' : 'Distance peaks act as bubble centers.'],
    ['C5', 'H-minima watershed', es ? 'Suprime cuencas someras antes de la inundación.' : 'Suppresses shallow basins before flooding.'],
    ['C6', 'SLIC + RAG merge', es ? 'Superpíxeles y fusión por similitud regional.' : 'Superpixels followed by region-similarity merging.'],
    ['C7', 'Lamella-valley watershed', es ? 'Detecta valles oscuros de lamela en vez de reflejos.' : 'Detects dark lamella valleys instead of highlights.'],
  ];
  return (
    <div className="fs-method-chapter">
      <ChapterLead
        index="03"
        title={es ? 'Siete hipótesis clásicas, siete modos de error' : 'Seven classical hypotheses, seven failure modes'}
        text={es
          ? 'La escalera clásica no es relleno: hace explícito qué señal física usa cada algoritmo y dónde deja de ser válida.'
          : 'The classical ladder is not filler: it makes explicit which physical signal each algorithm uses and where that assumption fails.'}
      />
      <ClassicalMechanismDiagram es={es} />
      <div className="fs-method-list">
        {methods.map(([id, name, description]) => (
          <article key={id}>
            <span>{id}</span>
            <div><strong>{name}</strong><p>{description}</p></div>
          </article>
        ))}
      </div>
      <h3>{es ? 'Formulación común del watershed' : 'Common watershed formulation'}</h3>
      <Equation
        tex={String.raw`\hat{Y}=\operatorname{Watershed}\!\left(E,\;M,\;\Omega\right)`}
        caption={es ? 'E es la elevación, M los marcadores y Ω el dominio permitido.' : 'E is the elevation, M the markers, and Ω the admissible domain.'}
      />
      <p>
        {es
          ? 'E es la superficie de elevación (gradiente, borde o distancia negada), M son marcadores y Ω limita la región de espuma. C2–C5 y C7 difieren precisamente en cómo construyen esas tres cantidades.'
          : 'E is the elevation surface (gradient, boundary, or negative distance), M contains markers, and Ω limits the froth region. C2–C5 and C7 differ precisely in how those three quantities are constructed.'}
      </p>
      <Equation
        tex={String.raw`D(x)=\min_{b\in\partial\Omega}\lVert x-b\rVert_2,\qquad M=\operatorname{Maxima}\!\left(H_h(D)\right)`}
        caption={es ? 'C4 usa distancia euclidiana; C5 suprime máximos o mínimos someros con profundidad h.' : 'C4 uses Euclidean distance; C5 suppresses shallow extrema with depth h.'}
      />
      <p>{es
        ? 'C1 prueba la hipótesis más débil: que el nivel de gris separa interior y fondo. C2 prueba si el gradiente crudo contiene cuencas útiles. C3–C5 controlan el número de cuencas mediante semillas o supresión morfológica.'
        : 'C1 tests the weakest hypothesis: gray level separates interior and background. C2 tests whether the raw gradient contains useful basins. C3-C5 control basin count through markers or morphological suppression.'}</p>
      <p>{es
        ? 'C6 reduce la imagen a superpíxeles y fusiona regiones vecinas con evidencia de color y valle compartido. C7 invierte la atención: busca lamelas oscuras y las convierte en barreras, evitando confundir reflejos blancos con límites.'
        : 'C6 reduces the image to superpixels and merges neighboring regions using color and shared-valley evidence. C7 reverses the cue: it seeks dark lamellae and turns them into barriers, avoiding the confusion of white highlights with boundaries.'}</p>
      <Callout variant="honest" title={es ? 'Límite clásico' : 'Classical limit'}>
        {es
          ? 'Los siete métodos son ejecutables y útiles como controles, pero sus parámetros no se transfieren automáticamente entre cámaras, iluminación y regímenes de espuma.'
          : 'All seven methods are executable and useful as controls, but their parameters do not transfer automatically across cameras, lighting, and froth regimes.'}
      </Callout>
      <Refs ids={['meyer1994', 'vincent1991', 'achanta2012slic', 'jahedsaravani2017', 'wang2003froth']} label="Refs" />
    </div>
  );
}

function Learned({ es }: { es: boolean }) {
  const families = [
    ['L1–L3', es ? 'Campos densos + watershed' : 'Dense fields + watershed', es ? 'Foreground, borde y distancia producen marcadores e instancias.' : 'Foreground, boundary, and distance fields produce markers and instances.'],
    ['L4', 'StarDist 2D', es ? 'Distancias radiales describen polígonos estrellados por objeto.' : 'Radial distances describe star-convex polygons per object.'],
    ['L5', 'Cellpose-SAM', es ? 'Representaciones preentrenadas ajustadas a las instancias de espuma.' : 'Pretrained representations fine-tuned for froth instances.'],
    ['L6', 'YOLO instance segmentation', es ? 'Detección y máscara por instancia en una arquitectura unificada.' : 'Detection and per-instance masks in a unified architecture.'],
    ['L7', 'SAM 2.1 image/video', es ? 'Segmentación con prompts y memoria temporal oficial.' : 'Prompted segmentation with official temporal memory.'],
    ['N1', 'LamellaStar', es ? 'Foreground, borde, distancia y centros con compuertas de lamela.' : 'Foreground, boundary, distance, and center heads with lamella gates.'],
  ];
  return (
    <div className="fs-method-chapter">
      <ChapterLead
        index="04"
        title={es ? 'Representaciones aprendidas para separar contacto y textura' : 'Learned representations for contact and texture'}
        text={es
          ? 'Los modelos no compiten mediante interfaces distintas. Todos terminan en el mismo mapa de instancias y pasan por el mismo evaluador.'
          : 'Models do not compete through different interfaces. Every path ends in the same instance map and passes through the same evaluator.'}
      />
      <DenseTargetDiagram es={es} />
      <div className="fs-family-grid">
        {families.map(([id, title, text]) => <article key={id}><span>{id}</span><strong>{title}</strong><p>{text}</p></article>)}
      </div>
      <h3>{es ? 'Objetivos densos' : 'Dense targets'}</h3>
      <Equation
        tex={String.raw`\mathcal{L}=\lambda_f\mathcal{L}_{Dice+BCE}(F)+\lambda_b\mathcal{L}_{BCE}(B)+\lambda_d\mathcal{L}_{SmoothL1}(D)+\lambda_c\mathcal{L}_{MSE}(C)`}
        caption={es ? 'Objetivo multicanal de interior F, borde B, distancia D y centro C.' : 'Multi-head objective for interior F, boundary B, distance D, and center C.'}
      />
      <p>
        {es
          ? 'F representa interior, B borde de instancia, D distancia normalizada al borde y C centros por instancia cuando el modelo los usa. En inferencia, D y C proponen semillas; B impide que la inundación atraviese lamelas.'
          : 'F represents interior, B instance boundary, D normalized distance to the boundary, and C per-instance centers when used. At inference, D and C propose markers; B prevents flooding across lamellae.'}
      </p>
      <Equation
        tex={String.raw`P_k(x)=p(x)\,\mathbf 1\!\left[r_k(x)>0\right],\qquad \mathbf v(x)=-\nabla\phi_k(x)`}
        caption={es ? 'StarDist representa radios rₖ; Cellpose agrupa píxeles mediante un campo de flujo v.' : 'StarDist represents radial distances rₖ; Cellpose groups pixels through a flow field v.'}
      />
      <p>{es
        ? 'L1–L3 aprenden campos densos y conservan un postproceso interpretable. L4 impone geometría estrellada; L5 usa un generalista de objetos densos; L6 resuelve detección y máscara por instancia; L7 aporta memoria de video.'
        : 'L1-L3 learn dense fields while retaining interpretable post-processing. L4 imposes star-convex geometry; L5 uses a dense-object generalist; L6 solves detection and per-instance masks; L7 contributes video memory.'}</p>
      <p>{es
        ? 'N1 combina las señales que la física de espuma vuelve informativas: valle de lamela, distancia interior, centro y consistencia temporal. Sus variantes se seleccionan en validation y el resultado final se compara sin alterar el líder de referencia.'
        : 'N1 combines signals made informative by froth physics: lamella valley, interior distance, center, and temporal consistency. Its variants are selected on validation and the finalist is compared without altering the reference leader.'}</p>
      <Callout variant="honest" title={es ? 'Resultado actual' : 'Current result'}>
        {es
          ? 'LamellaStar lidera el test controlado con AP 0,519 tras tres estudios preregistrados; Cellpose-SAM queda en 0,510. Se publica como ensamble de tres semillas. No hay afirmación de estado del arte: el margen es menor que la dispersión entre semillas medida, el banco es sintético y la línea base tuvo dos pasadas de ajuste.'
          : 'LamellaStar leads the controlled test at AP 0.519 after three preregistered studies; Cellpose-SAM follows at 0.510. It is published as a three-seed ensemble. There is no state-of-the-art claim: the margin is smaller than the measured seed spread, the benchmark is synthetic, and the baseline had a two-pass fine-tuning budget.'}
      </Callout>
      <Refs ids={['ronneberger2015unet', 'schmidt2018stardist', 'stringer2021cellpose', 'redmon2016yolo', 'ravi2024sam2', 'zhu2025gcfsegnet', 'fan2024parallel']} label="Refs" />
    </div>
  );
}

function Training({ es }: { es: boolean }) {
  return (
    <div className="fs-method-chapter">
      <ChapterLead
        index="05"
        title={es ? 'Selección de modelos sin consultar la prueba' : 'Model selection without consulting the test'}
        text={es
          ? 'Cada corrida guarda configuración, semilla, checksum del dataset, dispositivo, historial, checkpoint seleccionado y calibración posterior.'
          : 'Every run records configuration, seed, dataset checksum, device, history, selected checkpoint, and subsequent calibration.'}
      />
      <TrainingTimeline es={es} />
      <div className="fs-decision-grid">
        <article><span>train</span><strong>{es ? 'Aprender pesos' : 'Learn weights'}</strong><p>{es ? 'Aumentos fotométricos y geométricos se aplican solo aquí.' : 'Photometric and geometric augmentation is applied only here.'}</p></article>
        <article><span>validation</span><strong>{es ? 'Elegir checkpoint' : 'Choose checkpoint'}</strong><p>{es ? 'Early stopping y selección por AP/PQ de validación.' : 'Early stopping and selection by validation AP/PQ.'}</p></article>
        <article><span>calibration</span><strong>{es ? 'Fijar decisión' : 'Fix decisions'}</strong><p>{es ? 'Umbrales de foreground, borde, marcadores y confianza.' : 'Foreground, boundary, marker, and confidence thresholds.'}</p></article>
        <article><span>test</span><strong>{es ? 'Medir una vez' : 'Measure once'}</strong><p>{es ? 'Sin ajuste posterior basado en sus resultados.' : 'No subsequent tuning based on its results.'}</p></article>
      </div>
      <h3>{es ? 'Reproducibilidad computacional' : 'Computational reproducibility'}</h3>
      <p>
        {es
          ? 'Los entrenamientos PyTorch y los modelos fundacionales verifican CUDA cuando la corrida declara GPU; no existe una caída silenciosa a CPU. Los checkpoints se enlazan por SHA-256 y los exportadores verifican paridad numérica antes de aceptar un artefacto.'
          : 'PyTorch training and foundation-model runs verify CUDA whenever a run declares GPU; silent CPU fallback is not allowed. Checkpoints are linked by SHA-256, and exporters verify numerical parity before accepting an artifact.'}
      </p>
      <Equation
        tex={String.raw`\theta_{t+1}=\theta_t-\eta_t\,\frac{\hat m_t}{\sqrt{\hat v_t}+\epsilon}`}
        caption={es ? 'Actualización adaptativa; ηₜ y la semilla quedan fijadas en el manifiesto de corrida.' : 'Adaptive update; ηₜ and the seed are fixed in the run manifest.'}
      />
      <Equation
        tex={String.raw`t^*=\arg\max_t\operatorname{AP}_{\mathrm{val}}(\theta_t),\qquad \theta^*=\theta_{t^*}`}
        caption={es ? 'El checkpoint se elige únicamente por la métrica de validación predeclarada.' : 'The checkpoint is selected only by the preregistered validation metric.'}
      />
      <p>{es
        ? 'Cada ejecución guarda el historial completo, no solo el mejor número. La selección puede auditarse contra pérdidas, AP, memoria, tiempo, semilla, versión del conjunto y hash del código científico.'
        : 'Each run preserves the full history, not only the best number. Selection can be audited against losses, AP, memory, time, seed, dataset version, and scientific-code hash.'}</p>
      <p>{es
        ? 'Los modelos oficiales conservan su identidad de origen. Una adaptación local registra exactamente qué capas fueron optimizadas y qué checkpoint upstream inició la corrida.'
        : 'Official models retain their upstream identity. A local adaptation records exactly which layers were optimized and which upstream checkpoint initialized the run.'}</p>
      <Callout variant="honest" title={es ? 'No hay selección sobre test' : 'No test-set selection'}>
        {es ? 'Una nueva arquitectura o ensemble vuelve a validation. El test no se reutiliza como tablero de optimización.' : 'A new architecture or ensemble returns to validation. The test is not reused as an optimization dashboard.'}
      </Callout>
      <Refs ids={['ronneberger2015unet', 'stringer2021cellpose']} label="Refs" />
    </div>
  );
}

function Inference({ es }: { es: boolean }) {
  return (
    <div className="fs-method-chapter">
      <ChapterLead
        index="06"
        title={es ? 'Del campo probabilístico a burbujas discretas' : 'From probability fields to discrete bubbles'}
        text={es
          ? 'La inferencia conserva tanto las probabilidades como la decisión final. Esto permite diagnosticar si el error proviene del modelo o del postproceso.'
          : 'Inference preserves both probabilities and the final decision. This makes it possible to diagnose whether an error comes from the model or from post-processing.'}
      />
      <InferenceDiagram es={es} />
      <h3>{es ? 'Postproceso de los modelos densos' : 'Dense-model post-processing'}</h3>
      <Equation
        tex={String.raw`\Omega_\tau=\{x:p_F(x)\ge\tau_F\},\qquad M=\operatorname{Maxima}_{d_{\min}}\!\left(p_C(x)\,p_D(x)\right)`}
        caption={es ? 'El foreground y las semillas usan umbrales fijados en calibración.' : 'Foreground and markers use thresholds fixed on calibration.'}
      />
      <Equation
        tex={String.raw`\hat Y=\operatorname{Watershed}\!\left(p_B-\alpha p_D,\;M,\;\Omega_\tau\right)`}
        caption={es ? 'El borde eleva barreras y la distancia estabiliza el interior de las cuencas.' : 'Boundary probability raises barriers and distance stabilizes basin interiors.'}
      />
      <ol className="fs-numbered-method">
        <li><strong>{es ? 'Interior' : 'Interior'}</strong><span>{es ? 'Aplicar el umbral de foreground calibrado.' : 'Apply the calibrated foreground threshold.'}</span></li>
        <li><strong>{es ? 'Semillas' : 'Markers'}</strong><span>{es ? 'Combinar distancia aprendida y evidencia de centro; extraer máximos separados.' : 'Combine learned distance and center evidence; extract separated maxima.'}</span></li>
        <li><strong>{es ? 'Barreras' : 'Barriers'}</strong><span>{es ? 'Anular semillas sobre bordes y usar el borde como elevación.' : 'Suppress markers on boundaries and use the boundary as elevation.'}</span></li>
        <li><strong>Watershed</strong><span>{es ? 'Inundar dentro del foreground y emitir etiquetas enteras contiguas.' : 'Flood inside foreground and emit contiguous integer labels.'}</span></li>
        <li><strong>{es ? 'Filtrado' : 'Filtering'}</strong><span>{es ? 'Eliminar objetos fuera del rango físico y registrar cada decisión.' : 'Remove objects outside the physical range and record every decision.'}</span></li>
      </ol>
      <h3>{es ? 'Ejecución offline y exploración web' : 'Offline execution and web exploration'}</h3>
      <p>
        {es
          ? 'El pipeline offline procesa imágenes o videos completos, usa los runtimes científicos y exporta máscaras, tablas y proveniencia. La web reproduce esos artefactos para los 15 métodos. Solo una carga arbitraria utiliza cuatro motores interactivos explícitamente separados.'
          : 'The offline pipeline processes complete images or videos, uses the scientific runtimes, and exports masks, tables, and provenance. The web replays those artifacts for all 15 methods. Only arbitrary uploads use four explicitly separated interactive engines.'}
      </p>
      <p>{es
        ? 'Los métodos que ya producen polígonos o máscaras no son forzados a usar watershed. El adaptador convierte su salida nativa al mapa entero común y conserva puntuaciones por instancia cuando existen.'
        : 'Methods that natively produce polygons or masks are not forced through watershed. Their adapter converts native output to the common integer map and preserves per-instance scores when available.'}</p>
      <p>{es
        ? 'La ejecución en mosaicos conserva solape y recorta bordes antes de reconciliar identidades. Esta regla evita contar dos veces una burbuja que atraviesa la frontera entre tiles.'
        : 'Tiled execution preserves overlap and trims tile borders before reconciling identities. This rule prevents double-counting a bubble that crosses a tile boundary.'}</p>
      <Callout variant="honest" title={es ? 'Separación de carriles' : 'Lane separation'}>
        {es ? 'Los métodos de alto costo se ejecutan mediante los pipelines completos del repositorio y sus resultados verificados se presentan aquí. Las cargas locales ofrecen cuatro métodos validados para este runtime.' : 'Compute-intensive methods run through the repository’s complete pipelines and their verified results are presented here. Local uploads offer four methods validated for this runtime.'}
      </Callout>
      <Refs ids={['meyer1994', 'ronneberger2015unet', 'onnxruntimeweb']} label="Refs" />
    </div>
  );
}

function Temporal({ es }: { es: boolean }) {
  return (
    <div className="fs-method-chapter">
      <ChapterLead
        index="07"
        title={es ? 'Identidad a través del tiempo' : 'Identity through time'}
        text={es
          ? 'La segmentación por cuadro se asocia mediante solapamiento y asignación bipartita. SAM 2.1 se evalúa aparte como propagador con memoria, condicionado por máscaras iniciales.'
          : 'Framewise segmentation is associated through overlap and bipartite assignment. SAM 2.1 is evaluated separately as a memory-based propagator conditioned on initial masks.'}
      />
      <TemporalIdentityDiagram es={es} />
      <Equation
        tex={String.raw`C_{ij}=1-\operatorname{IoU}\!\left(Y^{t-1}_i,Y^t_j\right),\qquad \pi^*=\arg\min_{\pi}\sum_i C_{i,\pi(i)}`}
        caption={es ? 'Costo de asociación y asignación bipartita óptima entre cuadros.' : 'Association cost and optimal bipartite assignment between frames.'}
      />
      <p>
        {es
          ? 'La asignación húngara conserva IDs cuando el IoU supera el umbral. Nacimientos, desapariciones, divisiones y uniones quedan como eventos explícitos en lugar de ser ocultados dentro de un promedio.'
          : 'Hungarian assignment preserves IDs when IoU exceeds the threshold. Births, disappearances, splits, and merges remain explicit events instead of being hidden inside an average.'}
      </p>
      <Equation
        tex={String.raw`\mathrm{HOTA}=\sqrt{\mathrm{DetA}\,\mathrm{AssA}},\qquad \mathrm{IDF1}=\frac{2\,IDTP}{2\,IDTP+IDFP+IDFN}`}
        caption={es ? 'HOTA equilibra detección y asociación; IDF1 mide continuidad de identidad.' : 'HOTA balances detection and association; IDF1 measures identity continuity.'}
      />
      <div className="fs-metric-defs">
        <article><strong>IDF1</strong><p>{es ? 'Precisión y exhaustividad de identidad en todos los cuadros.' : 'Identity precision and recall across all frames.'}</p></article>
        <article><strong>HOTA</strong><p>{es ? 'Balance entre detección y asociación.' : 'Balance between detection and association.'}</p></article>
        <article><strong>{es ? 'Fragmentaciones' : 'Fragmentations'}</strong><p>{es ? 'Veces que una trayectoria persistente se interrumpe.' : 'Times a persistent track is interrupted.'}</p></article>
        <article><strong>Flow EPE</strong><p>{es ? 'Error de desplazamiento de centroides en píxeles.' : 'Centroid displacement error in pixels.'}</p></article>
      </div>
      <p>{es
        ? 'Los eventos se derivan de cambios explícitos en correspondencias: nacimiento sin predecesor, desaparición sin sucesor, división de una identidad y unión de varias. La métrica no confunde estos eventos con un simple cambio de área.'
        : 'Events are derived from explicit correspondence changes: birth without a predecessor, disappearance without a successor, one-to-many split, and many-to-one merge. The metric does not confuse these events with a simple area change.'}</p>
      <p>{es
        ? 'El flujo óptico sirve como señal auxiliar y como prueba de desplazamiento, pero no reemplaza identidades. Una trayectoria debe conservar correspondencia de instancia incluso cuando la forma se deforma.'
        : 'Optical flow is an auxiliary cue and displacement test, but it does not replace identities. A track must preserve instance correspondence even as shape deforms.'}</p>
      <Callout variant="honest" title={es ? 'Cobertura temporal' : 'Temporal coverage'}>
        {es ? 'El banco temporal contiene cinco secuencias de ocho cuadros, y los 15 métodos tienen predicciones persistidas en las cinco. L7 recibe las máscaras exactas del primer cuadro y solo debe conservarlas, así que sus métricas de identidad se publican aparte y nunca se ordenan junto a las demás.' : 'The temporal benchmark contains five eight-frame sequences, and all 15 methods have persisted predictions on all five. L7 receives the exact first-frame masks and only has to keep them, so its identity metrics are published separately and never ranked against the rest.'}
      </Callout>
      <Refs ids={['kuhn1955hungarian', 'luiten2021hota', 'ravi2024sam2', 'carion2025sam3']} label="Refs" />
    </div>
  );
}

function Evaluation({ es }: { es: boolean }) {
  return (
    <div className="fs-method-chapter">
      <ChapterLead
        index="08"
        title={es ? 'Calidad de instancia, frontera y proceso' : 'Instance, boundary, and process quality'}
        text={es
          ? 'Ninguna métrica única describe el error de espuma. El protocolo combina correspondencia por IoU, calidad panóptica, fronteras, conteo, distribución de tamaño, calibración, tiempo y memoria.'
          : 'No single metric describes froth error. The protocol combines IoU matching, panoptic quality, boundaries, count, size distribution, calibration, time, and memory.'}
      />
      <div className="fs-equation-grid">
        <article><strong>Mask AP</strong><Equation tex={String.raw`\mathrm{AP}=\frac1{10}\sum_{\tau=.50}^{.95}\frac{TP_\tau}{TP_\tau+FP_\tau+FN_\tau}`} caption={es ? 'Promedio sobre diez umbrales IoU.' : 'Average over ten IoU thresholds.'} /></article>
        <article><strong>Panoptic quality</strong><Equation tex={String.raw`\mathrm{PQ}=\underbrace{\frac{\sum_{(p,g)}IoU(p,g)}{|TP|}}_{SQ}\;\underbrace{\frac{|TP|}{|TP|+\frac12|FP|+\frac12|FN|}}_{RQ}`} caption={es ? 'Calidad espacial SQ por reconocimiento RQ.' : 'Spatial quality SQ times recognition quality RQ.'} /></article>
        <article><strong>{es ? 'Diámetro equivalente' : 'Equivalent diameter'}</strong><Equation tex={String.raw`d_i=2\sqrt{A_i/\pi},\qquad d_{32}=\frac{\sum_i d_i^3}{\sum_i d_i^2}`} caption={es ? 'Diámetro de área equivalente y media de Sauter.' : 'Area-equivalent diameter and Sauter mean.'} /></article>
        <article><strong>{es ? 'Calibración' : 'Calibration'}</strong><Equation tex={String.raw`\mathrm{Brier}=\frac1N\sum_i(p_i-y_i)^2,\qquad ECE=\sum_b\frac{|b|}{N}|\mathrm{acc}(b)-\mathrm{conf}(b)|`} caption={es ? 'Exactitud probabilística y brecha de calibración.' : 'Probability accuracy and calibration gap.'} /></article>
      </div>
      <h3>{es ? 'Lectura de los errores' : 'Reading the errors'}</h3>
      <div className="fs-error-matrix">
        <article><span>{es ? 'Unión' : 'Merge'}</span><p>{es ? 'Una predicción cubre varias burbujas reales: el tamaño queda sesgado hacia arriba.' : 'One prediction covers several true bubbles: size is biased upward.'}</p></article>
        <article><span>{es ? 'Separación' : 'Split'}</span><p>{es ? 'Varias predicciones cubren una burbuja real: el tamaño queda sesgado hacia abajo.' : 'Several predictions cover one true bubble: size is biased downward.'}</p></article>
        <article><span>{es ? 'Frontera' : 'Boundary'}</span><p>{es ? 'La identidad puede ser correcta aunque la lamela esté desplazada.' : 'Identity can be correct while the lamella is displaced.'}</p></article>
        <article><span>{es ? 'Distribución' : 'Distribution'}</span><p>{es ? 'Wasserstein-1 mide cuánto trabajo mueve una BSD predicha hacia la real.' : 'Wasserstein-1 measures the work needed to move a predicted BSD to truth.'}</p></article>
      </div>
      <h3>{es ? 'Agregación y afirmaciones' : 'Aggregation and claims'}</h3>
      <p>
        {es
          ? 'Se publican medias macro por muestra y conteos micro agrupados. Las 960 celdas método–muestra deben estar presentes. El umbral predeclarado es AP 0.30 en el banco controlado; no equivale a preparación industrial ni a superioridad fuera de este dominio.'
          : 'Per-sample macro means and pooled micro counts are both published. All 960 method–sample cells must be present. The predeclared threshold is AP 0.30 on the controlled benchmark; it does not imply industrial readiness or superiority outside this domain.'}
      </p>
      <p>{es
        ? 'Los conteos micro revelan si un método obtiene una media aceptable concentrando errores en escenas densas. Las medias macro impiden que las escenas con más burbujas dominen por completo la comparación.'
        : 'Micro counts reveal whether a method achieves an acceptable mean by concentrating errors in dense scenes. Macro means prevent scenes with more bubbles from completely dominating the comparison.'}</p>
      <p>{es
        ? 'La distancia Wasserstein sobre BSD cuantifica el sesgo de proceso que un IoU puede ocultar: una máscara visualmente cercana todavía puede desplazar D50 o d32 y alterar la interpretación metalúrgica.'
        : 'Wasserstein distance on BSD quantifies process bias that IoU can hide: a visually close mask may still shift D50 or d32 and alter metallurgical interpretation.'}</p>
      <Callout variant="honest" title={es ? 'Interpretación' : 'Interpretation'}>
        {es ? 'El umbral AP 0,30 es un gate interno del banco controlado, no una norma industrial. La selección de planta exige test externo, calibración física y criterio operativo.' : 'The AP 0.30 threshold is an internal controlled-benchmark gate, not an industrial standard. Plant selection requires an external test, physical calibration, and operating criteria.'}
      </Callout>
      <Refs ids={['lin2014coco', 'aldrich2010', 'sautermean', 'brier1950', 'villani2009ot']} label="Refs" />
    </div>
  );
}

function ChapterLead({ index, title, text }: { index: string; title: string; text: string }) {
  return <div className="fs-chapter-lead"><span>{index}</span><div><h2>{title}</h2><p>{text}</p></div></div>;
}

function Principle({ n, title, text }: { n: string; title: string; text: string }) {
  return <article><span>{n}</span><strong>{title}</strong><p>{text}</p></article>;
}

function MethodFlowDiagram({ es }: { es: boolean }) {
  const stages = es
    ? ['Ingesta', 'Split por grupo', 'Entrenamiento', 'Calibración', 'Prueba retenida', 'Artefactos']
    : ['Ingestion', 'Group split', 'Training', 'Calibration', 'Held-out test', 'Artifacts'];
  return <FlowDiagram stages={stages} caption={es ? 'Las flechas de decisión nunca regresan desde test' : 'Decision arrows never return from test'} />;
}

function FlowDiagram({ stages, caption }: { stages: string[]; caption: string }) {
  return (
    <figure className="fs-method-flow">
      <svg viewBox="0 0 1080 230" role="img">
        <defs><marker id="method-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker></defs>
        <g stroke="currentColor" strokeWidth="2.5" fill="none" markerEnd="url(#method-arrow)">
          {stages.slice(0, -1).map((_, i) => <path key={i} d={`M${156 + i * 178} 91 H${194 + i * 178}`} />)}
        </g>
        {stages.map((stage, i) => <g key={stage} transform={`translate(${14 + i * 178} 38)`}><rect width="142" height="105" rx="16" /><circle cx="71" cy="38" r="16" /><text x="71" y="43" textAnchor="middle">{i + 1}</text><text x="71" y="79" textAnchor="middle">{stage}</text></g>)}
        <text x="540" y="194" textAnchor="middle" className="caption">{caption}</text>
      </svg>
    </figure>
  );
}

function SplitDiagram({ es }: { es: boolean }) {
  return (
    <figure className="fs-split-diagram">
      <svg viewBox="0 0 960 290" role="img">
        <g className="source">
          <text x="32" y="35">{es ? 'GRUPO LATENTE' : 'LATENT GROUP'}</text>
          {[0, 1, 2, 3].map((i) => <g key={i} transform={`translate(${35 + i * 92} 70)`}><circle cx="32" cy="32" r={28 - i * 2} /><path d="M16 32 Q32 10 48 32 Q32 54 16 32" /></g>)}
          <path d="M410 102 H495" />
        </g>
        <g className="split">
          {([
            [520, 42, 'train', 'TRAIN 192'],
            [730, 42, 'validation', 'VALIDATION 64'],
            [520, 166, 'calibration', 'CALIBRATION 64'],
            [730, 166, 'test', 'TEST 64'],
          ] as Array<[number, number, string, string]>).map(([x, y, cls, label]) => <g key={label} className={cls} transform={`translate(${x} ${y})`}><rect width="176" height="82" rx="13" /><text x="88" y="35" textAnchor="middle">{label}</text><text x="88" y="58" textAnchor="middle" className="small">{es ? 'grupos completos' : 'whole groups'}</text></g>)}
        </g>
        <text x="205" y="213" textAnchor="middle" className="caption">{es ? 'dos apariencias, un único destino' : 'two appearances, one destination'}</text>
        <text x="480" y="272" textAnchor="middle" className="caption">{es ? 'ninguna geometría cruza divisiones' : 'no geometry crosses splits'}</text>
      </svg>
    </figure>
  );
}

function ClassicalMechanismDiagram({ es }: { es: boolean }) {
  return (
    <figure className="fs-mechanism-diagram">
      <svg viewBox="0 0 1000 250" role="img">
        <g transform="translate(30 28)"><text x="0" y="0">{es ? 'IMAGEN' : 'IMAGE'}</text><circle cx="75" cy="92" r="58" /><circle cx="154" cy="92" r="47" /><ellipse cx="103" cy="61" rx="24" ry="10" className="glare" /></g>
        <g transform="translate(300 28)"><text x="0" y="0">{es ? 'SEÑAL' : 'SIGNAL'}</text><path d="M0 145 Q38 120 62 40 Q83 132 118 146 Q147 124 171 56 Q193 133 228 145" /><path d="M75 33V165 M181 48V165" className="markers" /></g>
        <g transform="translate(620 28)"><text x="0" y="0">{es ? 'DECISIÓN' : 'DECISION'}</text><path d="M0 151 H330" /><path d="M0 151 Q44 129 71 47 Q93 135 127 151 Q159 126 190 60 Q212 136 246 151 Q281 135 330 151" /><path d="M106 47 V151 M212 60 V151" className="watershed" /><text x="168" y="190" textAnchor="middle" className="caption">{es ? 'los marcadores controlan el número de instancias' : 'markers control the number of instances'}</text></g>
      </svg>
    </figure>
  );
}

function DenseTargetDiagram({ es }: { es: boolean }) {
  const labels = es ? ['Imagen', 'Interior F', 'Borde B', 'Distancia D', 'Centros C', 'Instancias'] : ['Image', 'Interior F', 'Boundary B', 'Distance D', 'Centers C', 'Instances'];
  return (
    <figure className="fs-target-diagram">
      <svg viewBox="0 0 1080 230" role="img">
        {labels.map((label, i) => <g key={label} transform={`translate(${15 + i * 178} 25)`}><rect width="150" height="145" rx="13" /><TargetGlyph index={i} /><text x="75" y="128" textAnchor="middle">{label}</text>{i < labels.length - 1 && <path d="M150 72 H174" markerEnd="url(#method-arrow)" />}</g>)}
        <text x="540" y="208" textAnchor="middle" className="caption">{es ? 'supervisión densa → marcadores → watershed por instancia' : 'dense supervision → markers → instance watershed'}</text>
      </svg>
    </figure>
  );
}

function TargetGlyph({ index }: { index: number }) {
  if (index === 0) return <g><circle cx="54" cy="59" r="31" /><circle cx="96" cy="56" r="27" /><ellipse cx="71" cy="43" rx="18" ry="7" className="glare" /></g>;
  if (index === 1) return <g className="filled"><circle cx="54" cy="59" r="31" /><circle cx="96" cy="56" r="27" /></g>;
  if (index === 2) return <g className="boundary"><circle cx="54" cy="59" r="31" /><circle cx="96" cy="56" r="27" /></g>;
  if (index === 3) return <g className="distance"><circle cx="54" cy="59" r="31" /><circle cx="96" cy="56" r="27" /><circle cx="54" cy="59" r="7" /><circle cx="96" cy="56" r="7" /></g>;
  if (index === 4) return <g className="centers"><circle cx="54" cy="59" r="8" /><circle cx="96" cy="56" r="8" /></g>;
  return <g className="instances"><circle cx="54" cy="59" r="31" /><circle cx="96" cy="56" r="27" /><text x="54" y="64" textAnchor="middle">1</text><text x="96" y="61" textAnchor="middle">2</text></g>;
}

function TrainingTimeline({ es }: { es: boolean }) {
  return <FlowDiagram stages={es ? ['Inicializar', 'Optimizar', 'Validar', 'Seleccionar', 'Calibrar', 'Congelar'] : ['Initialize', 'Optimize', 'Validate', 'Select', 'Calibrate', 'Freeze']} caption={es ? 'la prueba permanece cerrada durante toda la selección' : 'the test remains closed throughout selection'} />;
}

function InferenceDiagram({ es }: { es: boolean }) {
  return <FlowDiagram stages={es ? ['Normalizar', 'Predecir', 'Construir semillas', 'Separar', 'Medir', 'Exportar'] : ['Normalize', 'Predict', 'Build markers', 'Separate', 'Measure', 'Export']} caption={es ? 'cada etapa conserva parámetros y hashes' : 'every stage preserves parameters and hashes'} />;
}

function TemporalIdentityDiagram({ es }: { es: boolean }) {
  return (
    <figure className="fs-temporal-method">
      <svg viewBox="0 0 980 250" role="img">
        {[0, 1, 2, 3].map((frame) => <g key={frame} transform={`translate(${35 + frame * 235} 32)`}><rect width="190" height="145" rx="14" /><text x="14" y="24">t{frame}</text><circle cx={55 + frame * 7} cy={74 + frame * 4} r="29" className="track-a" /><text x={55 + frame * 7} y={79 + frame * 4} textAnchor="middle">17</text><circle cx={132 - frame * 5} cy={91 - frame * 3} r="24" className="track-b" /><text x={132 - frame * 5} y={96 - frame * 3} textAnchor="middle">31</text>{frame < 3 && <path d="M190 74 H224" markerEnd="url(#method-arrow)" />}</g>)}
        <text x="490" y="224" textAnchor="middle" className="caption">{es ? 'las etiquetas espaciales se convierten en trayectorias persistentes' : 'spatial labels become persistent tracks'}</text>
      </svg>
    </figure>
  );
}
