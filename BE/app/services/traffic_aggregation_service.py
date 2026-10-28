from __future__ import annotations

import csv
import logging
import time
from collections import defaultdict
from collections.abc import Iterable, Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID

import pyarrow.parquet as pq
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.crud import crud_dataset
from app.database.database import SessionLocal
from app.models.dataset import DatasetVersion
from app.models.traffic import TrafficAggregationJob, TrafficTimeSeries

DEFAULT_DENSITY_AREA_M2 = 1000.0
logger = logging.getLogger(__name__)


def _log_timing(stage: str, started_at: float, **extra: Any) -> None:
    elapsed_ms = round((time.perf_counter() - started_at) * 1000, 2)
    logger.info(
        "traffic aggregation step completed",
        extra={
            "stage": stage,
            "elapsed_ms": elapsed_ms,
            **extra,
        },
    )


def _resolve_dataset_version_path(version: DatasetVersion) -> Path:
    stored_path = (
        version.data_file_path
        or version.csv_file_path
        or version.parquet_file_path
        or version.geojson_file_path
    )
    if not stored_path:
        raise HTTPException(status_code=404, detail="Dataset version does not contain a file path")

    path = Path(stored_path)
    if not path.is_absolute():
        from app.core.config import DATASET_UPLOAD_DIR

        path = DATASET_UPLOAD_DIR / path
    resolved = path.resolve(strict=False)
    if not resolved.exists():
        raise HTTPException(status_code=404, detail="Dataset file for aggregation was not found")
    return resolved


def _parse_datetime(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=UTC)
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        if cleaned.isdigit() or (cleaned.startswith("-") and cleaned[1:].isdigit()):
            try:
                return datetime.fromtimestamp(float(cleaned), tz=UTC)
            except (OverflowError, OSError, ValueError):
                return None
        try:
            parsed = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=UTC)
            return parsed.astimezone(UTC)
        except ValueError:
            return None
    return None


def _floor_to_interval(timestamp: datetime, aggregation_interval: int) -> datetime:
    second_of_day = timestamp.hour * 3600 + timestamp.minute * 60 + timestamp.second
    interval_seconds = second_of_day % aggregation_interval
    floored = timestamp - timedelta(seconds=interval_seconds)
    return floored.replace(microsecond=0)


def _first_non_empty_value(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = row.get(key)
        if value is None:
            continue
        if isinstance(value, str) and value.strip() == "":
            continue
        return value
    return None


def _coerce_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _coerce_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        try:
            return int(float(cleaned))
        except ValueError:
            return None
    return None


def _congestion_level(mean_speed: float) -> str:
    if mean_speed < 20.0:
        return "HEAVY"
    if mean_speed < 40.0:
        return "MODERATE"
    if mean_speed < 60.0:
        return "STABLE"
    return "FREE_FLOW"


def _is_header_row(row: dict[str, Any]) -> bool:
    if not row:
        return False
    normalized = {
        str(key).strip().lower(): str(value).strip().lower() if value is not None else ""
        for key, value in row.items()
    }
    return bool(normalized) and all(value == key for key, value in normalized.items())


def _iter_rows_from_version(version: DatasetVersion) -> Iterator[dict[str, Any]]:
    stored_path = _resolve_dataset_version_path(version)
    suffix = stored_path.suffix.lower()

    if suffix == ".parquet":
        parquet_file = pq.ParquetFile(stored_path)
        for batch in parquet_file.iter_batches(batch_size=65536):
            for row in batch.to_pylist():
                if not _is_header_row(row):
                    yield row
        return

    if suffix == ".csv":
        with stored_path.open("r", encoding="utf-8-sig", newline="") as source:
            reader = csv.DictReader(source)
            for row in reader:
                cleaned = {key: value for key, value in row.items() if key is not None}
                if cleaned:
                    yield cleaned
        return

    if suffix in {".json", ".geojson"}:
        with stored_path.open("r", encoding="utf-8-sig") as source:
            payload = __import__("json").load(source)
        if isinstance(payload, dict):
            rows = payload.get("features")
            if rows is not None:
                for feature in rows:
                    if isinstance(feature, dict):
                        props = feature.get("properties", {})
                        if isinstance(props, dict):
                            yield props
                return
            data = payload.get("data")
            if isinstance(data, list):
                for item in data:
                    yield item
                return
            yield payload
            return
        if isinstance(payload, list):
            for item in payload:
                yield item
            return
        return

    raise HTTPException(status_code=415, detail=f"Unsupported dataset format for aggregation: {suffix or version.file_format}")


def _read_rows_from_version(version: DatasetVersion) -> list[dict[str, Any]]:
    return list(_iter_rows_from_version(version))


def aggregate_time_series_rows(
    rows: Iterable[dict[str, Any]],
    *,
    aggregation_interval: int = 60,
    roi_identifier: str = "MAIN_ROI",
) -> list[dict[str, Any]]:
    if aggregation_interval <= 0:
        raise ValueError("aggregation_interval must be positive")

    buckets: dict[datetime, dict[str, Any]] = {}
    for row in rows:
        timestamp_value = _first_non_empty_value(row, "time", "timestamp", "timestamp_ms", "datetime")
        timestamp = _parse_datetime(timestamp_value)
        if timestamp is None:
            continue

        bucket_start = _floor_to_interval(timestamp, aggregation_interval)
        group = buckets.setdefault(
            bucket_start,
            {
                "track_ids": set(),
                "speed_values": [],
            },
        )

        track_id = _first_non_empty_value(row, "track_id", "vehicle_id", "id")
        if track_id is not None:
            group["track_ids"].add(str(track_id))

        speed_value = _coerce_float(_first_non_empty_value(row, "speed", "avg_speed"))
        if speed_value is not None:
            group["speed_values"].append(speed_value)

    aggregated: list[dict[str, Any]] = []
    for bucket_start, group in sorted(buckets.items()):
        unique_vehicle_count = len(group["track_ids"])
        mean_speed = 0.0
        if group["speed_values"]:
            mean_speed = sum(group["speed_values"]) / len(group["speed_values"])

        traffic_flow = unique_vehicle_count / (aggregation_interval / 60.0)
        traffic_density = unique_vehicle_count / DEFAULT_DENSITY_AREA_M2
        aggregated.append(
            {
                "time_bucket": bucket_start,
                "aggregation_interval": aggregation_interval,
                "roi_identifier": roi_identifier,
                "vehicle_count": unique_vehicle_count,
                "traffic_flow": round(traffic_flow, 2),
                "traffic_density": round(traffic_density, 4),
                "mean_speed": round(mean_speed, 2),
                "congestion_level": _congestion_level(mean_speed),
            }
        )
    return aggregated


def _to_db_row(dataset_version_id: UUID, bucket: dict[str, Any]) -> TrafficTimeSeries:
    return TrafficTimeSeries(
        dataset_version_id=dataset_version_id,
        time_bucket=bucket["time_bucket"],
        aggregation_interval=bucket["aggregation_interval"],
        roi_identifier=bucket["roi_identifier"],
        vehicle_count=bucket["vehicle_count"],
        traffic_flow=bucket["traffic_flow"],
        traffic_density=bucket["traffic_density"],
        mean_speed=bucket["mean_speed"],
        congestion_level=bucket["congestion_level"],
    )


def build_traffic_aggregation(
    db: Session,
    *,
    dataset_id: UUID,
    version_id: UUID | None = None,
    aggregation_interval: int = 60,
    roi_identifier: str = "MAIN_ROI",
    replace_existing: bool = False,
) -> dict[str, Any]:
    total_started = time.perf_counter()
    logger.info(
        "traffic aggregation started",
        extra={
            "dataset_id": str(dataset_id),
            "version_id": str(version_id) if version_id else None,
            "aggregation_interval": aggregation_interval,
            "roi_identifier": roi_identifier,
            "replace_existing": replace_existing,
        },
    )

    dataset, version = (
        crud_dataset.get_dataset_version(db, dataset_id, version_id)
        if version_id is not None
        else crud_dataset.get_dataset_latest_version(db, dataset_id)
    )
    if dataset is None or version is None:
        raise HTTPException(status_code=404, detail="Dataset version was not found")

    resolve_started = time.perf_counter()
    rows_iterator = _iter_rows_from_version(version)
    buckets = aggregate_time_series_rows(
        rows_iterator,
        aggregation_interval=aggregation_interval,
        roi_identifier=roi_identifier,
    )
    _log_timing("read_and_aggregate_rows", resolve_started, dataset_id=str(dataset.id), version_id=str(version.id))

    if replace_existing:
        query_started = time.perf_counter()
        db.query(TrafficTimeSeries).filter(
            TrafficTimeSeries.dataset_version_id == version.id,
            TrafficTimeSeries.aggregation_interval == aggregation_interval,
            TrafficTimeSeries.roi_identifier == roi_identifier,
        ).delete()
        existing_bucket_times: set[datetime] = set()
        _log_timing("delete_existing_rows", query_started, dataset_id=str(dataset.id), version_id=str(version.id))
    else:
        query_started = time.perf_counter()
        existing_bucket_times = {
            row[0]
            for row in (
                db.query(TrafficTimeSeries.time_bucket)
                .filter(
                    TrafficTimeSeries.dataset_version_id == version.id,
                    TrafficTimeSeries.aggregation_interval == aggregation_interval,
                    TrafficTimeSeries.roi_identifier == roi_identifier,
                )
                .all()
            )
        }
        _log_timing("fetch_existing_bucket_times", query_started, dataset_id=str(dataset.id), version_id=str(version.id))

    new_rows: list[TrafficTimeSeries] = []
    persisted_count = 0
    persist_started = time.perf_counter()
    for bucket in buckets:
        if not replace_existing and bucket["time_bucket"] in existing_bucket_times:
            continue
        new_rows.append(_to_db_row(version.id, bucket))
        persisted_count += 1

    if new_rows:
        db.add_all(new_rows)
        db.commit()
    _log_timing("persist_new_rows", persist_started, dataset_id=str(dataset.id), version_id=str(version.id), rows_to_persist=len(new_rows))
    _log_timing("total_aggregation", total_started, dataset_id=str(dataset.id), version_id=str(version.id), records_created=persisted_count)
    return {
        "dataset_id": dataset.id,
        "dataset_version_id": version.id,
        "aggregation_interval": aggregation_interval,
        "roi_identifier": roi_identifier,
        "records_created": persisted_count,
        "generated_at": datetime.now(UTC),
        "reused_existing": not replace_existing and persisted_count == 0,
    }


def _get_traffic_job_record(db: Session, *, dataset_id: UUID, job_id: UUID) -> TrafficAggregationJob | None:
    return (
        db.query(TrafficAggregationJob)
        .filter(
            TrafficAggregationJob.id == job_id,
            TrafficAggregationJob.dataset_id == dataset_id,
        )
        .one_or_none()
    )


def _update_traffic_job_status(
    db: Session,
    *,
    job: TrafficAggregationJob,
    status: str,
    progress_percent: int | None = None,
    records_created: int | None = None,
    error_message: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    job.status = status
    if progress_percent is not None:
        job.progress_percent = max(0, min(100, progress_percent))
    if records_created is not None:
        job.records_created = records_created
    if error_message is not None:
        job.error_message = error_message
    if metadata is not None:
        job.job_metadata = metadata
    job.updated_at = datetime.now(UTC)
    if status in {"completed", "failed"}:
        job.completed_at = datetime.now(UTC)
    db.add(job)
    db.commit()


def run_traffic_aggregation_job(
    *,
    db_session_factory,
    dataset_id: UUID,
    version_id: UUID,
    aggregation_interval: int,
    roi_identifier: str,
    replace_existing: bool = False,
    job_id: UUID | None = None,
) -> None:
    started_at = time.perf_counter()
    job_db = db_session_factory()
    job = None
    if job_id is not None:
        job = (
            job_db.query(TrafficAggregationJob)
            .filter(TrafficAggregationJob.id == job_id, TrafficAggregationJob.dataset_id == dataset_id)
            .one_or_none()
        )
        if job is not None:
            job.status = "running"
            job.started_at = datetime.now(UTC)
            job.updated_at = datetime.now(UTC)
            job_db.add(job)
            job_db.commit()

    logger.info(
        "traffic aggregation background job started",
        extra={
            "dataset_id": str(dataset_id),
            "version_id": str(version_id),
            "aggregation_interval": aggregation_interval,
            "roi_identifier": roi_identifier,
            "job_id": str(job_id) if job_id else None,
        },
    )
    try:
        result = build_traffic_aggregation(
            job_db,
            dataset_id=dataset_id,
            version_id=version_id,
            aggregation_interval=aggregation_interval,
            roi_identifier=roi_identifier,
            replace_existing=replace_existing,
        )
        if job is not None:
            _update_traffic_job_status(
                job_db,
                job=job,
                status="completed",
                progress_percent=100,
                records_created=result["records_created"],
                metadata={
                    "dataset_version_id": str(version_id),
                    "aggregation_interval": aggregation_interval,
                    "roi_identifier": roi_identifier,
                    "records_created": result["records_created"],
                },
            )
        _log_timing("background_job_total", started_at, dataset_id=str(dataset_id), version_id=str(version_id), job_id=str(job_id) if job_id else None)
    except Exception as exc:
        if job is not None:
            _update_traffic_job_status(
                job_db,
                job=job,
                status="failed",
                progress_percent=100,
                error_message=str(exc),
                metadata={
                    "dataset_version_id": str(version_id),
                    "aggregation_interval": aggregation_interval,
                    "roi_identifier": roi_identifier,
                },
            )
        logger.exception(
            "traffic aggregation background job failed",
            extra={
                "dataset_id": str(dataset_id),
                "version_id": str(version_id),
                "aggregation_interval": aggregation_interval,
                "roi_identifier": roi_identifier,
                "job_id": str(job_id) if job_id else None,
            },
        )
        raise
    finally:
        job_db.close()


def get_traffic_aggregation_job_status(db: Session, *, dataset_id: UUID, job_id: UUID) -> TrafficAggregationJob:
    job = _get_traffic_job_record(db, dataset_id=dataset_id, job_id=job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Traffic aggregation job was not found")
    return job


def get_traffic_aggregation_status(
    db: Session,
    *,
    dataset_id: UUID,
    version_id: UUID | None = None,
    aggregation_interval: int = 60,
    roi_identifier: str = "MAIN_ROI",
) -> dict[str, Any]:
    _, version = (
        crud_dataset.get_dataset_version(db, dataset_id, version_id)
        if version_id is not None
        else crud_dataset.get_dataset_latest_version(db, dataset_id)
    )
    if version is None:
        raise HTTPException(status_code=404, detail="Dataset version was not found")

    latest = (
        db.query(TrafficTimeSeries)
        .filter(
            TrafficTimeSeries.dataset_version_id == version.id,
            TrafficTimeSeries.aggregation_interval == aggregation_interval,
            TrafficTimeSeries.roi_identifier == roi_identifier,
        )
        .order_by(TrafficTimeSeries.time_bucket.desc())
        .first()
    )
    records_count = (
        db.query(TrafficTimeSeries)
        .filter(
            TrafficTimeSeries.dataset_version_id == version.id,
            TrafficTimeSeries.aggregation_interval == aggregation_interval,
            TrafficTimeSeries.roi_identifier == roi_identifier,
        )
        .count()
    )
    return {
        "dataset_id": dataset_id,
        "dataset_version_id": version.id,
        "aggregation_interval": aggregation_interval,
        "roi_identifier": roi_identifier,
        "records_count": records_count,
        "last_generated_at": latest.created_at if latest else None,
        "is_ready": records_count > 0,
    }


def preview_traffic_aggregation(
    db: Session,
    *,
    dataset_id: UUID,
    version_id: UUID | None = None,
    aggregation_interval: int = 60,
    roi_identifier: str = "MAIN_ROI",
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    _, version = (
        crud_dataset.get_dataset_version(db, dataset_id, version_id)
        if version_id is not None
        else crud_dataset.get_dataset_latest_version(db, dataset_id)
    )
    if version is None:
        raise HTTPException(status_code=404, detail="Dataset version was not found")

    query = (
        db.query(TrafficTimeSeries)
        .filter(
            TrafficTimeSeries.dataset_version_id == version.id,
            TrafficTimeSeries.aggregation_interval == aggregation_interval,
            TrafficTimeSeries.roi_identifier == roi_identifier,
        )
        .order_by(TrafficTimeSeries.time_bucket.desc())
    )
    if start_time is not None:
        query = query.filter(TrafficTimeSeries.time_bucket >= start_time)
    if end_time is not None:
        query = query.filter(TrafficTimeSeries.time_bucket <= end_time)

    total_count = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size + 1).all()
    has_more = len(items) > page_size
    page_items = items[:page_size]
    return {
        "dataset_id": dataset_id,
        "dataset_version_id": version.id,
        "roi_identifier": roi_identifier,
        "aggregation_interval": aggregation_interval,
        "items": page_items,
        "page": page,
        "page_size": page_size,
        "has_more": has_more,
        "total_count": total_count,
    }


def get_traffic_chart_data(
    db: Session,
    *,
    dataset_id: UUID,
    version_id: UUID | None = None,
    aggregation_interval: int = 60,
    roi_identifier: str = "MAIN_ROI",
    start_time: datetime | None = None,
    end_time: datetime | None = None,
) -> dict[str, Any]:
    _, version = (
        crud_dataset.get_dataset_version(db, dataset_id, version_id)
        if version_id is not None
        else crud_dataset.get_dataset_latest_version(db, dataset_id)
    )
    if version is None:
        raise HTTPException(status_code=404, detail="Dataset version was not found")

    query = (
        db.query(TrafficTimeSeries)
        .filter(
            TrafficTimeSeries.dataset_version_id == version.id,
            TrafficTimeSeries.aggregation_interval == aggregation_interval,
            TrafficTimeSeries.roi_identifier == roi_identifier,
        )
        .order_by(TrafficTimeSeries.time_bucket.asc())
    )
    if start_time is not None:
        query = query.filter(TrafficTimeSeries.time_bucket >= start_time)
    if end_time is not None:
        query = query.filter(TrafficTimeSeries.time_bucket <= end_time)

    rows = query.all()
    return {
        "dataset_id": dataset_id,
        "dataset_version_id": version.id,
        "aggregation_interval": aggregation_interval,
        "roi_identifier": roi_identifier,
        "time_labels": [item.time_bucket.isoformat() for item in rows],
        "vehicle_count": [int(item.vehicle_count) for item in rows],
        "average_speed": [float(item.mean_speed) for item in rows],
        "traffic_density": [float(item.traffic_density) for item in rows],
        "traffic_flow": [float(item.traffic_flow) for item in rows],
    }
