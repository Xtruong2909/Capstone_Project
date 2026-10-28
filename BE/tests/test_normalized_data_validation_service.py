import json
import math
from pathlib import Path
from uuid import uuid4

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from app.services import normalized_data_validation_service
from app.services.normalized_data_validation_service import (
    validate_normalized_dataset_service,
)


def test_validation_reports_normalized_staging_counts(
    tmp_path: Path,
    monkeypatch,
) -> None:
    dataset_id = uuid4()
    staging_dir = tmp_path / "staging"
    staging_dir.mkdir()
    parquet_path = staging_dir / "sample.parquet"
    rows = [
        {"track_id": 1, "latitude": 37.5, "longitude": 127.0, "speed": 10.0},
        {"track_id": 2, "latitude": None, "longitude": 128.0, "speed": 12.0},
        {"track_id": 3, "latitude": 91.0, "longitude": 127.0, "speed": 12.0},
        {"track_id": 4, "latitude": 37.0, "longitude": 127.0, "speed": -1.0},
        {"track_id": 1, "latitude": 37.5, "longitude": 127.0, "speed": 10.0},
    ]
    pq.write_table(pa.Table.from_pylist(rows), parquet_path)
    (staging_dir / "sample.json").write_text(
        json.dumps(
            {
                "dataset_id": str(dataset_id),
                "staging_file_path": str(parquet_path),
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(
        normalized_data_validation_service,
        "DATASET_UPLOAD_DIR",
        tmp_path,
    )

    result = validate_normalized_dataset_service(dataset_id=dataset_id)

    assert result.model_dump(mode="json") == {
        "dataset_id": str(dataset_id),
        "validation_status": "completed",
        "total_rows": 5,
        "valid_rows": 1,
        "invalid_rows": 4,
        "validation_results": {
            "missing_values": 1,
            "duplicate_records": 1,
            "invalid_coordinates": 1,
            "negative_speed": 1,
        },
    }


@pytest.mark.parametrize("batch_size", [1, 3, 65536])
@pytest.mark.parametrize(
    "kind", ["numeric", "text", "boolean", "nested", "empty", "unsigned", "dictionary"]
)
def test_batch_validation_preserves_row_counts(
    tmp_path: Path, monkeypatch, batch_size: int, kind: str
) -> None:
    """Compare against the original row-wise semantics, across batch boundaries."""
    if kind == "unsigned":
        table = pa.table(
            {
                "latitude": pa.array([0, 90, 91, 2**64 - 1, None, 0], type=pa.uint64()),
                "speed": pa.array([0, 1, 2**64 - 1, 0, None, 0], type=pa.uint64()),
            }
        )
    elif kind == "dictionary":
        table = pa.table(
            {"latitude": pa.array(["0", "null", "NaN", None, "91", "0"]).dictionary_encode()}
        )
    elif kind == "numeric":
        table = pa.table(
            {
                "LAT": [0.0, None, float("nan"), 91.0, float("inf"), -90.0, 0.0, 0.0],
                "lng": [0.0, 0.0, 0.0, 181.0, 0.0, -180.0, 0.0, 0.0],
                "speed": [1.0, -1.0, 1.0, -2.0, float("-inf"), 0.0, 1.0, 1.0],
                "velocity": [0.0, 0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 0.0],
            }
        )
    elif kind == "text":
        table = pa.table(
            {
                "lat": ["0", " null ", " NaN ", "bad", "91", "0", None],
                "lon": ["0", "0", "0", "0", "-181", "0", "0"],
                "speed": ["-1", "0", "inf", "bad", "0", "-1", "0"],
                "other": ["x", "\u2003", "NONE", "x", "x", "x", "x"],
            }
        )
    elif kind == "boolean":
        table = pa.table(
            {"latitude": [True, False, None, True], "speed": [True, False, None, True]}
        )
    elif kind == "nested":
        table = pa.table(
            {
                "data": [[1, None], [1, None], None, [2]],
                "meta": [{"x": 1}, {"x": 1}, {"x": 2}, {"x": 3}],
            }
        )
    else:
        table = pa.table({"latitude": pa.array([], type=pa.float64())})

    dataset_id = uuid4()
    staging = tmp_path / "staging"
    staging.mkdir()
    path = staging / "data.parquet"
    pq.write_table(table, path)
    (staging / "data.json").write_text(
        json.dumps({"dataset_id": str(dataset_id), "staging_file_path": str(path)})
    )
    monkeypatch.setattr(normalized_data_validation_service, "DATASET_UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(normalized_data_validation_service, "VALIDATION_BATCH_SIZE", batch_size)

    counts = {
        "missing_values": 0,
        "duplicate_records": 0,
        "invalid_coordinates": 0,
        "negative_speed": 0,
    }
    seen = set()
    invalid_count = 0
    names = {name.lower(): name for name in table.column_names}
    for row in table.to_pylist():
        missing = sum(
            normalized_data_validation_service._is_missing(value) for value in row.values()
        )
        serialized = json.dumps(row, sort_keys=True, separators=(",", ":"), default=str)
        duplicate = serialized in seen
        seen.add(serialized)
        coordinate = False
        for aliases, lower, upper in [
            (("latitude", "lat"), -90, 90),
            (("longitude", "lon", "lng"), -180, 180),
        ]:
            name = next((names[alias] for alias in aliases if alias in names), None)
            if name is None:
                continue
            raw = row[name]
            value = normalized_data_validation_service._number(raw)
            coordinate |= (
                (not math.isfinite(value) or not lower <= value <= upper)
                if value is not None
                else not normalized_data_validation_service._is_missing(raw)
            )
        negative = any(
            (value := normalized_data_validation_service._number(row[names[alias]])) is not None
            and value < 0
            for alias in ("speed", "velocity")
            if alias in names
        )
        counts["missing_values"] += missing
        counts["duplicate_records"] += duplicate
        counts["invalid_coordinates"] += coordinate
        counts["negative_speed"] += negative
        invalid_count += bool(missing or duplicate or coordinate or negative)

    result = validate_normalized_dataset_service(dataset_id=dataset_id)
    assert result.validation_results.model_dump() == counts
    assert result.invalid_rows == invalid_count
    assert result.valid_rows == table.num_rows - invalid_count


def test_validation_rechecks_modified_file(tmp_path: Path, monkeypatch) -> None:
    dataset_id = uuid4()
    staging = tmp_path / "staging"
    staging.mkdir()
    path = staging / "data.parquet"
    (staging / "data.json").write_text(
        json.dumps({"dataset_id": str(dataset_id), "staging_file_path": str(path)})
    )
    monkeypatch.setattr(normalized_data_validation_service, "DATASET_UPLOAD_DIR", tmp_path)
    pq.write_table(pa.table({"speed": [1]}), path)
    assert validate_normalized_dataset_service(dataset_id=dataset_id).valid_rows == 1
    pq.write_table(pa.table({"speed": [-1]}), path)
    assert validate_normalized_dataset_service(dataset_id=dataset_id).invalid_rows == 1
