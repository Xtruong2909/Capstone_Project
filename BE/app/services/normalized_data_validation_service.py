import hashlib
import json
import logging
import math
import sqlite3
import tempfile
from pathlib import Path
from typing import Any
from uuid import UUID

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq
from fastapi import HTTPException, status

from app.core.config import DATASET_UPLOAD_DIR
from app.schemas.dataset_normalization import (
    NormalizedDataValidationCounts,
    NormalizedDataValidationResponse,
)

logger = logging.getLogger(__name__)
COORDINATE_ALIASES = {
    "latitude": ("latitude", "lat"),
    "longitude": ("longitude", "lon", "lng"),
}
SPEED_ALIASES = ("speed", "velocity")
MISSING_TEXT_VALUES = {"", "null", "none", "nan"}
VALIDATION_BATCH_SIZE = 65_536


def _missing_mask(column: pa.Array) -> pa.Array:
    if pa.types.is_dictionary(column.type):
        return _missing_mask(column.dictionary_decode())
    if pa.types.is_floating(column.type):
        return pc.or_(pc.is_null(column), pc.fill_null(pc.is_nan(column), False))
    if pa.types.is_string(column.type) or pa.types.is_large_string(column.type):
        # Preserve Python strip/lower semantics, including Unicode whitespace.
        return pa.array([_is_missing(value) for value in column.to_pylist()])
    return pc.is_null(column)


def _coordinate_mask(column: pa.Array, lower: int, upper: int) -> pa.Array:
    if pa.types.is_unsigned_integer(column.type):
        return pc.fill_null(pc.greater(column, pa.scalar(upper, type=column.type)), False)
    if pa.types.is_integer(column.type) or pa.types.is_floating(column.type):
        invalid = pc.or_(pc.less(column, lower), pc.greater(column, upper))
        if pa.types.is_floating(column.type):
            invalid = pc.or_(invalid, pc.is_nan(column))
        return pc.fill_null(invalid, False)
    flags = []
    for raw in column.to_pylist():
        value = _number(raw)
        flags.append(
            (not math.isfinite(value) or not lower <= value <= upper)
            if value is not None
            else not _is_missing(raw)
        )
    return pa.array(flags, type=pa.bool_())


def _negative_mask(column: pa.Array) -> pa.Array:
    if pa.types.is_unsigned_integer(column.type):
        return pa.array([False] * len(column))
    if pa.types.is_integer(column.type) or pa.types.is_floating(column.type):
        return pc.fill_null(pc.less(column, 0), False)
    return pa.array(
        [(value := _number(raw)) is not None and value < 0 for raw in column.to_pylist()],
        type=pa.bool_(),
    )


def _count_mask(mask: pa.Array) -> int:
    return pc.sum(mask).as_py() or 0


def _latest_staging_file(dataset_id: UUID) -> Path:
    staging_dir = (DATASET_UPLOAD_DIR / "staging").resolve()
    if not staging_dir.is_dir():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset chưa có dữ liệu staging đã chuẩn hóa.",
        )

    candidates: list[tuple[float, Path]] = []
    for metadata_path in staging_dir.glob("*.json"):
        try:
            with metadata_path.open("r", encoding="utf-8") as metadata_file:
                metadata = json.load(metadata_file)
            if metadata.get("dataset_id") != str(dataset_id):
                continue

            file_path = Path(str(metadata.get("staging_file_path", ""))).resolve()
            file_path.relative_to(staging_dir)
            if file_path.is_file():
                candidates.append((metadata_path.stat().st_mtime, file_path))
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            logger.warning(
                "Skipping invalid normalized staging metadata %s: %s",
                metadata_path,
                exc,
            )
            continue

    if not candidates:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy file staging đã chuẩn hóa cho dataset này.",
        )
    return max(candidates, key=lambda candidate: candidate[0])[1]


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _is_missing(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip().lower() in MISSING_TEXT_VALUES
    if isinstance(value, float):
        return math.isnan(value)
    return False


def validate_normalized_dataset_service(
    *,
    dataset_id: UUID,
) -> NormalizedDataValidationResponse:
    staging_file = _latest_staging_file(dataset_id)
    try:
        parquet_file = pq.ParquetFile(staging_file)
        columns = parquet_file.schema_arrow.names
    except (OSError, ValueError, pq.ArrowException) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Không đọc được file dữ liệu staging đã chuẩn hóa.",
        ) from exc

    normalized_names = {column.lower(): column for column in columns}
    coordinate_columns = {
        role: next(
            (normalized_names[alias] for alias in aliases if alias in normalized_names),
            None,
        )
        for role, aliases in COORDINATE_ALIASES.items()
    }
    speed_columns = [
        normalized_names[alias] for alias in SPEED_ALIASES if alias in normalized_names
    ]

    results = {
        "missing_values": 0,
        "duplicate_records": 0,
        "invalid_coordinates": 0,
        "negative_speed": 0,
    }
    total_rows = 0
    valid_rows = 0

    try:
        with tempfile.TemporaryDirectory(prefix="normalized-validation-") as temp_dir:
            connection = sqlite3.connect(str(Path(temp_dir) / "validation.sqlite"))
            try:
                # Scratch DB only: disposable on failure; no durability fsync needed.
                connection.execute("PRAGMA journal_mode=OFF")
                connection.execute("PRAGMA synchronous=OFF")
                connection.execute("PRAGMA cache_size=-32768")
                connection.execute(
                    "CREATE TABLE seen_records (digest BLOB PRIMARY KEY) WITHOUT ROWID"
                )
                connection.execute(
                    "CREATE TEMP TABLE incoming (digest BLOB PRIMARY KEY, invalid INTEGER NOT NULL) WITHOUT ROWID"
                )

                for batch in parquet_file.iter_batches(batch_size=VALIDATION_BATCH_SIZE):
                    total_rows += batch.num_rows
                    invalid = pa.array([False] * batch.num_rows)
                    for column in batch.columns:
                        missing = _missing_mask(column)
                        results["missing_values"] += _count_mask(missing)
                        invalid = pc.or_(invalid, missing)

                    invalid_coordinates = pa.array([False] * batch.num_rows)
                    for role, name in coordinate_columns.items():
                        if name is not None:
                            lower, upper = (-90, 90) if role == "latitude" else (-180, 180)
                            invalid_coordinates = pc.or_(
                                invalid_coordinates,
                                _coordinate_mask(batch.column(name), lower, upper),
                            )
                    results["invalid_coordinates"] += _count_mask(invalid_coordinates)
                    invalid = pc.or_(invalid, invalid_coordinates)
                    negative_speed = pa.array([False] * batch.num_rows)
                    for name in speed_columns:
                        negative_speed = pc.or_(negative_speed, _negative_mask(batch.column(name)))
                    results["negative_speed"] += _count_mask(negative_speed)
                    invalid = pc.or_(invalid, negative_speed)

                    # Column names/order are fixed within a file: a JSON tuple has
                    # the same row-equality semantics without rebuilding row dicts.
                    # Retain canonical nested values, null/NaN and default=str.
                    values = batch.to_pydict()
                    rows = zip(*(values[name] for name in sorted(values)), strict=True)
                    incoming: dict[bytes, bool] = {}
                    for row, row_invalid in zip(rows, invalid.to_pylist(), strict=True):
                        serialized = json.dumps(
                            row, sort_keys=True, separators=(",", ":"), default=str
                        ).encode("utf-8")
                        digest = hashlib.blake2b(serialized, digest_size=16).digest()
                        incoming.setdefault(digest, row_invalid)

                    connection.execute("DELETE FROM incoming")
                    connection.executemany("INSERT INTO incoming VALUES (?, ?)", incoming.items())
                    new_count, new_valid = connection.execute(
                        "SELECT COUNT(*), COALESCE(SUM(i.invalid = 0), 0) "
                        "FROM incoming i LEFT JOIN seen_records s ON s.digest = i.digest "
                        "WHERE s.digest IS NULL"
                    ).fetchone()
                    results["duplicate_records"] += batch.num_rows - new_count
                    valid_rows += new_valid
                    connection.execute(
                        "INSERT OR IGNORE INTO seen_records SELECT digest FROM incoming"
                    )

                invalid_rows = total_rows - valid_rows
            finally:
                connection.close()
    except (OSError, sqlite3.Error, ValueError, pa.ArrowException) as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể hoàn tất kiểm tra dữ liệu đã chuẩn hóa.",
        ) from exc
    finally:
        parquet_file.close()

    return NormalizedDataValidationResponse(
        dataset_id=dataset_id,
        validation_status="completed",
        total_rows=total_rows,
        valid_rows=total_rows - invalid_rows,
        invalid_rows=invalid_rows,
        validation_results=NormalizedDataValidationCounts(**results),
    )
