from collections import deque
from datetime import UTC, datetime, timedelta, timezone
from time import perf_counter

import pyarrow as pa
import pytest

from app.services.ds_temporal_aggregation_service import aggregate_normalized_rows
from app.services.temporal_aggregation_batch import RecordBatchCursor, aggregate_numeric_batches


def aggregate(table: pa.Table, start: datetime | None = None, batch_size: int = 3) -> tuple:
    return aggregate_numeric_batches(
        table.to_batches(max_chunksize=batch_size),
        track_column="track_id",
        time_column="time",
        speed_column="speed" if "speed" in table.column_names else None,
        aggregation_interval=60,
        recording_start=start,
    )


def test_distinct_tracks_and_observation_weighted_speed_match_scalar_across_chunks() -> None:
    rows = [
        (1, 0.0, 10.0),
        (1, 20.0, 20.0),
        (2, 30.0, -1.0),
        (2, 30.0, float("nan")),
        (3, 30.0, None),
        (1, 180.0, 1.0),
        (1, 180.0, 3.0),
    ]
    table = pa.table(
        {
            name: [row[index] for row in rows]
            for index, name in enumerate(("track_id", "time", "speed"))
        }
    )
    start = datetime(2018, 10, 24, 8, 30, tzinfo=timezone(timedelta(hours=3)))
    assert aggregate(table, start) == aggregate_normalized_rows(
        rows, aggregation_interval=60, recording_start=start
    )


@pytest.mark.parametrize("start", [None, datetime(2018, 10, 24, 8, 30, tzinfo=UTC)])
def test_timestamp_rounding_epoch_and_midnight_semantics_match_scalar(
    start: datetime | None,
) -> None:
    times = [
        -0.0000006,
        -0.0000005,
        0.0,
        59.9999994,
        59.9999996,
        60.0,
        86399.9999996,
        86400.0,
        1540369800.0,
    ]
    rows = [(index + 1, time) for index, time in enumerate(times)]
    table = pa.table({"track_id": [row[0] for row in rows], "time": times})
    assert aggregate(table, start) == aggregate_normalized_rows(
        rows, aggregation_interval=60, recording_start=start
    )


def test_cursor_preserves_exact_session_boundaries_and_can_drain_after_error() -> None:
    table = pa.table({"track_id": [99, 1, 2, 3, 4], "time": [0.0, float("nan"), 0.0, 0.0, 60.0]})
    cursor = RecordBatchCursor(table.to_batches(max_chunksize=3))
    deque(
        cursor.take(1), maxlen=0
    )  # A previously completed session is skipped without Python row expansion.
    failed = cursor.take(1)
    with pytest.raises(ValueError, match="Invalid normalized timestamp"):
        aggregate_numeric_batches(
            failed,
            track_column="track_id",
            time_column="time",
            speed_column=None,
            aggregation_interval=60,
            recording_start=None,
        )
    deque(failed, maxlen=0)
    result, count = aggregate_numeric_batches(
        cursor.take(3),
        track_column="track_id",
        time_column="time",
        speed_column=None,
        aggregation_interval=60,
        recording_start=None,
    )
    assert count == 3
    assert [row["vehicle_count"] for row in result] == [2, 1]


def test_missing_track_ids_fail_instead_of_being_counted() -> None:
    with pytest.raises(ValueError, match="Missing track_id"):
        aggregate(pa.table({"track_id": pa.array([1, None], type=pa.int64()), "time": [0.0, 0.0]}))


def test_numeric_aggregation_benchmark_and_equivalence() -> None:
    rows = [
        (vehicle, float(second), 10.0 + second % 3)
        for vehicle in range(1000)
        for second in range(300)
    ]
    table = pa.table(
        {
            name: [row[index] for row in rows]
            for index, name in enumerate(("track_id", "time", "speed"))
        }
    )
    started = perf_counter()
    expected = aggregate_normalized_rows(rows, aggregation_interval=60, recording_start=None)
    scalar_seconds = perf_counter() - started
    started = perf_counter()
    actual = aggregate(table, batch_size=65_536)
    batch_seconds = perf_counter() - started
    assert actual == expected
    print(
        f"300000 observations: scalar={scalar_seconds:.3f}s batch={batch_seconds:.3f}s speedup={scalar_seconds / batch_seconds:.2f}x"
    )
