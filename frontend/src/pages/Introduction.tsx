import { Refs, useShellLang } from '@fasl-work/caos-app-shell';

export default function Introduction() {
  const es = useShellLang() === 'es';
  return (
    <div className="page-body prose">
      <div className="page-head">
        <span className="eyebrow">{es ? 'Producto científico offline-first' : 'Offline-first scientific product'}</span>
        <h1>{es ? 'Segmentación de espuma, de datos a evidencia' : 'Froth segmentation, from data to evidence'}</h1>
        <p className="lede">
          {es
            ? 'FrothSeg contiene el ciclo completo de datos, entrenamiento, inferencia, evaluación y exportación. Esta web es su superficie complementaria para explorar casos y resultados.'
            : 'FrothSeg contains the complete data, training, inference, evaluation, and export lifecycle. This website is its companion surface for exploring cases and results.'}
        </p>
      </div>

      <section>
        <h2>{es ? 'La espuma como señal de proceso' : 'Froth as a process signal'}</h2>
        <p>
          {es
            ? 'La distribución de tamaño de burbuja, la estabilidad y la textura de la espuma responden a aireación, reactivos, carga y estado metalúrgico. Convertir imágenes en máscaras por burbuja permite medir D10, D50, D90 y la media de Sauter d32 de forma continua.'
            : 'Bubble-size distribution, stability, and froth texture respond to aeration, reagents, loading, and metallurgical state. Converting images into per-bubble masks enables continuous D10, D50, D90, and Sauter d32 measurement.'}
        </p>
        <Refs ids={['aldrich2010', 'wang2018', 'fu2019']} label="Refs" />
      </section>

      <section>
        <h2>{es ? 'Por qué la segmentación es difícil' : 'Why segmentation is difficult'}</h2>
        <ul>
          <li>{es ? 'Las burbujas se tocan y sus lamelas tienen bajo contraste.' : 'Bubbles touch and their lamellae have low contrast.'}</li>
          <li>{es ? 'Brillo, movimiento, desenfoque y carga cambian la apariencia.' : 'Glare, motion, defocus, and loading change appearance.'}</li>
          <li>{es ? 'Las escalas varían desde nubes de microburbujas hasta espuma gruesa.' : 'Scale ranges from microbubble clouds to coarse froth.'}</li>
          <li>{es ? 'Los datos industriales con máscaras por burbuja casi nunca son redistribuibles.' : 'Industrial data with per-bubble masks is rarely redistributable.'}</li>
        </ul>
      </section>

      <section>
        <h2>{es ? 'Qué implementa el repositorio' : 'What the repository implements'}</h2>
        <p>
          {es
            ? 'Siete métodos clásicos, siete métodos aprendidos o fundacionales y un experimento de frontera comparten contratos de datos y métricas. Los modelos entrenables tienen pipelines GPU, calibración separada, prueba intocable, inferencia por lotes y exportación. Cellpose-SAM lidera hoy; LamellaStar no superó la referencia y se conserva como resultado negativo.'
            : 'Seven classical methods, seven learned or foundation methods, and one frontier experiment share data contracts and metrics. Trainable models have GPU pipelines, separate calibration, an untouched test, batch inference, and export. Cellpose-SAM currently leads; LamellaStar did not beat the reference and is retained as a negative result.'}
        </p>
        <p className="fs-note good">
          {es
            ? 'Los AP publicados son de un entorno sintético controlado con verdad exacta, no exactitud de planta. La web no vuelve a entrenar ni recalcula la comparación.'
            : 'Published AP values come from a controlled synthetic harness with exact truth, not plant accuracy. The website does not retrain or recompute the comparison.'}
        </p>
      </section>
    </div>
  );
}
