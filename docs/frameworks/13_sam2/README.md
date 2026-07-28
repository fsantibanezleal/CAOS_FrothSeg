# L7, official SAM 2.1 image/video model

L7 is reserved for Meta's official `facebookresearch/sam2` implementation and
SAM 2.1 checkpoint, not the earlier browser SlimSAM experiment. The offline lane
must run automatic image masks and video propagation on CUDA and emit the common
instance/temporal metrics.

Meta officially recommends Linux/WSL2 on Windows. SAM 2 inference can still run
without its optional CUDA connected-components extension by setting
`SAM2_BUILD_CUDA=0`; the transformer model itself remains CUDA-backed.

Accepted evidence:

- upstream source pinned to commit
  `2b90b9f5ceec907a1c18123530e92e794ad901a4`, Apache-2.0;
- official `facebook/sam2.1-hiera-tiny` checkpoint with size and SHA-256 in
  `models/sam2-1-hiera-tiny/run.json`;
- CUDA inference on NVIDIA GeForce RTX 4070 Laptop GPU;
- fixed automatic-mask settings, including `points_per_side=8`;
- untouched test AP 0.1352, AP50 0.1821, PQ 0.2391 over 64 images;
- canonical diagnostic AP 0.1742 over 13 cases;
- official video propagation on 12 size-stratified objects across eight
  motion-blurred frames: mean identity IoU 0.8014 and recall@0.5 0.9583.

The video metric uses exact first-frame mask prompts and untouched later frames.
It measures propagation, not automatic discovery. The image result is below the
current quality bar and is retained as an implemented negative result.

Reference: Ravi et al. 2024, arXiv:2408.00714.
