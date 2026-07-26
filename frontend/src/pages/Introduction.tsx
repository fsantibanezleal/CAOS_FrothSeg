import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pause, Play, ScanSearch } from 'lucide-react';
import { Callout, Equation, Refs, useShellLang } from '@fasl-work/caos-app-shell';
import { artifactUrl } from '../api/artifacts';

interface TemporalFrame {
  frame_index: number;
  source_path: string;
  truth_path: string;
  overlay_path: string;
}

interface TemporalSequence {
  case_id: string;
  label: string;
  frames: TemporalFrame[];
}

interface TemporalShowcaseManifest {
  schema: string;
  source_kind: string;
  label_kind: string;
  sequence_count: number;
  frames_per_sequence: number;
  sequences: TemporalSequence[];
}

export default function Introduction() {
  const es = useShellLang() === 'es';
  return (
    <div className="page-body prose fs-intro">
      <header className="fs-intro-hero">
        <div className="fs-intro-copy">
          <span className="eyebrow">{es ? 'Visión computacional para procesos de flotación' : 'Computer vision for flotation processes'}</span>
          <h1>{es ? 'De una superficie de espuma a una señal medible' : 'From a moving froth surface to a measurable process signal'}</h1>
          <p className="lede">
            {es
              ? 'FrothSeg separa cada burbuja, sigue su evolución y convierte la imagen en distribuciones de tamaño, forma, estabilidad y movimiento. El repositorio contiene el flujo reproducible completo; esta interfaz permite examinar sus resultados.'
              : 'FrothSeg separates individual bubbles, follows their evolution, and converts imagery into size, shape, stability, and motion measurements. The repository contains the complete reproducible workflow; this interface makes its evidence explorable.'}
          </p>
          <div className="fs-intro-actions">
            <Link className="fs-primary-link" to="/">{es ? 'Explorar segmentaciones' : 'Explore segmentations'}</Link>
            <Link className="fs-secondary-link" to="/methodology">{es ? 'Leer la metodología' : 'Read the methodology'}</Link>
          </div>
        </div>
        <FrothSignalDiagram es={es} />
      </header>

      <section className="fs-intro-section">
        <div className="fs-section-heading">
          <span className="eyebrow">{es ? 'La cadena de medición' : 'The measurement chain'}</span>
          <h2>{es ? 'La cámara observa textura; el sistema recupera instancias' : 'The camera sees texture; the system recovers instances'}</h2>
          <p>
            {es
              ? 'La espuma refleja el balance entre aire, pulpa, reactivos y carga mineral. Una máscara binaria no basta: cada burbuja debe conservar una identidad separada para medir geometría y cambios en el tiempo.'
              : 'Froth reflects the balance between air, pulp, reagents, and mineral loading. A binary mask is not enough: each bubble must retain a separate identity so geometry and change can be measured over time.'}
          </p>
        </div>
        <ProcessChainDiagram es={es} />
        <Refs ids={['aldrich2010', 'wang2018', 'fu2019']} label="Refs" />
      </section>

      <section className="fs-intro-section">
        <div className="fs-section-heading">
          <span className="eyebrow">{es ? 'El problema visual' : 'The visual problem'}</span>
          <h2>{es ? 'Una frontera física débil bajo condiciones cambiantes' : 'A weak physical boundary under changing conditions'}</h2>
          <p>
            {es
              ? 'Las lamelas pueden desaparecer bajo brillo, desenfoque o movimiento; las burbujas se tocan, se fusionan y se rompen; la escala cambia en órdenes de magnitud. Cada condición induce un modo de error diferente.'
              : 'Lamellae can disappear under glare, defocus, or motion; bubbles touch, merge, and burst; scale changes by orders of magnitude. Each condition creates a different failure mode.'}
          </p>
        </div>
        <ChallengeDiagram es={es} />
        <Refs ids={['wang2003froth', 'jahedsaravani2017', 'aldrich2010']} label="Refs" />
      </section>

      <section className="fs-intro-section">
        <div className="fs-section-heading">
          <span className="eyebrow">{es ? 'Espuma en movimiento' : 'Froth in motion'}</span>
          <h2>{es ? 'Las secuencias revelan lo que una imagen aislada oculta' : 'Sequences reveal what a single frame hides'}</h2>
          <p>
            {es
              ? 'Reproduzca secuencias controladas con identidades persistentes para observar advección, deformación, coalescencia y ruptura. Los cuadros y sus referencias exactas se generan y verifican offline.'
              : 'Replay controlled sequences with persistent identities to inspect advection, deformation, coalescence, and bursting. Frames and their exact references are generated and verified offline.'}
          </p>
        </div>
        <TemporalShowcase es={es} />
        <Refs ids={['ravi2024sam2', 'luiten2021hota']} label="Refs" />
      </section>

      <section className="fs-intro-section fs-measurement-section">
        <div className="fs-section-heading">
          <span className="eyebrow">{es ? 'De máscaras a variables' : 'From masks to variables'}</span>
          <h2>{es ? 'La salida útil no es una imagen coloreada' : 'The useful output is not a colored image'}</h2>
        </div>
        <div className="fs-output-grid">
          <article>
            <strong>D10 · D50 · D90 · d32</strong>
            <p>{es ? 'Distribución equivalente de tamaños y media de Sauter.' : 'Equivalent-size distribution and Sauter mean diameter.'}</p>
          </article>
          <article>
            <strong>{es ? 'Forma y lamela' : 'Shape and lamella'}</strong>
            <p>{es ? 'Área, perímetro, circularidad, elongación y densidad de borde.' : 'Area, perimeter, circularity, elongation, and boundary density.'}</p>
          </article>
          <article>
            <strong>{es ? 'Dinámica' : 'Dynamics'}</strong>
            <p>{es ? 'Cobertura, velocidad, persistencia, fragmentación y eventos.' : 'Coverage, velocity, persistence, fragmentation, and events.'}</p>
          </article>
          <article>
            <strong>{es ? 'Confiabilidad' : 'Reliability'}</strong>
            <p>{es ? 'Calibración, incertidumbre, errores de unión y separación.' : 'Calibration, uncertainty, merge errors, and split errors.'}</p>
          </article>
        </div>
        <div className="fs-equation-grid">
          <article>
            <strong>{es ? 'Diámetro equivalente' : 'Equivalent diameter'}</strong>
            <Equation tex={String.raw`d_i=2\sqrt{A_i/\pi}`} caption={es ? 'Aᵢ es el área segmentada de la burbuja i.' : 'Aᵢ is the segmented area of bubble i.'} />
          </article>
          <article>
            <strong>{es ? 'Media de Sauter' : 'Sauter mean'}</strong>
            <Equation tex={String.raw`d_{32}=\frac{\sum_i d_i^3}{\sum_i d_i^2}`} caption={es ? 'Promedio ponderado por superficie, sensible a burbujas gruesas.' : 'Surface-weighted mean, sensitive to coarse bubbles.'} />
          </article>
          <article>
            <strong>{es ? 'Cobertura' : 'Coverage'}</strong>
            <Equation tex={String.raw`\phi=\frac{1}{|\Omega|}\sum_{x\in\Omega}\mathbf 1[\hat Y(x)>0]`} caption={es ? 'Fracción del campo observada como interior de espuma.' : 'Fraction of the field observed as froth interior.'} />
          </article>
        </div>
        <ul className="fs-symbol-list">
          <li><strong>{es ? 'Aᵢ' : 'Aᵢ'}</strong><span>{es ? 'área de la instancia i' : 'area of instance i'}</span></li>
          <li><strong>dᵢ</strong><span>{es ? 'diámetro circular equivalente' : 'equivalent circular diameter'}</span></li>
          <li><strong>D10 · D50 · D90</strong><span>{es ? 'percentiles de la distribución de tamaños' : 'size-distribution percentiles'}</span></li>
          <li><strong>d32</strong><span>{es ? 'media de Sauter' : 'Sauter mean diameter'}</span></li>
          <li><strong>Ω</strong><span>{es ? 'región válida de medición' : 'valid measurement region'}</span></li>
          <li><strong>Ŷ</strong><span>{es ? 'mapa entero de instancias predichas' : 'predicted integer instance map'}</span></li>
          <li><strong>φ</strong><span>{es ? 'cobertura de espuma' : 'froth coverage'}</span></li>
          <li><strong>IDF1</strong><span>{es ? 'continuidad de identidad temporal' : 'temporal identity continuity'}</span></li>
          <li><strong>HOTA</strong><span>{es ? 'balance de detección y asociación' : 'detection-association balance'}</span></li>
          <li><strong>κ</strong><span>{es ? 'calibración física de cámara en px/mm' : 'physical camera calibration in px/mm'}</span></li>
        </ul>
        <Callout variant="honest" title={es ? 'Qué demuestra y qué no' : 'What this proves and what it does not'}>
          {es
            ? 'Los resultados publicados corresponden a un banco sintético controlado con verdad exacta. Permiten comparar algoritmos y medir sus fallas, pero no representan exactitud en planta. Los datos industriales requieren anotación externa, calibración y validación por dominio.'
            : 'Published results belong to a controlled synthetic benchmark with exact truth. They support algorithm comparison and failure measurement, but do not represent plant accuracy. Industrial data requires external annotation, calibration, and domain-specific validation.'}
        </Callout>
        <Refs ids={['aldrich2010', 'sautermean']} label="Refs" />
      </section>

      <section className="fs-intro-section">
        <div className="fs-section-heading">
          <span className="eyebrow">{es ? 'Contrato de uso' : 'Use contract'}</span>
          <h2>{es ? 'Un resultado útil conserva máscara, medida, identidad y procedencia' : 'A useful result preserves mask, measurement, identity, and provenance'}</h2>
          <p>{es
            ? 'Cada predicción conserva la imagen de origen, el método, su checkpoint o configuración, el mapa entero de instancias, la calibración aplicada, las mediciones derivadas y los hashes de los artefactos. Esta cadena permite revisar una cifra sin confiar en una captura de pantalla.'
            : 'Each prediction preserves its source image, method, checkpoint or configuration, integer instance map, applied calibration, derived measurements, and artifact hashes. This chain makes a number reviewable without trusting a screenshot.'}</p>
          <p>{es
            ? 'En cargas locales, el navegador ofrece solo motores que realmente puede ejecutar y exporta el trabajo para el pipeline científico completo. En casos precalculados, todos los métodos permanecen disponibles mediante resultados generados antes del despliegue.'
            : 'For local uploads, the browser offers only engines it can genuinely execute and exports a job for the complete scientific pipeline. For precomputed cases, every method remains available through results generated before deployment.'}</p>
        </div>
        <Refs ids={['lin2014coco', 'onnxruntimeweb']} label="Refs" />
      </section>
    </div>
  );
}

function FrothSignalDiagram({ es }: { es: boolean }) {
  return (
    <figure className="fs-hero-figure" aria-label={es ? 'Espuma convertida en señal de proceso' : 'Froth converted into a process signal'}>
      <svg viewBox="0 0 720 500" role="img">
        <defs>
          <linearGradient id="hero-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" className="fs-hero-bg-start" />
            <stop offset="1" className="fs-hero-bg-end" />
          </linearGradient>
          <linearGradient id="hero-signal" x1="0" y1="0" x2="1" y2="0">
            <stop className="fs-hero-signal-start" />
            <stop offset="1" className="fs-hero-signal-end" />
          </linearGradient>
          <filter id="hero-glow"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <rect width="720" height="500" rx="28" fill="url(#hero-bg)" />
        <g className="fs-hero-grid">
          {Array.from({ length: 10 }, (_, i) => <path key={i} d={`M0 ${60 + i * 42} H720`} />)}
        </g>
        <g className="fs-hero-bubbles">
          <circle cx="120" cy="115" r="54" /><circle cx="218" cy="94" r="40" /><circle cx="304" cy="128" r="62" />
          <circle cx="88" cy="224" r="46" /><circle cx="180" cy="207" r="53" /><circle cx="277" cy="235" r="43" />
          <circle cx="362" cy="195" r="60" /><circle cx="113" cy="323" r="65" /><circle cx="238" cy="330" r="55" />
          <circle cx="348" cy="313" r="45" /><circle cx="75" cy="420" r="40" /><circle cx="173" cy="427" r="59" />
          <circle cx="292" cy="414" r="51" /><circle cx="389" cy="405" r="43" />
        </g>
        <g fill="none" stroke="url(#hero-signal)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" filter="url(#hero-glow)">
          <path d="M448 382 L486 382 L501 330 L526 425 L550 300 L575 362 L596 232 L620 352 L649 279 L676 279" />
          <circle cx="596" cy="232" r="7" className="fs-signal-pulse fs-signal-dot" />
        </g>
        <g className="fs-hero-metrics" fontFamily="ui-monospace, monospace">
          <text x="455" y="92" fontSize="15" opacity=".7">{es ? 'INSTANCIAS' : 'INSTANCES'}</text>
          <text x="455" y="129" fontSize="34" fontWeight="700">214</text>
          <text x="455" y="179" fontSize="15" opacity=".7">d32</text>
          <text x="455" y="213" fontSize="29" fontWeight="700">3.84 mm</text>
          <text x="455" y="263" fontSize="15" opacity=".7">{es ? 'COBERTURA' : 'COVERAGE'}</text>
          <text x="455" y="297" fontSize="29" fontWeight="700">91.6%</text>
        </g>
        <path d="M417 52 V448" className="fs-hero-divider" />
        <text x="36" y="42" className="fs-hero-label" fontFamily="ui-monospace, monospace" fontSize="13">{es ? 'SUPERFICIE OBSERVADA' : 'OBSERVED SURFACE'}</text>
        <text x="455" y="42" className="fs-hero-label" fontFamily="ui-monospace, monospace" fontSize="13">{es ? 'SEÑAL RECUPERADA' : 'RECOVERED SIGNAL'}</text>
      </svg>
      <figcaption>{es ? 'Contornos por instancia → morfometría → señal temporal' : 'Instance contours → morphometry → temporal signal'}</figcaption>
    </figure>
  );
}

function ProcessChainDiagram({ es }: { es: boolean }) {
  const labels = es
    ? ['Aire · pulpa · reactivos', 'Superficie de espuma', 'Imagen / video', 'Instancias', 'Morfometría', 'Indicadores']
    : ['Air · pulp · reagents', 'Froth surface', 'Image / video', 'Instances', 'Morphometry', 'Indicators'];
  return (
    <figure className="fs-process-figure">
      <svg viewBox="0 0 1100 250" role="img" aria-label={es ? 'Cadena de medición de espuma' : 'Froth measurement chain'}>
        <defs>
          <marker id="chain-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
          </marker>
        </defs>
        <g className="fs-process-arrows" fill="none" stroke="currentColor" strokeWidth="2.5" markerEnd="url(#chain-arrow)">
          <path d="M164 103 H198" /><path d="M345 103 H379" /><path d="M527 103 H561" />
          <path d="M709 103 H743" /><path d="M891 103 H925" />
        </g>
        {labels.map((label, i) => {
          const x = 20 + i * 182;
          return (
            <g key={label} transform={`translate(${x} 28)`}>
              <rect width="145" height="150" rx="18" className="fs-process-node" />
              <ProcessGlyph index={i} />
              <text x="72.5" y="126" textAnchor="middle" className="fs-process-label">{label}</text>
            </g>
          );
        })}
        <text x="550" y="225" textAnchor="middle" className="fs-process-caption">
          {es ? 'La trazabilidad conserva la relación entre cuadro, máscara, medición y resultado' : 'Traceability preserves the relationship between frame, mask, measurement, and result'}
        </text>
      </svg>
    </figure>
  );
}

function ProcessGlyph({ index }: { index: number }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 3 } as const;
  if (index === 0) return <g {...common}><path d="M34 76 Q50 36 72 70 Q91 31 111 76" /><circle cx="49" cy="46" r="8" /><circle cx="88" cy="35" r="6" /></g>;
  if (index === 1) return <g {...common}><circle cx="43" cy="62" r="22" /><circle cx="79" cy="52" r="27" /><circle cx="109" cy="70" r="18" /></g>;
  if (index === 2) return <g {...common}><rect x="28" y="34" width="90" height="64" rx="8" /><circle cx="73" cy="66" r="21" /><path d="M48 34 l9-13 h31 l9 13" /></g>;
  if (index === 3) return <g {...common}><circle cx="44" cy="60" r="25" /><circle cx="85" cy="48" r="20" /><circle cx="101" cy="81" r="17" /><path d="M24 92 H121" /></g>;
  if (index === 4) return <g {...common}><path d="M31 94 H116 M39 94 V62 M58 94 V42 M77 94 V26 M96 94 V54 M115 94 V72" /></g>;
  return <g {...common}><path d="M27 88 L50 63 L70 75 L91 35 L118 47" /><path d="M27 28 V97 H121" /><circle cx="91" cy="35" r="5" fill="currentColor" /></g>;
}

function ChallengeDiagram({ es }: { es: boolean }) {
  const titles = es
    ? ['Contacto', 'Reflejo especular', 'Multiescala', 'Movimiento y eventos']
    : ['Touching', 'Specular glare', 'Multiple scales', 'Motion and events'];
  const notes = es
    ? ['una región, varias instancias', 'la lamela desaparece', '3–80 px en la misma escena', 'la identidad cambia con el tiempo']
    : ['one region, several instances', 'the lamella disappears', '3–80 px in one scene', 'identity changes over time'];
  return (
    <div className="fs-challenge-grid">
      {titles.map((title, i) => (
        <article key={title} className="fs-challenge-card">
          <svg viewBox="0 0 240 142" aria-hidden="true"><ChallengeGlyph index={i} /></svg>
          <strong>{title}</strong>
          <span>{notes[i]}</span>
        </article>
      ))}
    </div>
  );
}

function ChallengeGlyph({ index }: { index: number }) {
  const bubble = { className: 'fs-challenge-bubble' } as const;
  if (index === 0) return <g><circle cx="82" cy="72" r="45" {...bubble} /><circle cx="149" cy="72" r="45" {...bubble} /><path d="M116 29 Q98 72 116 115" className="fs-challenge-alert" strokeDasharray="6 5" /></g>;
  if (index === 1) return <g><circle cx="75" cy="76" r="48" {...bubble} /><circle cx="154" cy="68" r="43" {...bubble} /><ellipse cx="120" cy="47" rx="62" ry="19" className="fs-challenge-glare" /><path d="M86 37 L153 96" className="fs-challenge-alert" /></g>;
  if (index === 2) return <g>{[[45,38,9],[80,35,15],[128,48,28],[188,74,48],[52,100,21],[105,106,12]].map(([x,y,r]) => <circle key={`${x}`} cx={x} cy={y} r={r} {...bubble} />)}</g>;
  return <g><circle cx="52" cy="72" r="27" {...bubble} /><circle cx="121" cy="72" r="36" {...bubble} /><path d="M78 72 H90 M158 72 H184" className="fs-challenge-alert" markerEnd="url(#chain-arrow)" /><path d="M189 48 L221 72 L189 96" className="fs-challenge-flow" /></g>;
}

function TemporalShowcase({ es }: { es: boolean }) {
  const [manifest, setManifest] = useState<TemporalShowcaseManifest | null>(null);
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    fetch(artifactUrl('showcase/temporal/manifest.json'))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<TemporalShowcaseManifest>;
      })
      .then(setManifest)
      .catch(() => setManifest(null));
  }, []);

  const sequence = manifest?.sequences[sequenceIndex] ?? null;
  const frames = sequence?.frames ?? [];
  useEffect(() => {
    if (!playing || frames.length < 2) return undefined;
    const timer = window.setInterval(() => setFrameIndex((value) => (value + 1) % frames.length), 420);
    return () => window.clearInterval(timer);
  }, [playing, frames.length]);

  useEffect(() => setFrameIndex(0), [sequenceIndex]);
  const frame = frames[frameIndex];
  const frameLabel = useMemo(() => `${String(frameIndex + 1).padStart(2, '0')} / ${String(frames.length).padStart(2, '0')}`, [frameIndex, frames.length]);

  if (!manifest || !sequence || !frame) {
    return (
      <div className="fs-temporal-loading">
        <ScanSearch aria-hidden="true" />
        <div>
          <strong>{es ? 'Preparando la reproducción temporal' : 'Preparing temporal replay'}</strong>
          <span>{es ? 'Los artefactos verificados se cargarán desde el paquete offline.' : 'Verified artifacts will load from the offline package.'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fs-temporal-showcase">
      <div className="fs-temporal-stage">
        <img src={artifactUrl(frame.source_path)} alt={es ? `Cuadro ${frameIndex + 1} de ${sequence.label}` : `Frame ${frameIndex + 1} of ${sequence.label}`} />
        <img className="fs-temporal-overlay" src={artifactUrl(frame.overlay_path)} alt="" aria-hidden="true" />
        <div className="fs-temporal-divider" aria-hidden="true" />
        <span className="fs-temporal-side raw">{es ? 'Cuadro' : 'Frame'}</span>
        <span className="fs-temporal-side labels">{es ? 'Instancias exactas' : 'Exact instances'}</span>
        <div className="fs-temporal-stamp"><span>{sequence.label}</span><strong>{frameLabel}</strong></div>
      </div>
      <div className="fs-temporal-controls">
        <button type="button" className="fs-play-button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? (es ? 'Pausar' : 'Pause') : (es ? 'Reproducir' : 'Play')}>
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <input type="range" min={0} max={frames.length - 1} value={frameIndex} onChange={(event) => { setPlaying(false); setFrameIndex(Number(event.target.value)); }} aria-label={es ? 'Cuadro de secuencia' : 'Sequence frame'} />
        <select value={sequenceIndex} onChange={(event) => setSequenceIndex(Number(event.target.value))} aria-label={es ? 'Secuencia' : 'Sequence'}>
          {manifest.sequences.map((item, index) => <option key={item.case_id} value={index}>{item.label}</option>)}
        </select>
      </div>
      <div className="fs-temporal-context">
        <div><strong>{manifest.sequence_count} × {manifest.frames_per_sequence}</strong><span>{es ? 'secuencias × cuadros' : 'sequences × frames'}</span></div>
        <div><strong>{es ? 'IDs exactos' : 'Exact IDs'}</strong><span>{es ? 'referencia persistente' : 'persistent reference'}</span></div>
        <div><strong>{es ? 'Precalculado' : 'Precomputed'}</strong><span>{es ? 'sin cómputo durante la visita' : 'no compute during the visit'}</span></div>
      </div>
      <p className="fs-hint">
        {es
          ? 'Secuencia sintética controlada con referencia de instancia exacta. La superposición coloreada muestra la verdad temporal, no una predicción ni video de planta.'
          : 'Controlled synthetic sequence with exact instance reference. The colored overlay shows temporal ground truth, not a prediction or plant video.'}
      </p>
    </div>
  );
}
