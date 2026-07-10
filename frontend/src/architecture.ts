// In-app Architecture / "How it works" modal config (ADR-0058) for FrothSeg. Passed to
// <AppShell config={{ ...config, architecture }}>. The header ⓘ button opens the modal; each tab pairs a
// hand-authored THEMED SVG (frontend/public/svg/tech/, shell CSS-var tokens -> repaints with the theme) with a
// bilingual EN/ES body.
import type { ArchitectureConfig } from '@fasl-work/caos-app-shell';

export const architecture: ArchitectureConfig = {
  tabs: [
    {
      id: 'app',
      en: 'The app',
      es: 'La app',
      svg: 'svg/tech/01-the-app.svg',
      body_en:
        'FrothSeg segments the bubbles in a flotation-froth image and reports the bubble-size distribution (BSD) and ' +
        'froth state, entirely in the browser. You give it a frame (upload a real froth photo, or pick a synthetic ' +
        'sample) and it returns the per-bubble instance masks, the size distribution (D10/D50/D90, the Sauter mean ' +
        'd32) and a froth-state read-out.\n\n' +
        'It is a real workbench, not a demo. The segmenter genuinely runs on the frame you provide; nothing on the ' +
        'live path is pre-baked. A CONTRACT-1 gate validates the frame (size, contrast, glare) and a lightweight ' +
        'illumination-flatten + deglare front-end normalises real glare before the model sees it.',
      body_es:
        'FrothSeg segmenta las burbujas de una imagen de espuma de flotación y reporta la distribución de tamaño de ' +
        'burbuja (BSD) y el estado de la espuma, completamente en el navegador. Le entregas un cuadro (subes una foto ' +
        'real de espuma, o eliges una muestra sintética) y devuelve las máscaras por burbuja, la distribución de ' +
        'tamaño (D10/D50/D90, la media de Sauter d32) y una lectura del estado de la espuma.\n\n' +
        'Es un banco de trabajo real, no un demo. El segmentador corre de verdad sobre el cuadro que entregas; nada ' +
        'en la ruta en vivo está pre-horneado. Un gate CONTRACT-1 valida el cuadro (tamaño, contraste, brillo) y un ' +
        'front-end liviano de aplanado de iluminación + de-brillo normaliza el brillo real antes del modelo.',
    },
    {
      id: 'science',
      en: 'The method',
      es: 'El método',
      svg: 'svg/tech/04-the-science.svg',
      body_en:
        'The live method is a SAM-family foundation model (SlimSAM/MobileSAM) run as an automatic mask generator, ' +
        'zero-shot, with NO froth training labels. The image is encoded once; a dense grid of point prompts is ' +
        'decoded to candidate masks; each is scored by the model\'s predicted IoU and a stability score (the IoU of ' +
        'the mask thresholded at +/- an offset); confident, stable masks survive; greedy IoU NMS removes duplicates, ' +
        'leaving a clean instance-label map.\n\n' +
        'A classical floor (marker-controlled watershed + SLIC, scikit-image) runs alongside as the cited, ' +
        'transparent baseline. Both are scored with the SAME metrics on synthetic froth that has exact masks: ' +
        'instance mask AP@[.5:.95] and the BSD Wasserstein-1 distance. Synthetic AP is a controlled benchmark, never ' +
        'reported as real-plant accuracy.',
      body_es:
        'El método en vivo es un modelo fundacional de la familia SAM (SlimSAM/MobileSAM) usado como generador ' +
        'automático de máscaras, zero-shot, SIN etiquetas de entrenamiento de espuma. La imagen se codifica una vez; ' +
        'una grilla densa de puntos-prompt se decodifica a máscaras candidatas; cada una se puntúa por la IoU ' +
        'predicha del modelo y un score de estabilidad (la IoU de la máscara umbralizada en +/- un offset); ' +
        'sobreviven las máscaras confiables y estables; una NMS voraz por IoU elimina duplicados, dejando un mapa de ' +
        'instancias limpio.\n\n' +
        'Un piso clásico (watershed controlado por marcadores + SLIC, scikit-image) corre en paralelo como la ' +
        'referencia citada y transparente. Ambos se puntúan con las MISMAS métricas sobre espuma sintética con ' +
        'máscaras exactas: AP de máscara de instancia @[.5:.95] y la distancia Wasserstein-1 de la BSD. El AP ' +
        'sintético es un benchmark controlado, nunca reportado como exactitud de planta real.',
    },
    {
      id: 'lanes',
      en: 'Live vs precompute',
      es: 'Vivo vs precómputo',
      svg: 'svg/tech/02-lanes.svg',
      body_en:
        'Two lanes. The LIVE lane is the browser SAM segmenter (onnxruntime-web + WebGPU, WASM-SIMD fallback): the ' +
        'model is fetched once from the Hugging Face hub and cached; inference runs client-side on your frame. The ' +
        'PRECOMPUTE lane is the offline benchmark: the synthetic cases and the classical-floor scores are baked by ' +
        'the Python pipeline (scikit-image/OpenCV, not Pyodide-safe) and committed as artifacts the web just reads.\n\n' +
        'The lane split is a measurement, recorded in each case manifest, not a hand-wave: the synthetic benchmark is ' +
        'precompute; the SAM segmentation is live in JS.',
      body_es:
        'Dos vías. La vía EN VIVO es el segmentador SAM del navegador (onnxruntime-web + WebGPU, con respaldo ' +
        'WASM-SIMD): el modelo se descarga una vez desde el hub de Hugging Face y se cachea; la inferencia corre en ' +
        'el cliente sobre tu cuadro. La vía de PRECÓMPUTO es el benchmark offline: los casos sintéticos y los ' +
        'puntajes del piso clásico se hornean con el pipeline de Python (scikit-image/OpenCV, no aptos para Pyodide) ' +
        'y se commitean como artefactos que la web solo lee.\n\n' +
        'La división de vías es una medición, registrada en cada manifiesto de caso, no una suposición: el benchmark ' +
        'sintético es precómputo; la segmentación SAM es en vivo en JS.',
    },
    {
      id: 'contracts',
      en: 'Data contracts',
      es: 'Contratos de datos',
      svg: 'svg/tech/05-data-contracts.svg',
      body_en:
        'Two data contracts bound the product. CONTRACT 1 (ingestion) is the bring-your-own-froth gate: a frame is ' +
        'accepted only if it is a real, usable image (size, dynamic range), rejected with a reason otherwise, and ' +
        'flagged (glare, low contrast, under-exposure) so the front-end and the UI react. CONTRACT 2 (artifact) is ' +
        'the committed record: each synthetic case ships frame.png, COCO-RLE masks, a BSD CSV, the benchmark and a ' +
        'manifest carrying every artifact\'s sha256, re-verified in CI so a silent drift fails the build.',
      body_es:
        'Dos contratos de datos acotan el producto. CONTRACT 1 (ingesta) es el gate de trae-tu-propia-espuma: un ' +
        'cuadro se acepta solo si es una imagen real y usable (tamaño, rango dinámico), se rechaza con una razón en ' +
        'caso contrario, y se marca (brillo, bajo contraste, subexposición) para que el front-end y la UI ' +
        'reaccionen. CONTRACT 2 (artefacto) es el registro commiteado: cada caso sintético incluye frame.png, ' +
        'máscaras COCO-RLE, un CSV de BSD, el benchmark y un manifiesto con el sha256 de cada artefacto, ' +
        're-verificado en CI para que una deriva silenciosa rompa el build.',
    },
    {
      id: 'flow',
      en: 'Web flow',
      es: 'Flujo web',
      svg: 'svg/tech/03-web-flow.svg',
      body_en:
        'The six pages: the App (the live workbench), Introduction, Methodology (the SAM auto-mask generator + the ' +
        'classical floor, with the real maths in KaTeX), Implementation (the stack + contracts + lanes), Experiments ' +
        '(SAM vs floor across the coverage cases) and Benchmark (the committed offline sweep). The App reacts to its ' +
        'source selector and live controls; the doc pages transcribe the persisted research, not memory.',
      body_es:
        'Las seis páginas: la App (el banco en vivo), Introduction, Methodology (el generador automático de máscaras ' +
        'SAM + el piso clásico, con la matemática real en KaTeX), Implementation (el stack + contratos + vías), ' +
        'Experiments (SAM vs piso a lo largo de los casos de cobertura) y Benchmark (el barrido offline commiteado). ' +
        'La App reacciona a su selector de fuente y controles en vivo; las páginas de documentación transcriben la ' +
        'investigación persistida, no la memoria.',
    },
  ],
};
