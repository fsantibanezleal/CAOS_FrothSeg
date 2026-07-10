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
