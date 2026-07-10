import { Equation, InlineMath, Refs, SubTabs, useShellLang } from '@fasl-work/caos-app-shell';

export default function Methodology() {
  const es = useShellLang() === 'es';
  const tabs = [
    { id: 'sam', label: es ? 'Núcleo SAM en vivo' : 'Live SAM core', content: <Sam es={es} /> },
    { id: 'auto', label: es ? 'Generador de máscaras' : 'Auto-mask generator', content: <Auto es={es} /> },
    { id: 'floor', label: es ? 'Piso clásico' : 'Classical floor', content: <Floor es={es} /> },
    { id: 'bsd', label: es ? 'BSD + morfometría' : 'BSD + morphometry', content: <Bsd es={es} /> },
    { id: 'synth', label: es ? 'Espuma sintética' : 'Synthetic froth', content: <Synth es={es} /> },
    { id: 'score', label: es ? 'Puntuación' : 'Scoring', content: <Score es={es} /> },
  ];
  return (
    <div className="page-body prose">
      <div className="page-head">
        <h1>{es ? 'Metodología' : 'Methodology'}</h1>
        <p className="lede">
          {es
            ? 'El generador automático de máscaras SAM, el piso clásico, la distribución de tamaño de burbuja y el banco sintético, con la matemática término por término.'
            : 'The SAM automatic mask generator, the classical floor, the bubble-size distribution, and the synthetic harness, with the maths term by term.'}
        </p>
      </div>
      <section><SubTabs tabs={tabs} ariaLabel="methodology" /></section>
    </div>
  );
}

function Sam({ es }: { es: boolean }) {
  return (
    <>
      <p>
        {es
          ? 'El método en vivo es Segment Anything (SAM): un modelo fundacional promptable que produce máscaras de instancia zero-shot, sin etiquetas de entrenamiento del dominio, exactamente lo que la espuma necesita porque los datos etiquetados escasean. La imagen pasa por un encoder pesado UNA vez para producir un embedding; luego un decoder liviano toma prompts (puntos) y devuelve máscaras.'
          : 'The live method is Segment Anything (SAM): a promptable foundation model that produces zero-shot instance masks, with no domain training labels, exactly what froth needs because labelled data is scarce. The image passes through a heavy encoder ONCE to produce an embedding; a lightweight decoder then takes prompts (points) and returns masks.'}
      </p>
      <Refs ids={['kirillov2023']} label="Refs" />
      <p>
        {es
          ? 'Para correr en el navegador usamos una variante destilada y podada, SlimSAM (o MobileSAM), que reemplaza el encoder ViT-H de 637M por un Tiny-ViT de pocos millones de parámetros, corriendo sobre onnxruntime-web con WebGPU (respaldo WASM-SIMD). El mismo modelo corre en Node para el benchmark offline.'
          : 'To run in the browser we use a distilled, pruned variant, SlimSAM (or MobileSAM), which replaces the 637M ViT-H encoder with a few-million-parameter Tiny-ViT, running on onnxruntime-web with WebGPU (WASM-SIMD fallback). The same model runs in Node for the offline benchmark.'}
      </p>
      <Refs ids={['chen2023slimsam', 'zhang2023mobilesam', 'transformersjs', 'webgpu']} label="Refs" />
    </>
  );
}

function Auto({ es }: { es: boolean }) {
  return (
    <>
      <p>
        {es
          ? 'Sin prompts del usuario, generamos máscaras automáticamente (el SamAutomaticMaskGenerator): una grilla densa de puntos-prompt de primer plano barre la imagen. Por cada punto el decoder devuelve 3 máscaras candidatas con una IoU predicha; tomamos la de mayor IoU predicha.'
          : 'With no user prompts, we generate masks automatically (the SamAutomaticMaskGenerator): a dense grid of foreground point prompts sweeps the image. For each point the decoder returns 3 candidate masks with a predicted IoU; we take the highest predicted-IoU one.'}
      </p>
      <p>
        {es ? 'Cada máscara candidata recibe un score de estabilidad: la IoU entre la máscara umbralizada en el logit +δ y en −δ. Una máscara estable apenas cambia al mover el umbral.' : 'Each candidate gets a stability score: the IoU between the mask thresholded at logit +δ and at −δ. A stable mask barely changes as the threshold moves.'}
      </p>
      <Equation tex={String.raw`\mathrm{stability} = \frac{\bigl|\{\, \ell(p) > +\delta \,\}\bigr|}{\bigl|\{\, \ell(p) > -\delta \,\}\bigr|}, \qquad \delta = 1.0`} caption={es ? 'estabilidad = IoU de la máscara umbralizada en ±δ (el conjunto alto es subconjunto del bajo)' : 'stability = IoU of the mask thresholded at ±δ (the high set is a subset of the low set)'} />
      <p>
        {es
          ? 'Filtramos por IoU predicha ≥ 0.86, estabilidad ≥ 0.90 y área mínima; luego una supresión no-máxima voraz por IoU elimina duplicados (varios puntos caen en la misma burbuja), dejando un mapa de instancias disjunto. Los umbrales y la densidad de grilla son controles en vivo.'
          : 'We filter on predicted IoU ≥ 0.86, stability ≥ 0.90 and a minimum area; then a greedy IoU non-maximum suppression removes duplicates (many points land on the same bubble), leaving a disjoint instance map. The thresholds and grid density are live controls.'}
      </p>
      <Refs ids={['kirillov2023']} label="Refs" />
    </>
  );
}

function Floor({ es }: { es: boolean }) {
  return (
    <>
      <p>
        {es
          ? 'El piso clásico es la referencia transparente y citada que el modelo fundacional debe superar. Tres métodos, todos en scikit-image, nunca reimplementados a mano:'
          : 'The classical floor is the transparent, cited reference the foundation model must beat. Three methods, all in scikit-image, never hand-rolled:'}
      </p>
      <ul>
        <li>{es ? 'Watershed por transformada de distancia (Meyer): primer plano por Otsu, transformada de distancia euclidiana exacta, marcadores en sus máximos, watershed controlado por marcadores. El piso genérico.' : 'Distance-transform watershed (Meyer): Otsu foreground, exact Euclidean distance transform, markers at its maxima, marker-controlled watershed. The generic floor.'}</li>
        <li>{es ? 'Watershed sembrado por realce: los brillos especulares (h-máximos) son los marcadores, el truco industrial clásico. Falla bajo brillo intenso, cuantificado.' : 'Highlight-seeded watershed: the specular highlights (h-maxima) are the markers, the classic industrial trick. Fails under heavy glare, quantified.'}</li>
        <li>{es ? 'SLIC + fusión: superpíxeles SLIC fusionados por intensidad media, textura-consciente.' : 'SLIC + merge: SLIC superpixels merged by mean intensity, texture-aware.'}</li>
      </ul>
      <Refs ids={['meyer1994', 'vincent1991', 'achanta2012slic']} label="Refs" />
    </>
  );
}

function Bsd({ es }: { es: boolean }) {
  return (
    <>
      <p>
        {es ? 'De cada máscara de instancia obtenemos su área en píxeles y su diámetro equivalente (el diámetro del círculo de igual área):' : 'From each instance mask we get its pixel area and its equivalent diameter (the diameter of the circle of equal area):'}
      </p>
      <Equation tex={String.raw`d_{\mathrm{eq}} = 2\sqrt{A/\pi}`} />
      <p>{es ? 'La distribución de tamaño de burbuja se resume por percentiles D10/D50/D90 y por la media de Sauter d32, la media ponderada por superficie, el resumen estándar en flotación:' : 'The bubble-size distribution is summarised by the D10/D50/D90 percentiles and by the Sauter mean d32, the surface-weighted mean, the standard flotation summary:'}</p>
      <Equation tex={String.raw`d_{32} = \frac{\sum_i d_i^{\,3}}{\sum_i d_i^{\,2}}`} caption={es ? 'media de Sauter (ponderada por superficie)' : 'Sauter mean (surface-weighted)'} />
      <p>
        {es ? 'La morfometría por burbuja (excentricidad, solidez) viene de skimage.regionprops. La misma reducción BSD corre en vivo en el navegador y offline en Python, así que los números coinciden.' : 'Per-bubble morphometry (eccentricity, solidity) comes from skimage.regionprops. The same BSD reduction runs live in the browser and offline in Python, so the numbers match.'}
        {' '}<InlineMath tex={String.raw`d_{32}`} /> {es ? 'grande + pocas burbujas indica espuma gruesa/colapsante;' : 'large + few bubbles indicates coarse/collapsing froth;'} <InlineMath tex={String.raw`d_{32}`} /> {es ? 'pequeño + muchas indica espuma fina y estable.' : 'small + many indicates fine, stable froth.'}
      </p>
      <Refs ids={['aldrich2010', 'sauter1928']} label="Refs" />
    </>
  );
}

function Synth({ es }: { es: boolean }) {
  return (
    <>
      <p>
        {es
          ? 'Como no hay máscaras de espuma públicas por burbuja, generamos espuma sintética cuya verdad de terreno es exacta por construcción, en el mismo formato que consume un cargador real (PNG + máscaras COCO-RLE + BSD). Es SOLO el banco de validación, no el producto.'
          : 'Because there are no public per-bubble froth masks, we generate synthetic froth whose ground truth is exact by construction, in the same format a real loader consumes (PNG + COCO-RLE masks + BSD). It is ONLY the validation harness, not the product.'}
      </p>
      <p>
        {es ? 'La geometría es un diagrama de potencia (Laguerre), el modelo estándar de espuma seca (leyes de Plateau): centros empacados con radios log-normales para controlar d32, y cada píxel se asigna al sitio de mínima distancia de potencia:' : 'The geometry is a power (Laguerre) diagram, the standard dry-foam model (Plateau laws): centres packed with log-normal radii to control d32, and each pixel is assigned to the site of minimum power distance:'}
      </p>
      <Equation tex={String.raw`\mathrm{cell}(p) = \arg\min_i \bigl(\,\lVert p - c_i \rVert^2 - r_i^2\,\bigr)`} caption={es ? 'distancia de potencia (Laguerre): las celdas se encuentran en bordes de Plateau curvos' : 'power (Laguerre) distance: cells meet at curved Plateau borders'} />
      <p>
        {es ? 'La apariencia añade oscurecimiento de bordes por transformada de distancia exacta, realces especulares deliberadamente perturbados (para que el watershed sembrado por realce no gane artificialmente) y estresores por caso: brillo, desenfoque de movimiento, desenfoque, ruido.' : 'Appearance adds distance-transform border darkening, deliberately jittered specular highlights (so highlight-seeded watershed cannot win artificially), and per-case stressors: glare, motion blur, defocus, noise.'}
      </p>
      <Refs ids={['weaire1999foams', 'aurenhammer1987']} label="Refs" />
    </>
  );
}

function Score({ es }: { es: boolean }) {
  return (
    <>
      <p>
        {es ? 'SAM y el piso clásico se puntúan con las MISMAS métricas sobre la espuma sintética con máscaras exactas, así la comparación es justa. Precisión media de máscara de instancia con emparejamiento voraz por IoU sobre umbrales de 0.5 a 0.95:' : 'SAM and the classical floor are scored with the SAME metrics on synthetic froth with exact masks, so the comparison is fair. Mean instance mask precision with greedy IoU matching over thresholds 0.5 to 0.95:'}
      </p>
      <Equation tex={String.raw`\mathrm{IoU}(A,B) = \frac{|A \cap B|}{|A \cup B|}, \qquad \mathrm{AP} = \frac{1}{|\mathcal{T}|}\sum_{t \in \mathcal{T}} \frac{\mathrm{TP}(t)}{\mathrm{TP}(t) + \mathrm{FP}(t) + \mathrm{FN}(t)}, \quad \mathcal{T} = \{0.5, 0.55, \dots, 0.95\}`} />
      <p>{es ? 'La fidelidad de la distribución se mide con la distancia Wasserstein-1 entre los diámetros predichos y los verdaderos (0 = perfecto):' : 'Distribution fidelity is the Wasserstein-1 distance between predicted and true diameters (0 = perfect):'}</p>
      <Equation tex={String.raw`W_1(P, Q) = \int_{-\infty}^{\infty} \bigl| F_P(x) - F_Q(x) \bigr|\, dx`} caption={es ? 'distancia Wasserstein-1 entre las BSD (fidelidad de distribución)' : 'Wasserstein-1 distance between the BSDs (distribution fidelity)'} />
      <p className="fs-note good">
        {es ? 'El AP sintético mide el método contra verdad conocida en un banco controlado; no es exactitud de planta real. Los resultados por caso están en Experiments y Benchmark.' : 'Synthetic AP measures the method against known truth on a controlled harness; it is not real-plant accuracy. Per-case results are in Experiments and Benchmark.'}
      </p>
      <Refs ids={['lin2014coco']} label="Refs" />
    </>
  );
}
