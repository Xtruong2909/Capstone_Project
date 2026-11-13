"""Repository helpers for traffic aggregation jobs and selected versions."""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Query, Session

from app.models.dataset import (
    DataCleaningHistory,
    Dataset,
    DatasetVersion,
    RecordingSession,
)
from app.models.traffic import (
    TrafficAggregationJob,
    TrafficAggregationSessionResult,
    TrafficTimeSeries,
)


def get_versions_by_ids(
    db: Session, version_ids: list[UUID],
) -> dict[UUID, tuple[Dataset, DatasetVersion]]:
    if not version_ids:
        return {}
    rows = db.query(Dataset, DatasetVersion).join(
        DatasetVersion, DatasetVersion.dataset_id == Dataset.id,
    ).filter(DatasetVersion.id.in_(version_ids)).all()
    return {version.id: (dataset, version) for dataset, version in rows}


def create_aggregation_jobs(
    db: Session, jobs: list[TrafficAggregationJob],
) -> list[TrafficAggregationJob]:
    try:
        db.add_all(jobs)
        db.commit()
        for job in jobs:
            db.refresh(job)
    except Exception:
        db.rollback()
        raise
    return jobs


def get_aggregation_job(db: Session, job_id: UUID) -> TrafficAggregationJob | None:
    return db.query(TrafficAggregationJob).filter(
        TrafficAggregationJob.id == job_id,
    ).one_or_none()


def get_dataset_version(db: Session, version_id: UUID) -> tuple[Dataset, DatasetVersion] | None:
    return (
        db.query(Dataset, DatasetVersion)
        .join(DatasetVersion, DatasetVersion.dataset_id == Dataset.id)
        .filter(DatasetVersion.id == version_id)
        .one_or_none()
    )


def get_cleaning_history(db: Session, version_id: UUID) -> DataCleaningHistory | None:
    return (
        db.query(DataCleaningHistory)
        .filter(DataCleaningHistory.dataset_version_id == version_id)
        .order_by(DataCleaningHistory.created_at.desc(), DataCleaningHistory.id.desc())
        .first()
    )


def save_session_row_counts(
    db: Session, history: DataCleaningHistory, counts: dict[str, int],
) -> None:
    history.parameters = {**(history.parameters or {}), "source_session_row_counts": counts}
    db.add(history)
    db.commit()


def get_historical_session_row_counts(
    db: Session, version_id: UUID, session_ids: list[UUID],
) -> dict[str, int] | None:
    """Reuse complete per-session row counts from an earlier run of this version."""
    jobs = (
        db.query(TrafficAggregationJob)
        .filter(
            TrafficAggregationJob.dataset_version_id == version_id,
            TrafficAggregationJob.status == "COMPLETED",
        )
        .order_by(TrafficAggregationJob.created_at.desc())
        .all()
    )
    expected = {str(session_id) for session_id in session_ids}
    for job in jobs:
        if (job.job_metadata or {}).get("workflow") != "ds_temporal_v1":
            continue
        results = list_temporal_session_results(db, job.id)
        counts = {
            str(result.session_id): result.records_read
            for result in results if result.status == "COMPLETED" and result.records_read > 0
        }
        if set(counts) == expected:
            return counts
    return None


def get_version_sessions(db: Session, version_id: UUID) -> list[RecordingSession]:
    from app.models.dataset import DatasetVersionSession

    return (
        db.query(RecordingSession)
        .join(DatasetVersionSession, DatasetVersionSession.session_id == RecordingSession.id)
        .filter(DatasetVersionSession.version_id == version_id)
        .order_by(RecordingSession.scheduled_start, RecordingSession.id)
        .all()
    )


def get_sessions_by_ids(
    db: Session, dataset_id: UUID, session_ids: list[UUID],
) -> list[RecordingSession]:
    if not session_ids:
        return []
    return db.query(RecordingSession).filter(
        RecordingSession.dataset_id == dataset_id,
        RecordingSession.id.in_(session_ids),
    ).all()


def get_active_temporal_run(db: Session, version_id: UUID) -> TrafficAggregationJob | None:
    jobs = db.query(TrafficAggregationJob).filter(
        TrafficAggregationJob.dataset_version_id == version_id,
        TrafficAggregationJob.status.in_(
            ["QUEUED", "PROCESSING", "RUNNING", "queued", "running"]
        ),
    ).order_by(TrafficAggregationJob.created_at.desc()).all()
    return next(
        (job for job in jobs if (job.job_metadata or {}).get("workflow") == "ds_temporal_v1"),
        None,
    )


def create_temporal_run(
    db: Session,
    job: TrafficAggregationJob,
    session_results: list[TrafficAggregationSessionResult],
) -> TrafficAggregationJob:
    try:
        db.add(job)
        db.add_all(session_results)
        db.commit()
        db.refresh(job)
        for session_result in session_results:
            db.refresh(session_result)
    except Exception:
        db.rollback()
        raise
    return job


def create_group_temporal_runs(
    db: Session,
    jobs: list[TrafficAggregationJob],
    session_results: list[TrafficAggregationSessionResult],
) -> None:
    try:
        db.add_all(jobs)
        db.add_all(session_results)
        db.commit()
    except Exception:
        db.rollback()
        raise


def list_group_temporal_jobs(
    db: Session, job_ids: list[UUID],
) -> list[TrafficAggregationJob]:
    return db.query(TrafficAggregationJob).filter(
        TrafficAggregationJob.id.in_(job_ids),
    ).all()


def group_temporal_series_query(
    db: Session, job_ids: list[UUID], session_id: UUID | None,
) -> Query:
    query = db.query(TrafficTimeSeries, TrafficAggregationJob).join(
        TrafficAggregationJob, TrafficAggregationJob.id == TrafficTimeSeries.aggregation_id,
    ).filter(TrafficTimeSeries.aggregation_id.in_(job_ids))
    if session_id is not None:
        query = query.filter(TrafficTimeSeries.recording_session_id == str(session_id))
    return query


def count_group_temporal_series(
    db: Session, job_ids: list[UUID], session_id: UUID | None,
) -> int:
    return group_temporal_series_query(db, job_ids, session_id).with_entities(
        func.count(TrafficTimeSeries.id),
    ).scalar() or 0


def page_group_temporal_series(
    db: Session, job_ids: list[UUID], session_id: UUID | None,
    page: int, page_size: int,
) -> list[tuple[TrafficTimeSeries, TrafficAggregationJob]]:
    return group_temporal_series_query(db, job_ids, session_id).order_by(
        TrafficAggregationJob.dataset_id,
        TrafficTimeSeries.recording_session_id,
        TrafficTimeSeries.time_bucket,
    ).offset((page - 1) * page_size).limit(page_size).all()


def list_group_temporal_series(
    db: Session, job_ids: list[UUID],
) -> list[tuple[TrafficTimeSeries, TrafficAggregationJob]]:
    return group_temporal_series_query(db, job_ids, None).order_by(
        TrafficAggregationJob.dataset_id,
        TrafficTimeSeries.recording_session_id,
        TrafficTimeSeries.time_bucket,
    ).all()


def save_temporal_session_result(
    db: Session,
    result: TrafficAggregationSessionResult,
    rows: list[TrafficTimeSeries],
) -> None:
    try:
        if rows:
            db.add_all(rows)
        result.completed_at = datetime.now(UTC)
        db.add(result)
        db.commit()
    except Exception:
        db.rollback()
        raise


def list_temporal_session_results(
    db: Session, aggregation_id: UUID,
) -> list[TrafficAggregationSessionResult]:
    return db.query(TrafficAggregationSessionResult).filter(
        TrafficAggregationSessionResult.aggregation_id == aggregation_id,
    ).order_by(TrafficAggregationSessionResult.session_id).all()


def get_temporal_session_result(
    db: Session, aggregation_id: UUID, session_id: UUID,
) -> TrafficAggregationSessionResult | None:
    return db.query(TrafficAggregationSessionResult).filter(
        TrafficAggregationSessionResult.aggregation_id == aggregation_id,
        TrafficAggregationSessionResult.session_id == session_id,
    ).one_or_none()


def _temporal_series_query(
    db: Session, aggregation_id: UUID, session_id: UUID | None,
) -> Query:
    query = db.query(TrafficTimeSeries).filter(TrafficTimeSeries.aggregation_id == aggregation_id)
    if session_id is not None:
        query = query.filter(TrafficTimeSeries.recording_session_id == str(session_id))
    return query


def count_temporal_time_series(
    db: Session, aggregation_id: UUID, session_id: UUID | None,
) -> int:
    return _temporal_series_query(db, aggregation_id, session_id).with_entities(
        func.count(TrafficTimeSeries.id)
    ).scalar() or 0


def page_temporal_time_series(
    db: Session, aggregation_id: UUID, session_id: UUID | None,
    page: int, page_size: int,
) -> list[TrafficTimeSeries]:
    return (
        _temporal_series_query(db, aggregation_id, session_id)
        .order_by(TrafficTimeSeries.recording_session_id, TrafficTimeSeries.time_bucket)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )


def list_temporal_time_series(db: Session, aggregation_id: UUID) -> list[TrafficTimeSeries]:
    """Return all observed session bins in chronological order."""
    return (
        db.query(TrafficTimeSeries)
        .filter(TrafficTimeSeries.aggregation_id == aggregation_id)
        .order_by(TrafficTimeSeries.time_bucket, TrafficTimeSeries.recording_session_id)
        .all()
    )


