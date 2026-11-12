"""Count distinct vehicles per time bin in each normalized Recording Session."""

from __future__ import annotations

import csv
import logging
import math
from collections import deque
from collections.abc import Iterable, Iterator
from datetime import UTC, datetime, timedelta
from itertools import islice
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import pyarrow.parquet as pq
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.crud import crud_traffic_aggregation as repo
from app.models.dataset import DataCleaningHistory, DatasetVersion, RecordingSession
from app.models.traffic import (
    TrafficAggregationJob,
    TrafficAggregationSessionResult,
    TrafficTimeSeries,
)
from app.models.user import User
from app.schemas.traffic_aggregation import (
    AggregationSessionRunStatus,
    CombinedTemporalAggregationDataPoint,
    CombinedTemporalAggregationResults,
    DatasetVersionAggregationResults,
    DatasetVersionAggregationStarted,
    DatasetVersionTemporalAggregationRequest,
    TemporalAggregationDataPoint,
)
from app.services.dataset_access_service import check_dataset_access
from app.services.dataset_normalization_service import _csv_delimiter
from app.services.dataset_preview_service import (
    DatasetPreviewNotFoundError,
    resolve_stored_file_path,
)
from app.services.normalization_batch import FIELDS
from app.services.recording_time_service import (
    numeric_timestamp,
    recording_start_from_filename,
    recording_timestamp,
)

logger = logging.getLogger(__name__)
WORKFLOW_KEY = "ds_temporal_v1"
DEFAULT_BATCH_SIZE = 65_536


class SessionAggregationError(ValueError):
    """The normalized observations cannot be attributed or counted safely."""


def _source_sessions(
    db: Session, dataset_id: UUID, version_id: UUID, history: DataCleaningHistory,
) -> list[RecordingSession]:
    raw_ids = (history.parameters or {}).get("source_session_ids") or []
    if raw_ids:
        try:
            source_ids = [UUID(str(value)) for value in raw_ids]
        except (TypeError, ValueError) as exc:
            raise HTTPException(409, "Invalid source session provenance") from exc
        sessions = repo.get_sessions_by_ids(db, dataset_id, source_ids)
        by_id = {session.id: session for session in sessions}
        if len(by_id) != len(source_ids):
            raise HTTPException(409, "A source Recording Session is missing")
        return [by_id[session_id] for session_id in source_ids]
    return [
        session for session in repo.get_version_sessions(db, version_id)
        if session.dataset_id == dataset_id
    ]


def _normalized_path(version: DatasetVersion) -> Path:
    if version.file_format.upper() != "PARQUET":
        raise HTTPException(409, "Dataset Version must be exported as normalized Parquet")
    try:
        return resolve_stored_file_path(version.parquet_file_path or version.data_file_path)
    except DatasetPreviewNotFoundError as exc:
        raise HTTPException(409, "Normalized Parquet file is missing") from exc


def create_temporal_aggregation(
    db: Session, user: User, payload: DatasetVersionTemporalAggregationRequest,
) -> tuple[TrafficAggregationJob, list[TrafficAggregationSessionResult]]:
    if user.role_id not in ("admin", "data_scientist"):
        raise HTTPException(403, "Data Scientist role required")
    pair = repo.get_dataset_version(db, payload.dataset_version_id)
    if pair is None:
        raise HTTPException(404, "Dataset Version not found")
    dataset, version = pair
    check_dataset_access(user, dataset.id, db)
    if version.approval_status != "APPROVED":
        raise HTTPException(403, "Dataset Version is not approved")
    history = repo.get_cleaning_history(db, version.id)
    if history is None or not (history.parameters or {}).get("is_pneuma"):
        raise HTTPException(409, "Dataset Version has no normalized pNEUMA provenance")
    _normalized_path(version)
    sessions = _source_sessions(db, dataset.id, version.id, history)
    if not sessions:
        raise HTTPException(409, "Dataset Version has no Recording Sessions")
    active = repo.get_active_temporal_run(db, version.id)
    if active is not None:
        raise HTTPException(409, f"Aggregation is already processing: {active.id}")

    aggregation_id = uuid4()
    job = TrafficAggregationJob(
        id=aggregation_id,
        dataset_id=dataset.id,
        dataset_version_id=version.id,
        aggregation_interval=payload.aggregation_interval,
        roi_identifier="ALL_TRAJECTORY_POINTS",
        replace_existing=False,
        status="PROCESSING",
        progress_percent=0,
        records_created=0,
        total_sessions=len(sessions),
        completed_sessions=0,
        failed_sessions=0,
        job_metadata={
            "workflow": WORKFLOW_KEY,
            "session_ids": [str(session.id) for session in sessions],
            "source": "normalized_parquet",
            "timezone": "UTC",
            "vehicle_count": "COUNT DISTINCT track_id per session and time bin",
        },
        created_at=datetime.now(UTC),
    )
    results = [
        TrafficAggregationSessionResult(
            aggregation_id=aggregation_id,
            session_id=session.id,
            status="QUEUED",
            time_bins=0,
            records_read=0,
        )
        for session in sessions
    ]
    repo.create_temporal_run(db, job, results)
    return job, results


def _count_normalized_points(session: RecordingSession) -> int:
    """Recover row-boundary metadata for exports created before it was recorded.

    Source CSV is read only for the number of normalized points. Vehicle counts
    and timestamps always come from the exported normalized Parquet.
    """
    try:
        path = resolve_stored_file_path(session.file_path)
        with path.open("r", encoding="utf-8-sig", errors="replace", newline="") as source:
            first_line = source.readline()
            if not first_line:
                raise SessionAggregationError(f"Source Session {session.id} is empty")
            delimiter = _csv_delimiter(first_line)
            count = 0
            for row in csv.reader(source, delimiter=delimiter):
                if not row or not any(row):
                    continue
                if len(row) == len(FIELDS) and tuple(value.strip().lower() for value in row) == FIELDS:
                    continue
                while row and not row[-1].strip():
                    row.pop()
                count += max(0, (len(row) - 4) // 6)
            return count
    except (OSError, DatasetPreviewNotFoundError) as exc:
        raise SessionAggregationError(
            f"Session {session.id} has no row-boundary metadata and its source CSV cannot be read"
        ) from exc


def _session_row_counts(
    db: Session,
    history: DataCleaningHistory,
    sessions: list[RecordingSession],
    parquet_rows: int,
) -> list[int]:
    cached = (history.parameters or {}).get("source_session_row_counts") or {}
    if isinstance(cached, dict) and all(str(session.id) in cached for session in sessions):
        counts = [int(cached[str(session.id)]) for session in sessions]
    else:
        historical = repo.get_historical_session_row_counts(
            db, history.dataset_version_id, [session.id for session in sessions],
        )
        if historical is not None:
            counts = [historical[str(session.id)] for session in sessions]
        else:
            counts = [_count_normalized_points(session) for session in sessions]
    if any(count < 0 for count in counts) or sum(counts) != parquet_rows:
        raise SessionAggregationError(
            "Session row boundaries do not match the normalized Parquet row count"
        )
    if not (isinstance(cached, dict) and all(str(session.id) in cached for session in sessions)):
        repo.save_session_row_counts(
            db, history, {str(session.id): count for session, count in zip(sessions, counts)},
        )
    return counts


def _normalized_columns(parquet_file: pq.ParquetFile) -> tuple[str, str]:
    names = set(parquet_file.schema_arrow.names)
    track_column = next((name for name in ("track_id", "vehicle_id") if name in names), None)
    time_column = next((name for name in ("timestamp", "time", "datetime") if name in names), None)
    if track_column is None or time_column is None:
        raise SessionAggregationError("Normalized Parquet requires track_id and timestamp columns")
    return track_column, time_column


def _normalized_pairs(
    parquet_file: pq.ParquetFile, track_column: str, time_column: str,
) -> Iterator[tuple[Any, Any]]:
    for batch in parquet_file.iter_batches(
        batch_size=DEFAULT_BATCH_SIZE, columns=[track_column, time_column],
    ):
        track_index = batch.schema.get_field_index(track_column)
        time_index = batch.schema.get_field_index(time_column)
        yield from zip(
            batch.column(track_index).to_pylist(), batch.column(time_index).to_pylist(),
        )


def _timestamp(value: Any, recording_start: datetime | None) -> datetime:
    timestamp = numeric_timestamp(value)
    if timestamp is None and isinstance(value, str):
        try:
            timestamp = datetime.fromisoformat(value.strip())
        except ValueError:
            timestamp = None
    if timestamp is None:
        raise SessionAggregationError(f"Invalid normalized timestamp: {value!r}")
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=UTC)
    timestamp = timestamp.astimezone(UTC)
    if recording_start is not None:
        offset = timestamp - datetime(1970, 1, 1, tzinfo=UTC)
        if timedelta(0) <= offset < timedelta(days=1):
            timestamp = recording_start.astimezone(UTC) + offset
    return timestamp


def aggregate_normalized_rows(
    rows: Iterable[tuple[Any, Any]],
    *,
    aggregation_interval: int,
    recording_start: datetime | None,
) -> tuple[list[dict[str, Any]], int]:
    """Return observed bins only; track IDs are unique within each session/bin."""
    bins: dict[datetime, set[str]] = {}
    records_read = 0
    for track_value, time_value in rows:
        records_read += 1
        if track_value is None or str(track_value).strip() == "":
            raise SessionAggregationError(f"Missing track_id at normalized row {records_read}")
        timestamp = _timestamp(time_value, recording_start)
        bin_epoch = math.floor(timestamp.timestamp() / aggregation_interval) * aggregation_interval
        bucket = datetime.fromtimestamp(bin_epoch, tz=UTC)
        bins.setdefault(bucket, set()).add(str(track_value))
    if not bins:
        raise SessionAggregationError("Recording Session contains no normalized observations")
    return [
        {"time_bucket": timestamp, "vehicle_count": len(tracks)}
        for timestamp, tracks in sorted(bins.items())
    ], records_read


def _session_status(result: TrafficAggregationSessionResult) -> AggregationSessionRunStatus:
    return AggregationSessionRunStatus(
        session_id=result.session_id,
        status=result.status,
        time_bins=result.time_bins,
        records_read=result.records_read,
        error_message=result.error_message,
    )


def serialize_aggregation_run(
    job: TrafficAggregationJob, results: list[TrafficAggregationSessionResult],
) -> DatasetVersionAggregationStarted:
    return DatasetVersionAggregationStarted(
        aggregation_id=job.id,
        dataset_version_id=job.dataset_version_id,
        aggregation_interval=job.aggregation_interval,
        status=job.status,
        total_sessions=job.total_sessions,
        completed_sessions=job.completed_sessions,
        failed_sessions=job.failed_sessions,
        total_time_bins=sum(result.time_bins for result in results),
        sessions=[_session_status(result) for result in results],
    )


def _update_progress(db: Session, job: TrafficAggregationJob) -> None:
    job.progress_percent = int(
        100 * (job.completed_sessions + job.failed_sessions) / max(job.total_sessions, 1)
    )
    job.updated_at = datetime.now(UTC)
    db.add(job)
    db.commit()


def _fail_remaining_sessions(db: Session, job: TrafficAggregationJob, message: str) -> None:
    for result in repo.list_temporal_session_results(db, job.id):
        if result.status in ("QUEUED", "RUNNING"):
            result.status = "FAILED"
            result.error_message = message[:2000]
            result.completed_at = datetime.now(UTC)
            db.add(result)
            job.failed_sessions += 1
    db.commit()


def run_temporal_aggregation(*, db_session_factory: Any, aggregation_id: UUID) -> None:
    db = db_session_factory()
    try:
        job = repo.get_aggregation_job(db, aggregation_id)
        if job is None or (job.job_metadata or {}).get("workflow") != WORKFLOW_KEY:
            return
        job.status = "RUNNING"
        job.started_at = datetime.now(UTC)
        db.commit()
        pair = repo.get_dataset_version(db, job.dataset_version_id)
        if pair is None:
            raise SessionAggregationError("Dataset Version no longer exists")
        dataset, version = pair
        history = repo.get_cleaning_history(db, version.id)
        if history is None:
            raise SessionAggregationError("Normalized dataset provenance is missing")
        sessions = _source_sessions(db, dataset.id, version.id, history)
        by_id = {session.id: session for session in sessions}
        ordered_ids = [UUID(value) for value in job.job_metadata["session_ids"]]
        selected_sessions = [by_id[session_id] for session_id in ordered_ids]
        results_by_id = {
            result.session_id: result for result in repo.list_temporal_session_results(db, job.id)
        }
        path = _normalized_path(version)
        with pq.ParquetFile(path) as parquet_file:
            counts = _session_row_counts(
                db, history, selected_sessions, parquet_file.metadata.num_rows,
            )
            track_column, time_column = _normalized_columns(parquet_file)
            normalized_rows = _normalized_pairs(parquet_file, track_column, time_column)
            for session, row_count in zip(selected_sessions, counts):
                result = results_by_id[session.id]
                result.status = "RUNNING"
                db.commit()
                session_rows = islice(normalized_rows, row_count)
                try:
                    buckets, records_read = aggregate_normalized_rows(
                        session_rows,
                        aggregation_interval=job.aggregation_interval,
                        recording_start=recording_start_from_filename(session.original_filename),
                    )
                    if records_read != row_count:
                        raise SessionAggregationError("Normalized Parquet ended before this Session")
                    rows = [
                        TrafficTimeSeries(
                            dataset_version_id=job.dataset_version_id,
                            aggregation_id=job.id,
                            recording_session_id=str(session.id),
                            time_bucket=bucket["time_bucket"],
                            aggregation_interval=job.aggregation_interval,
                            roi_identifier="ALL_TRAJECTORY_POINTS",
                            vehicle_count=bucket["vehicle_count"],
                            traffic_flow=None,
                            mean_speed=None,
                        )
                        for bucket in buckets
                    ]
                    result.status = "COMPLETED"
                    result.time_bins = len(rows)
                    result.records_read = records_read
                    result.error_message = None
                    repo.save_temporal_session_result(db, result, rows)
                    job.records_created += len(rows)
                    job.completed_sessions += 1
                    logger.info(
                        "temporal aggregation session completed: aggregation=%s session=%s records=%s bins=%s",
                        job.id, session.id, records_read, len(rows),
                    )
                except Exception as exc:
                    db.rollback()
                    logger.exception("temporal aggregation session failed: %s", session.id)
                    failed = repo.get_temporal_session_result(db, job.id, session.id)
                    failed.status = "FAILED"
                    failed.error_message = str(exc)[:2000]
                    failed.completed_at = datetime.now(UTC)
                    db.add(failed)
                    job.failed_sessions += 1
                finally:
                    # A failed session must not shift the following Session's row boundary.
                    deque(session_rows, maxlen=0)
                    _update_progress(db, job)

        job.status = (
            "COMPLETED" if job.completed_sessions == job.total_sessions
            else "PARTIAL_SUCCESS" if job.completed_sessions else "FAILED"
        )
        job.completed_at = datetime.now(UTC)
        _update_progress(db, job)
    except Exception as exc:
        db.rollback()
        logger.exception("temporal aggregation run failed: %s", aggregation_id)
        job = repo.get_aggregation_job(db, aggregation_id)
        if job is not None:
            _fail_remaining_sessions(db, job, str(exc))
            job.status = "PARTIAL_SUCCESS" if job.completed_sessions else "FAILED"
            job.error_message = str(exc)[:2000]
            job.completed_at = datetime.now(UTC)
            _update_progress(db, job)
    finally:
        db.close()


def _accessible_run(db: Session, user: User, aggregation_id: UUID) -> TrafficAggregationJob:
    if user.role_id not in ("admin", "data_scientist"):
        raise HTTPException(403, "Data Scientist role required")
    job = repo.get_aggregation_job(db, aggregation_id)
    if job is None or (job.job_metadata or {}).get("workflow") != WORKFLOW_KEY:
        raise HTTPException(404, "Temporal aggregation run not found")
    check_dataset_access(user, job.dataset_id, db)
    pair = repo.get_dataset_version(db, job.dataset_version_id)
    if pair is None or pair[1].approval_status != "APPROVED":
        raise HTTPException(403, "Dataset Version is not approved")
    return job


def get_temporal_aggregation_results(
    db: Session, user: User, aggregation_id: UUID,
    session_id: UUID | None, page: int, page_size: int,
) -> DatasetVersionAggregationResults:
    job = _accessible_run(db, user, aggregation_id)
    results = repo.list_temporal_session_results(db, job.id)
    selected = next((result for result in results if result.session_id == session_id), None)
    if session_id is not None and selected is None:
        raise HTTPException(404, "Session is not part of this aggregation run")
    total_records = repo.count_temporal_time_series(db, job.id, session_id)
    series = repo.page_temporal_time_series(db, job.id, session_id, page, page_size)
    page_session_ids = list({UUID(item.recording_session_id) for item in series})
    recording_starts = {
        session.id: recording_start_from_filename(session.original_filename)
        for session in repo.get_sessions_by_ids(db, job.dataset_id, page_session_ids)
    }
    return DatasetVersionAggregationResults(
        aggregation_id=job.id,
        dataset_version_id=job.dataset_version_id,
        aggregation_interval=job.aggregation_interval,
        status=selected.status if selected is not None else job.status,
        session_id=session_id,
        total_sessions=1 if selected is not None else job.total_sessions,
        total_time_bins=total_records,
        total_records=total_records,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total_records / page_size),
        sessions=[_session_status(selected)] if selected is not None else [
            _session_status(result) for result in results
        ],
        data=[
            TemporalAggregationDataPoint(
                session_id=UUID(item.recording_session_id),
                timestamp=recording_timestamp(
                    item.time_bucket,
                    recording_starts.get(UUID(item.recording_session_id)),
                ),
                vehicle_count=item.vehicle_count,
            )
            for item in series
        ],
    )


def get_combined_temporal_aggregation_results(
    db: Session, user: User, aggregation_id: UUID,
) -> CombinedTemporalAggregationResults:
    """Return every saved session bin, preserving its source Session ID."""
    job = _accessible_run(db, user, aggregation_id)
    results = repo.list_temporal_session_results(db, job.id)
    sessions = repo.get_sessions_by_ids(
        db, job.dataset_id, [result.session_id for result in results],
    )
    starts = [recording_start_from_filename(session.original_filename) for session in sessions]
    zone_names = {
        start.tzinfo.key
        for start in starts
        if start is not None and isinstance(start.tzinfo, ZoneInfo)
    }
    timezone_name = (
        next(iter(zone_names))
        if len(sessions) == len(results) and all(start is not None for start in starts)
        and len(zone_names) == 1
        else "UTC"
    )
    zone = ZoneInfo(timezone_name)
    rows = repo.list_temporal_time_series(db, job.id)
    data = []
    for row in rows:
        timestamp = row.time_bucket
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=UTC)
        data.append(CombinedTemporalAggregationDataPoint(
            session_id=UUID(row.recording_session_id),
            timestamp=timestamp.astimezone(zone),
            vehicle_count=row.vehicle_count,
        ))
    return CombinedTemporalAggregationResults(
        aggregation_id=job.id,
        dataset_version_id=job.dataset_version_id,
        aggregation_interval=job.aggregation_interval,
        status=job.status,
        timezone=timezone_name,
        total_sessions=job.total_sessions,
        completed_sessions=job.completed_sessions,
        failed_sessions=job.failed_sessions,
        total_time_bins=len(data),
        sessions=[_session_status(result) for result in results],
        data=data,
    )
