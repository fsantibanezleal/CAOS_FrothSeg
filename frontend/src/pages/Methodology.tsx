import { Equation, Refs, SubTabs, useShellLang } from '@fasl-work/caos-app-shell';

export default function Methodology() {
  const es = useShellLang() === 'es';
  const tabs = [
    { id: 'portfolio', label: es ? '15 métodos' : '15 methods', content: <Portfolio es={es} /> },
    { id: 'classical', label: es ? 'Clásicos C1-C7' : 'Classical C1-C7', content: <Classical es={es} /> },
    { id: 'learned', label: es ? 'Aprendidos L1-L7' : 'Learned L1-L7', content: <Learned es={es} /> },
    { id: 'data', label: es ? 'Datos y splits' : 'Data and splits', content: <Data es={es} /> },
    { id: 'metrics', label: es ? 'Métricas' : 'Metrics', content: <Metrics es={es} /> },
    { id: 'morphometry', label: es ? 'BSD' : 'BSD', content: <Morphometry es={es} /> },
  ];
  return (
    <div className="page-body prose">
      <div className="page-head">
        <h1>{es ? 'Metodología completa' : 'Complete methodology'}</h1>
        <p className="lede">
          {es
            ? 'Una escalera comparable de métodos, splits sin fuga, calibración separada, métricas de instancia y evidencia temporal.'
            : 'A comparable method ladder, leakage-resistant splits, separate calibration, instance metrics, and temporal evidence.'}
        </p>
      </div>
      <section><SubTabs tabs={tabs} ariaLabel="methodology" /></section>
    </div>
  );
}

function Portfolio({ es }: { es: boolean }) {
  return (
    <>
      <table className="fs-table">
        <thead><tr><th>{es ? 'Clase' : 'Tier'}</th><th>ID</th><th>{es ? 'Métodos' : 'Methods'}</th></tr></thead>
        <tbody>
          <tr><td>{es ? 'Clásicos' : 'Classical'}</td><td>C1-C7</td><td>Otsu+CC · immersion · marker · distance · H-minima · SLIC+RAG · lamella valley</td></tr>
          <tr><td>{es ? 'Dominio' : 'Domain'}</td><td>L1-L4, L6</td><td>U-Net · deep markers · global context · StarDist · YOLO</td></tr>
          <tr><td>{es ? 'Fundacionales' : 'Foundation'}</td><td>L5, L7</td><td>Cellpose-SAM · SAM2.1 image/video</td></tr>
          <tr><td>{es ? 'Frontera' : 'Frontier'}</td><td>N1</td><td>LamellaStar</td></tr>
        </tbody>
      </table>
      <p>{es ? 'Todos están implementados. La aceptación de implementación no oculta la calidad: cada resultado conserva su estado respecto al bar AP 0.30.' : 'All are implemented. Implementation acceptance does not hide quality: each result retains its status against the AP 0.30 bar.'}</p>
    </>
  );
}

function Classical({ es }: { es: boolean }) {
  return (
    <>
      <p>{es ? 'Los clásicos establecen fallas interpretables y costos bajos. Se ejecutan con scikit-image, SciPy y OpenCV en el benchmark autoritativo.' : 'Classical methods establish interpretable failure modes and low-cost baselines. The authoritative benchmark uses scikit-image, SciPy, and OpenCV.'}</p>
      <ul>
        <li>C1 · {es ? 'Otsu y componentes conectados' : 'Otsu and connected components'}</li>
        <li>C2 · {es ? 'watershed de inmersión por gradiente' : 'gradient immersion watershed'}</li>
        <li>C3 · {es ? 'watershed controlado por marcadores' : 'marker-controlled watershed'}</li>
        <li>C4 · {es ? 'watershed por transformada de distancia' : 'distance-transform watershed'}</li>
        <li>C5 · H-minima watershed</li>
        <li>C6 · SLIC + RAG merge</li>
        <li>C7 · {es ? 'watershed restringido por valles de lamela' : 'lamella-valley constrained watershed'}</li>
      </ul>
      <Refs ids={['meyer1994', 'vincent1991', 'achanta2012slic']} label="Refs" />
    </>
  );
}

function Learned({ es }: { es: boolean }) {
  return (
    <>
      <p>{es ? 'L1-L3 aprenden foreground, borde y distancia antes del watershed. StarDist predice polígonos radiales. YOLO aprende instancias desde polígonos exactos. Cellpose-SAM y SAM2 usan implementaciones y checkpoints oficiales. LamellaStar agrega evidencia de centro, pero su primera hipótesis falló.' : 'L1-L3 learn foreground, boundary, and distance before watershed. StarDist predicts radial polygons. YOLO learns instances from exact polygons. Cellpose-SAM and SAM2 use official implementations and checkpoints. LamellaStar adds center evidence, but its first hypothesis failed.'}</p>
      <p className="fs-note">{es ? 'Cellpose-SAM lidera el test con AP 0.4336. No existe afirmación beyond SOTA.' : 'Cellpose-SAM leads the test at AP 0.4336. There is no beyond-SOTA claim.'}</p>
      <Refs ids={['kirillov2023']} label="Refs" />
    </>
  );
}

function Data({ es }: { es: boolean }) {
  return (
    <>
      <p>{es ? 'Dieciséis familias de condición producen 192 grupos geométricos y dos apariencias por grupo: 384 muestras. La unidad del split es el grupo, no la imagen.' : 'Sixteen condition families produce 192 geometry groups and two appearances per group: 384 samples. The split unit is the group, not the image.'}</p>
      <table className="fs-table">
        <thead><tr><th>Split</th><th className="num">{es ? 'Muestras' : 'Samples'}</th><th>{es ? 'Uso' : 'Use'}</th></tr></thead>
        <tbody>
          <tr><td>train</td><td className="num">192</td><td>{es ? 'optimización' : 'optimization'}</td></tr>
          <tr><td>validation</td><td className="num">64</td><td>{es ? 'monitoreo' : 'monitoring'}</td></tr>
          <tr><td>calibration</td><td className="num">64</td><td>{es ? 'umbrales y postproceso' : 'thresholds and post-processing'}</td></tr>
          <tr><td>test</td><td className="num">64</td><td>{es ? 'comparación intocable' : 'untouched comparison'}</td></tr>
        </tbody>
      </table>
    </>
  );
}

function Metrics({ es }: { es: boolean }) {
  return (
    <>
      <Equation tex={String.raw`\mathrm{IoU}(A,B)=\frac{|A\cap B|}{|A\cup B|}`} />
      <Equation tex={String.raw`\mathrm{AP}=\frac{1}{10}\sum_{t\in\{0.50,\ldots,0.95\}}\frac{\mathrm{TP}_t}{\mathrm{TP}_t+\mathrm{FP}_t+\mathrm{FN}_t}`} />
      <p>{es ? 'También se reportan AP50, PQ, SQ, RQ, merges, splits, falsos positivos y falsos negativos. La identidad temporal se mide sobre secuencias con IDs exactos.' : 'AP50, PQ, SQ, RQ, merges, splits, false positives, and false negatives are also reported. Temporal identity is measured on sequences with exact IDs.'}</p>
      <Refs ids={['lin2014coco']} label="Refs" />
    </>
  );
}

function Morphometry({ es }: { es: boolean }) {
  return (
    <>
      <Equation tex={String.raw`d_{\mathrm{eq}}=2\sqrt{A/\pi}`} />
      <Equation tex={String.raw`d_{32}=\frac{\sum_i d_i^3}{\sum_i d_i^2}`} />
      <p>{es ? 'Las máscaras se reducen a D10, D50, D90, d32 y descriptores por burbuja. La distancia Wasserstein-1 cuantifica la fidelidad de la distribución.' : 'Masks reduce to D10, D50, D90, d32, and per-bubble descriptors. Wasserstein-1 quantifies distribution fidelity.'}</p>
      <Refs ids={['aldrich2010', 'sautermean']} label="Refs" />
    </>
  );
}
