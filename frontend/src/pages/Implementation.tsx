import { Refs, SubTabs, useShellLang } from '@fasl-work/caos-app-shell';

export default function Implementation() {
  const es = useShellLang() === 'es';
  const tabs = [
    { id: 'stack', label: es ? 'Stack completo' : 'Complete stack', content: <Stack es={es} /> },
    { id: 'pipeline', label: es ? 'Pipelines offline' : 'Offline pipelines', content: <Pipeline es={es} /> },
    { id: 'lanes', label: es ? 'Offline, replay, vivo' : 'Offline, replay, live', content: <Lanes es={es} /> },
    { id: 'contracts', label: es ? 'Contratos' : 'Contracts', content: <Contracts es={es} /> },
  ];
  return (
    <div className="page-body prose">
      <div className="page-head">
        <span className="eyebrow">C1-C7 · L1-L7 · N1</span>
        <h1>{es ? 'Implementación' : 'Implementation'}</h1>
        <p className="lede">
          {es
            ? 'El producto es el repositorio completo: datos, CPU/GPU, modelos, evidencia, documentación y web complementaria.'
            : 'The product is the complete repository: data, CPU/GPU, models, evidence, documentation, and companion web.'}
        </p>
      </div>
      <section><SubTabs tabs={tabs} ariaLabel="implementation" /></section>
    </div>
  );
}

function Stack({ es }: { es: boolean }) {
  const rows = [
    ['Data', 'NumPy · SciPy · scikit-image · OpenCV · pycocotools', es ? 'generación, contratos, C1-C7 y métricas' : 'generation, contracts, C1-C7, and metrics'],
    ['Training', 'PyTorch CUDA · TensorFlow/StarDist · Ultralytics', es ? 'L1-L4, L6 y N1' : 'L1-L4, L6, and N1'],
    ['Foundation', 'Cellpose-SAM · facebookresearch/sam2', es ? 'inferencia oficial CUDA y video' : 'official CUDA inference and video'],
    ['Export', 'NPZ · ONNX · H5 · PT · JSON', es ? 'checkpoints, paridad y evidencia' : 'checkpoints, parity, and evidence'],
    ['Web', 'React · TypeScript · uPlot · KaTeX', es ? 'replay y evaluación liviana' : 'replay and lightweight evaluation'],
  ];
  return (
    <>
      <table className="fs-table">
        <thead><tr><th>{es ? 'Capa' : 'Layer'}</th><th>{es ? 'Motores' : 'Engines'}</th><th>{es ? 'Responsabilidad' : 'Responsibility'}</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row[0]}><td>{row[0]}</td><td className="mono">{row[1]}</td><td>{row[2]}</td></tr>)}</tbody>
      </table>
      <Refs ids={['meyer1994', 'achanta2012slic', 'kirillov2023']} label="Refs" />
    </>
  );
}

function Pipeline({ es }: { es: boolean }) {
  return (
    <>
      <ol>
        <li>{es ? 'Generar casos y secuencias con verdad exacta e identidades persistentes.' : 'Generate cases and sequences with exact truth and persistent identities.'}</li>
        <li>{es ? 'Separar por grupo geométrico en train, validación, calibración y test intocable.' : 'Split by geometry group into train, validation, calibration, and untouched test.'}</li>
        <li>{es ? 'Materializar el cache local con SHA-256.' : 'Materialize the local cache with SHA-256.'}</li>
        <li>{es ? 'Entrenar o cargar checkpoints oficiales; nunca caer silenciosamente a CPU.' : 'Train or load official checkpoints; never silently fall back to CPU.'}</li>
        <li>{es ? 'Calibrar sin tocar test, evaluar 64 muestras y diagnosticar 13 casos.' : 'Calibrate without touching test, evaluate 64 samples, and diagnose 13 cases.'}</li>
        <li>{es ? 'Exportar modelos, máscaras, métricas temporales y reporte de release.' : 'Export models, masks, temporal metrics, and the release report.'}</li>
      </ol>
      <p className="fs-note">{es ? 'StarDist en Windows nativo usa TensorFlow CPU por limitación upstream; WSL2/Linux es la ruta GPU soportada.' : 'StarDist uses TensorFlow CPU on native Windows due to an upstream limitation; WSL2/Linux is the supported GPU path.'}</p>
    </>
  );
}

function Lanes({ es }: { es: boolean }) {
  return (
    <>
      <h3>{es ? 'Offline obligatorio' : 'Mandatory offline'}</h3>
      <p>{es ? 'Entrenamiento, fundacionales oficiales, benchmark completo, exportación y release.' : 'Training, official foundation models, full benchmark, export, and release.'}</p>
      <h3>Replay</h3>
      <p>{es ? 'La web lee resultados compactos y casos seleccionados; no los recalcula.' : 'The web reads compact results and selected cases; it does not recompute them.'}</p>
      <h3>{es ? 'Vivo acotado' : 'Bounded live'}</h3>
      <p>{es ? 'C1-C7 en TypeScript y SlimSAM legado sobre una imagen. Es exploración, no reemplazo del pipeline.' : 'C1-C7 in TypeScript and legacy SlimSAM on one image. This is exploration, not a pipeline replacement.'}</p>
    </>
  );
}

function Contracts({ es }: { es: boolean }) {
  return (
    <>
      <h3>CONTRACT 1 · {es ? 'ingesta' : 'ingestion'}</h3>
      <p>{es ? 'Valida forma, tamaño, rango dinámico, brillo, contraste y exposición.' : 'Validates shape, size, dynamic range, glare, contrast, and exposure.'}</p>
      <h3>CONTRACT 2 · {es ? 'artefactos' : 'artifacts'}</h3>
      <p>{es ? 'Registra formatos, tamaños y SHA-256; CI detecta deriva.' : 'Records formats, sizes, and SHA-256; CI detects drift.'}</p>
      <h3>CONTRACT 3 · {es ? 'evidencia de modelos' : 'model evidence'}</h3>
      <p>{es ? 'Registra dataset, split, semilla, dispositivo, checkpoint, calibración, métricas y paridad.' : 'Records dataset, split, seed, device, checkpoint, calibration, metrics, and parity.'}</p>
    </>
  );
}
