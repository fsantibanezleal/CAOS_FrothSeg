# Records, calibration, and leakage-safe splits

Each scoreable record carries `sample_id`, `source_id`, `group_id`, image and
annotation URIs, width, height, and split. Video data additionally carries
`video_id` and `frame_index`; plant data should carry a site or campaign key.
`mm_per_px` is positive only when a traceable calibration exists. Missing scale
keeps all morphometry in pixels and must never be silently imputed.

The split unit is the strongest related-data key: source, video, site, and
latent synthetic geometry group. Threshold selection uses the calibration
split. Test annotations are read only by evaluation. The source registry
records access and redistribution constraints; raw/private assets remain
outside git while derived evidence retains hashes and provenance.

Import validation rejects unknown licenses, missing grouping keys, invalid
dimensions, empty annotations, and calibration-required records without scale.
Use `fslab.data_sources.import_coco_records` for COCO metadata and the pipeline
commands for materialization.
