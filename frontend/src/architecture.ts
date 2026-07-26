import type { ArchitectureConfig } from '@fasl-work/caos-app-shell';

export const architecture: ArchitectureConfig = {
  tabs: [
    {
      id: 'product',
      en: 'The product',
      es: 'El producto',
      svg: 'svg/tech/01-the-app.svg',
      body_en:
        'FrothSeg is an offline-first instance-segmentation system. Its reproducible workflow covers data generation, leakage-resistant splits, classical algorithms, GPU training, official foundation-model inference, calibration, evaluation, export, and temporal analysis.\n\nThe website replays all 15 offline methods across 13 canonical cases and offers four upload-only interactive methods.',
      body_es:
        'FrothSeg es un sistema offline-first de segmentación de instancias. Su flujo reproducible cubre generación de datos, splits sin fuga, algoritmos clásicos, entrenamiento GPU, inferencia con modelos fundacionales, calibración, evaluación, exportación y análisis temporal.\n\nLa web reproduce los 15 métodos offline en 13 casos canónicos y ofrece cuatro métodos interactivos solo para cargas.',
    },
    {
      id: 'methods',
      en: 'Method ladder',
      es: 'Escalera de métodos',
      svg: 'svg/tech/04-the-science.svg',
      body_en:
        'The registry contains 15 implemented offline methods. C1-C7 are classical. L1-L4 and L6 are trained for the task. L5 Cellpose-SAM and L7 SAM2.1 use official foundation implementations. N1 LamellaStar is an evaluated research model.\n\nCellpose-SAM leads the controlled held-out test at AP 0.5099. A preregistered LamellaStar ablation improved N1 to AP 0.4717 and cleared the AP 0.30 comparison threshold, but did not exceed the leader.',
      body_es:
        'El registro contiene 15 métodos offline implementados. C1-C7 son clásicos. L1-L4 y L6 se entrenan para la tarea. L5 Cellpose-SAM y L7 SAM2.1 usan implementaciones fundacionales oficiales. N1 LamellaStar es un modelo de investigación evaluado.\n\nCellpose-SAM lidera el test controlado retenido con AP 0,5099. Una ablación preregistrada mejoró LamellaStar a AP 0,4717 y superó el umbral comparativo AP 0,30, pero no superó al líder.',
    },
    {
      id: 'flow',
      en: 'Data flow',
      es: 'Flujo de datos',
      svg: 'svg/tech/03-web-flow.svg',
      body_en:
        'Exact synthetic geometry and independent appearance variants are grouped before splitting. Training, validation, calibration, and untouched test never share a latent geometry group. Models are trained or loaded from official checkpoints, calibrated without test access, evaluated once, and exported with provenance.\n\nA dedicated showcase stage converts all 15 methods by 13 canonical cases into 195 checked label and preview pairs for the ten-view workbench.',
      body_es:
        'La geometría sintética exacta y las variantes de apariencia independientes se agrupan antes del split. Entrenamiento, validación, calibración y test no utilizado durante el ajuste nunca comparten un grupo geométrico latente. Los modelos se entrenan o cargan desde checkpoints oficiales, se calibran sin acceso al test, se evalúan una vez y se exportan con procedencia.\n\nUna etapa específica genera 195 pares verificados de etiquetas y vistas previas, correspondientes a 15 métodos por 13 casos canónicos, para las diez vistas del área de análisis.',
    },
    {
      id: 'lanes',
      en: 'Compute placement',
      es: 'Ubicación del cómputo',
      svg: 'svg/tech/02-lanes.svg',
      body_en:
        'Offline compute is mandatory for data generation, training, official research runtimes, full evaluation, temporal sweeps, and export. Replay serves checked results for every method and canonical case. Upload interaction is limited to cross-checked browser implementations of C1, C3, and C4 plus SlimSAM.\n\nC2, C5, C6, C7, and every learned or foundation-model result remain offline. The browser never retrains or recomputes the benchmark.',
      body_es:
        'El cómputo offline es obligatorio para generación de datos, entrenamiento, runtimes oficiales, evaluación completa, barridos temporales y exportación. La reproducción sirve resultados verificados para cada método y caso canónico. La interacción con cargas se limita a C1, C3 y C4 validados por paridad, más SlimSAM legado.\n\nC2, C5, C6, C7 y todos los resultados aprendidos o fundacionales permanecen offline. El navegador nunca reentrena ni recalcula el benchmark.',
    },
    {
      id: 'contracts',
      en: 'Contracts',
      es: 'Contratos',
      svg: 'svg/tech/05-data-contracts.svg',
      body_en:
        'The ingestion schema validates real images. Artifact records preserve format, byte size, and SHA-256. Model manifests add dataset checksum, split, seed, environment, device, checkpoint lineage, calibration, metrics, and parity. The release report also records all 15 methods, temporal evidence, and the 195-pair showcase manifest.\n\nSynthetic AP is controlled-benchmark evidence, never plant accuracy.',
      body_es:
        'El esquema de ingesta valida imágenes reales. Los registros de artefactos conservan formato, tamaño y SHA-256. Los manifiestos de modelos agregan checksum del dataset, split, semilla, entorno, dispositivo, linaje del checkpoint, calibración, métricas y paridad. El informe de versión también registra los 15 métodos, la evidencia temporal y el manifiesto de 195 pares.\n\nEl AP sintético es evidencia controlada, nunca exactitud de planta.',
    },
  ],
};
