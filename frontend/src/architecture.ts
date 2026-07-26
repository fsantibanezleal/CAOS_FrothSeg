import type { ArchitectureConfig } from '@fasl-work/caos-app-shell';

export const architecture: ArchitectureConfig = {
  tabs: [
    {
      id: 'product',
      en: 'The product',
      es: 'El producto',
      svg: 'svg/tech/01-the-app.svg',
      body_en:
        'FrothSeg is a complete offline-first scientific repository, not a browser demo. It owns data generation, leakage-resistant splits, classical algorithms, GPU training, official foundation-model inference, calibration, evaluation, export, temporal analysis, and release evidence.\n\nThe website is the companion surface: it replays selected evidence and offers bounded single-frame interaction.',
      body_es:
        'FrothSeg es un repositorio científico completo y offline-first, no una demo de navegador. Contiene generación de datos, splits sin fuga, algoritmos clásicos, entrenamiento GPU, inferencia fundacional oficial, calibración, evaluación, exportación, análisis temporal y evidencia de release.\n\nLa web es la superficie complementaria: reproduce evidencia seleccionada y ofrece interacción acotada sobre un cuadro.',
    },
    {
      id: 'methods',
      en: 'Method ladder',
      es: 'Escalera de métodos',
      svg: 'svg/tech/04-the-science.svg',
      body_en:
        'The registry contains 15 implemented methods. C1-C7 are classical. L1-L4 and L6 are domain-learned. L5 Cellpose-SAM and L7 SAM2.1 are official foundation integrations. N1 LamellaStar is a completed frontier experiment.\n\nCellpose-SAM leads the untouched test. LamellaStar failed its hypothesis, so FrothSeg makes no beyond-SOTA claim.',
      body_es:
        'El registro contiene 15 métodos implementados. C1-C7 son clásicos. L1-L4 y L6 son aprendidos del dominio. L5 Cellpose-SAM y L7 SAM2.1 son integraciones fundacionales oficiales. N1 LamellaStar es un experimento de frontera completo.\n\nCellpose-SAM lidera el test intocable. LamellaStar falló su hipótesis, por lo que FrothSeg no declara beyond SOTA.',
    },
    {
      id: 'flow',
      en: 'Data flow',
      es: 'Flujo de datos',
      svg: 'svg/tech/03-web-flow.svg',
      body_en:
        'Exact synthetic geometry and independent appearance variants are grouped before splitting. Training, validation, calibration, and untouched test never share a latent geometry group. Models are trained or loaded from official checkpoints, calibrated without test access, evaluated once, and exported with provenance.\n\nThe 13 canonical cases are a separate diagnostic suite for readable failure analysis.',
      body_es:
        'La geometría sintética exacta y las variantes de apariencia independientes se agrupan antes del split. Train, validación, calibración y test intocable nunca comparten un grupo geométrico latente. Los modelos se entrenan o cargan desde checkpoints oficiales, se calibran sin acceso a test, se evalúan una vez y se exportan con procedencia.\n\nLos 13 casos canónicos son un diagnóstico separado para analizar fallas.',
    },
    {
      id: 'lanes',
      en: 'Compute lanes',
      es: 'Vías de cómputo',
      svg: 'svg/tech/02-lanes.svg',
      body_en:
        'Offline is mandatory for data generation, training, official research runtimes, full evaluation, temporal sweeps, and export. Replay serves compact versioned results. Live interaction is limited to seven TypeScript classical methods and legacy SlimSAM.\n\nThe browser never retrains or recomputes the benchmark.',
      body_es:
        'Offline es obligatorio para generación de datos, entrenamiento, runtimes oficiales, evaluación completa, barridos temporales y exportación. Replay sirve resultados compactos versionados. La interacción en vivo se limita a siete clásicos TypeScript y SlimSAM legado.\n\nEl navegador nunca reentrena ni recalcula el benchmark.',
    },
    {
      id: 'contracts',
      en: 'Contracts',
      es: 'Contratos',
      svg: 'svg/tech/05-data-contracts.svg',
      body_en:
        'The ingestion contract validates real images. The artifact contract records formats, byte sizes, and SHA-256. Model run manifests add dataset checksum, split, seed, environment, device, checkpoint lineage, calibration, metrics, and parity. The release gate requires all 15 methods plus temporal evidence.\n\nSynthetic AP is controlled-benchmark evidence, never plant accuracy.',
      body_es:
        'El contrato de ingesta valida imágenes reales. El contrato de artefactos registra formatos, tamaños y SHA-256. Los manifiestos de modelos agregan checksum del dataset, split, semilla, entorno, dispositivo, linaje del checkpoint, calibración, métricas y paridad. El gate de release exige los 15 métodos y evidencia temporal.\n\nEl AP sintético es evidencia controlada, nunca exactitud de planta.',
    },
  ],
};
