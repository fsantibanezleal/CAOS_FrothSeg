import numpy as np

from fslab.temporal import temporal_metrics, track_by_iou


def test_iou_tracker_preserves_ids_across_motion():
    first = np.zeros((24, 24), dtype=np.int32)
    first[2:8, 2:8] = 1
    first[12:20, 12:20] = 2
    second = np.zeros_like(first)
    second[3:9, 3:9] = 9
    second[11:19, 13:21] = 4
    tracked = track_by_iou([first, second])
    assert set(np.unique(tracked[1])) == {0, 1, 2}
    metrics = temporal_metrics(tracked, [first, tracked[1]])
    assert metrics.id_switches == 0
    assert metrics.mean_frame_coverage == 1.0


def test_tracker_assigns_new_id_to_appearing_instance():
    first = np.zeros((16, 16), dtype=np.int32)
    first[2:7, 2:7] = 1
    second = first.copy()
    second[9:14, 9:14] = 7
    tracked = track_by_iou([first, second])
    assert tracked[1].max() == 2
