# Tracking, events, and flow

Frame-local masks are associated with Hungarian IoU matching and assigned
persistent IDs. Evaluation reports detection accuracy, ID precision/recall,
IDF1, HOTA at the declared IoU threshold, ID switches, coverage, and track
fragmentation. Flow endpoint error compares per-instance centroid displacement
only across valid persistent matches.

Birth and disappearance events are counted by frame and type. The bursting
sequence exports exact birth/coalescence events; ordinary drift sequences are
negative controls. Event precision and recall therefore expose false tracker
births instead of hiding them. SAM 2.1 video evaluation is prompt propagation:
first-frame truth masks initialize a fixed cohort and untouched later frames
measure propagation, not automatic discovery.
