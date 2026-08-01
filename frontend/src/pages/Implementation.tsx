import { Callout, Cite, Equation, Figure, InlineMath, Refs, Tabs, useShellLang } from '@fasl-work/caos-app-shell';

/* Implementation page. Every numeric claim below carries the repository file it was read from in a
   JSX/TS comment next to it. Sources used, in the repository:
     docs/architecture/01_overview.md .. 08_data-contracts.md
     docs/data-contract/01_records-and-splits.md
     docs/guides/01_precompute-pipeline.md, 02_bring-your-own-data.md, 03_verify-sam.md
     docs/metrics/01_definitions.md, docs/temporal/01_tracking-and-events.md
     data-pipeline/fslab/core/gate.py, data-pipeline/fslab/pipeline.py
     scripts/check_artifacts.py, scripts/build_release_report.py, scripts/check_content_standards.py
     data/derived/{method-benchmark,release-report,real-adjacent-benchmark}.json
     data/derived/showcase/manifest.json, data/derived/manifests/poly-normal.json
     manifests/learned-dataset-v2.json, verification/classical-live-parity.json
     .github/workflows/{ci,deploy-pages}.yml, frontend/copy-data.mjs, frontend/src/api/artifacts.ts */

export default function Implementation() {
  const es = useShellLang() === 'es';
  const refsLabel = 'Refs';

  const tabs = [
    { id: 'lanes', label: es ? 'Arquitectura' : 'Architecture', content: <Lanes es={es} refsLabel={refsLabel} /> },
    { id: 'repository', label: es ? 'Repositorio' : 'Repository', content: <Repository es={es} refsLabel={refsLabel} /> },
    { id: 'precompute', label: es ? 'Precálculo' : 'Precompute', content: <Precompute es={es} refsLabel={refsLabel} /> },
    { id: 'determinism', label: es ? 'Determinismo' : 'Determinism', content: <Determinism es={es} refsLabel={refsLabel} /> },
    { id: 'gate', label: es ? 'La puerta' : 'The gate', content: <TheGate es={es} refsLabel={refsLabel} /> },
    { id: 'contracts', label: es ? 'Contratos' : 'Contracts', content: <Contracts es={es} refsLabel={refsLabel} /> },
    { id: 'evidence', label: es ? 'Evidencia y release' : 'Evidence and release', content: <Evidence es={es} refsLabel={refsLabel} /> },
    { id: 'deployment', label: es ? 'Despliegue' : 'Deployment', content: <Deployment es={es} refsLabel={refsLabel} /> },
  ];

  return (
    <div className="page-body">
      <div className="page-head prose">
        <h1>{es ? 'Implementación' : 'Implementation'}</h1>
        <p className="lede">
          {es
            ? 'El producto autoritativo es una cadena offline en Python: genera datos con verdad exacta, entrena, infiere, evalúa y firma cada resultado. Este sitio es una superficie de reproducción sobre esos artefactos ya verificados: no entrena, no recalcula el benchmark y no decide ningún número. Cada caso canónico es una función pura de su especificación y su semilla, '
            : 'The authoritative product is an offline Python chain: it generates data with exact truth, trains, infers, evaluates, and signs every result. This site is a replay surface over those already verified artifacts: it does not train, it does not recompute the benchmark, and it decides no number. Every canonical case is a pure function of its specification and seed, '}
          <InlineMath tex={String.raw`A=\mathcal E\big(f(\mathrm{spec},s)\big)`} />
          {es ? '.' : '.'}
        </p>
      </div>
      <Tabs tabs={tabs} ariaLabel={es ? 'implementación' : 'implementation'} />
    </div>
  );
}

/* ---------------------------------------------------------------- shared SVG primitives.
   Theme-aware shell diagram classes only (dg-box / dg-box-title / dg-box-sub / dg-edge /
   dg-edge-label / dg-arrowhead / dg-note from the shell stylesheet). No font sizes are declared
   here: the shell owns them, so the diagram follows light and dark automatically. */

function DgBox({
  x, y, w, h, title, lines, accent,
}: { x: number; y: number; w: number; h: number; title: string; lines: string[]; accent?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} className={accent ? 'dg-box accent' : 'dg-box'} />
      <text x={x + 14} y={y + 24} className={accent ? 'dg-box-title accent' : 'dg-box-title'}>{title}</text>
      {lines.map((line, index) => (
        <text key={line} x={x + 14} y={y + 46 + index * 18} className="dg-box-sub">{line}</text>
      ))}
    </g>
  );
}

function DgDown({ x, y1, y2, label, marker }: { x: number; y1: number; y2: number; label: string; marker: string }) {
  return (
    <g>
      <path d={`M${x} ${y1}L${x} ${y2}`} className="dg-edge" markerEnd={`url(#${marker})`} />
      <text x={x + 12} y={(y1 + y2) / 2 + 4} className="dg-edge-label">{label}</text>
    </g>
  );
}

function DgArrowDefs({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0 0L10 5L0 10z" className="dg-arrowhead" />
      </marker>
    </defs>
  );
}

/* ---------------------------------------------------------------- 01 architecture */

function Lanes({ es, refsLabel }: { es: boolean; refsLabel: string }) {
  return (
    <div className="prose">
      <p className="measure">
        {es
          ? 'FrothSeg es un producto offline con un sitio acompañante, y cuatro superficies cooperan sin que ninguna pueda tomar el trabajo de otra. La superficie científica contiene los contratos de imagen, los generadores de escenas sintéticas y de secuencias con identidad persistente, los siete algoritmos clásicos y todas las métricas. La superficie de modelos contiene el entrenamiento CUDA, la calibración, la inferencia y los adaptadores que manejan los runtimes oficiales de investigación. La superficie de evidencia contiene manifiestos de corrida, checksums, resultados retenidos, reportes temporales y la puerta de release. La superficie web reproduce casos seleccionados y ofrece una interacción viva acotada. La dirección de dependencia corre siempre en un solo sentido: los datos crudos y el cómputo offline nunca dependen del sitio, y el sitio nunca decide un resultado científico.'
          : 'FrothSeg is an offline product with a companion website, and four surfaces cooperate without any of them taking over the work of another. The science surface holds the image contracts, the generators for synthetic scenes and for persistent-identity sequences, the seven classical algorithms, and every metric. The model surface holds CUDA training, calibration, inference, and the adapters that drive the official research runtimes. The evidence surface holds run manifests, checksums, held-out results, temporal reports, and the release gate. The web surface replays selected cases and offers one bounded live interaction. The direction of dependency always runs one way: raw data and offline compute never depend on the site, and the site never decides a scientific result.'}
        {' '}<Cite id="aldrich2010" paren />
      </p>
      <p className="measure">
        {es
          ? 'La separación existe porque la escalera de métodos no cabe en un navegador. Se comparan quince implementaciones: siete métodos clásicos construidos sobre SciPy, scikit-image y OpenCV; cinco modelos de dominio entrenados en este repositorio; dos integraciones oficiales de modelos fundacionales; y un modelo de investigación propio. El carril aprendido necesita CUDA, ruedas de visión por computador en Python y checkpoints de cientos de megabytes: el artefacto de inferencia más grande registrado pesa 1.218.643.819 bytes y deliberadamente no se versiona. Llevar eso a una página estática sería imposiblemente lento o una imitación truncada del método publicado, así que el repositorio lo calcula una vez, registra lo que produjo, y la página lee el registro.'
          : 'The separation exists because the method ladder does not fit in a browser. Fifteen implementations are compared: seven classical methods built on SciPy, scikit-image, and OpenCV; five domain models trained in this repository; two official foundation-model integrations; and one in-repository research model. The learned lane needs CUDA, Python computer-vision wheels, and checkpoints measured in hundreds of megabytes: the largest recorded inference artifact is 1,218,643,819 bytes and is deliberately not versioned. Moving that into a static page would be either impossibly slow or a truncated imitation of the published method, so the repository computes it once, records what it produced, and the page reads the record.'}
        {' '}<Cite id="stringer2021cellpose" paren />
        {/* 15 methods and the 1218643819-byte artifact: data/derived/method-benchmark.json
            (methods[].compute.model_artifact_bytes for L5, model_artifact_committed false) */}
      </p>
      <p className="measure">
        {es
          ? 'Vale la pena decir con precisión qué lee el sitio, porque la frontera es la afirmación. La página pide el índice de casos y el manifiesto de cada caso; por caso, la imagen, las máscaras exactas, la morfometría, el resultado clásico y la tarjeta compacta de selección; el benchmark unificado de los quince métodos; el diagnóstico registrado del segmentador de navegador; el reporte temporal por método y el manifiesto de secuencias; y los rásteres de etiquetas más las previsualizaciones del par método-caso seleccionado. También pide algo que no está en el repositorio: los pesos del modelo de segmentación en navegador, descargados del hub de modelos al cargar. Ninguna de esas lecturas recalcula nada.'
          : 'It is worth saying precisely what the site reads, because the boundary is the claim. The page requests the case index and each case manifest; per case, the image, the exact masks, the morphometry, the classical result, and the compact selector card; the unified fifteen-method benchmark; the recorded diagnostic of the browser segmenter; the per-method temporal report and the sequence manifest; and the label rasters plus previews for the selected method-case pair. It also requests one thing that is not in the repository: the weights of the in-browser segmentation model, fetched from the model hub at load time. None of those reads recomputes anything.'}
        {' '}<Cite id="transformersjs" paren />
        {/* the exact read set: frontend/src/api/artifacts.ts (loadIndex, loadManifest, loadCard,
            loadMasks, loadBenchmark, loadMethodBenchmark, loadSamBenchmark, loadTemporalBenchmark,
            loadTemporalShowcase, artifactUrl); hub fetch: docs/architecture/07_deploy.md */}
      </p>

      <Figure caption={es
        ? 'Las seis etapas y lo que cruza cada frontera. Todo valor mostrado se lee de un artefacto versionado del repositorio.'
        : 'The six stages and what crosses each boundary. Every value shown is read from a versioned artifact in the repository.'}>
        <ArchitectureSVG es={es} />
      </Figure>

      <h3>{es ? 'El tamaño de la superficie de reproducción' : 'The size of the replay surface'}</h3>
      <p className="measure">
        {es
          ? 'La reproducción no es una selección de casos bonitos: es un producto completo. Cada uno de los quince métodos registrados aporta un par de artefactos para cada uno de los doce casos de presentación, y el manifiesto del showcase declara ese producto como una identidad que la verificación comprueba. El caso de control vacío queda fuera del conjunto de presentación (no hay nada que mostrar en una escena sin espuma) pero permanece contado en el suite diagnóstico de trece casos, donde su función es negativa: cualquier método que alucine burbujas ahí está fallando el control.'
          : 'Replay is not a selection of pretty cases: it is a complete product. Each of the fifteen registered methods contributes one artifact pair for each of the twelve presentation cases, and the showcase manifest declares that product as an identity which verification checks. The empty control case sits outside the presentation set (there is nothing to display in a scene with no froth) but stays counted in the thirteen-case diagnostic suite, where its role is negative: any method that hallucinates bubbles there is failing the control.'}
      </p>
      <Equation
        tex={String.raw`|\mathcal P|=|\mathcal M|\times|\mathcal C_{\mathrm{show}}|=15\times 12=180,\qquad |\mathcal C_{\mathrm{bench}}|=13`}
        caption={es
          ? 'La superficie de reproducción es el producto completo de métodos por casos de presentación; el benchmark diagnóstico retiene además el control vacío.'
          : 'The replay surface is the complete product of methods by presentation cases; the diagnostic benchmark additionally retains the empty control.'}
      />
      {/* 15 / 12 / 180 / 13: data/derived/showcase/manifest.json
          (method_count 15, case_count 12, artifact_count 180, benchmark_case_count 13,
           excluded_primary_cases ["empty-control"]) */}
      <ul className="measure">
        <li><InlineMath tex={String.raw`\mathcal M`} />, {es ? 'los métodos registrados, C1 a C7 clásicos, L1 a L7 aprendidos o fundacionales, N1 de investigación.' : 'the registered methods, C1 to C7 classical, L1 to L7 learned or foundation, N1 research.'}</li>
        <li><InlineMath tex={String.raw`\mathcal C_{\mathrm{show}}`} />, {es ? 'los casos de presentación con espuma visible.' : 'the presentation cases with visible froth.'}</li>
        <li><InlineMath tex={String.raw`\mathcal C_{\mathrm{bench}}`} />, {es ? 'el suite diagnóstico completo, que incluye el control vacío con AP indefinida por construcción.' : 'the complete diagnostic suite, which includes the empty control whose AP is undefined by construction.'}</li>
      </ul>
      <Callout variant="honest" title={es ? 'Frontera de autoridad' : 'Authority boundary'}>
        {es
          ? 'El despliegue copia artefactos ya verificados. No genera datos, no entrena, no ejecuta los runtimes oficiales y no recalcula el benchmark. Una página alcanzable que sirva evidencia antigua se considera una falla, no un detalle.'
          : 'Deployment copies already verified artifacts. It does not generate data, does not train, does not run the official runtimes, and does not recompute the benchmark. A reachable page serving stale evidence counts as a failure, not a detail.'}
      </Callout>
      <Refs ids={['aldrich2010', 'stringer2021cellpose', 'transformersjs']} label={refsLabel} />
    </div>
  );
}

function ArchitectureSVG({ es }: { es: boolean }) {
  const marker = 'fs-arch-arrow';
  /* Six top-level nodes, one labelled edge between each. Values read from:
     manifests/learned-dataset-v2.json (16 conditions, 384 samples, 192 groups, splits),
     data/derived/method-benchmark.json (15 methods, 960 cells),
     data/derived/showcase/manifest.json (180 pairs, 795 temporal artifacts, 1240 hashed files),
     data-pipeline/fslab/core/gate.py (1500 ms, 262144 bytes),
     .github/workflows/deploy-pages.yml + frontend/copy-data.mjs (build and overlay),
     docs/architecture/04_live-lane-pyodide.md + 07_deploy.md (live method set, device choice). */
  const boxes = [
    {
      title: es ? '1 · Generador y dataset' : '1 · Generator and dataset',
      lines: es
        ? ['diagrama de potencia de Laguerre (froth_gen)', '16 condiciones · 384 muestras · 192 grupos', 'splits 192 train / 64 val / 64 cal / 64 test']
        : ['Laguerre power diagram (froth_gen)', '16 conditions · 384 samples · 192 groups', 'splits 192 train / 64 val / 64 cal / 64 test'],
      tag: es ? 'offline · CPU' : 'offline · CPU',
      edge: es ? 'un grupo por split (sin fuga de apariencia)' : 'one group per split (no appearance leak)',
    },
    {
      title: es ? '2 · Motores offline (15 métodos)' : '2 · Offline engines (15 methods)',
      lines: es
        ? ['C1 a C7: scikit-image · SciPy · OpenCV', 'L1 a L4, L6, N1: entrenados en el repositorio', 'L5 y L7: runtimes oficiales fijados']
        : ['C1 to C7: scikit-image · SciPy · OpenCV', 'L1 to L4, L6, N1: trained in this repository', 'L5 and L7: pinned official runtimes'],
      tag: es ? 'offline · CUDA' : 'offline · CUDA',
      edge: es ? 'etiquetas, métricas por celda, manifiestos' : 'labels, per-cell metrics, run manifests',
    },
    {
      title: es ? '3 · Evidencia versionada' : '3 · Versioned evidence',
      lines: es
        ? ['13 manifiestos de caso · frothseg.manifest/v1', 'benchmark unificado: 15 x 64 = 960 celdas', 'showcase 180 pares · temporal 795 archivos']
        : ['13 case manifests · frothseg.manifest/v1', 'unified benchmark: 15 x 64 = 960 cells', 'showcase 180 pairs · temporal 795 files'],
      tag: es ? 'versionado' : 'committed',
      edge: es ? 're-hash de 1240 archivos, byte a byte' : 're-hash of 1240 files, byte for byte',
    },
    {
      title: es ? '4 · Puertas de verificación' : '4 · Verification gates',
      lines: es
        ? ['check_artifacts: bytes, sha256, lane = gate', 'pipeline --check: regenerar y comparar', 'release-report: 8 manifiestos de corrida + 15 reportes']
        : ['check_artifacts: bytes, sha256, lane = gate', 'pipeline --check: regenerate and compare', 'release-report: 8 run manifests + 15 reports'],
      /* 8 run manifests, not 15: scripts/build_release_report.py MODEL_RUNS has 8 entries and the
         run field is filled only if method.learned, so data/derived/release-report.json carries
         "run" on L1 to L7 and N1 only, and "run": null on the seven classical rows; the 15 is the
         temporal_evidence list, one report per registered method. */
      tag: es ? 'CI · cada push' : 'CI · every push',
      edge: es ? 'publicar solo si las tres pasan' : 'publish only if all three pass',
    },
    {
      title: es ? '5 · Bundle estático' : '5 · Static bundle',
      lines: es
        ? ['el paso de copia superpone la evidencia versionada en el paquete estático', 'estático en Pages: sin servidor, sin BD', 'pesos slimsam-77 desde el hub al cargar']
        : ['the copy step overlays the versioned evidence into the static bundle', 'static on Pages: no server, no database', 'slimsam-77 weights from the hub at load'],
      tag: es ? 'GitHub Pages' : 'GitHub Pages',
      edge: es ? 'artefactos leídos, nunca recalculados' : 'artifacts read, never recomputed',
    },
    {
      title: es ? '6 · Navegador' : '6 · Browser',
      lines: es
        ? ['reproduce 15 métodos x 12 casos', 'en vivo: gemelos C1, C3, C4 y SlimSAM', 'WebGPU tras sondeo, si no WASM 1 hilo']
        : ['replays 15 methods x 12 cases', 'live: C1, C3, C4 twins and legacy SlimSAM', 'WebGPU after probe, else 1-thread WASM'],
      tag: es ? 'solo cliente' : 'client only',
      edge: '',
    },
  ];
  return (
    <svg viewBox="0 0 760 838" className="fig-svg wide" role="img" aria-labelledby="fs-arch-title fs-arch-desc">
      <title id="fs-arch-title">
        {es ? 'Del generador al navegador, con lo que cruza cada frontera' : 'From the generator to the browser, with what crosses each boundary'}
      </title>
      <desc id="fs-arch-desc">
        {es
          ? 'Seis etapas en cadena. El generador produce el dataset agrupado; los motores offline producen etiquetas y métricas; la evidencia versionada guarda manifiestos, el benchmark de 960 celdas, 180 pares de showcase y 795 archivos temporales; las puertas de verificación vuelven a hashear 1240 archivos; el bundle estático superpone los artefactos; el navegador los reproduce y solo ejecuta en vivo cuatro métodos acotados.'
          : 'Six chained stages. The generator produces the grouped dataset; the offline engines produce labels and metrics; the versioned evidence stores manifests, the 960-cell benchmark, 180 showcase pairs, and 795 temporal files; the verification gates re-hash 1240 files; the static bundle overlays the artifacts; the browser replays them and runs only four bounded methods live.'}
      </desc>
      <DgArrowDefs id={marker} />
      {boxes.map((box, index) => {
        const top = 44 + index * 132;
        return (
          <g key={box.title}>
            <DgBox x={16} y={top} w={560} h={96} title={box.title} lines={box.lines} accent={index === 2} />
            <text x={592} y={top + 30} className="dg-note">{box.tag}</text>
            {box.edge ? <DgDown x={120} y1={top + 96} y2={top + 130} label={box.edge} marker={marker} /> : null}
          </g>
        );
      })}
      <text x={16} y={814} className="dg-note">
        {es
          ? 'Puerta viva: Python puro, ruedas subconjunto de {numpy}, corrida bajo 1500 ms,'
          : 'Live gate: pure Python, wheels a subset of {numpy}, run under 1500 ms,'}
      </text>
      <text x={16} y={830} className="dg-note">
        {es
          ? 'traza bajo 262144 bytes. Todo lo demás es precálculo.'
          : 'trace under 262144 bytes. Everything else is precompute.'}
      </text>
    </svg>
  );
}

/* ---------------------------------------------------------------- 02 repository */

function Repository({ es, refsLabel }: { es: boolean; refsLabel: string }) {
  return (
    <div className="prose">
      <p className="measure">
        {es
          ? 'El producto completo cabe en el repositorio, con una estructura que un tercero puede recorrer sin reconstruirla desde la web. La librería científica se organiza por responsabilidad: generación y algoritmos, contratos de entrada y codificadores de salida, el registro de manifiestos, las etapas del orquestador, el carril de aprendizaje y los adaptadores de motores fundacionales. Los puntos de entrada reproducibles viven aparte, como scripts que entrenan, infieren, evalúan, hornean el showcase, construyen el benchmark unificado y arman el inventario de release. Los resultados canónicos, los manifiestos y las métricas viven en el árbol derivado; los manifiestos de corrida, la configuración y el linaje de checkpoints viven junto a los modelos; la evidencia de paridad, cobertura y QA visual vive en su propio directorio de verificación.'
          : 'The complete product fits in the repository, with a structure a third party can walk without reconstructing it from the website. The science library is organised by responsibility: generation and algorithms, input contracts and output encoders, the manifest record, the orchestrator stages, the learning lane, and the foundation-engine adapters. The reproducible entry points live separately, as scripts that train, infer, evaluate, bake the showcase, build the unified benchmark, and assemble the release inventory. Canonical results, manifests, and metrics live in the derived tree; run manifests, configuration, and checkpoint lineage live beside the models; parity, coverage, and visual-QA evidence lives in its own verification directory.'}
      </p>
      <p className="measure">
        {es
          ? 'La documentación no es un extra opcional: la puerta de release exige que existan once temas de wiki (arquitectura, frameworks, guías, métodos, contrato de datos, métricas, temporal, benchmark, tipos de problema, casos de uso y seguridad) y falla nombrando los que falten. Es la razón por la que la explicación de un método y su implementación no pueden separarse: si un tema desaparece, el inventario de release se cae antes de que cualquier cosa se publique.'
          : 'Documentation is not an optional extra: the release gate requires eleven wiki themes to exist (architecture, frameworks, guides, methods, data contract, metrics, temporal, benchmark, problem types, use cases, and security) and fails naming the ones that are missing. That is why a method explanation and its implementation cannot drift apart: if a theme disappears, the release inventory falls over before anything is published.'}
        {/* the eleven required doc themes: scripts/build_release_report.py, REQUIRED_DOC_THEMES */}
      </p>

      <h3>{es ? 'Entornos separados a propósito' : 'Environments separated on purpose'}</h3>
      <p className="measure">
        {es
          ? 'Hay más de un entorno porque las dependencias de este dominio no se resuelven juntas. El carril offline usa un entorno aislado con la pila clásica de visión (NumPy, SciPy, scikit-image, OpenCV, pycocotools, Pillow), instalado en modo editable para que la librería sea importable desde la raíz sin tocar un Python global. El carril GPU añade PyTorch y los runtimes oficiales. StarDist conserva su propio entorno TensorFlow, y esa es una excepción documentada: en Windows nativo las ruedas actuales de TensorFlow no exponen CUDA, así que el camino GPU soportado es WSL2 o Linux. CUDA es obligatoria para el entrenamiento de PyTorch y de Ultralytics: un fallback a CPU se trata como error, no como degradación silenciosa.'
          : 'There is more than one environment because the dependencies of this domain do not resolve together. The offline lane uses an isolated environment with the classical vision stack (NumPy, SciPy, scikit-image, OpenCV, pycocotools, Pillow), installed in editable mode so the library is importable from the root without touching a global Python. The GPU lane adds PyTorch and the official runtimes. StarDist keeps its own TensorFlow environment, and that is a documented exception: on native Windows the current TensorFlow wheels do not expose CUDA, so the supported GPU path is WSL2 or Linux. CUDA is mandatory for PyTorch and Ultralytics training: a CPU fallback is treated as an error, not as a silent degradation.'}
        {' '}<Cite id="schmidt2018stardist" paren /> <Cite id="redmon2016yolo" paren />
      </p>
      <p className="measure">
        {es
          ? 'La integridad del repositorio se defiende mecánicamente, no por costumbre. Un trabajo de guardas en integración continua falla la construcción si aparece versionado un archivo de entorno real, un entorno virtual, un binario nativo, datos crudos o pesados en formatos de arreglo, o una ruta local de máquina filtrada en el código. Los checkpoints compactos de release se aceptan solo bajo el directorio de modelos y con un tope duro de tamaño por archivo, medido sobre el objeto en git. Esa es la razón por la que los pesos grandes de los motores oficiales viven en sus cachés upstream y solo sus identificadores, tamaños y hashes quedan registrados.'
          : 'Repository integrity is defended mechanically, not by habit. A guards job in continuous integration fails the build if a real environment file, a virtual environment, a native binary, raw or heavy array-format data, or a leaked local machine path appears tracked. Compact release checkpoints are accepted only under the models directory and with a hard per-file size cap, measured on the object in git. That is why the large weights of the official engines live in their upstream caches and only their identifiers, sizes, and hashes are recorded.'}
      </p>
      <Equation
        tex={String.raw`\text{tracked checkpoint accepted}\iff \mathrm{path}\in\texttt{models/}\ \wedge\ b\le 26214400\ \text{bytes}`}
        caption={es
          ? 'La guarda de integridad: un checkpoint versionado fuera del directorio de modelos, o sobre 25 MiB, falla la construcción.'
          : 'The integrity guard: a tracked checkpoint outside the models directory, or above 25 MiB, fails the build.'}
      />
      {/* the 26214400-byte cap and the models/ restriction: .github/workflows/ci.yml, guards job */}
      <ul className="measure">
        <li><InlineMath tex={String.raw`b`} />, {es ? 'tamaño en bytes del objeto tal como git lo almacena, no en el disco de trabajo.' : 'byte size of the object as git stores it, not as it sits in the working tree.'}</li>
        <li>{es ? '26.214.400 bytes son exactamente 25 MiB; el tope se expresa en bytes para que la guarda sea exacta.' : '26,214,400 bytes is exactly 25 MiB; the cap is expressed in bytes so the guard is exact.'}</li>
      </ul>
      <Callout variant="honest" title={es ? 'Estructura pública' : 'Public structure'}>
        {es
          ? 'Los nombres de módulos y directorios que aparecen en esta página corresponden a rutas versionadas del repositorio público. No exponen rutas locales, secretos ni infraestructura privada, y esa distinción se mantiene deliberadamente: una guarda de integración continua falla la construcción si una ruta de máquina local se filtra al código.'
          : 'The module and directory names on this page correspond to versioned paths in the public repository. They expose no local paths, secrets, or private infrastructure, and that distinction is deliberately maintained: a continuous-integration guard fails the build if a local machine path leaks into the code.'}
      </Callout>
      <Refs ids={['schmidt2018stardist', 'redmon2016yolo']} label={refsLabel} />
    </div>
  );
}

/* ---------------------------------------------------------------- 03 precompute */

function Precompute({ es, refsLabel }: { es: boolean; refsLabel: string }) {
  return (
    <div className="prose">
      <p className="measure">
        {es
          ? 'El precálculo canónico es una operación explícita de release, y el orquestador está construido para que no pueda ocurrir por accidente. Una invocación resuelve primero sus rutas de salida: sin argumento escribe en el árbol derivado canónico, y con una raíz explícita escribe en un directorio de pruebas. Las corridas de test y de integración continua siempre pasan esa raíz, así que un experimento no puede sobreescribir un artefacto firmado. Por caso, la cadena es corta y ordenada: generar la escena, puntuar el piso clásico contra la verdad exacta, exportar los artefactos y el manifiesto. Al terminar todos los casos se escribe el índice plano y el documento del registro de métodos, que es lo que después permite verificar cobertura sin adivinar qué métodos existían.'
          : 'The canonical precompute is an explicit release operation, and the orchestrator is built so it cannot happen by accident. An invocation resolves its output locations first: with no argument it writes to the canonical derived tree, and with an explicit root it writes to a sandbox directory. Test and continuous-integration runs always pass that root, so an experiment cannot overwrite a signed artifact. Per case the chain is short and ordered: generate the scene, score the classical floor against the exact truth, export the artifacts and the manifest. Once every case is done the flat index and the method-registry document are written, which is what later makes coverage checkable without guessing which methods existed.'}
      </p>
      <p className="measure">
        {es
          ? 'La geometría es un diagrama de potencia (Laguerre), el modelo estándar de teselación de espuma seca compatible con las leyes de Plateau. Los centros se empaquetan con radios log-normales para controlar la media de Sauter, y cada píxel se asigna al sitio de mínima distancia de potencia. Sobre esa teselación se pinta la apariencia: bordes de Plateau oscuros, realces especulares con jitter y a veces omitidos, desenfoque, borrosidad de movimiento, ruido de sensor y carga. El jitter de realces es una decisión de diseño contra el autoengaño: sin él, una cuenca de agua sembrada por realces ganaría artificialmente, porque el generador le estaría entregando exactamente los marcadores que necesita.'
          : 'The geometry is a power (Laguerre) diagram, the standard dry-foam tessellation model consistent with the Plateau laws. Centres are packed with log-normal radii to control the Sauter mean, and each pixel is assigned to the site of minimum power distance. Appearance is painted on top of that tessellation: dark Plateau borders, specular highlights that are jittered and sometimes omitted, defocus, motion blur, sensor noise, and load. The highlight jitter is a design decision against self-deception: without it a highlight-seeded watershed would win artificially, because the generator would be handing it exactly the markers it needs.'}
        {' '}<Cite id="weaire1999foams" paren /> <Cite id="aurenhammer1987" paren />
      </p>
      <Equation
        tex={String.raw`\mathrm{cell}(p)=\arg\min_i\big(\lVert p-c_i\rVert^2-r_i^2\big)`}
        caption={es
          ? 'Celda de potencia: cada píxel pertenece al sitio cuya distancia de potencia es mínima, la teselación de espuma seca del generador.'
          : 'Power cell: each pixel belongs to the site whose power distance is smallest, the dry-foam tessellation of the generator.'}
      />
      <ul className="measure">
        <li><InlineMath tex={String.raw`p`} />, {es ? 'la posición del píxel en la retícula de la escena.' : 'the pixel position on the scene lattice.'}</li>
        <li><InlineMath tex={String.raw`c_i,\ r_i`} />, {es ? 'centro y radio del sitio i; los radios se muestrean log-normales para fijar la media de Sauter objetivo.' : 'centre and radius of site i; radii are sampled log-normal to set the target Sauter mean.'}</li>
      </ul>
      <p className="measure">
        {es
          ? 'Cada caso canónico se renderiza a 256 por 256 píxeles con una semilla fija propia, de 101 a 113, y cada uno es un punto de un eje de cobertura: monodisperso limpio como control positivo, polidisperso nominal, espuma fina y gruesa, y luego los controles negativos donde los métodos deben degradarse (lóbulo de brillo saturado, borrosidad de movimiento, desenfoque, carga alta y oscura, ruido de sensor, burbujas reventando, encuadre con banda de brillo al borde) más un control vacío sin espuma. Cada caso emite la imagen, las máscaras exactas en formato COCO-RLE, la morfometría por instancia con el resumen de distribución, los resultados del piso clásico y la tarjeta compacta de selección.'
          : 'Each canonical case renders at 256 by 256 pixels with its own pinned seed, 101 to 113, and each one is a point on a coverage axis: clean monodisperse as a positive control, nominal polydisperse, fine and coarse froth, and then the negative controls where methods are supposed to degrade (a saturated glare lobe, motion blur, defocus, high dark load, sensor noise, bursting bubbles, off-centre framing with an edge glare band) plus an empty control with no froth. Every case emits the image, the exact masks in COCO-RLE form, per-instance morphometry with the distribution summary, the classical-floor results, and the compact selector card.'}
        {' '}<Cite id="wang2003froth" paren />
        {/* 256 x 256 and seed 102: data/derived/manifests/poly-normal.json (spec.h, spec.w, seed);
            seed range 101 to 113 and the case list: docs/guides/01_precompute-pipeline.md */}
      </p>
      <p className="measure">
        {es
          ? 'De cada máscara se deriva el diámetro equivalente, el diámetro del círculo de igual área, y la distribución se resume con la media de Sauter, ponderada por superficie, que es el resumen estándar en flotación porque el área interfacial por unidad de volumen escala con ella. Las unidades viajan con el número: sin una calibración trazable todo queda en píxeles y la escala nunca se estima desde la imagen.'
          : 'From each mask the equivalent diameter is derived, the diameter of the circle of equal area, and the distribution is summarised by the surface-weighted Sauter mean, which is the standard flotation summary because interfacial area per unit volume scales with it. Units travel with the number: without a traceable calibration everything stays in pixels and scale is never estimated from the image.'}
        {' '}<Cite id="sautermean" paren /> <Cite id="aldrich2010" paren />
      </p>
      <Equation
        tex={String.raw`d_{\mathrm{eq}}=2\sqrt{A/\pi},\qquad d_{32}=\frac{\sum_i d_i^{\,3}}{\sum_i d_i^{\,2}}`}
        caption={es
          ? 'Diámetro equivalente por área y media de Sauter ponderada por superficie, en píxeles cuando no hay calibración física.'
          : 'Area-equivalent diameter and the surface-weighted Sauter mean, in pixels when no physical calibration exists.'}
      />
      <p className="measure">
        {es
          ? 'La puntuación merece una aclaración que casi nunca se hace. La AP que este repositorio publica no es la AP de COCO: COCO ordena detecciones por confianza e integra precisión sobre recall, y la mayoría de estos métodos no puntúa sus regiones (una cuenca de agua no asigna confianza). Se usa entonces la definición estándar en segmentación de instancias celulares, la que reportan Cellpose y StarDist: emparejamiento voraz uno a uno por IoU descendente, y el cociente de verdaderos positivos sobre la unión de aciertos y errores, promediado en diez umbrales de 0,50 a 0,95. Es el índice de Jaccard del emparejamiento, penaliza falsos positivos y falsos negativos por igual, y no es comparable con una tabla de líderes de COCO. El lado distribucional de la comparación usa otro instrumento: la distancia de Wasserstein-1 entre la distribución de diámetros predicha y la verdadera, que en una dimensión es la integral del valor absoluto de la diferencia entre sus funciones de distribución acumulada, y que por eso queda expresada en las mismas unidades del diámetro que compara.'
          : 'The scoring deserves a clarification that is almost never made. The AP this repository publishes is not COCO AP: COCO ranks detections by confidence and integrates precision over recall, and most of these methods do not score their regions (a watershed assigns no confidence). The definition used instead is the standard one in cell instance segmentation, the one Cellpose and StarDist report: greedy one-to-one matching by descending IoU, and the ratio of true positives over the union of hits and errors, averaged over ten thresholds from 0.50 to 0.95. It is the Jaccard index of the matching, it penalises false positives and false negatives equally, and it is not comparable with a COCO leaderboard. The distribution side of the comparison uses a different instrument: the Wasserstein-1 distance between the predicted and the true diameter distributions, which in one dimension is the integral of the absolute difference between their cumulative distribution functions, and which therefore stays expressed in the same units as the diameter it compares.'}
        {' '}<Cite id="lin2014coco" paren /> <Cite id="stringer2021cellpose" paren /> <Cite id="schmidt2018stardist" paren /> <Cite id="villani2009ot" paren />
      </p>
      <Equation
        tex={String.raw`\mathrm{AP}(\tau)=\frac{TP(\tau)}{TP(\tau)+FP(\tau)+FN(\tau)},\qquad \mathrm{AP}=\frac{1}{10}\sum_{\tau=0.50}^{0.95}\mathrm{AP}(\tau),\qquad W_1(P,Q)=\int\big|F_P(x)-F_Q(x)\big|\,dx`}
        caption={es
          ? 'La AP de instancias que este repositorio reporta, su promedio en diez umbrales, y la distancia de Wasserstein-1 entre distribuciones de diámetro.'
          : 'The instance AP this repository reports, its average over ten thresholds, and the Wasserstein-1 distance between diameter distributions.'}
      />
      <ul className="measure">
        <li><InlineMath tex={String.raw`\tau`} />, {es ? 'umbral de IoU, de 0,50 a 0,95 en pasos de 0,05.' : 'IoU threshold, 0.50 to 0.95 in steps of 0.05.'}</li>
        <li><InlineMath tex={String.raw`F_P,\ F_Q`} />, {es ? 'funciones de distribución acumulada de los diámetros predichos y verdaderos; cero es perfecto.' : 'cumulative distribution functions of predicted and true diameters; zero is perfect.'}</li>
      </ul>
      <p className="measure">
        {es
          ? 'Sobre esa base se construye el dataset aprendido. La expansión toma dieciséis familias de condición y produce 384 muestras a 192 píxeles, con semillas independientes de geometría y de apariencia: 192 grupos de geometría latente, dos variantes de apariencia por grupo. La unidad de split es el grupo latente, nunca la imagen renderizada, y los cortes son 192 de entrenamiento, 64 de validación, 64 de calibración y 64 de prueba intacta. Un manifiesto registra la pertenencia y la proveniencia, y un paso posterior materializa la caché local con metadatos de checksum; esa caché es reproducible y deliberadamente no se versiona.'
          : 'The learned dataset is built on that base. The expansion takes sixteen condition families and produces 384 samples at 192 pixels, with independent geometry and appearance seeds: 192 latent geometry groups, two appearance variants per group. The split unit is the latent group, never the rendered image, and the cuts are 192 train, 64 validation, 64 calibration, and 64 untouched test. A manifest records membership and provenance, and a later step materialises the local cache with checksum metadata; that cache is reproducible and deliberately not versioned.'}
        {/* 16 conditions, 384 samples, image_size 192, 192 groups, splits 192/64/64/64:
            manifests/learned-dataset-v2.json */}
      </p>
      <p className="measure">
        {es
          ? 'La última etapa del precálculo es el horneado del showcase, y no ejecuta ningún modelo. Convierte las etiquetas ya producidas por cada método registrado en un ráster compacto de secuencias de longitud y una previsualización de borde, para cada caso de presentación. Falla cuando falta un resultado aprendido, en lugar de rellenar el hueco, y nunca reemplaza las etiquetas originales en el directorio de inferencia del método. Ese detalle es lo que mantiene la reproducción honesta: lo que se muestra viene de la inferencia autoritativa, no de una segunda pasada más conveniente.'
          : 'The last precompute stage is the showcase bake, and it runs no model. It converts the labels already produced by each registered method into a compact run-length raster and a boundary preview, for every presentation case. It fails when a learned result is missing, instead of filling the gap, and it never replaces the originating labels in the method inference directory. That detail is what keeps replay honest: what is shown comes from the authoritative inference, not from a second, more convenient pass.'}
      </p>
      <Callout variant="honest" title={es ? 'Un generador, no un cargador' : 'A generator, not a loader'}>
        {es
          ? 'Esta etapa fabrica espuma con verdad exacta para que los segmentadores puedan puntuarse; no es dato de planta. Ninguna AP de aquí se reporta como exactitud sobre una celda real, los controles negativos existen precisamente para que los métodos fallen ahí, y el generador no debe ajustarse para favorecer a un método. El control vacío no tiene instancias, así que su AP es indefinida por construcción y queda fuera del ranking en lugar de contarse como cero o como perfecto.'
          : 'This stage manufactures froth with exact truth so segmenters can be scored; it is not plant data. No AP from here is reported as accuracy on a real cell, the negative controls exist precisely so methods fail there, and the generator must not be tuned to favour a method. The empty control has no instances, so its AP is undefined by construction and is left out of the ranking rather than counted as zero or as perfect.'}
      </Callout>
      <Refs ids={['weaire1999foams', 'aurenhammer1987', 'lin2014coco', 'stringer2021cellpose', 'schmidt2018stardist', 'villani2009ot', 'sautermean', 'aldrich2010', 'wang2003froth']} label={refsLabel} />
    </div>
  );
}

/* ---------------------------------------------------------------- 04 determinism */

function Determinism({ es, refsLabel }: { es: boolean; refsLabel: string }) {
  return (
    <div className="prose">
      <p className="measure">
        {es
          ? 'Una escena canónica es una función pura de su especificación. Toda la aleatoriedad proviene de un generador de números pseudoaleatorios sembrado, la geometría y la apariencia tienen semillas separadas, y por eso el dataset puede renderizar dos variantes de apariencia desde la misma geometría latente conservando identidad de grupo explícita. La consecuencia práctica es que la misma semilla produce la misma imagen byte a byte, y por lo tanto un sha256 estable: eso es lo que hace verificable un artefacto versionado, en lugar de simplemente presente.'
          : 'A canonical scene is a pure function of its specification. All randomness comes from a seeded pseudorandom generator, geometry and appearance have separate seeds, and that is why the dataset can render two appearance variants from the same latent geometry while keeping explicit group identity. The practical consequence is that the same seed produces the same image byte for byte, and therefore a stable sha256: that is what makes a versioned artifact checkable rather than merely present.'}
      </p>
      <p className="measure">
        {es
          ? 'El detalle que hace funcionar esto es una omisión deliberada. La clasificación de carril mide el tiempo de corrida para decidir, pero ese tiempo no se guarda en el manifiesto: un reloj de pared ensuciaría git en cada re-ejecución y rompería la propiedad que se acaba de describir. Lo que se registra es el veredicto más los presupuestos deterministas contra los que se decidió. El mismo cuidado aplica a detalles menos glamorosos: los finales de línea del archivo de morfometría se fuerzan a LF, de modo que los bytes versionados y su sha256 son idénticos en Windows y en integración continua sobre Linux. Un artefacto que cambia de hash por el sistema operativo no es evidencia.'
          : 'The detail that makes this work is a deliberate omission. Lane classification measures run time in order to decide, but that time is not stored in the manifest: a wall clock would dirty git on every re-run and break the property just described. What is recorded is the verdict plus the deterministic budgets it was decided against. The same care applies to less glamorous details: the line endings of the morphometry file are forced to LF, so the committed bytes and their sha256 are identical on Windows and in Linux continuous integration. An artifact whose hash changes with the operating system is not evidence.'}
        {/* the deliberate omission of run_ms and the recorded budgets: data-pipeline/fslab/core/gate.py;
            forced LF for bsd.csv: docs/guides/01_precompute-pipeline.md */}
      </p>
      <Equation
        tex={String.raw`A=\mathcal E\big(f(\mathrm{spec},s)\big),\qquad H_{256}(A)\ \text{invariant},\qquad t_{\mathrm{wall}}\notin \mathrm{record}(A)`}
        caption={es
          ? 'Un artefacto es la codificación de una función pura de especificación y semilla; su hash es invariante y el reloj de pared nunca entra al registro.'
          : 'An artifact is the encoding of a pure function of specification and seed; its hash is invariant and the wall clock never enters the record.'}
      />
      <ul className="measure">
        <li><InlineMath tex={String.raw`f`} />, {es ? 'el generador de escena, sembrado; la geometría y la apariencia usan semillas independientes.' : 'the scene generator, seeded; geometry and appearance use independent seeds.'}</li>
        <li><InlineMath tex={String.raw`\mathcal E`} />, {es ? 'los codificadores de salida: PNG, COCO-RLE, CSV con encabezado autodescrito, JSON.' : 'the output encoders: PNG, COCO-RLE, CSV with a self-describing header, JSON.'}</li>
        <li><InlineMath tex={String.raw`H_{256}`} />, {es ? 'sha256 del archivo tal como queda en disco, que es lo que la verificación vuelve a calcular.' : 'sha256 of the file as it lands on disk, which is what verification recomputes.'}</li>
      </ul>

      <h3>{es ? 'Un caso real, con sus cifras' : 'One real case, with its numbers'}</h3>
      <p className="measure">
        {es
          ? 'Conviene ver el registro concreto en lugar de la promesa. El caso polidisperso nominal se genera con la semilla 102 a 256 por 256 píxeles y contiene 197 instancias exactas. Su manifiesto declara la imagen en 49.942 bytes, las máscaras COCO-RLE en 23.516 bytes con esas 197 instancias, la morfometría en 5.584 bytes y el resultado clásico en 782 bytes, cada uno con su sha256, más el resumen de distribución, la tabla del piso clásico y el veredicto de carril. La verificación no confía en ninguna de esas cifras: las vuelve a medir en disco y compara.'
          : 'It helps to see the concrete record instead of the promise. The nominal polydisperse case is generated with seed 102 at 256 by 256 pixels and contains 197 exact instances. Its manifest declares the image at 49,942 bytes, the COCO-RLE masks at 23,516 bytes with those 197 instances, the morphometry at 5,584 bytes, and the classical result at 782 bytes, each with its sha256, plus the distribution summary, the classical-floor table, and the lane verdict. Verification trusts none of those numbers: it measures them again on disk and compares.'}
        {' '}<Cite id="lin2014coco" paren />
        {/* seed 102, 197 instances, 49942 / 23516 / 5584 / 782 bytes:
            data/derived/manifests/poly-normal.json */}
      </p>

      <Figure caption={es
        ? 'La cadena de custodia de un caso, con los bytes reales del caso polidisperso nominal y las dos comprobaciones que la cierran.'
        : 'The chain of custody for one case, with the real byte sizes of the nominal polydisperse case and the two checks that close it.'}>
        <ContractChainSVG es={es} />
      </Figure>

      <h3>{es ? 'Lo que el determinismo no puede cubrir' : 'What determinism cannot cover'}</h3>
      <p className="measure">
        {es
          ? 'Las corridas aprendidas y fundacionales no admiten la misma garantía, y decirlo importa. El punto flotante en GPU y las versiones de los motores oficiales pueden cambiar la salida a nivel de byte, así que sus manifiestos no prometen igualdad de bytes: registran las entradas de reproducibilidad y la evidencia resultante. Eso incluye el checksum de la caché del dataset y el split usado; la semilla, los hiperparámetros y la elección de calibración; las versiones de Python, del framework, de CUDA y del dispositivo; el linaje del checkpoint con su tamaño y su sha256; las métricas sobre la prueba intacta con los errores por muestra; las métricas del diagnóstico canónico; y la paridad ONNX cuando la exportación aplica.'
          : 'Learned and foundation runs do not admit the same guarantee, and saying so matters. GPU floating point and official engine versions can change output at the byte level, so their manifests do not promise byte equality: they record the reproducibility inputs and the resulting evidence. That includes the dataset cache checksum and the split used; the seed, the hyperparameters, and the calibration choice; the Python, framework, CUDA, and device versions; the checkpoint lineage with its size and sha256; the untouched-test metrics with per-sample errors; the canonical diagnostic metrics; and ONNX parity where an export applies.'}
        {' '}<Cite id="ravi2024sam2" paren />
      </p>
      <p className="measure">
        {es
          ? 'Los pesos upstream grandes se quedan donde viven. El checkpoint del motor fundacional de segmentación celular ocupa 1.218.643.819 bytes y el del rastreador de video oficial 156.008.466 bytes: ninguno está versionado, y sus manifiestos registran identificador inmutable, tamaño y hash del archivo local. Los artefactos compactos entrenados en el repositorio sí se versionan, y ahí la diferencia se nota: el modelo de investigación ocupa 4.910.780 bytes y la red de frontera con cuenca de agua 997.257 bytes, tamaños que caben bajo el tope de la guarda de integridad.'
          : 'Large upstream weights stay where they live. The checkpoint of the foundation cell-segmentation engine is 1,218,643,819 bytes and the official video tracker is 156,008,466 bytes: neither is versioned, and their manifests record an immutable identifier, size, and local-file hash. The compact artifacts trained in this repository are versioned, and there the difference shows: the research model is 4,910,780 bytes and the boundary network with watershed is 997,257 bytes, sizes that fit under the integrity guard cap.'}
        {' '}<Cite id="stringer2021cellpose" paren />
        {/* 1218643819 / 156008466 / 4910780 / 997257 bytes and model_artifact_committed:
            data/derived/method-benchmark.json, methods[].compute */}
      </p>
      <Callout variant="honest" title={es ? 'Dos garantías distintas, nunca mezcladas' : 'Two different guarantees, never conflated'}>
        {es
          ? 'El carril sintético ofrece reproducibilidad byte a byte y se comprueba regenerando y comparando hashes. El carril GPU ofrece trazabilidad documentada: semillas, versiones, dispositivo, linaje y métricas, no igualdad de bytes. Presentar la segunda como si fuera la primera sería falso, así que las dos se reportan por separado. Y ninguna de las dos es una medida de utilidad industrial: eso requiere evidencia externa gobernada.'
          : 'The synthetic lane offers byte-level reproducibility and is checked by regenerating and comparing hashes. The GPU lane offers documented traceability: seeds, versions, device, lineage, and metrics, not byte equality. Presenting the second as if it were the first would be false, so the two are reported separately. And neither is a measure of industrial usefulness: that requires governed external evidence.'}
      </Callout>
      <Refs ids={['lin2014coco', 'stringer2021cellpose', 'ravi2024sam2']} label={refsLabel} />
    </div>
  );
}

function ContractChainSVG({ es }: { es: boolean }) {
  const marker = 'fs-chain-arrow';
  /* Values read from data/derived/manifests/poly-normal.json (seed 102, 197 instances, artifact
     byte sizes), data/derived/showcase/manifest.json (hashed_file_count 1240) and
     scripts/check_artifacts.py (the checks performed). */
  return (
    <svg viewBox="0 0 760 616" className="fig-svg wide" role="img" aria-labelledby="fs-chain-title fs-chain-desc">
      <title id="fs-chain-title">
        {es ? 'Cadena de custodia de un caso canónico' : 'Chain of custody for one canonical case'}
      </title>
      <desc id="fs-chain-desc">
        {es
          ? 'La especificación y la semilla producen la escena; los codificadores escriben formatos estándar; el manifiesto registra ruta, formato, bytes y sha256 de cada archivo; y dos comprobaciones independientes cierran la cadena, una en Python sobre el disco y otra en TypeScript en tiempo de compilación.'
          : 'Specification and seed produce the scene; the encoders write standard formats; the manifest records path, format, bytes, and sha256 for every file; and two independent checks close the chain, one in Python against the disk and one in TypeScript at compile time.'}
      </desc>
      <DgArrowDefs id={marker} />
      <DgBox
        x={100} y={40} w={560} h={78}
        title={es ? 'Especificación y semilla' : 'Specification and seed'}
        lines={es
          ? ['poly-normal · semilla 102 · 256 x 256 px', 'una escena es una función pura de (spec, semilla)']
          : ['poly-normal · seed 102 · 256 x 256 px', 'a scene is a pure function of (spec, seed)']}
      />
      <DgDown x={380} y1={118} y2={152} marker={marker} label={es ? 'generar y puntuar' : 'generate and score'} />
      <DgBox
        x={100} y={152} w={560} h={114}
        title={es ? 'Codificadores de salida' : 'Output encoders'}
        lines={es
          ? ['frame.png · PNG gris de 8 bits', 'masks.json · COCO-RLE · frothseg.masks/v1', 'bsd.csv · frothseg.bsd/v1 · LF forzado', 'benchmark.json · frothseg.benchmark/v1']
          : ['frame.png · 8-bit grayscale PNG', 'masks.json · COCO-RLE · frothseg.masks/v1', 'bsd.csv · frothseg.bsd/v1 · LF forced', 'benchmark.json · frothseg.benchmark/v1']}
      />
      <DgDown x={380} y1={266} y2={300} marker={marker} label={es ? 'medir bytes y sha256' : 'measure bytes and sha256'} />
      <DgBox
        x={100} y={300} w={560} h={114} accent
        title={es ? 'Manifiesto del caso · frothseg.manifest/v1' : 'Case manifest · frothseg.manifest/v1'}
        lines={es
          ? ['frame.png 49942 B · masks.json 23516 B', '197 instancias · bsd.csv 5584 B', 'benchmark.json 782 B · sha256 por archivo', 'lane precompute = veredicto de la puerta']
          : ['frame.png 49942 B · masks.json 23516 B', '197 instances · bsd.csv 5584 B', 'benchmark.json 782 B · sha256 per file', 'lane precompute = gate verdict']}
      />
      <DgDown x={230} y1={414} y2={452} marker={marker} label={es ? 're-hash en disco' : 're-hash on disk'} />
      <DgDown x={530} y1={414} y2={452} marker={marker} label={es ? 'espejo de esquema' : 'schema mirror'} />
      <DgBox
        x={100} y={452} w={270} h={114}
        title={es ? 'Auditoría en Python' : 'Python audit'}
        lines={es
          ? ['existe · no vacío · bytes', 'sha256 · lane = puerta', 'inventario exacto: 1240']
          : ['exists · non-empty · bytes', 'sha256 · lane = gate', 'exact inventory: 1240']}
      />
      <DgBox
        x={390} y={452} w={270} h={114}
        title={es ? 'Espejo en TypeScript' : 'TypeScript mirror'}
        lines={es
          ? ['tipos del contrato en la web', 'una deriva falla la compilación', 'sin forma inventada']
          : ['contract types in the web', 'drift fails the compile', 'no invented shape']}
      />
      <text x={100} y={592} className="dg-note">
        {es
          ? 'Cualquier discrepancia de bytes, hash, carril o inventario termina'
          : 'Any mismatch of bytes, hash, lane, or inventory exits non-zero:'}
      </text>
      <text x={100} y={608} className="dg-note">
        {es
          ? 'con salida distinta de cero: el paquete completo se invalida.'
          : 'the whole package is invalidated.'}
      </text>
    </svg>
  );
}

/* ---------------------------------------------------------------- 05 the gate */

function TheGate({ es, refsLabel }: { es: boolean; refsLabel: string }) {
  return (
    <div className="prose">
      <p className="measure">
        {es
          ? 'La puerta de cómputo protege la validez científica y es una medición, no una opinión. Un trabajo corre en vivo solo si es Python puro, si sus ruedas son un subconjunto del conjunto seguro para el runtime de navegador, si termina dentro del presupuesto de interacción y si su traza cabe en el presupuesto de tamaño. El orden importa y está escrito así a propósito: el tiempo de corrida solo decide un trabajo que no falló ya un requisito estructural. Sin esa precaución, una máquina lenta podría agregar una razón de rechazo a un manifiesto versionado y una máquina rápida podría quitarla, y el manifiesto dejaría de ser una función pura de sus parámetros.'
          : 'The compute gate protects scientific validity and it is a measurement, not an opinion. A workload runs live only if it is pure Python, if its wheels are a subset of the browser-runtime-safe set, if it finishes within the interaction budget, and if its trace fits the size budget. The order matters and is written that way on purpose: run time only decides a workload that has not already failed a structural requirement. Without that precaution a slow machine could add a rejection reason to a committed manifest and a fast machine could remove it, and the manifest would stop being a pure function of its parameters.'}
      </p>
      <Equation
        tex={String.raw`\mathrm{live}\iff \pi\ \wedge\ \big(W\subseteq\{\texttt{numpy}\}\big)\ \wedge\ \big(t\le 1500\,\mathrm{ms}\big)\ \wedge\ \big(b\le 262144\ \text{bytes}\big)`}
        caption={es
          ? 'El clasificador de carril: pureza, ruedas, presupuesto de corrida y presupuesto de traza; si falla cualquiera, el carril es precálculo y se guarda la razón.'
          : 'The lane classifier: purity, wheels, run budget, and trace budget; if any fails, the lane is precompute and the reason is stored.'}
      />
      {/* the live wheel set, 1500 ms and 262144 bytes: data-pipeline/fslab/core/gate.py
          (LIVE_WHEELS, RUN_MS_GATE, TRACE_BYTES_GATE) */}
      <ul className="measure">
        <li><InlineMath tex={String.raw`\pi`} />, {es ? 'el trabajo es Python puro, sin extensiones compiladas.' : 'the workload is pure Python, with no compiled extensions.'}</li>
        <li><InlineMath tex={String.raw`W`} />, {es ? 'el conjunto de ruedas que el trabajo importa; el conjunto seguro tiene exactamente un elemento.' : 'the set of wheels the workload imports; the safe set has exactly one member.'}</li>
        <li><InlineMath tex={String.raw`t`} />, {es ? 'tiempo medido de corrida, usado para decidir y deliberadamente no almacenado.' : 'measured run time, used to decide and deliberately not stored.'}</li>
        <li><InlineMath tex={String.raw`b`} />, {es ? 'bytes de la traza o del artefacto que el carril vivo tendría que mover; 262.144 bytes son 256 KiB.' : 'bytes of the trace or artifact the live lane would have to move; 262,144 bytes is 256 KiB.'}</li>
      </ul>
      <p className="measure">
        {es
          ? 'El veredicto se guarda con sus razones, y el resultado para las escenas canónicas es inequívoco. El manifiesto del caso nominal declara carril de precálculo, pureza falsa, ruedas de NumPy más OpenCV, scikit-image y SciPy, y dos razones explícitas: no es Python puro y esas tres ruedas no son seguras para el runtime de navegador. La auditoría de artefactos comprueba además que el carril declarado en el manifiesto sea idéntico al veredicto de la puerta, así que etiquetar mal un trabajo no es un descuido cosmético: falla la integración continua.'
          : 'The verdict is stored with its reasons, and the result for the canonical scenes is unambiguous. The manifest of the nominal case declares a precompute lane, purity false, wheels of NumPy plus OpenCV, scikit-image, and SciPy, and two explicit reasons: it is not pure Python, and those three wheels are not browser-runtime safe. The artifact audit additionally checks that the lane declared in the manifest is identical to the gate verdict, so mislabelling a workload is not a cosmetic slip: it fails continuous integration.'}
        {/* the recorded verdict, wheels and reasons: data/derived/manifests/poly-normal.json (gate);
            the lane == gate.lane assertion: scripts/check_artifacts.py */}
      </p>

      <h3>{es ? 'Reglas de producto sobre la prueba de ruedas' : 'Product rules on top of the wheel test'}</h3>
      <p className="measure">
        {es
          ? 'La clasificación medida cubre artefactos individuales; el producto añade reglas de nivel superior para cargas de investigación que quedan fuera de ese alcance. Permanecen exclusivamente offline: la generación y materialización del dataset, los benchmarks autoritativos de los siete métodos clásicos en Python, el entrenamiento y la calibración en CUDA, los runtimes oficiales de segmentación celular, de polígonos estrella-convexos, de detección de una etapa y del rastreador de video, la evaluación sobre la prueba intacta y sobre el suite canónico, la exportación ONNX, los barridos temporales y el inventario de release. Todo eso requiere ruedas de visión en Python, activos de modelo grandes, acceso a sistema de archivos o capacidad de GPU que una página estática no puede garantizar.'
          : 'The measured classification covers individual artifacts; the product adds higher-level rules for research workloads outside that scope. These stay offline only: dataset generation and materialisation, the authoritative Python benchmarks of the seven classical methods, CUDA training and calibration, the official runtimes for cell segmentation, star-convex polygons, one-stage detection and the video tracker, evaluation on the untouched test and on the canonical suite, ONNX export, temporal sweeps, and the release inventory. All of that needs Python vision wheels, large model assets, filesystem access, or GPU capacity a static page cannot guarantee.'}
        {' '}<Cite id="vincent1991" paren /> <Cite id="meyer1994" paren /> <Cite id="achanta2012slic" paren />
      </p>
      <p className="measure">
        {es
          ? 'Lo que sí es válido en vivo es corto y verificado: los gemelos en TypeScript de tres métodos clásicos para inferencia exploratoria de un cuadro, más el segmentador ligero de clase SAM heredado, lo que da exactamente cuatro métodos interactivos sobre una carga; y alrededor de ellos, la validación de imagen, el desbrillo liviano, la morfometría, la reducción a distribución de tamaños y los gráficos. Los otros cuatro métodos clásicos y todos los aprendidos o fundacionales siguen siendo implementaciones autoritativas offline, disponibles como reproducción precalculada o como exportación de trabajo.'
          : 'What is valid live is short and verified: the TypeScript twins of three classical methods for exploratory single-frame inference, plus the legacy lightweight SAM-class segmenter, which gives exactly four interactive methods on an upload; and around them, image validation, lightweight deglare, morphometry, size-distribution reduction, and plots. The other four classical methods and every learned or foundation method remain authoritative offline implementations, available as precomputed replay or as an exported job.'}
        {' '}<Cite id="chen2023slimsam" paren />
      </p>

      <h3>{es ? 'Cómo un gemelo se gana el carril vivo' : 'How a twin earns the live lane'}</h3>
      <p className="measure">
        {es
          ? 'Un método interactivo no entra porque su código exista, sino porque su acuerdo con la implementación offline está medido. La selección es la primera muestra de prueba intacta de cada una de las dieciséis condiciones, y la aceptación exige cuatro cosas a la vez: diferencia absoluta media de AP no mayor a 0,03, razón media de AP navegador contra offline no menor a 0,5, razón media de F de frontera no menor a 0,95, y razón media de conteo de instancias entre 0,75 y 1,25. Los tres gemelos aceptados miden diferencias medias de AP de 0,0058, 0,0193 y 0,0256, con razones de conteo de 1,044, 1,242 y 0,878. El inventario de release codifica el resultado esperado: exige que los métodos aceptados sean exactamente esos tres y que cada fila cubra las dieciséis condiciones.'
          : 'An interactive method does not enter because its code exists, but because its agreement with the offline implementation is measured. The selection is the first untouched-test sample from each of the sixteen conditions, and acceptance requires four things at once: mean absolute AP difference no greater than 0.03, mean browser-over-offline AP ratio no lower than 0.5, mean boundary F ratio no lower than 0.95, and mean instance-count ratio between 0.75 and 1.25. The three accepted twins measure mean AP differences of 0.0058, 0.0193, and 0.0256, with count ratios of 1.044, 1.242, and 0.878. The release inventory encodes the expected outcome: it requires the accepted methods to be exactly those three and every row to cover the sixteen conditions.'}
        {/* acceptance thresholds and measured deltas: verification/classical-live-parity.json;
            the exactly-three assertion and the 16-condition check: scripts/build_release_report.py */}
      </p>
      <Equation
        tex={String.raw`\overline{|\Delta\mathrm{AP}|}\le 0.03,\quad \overline{\mathrm{AP}_{b}/\mathrm{AP}_{o}}\ge 0.5,\quad \overline{F_{b}/F_{o}}\ge 0.95,\quad 0.75\le \overline{n_{b}/n_{o}}\le 1.25`}
        caption={es
          ? 'Las cuatro condiciones de paridad que un gemelo de navegador debe cumplir sobre las dieciséis condiciones retenidas.'
          : 'The four parity conditions a browser twin must satisfy across the sixteen held-out conditions.'}
      />
      <ul className="measure">
        <li><InlineMath tex={String.raw`\mathrm{AP}_{b},\ \mathrm{AP}_{o}`} />, {es ? 'AP del gemelo en navegador y de la implementación offline sobre la misma muestra.' : 'AP of the browser twin and of the offline implementation on the same sample.'}</li>
        <li><InlineMath tex={String.raw`F_{b}/F_{o}`} />, {es ? 'razón de F de frontera; mide si los contornos coinciden, no solo el conteo.' : 'boundary F ratio; it measures whether the contours agree, not just the count.'}</li>
        <li><InlineMath tex={String.raw`n_{b}/n_{o}`} />, {es ? 'razón de instancias detectadas; la banda excluye a un gemelo que sobre o subsegmenta sistemáticamente.' : 'ratio of detected instances; the band excludes a twin that systematically over or under-segments.'}</li>
      </ul>
      <Callout variant="honest" title={es ? 'Paridad es acuerdo, no calidad' : 'Parity is agreement, not quality'}>
        {es
          ? 'Los tres gemelos aceptados son parte del piso clásico y están por debajo de la barra de comparación: sus AP medias sobre la prueba intacta son 0,065, 0,103 y 0,198. Que coincidan con su versión offline significa que el navegador no miente sobre lo que ejecuta, no que sean buenos. El carril vivo es exploratorio por diseño y el líder medido no está en el navegador; una dependencia instalada tampoco prueba una implementación, porque el registro exige checkpoint o configuración, inferencia, evaluación retenida, artefactos y documentación.'
          : 'The three accepted twins are part of the classical floor and sit below the comparison bar: their mean untouched-test AP values are 0.065, 0.103, and 0.198. Their agreement with the offline version means the browser does not lie about what it runs, not that they are good. The live lane is exploratory by design and the measured leader is not in the browser; an installed dependency does not prove an implementation either, because the registry demands a checkpoint or configuration, inference, held-out evaluation, artifacts, and documentation.'}
        {/* C1 0.0652, C3 0.1031, C4 0.1977 test mean_ap: data/derived/method-benchmark.json */}
      </Callout>
      <Refs ids={['meyer1994', 'vincent1991', 'achanta2012slic', 'chen2023slimsam']} label={refsLabel} />
    </div>
  );
}

/* ---------------------------------------------------------------- 06 contracts */

function Contracts({ es, refsLabel }: { es: boolean; refsLabel: string }) {
  return (
    <div className="prose">
      <p className="measure">
        {es
          ? 'Dos contratos hacen que esto sea una herramienta y no una presentación. El primero permite apuntar el producto a espuma que no vino de aquí; el segundo evita que la web se separe de lo que la cadena offline produjo. Los dos se comprueban en integración continua, y ninguno es una convención de estilo: son código con umbrales explícitos.'
          : 'Two contracts are what make this a tool instead of a slideshow. The first lets the product be pointed at froth that did not come from here; the second keeps the web from drifting away from what the offline chain produced. Both are checked in continuous integration, and neither is a style convention: they are code with explicit thresholds.'}
      </p>

      <h3>{es ? 'Contrato de ingesta: aceptar, rechazar, marcar' : 'Ingestion contract: accept, reject, flag'}</h3>
      <p className="measure">
        {es
          ? 'Un cuadro de espuma se acepta solo si es una imagen real y usable. La comprobación es pura y determinista, inspecciona un arreglo numérico sin tocar disco, y nunca lanza una excepción sobre una imagen mala: reporta. Rechaza por forma no soportada (debe ser gris de dos dimensiones o RGB con o sin alfa), por tipo no numérico o valores no finitos tras la conversión a luminancia, por lado menor bajo 64 píxeles o lado mayor sobre 8192, y por rango dinámico bajo 0,06, que es un cuadro plano o en blanco. Marca sin rechazar tres degradaciones recuperables: rango dinámico bajo 0,15 recomienda aplanar iluminación, más de 20 por ciento de píxeles casi saturados indica brillo fuerte, y más de 55 por ciento de píxeles casi negros indica subexposición o pulpa en lugar de espuma.'
          : 'A froth frame is accepted only if it is a real, usable image. The check is pure and deterministic, it inspects a numeric array without touching disk, and it never raises on a bad image: it reports. It rejects on unsupported shape (it must be two-dimensional grayscale or RGB with or without alpha), on a non-numeric dtype or non-finite values after luma conversion, on a minimum side below 64 pixels or a maximum side above 8192, and on a dynamic range below 0.06, which is a flat or blank frame. It flags without rejecting three recoverable degradations: a dynamic range below 0.15 recommends illumination flattening, more than 20 percent near-saturated pixels indicates heavy glare, and more than 55 percent near-black pixels indicates under-exposure or pulp instead of froth.'}
        {' '}<Cite id="wang2003froth" paren />
        {/* MIN_SIDE 64, MAX_SIDE 8192, DYN_RANGE_MIN 0.06, DYN_RANGE_FLAG 0.15, SAT_FRAC_FLAG 0.20,
            DARK_FRAC_FLAG 0.55: docs/architecture/08_data-contracts.md and
            docs/guides/02_bring-your-own-data.md */}
      </p>
      <Equation
        tex={String.raw`\mathrm{dyn}=p_{99}-p_{01},\qquad \mathrm{sat}=\tfrac{1}{N}\big|\{g>0.97\}\big|,\qquad \mathrm{dark}=\tfrac{1}{N}\big|\{g<0.03\}\big|`}
        caption={es
          ? 'Los tres estadísticos del contrato de ingesta, sobre la imagen en gris normalizada a cero-uno por luminancia Rec.601.'
          : 'The three ingestion-contract statistics, over the grayscale image normalised to zero-one by Rec.601 luma.'}
      />
      <ul className="measure">
        <li><InlineMath tex={String.raw`g`} />, {es ? 'intensidad del píxel en el intervalo cero-uno; las imágenes enteras se normalizan antes de medir.' : 'pixel intensity in the zero-one interval; integer images are normalised before measuring.'}</li>
        <li><InlineMath tex={String.raw`p_{99},\ p_{01}`} />, {es ? 'percentiles 99 y 1, no máximo y mínimo, para que un píxel muerto no defina el rango.' : 'the 99th and 1st percentiles, not maximum and minimum, so one dead pixel does not define the range.'}</li>
        <li><InlineMath tex={String.raw`N`} />, {es ? 'número de píxeles del cuadro.' : 'pixel count of the frame.'}</li>
      </ul>
      <p className="measure">
        {es
          ? 'La regla vive una vez en Python y se reimplementa con los mismos umbrales en TypeScript sobre un arreglo de flotantes en orden de filas, de modo que una carga mala se rechaza en el navegador antes de gastar una inferencia. Mantener ambos lados en paso es deliberado: la misma regla decide la ingesta offline y la del navegador. Las marcas no son decorativas, activan el front-end de desbrillo y aplanado de iluminación, que es exactamente el modo de falla real de una cámara de espuma donde los métodos clásicos sembrados por realces se derrumban. La cadena offline de todos los casos no ejecuta este contrato, porque una escena sintética es verdad por construcción; la etapa de ingesta existe precisamente para validar un cuadro real igual que lo hace el navegador.'
          : 'The rule lives once in Python and is reimplemented with the same thresholds in TypeScript over a row-major float array, so a bad upload is rejected in the browser before an inference is spent. Keeping both sides in lock-step is deliberate: the same rule decides ingestion offline and in the browser. The flags are not decorative, they drive the deglare and illumination-flattening front-end, which is exactly the real froth-camera failure mode where highlight-seeded classical methods collapse. The offline all-cases chain does not run this contract, because a synthetic scene is truth by construction; the ingestion stage exists precisely so a real frame can be validated the same way the browser validates it.'}
        {' '}<Cite id="aldrich2010" paren />
      </p>

      <h3>{es ? 'Contrato de artefacto: de la cadena a la web' : 'Artifact contract: chain to web'}</h3>
      <p className="measure">
        {es
          ? 'Cada corrida codifica una escena en formatos estándar en disco, nunca en un blob propio, y registra un manifiesto autoritativo. La imagen es un PNG gris de 8 bits. Las máscaras son la verdad exacta de instancias en RLE estilo COCO, el formato compacto que toda herramienta de evaluación lee, con un decodificador de ida y vuelta que reconstruye el mapa de etiquetas para la comprobación de consistencia. La morfometría es un CSV con encabezado comentado autodescrito, para que el archivo sea legible por sí solo. El resultado clásico y la tarjeta de selección son JSON con esquema nombrado. El registro autoritativo es el manifiesto por caso: la especificación del generador y su semilla, la ruta, el formato, el tamaño en bytes y el sha256 de cada artefacto, el resumen de distribución, las puntuaciones y el veredicto de carril, con un índice plano que inventaría todos los casos.'
          : 'Every run encodes a scene into standard on-disk formats, never a bespoke blob, and records an authoritative manifest. The image is an 8-bit grayscale PNG. The masks are the exact instance truth in COCO-style RLE, the compact format every evaluation toolkit reads, with a round-trip decoder that rebuilds the label map for the consistency check. The morphometry is a CSV with a self-describing commented header, so the file is legible on its own. The classical result and the selector card are JSON with a named schema. The authoritative record is the per-case manifest: the generator specification and its seed, the path, format, byte size, and sha256 of every artifact, the distribution summary, the scores, and the lane verdict, with a flat index inventorying every case.'}
        {' '}<Cite id="lin2014coco" paren />
      </p>
      <Equation
        tex={String.raw`a=\big(\mathrm{path},\ \mathrm{format},\ b,\ H_{256}\big),\qquad \text{accept}(a)\iff b_{\mathrm{disk}}=b\ \wedge\ H_{256}(\mathrm{disk})=H_{256}`}
        caption={es
          ? 'Cada artefacto es una tupla con ruta, formato, bytes y hash; se acepta solo si el disco reproduce exactamente las dos últimas.'
          : 'Every artifact is a tuple of path, format, bytes, and hash; it is accepted only if the disk reproduces the last two exactly.'}
      />
      <p className="measure">
        {es
          ? 'La imposición es doble y mecánica. En la web, los tipos del contrato reflejan cada esquema, así que una deriva falla la compilación de tipos y el sitio no puede publicarse leyendo una forma que la cadena no produce. En Python, la auditoría de artefactos usa solo la librería estándar, para poder correr en integración continua sin instalar el paquete: recorre el índice hacia los manifiestos y hacia los archivos, y verifica que cada artefacto exista, no esté vacío, coincida en tamaño y en sha256, que el carril del manifiesto sea igual al veredicto de la puerta, y que el número de instancias del archivo de máscaras concuerde con el declarado. Una tercera comprobación, más liviana, regenera cada caso y confirma que el hash de la imagen versionada y el conteo de instancias siguen coincidiendo. Cualquier discrepancia termina con salida distinta de cero.'
          : 'Enforcement is twofold and mechanical. In the web, the contract types mirror every schema, so drift fails the type check and the site cannot ship reading a shape the chain does not produce. In Python, the artifact audit uses the standard library only, so it can run in continuous integration without installing the package: it walks the index to the manifests to the files, and verifies that every artifact exists, is non-empty, matches its byte size and its sha256, that the manifest lane equals the gate verdict, and that the instance count in the masks file agrees with the declared one. A third, lighter check regenerates each case and confirms that the hash of the committed image and the instance count still match. Any mismatch exits non-zero.'}
      </p>
      <p className="measure">
        {es
          ? 'La capa de reproducción se comprueba como identidades, no como muestreo. El manifiesto del showcase debe contener los quince métodos y los doce casos de presentación, con el control vacío declarado como exclusión explícita y los trece casos del benchmark contados aparte; el conjunto observado de pares debe ser igual al conjunto esperado, no solo del mismo tamaño. Cada par aporta tres archivos hasheados. La auditoría compara además el inventario completo del directorio contra el conjunto esperado y falla tanto por un archivo que falta como por uno que sobra, con 1240 archivos hasheados y 1241 contados. El ráster compacto de etiquetas tiene su propia validación estructural: encabezado con número mágico y versión, y la suma de las longitudes de secuencia debe ser exactamente el número de píxeles, con al menos una secuencia de primer plano, así que un archivo truncado o vacío no pasa como resultado.'
          : 'The replay layer is checked as identities, not as sampling. The showcase manifest must contain the fifteen methods and the twelve presentation cases, with the empty control declared as an explicit exclusion and the thirteen benchmark cases counted separately; the observed set of pairs must equal the expected set, not merely match in size. Each pair contributes three hashed files. The audit also compares the full directory inventory against the expected set and fails both on a missing file and on an extra one, with 1240 hashed files and 1241 counted. The compact label raster has its own structural validation: a header with a magic number and version, and the sum of the run lengths must be exactly the pixel count, with at least one foreground run, so a truncated or empty file cannot pass as a result.'}
        {/* 15 / 12 / 13 / 180, 1240 hashed and 1241 counted: data/derived/showcase/manifest.json;
            the set equality, inventory and RLE structural checks: scripts/check_artifacts.py */}
      </p>
      <Equation
        tex={String.raw`795=\underbrace{5\cdot 8\cdot 3}_{\text{base frames}}+\underbrace{75\cdot 8}_{\text{prediction frames}}+\underbrace{75}_{\text{event logs}},\qquad 75=15\ \text{methods}\times 5\ \text{sequences}`}
        caption={es
          ? 'El inventario temporal se afirma como una identidad aritmética: cinco secuencias de ocho cuadros, una predicción por método y secuencia, y un registro de eventos por par.'
          : 'The temporal inventory is asserted as an arithmetic identity: five eight-frame sequences, one prediction per method and sequence, and one event log per pair.'}
      />
      {/* 795, 5 sequences, 8 frames, 75 prediction sequences, 600 prediction frames:
          data/derived/showcase/manifest.json (temporal); the identity itself: scripts/check_artifacts.py */}
      <Callout variant="honest" title={es ? 'Un resultado queda fuera del contrato' : 'One result sits outside the contract'}>
        {es
          ? 'El barrido offline del segmentador de navegador contra el piso clásico no es un artefacto verificado por hash. Depende del modelo y del backend, así que es un resultado experimental registrado, escrito una vez y versionado, no un artefacto de regenerar y comparar como la imagen de un caso. Se etiqueta como tal en lugar de presentarse con la misma garantía que el resto, y un archivo faltante, extra, duplicado o con hash distinto invalida el paquete completo: la interfaz no rellena huecos.'
          : 'The offline sweep of the browser segmenter against the classical floor is not a hash-verified artifact. It depends on the model and the backend, so it is a recorded experiment result, written once and committed, not a regenerate-and-compare artifact like a case image. It is labelled as such instead of being presented with the same guarantee as the rest, and a missing, extra, duplicated, or hash-mismatched file invalidates the whole package: the interface does not fill gaps.'}
      </Callout>
      <Refs ids={['lin2014coco', 'aldrich2010', 'wang2003froth']} label={refsLabel} />
    </div>
  );
}

/* ---------------------------------------------------------------- 07 evidence and release */

function Evidence({ es, refsLabel }: { es: boolean; refsLabel: string }) {
  return (
    <div className="prose">
      <p className="measure">
        {es
          ? 'La comparación primaria no vive en una tabla escrita a mano: vive en un contrato versionado que une las quince implementaciones sobre la misma prueba intacta. Retiene cada una de las 960 celdas método-muestra, mantiene las dieciséis familias de condición separadas, y publica agregados macro (media no ponderada entre muestras retenidas) y micro (verdaderos y falsos positivos y negativos agrupados globalmente al umbral de 0,5). Su cobertura es una afirmación comprobable: método esperado, muestras esperadas, celdas esperadas y celdas observadas figuran en el documento, y la puerta de release rechaza cualquier valor distinto de 960.'
          : 'The primary comparison does not live in a hand-typed table: it lives in a versioned contract that joins the fifteen implementations over the same untouched test. It retains every one of the 960 method-sample cells, keeps the sixteen condition families apart, and publishes macro aggregates (unweighted mean across held-out samples) and micro aggregates (globally pooled true and false positives and negatives at the 0.5 threshold). Its coverage is a checkable claim: expected methods, expected samples, expected cells, and observed cells all appear in the document, and the release gate rejects any value other than 960.'}
        {/* 960 cells, 16 conditions, macro and micro definitions, coverage fields:
            data/derived/method-benchmark.json; the 960 assertion: scripts/build_release_report.py */}
      </p>
      <Equation
        tex={String.raw`|\mathcal K|=|\mathcal M|\times n_{\mathrm{test}}=15\times 64=960,\qquad \mathrm{complete}\iff \mathcal E=\varnothing`}
        caption={es
          ? 'La matriz retenida es un producto completo, y la release está completa solo si la lista de errores del inventario está vacía.'
          : 'The held-out matrix is a complete product, and the release is complete only if the inventory error list is empty.'}
      />
      <ul className="measure">
        <li><InlineMath tex={String.raw`n_{\mathrm{test}}`} />, {es ? 'las 64 muestras de prueba intacta, cuyos grupos de geometría latente no aparecen en entrenamiento, validación ni calibración.' : 'the 64 untouched-test samples, whose latent geometry groups appear in neither train, validation, nor calibration.'}</li>
        <li><InlineMath tex={String.raw`\mathcal E`} />, {es ? 'la lista de errores que el inventario de release construye mientras recorre la evidencia; no es un resumen, es la condición.' : 'the error list the release inventory builds as it walks the evidence; it is not a summary, it is the condition.'}</li>
      </ul>
      <p className="measure">
        {es
          ? 'Cada celda debe traer sus 28 campos, no solo una AP: identificadores de muestra, condición y grupo; AP, AP50 y AP75; conteos verdaderos y predichos; calidad panóptica con sus componentes de segmentación y reconocimiento; verdaderos positivos, falsos positivos y falsos negativos; fusiones y divisiones; precisión, recall y F de frontera con la tolerancia declarada; la unidad de diámetro; y los errores de conteo y de percentiles D10, D32, D50 y D90 junto a la distancia de Wasserstein. Separar fusiones de divisiones importa porque son las dos fallas reales de la segmentación de espuma con causas distintas: la sobre-segmentación es la cuenca de agua sembrada por brillos dentro de una burbuja grande, y la sub-segmentación es el umbral global que une burbujas que se tocan cuando no detecta la lamela entre ellas.'
          : 'Every cell must carry its 28 fields, not just an AP: sample, condition, and group identifiers; AP, AP50, and AP75; true and predicted counts; panoptic quality with its segmentation and recognition components; true positives, false positives, and false negatives; merges and splits; boundary precision, recall, and F with the declared tolerance; the diameter unit; and count and D10, D32, D50, D90 percentile errors alongside the Wasserstein distance. Separating merges from splits matters because they are the two real froth-segmentation failures with different causes: over-segmentation is the watershed seeded by highlights inside one large bubble, and under-segmentation is the global threshold that fuses touching bubbles when no lamella is detected between them.'}
        {' '}<Cite id="fan2024parallel" paren />
        {/* the 28 required per-cell fields: scripts/build_release_report.py, REQUIRED_CASE_METRICS */}
      </p>
      <Equation
        tex={String.raw`\mathrm{PQ}=\mathrm{SQ}\times\mathrm{RQ},\qquad \mathrm{SQ}=\frac{\sum_{(p,g)\in TP}\mathrm{IoU}(p,g)}{|TP|},\qquad \mathrm{RQ}=\frac{|TP|}{|TP|+\tfrac12|FP|+\tfrac12|FN|}`}
        caption={es
          ? 'Calidad panóptica factorizada: SQ responde qué tan bien se delineó una burbuja encontrada, RQ responde si se encontró el número correcto.'
          : 'Factorised panoptic quality: SQ answers how well a found bubble was outlined, RQ answers whether the right number was found.'}
      />
      <ul className="measure">
        <li>{es ? 'Los segmentos emparejan de forma única con IoU estrictamente mayor que 0,5, el umbral donde el emparejamiento se vuelve único.' : 'Segments match uniquely at IoU strictly greater than 0.5, the threshold at which the matching becomes unique.'}</li>
        <li>{es ? 'Las fusiones y divisiones se cuentan con un umbral de cobertura de 0,2 y se publican por imagen, porque un método puede tener AP razonable y ser inútil para una distribución de tamaños si sus errores se concentran en un modo.' : 'Merges and splits are counted with a coverage threshold of 0.2 and published per image, because a method can hold a respectable AP and be useless for a size distribution if its errors concentrate in one mode.'}</li>
      </ul>
      <p className="measure">
        {es
          ? 'La evidencia de cómputo es igual de obligatoria que la métrica. Cada método debe declarar carril de hardware, dispositivo, milisegundos medios de inferencia, memoria pico con la métrica usada para medirla, tamaño del artefacto de inferencia, si ese artefacto está versionado, y duración de entrenamiento; un método aprendido sin artefacto dimensionado y hasheado es un error de inventario, no una nota. Las cifras hacen visible el costo real de la escalera: el motor fundacional de segmentación celular llega a 8128,8 MiB de memoria pico y 324,5 ms por imagen, el rastreador de video oficial a 2090,2 MiB y 972,4 ms, mientras el modelo de investigación entrenado aquí usa 36,5 MiB y 98,8 ms. Esa diferencia es una de las razones por las que la comparación completa es offline.'
          : 'Compute evidence is as mandatory as the metric. Every method must declare its hardware lane, device, mean inference milliseconds, peak memory with the metric used to measure it, inference-artifact size, whether that artifact is versioned, and training duration; a learned method without a sized, hashed artifact is an inventory error, not a footnote. The numbers make the real cost of the ladder visible: the foundation cell-segmentation engine reaches 8128.8 MiB peak memory and 324.5 ms per image, the official video tracker 2090.2 MiB and 972.4 ms, while the research model trained here uses 36.5 MiB and 98.8 ms. That gap is one of the reasons the complete comparison is offline.'}
        {' '}<Cite id="stringer2021cellpose" paren />
        {/* peak_memory_mib and mean_inference_ms for L5 (8128.8 / 324.53125), L7 (2090.2 /
            972.421875) and N1 (36.5 / 98.82907692307693): data/derived/method-benchmark.json,
            methods[].compute; N1 peak memory is 36.5, not 36 */}
      </p>
      <p className="measure">
        {es
          ? 'El inventario de release junta todo eso en un solo documento auditable: el sha256 del benchmark unificado y una fila por método con estado, AP retenida, F de frontera, Wasserstein, agregados micro, evidencia de cómputo y la ruta de su documentación. El hash del manifiesto de corrida aparece solo en las ocho filas que tienen uno, las siete aprendidas y fundacionales más el modelo de investigación; las siete filas clásicas lo declaran nulo, porque no hay checkpoint que rastrear y su código versionado es el registro completo. Exige además un reporte temporal por cada método registrado, derivado del registro y no de una lista escrita a mano, para que un método nuevo no pueda unirse a la escalera y saltarse el carril de secuencias en silencio. Cada reporte temporal debe traer IDF1, HOTA, fragmentaciones de traza, precisión y recall de eventos y error de punto final de flujo, con artefactos de predicción por cuadro que se vuelven a hashear y que además deben contener al menos una etiqueta.'
          : 'The release inventory joins all of that into a single auditable document: the sha256 of the unified benchmark and one row per method with state, held-out AP, boundary F, Wasserstein, micro aggregates, compute evidence, and the path to its documentation. The run-manifest hash appears only on the eight rows that have one, the seven learned and foundation methods plus the research model; the seven classical rows declare it null, because there is no checkpoint to trace and their committed code is the whole record. It also requires one temporal report per registered method, derived from the registry rather than from a hand-written list, so a new method cannot join the ladder and quietly skip the sequence lane. Each temporal report must carry IDF1, HOTA, track fragmentations, event precision and recall, and flow endpoint error, with per-frame prediction artifacts that are re-hashed and that must additionally contain at least one label.'}
        {' '}<Cite id="luiten2021hota" paren /> <Cite id="kuhn1955hungarian" paren />
        {/* 8 rows carry a run manifest and 7 declare it null: scripts/build_release_report.py
            (MODEL_RUNS holds 8 slugs and the run field is filled only if method.learned), as
            recorded in data/derived/release-report.json (methods[].run non-null for L1..L7 and N1
            only); the 15 temporal reports: same file, temporal_evidence */}
      </p>
      <p className="measure">
        {es
          ? 'La coherencia de versión también es una puerta. El archivo de versión de la raíz es la única fuente de verdad: el inventario lo lee, deriva la forma semántica y exige que la etiqueta más reciente sea la esperada y que el manifiesto del frontend, el del proyecto Python y la versión de la librería coincidan. Comprueba además que existan la evidencia de aceptación del workbench, la de paridad clásica y el manifiesto completo de QA visual, y que la licencia del código sea la declarada. La calibración se reporta solo para métodos que exponen probabilidades; un motor que no lo hace queda registrado con su razón en lugar de recibir un valor inventado.'
          : 'Version coherence is a gate too. The root version file is the single source of truth: the inventory reads it, derives the semantic form, and requires the latest tag to be the expected one and the frontend manifest, the Python project manifest, and the library version to agree. It also checks that the workbench acceptance evidence, the classical parity evidence, and the full visual-QA manifest exist, and that the code license is the declared one. Calibration is reported only for methods that expose probabilities; an engine that does not is recorded with its rationale rather than given a fabricated value.'}
        {' '}<Cite id="brier1950" paren />
      </p>
      <Callout variant="honest" title={es ? 'El inventario está incompleto, y lo dice' : 'The inventory is incomplete, and says so'}>
        {es
          ? 'El reporte de release actual se declara incompleto con un único error bloqueante: no hay una fuente real de espuma, licenciada y aceptada, con muestras importadas y calibración física. Se mantiene como error que bloquea, no como nota al pie. Además, el liderazgo medido es específico del generador: el modelo de investigación lidera el benchmark sintético controlado con AP 0,5186 frente a 0,5099 del motor fundacional, pero la prueba de transferencia a dominio adyacente lo baja a 0,125 mientras el motor fundacional sube a 0,709; los seis modelos entrenados aquí se degradan sin excepción (media -0,243) y seis de los siete métodos clásicos mejoran (media +0,088); el séptimo, la cuenca de agua por inmersión, cae de 0,0173 a 0,0 y es la única excepción. El documento no declara superioridad, y esa prueba adyacente favorece el dominio de preentrenamiento del motor fundacional, así que tampoco muestra que sea mejor en espuma: muestra que la ventaja del modelo propio no sobrevive el cambio de dominio.'
          : 'The current release report declares itself incomplete with a single blocking error: there is no accepted, licensed real froth source with imported samples and physical calibration. It is kept as a blocking error, not as a footnote. Beyond that, the measured lead is generator-specific: the research model leads the controlled synthetic benchmark with AP 0.5186 against 0.5099 for the foundation engine, but the adjacent-domain transfer test drops it to 0.125 while the foundation engine rises to 0.709; all six models trained here degrade without exception (mean -0.243) and six of the seven classical methods improve (mean +0.088); the seventh, the immersion watershed, falls from 0.0173 to 0.0 and is the one exception. The document claims no superiority, and that adjacent test favours the foundation engine pretraining domain, so it does not show it is better on froth either: it shows the in-repository lead does not survive domain shift.'}
        {/* complete false and the single blocking error: data/derived/release-report.json;
            0.5186 / 0.5099 / 0.125 / 0.709 / -0.243 / +0.088 and beyond_sota_claim false:
            data/derived/method-benchmark.json (current_bar) and data/derived/real-adjacent-benchmark.json.
            Six of seven, not every: C2 watershed_immersion goes from test mean_ap 0.017265625
            (data/derived/method-benchmark.json, methods[1].test) to mean_ap 0.0
            (data/derived/real-adjacent-benchmark.json, methods[1]), a delta of -0.0173, while the
            other six classical rows are positive; the +0.088 tier mean is exact over all seven.
            current_bar.leader_note in method-benchmark.json states the universal, and it is wrong
            on that row. */}
      </Callout>
      <Refs ids={['stringer2021cellpose', 'fan2024parallel', 'luiten2021hota', 'kuhn1955hungarian', 'brier1950']} label={refsLabel} />
    </div>
  );
}

/* ---------------------------------------------------------------- 08 deployment */

function Deployment({ es, refsLabel }: { es: boolean; refsLabel: string }) {
  return (
    <div className="prose">
      <p className="measure">
        {es
          ? 'El despliegue por defecto es hosting estático, y su trabajo es publicar exactamente el estado que se validó. El flujo se dispara al empujar a la rama principal y hace tres cosas en orden. Primero verifica la evidencia científica versionada: regenera y compara los casos, audita manifiestos contra artefactos y corre la puerta de completitud del producto, por defecto en su perfil de release. Segundo construye la aplicación, con un paso previo que superpone el árbol derivado en el directorio público del frontend para que el sitio estático sirva los artefactos; las copias canónicas siguen en el árbol de datos y la superposición se ignora en git. Tercero sube el directorio de distribución y publica. El despliegue no entrena, no infiere, no ajusta y no regenera el benchmark canónico.'
          : 'The default deployment is static hosting, and its job is to publish exactly the state that was validated. The workflow triggers on a push to the main branch and does three things in order. First it verifies the committed scientific evidence: it regenerates and compares the cases, audits manifests against artifacts, and runs the product completeness gate, by default in its release profile. Second it builds the application, with a prebuild step that overlays the derived tree into the frontend public directory so the static site serves the artifacts; the canonical copies stay in the data tree and the overlay is git-ignored. Third it uploads the distribution directory and publishes. Deployment does not train, does not infer, does not tune, and does not regenerate the canonical benchmark.'}
      </p>
      <p className="measure">
        {es
          ? 'Un detalle operativo vale la pena porque cuesta una tarde si se ignora: en despliegues por acciones, el archivo de dominio dentro del repositorio no fija el dominio personalizado. Hay que fijarlo por API sobre la configuración de páginas del repositorio y volver a desplegar; si no, el dominio responde con un error de no encontrado aunque la construcción esté verde. La verificación posterior al despliegue pide las rutas, los fragmentos dinámicos, los manifiestos y una muestra de artefactos grandes, y confirma que los enlaces profundos cargan por el fallback de aplicación de una sola página.'
          : 'One operational detail is worth stating because it costs an afternoon when ignored: on Actions-based deployments, the domain file inside the repository does not set the custom domain. It has to be set through the API on the repository pages configuration and then redeployed; otherwise the domain answers with a not-found error even though the build is green. Post-deploy verification requests the routes, the dynamic chunks, the manifests, and a sample of large artifacts, and confirms that deep links load through the single-page-application fallback.'}
      </p>
      <p className="measure">
        {es
          ? 'Los pesos del segmentador de navegador no están en git, y eso es una decisión, no un olvido: las guardas de integridad rechazan checkpoints versionados fuera del directorio de modelos y binarios nativos, así que un blob de decenas de megabytes no puede entrar. Al cargar, la aplicación descarga el modelo ligero de clase SAM por defecto desde el hub y el navegador lo guarda en su caché de peticiones, de modo que solo la primera visita paga la descarga. Si el hub no está disponible, el segmentador no carga y la degradación es acotada y visible: el benchmark horneado, las muestras sintéticas, la matemática de distribución de tamaños y todas las páginas profundas se sirven desde artefactos versionados y funcionan sin modelo alguno; solo el carril vivo se afecta, y muestra un error de carga en lugar de bloquear la página.'
          : 'The weights of the browser segmenter are not in git, and that is a decision, not an oversight: the integrity guards reject tracked checkpoints outside the models directory and native binaries, so a blob of tens of megabytes cannot get in. At load time the application fetches the default lightweight SAM-class model from the hub and the browser stores it in its request cache, so only the first visit pays the download. If the hub is unavailable, the segmenter does not load and the degradation is bounded and visible: the baked benchmark, the synthetic samples, the size-distribution mathematics, and every deep page are served from committed artifacts and work with no model at all; only the live lane is affected, and it surfaces a load error instead of blocking the page.'}
        {' '}<Cite id="chen2023slimsam" paren /> <Cite id="transformersjs" paren />
      </p>
      <p className="measure">
        {es
          ? 'El backend de inferencia se elige por una restricción concreta del hosting estático. El backend WASM multihilo necesita memoria compartida, que exige aislamiento de origen cruzado mediante dos cabeceras de respuesta que un host estático no puede fijar, así que el backend multihilo se quedaría colgado. La aplicación fuerza entonces un solo hilo: más lento, pero funciona en todas partes. La ruta rápida es la API de GPU del navegador, que no necesita memoria compartida, y se selecciona solo después de sondear un adaptador real, de modo que nunca se elige un camino que va a fallar. En la medición offline sobre CPU en Node el codificador tarda alrededor de un segundo una vez y el barrido completo de 1024 prompts de una rejilla de 32 por 32 toma entre 24 y 31 segundos por caso; la ruta de GPU en navegador es mucho más rápida.'
          : 'The inference backend is chosen by a concrete constraint of static hosting. The multi-threaded WASM backend needs shared memory, which requires cross-origin isolation through two response headers a static host cannot set, so the threaded backend would stall. The application therefore forces a single thread: slower, but it works everywhere. The fast path is the browser GPU API, which does not need shared memory, and it is selected only after probing for a real adapter, so a path that will fail is never chosen. In the offline measurement on Node CPU the encoder takes about one second once and the full 1024-prompt sweep of a 32 by 32 grid takes 24 to 31 seconds per case; the in-browser GPU path is far faster.'}
        {' '}<Cite id="onnxruntimeweb" paren /> <Cite id="webgpu" paren />
        {/* 1024 prompts from a 32 x 32 grid, about 1 s encoder, 24 to 31 s per case on Node CPU:
            docs/guides/03_verify-sam.md; numThreads = 1 and the adapter probe:
            docs/architecture/07_deploy.md */}
      </p>
      <Equation
        tex={String.raw`\mathrm{device}=\begin{cases}\texttt{webgpu}, & \text{adapter probe succeeds}\\[2pt] \texttt{wasm},\ \texttt{numThreads}=1, & \text{otherwise}\end{cases}`}
        caption={es
          ? 'Selección de dispositivo: GPU del navegador solo tras un sondeo real de adaptador, si no un hilo de WASM, porque el hosting estático no puede aislar el origen.'
          : 'Device selection: browser GPU only after a real adapter probe, otherwise one WASM thread, because static hosting cannot isolate the origin.'}
      />
      <p className="measure">
        {es
          ? 'La integración continua mantiene el producto honesto entre releases. Corre en cada empuje y en cada solicitud de cambios: linting, pruebas, una prueba de humo de la cadena y una del showcase que escriben en el directorio temporal del ejecutor para que los artefactos canónicos sigan siendo de solo lectura, la auditoría de contrato, la regeneración con comparación de hashes, la puerta de completitud en perfil de desarrollo, y del lado del frontend instalación, pruebas, auditoría de dependencias y construcción de producción. Un trabajo separado de guardas falla la construcción por un archivo de entorno real versionado, un entorno virtual, un binario nativo o de modelo pesado, datos crudos, o una ruta local filtrada.'
          : 'Continuous integration keeps the product honest between releases. It runs on every push and every pull request: lint, tests, a chain smoke and a showcase smoke that write into the runner temporary directory so the canonical artifacts stay read-only, the contract audit, the regenerate-and-compare check, the completeness gate in development profile, and on the frontend side install, tests, dependency audit, and a production build. A separate guards job fails the build on a tracked real environment file, a virtual environment, a native or heavy model binary, raw data, or a leaked local path.'}
      </p>
      <p className="measure">
        {es
          ? 'La ruta de servidor permanece dormida a propósito. Las plantillas de servicio y de proxy inverso siguen disponibles para cuando una API desplegada sea necesaria, y el paquete opcional de API sirve contratos de contenido estático si un backend alojado resulta útil, pero la superficie pública por defecto es el sitio acompañante estático, y el producto offline sigue siendo completamente usable sin él.'
          : 'The server path stays dormant on purpose. The service and reverse-proxy templates remain available for when a deployed API is needed, and the optional API package serves static content contracts if a hosted backend is useful, but the default public surface is the static companion site, and the offline product remains fully usable without it.'}
      </p>
      <Callout variant="honest" title={es ? 'Sin cómputo científico en línea' : 'No online scientific compute'}>
        {es
          ? 'La interacción sobre una carga es una herramienta adicional y acotada, con cuatro métodos y sin verdad de referencia, así que no produce una AP. El benchmark, el entrenamiento, la calibración y las predicciones oficiales permanecen offline y se publican como evidencia verificable. Las pruebas y las puertas demuestran consistencia y cobertura, no utilidad industrial: eso sigue siendo una pregunta separada que exige evidencia externa gobernada.'
          : 'Interaction on an upload is an additional bounded tool, with four methods and no reference truth, so it produces no AP. Benchmarking, training, calibration, and the official predictions stay offline and are published as verifiable evidence. The tests and gates prove consistency and coverage, not industrial usefulness: that remains a separate question demanding governed external evidence.'}
      </Callout>
      <Refs ids={['chen2023slimsam', 'transformersjs', 'onnxruntimeweb', 'webgpu']} label={refsLabel} />
    </div>
  );
}
