import hashlib
import json
import logging
import math
import sqlite3
import tempfile
from pathlib import Path
from typing import Any
from uuid import UUID

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
            (
                normalized_names[alias]
                for alias in aliases
                if alias in normalized_names
            ),
            None,
        )
        for role, aliases in COORDINATE_ALIASES.items()
    }
    speed_columns = [
        normalized_names[alias]
        for alias in SPEED_ALIASES
        if alias in normalized_names
    ]

    results = {
        "missing_values": 0,
        "duplicate_records": 0,
        "invalid_coordinates": 0,
        "negative_speed": 0,
    }
    total_rows = 0

    try:
        with tempfile.TemporaryDirectory(prefix="normalized-validation-") as temp_dir:
            connection = sqlite3.connect(str(Path(temp_dir) / "validation.sqlite"))
            try:
                connection.execute(
                    "CREATE TABLE seen_records (digest BLOB PRIMARY KEY)"
                )
                connection.execute(
                    "CREATE TABLE invalid_rows (row_number INTEGER PRIMARY KEY)"
                )

                for batch in parquet_file.iter_batches(batch_size=10_000):
                    invalid_batch: list[tuple[int]] = []
                    for row in batch.to_pylist():
                        total_rows += 1
                        row_invalid = False

                        missing_count = sum(
                            _is_missing(value) for value in row.values()
                        )
                        if missing_count:
                            results["missing_values"] += missing_count
                            row_invalid = True

                        serialized = json.dumps(
                            row,
                            sort_keys=True,
                            separators=(",", ":"),
                            default=str,
                        ).encode("utf-8")
                        digest = hashlib.blake2b(serialized, digest_size=16).digest()
                        cursor = connection.execute(
                            "INSERT OR IGNORE INTO seen_records (digest) VALUES (?)",
                            (digest,),
                        )
                        if cursor.rowcount == 0:
                            results["duplicate_records"] += 1
                            row_invalid = True

                        invalid_coordinate = False
                        for role, column in coordinate_columns.items():
                            if column is None:
                                continue
                            value = _number(row.get(column))
                            lower, upper = (
                                (-90, 90) if role == "latitude" else (-180, 180)
                            )
                            if value is not None and (
                                not math.isfinite(value) or not lower <= value <= upper
                            ) or value is None and not _is_missing(row.get(column)):
                                invalid_coordinate = True
                        if invalid_coordinate:
                            results["invalid_coordinates"] += 1
                            row_invalid = True

                        if any(
                            (value := _number(row.get(column))) is not None and value < 0
                            for column in speed_columns
                        ):
                            results["negative_speed"] += 1
                            row_invalid = True

                        if row_invalid:
                            invalid_batch.append((total_rows,))

                    connection.executemany(
                        "INSERT OR IGNORE INTO invalid_rows (row_number) VALUES (?)",
                        invalid_batch,
                    )
                    connection.commit()

                invalid_rows = connection.execute(
                    "SELECT COUNT(*) FROM invalid_rows"
                ).fetchone()[0]
            finally:
                connection.close()
    except (OSError, sqlite3.Error, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể hoàn tất kiểm tra dữ liệu đã chuẩn hóa.",
        ) from exc

    return NormalizedDataValidationResponse(
        dataset_id=dataset_id,
        validation_status="completed",
        total_rows=total_rows,
        valid_rows=total_rows - invalid_rows,
        invalid_rows=invalid_rows,
        validation_results=NormalizedDataValidationCounts(**results),
    )
