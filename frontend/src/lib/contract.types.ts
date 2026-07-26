// CONTRACT 2 mirror (frontend side). MUST stay in lock-step with the Python schemas in
// data-pipeline/fslab/core/{manifest.py, trace.py} + io/froth_io.py. A drift here makes `tsc` fail -> the
// contract is enforced at BUILD time (the web cannot ship reading a shape the pipeline does not produce).

export interface Bsd {
  count: number;
  d10: number | null;
  d50: number | null;
  d90: number | null;
  d32: number | null;
  pctSmall: number | null;
}

export interface FloorScore {
  method: string;
  ap: number | null;
  ap50: number | null;
  ap75: number | null;
  bsd_w: number | null;
  n_pred: number;
  n_gt: number;
}

export interface ArtifactRef {
  path: string;
  format: string;
  bytes: number;
  sha256: string;
  height?: number;
  width?: number;
  n_instances?: number;
}

export interface GateVerdict {
  lane: string;
  pure_python: boolean;
  wheels: string[];
  trace_bytes: number;
  run_ms_budget: number;
  trace_bytes_budget: number;
  reasons: string[];
}

export interface CaseSpec {
  h: number;
  w: number;
  d32_px: number;
  sigma_ln: number;
  glare: number;
  motion_blur: number;
  defocus: number;
  noise: number;
  load: number;
  highlight_jitter: number;
  watery: number;
  empty: boolean;
}

export interface CaseManifest {
  schema: string; // "frothseg.manifest/v1"
  case_id: string;
  category: string;
  real_or_synthetic: string;
  expected_band: string;
  labels: string[];
  engine: { package: string; version: string; generator: string };
  spec: CaseSpec;
  seed: number;
  artifacts: { frame: ArtifactRef; masks: ArtifactRef; bsd: ArtifactRef; benchmark: ArtifactRef };
  bsd: Bsd;
  benchmark: FloorScore[];
  lane: 'live' | 'precompute';
  gate: GateVerdict;
}

export interface BestFloor {
  method: string;
  ap: number | null;
  ap50: number | null;
  bsd_w: number | null;
}

export interface CaseCard {
  schema: string; // "frothseg.card/v1"
  case_id: string;
  category: string;
  labels: string[];
  expected_band: string;
  frame: string; // relative path to frame.png under data/
  bsd: Bsd;
  best_floor: BestFloor | null;
}

export interface MaskInstance {
  id: number;
  size: [number, number]; // [H, W]
  counts: string; // COCO-RLE ascii
  area: number;
  bbox: [number, number, number, number];
}

export interface MasksDoc {
  schema: string; // "frothseg.masks/v1"
  case_id: string;
  height: number;
  width: number;
  n_instances: number;
  encoding: string; // "coco-rle"
  instances: MaskInstance[];
}

export interface BenchmarkDoc {
  schema: string; // "frothseg.benchmark/v1"
  case_id: string;
  methods: FloorScore[];
}

export interface SamCaseScore {
  case_id: string;
  category: string;
  sam_ap: number | null;
  sam_ap50: number | null;
  sam_bsd_w: number | null;
  sam_n: number;
  gt_n: number;
  sam_d32: number | null;
  gt_d32: number | null;
  floor_method: string | null;
  floor_ap: number | null;
  encoder_ms?: number;
  total_ms?: number;
  device?: string;
}

export interface SamBenchmarkDoc {
  schema: string; // "frothseg.sam_benchmark/v1"
  model: string;
  grid: number;
  provenance: string;
  summary: {
    n_cases: number;
    mean_sam_ap: number | null;
    mean_floor_ap: number | null;
    delta: number | null;
    sam_wins: number;
  };
  cases: SamCaseScore[];
}

export interface LearnedCaseScore extends FloorScore {
  case_id: string;
  pq: number | null;
  inference_ms: number;
  mask_path: string;
}

export interface LearnedBenchmarkDoc {
  schema: string;
  method: string;
  checkpoint_sha256: string;
  split: string;
  n_cases: number;
  mean_ap: number;
  mean_ap50: number;
  mean_pq: number;
  cases: LearnedCaseScore[];
}

export interface MethodMetricSummary {
  split: string;
  n?: number;
  n_cases?: number;
  mean_ap: number;
  mean_ap50: number;
  mean_pq: number | null;
  mean_boundary_fscore?: number;
  mean_brier?: number;
  mean_ece?: number;
  mean_bsd_wasserstein?: number;
  mean_count_relative_error?: number;
  mean_d32_relative_error?: number;
  mean_inference_ms?: number;
  p95_inference_ms?: number;
  robustness_by_condition?: Record<string, {
    n: number;
    mean_ap: number;
    delta_ap_from_global: number;
  }>;
  micro?: {
    nGt: number;
    nPred: number;
    tp: number;
    fp: number;
    fn: number;
    instance_precision: number;
    instance_recall: number;
    instance_f1: number;
  };
  cases?: Array<{
    sample_id: string;
    condition_id: string;
    group_id: string;
    ap: number;
    ap50: number;
    pq: number;
  }>;
}

export interface MethodBenchmarkRow {
  id: string;
  slug: string;
  name: string;
  tier: 'classical' | 'domain-sota' | 'foundation' | 'frontier';
  lane: string;
  engine: string;
  state: 'implemented' | 'missing';
  quality_status: 'passes-current-bar' | 'below-current-bar' | 'not-evaluated';
  test: MethodMetricSummary | null;
  canonical: MethodMetricSummary | null;
  canonical_cases: Array<{ case_id: string; ap: number | null }>;
  compute: {
    hardware_lane: 'cpu' | 'gpu';
    device: string;
    mean_inference_ms: number;
    p95_inference_ms: number | null;
    peak_memory_mib: number;
    peak_memory_metric: string;
    model_artifact_bytes: number;
    model_artifact_sha256?: string | null;
    model_artifact_committed?: boolean;
    training_duration_seconds?: number | null;
  };
  docs_path: string;
}

export interface MethodBenchmarkDoc {
  schema: 'frothseg.method-benchmark/v2';
  dataset_schema: string;
  canonical_case_count: number;
  method_count: number;
  implemented_count: number;
  missing_count: number;
  coverage: {
    expected_methods: number;
    expected_test_samples: number;
    expected_cells: number;
    observed_cells: number;
    condition_count: number;
    complete: boolean;
    errors: string[];
  };
  current_bar: {
    metric: string;
    threshold: number;
    leader: { id: string; slug: string; mean_ap: number } | null;
    beyond_sota_claim: boolean;
  };
  methods: MethodBenchmarkRow[];
}

export interface CaseIndexEntry {
  case_id: string;
  category: string;
  manifest_path: string;
}

export interface CaseIndex {
  schema: string; // "frothseg.index/v1"
  engine_version: string;
  generator: string;
  n_cases: number;
  cases: CaseIndexEntry[];
}

export interface TemporalSequenceMetrics {
  condition_id: string;
  frames: number;
  id_switch_rate: number;
  mean_frame_coverage: number;
  idf1: number;
  hota: number;
  track_fragmentations: number;
  event_precision: number;
  event_recall: number;
  flow_epe_px: number | null;
}

export interface TemporalBenchmarkDoc {
  schema: string;
  method: string;
  device: string;
  mean_idf1: number;
  mean_hota: number;
  total_track_fragmentations: number;
  mean_event_precision: number;
  mean_event_recall: number;
  mean_flow_epe_px: number;
  sequences: TemporalSequenceMetrics[];
}
