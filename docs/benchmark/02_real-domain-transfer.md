# Real-domain transfer: does any of this survive real photographs

Every number in the main benchmark comes from the in-repo Laguerre-foam generator. That is a
controlled harness with exact ground truth, and it is the right tool for comparing methods under
known conditions. It leaves one large doubt untouched: **the entire 15-method ranking could be an
artefact of one generator's statistics.** A method tuned, however indirectly, to synthetic
lamella boundaries might collapse the moment it sees a real sensor.

This page is the check on that doubt, and it is the only thing it checks.

## Why the data is not froth

There is no openly licensed, real, per-bubble-annotated froth dataset in public repositories.
Verified 2026-07-28 against primary sources: the Kaggle candidate carries no licence at all, the
IEEE DataPort set is paywalled, the Roboflow set is CC-BY-NC-SA (dropped), and Zenodo returns no
froth segmentation dataset. Froth imagery is operational plant data and plants do not publish it.

So the choice was between no real evidence at all, or real evidence from an adjacent domain
labelled precisely as such. The second is worth more than the first, provided it never gets to
pretend it is the first.

## The dataset

**BBBC038v1** (Data Science Bowl 2018), Broad Bioimage Benchmark Collection, **CC0**. The
publisher waived all rights, so nothing downstream inherits a restriction. This mattered: the
previous candidate was non-commercial, which would have encumbered the evaluation and arguably
any model tuned against it.

- 670 real microscopy images, expert-curated per-object instance masks, non-overlapping.
- Held-out split of 64 samples containing 4,979 annotated nuclei, matching the 64-sample froth
  test split so the two read on the same footing.
- Grouped split. BBBC038 ships no acquisition metadata, so grouping uses image size and coarse
  mean intensity to keep near-duplicate fields of view from one experiment in the same split.
  That is a proxy for acquisition, not ground truth about it, and the manifest says so.

Geometrically it is the same problem as froth: densely packed, roughly convex objects, touching,
where the boundary between two adjacent objects is the only evidence separating them. That is
precisely what every method in the ladder is built to resolve.

## The protocol, and why nothing was retrained

**Post-processing calibrated on synthetic froth is applied unchanged.** No method is retrained,
refitted, or given new thresholds for this data.

That is deliberate. Refitting would measure how well each architecture can be tuned to nuclei,
which is a question about the architectures and not about this repository. Applying the froth
calibration unchanged measures **transfer**: whether the settings that work on the generator
carry to a real sensor. A method that collapses here is telling us its calibration was
generator-specific, which is exactly the failure mode worth knowing about before anyone points
it at a plant camera.

A method that raises an exception on a real image is recorded as a failed sample with its error,
not dropped. Failing to run is a result.

## What this evidence can and cannot support

**Can:** a statement that the method ladder does or does not survive real photographs of dense
touching instances, under froth-fitted settings.

**Cannot, under any circumstances:** a statement about flotation accuracy. These are cell
nuclei. There is no froth, no lamella physics, no bubble coalescence, no specular glare from a
wet surface, and no physical scale.

That boundary is enforced in code rather than left to prose. The source carries
`domain: adjacent`, and `scripts/build_release_report.py` partitions accepted real sources by
that field so only a `froth` source can clear the release gate's real-data requirement. Before
this dataset was adopted the gate matched any source whose `kind` began with `real`, which would
have let nuclei silently clear the froth blocker and turned the release report into a false
statement.

The release error therefore still reads *no accepted licensed real FROTH held-out source*, and
it will keep reading that until real froth exists, no matter how much adjacent evidence
accumulates.

## Result

64 real held-out images, 4,979 annotated nuclei, froth-fitted settings applied unchanged.
No method failed to run. Re-run on 2026-08-01 after the C3 and C7 engine defaults were adopted; the
split is the same already-observed one drawn on 2026-07-28, so this recomputes a published surface
and selects nothing.

| id | method | real AP | froth AP | delta |
|---|---|---|---|---|
| L5 | Cellpose-SAM | **0.709** | 0.510 | **+0.199** |
| C1 | Otsu + connected components | 0.339 | 0.065 | +0.274 |
| C7 | Lamella-valley constrained watershed | 0.301 | 0.233 | +0.069 |
| C5 | H-minima watershed | 0.264 | 0.133 | +0.131 |
| C4 | Distance-transform watershed | 0.256 | 0.198 | +0.059 |
| C3 | Marker-controlled watershed | 0.216 | 0.297 | **-0.081** |
| L6 | YOLO froth segmentation | 0.144 | 0.293 | -0.149 |
| **N1** | **LamellaStar** | **0.125** | **0.519** | **-0.394** |
| L3 | GC-FSegNet | 0.110 | 0.319 | -0.209 |
| L1 | Boundary/distance U-Net | 0.094 | 0.415 | -0.322 |
| C6 | SLIC + RAG merge | 0.084 | 0.019 | +0.065 |
| L2 | Deep-marker watershed | 0.042 | 0.325 | -0.283 |
| L4 | StarDist 2D | 0.012 | 0.112 | -0.100 |
| C2 | Gradient immersion watershed | 0.000 | 0.017 | -0.017 |

Grouped by tier, the pattern is unambiguous:

| tier | mean delta |
|---|---|
| classical (7 methods) | **+0.071** |
| in-repo trained (6 methods) | **-0.243** |
| foundation, never trained here (L5) | **+0.199** |

**The synthetic ranking does not transfer.** N1 LamellaStar leads the froth benchmark at 0.519
and falls to eighth at 0.125 on real images, a drop of 0.394. Every model trained on the 192
synthetic samples degrades. Five of the seven classical methods, which have no learned prior to
overfit, improve, for a tier mean of +0.071. The single method that was never trained in this
repository is the only learned method that improves, and it becomes the clear leader at 0.709.

**The classical tier reorders too, and C3 is the clearest case.** After its flooding depth was
corrected on 2026-08-01 C3 leads every axis of the synthetic benchmark at 0.297, and it is only
fifth of the seven classical methods on real images at 0.216. C1, which is last but one on froth
at 0.065, leads the classical tier on real at 0.339. So "best on the generator" and "best on real
dense-instance images" are not the same ordering even inside the tier that does not learn
anything, and the froth ranking should not be read as a recommendation for real images.

C3's own transfer number improved with the correction, from 0.128 to 0.216, and its drop softened
from -0.092 to -0.081. That is worth stating because it is the one piece of evidence here that the
depth correction is not a synthetic artefact: it was selected on a synthetic validation split and
confirmed on a synthetic reserve slice, and it also helps on real photographs it was never fitted
to. It remains an adjacent-domain result about microscopy nuclei, not a froth result.

**The two classical exceptions are named, not averaged away.** C2 gradient immersion watershed was
already at 0.017 on froth and returns 0.000 here, a delta of -0.017, so the tier gains while its
weakest member does not. C3 marker-controlled watershed is the more interesting one: it falls from
0.297 to 0.216, where before the 2026-08-01 adoptions it ROSE on this domain, from 0.103 on froth
to 0.182 on real while flooding the distance transform. That reversal is a real result and is
stated as one. The adopted surface is a FROTH mechanism, since flooding the negated intensity from
h-maxima markers assumes one bright specular highlight per object and a dark Plateau border between
objects, and cell nuclei have neither. That reading held while the comparison was 0.182 for neg_edt
against 0.128 for the adopted engine. It no longer does: after the flooding depth was corrected the
shipped engine scores 0.216 on this domain, ABOVE the 0.182 that neg_edt reached, so the surface it
replaced is not the better surface here either. What survives is the direction of the transfer, not
the surface ordering.

The depth correction later the same day moved C3's real figure from 0.128 to 0.216 and softened the
drop from -0.092 to -0.081, so the direction of the reversal survives while its size does not. Both
statements have been true of this row on the same day, and only the second is true now. The change was adopted on a froth source and confirmed on a froth
reserve slice (`verification/phase1-adoption.json`), and this split supports no froth statement, so
the adoption stands. But nobody should read C3's froth gain as evidence that the surface is
generally better, and this row is why. C7's constrained watershed moves the other way on this same
re-run: its real AP rises from 0.193 before the adoption to 0.301 after it, its froth-to-real delta
is +0.069 (0.233 to 0.301), and it is now the second-best classical method here, behind C1.

### What this does and does not say about N1

It would be easy to read this as "N1 is bad" and equally easy to read it as "the ranking is
worthless". Both are wrong, and the second caveat matters as much as the first.

**What it fairly supports:** N1's advantage over Cellpose-SAM on the froth benchmark is
domain-specific and does not survive a change of domain. Anyone reading the +0.009 froth margin
as evidence of a generally better segmenter is overreading it. The froth ranking is a statement
about the generator, and this is the measurement that shows how much of it is.

**What it does not support:** the conclusion that Cellpose-SAM is better *on froth*. BBBC038 is
cell microscopy, which is Cellpose-SAM's pretraining domain. It is playing at home. N1, L1, L2
and L3 are froth specialists trained on 192 froth images and then handed a different imaging
modality with their froth thresholds intact; degradation is the expected outcome, not a defect
revealed. A fair reading is that this test measures **robustness to domain shift**, and on that
axis the pretrained generalist wins and the small specialists lose, which is what the literature
would predict.

The honest summary is narrow and worth stating exactly: **the froth leaderboard is a
generator-specific result, and nothing in this repository yet demonstrates that any method is
good at real froth.** That remains true until real froth data exists.

### The classical improvement is informative too

C1, plain Otsu plus connected components, is the second-best method here at 0.339 after scoring
0.065 on froth. That is not because it became better; it is because nuclei are an easier
instance problem than froth. They are sparser, rounder, higher contrast, and rarely share a
boundary the way packed bubbles do. It is a useful reminder of how much of the froth benchmark's
difficulty is intrinsic to froth, and a warning against reading any absolute number here as
transferable to a flotation cell.

## Reproducing

```powershell
# CC0, no credential required
curl -L -o stage1_train.zip https://data.broadinstitute.org/bbbc/BBBC038/stage1_train.zip
./.venv-gpu/Scripts/python.exe scripts/ingest_bbbc038.py --archive stage1_train.zip
./.venv-gpu/Scripts/python.exe scripts/benchmark_real_adjacent.py --raw-root <extraction>
```

The ingest verifies the extracted sample ids against the archive and refuses to proceed on a
mismatch. An interrupted extraction previously left 533 of 670 samples and the split was drawn
from that incomplete pool without complaint, which would have produced real-looking numbers
computed on two thirds of the data.

## References

- Caicedo, J.C. et al. (2019). Nucleus segmentation across imaging experiments: the 2018 Data
  Science Bowl. *Nature Methods* 16.
  [doi:10.1038/s41592-019-0612-7](https://doi.org/10.1038/s41592-019-0612-7)
- BBBC038v1 record and licence: <https://bbbc.broadinstitute.org/BBBC038>
- Source search that led here: CAOS_MANAGE
  `wip/frothseg/real-data-source-search-2026-07-28.md`
