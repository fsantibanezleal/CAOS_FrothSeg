# Matrix, compute lanes, and acceptance

Every C1-C7, L1-L7, and N1 row requires executable inference, provenance,
held-out metrics, documentation, and a lane declaration. The matrix reports
AP, PQ/SQ/RQ, boundary F, morphometry errors, robustness, runtime, and model
evidence. Temporal methods add IDF1, HOTA, fragmentation, events, and flow.

The committed v2 matrix contains all 960 method-case cells (15 methods x 64
untouched test samples) across 16 conditions. Each row includes macro metrics,
pooled micro TP/FP/FN/precision/recall/F1, mean/p95 inference latency, measured
peak memory, hardware/device, and sized/hashed model artifacts. The development
gate rejects missing cells or compute metadata.

Browser execution is deliberately narrower than offline implementation:
C1/C3/C4 are validated TypeScript twins across one untouched representative
from every condition. C2/C5/C6/C7 remain scientific offline implementations
and are shown on the companion web only as committed canonical replay.

Current synthetic results are diagnostic: the three-seed LamellaStar ensemble
leads the controlled test at AP 0.5186, ahead of the grouped-split,
two-epoch fine-tuned Cellpose-SAM at 0.5099. The margin is +0.0087, which is
smaller than the measured ensemble-to-ensemble spread of 0.0118
(`verification/p1-ensemble-spread.json`), so the two are not distinguishable at that
spread and no superiority claim is made.
Product acceptance remains blocked until a licensed, calibrated real held-out
lane meets predeclared thresholds. A green artifact-inventory check cannot
override that scientific gate.
