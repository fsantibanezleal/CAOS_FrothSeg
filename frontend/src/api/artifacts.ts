// Fetch the committed CONTRACT-2 artifacts (copied into public/data by copy-data.mjs). The web loads these for
// the baked benchmark + the synthetic samples the App runs the live segmenter on; live inference itself is
// in-browser (src/sam), no backend.
import type { BenchmarkDoc, CaseCard, CaseIndex, CaseManifest, MasksDoc, SamBenchmarkDoc } from '../lib/contract.types';

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
