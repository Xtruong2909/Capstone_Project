from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from app.services.lag_window_service import (
    VehicleObservation,
    build_training_windows,
    latest_lags,
)


def _rows(count: int, *, dataset_id=None, session_id=None, start=None):
    dataset_id = dataset_id or uuid4()
    session_id = session_id or uuid4()
    start = start or datetime(2018, 10, 24, 5, 30, tzinfo=UTC)
    return [VehicleObservation(
        dataset_id=dataset_id, session_id=session_id,
        timestamp=start + timedelta(minutes=i), vehicle_count=i + 1,
    ) for i in range(count)]


def test_lag_order_and_target_times() -> None:
    rows = _rows(11)
    windows = build_training_windows(rows)
    assert len(windows) == 2
    assert windows[0].timestamp == rows[4].timestamp
    assert windows[0].lags == (5, 4, 3, 2, 1)
    assert windows[0].targets == (6, 8, 10)
    assert windows[1].timestamp == rows[5].timestamp
    assert windows[1].targets == (7, 9, 11)
    assert [rows[4 + h].timestamp for h in (1, 3, 5)] == [
        windows[0].timestamp + timedelta(minutes=h) for h in (1, 3, 5)
    ]


def test_sessions_never_join_even_when_minutes_are_adjacent() -> None:
    first = _rows(7)
    second = _rows(7, dataset_id=first[0].dataset_id,
                   start=first[-1].timestamp + timedelta(minutes=1))
    assert build_training_windows(first + second) == []
    assert len(build_training_windows(_rows(10) + _rows(10))) == 2


def test_missing_and_duplicate_timestamps_break_windows() -> None:
    rows = _rows(12)
    missing = rows[:5] + rows[6:]
    assert build_training_windows(missing) == []
    duplicate = rows[:5] + [rows[4]] + rows[5:]
    assert build_training_windows(duplicate) == []


def test_prediction_uses_latest_five_without_targets_or_future() -> None:
    rows = _rows(8)
    origin, lags = latest_lags(rows)
    assert origin == rows[-1].timestamp
    assert lags == (8, 7, 6, 5, 4)
    with pytest.raises(ValueError, match="consecutive"):
        latest_lags(rows[:6] + rows[7:])
    with pytest.raises(ValueError, match="consecutive"):
        latest_lags(rows + [rows[-1]])
    with pytest.raises(ValueError, match="one Session"):
        latest_lags(rows + _rows(1))
