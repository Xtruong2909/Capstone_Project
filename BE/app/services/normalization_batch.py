"""Bounded, column-oriented pNEUMA expansion without per-point dictionaries."""

from collections.abc import Callable, Iterable
from pathlib import Path

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq

FIELDS = (
    "track_id", "type", "traveled_d", "avg_speed",
    "lat", "lon", "speed", "lon_acc", "lat_acc", "time",
)
NORMALIZE_BATCH_SIZE = 65536


def _numbers(values: list[str], parse_number: Callable) -> pa.Array:
    try:
        strings = pa.array(values, type=pa.string(), from_pandas=False)
        numbers = pc.cast(pc.utf8_trim_whitespace(strings), pa.float64())
        return pc.if_else(pc.is_finite(numbers), numbers, None)
    except (pa.ArrowInvalid, pa.ArrowNotImplementedError):
        # Preserve the scalar parser's null/invalid-number semantics.
        return pa.array(
            [parse_number(value) for value in values],
            type=pa.float64(), from_pandas=False,
        )


def write_pneuma_parquet(
    rows: Iterable[list[str]],
    destination: Path,
    rename_map: dict[str, str],
    parse_number: Callable,
    batch_size: int = NORMALIZE_BATCH_SIZE,
) -> tuple[int, int]:
    """Return source/output counts; cap expanded buffers even for long tracks."""
    if batch_size < 1:
        raise ValueError("batch_size must be positive")
    types = [pa.int64(), pa.string()] + [pa.float64()] * 8
    # Mapping collisions retain the old dict behavior: the last value wins.
    indices = {rename_map.get(name, name): i for i, name in enumerate(FIELDS)}
    schema = pa.schema([(name, types[i]) for name, i in indices.items()])
    columns: list[list] = [[] for _ in FIELDS]
    buffered = before = after = 0

    def flush(writer: pq.ParquetWriter) -> None:
        arrays = [
            _numbers(columns[i], parse_number) if i >= 4 else
            pa.array(columns[i], type=types[i], from_pandas=False)
            for i in indices.values()
        ]
        writer.write_table(pa.Table.from_arrays(arrays, schema=schema))
        for column in columns:
            column.clear()

    # Fixed types also allow an all-null first batch followed by numeric data.
    with pq.ParquetWriter(destination, schema, compression="snappy") as writer:
        for row in rows:
            if not row or not any(row):
                continue
            if len(row) == len(FIELDS) and tuple(v.strip().lower() for v in row) == FIELDS:
                continue
            before += 1
            while row and not row[-1].strip():
                row.pop()
            points = (len(row) - 4) // 6
            if points <= 0:
                continue
            base = (
                parse_number(row[0], integer=True), row[1].strip() or None,
                parse_number(row[2]), parse_number(row[3]),
            )
            offset = 0
            while offset < points:
                count = min(points - offset, batch_size - buffered)
                for i, value in enumerate(base):
                    columns[i].extend([value] * count)
                start = 4 + offset * 6
                stop = start + count * 6
                for i in range(6):
                    columns[i + 4].extend(row[start + i:stop:6])
                offset += count
                buffered += count
                after += count
                if buffered == batch_size:
                    flush(writer)
                    buffered = 0
        if buffered:
            flush(writer)
    return before, after
