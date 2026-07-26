import numpy as np

from fslab.temporal import temporal_metrics


def test_perfect_sequence_has_complete_temporal_scores():
    first = np.array([[1, 1, 0], [0, 2, 2]], dtype=np.int32)
    second = np.array([[0, 1, 1], [2, 2, 0]], dtype=np.int32)
    metrics = temporal_metrics([first, second], [first, second])
    assert metrics.idf1 == 1.0
    assert metrics.hota == 1.0
    assert metrics.track_fragmentations == 0
    assert metrics.flow_epe_px == 0.0


def test_identity_switch_and_gap_are_reported():
    truth = [
        np.array([[1, 1]], dtype=np.int32),
        np.array([[0, 0]], dtype=np.int32),
        np.array([[1, 1]], dtype=np.int32),
    ]
    predicted = [
        np.array([[4, 4]], dtype=np.int32),
        np.array([[0, 0]], dtype=np.int32),
        np.array([[5, 5]], dtype=np.int32),
    ]
    metrics = temporal_metrics(predicted, truth)
    assert metrics.idf1 < 1.0
    assert metrics.track_fragmentations == 1
    assert metrics.event_precision == 1.0
    assert metrics.event_recall == 1.0
