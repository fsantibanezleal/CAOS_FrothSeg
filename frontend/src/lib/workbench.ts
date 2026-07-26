import type { CaseIndexEntry, TemporalSequenceMetrics } from './contract.types';

export type StillSource = 'canonical' | 'upload';
export type WorkbenchSource = 'still' | 'sequence';

export type StillTab = 'segment' | 'boundary' | 'bsd' | 'morphometry' | 'confidence'
  | 'state' | 'provenance' | 'export' | 'compare';

export type SequenceView = 'source' | 'truth' | 'prediction' | 'overlay';

export interface TemporalShowcaseFrame {
  frame_index: number;
  source_path: string;
  source_sha256?: string;
  truth_path?: string | null;
  truth_sha256?: string | null;
  prediction_path?: string | null;
  prediction_sha256?: string | null;
  overlay_path?: string | null;
  overlay_sha256?: string | null;
  prediction_overlay_path?: string | null;
  identity_path?: string | null;
  events_path?: string | null;
}

export interface TemporalPredictionFrame {
  frame_index: number;
  prediction_path: string;
  prediction_sha256: string;
  overlay_path: string;
  overlay_sha256: string;
}

export interface TemporalEvent {
  frame_index: number;
  instance_id: number;
  type: string;
}

export interface TemporalPrediction {
  method_id: string;
  method_slug: string;
  mode: string;
  protocol: string;
  evidence_path: string;
  evidence_sha256: string;
  metrics: TemporalSequenceMetrics;
  truth_events: TemporalEvent[];
  predicted_events: TemporalEvent[];
  frames: TemporalPredictionFrame[];
}

export interface TemporalShowcaseSequence {
  case_id: string;
  label: string;
  frames: TemporalShowcaseFrame[];
  predictions?: TemporalPrediction[];
}

export interface TemporalMethodAvailability {
  method_id: string;
  method_slug: string;
  status: string;
  mode: string;
  identity_contract: string;
  available_sequence_ids: string[];
  reason: string | null;
}

export interface TemporalShowcaseManifest {
  schema: string;
  source_kind: string;
  label_kind: string;
  prediction_method?: string | null;
  prediction_method_count?: number;
  prediction_sequence_count?: number;
  prediction_frame_count?: number;
  sequence_count: number;
  frames_per_sequence: number;
  artifact_count?: number;
  sequences: TemporalShowcaseSequence[];
  method_availability?: TemporalMethodAvailability[];
}

const PRIMARY_SHOWCASE_EXCLUSIONS = new Set(['empty-control']);

export function primaryShowcaseCases(cases: CaseIndexEntry[]): CaseIndexEntry[] {
  return cases.filter((entry) => !PRIMARY_SHOWCASE_EXCLUSIONS.has(entry.case_id));
}

const CANONICAL_TABS: StillTab[] = [
  'segment', 'boundary', 'bsd', 'morphometry', 'confidence',
  'state', 'provenance', 'export', 'compare',
];

const UPLOAD_RESULT_TABS: StillTab[] = [
  'segment', 'boundary', 'bsd', 'morphometry', 'confidence',
  'state', 'provenance', 'export', 'compare',
];

export function visibleStillTabs(source: StillSource, hasResult: boolean): StillTab[] {
  if (source === 'upload' && !hasResult) return [];
  return source === 'canonical' ? CANONICAL_TABS : UPLOAD_RESULT_TABS;
}

export function availableSequenceViews(frame: TemporalShowcaseFrame): SequenceView[] {
  const views: SequenceView[] = ['source'];
  if (frame.truth_path) views.push('truth');
  if (frame.prediction_path || frame.prediction_overlay_path) views.push('prediction');
  if (frame.overlay_path) views.push('overlay');
  return views;
}
