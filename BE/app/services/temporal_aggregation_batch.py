"""Bounded Arrow aggregation for numeric pNEUMA observations."""

import math
from collections.abc import Iterable, Iterator
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Any

import pyarrow as pa
import pyarrow.compute as pc

from app.services.recording_time_service import numeric_timestamp


class RecordBatchCursor:
    """Slice one Parquet stream at exact recording-session row boundaries."""

    def __init__(self, batches: Iterable[pa.RecordBatch]) -> None:
        self.batches = iter(batches)
        self.current: pa.RecordBatch | None = None
        self.offset = 0

    def take(self, count: int) -> Iterator[pa.RecordBatch]:
        remaining = count
        while remaining:
            if self.current is None or self.offset == self.current.num_rows:
                self.current = next(self.batches, None)
                self.offset = 0
                if self.current is None:
                    return
            size = min(remaining, self.current.num_rows - self.offset)
            batch = self.current.slice(self.offset, size)
            self.offset += size
            remaining -= size
            yield batch


def supports_batch_aggregation(schema: pa.Schema, track: str, time: str, speed: str | None) -> bool:
    def numeric(kind: pa.DataType) -> bool:
        return pa.types.is_integer(kind) or pa.types.is_floating(kind)

    return (
        pa.types.is_integer(schema.field(track).type)
        and numeric(schema.field(time).type)
        and (
            speed is None
            or numeric(schema.field(speed).type)
            or pa.types.is_null(schema.field(speed).type)
        )
    )


def aggregate_numeric_batches(
    batches: Iterable[pa.RecordBatch],
    *,
    track_column: str,
    time_column: str,
    speed_column: str | None,
    aggregation_interval: int,
    recording_start: datetime | None,
) -> tuple[list[dict[str, Any]], int]:
    """Count distinct tracks across chunks, with observation-weighted mean speed."""
    bins: dict[int, dict[str, Any]] = {}
    records_read = 0

    @lru_cache(maxsize=65_536)
    def time_bucket(value: float) -> int:
        timestamp = numeric_timestamp(value)
        if timestamp is None:
            raise ValueError(f"Invalid normalized timestamp: {value!r}")
        if recording_start:
            offset = timestamp - datetime(1970, 1, 1, tzinfo=UTC)
            if timedelta(0) <= offset < timedelta(days=1):
                timestamp = recording_start.astimezone(UTC) + offset
        return math.floor(timestamp.timestamp() / aggregation_interval) * aggregation_interval

    for batch in batches:
        if not batch.num_rows:
            continue
        tracks = batch.column(batch.schema.get_field_index(track_column))
        seconds = pc.cast(batch.column(batch.schema.get_field_index(time_column)), pa.float64())
        if tracks.null_count:
            raise ValueError("Missing track_id in normalized observations")
        if seconds.null_count or not pc.all(pc.is_finite(seconds)).as_py():
            raise ValueError("Invalid normalized timestamp")
        # Resolve only distinct timestamps, preserving datetime rounding semantics.
        encoded = pc.dictionary_encode(seconds)
        dictionary = pa.array(
            [time_bucket(value) for value in encoded.dictionary.to_pylist()], type=pa.int64()
        )
        buckets = pc.take(dictionary, encoded.indices)
        table = pa.table({"bucket": buckets, "track": tracks})
        unique = table.group_by(["bucket", "track"], use_threads=False).aggregate([])
        for row in unique.to_pylist():
            group = bins.setdefault(
                row["bucket"], {"tracks": set(), "speed_sum": 0.0, "speed_count": 0}
            )
            group["tracks"].add(row["track"])
        if speed_column:
            speeds = pc.cast(batch.column(batch.schema.get_field_index(speed_column)), pa.float64())
            valid = pc.and_(pc.is_finite(speeds), pc.greater_equal(speeds, 0))
            speeds = pc.if_else(valid, pc.multiply(speeds, 3.6), None)
            summaries = (
                pa.table({"bucket": buckets, "speed": speeds})
                .group_by(
                    "bucket",
                    use_threads=False,
                )
                .aggregate([("speed", "sum"), ("speed", "count")])
            )
            for row in summaries.to_pylist():
                group = bins[row["bucket"]]
                group["speed_sum"] += row["speed_sum"] or 0.0
                group["speed_count"] += row["speed_count"]
        records_read += batch.num_rows
    if not bins:
        raise ValueError("Recording Session contains no normalized observations")
    return [
        {
            "time_bucket": datetime.fromtimestamp(bucket, tz=UTC),
            "vehicle_count": len(group["tracks"]),
            "traffic_flow": round(len(group["tracks"]) / (aggregation_interval / 60.0), 2),
            "mean_speed": round(group["speed_sum"] / group["speed_count"], 2)
            if group["speed_count"]
            else None,
        }
        for bucket, group in sorted(bins.items())
    ], records_read
