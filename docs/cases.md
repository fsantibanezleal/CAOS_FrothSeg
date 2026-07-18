# Cases

FrothSeg's benchmark harness is 13 synthetic Laguerre-foam froth frames whose per-bubble instance masks are known
exactly (public per-bubble froth masks are legally request-only, so a synthetic set is the only source of exact
ground truth). Each case carries a category (control, size regime, stress, transient), its generator params, an
expected band (what a froth-vision expert should see), and a real|synthetic flag; the App shows one selected
case, while Experiments/Benchmark summarize across categories. These are labelled synthetic everywhere and are
not real-plant accuracy: the product's real capability is live SAM-class segmentation of real (uploaded) froth.
Start with the category taxonomy in **[cases/README.md](cases/README.md)**, then the full coverage matrix, the
verified SAM AP vs the classical floor AP, the geometry + scoring maths, and the data contract in
**[cases/01_coverage.md](cases/01_coverage.md)**.
