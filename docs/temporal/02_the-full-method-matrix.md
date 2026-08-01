# Every method over every sequence

The still benchmark asks how good a mask is. A flotation cell asks a different question: while
the surface advects, glares and bursts, does a method keep the same bubble as the same bubble.
Answering that for one method is an anecdote. The sequence lane answers it for the whole ladder
under one protocol.

## Coverage

15 methods, 5 sequences, 8 frames: 75 published (method, sequence) pairs and 600 prediction
frames. The release gate fails if any registered method is missing a sequence, and the
expectation is derived from the method registry rather than a hand-written list, so a method
cannot join the ladder and quietly skip this lane.

The five sequences each isolate a different way identity breaks:

| sequence | what it stresses |
|---|---|
| `poly-normal` | nominal transport with persistent identities and moderate size diversity |
| `fine-froth` | dense fine bubbles, where instance separation and track continuity compete |
| `glare-storm` | moving specular highlights that erase lamella evidence and invent event candidates |
| `motion-fast` | rapid advection, testing motion estimation and identity association |
| `bursting` | topological change, where births and coalescences are the signal |

Geometry is sampled once per sequence and each frame applies a smooth sub-bubble displacement
with a distinct appearance seed, so identities are exact and persistent by construction rather
than rematched after the fact. The ground truth is therefore a real identity reference, not a
per-frame segmentation relabelled.

## Two prediction modes, never merged

This is the part that decides whether the numbers mean anything.

**Framewise segmentation with IoU identity association** (`framewise_segmentation_with_iou_identity_association`).
C1 through C7, L1 through L6, and N1. None of these owns a temporal model. Each segments every
frame independently, and identities are assigned afterwards by greedy IoU association at a 0.25
threshold. Their identity scores measure how stable the masks are from frame to frame, not the
quality of a tracker the method contains.

**Native prompted video propagation** (`native_prompted_video_propagation`). L7, SAM 2.1. It
carries its own memory across frames, is prompted once with the exact ground-truth masks of a
12-instance cohort on frame 0, and propagates forward. It is never asked to discover anything.

The consequence is unmissable in the numbers: **L7 scores IDF1 and HOTA of 1.000 on every
sequence.** That is not evidence that SAM 2.1 tracks froth perfectly. It is arithmetic. The
method is handed twelve identities and evaluated on whether it still has twelve identities, so
the identity metrics are saturated by construction. Its honest quality number is the mean
identity IoU, 0.898 across the five sequences, which measures how well the propagated masks
still cover the objects they were given.

Ranking L7 against the framewise lane would credit it with an advantage the protocol hands it.
So the mode travels with every published row, the method picker groups by it, and the
comparison table puts native-video methods in a separate section with the reason stated in
place. No aggregate mixes them.

## Framewise results, nominal transport

Ordered by HOTA on `poly-normal`, which balances detection against association:

| id | method | HOTA | IDF1 | coverage | ID switches | fragments |
|---|---|---|---|---|---|---|
| L5 | Cellpose-SAM | 0.965 | 0.965 | 95.4% | 1 | 8 |
| N1 | LamellaStar | 0.926 | 0.923 | 92.4% | 11 | 17 |
| L1 | Boundary/distance U-Net | 0.923 | 0.916 | 96.1% | 10 | 16 |
| L3 | GC-FSegNet | 0.901 | 0.892 | 92.9% | 24 | 22 |
| L2 | Deep-marker watershed | 0.880 | 0.871 | 93.3% | 30 | 20 |
| L6 | YOLO froth segmentation | 0.852 | 0.847 | 87.2% | 2 | 52 |
| C7 | Lamella-valley detector | 0.826 | 0.811 | 87.3% | 25 | 86 |
| C4 | Distance-transform watershed | 0.801 | 0.786 | 81.3% | 22 | 47 |
| L4 | StarDist 2D | 0.767 | 0.752 | 79.3% | 30 | 48 |
| C5 | H-minima watershed | 0.670 | 0.639 | 63.7% | 43 | 69 |
| C3 | Marker-controlled watershed | 0.561 | 0.508 | 74.2% | 36 | 84 |
| C1 | Otsu + connected components | 0.499 | 0.440 | 36.4% | 8 | 60 |
| C6 | SLIC + RAG merge | 0.313 | 0.205 | 76.9% | 105 | 113 |
| C2 | Gradient immersion watershed | 0.153 | 0.074 | 62.9% | 370 | 81 |

Averaged over all five sequences the order is stable: L5 0.913, L1 0.879, N1 0.843, L2 0.823,
L3 0.806, L6 0.769, L4 0.668, C4 0.631, C7 0.597, C5 0.451, C3 0.435, C1 0.341, C6 0.263,
C2 0.150.

Three things worth reading off the table rather than the ranking:

1. **ID switches and coverage are not the same failure.** C1 has only 8 identity switches, fewer
   than most learned methods, and still ranks near the bottom: it finds so little (36.4%
   coverage) that there is not much identity to lose. A low switch count is only meaningful
   next to the coverage that produced it.
2. **L6 trades fragments for stability.** YOLO has 2 switches, second only to Cellpose-SAM, but
   52 track fragments. Its detector is decisive frame to frame and its recall is intermittent.
3. **C2 is the honest floor.** 370 identity switches on eight frames. Marker-less immersion
   watershed over-segments differently on every frame, so nothing survives association. It is
   kept in the ladder precisely because a benchmark without a floor cannot show what the floor
   costs.

## Events

Event precision is low for every framewise method, and that is reported rather than smoothed.
Association-derived births and deaths fire whenever a mask flickers, so a method with unstable
masks manufactures hundreds of spurious events. On `poly-normal`, L1 records 2 true events
against 164 false positives. The recall is 1.0 and the precision is 0.012. Presenting the recall
alone would be dishonest; both are published and the Events view shows the counts per frame.

This is the intended reading: framewise event detection over this protocol is an experimental
measurement, not an industrial capability.

## What is published, and what the browser computes

Per prediction frame, only the run-length-encoded label raster is published. The overlay a
reader sees is composited in the browser from the source frame and those labels. Baking the
overlay as a PNG per frame per method cost 63 MB and carried no information the labels did not
already hold.

Event logs are published beside their frames as `events.json` and fetched only when the Events
view opens. They were briefly inlined in the showcase manifest, which put 10.4 MB of birth and
death records, 97% of the manifest's weight, in front of every visitor.

All of it is checksummed: the manifest carries a sha256 for every artifact, and three validators
(the pipeline drift check, the artifact contract, and the completeness gate) share one
verification function so the contract is stated once instead of drifting between three copies.

## Reproducing

```bash
# every framewise method over every sequence
python scripts/bake_temporal_all.py --output-root data/derived/temporal

# the native video lane
python scripts/benchmark_sam2_video.py --output data/derived/temporal/sam2_1.json

# publish to the web contract
python -m fslab.pipeline showcase --input data/derived --output <sandbox>
```

Pass a sandbox `--output-root` when probing. The canonical root is a release artifact.

## Scope

Every sequence is synthetic. These numbers are controlled evidence about how methods behave when
the scene moves; they are not plant tracking accuracy, and no licensed real sequence exists in
this repository yet.

## References

- Meyer, F. (1994). Topographic distance and watershed lines. *Signal Processing* 38(1).
  [doi:10.1016/0165-1684(94)90060-4](https://doi.org/10.1016/0165-1684\(94\)90060-4)
- Ravi, N. et al. (2024). SAM 2: Segment Anything in Images and Videos.
  [arXiv:2408.00714](https://arxiv.org/abs/2408.00714)
- Luiten, J. et al. (2021). HOTA: A Higher Order Metric for Evaluating Multi-Object Tracking.
  *IJCV* 129. [doi:10.1007/s11263-020-01375-2](https://doi.org/10.1007/s11263-020-01375-2)
- Ristani, E. et al. (2016). Performance Measures and a Data Set for Multi-Target,
  Multi-Camera Tracking. *ECCV Workshops*.
  [doi:10.1007/978-3-319-48881-3_2](https://doi.org/10.1007/978-3-319-48881-3_2)
