import { Refs, SubTabs, useShellLang } from '@fasl-work/caos-app-shell';

export default function Implementation() {
  const es = useShellLang() === 'es';
  const tabs = [
    { id: 'stack', label: es ? 'El stack' : 'The stack', content: <Stack es={es} /> },
    { id: 'lanes', label: es ? 'Vivo vs precómputo' : 'Live vs precompute', content: <Lanes es={es} /> },
    { id: 'contracts', label: es ? 'Contratos de datos' : 'Data contracts', content: <Contracts es={es} /> },
    { id: 'pipeline', label: es ? 'Pipeline offline' : 'Offline pipeline', content: <Pipeline es={es} /> },
    { id: 'perf', label: es ? 'Rendimiento + honestidad' : 'Performance + honesty', content: <Perf es={es} /> },
  ];
  return (
    <div className="page-body prose">
      <div className="page-head">
        <h1>{es ? 'Implementación' : 'Implementation'}</h1>
        <p className="lede">
          {es ? 'El stack real, las dos vías de cómputo, los dos contratos de datos y el pipeline offline que precalcula el benchmark.' : 'The real stack, the two compute lanes, the two data contracts, and the offline pipeline that bakes the benchmark.'}
        </p>
      </div>
      <section><SubTabs tabs={tabs} ariaLabel="implementation" /></section>
    </div>
  );
}

function Stack({ es }: { es: boolean }) {
  return (
    <>
      <p>{es ? 'Todo se ejecuta en el cliente; no hay backend. Las piezas, cada una la herramienta estándar para su tarea:' : 'Everything runs client-side; there is no backend. The pieces, each the standard tool for its job:'}</p>
      <table className="fs-table">
        <thead><tr><th>{es ? 'Capa' : 'Layer'}</th><th>{es ? 'Herramienta' : 'Tool'}</th><th>{es ? 'Rol' : 'Role'}</th></tr></thead>
        <tbody>
          <tr><td>{es ? 'Segmentador en vivo' : 'Live segmenter'}</td><td className="mono">@huggingface/transformers + onnxruntime-web</td><td>{es ? 'SAM-class en WebGPU (respaldo WASM)' : 'SAM-class on WebGPU (WASM fallback)'}</td></tr>
          <tr><td>{es ? 'Piso clásico' : 'Classical floor'}</td><td className="mono">scikit-image · scipy.ndimage · OpenCV</td><td>{es ? 'watershed/SLIC, EDT exacta, deglare (offline)' : 'watershed/SLIC, exact EDT, deglare (offline)'}</td></tr>
          <tr><td>{es ? 'Front-end de imagen' : 'Image front-end'}</td><td className="mono">canvas / typed arrays</td><td>{es ? 'aplanado de iluminación + deglare en vivo' : 'illumination flatten + deglare, live'}</td></tr>
          <tr><td>{es ? 'Máscaras' : 'Masks'}</td><td className="mono">pycocotools (RLE) + port TS</td><td>{es ? 'verdad de terreno COCO-RLE, decodificada en el navegador' : 'COCO-RLE ground truth, decoded in the browser'}</td></tr>
          <tr><td>{es ? 'UI' : 'UI'}</td><td className="mono">React 19 · caos-app-shell · uPlot · KaTeX</td><td>{es ? 'shell compartido, i18n, tema claro/oscuro' : 'shared shell, i18n, light/dark theme'}</td></tr>
        </tbody>
      </table>
      <Refs ids={['transformersjs', 'onnxruntimeweb']} label="Refs" />
    </>
  );
}

function Lanes({ es }: { es: boolean }) {
  return (
    <>
      <p>
        {es
          ? 'Dos vías. La vía en vivo es el segmentador SAM en el navegador: el modelo se descarga una vez desde el hub de Hugging Face y el navegador lo cachea (Cache API); la inferencia se ejecuta en el cliente sobre el cuadro con WebGPU. Si WebGPU no está, cae a WASM-SIMD, más lento pero funcional.'
          : 'Two lanes. The live lane is the browser SAM segmenter: the model is fetched once from the Hugging Face hub and the browser caches it (Cache API); inference runs client-side on the frame with WebGPU. If WebGPU is absent it falls back to WASM-SIMD, slower but functional.'}
      </p>
      <p>
        {es
          ? 'La vía de precómputo es el benchmark: los casos sintéticos y los puntajes del piso clásico se precalculan con el pipeline de Python (scikit-image/OpenCV no son aptos para Pyodide y los cuadros son imágenes completas), y se versionan como artefactos que la web solo lee. La división de vías se registra en cada manifiesto: el benchmark sintético es precómputo; la segmentación SAM es en vivo.'
          : 'The precompute lane is the benchmark: the synthetic cases and classical-floor scores are baked by the Python pipeline (scikit-image/OpenCV are not Pyodide-safe and the frames are full images), and committed as artifacts the web just reads. The lane split is recorded in each manifest: the synthetic benchmark is precompute; the SAM segmentation is live.'}
      </p>
      <p className="fs-note">
        {es ? 'Si el hub no está disponible, el segmentador en vivo se degrada con un mensaje claro; el benchmark precalculado y el piso clásico siguen visibles porque son artefactos versionados.' : 'If the hub is unavailable, the live segmenter degrades with a clear message; the baked benchmark and the classical floor stay visible because they are committed artifacts.'}
      </p>
    </>
  );
}

function Contracts({ es }: { es: boolean }) {
  return (
    <>
      <h3>{es ? 'CONTRACT 1 · el gate de espuma propia' : 'CONTRACT 1 · the bring-your-own-froth gate'}</h3>
      <p>
        {es ? 'Un cuadro se acepta solo si es una imagen real y usable (lado mínimo 64px, rango dinámico ≥ 0.06); se rechaza con una razón; y se marca (brillo > 20% saturado, bajo contraste, subexposición). El navegador espeja los mismos umbrales, así una subida mala se rechaza antes de gastar una inferencia SAM, y el front-end de deglare reacciona a las marcas.' : 'A frame is accepted only if it is a real, usable image (min side 64px, dynamic range ≥ 0.06); rejected with a reason; and flagged (glare > 20% saturated, low contrast, under-exposure). The browser mirrors the same thresholds, so a bad upload is rejected before spending a SAM inference, and the deglare front-end reacts to the flags.'}
      </p>
      <h3>{es ? 'CONTRACT 2 · el artefacto versionado' : 'CONTRACT 2 · the committed artifact'}</h3>
      <p>
        {es ? 'Cada caso sintético incluye frame.png, máscaras COCO-RLE, un CSV de BSD, el benchmark y un manifiesto con el tamaño en bytes y el sha256 de cada artefacto. Un chequeo stdlib re-verifica cada sha256 en CI, así un cambio de código que altere silenciosamente un artefacto rompe el build. Los tipos TS del frontend espejan los esquemas Python, así una deriva de esquema falla el build.' : 'Each synthetic case ships frame.png, COCO-RLE masks, a BSD CSV, the benchmark and a manifest carrying each artifact\'s byte size and sha256. A stdlib check re-verifies every sha256 in CI, so a code change that silently alters an artifact fails the build. The frontend TS types mirror the Python schemas, so a schema drift fails the build.'}
      </p>
    </>
  );
}

function Pipeline({ es }: { es: boolean }) {
  return (
    <>
      <p>{es ? 'El pipeline offline (data-pipeline/fslab) es determinista: cada caso es una función pura de (spec, semilla). Las etapas:' : 'The offline pipeline (data-pipeline/fslab) is deterministic: each case is a pure function of (spec, seed). The stages:'}</p>
      <ol>
        <li><span className="mono">generate</span> {es ? '· renderiza la espuma sintética + verdad de terreno exacta (froth_gen.py).' : '· render the synthetic froth + exact ground truth (froth_gen.py).'}</li>
        <li><span className="mono">benchmark</span> {es ? '· ejecuta cada método del piso y lo puntúa contra la verdad (mask AP + BSD Wasserstein).' : '· run each floor method and score it against the truth (mask AP + BSD Wasserstein).'}</li>
        <li><span className="mono">export</span> {es ? '· codifica frame.png + COCO-RLE + CSV + benchmark + manifiesto con sha256.' : '· encode frame.png + COCO-RLE + CSV + benchmark + manifest with sha256.'}</li>
      </ol>
      <p>{es ? 'El segmentador SAM en vivo se verifica offline con el mismo harness: frontend/scripts/verify_sam.ts ejecuta el segmentador (en Node, onnxruntime) y scripts/score_sam.py lo puntúa con las mismas funciones mask_ap del piso. Así el valor del producto se mide, no se afirma.' : 'The live SAM segmenter is verified offline with the same harness: frontend/scripts/verify_sam.ts runs the segmenter (in Node, onnxruntime) and scripts/score_sam.py scores it with the floor\'s same mask_ap functions. So the product value is measured, not asserted.'}</p>
    </>
  );
}

function Perf({ es }: { es: boolean }) {
  return (
    <>
      <p>{es ? 'El encoder se ejecuta una vez (~1s en CPU Node, mucho menos en WebGPU); los puntos de la grilla se decodifican por lotes. Una grilla 32×32 son 1024 prompts; la densidad de grilla es un control en vivo para equilibrar cobertura y latencia. Las subidas grandes se reescalan a 1024px (SAM reescala internamente de todos modos).' : 'The encoder runs once (~1s on Node CPU, far less on WebGPU); the grid points are decoded in batches. A 32×32 grid is 1024 prompts; grid density is a live control to trade coverage against latency. Large uploads are downscaled to 1024px (SAM resizes internally anyway).'}</p>
      <ul>
        <li>{es ? 'El AP sintético no es AP de planta real; es un entorno controlado con verdad exacta.' : 'Synthetic AP is not real-plant AP; it is a controlled harness with exact truth.'}</li>
        <li>{es ? 'El estado de espuma es un proxy heurístico (Aldrich et al. 2010), no un setpoint calibrado.' : 'The froth state is a heuristic proxy (Aldrich et al. 2010), not a calibrated setpoint.'}</li>
        <li>{es ? 'Bajo desenfoque de movimiento/foco fuerte, SAM produce pocas máscaras confiables y el piso clásico es complementario; la app ofrece ambos.' : 'Under heavy motion/defocus blur, SAM yields few confident masks and the classical floor is complementary; the app offers both.'}</li>
      </ul>
      <Refs ids={['aldrich2010', 'webgpu']} label="Refs" />
    </>
  );
}
