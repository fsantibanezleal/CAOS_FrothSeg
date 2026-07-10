import { Refs, useShellLang } from '@fasl-work/caos-app-shell';

export default function Introduction() {
  const es = useShellLang() === 'es';
  return (
    <div className="page-body prose">
      <div className="page-head">
        <h1>{es ? 'Introducción' : 'Introduction'}</h1>
        <p className="lede">
          {es
            ? 'Por qué el tamaño de burbuja de la espuma importa en flotación, por qué segmentarla es difícil, y qué hace FrothSeg: un segmentador fundacional zero-shot que corre en el navegador sobre espuma real.'
            : 'Why froth bubble size matters in flotation, why segmenting it is hard, and what FrothSeg does: a zero-shot foundation segmenter that runs in the browser on real froth.'}
        </p>
      </div>

      <section>
        <h2>{es ? 'La espuma es el sensor' : 'The froth is the sensor'}</h2>
        <p>
          {es
            ? 'En una celda de flotación, las partículas de mineral valioso se adhieren a burbujas de aire y suben a una capa de espuma que rebalsa como concentrado. La apariencia de esa espuma, sobre todo la distribución de tamaño de burbuja (BSD), es un indicador operacional directo: espuma fina y estable suele significar buena recuperación; espuma gruesa que colapsa suele significar sobre-espumado o poco espumante. Los operadores llevan décadas leyendo la espuma a ojo; la visión por computador lo hace cuantitativo y continuo.'
            : 'In a flotation cell, valuable mineral particles attach to air bubbles and rise into a froth layer that overflows as concentrate. The appearance of that froth, above all the bubble-size distribution (BSD), is a direct operational indicator: a fine, stable froth usually means good recovery; a coarse, collapsing froth usually means over-frothing or low frother. Operators have read the froth by eye for decades; machine vision makes it quantitative and continuous.'}
        </p>
        <p>
          {es
            ? 'La BSD (D10/D50/D90 y la media de Sauter d32) y la clase de espuma son sensores blandos bien establecidos para el estado de flotación.'
            : 'The BSD (D10/D50/D90 and the Sauter mean d32) and the froth class are well-established soft sensors for the flotation state.'}
        </p>
        <Refs ids={['aldrich2010', 'wang2016', 'fu2019']} label="Refs" />
      </section>

      <section>
        <h2>{es ? 'Por qué es difícil' : 'Why it is hard'}</h2>
        <ul>
          <li>{es ? 'Las burbujas se tocan y se solapan; los bordes (bordes de Plateau) son delgados y de bajo contraste.' : 'Bubbles touch and overlap; the borders (Plateau borders) are thin and low-contrast.'}</li>
          <li>{es ? 'El brillo especular de la iluminación satura los topes de las burbujas y engaña a los métodos sembrados por realce.' : 'Specular glare from the lighting saturates bubble tops and fools highlight-seeded methods.'}</li>
          <li>{es ? 'El movimiento de la espuma y el desenfoque emborronan los bordes; la carga cambia el brillo global.' : 'Froth travel and defocus smear borders; the pull changes global brightness.'}</li>
          <li>{es ? 'El mayor bloqueador del campo: casi no hay datos de espuma etiquetados y públicos. Las fotos de espuma industriales rara vez son redistribuibles.' : 'The field\'s biggest blocker: almost no public labelled froth data. Industrial froth photos are rarely redistributable.'}</li>
        </ul>
      </section>

      <section>
        <h2>{es ? 'Qué hace FrothSeg' : 'What FrothSeg does'}</h2>
        <p>
          {es
            ? 'FrothSeg segmenta cada burbuja con un modelo fundacional de la familia SAM (Segment Anything) corrido zero-shot, sin etiquetas de espuma, enteramente en el navegador vía WebGPU. Devuelve las máscaras por burbuja, la BSD y una lectura del estado de la espuma. Como la escasez de datos hace inviable enviar un dataset real etiquetado, la capacidad real es segmentar la espuma que TÚ subes; un generador de espuma sintética con máscaras exactas sirve solo como banco de pruebas para medir el método con métricas de máscara reales.'
            : 'FrothSeg segments every bubble with a SAM-family foundation model (Segment Anything) run zero-shot, with no froth labels, entirely in the browser via WebGPU. It returns per-bubble masks, the BSD and a froth-state read-out. Because data scarcity makes shipping a real labelled dataset infeasible, the real capability is segmenting the froth YOU upload; a synthetic froth generator with exact masks serves only as the benchmark harness to score the method with real mask metrics.'}
        </p>
        <Refs ids={['kirillov2023', 'zhang2023mobilesam', 'chen2023slimsam']} label="Refs" />
        <p className="fs-note good">
          {es
            ? 'Honestidad: el AP sintético es un benchmark controlado, nunca exactitud de planta real. El estado de espuma es un proxy heurístico de la literatura, no un setpoint calibrado.'
            : 'Honesty: synthetic AP is a controlled benchmark, never real-plant accuracy. The froth state is a heuristic proxy from the literature, not a calibrated setpoint.'}
        </p>
      </section>
    </div>
  );
}
