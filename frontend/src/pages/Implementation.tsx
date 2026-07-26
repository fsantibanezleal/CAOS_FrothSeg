import { Refs, SubTabs, useShellLang } from '@fasl-work/caos-app-shell';

export default function Implementation() {
  const es = useShellLang() === 'es';
  const tabs = [
    { id: 'architecture', label: es ? 'Arquitectura' : 'Architecture', content: <Architecture es={es} /> },
    { id: 'repository', label: es ? 'Repositorio' : 'Repository', content: <Repository es={es} /> },
    { id: 'pipeline', label: es ? 'Pipelines' : 'Pipelines', content: <Pipelines es={es} /> },
    { id: 'artifacts', label: es ? 'Artefactos' : 'Artifacts', content: <Artifacts es={es} /> },
    { id: 'runtimes', label: es ? 'Runtimes científicos' : 'Scientific runtimes', content: <Runtimes es={es} /> },
    { id: 'reproducibility', label: es ? 'Reproducibilidad' : 'Reproducibility', content: <Reproducibility es={es} /> },
    { id: 'extension', label: es ? 'Extender' : 'Extend', content: <Extension es={es} /> },
  ];
  return (
    <div className="page-body prose fs-science-page">
      <header className="page-head fs-science-head">
        <span className="eyebrow">{es ? 'Arquitectura ejecutable del producto' : 'Executable product architecture'}</span>
        <h1>{es ? 'Un repositorio para procesar, entrenar, inferir y auditar' : 'One repository to process, train, infer, and audit'}</h1>
        <p className="lede">
          {es
            ? 'La web es una salida del sistema, no el sistema. La implementación autoritativa vive en pipelines offline, modelos versionados, contratos verificables y artefactos reproducibles.'
            : 'The website is an output of the system, not the system itself. The authoritative implementation lives in offline pipelines, versioned models, verifiable contracts, and reproducible artifacts.'}
        </p>
      </header>
      <section><SubTabs tabs={tabs} ariaLabel={es ? 'Capítulos de implementación' : 'Implementation chapters'} /></section>
    </div>
  );
}

function Architecture({ es }: { es: boolean }) {
  return (
    <div className="fs-implementation-chapter">
      <ImplLead n="01" title={es ? 'Separación por responsabilidad, conectada por contratos' : 'Separation by responsibility, connected by contracts'} text={es ? 'Los datos crudos nunca dependen de la web; la web nunca decide resultados científicos. Cada frontera tiene un formato verificable.' : 'Raw data never depends on the web; the web never decides scientific results. Every boundary has a verifiable format.'} />
      <SystemArchitectureDiagram es={es} />
      <div className="fs-architecture-notes">
        <article><span>A</span><strong>{es ? 'Plano científico' : 'Scientific plane'}</strong><p>{es ? 'Ingesta, generación, entrenamiento GPU, inferencia oficial, evaluación y exportación.' : 'Ingestion, generation, GPU training, official inference, evaluation, and export.'}</p></article>
        <article><span>B</span><strong>{es ? 'Plano de evidencia' : 'Evidence plane'}</strong><p>{es ? 'Manifiestos, hashes, métricas, checkpoints, reportes y artefactos canónicos.' : 'Manifests, hashes, metrics, checkpoints, reports, and canonical artifacts.'}</p></article>
        <article><span>C</span><strong>{es ? 'Superficie web' : 'Web surface'}</strong><p>{es ? 'Explora resultados precalculados y ejecuta solo motores livianos sobre cargas.' : 'Explores precomputed results and runs only lightweight engines on uploads.'}</p></article>
      </div>
      <p className="fs-note good">
        {es
          ? 'El despliegue copia artefactos ya verificados. No genera datos, no entrena y no ejecuta el benchmark.'
          : 'Deployment copies already verified artifacts. It does not generate data, train models, or run the benchmark.'}
      </p>
    </div>
  );
}

function Repository({ es }: { es: boolean }) {
  const nodes = [
    ['data-pipeline/fslab/', es ? 'Librería científica: contratos, algoritmos, modelos, métricas y orquestación.' : 'Scientific library: contracts, algorithms, models, metrics, and orchestration.'],
    ['scripts/', es ? 'Puntos de entrada reproducibles para entrenar, inferir, evaluar y publicar evidencia.' : 'Reproducible entry points for training, inference, evaluation, and evidence publication.'],
    ['data/raw/', es ? 'Fuentes gobernadas; nunca se sobrescriben mediante una compilación web.' : 'Governed sources; never overwritten by a web build.'],
    ['data/derived/', es ? 'Resultados canónicos, manifiestos, métricas y showcase precalculado.' : 'Canonical results, manifests, metrics, and precomputed showcase.'],
    ['models/', es ? 'Manifiestos de corrida, configuración, calibración y linaje de checkpoints.' : 'Run manifests, configuration, calibration, and checkpoint lineage.'],
    ['frontend/', es ? 'Aplicación React que consume contratos públicos compactos.' : 'React application consuming compact public contracts.'],
    ['docs/', es ? 'Wiki interna: métodos, arquitectura, seguridad, guías y decisiones.' : 'Internal wiki: methods, architecture, security, guides, and decisions.'],
    ['verification/', es ? 'Evidencia de paridad, cobertura, QA visual y contrato del workbench.' : 'Parity, coverage, visual-QA, and workbench-contract evidence.'],
    ['tests/', es ? 'Pruebas científicas, de datos, seguridad, release y regresión.' : 'Scientific, data, security, release, and regression tests.'],
  ];
  return (
    <div className="fs-implementation-chapter">
      <ImplLead n="02" title={es ? 'El producto completo cabe en el repositorio' : 'The complete product lives in the repository'} text={es ? 'Código, parámetros, artefactos y documentación siguen una estructura única. Un nuevo usuario no necesita reconstruir el proyecto a partir de la web.' : 'Code, parameters, artifacts, and documentation follow one structure. A new user does not need to reverse-engineer the project from the website.'} />
      <div className="fs-repo-map">
        <div className="fs-repo-root"><strong>CAOS_FrothSeg/</strong><span>{es ? 'raíz versionada' : 'versioned root'}</span></div>
        {nodes.map(([path, text]) => <article key={path}><code>{path}</code><p>{text}</p></article>)}
      </div>
      <h3>{es ? 'Dependencias y entornos' : 'Dependencies and environments'}</h3>
      <p>
        {es
          ? 'El entorno de pipeline contiene NumPy, SciPy, scikit-image, OpenCV y pycocotools. El entorno GPU añade PyTorch y runtimes oficiales. StarDist conserva su entorno TensorFlow separado para evitar resolver stacks incompatibles dentro de una sola instalación.'
          : 'The pipeline environment contains NumPy, SciPy, scikit-image, OpenCV, and pycocotools. The GPU environment adds PyTorch and official runtimes. StarDist keeps a separate TensorFlow environment to avoid resolving incompatible stacks in one installation.'}
      </p>
    </div>
  );
}

function Pipelines({ es }: { es: boolean }) {
  const tracks = [
    {
      id: 'DATA',
      title: es ? 'Preparar datos' : 'Prepare data',
      command: 'python -m fslab.pipeline all --output <run-dir>',
      steps: es ? ['validar fuente', 'generar o importar', 'dividir por grupo', 'materializar caché'] : ['validate source', 'generate or import', 'split by group', 'materialize cache'],
    },
    {
      id: 'TRAIN',
      title: es ? 'Entrenar modelos' : 'Train models',
      command: 'python scripts/train_<method>.py --config <run-config>',
      steps: es ? ['cargar train', 'optimizar', 'seleccionar en validation', 'guardar checkpoint'] : ['load train', 'optimize', 'select on validation', 'save checkpoint'],
    },
    {
      id: 'INFER',
      title: es ? 'Inferir lotes' : 'Run batch inference',
      command: 'python scripts/infer_<method>.py --input <images-or-video>',
      steps: es ? ['resolver runtime', 'verificar dispositivo', 'predecir', 'exportar instancias'] : ['resolve runtime', 'verify device', 'predict', 'export instances'],
    },
    {
      id: 'EVAL',
      title: es ? 'Evaluar' : 'Evaluate',
      command: 'python scripts/evaluate_<method>.py --split test',
      steps: es ? ['cargar test', 'corresponder instancias', 'medir morfometría', 'agregar evidencia'] : ['load test', 'match instances', 'measure morphometry', 'aggregate evidence'],
    },
    {
      id: 'SHOW',
      title: es ? 'Publicar casos' : 'Publish cases',
      command: 'python -m fslab.pipeline showcase',
      steps: es ? ['leer inferencias', 'compactar análisis', 'generar secuencias', 'firmar manifiesto'] : ['read inference', 'compact analysis', 'generate sequences', 'sign manifest'],
    },
  ];
  return (
    <div className="fs-implementation-chapter">
      <ImplLead n="03" title={es ? 'Pipelines distintos para decisiones distintas' : 'Distinct pipelines for distinct decisions'} text={es ? 'Procesar, entrenar, inferir, evaluar y publicar son operaciones independientes. Pueden repetirse sin convertir una compilación web en un experimento científico.' : 'Processing, training, inference, evaluation, and publication are independent operations. They can be repeated without turning a web build into a scientific experiment.'} />
      <PipelineOrchestrationDiagram es={es} />
      <div className="fs-pipeline-tracks">
        {tracks.map((track) => (
          <article key={track.id}>
            <div className="fs-track-head"><span>{track.id}</span><strong>{track.title}</strong></div>
            <code>{track.command}</code>
            <ol>{track.steps.map((step) => <li key={step}>{step}</li>)}</ol>
          </article>
        ))}
      </div>
      <p className="fs-note">
        {es
          ? 'Las corridas de prueba y CI escriben en un directorio sandbox indicado por --output. Solo una operación de release explícita actualiza data/derived.'
          : 'Test and CI runs write to an explicit sandbox directory through --output. Only an intentional release operation updates data/derived.'}
      </p>
    </div>
  );
}

function Artifacts({ es }: { es: boolean }) {
  const artifactTypes = [
    ['frame.png', es ? 'imagen de entrada normalizada' : 'normalized input image', 'SHA-256'],
    ['labels.rle', es ? 'mapa entero de instancias comprimido' : 'compressed integer instance map', 'shape · dtype · SHA-256'],
    ['analysis.json', es ? 'morfometría, error, confianza y proveniencia' : 'morphometry, error, confidence, and provenance', 'schema · SHA-256'],
    ['checkpoint', es ? 'pesos seleccionados y linaje' : 'selected weights and lineage', 'dataset · seed · SHA-256'],
    ['benchmark.json', es ? 'métricas por muestra y agregados' : 'per-sample metrics and aggregates', 'split · coverage · schema'],
    ['manifest.json', es ? 'índice verificable de todos los anteriores' : 'verifiable index of all of the above', 'path · bytes · SHA-256'],
  ];
  return (
    <div className="fs-implementation-chapter">
      <ImplLead n="04" title={es ? 'Los resultados científicos son artefactos direccionables' : 'Scientific results are addressable artifacts'} text={es ? 'Una cifra visible puede rastrearse hasta un método, una muestra, un checkpoint y una configuración. El manifiesto hace esa cadena verificable por máquinas.' : 'A visible number can be traced to a method, sample, checkpoint, and configuration. The manifest makes that chain machine-verifiable.'} />
      <ArtifactContractDiagram es={es} />
      <div className="fs-artifact-cards">
        {artifactTypes.map(([name, purpose, evidence]) => <article key={name}><code>{name}</code><p>{purpose}</p><span>{evidence}</span></article>)}
      </div>
      <h3>{es ? 'Contrato del showcase' : 'Showcase contract'}</h3>
      <p>
        {es
          ? 'Cada uno de los 15 métodos se cruza con los 13 casos canónicos: 195 pares obligatorios. Cada par contiene visualización y análisis compacto. El manifiesto temporal añade cinco secuencias de ocho cuadros con tres artefactos verificados por cuadro.'
          : 'Each of the 15 methods is crossed with all 13 canonical cases: 195 required pairs. Every pair contains a visualization and compact analysis. The temporal manifest adds five eight-frame sequences with three verified artifacts per frame.'}
      </p>
    </div>
  );
}

function Runtimes({ es }: { es: boolean }) {
  const groups = [
    ['C1–C7', 'SciPy · scikit-image · OpenCV', es ? 'CPU determinista; C1, C3 y C4 tienen implementación TypeScript verificada por paridad.' : 'Deterministic CPU; C1, C3, and C4 have parity-verified TypeScript implementations.'],
    ['L1–L3 · N1', 'PyTorch CUDA', es ? 'Arquitecturas, targets, entrenamiento e inferencia implementados en el repositorio.' : 'Architectures, targets, training, and inference implemented in-repository.'],
    ['L4', 'StarDist / TensorFlow', es ? 'Entrenamiento e inferencia con el runtime oficial y exportación H5.' : 'Training and inference through the official runtime with H5 export.'],
    ['L5', 'Cellpose-SAM', es ? 'Checkpoint oficial como inicialización, ajuste GPU y evaluación completa.' : 'Official checkpoint initialization, GPU fine-tuning, and complete evaluation.'],
    ['L6', 'Ultralytics YOLO', es ? 'Dataset poligonal, entrenamiento de segmentación y pesos PT.' : 'Polygon dataset, segmentation training, and PT weights.'],
    ['L7', 'facebookresearch/sam2', es ? 'Inferencia de imagen y propagación temporal mediante código oficial fijado.' : 'Image inference and temporal propagation through pinned official code.'],
  ];
  return (
    <div className="fs-implementation-chapter">
      <ImplLead n="05" title={es ? 'Implementaciones científicas reales, no imitaciones web' : 'Real scientific implementations, not web imitations'} text={es ? 'Cada familia utiliza el runtime que corresponde a la publicación o una implementación limpia documentada. La interfaz no suplanta motores que no puede ejecutar fielmente.' : 'Each family uses the runtime corresponding to the publication or a documented clean implementation. The interface does not impersonate engines it cannot execute faithfully.'} />
      <div className="fs-runtime-stack">
        {groups.map(([id, runtime, description], index) => <article key={id}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{id}</strong><code>{runtime}</code><p>{description}</p></div></article>)}
      </div>
      <h3>{es ? 'Paridad entre runtimes' : 'Cross-runtime parity'}</h3>
      <p>
        {es
          ? 'Los motores interactivos clásicos se comparan contra Python sobre condiciones retenidas mediante AP, F-score de frontera y razón de conteo. Un método solo aparece para cargas si pasa esa puerta; el resto permanece disponible como resultado precalculado.'
          : 'Interactive classical engines are compared against Python on held-out conditions using AP, boundary F-score, and count ratio. A method appears for uploads only if it passes that gate; every other method remains available as a precomputed result.'}
      </p>
      <Refs ids={['meyer1994', 'achanta2012slic', 'kirillov2023']} label="Refs" />
    </div>
  );
}

function Reproducibility({ es }: { es: boolean }) {
  const gates = [
    [es ? 'Datos' : 'Data', es ? 'split por grupo, licencia, escala y checksum' : 'group split, license, scale, and checksum'],
    [es ? 'Código' : 'Code', es ? 'commit y versión de dependencias' : 'commit and dependency versions'],
    [es ? 'Modelo' : 'Model', es ? 'semilla, dispositivo, checkpoint y calibración' : 'seed, device, checkpoint, and calibration'],
    [es ? 'Cobertura' : 'Coverage', es ? '960 celdas y 195 pares canónicos' : '960 cells and 195 canonical pairs'],
    [es ? 'Interfaz' : 'Interface', es ? 'rutas, temas, móvil, errores y contratos' : 'routes, themes, mobile, errors, and contracts'],
    [es ? 'Release' : 'Release', es ? 'reporte, versión, CI, despliegue y SHA exacto' : 'report, version, CI, deployment, and exact SHA'],
  ];
  return (
    <div className="fs-implementation-chapter">
      <ImplLead n="06" title={es ? 'Una cadena de custodia para resultados' : 'A chain of custody for results'} text={es ? 'Reproducir no significa solo volver a ejecutar: significa demostrar que la entrada, el código, la decisión y la salida corresponden a la misma corrida.' : 'Reproducibility means more than rerunning: it means proving that input, code, decision, and output belong to the same run.'} />
      <VerificationGateDiagram es={es} />
      <div className="fs-gate-grid">
        {gates.map(([title, text], index) => <article key={title}><span>{index + 1}</span><strong>{title}</strong><p>{text}</p></article>)}
      </div>
      <h3>{es ? 'Qué falla una release' : 'What fails a release'}</h3>
      <p>
        {es
          ? 'Faltan muestras, métodos o métricas; un hash no coincide; un checkpoint aprendido no existe; la calibración usa test; la documentación anuncia otra disponibilidad; la web no carga un par canónico; o la versión esperada no coincide con el tag.'
          : 'A release fails when samples, methods, or metrics are missing; a hash drifts; a learned checkpoint is absent; calibration uses test; documentation advertises different availability; the web cannot load a canonical pair; or the expected version does not match the tag.'}
      </p>
    </div>
  );
}

function Extension({ es }: { es: boolean }) {
  return (
    <div className="fs-implementation-chapter">
      <ImplLead n="07" title={es ? 'Agregar un método sin romper la comparación' : 'Add a method without breaking comparability'} text={es ? 'Un nuevo algoritmo entra por el registro, implementa el contrato común y aporta evidencia antes de aparecer en la interfaz.' : 'A new algorithm enters through the registry, implements the common contract, and contributes evidence before appearing in the interface.'} />
      <ol className="fs-extension-steps">
        <li><span>01</span><div><strong>{es ? 'Registrar' : 'Register'}</strong><p>{es ? 'ID, nombre técnico, motor, proveniencia, licencia y documentación.' : 'ID, technical name, engine, provenance, license, and documentation.'}</p></div></li>
        <li><span>02</span><div><strong>{es ? 'Implementar' : 'Implement'}</strong><p>{es ? 'Inferencia sobre imagen y lote; entrenamiento/exportación si aprende.' : 'Image and batch inference; training/export when learned.'}</p></div></li>
        <li><span>03</span><div><strong>{es ? 'Calibrar' : 'Calibrate'}</strong><p>{es ? 'Fijar umbrales en calibration, nunca en test.' : 'Fix thresholds on calibration, never on test.'}</p></div></li>
        <li><span>04</span><div><strong>{es ? 'Evaluar' : 'Evaluate'}</strong><p>{es ? 'Completar las 64 muestras, métricas, runtime, memoria y tamaño.' : 'Complete all 64 samples, metrics, runtime, memory, and size.'}</p></div></li>
        <li><span>05</span><div><strong>{es ? 'Publicar' : 'Publish'}</strong><p>{es ? 'Generar los 13 casos, actualizar manifiestos y verificar hashes.' : 'Generate all 13 cases, update manifests, and verify hashes.'}</p></div></li>
        <li><span>06</span><div><strong>{es ? 'Documentar' : 'Document'}</strong><p>{es ? 'Explicar hipótesis, formulación, limitaciones, resultados y reproducción.' : 'Explain hypothesis, formulation, limitations, results, and reproduction.'}</p></div></li>
      </ol>
      <pre className="fs-command">{`# Validate without touching canonical artifacts
python -m fslab.pipeline all --output runs/precompute-check
python scripts/evaluate_<method>.py --split test --output runs/<method>
python -m fslab.pipeline showcase --input runs/release --output runs/showcase
python scripts/check_product_completeness.py --profile development`}</pre>
    </div>
  );
}

function ImplLead({ n, title, text }: { n: string; title: string; text: string }) {
  return <div className="fs-chapter-lead"><span>{n}</span><div><h2>{title}</h2><p>{text}</p></div></div>;
}

function SystemArchitectureDiagram({ es }: { es: boolean }) {
  const scientific = es ? ['Fuentes', 'Preparación', 'Entrenamiento', 'Inferencia', 'Evaluación'] : ['Sources', 'Preparation', 'Training', 'Inference', 'Evaluation'];
  return (
    <figure className="fs-system-diagram">
      <svg viewBox="0 0 1120 440" role="img">
        <defs><marker id="impl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker></defs>
        <text x="30" y="38" className="plane-label">{es ? 'PLANO CIENTÍFICO · OFFLINE' : 'SCIENTIFIC PLANE · OFFLINE'}</text>
        {scientific.map((label, i) => <g key={label} transform={`translate(${28 + i * 211} 65)`}><rect width="170" height="84" rx="14" /><text x="85" y="49" textAnchor="middle">{label}</text>{i < scientific.length - 1 && <path d="M170 42H201" markerEnd="url(#impl-arrow)" />}</g>)}
        <g className="bus"><path d="M110 149 V220 H1018 V149" /><path d="M322 149V220 M533 149V220 M744 149V220" /></g>
        <text x="30" y="262" className="plane-label">{es ? 'PLANO DE EVIDENCIA' : 'EVIDENCE PLANE'}</text>
        {[
          [30, es ? 'Datos + splits' : 'Data + splits'],
          [246, es ? 'Checkpoints' : 'Checkpoints'],
          [462, es ? 'Máscaras + análisis' : 'Masks + analysis'],
          [678, es ? 'Métricas + reportes' : 'Metrics + reports'],
          [894, es ? 'Manifiestos' : 'Manifests'],
        ].map(([x, label]) => <g key={String(label)} transform={`translate(${x} 282)`}><rect width="190" height="72" rx="12" /><text x="95" y="43" textAnchor="middle">{label}</text></g>)}
        <g className="web"><path d="M560 354 V382" markerEnd="url(#impl-arrow)" /><rect x="390" y="386" width="340" height="42" rx="11" /><text x="560" y="413" textAnchor="middle">{es ? 'WEB · EXPLORACIÓN Y REPRODUCCIÓN' : 'WEB · EXPLORATION AND REPLAY'}</text></g>
      </svg>
    </figure>
  );
}

function PipelineOrchestrationDiagram({ es }: { es: boolean }) {
  return (
    <figure className="fs-orchestration-diagram">
      <svg viewBox="0 0 1100 320" role="img">
        <defs><marker id="pipe-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker></defs>
        <g className="source"><rect x="35" y="95" width="150" height="95" rx="16" /><text x="110" y="136" textAnchor="middle">{es ? 'DATOS' : 'DATA'}</text><text x="110" y="162" textAnchor="middle" className="small">{es ? 'crudos + sintéticos' : 'raw + synthetic'}</text></g>
        <g className="hub"><circle cx="340" cy="142" r="78" /><text x="340" y="136" textAnchor="middle">fslab</text><text x="340" y="162" textAnchor="middle" className="small">pipeline + contracts</text></g>
        {[
          [540, 28, 'TRAIN'],
          [750, 28, 'INFER'],
          [540, 180, 'EVALUATE'],
          [750, 180, 'EXPORT'],
          [930, 104, 'WEB'],
        ].map(([x, y, label]) => <g key={String(label)} transform={`translate(${x} ${y})`}><rect width="145" height="76" rx="13" /><text x="72.5" y="45" textAnchor="middle">{label}</text></g>)}
        <g className="arrows" markerEnd="url(#pipe-arrow)"><path d="M185 142H254" /><path d="M407 100L534 66" /><path d="M418 132L744 66" /><path d="M407 184L534 218" /><path d="M418 154L744 218" /><path d="M895 218L958 184" /></g>
        <text x="550" y="292" textAnchor="middle" className="caption">{es ? 'cada operación escribe su propio directorio de corrida' : 'every operation writes its own run directory'}</text>
      </svg>
    </figure>
  );
}

function ArtifactContractDiagram({ es }: { es: boolean }) {
  return (
    <figure className="fs-artifact-diagram">
      <svg viewBox="0 0 1050 320" role="img">
        <defs><marker id="artifact-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker></defs>
        <g className="sample"><rect x="30" y="77" width="180" height="146" rx="16" /><text x="120" y="113" textAnchor="middle">{es ? 'MUESTRA' : 'SAMPLE'}</text><text x="120" y="146" textAnchor="middle" className="small">sample_id</text><text x="120" y="170" textAnchor="middle" className="small">group_id</text><text x="120" y="194" textAnchor="middle" className="small">source_sha256</text></g>
        <g className="arrows" markerEnd="url(#artifact-arrow)"><path d="M210 150H280" /><path d="M468 150H538" /><path d="M726 150H796" /></g>
        <g><rect x="280" y="77" width="188" height="146" rx="16" /><text x="374" y="113" textAnchor="middle">{es ? 'INFERENCIA' : 'INFERENCE'}</text><text x="374" y="146" textAnchor="middle" className="small">method + checkpoint</text><text x="374" y="170" textAnchor="middle" className="small">labels + probabilities</text><text x="374" y="194" textAnchor="middle" className="small">runtime + device</text></g>
        <g><rect x="538" y="77" width="188" height="146" rx="16" /><text x="632" y="113" textAnchor="middle">{es ? 'ANÁLISIS' : 'ANALYSIS'}</text><text x="632" y="146" textAnchor="middle" className="small">metrics + morphometry</text><text x="632" y="170" textAnchor="middle" className="small">errors + confidence</text><text x="632" y="194" textAnchor="middle" className="small">timing + memory</text></g>
        <g className="manifest"><rect x="796" y="52" width="220" height="196" rx="16" /><text x="906" y="93" textAnchor="middle">MANIFEST</text><text x="906" y="132" textAnchor="middle" className="small">schema</text><text x="906" y="156" textAnchor="middle" className="small">path · bytes · SHA-256</text><text x="906" y="180" textAnchor="middle" className="small">code · data · model</text><text x="906" y="217" textAnchor="middle" className="verified">✓ {es ? 'verificable' : 'verifiable'}</text></g>
        <text x="520" y="289" textAnchor="middle" className="caption">{es ? 'la proveniencia se propaga, no se reconstruye al final' : 'provenance propagates; it is not reconstructed at the end'}</text>
      </svg>
    </figure>
  );
}

function VerificationGateDiagram({ es }: { es: boolean }) {
  const labels = es ? ['Datos', 'Ciencia', 'Artefactos', 'Contenido', 'UI', 'Release'] : ['Data', 'Science', 'Artifacts', 'Content', 'UI', 'Release'];
  return (
    <figure className="fs-gates-diagram">
      <svg viewBox="0 0 1080 240" role="img">
        <defs><marker id="gate-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker></defs>
        {labels.map((label, i) => <g key={label} transform={`translate(${15 + i * 178} 35)`}><path d="M18 0H124L142 50L124 100H18L0 50Z" /><text x="71" y="45" textAnchor="middle">{label}</text><text x="71" y="67" textAnchor="middle" className="check">✓</text>{i < labels.length - 1 && <path d="M142 50H174" className="arrow" markerEnd="url(#gate-arrow)" />}</g>)}
        <text x="540" y="190" textAnchor="middle" className="caption">{es ? 'una release solo avanza si todas las puertas prueban cobertura' : 'a release advances only when every gate proves coverage'}</text>
      </svg>
    </figure>
  );
}
