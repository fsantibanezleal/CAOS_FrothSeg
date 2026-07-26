// Fetch the committed CONTRACT-2 artifacts (copied into public/data by copy-data.mjs). The web loads these for
// the baked benchmark + the synthetic samples the App runs bounded live tools on; live inference itself is
// in-browser (src/sam), no backend.
import type { BenchmarkDoc, CaseCard, CaseIndex, CaseManifest, LearnedBenchmarkDoc, MasksDoc, MethodBenchmarkDoc, SamBenchmarkDoc, TemporalBenchmarkDoc } from '../lib/contract.types';
import type { TemporalShowcaseManifest } from '../lib/workbench';

const base = import.meta.env.BASE_URL;

async function getJSON<T>(rel: string): Promise<T> {
  const res = await fetch(`${base}data/${rel}`);
  if (!res.ok) throw new Error(`fetch ${rel}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Absolute (base-aware) URL for an artifact path recorded in a manifest/card (e.g. "synth/poly-normal/frame.png"). */
export const artifactUrl = (relPath: string): string => `${base}data/${relPath}`;

export const loadIndex = (): Promise<CaseIndex> => getJSON<CaseIndex>('manifests/index.json');
export const loadManifest = (caseId: string): Promise<CaseManifest> => getJSON<CaseManifest>(`manifests/${caseId}.json`);
export const loadCard = (caseId: string): Promise<CaseCard> => getJSON<CaseCard>(`synth/${caseId}/card.json`);
export const loadMasks = (caseId: string): Promise<MasksDoc> => getJSON<MasksDoc>(`synth/${caseId}/masks.json`);
export const loadBenchmark = (caseId: string): Promise<BenchmarkDoc> => getJSON<BenchmarkDoc>(`synth/${caseId}/benchmark.json`);
export const loadSamBenchmark = (): Promise<SamBenchmarkDoc> => getJSON<SamBenchmarkDoc>('sam_benchmark.json');
export const loadLearnedBenchmark = (): Promise<LearnedBenchmarkDoc> =>
  getJSON<LearnedBenchmarkDoc>('learned/unet-watershed-v2/benchmark.json');
export const loadMethodBenchmark = (): Promise<MethodBenchmarkDoc> =>
  getJSON<MethodBenchmarkDoc>('method-benchmark.json');
export const loadTemporalBenchmark = (): Promise<TemporalBenchmarkDoc> =>
  getJSON<TemporalBenchmarkDoc>('temporal/unet-watershed-v2.json');
export const loadTemporalShowcase = (): Promise<TemporalShowcaseManifest> =>
  getJSON<TemporalShowcaseManifest>('showcase/temporal/manifest.json');
