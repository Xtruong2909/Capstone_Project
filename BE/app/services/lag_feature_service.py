"""Generate and read persisted vehicle-count windows from completed aggregations."""

import hashlib
import json
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.crud import crud_lag_feature as repo
from app.crud import crud_traffic_aggregation as aggregation_repo
from app.models.lag_feature import LagFeatureGeneration, LagFeatureSample
from app.models.user import User
from app.schemas.lag_feature import (
    LagGenerationRequest,
    LagGenerationStatus,
    LagPreviewResponse,
    LagSampleResponse,
    LagSessionCount,
    LagSessionResponse,
    LagSummaryResponse,
)
from app.services.ds_temporal_aggregation_service import get_accessible_temporal_jobs
from app.services.lag_window_service import VehicleObservation, build_training_windows


def accessible_generation(db: Session, user: User, generation_id: UUID) -> LagFeatureGeneration:
    generation = repo.get_generation(db, generation_id)
    if generation is None:
        raise HTTPException(404, "Feature Generation not found")
    get_accessible_temporal_jobs(db, user, generation.aggregation_id)
    return generation


def _status(generation: LagFeatureGeneration) -> LagGenerationStatus:
    return LagGenerationStatus(
        feature_generation_id=generation.id, aggregation_id=generation.aggregation_id,
        status=generation.status, configuration=generation.configuration,
        sample_count=generation.sample_count,
        error_message=generation.error_message,
    )


def generate_lag_features(
    db: Session, user: User, payload: LagGenerationRequest,
) -> LagGenerationStatus:
    jobs = get_accessible_temporal_jobs(db, user, payload.aggregation_id)
    if any(job.status != "COMPLETED" or job.aggregation_interval != 60 for job in jobs):
        raise HTTPException(409, "All aggregation jobs must be COMPLETED at 60-second intervals")
    if any(
        result.status != "COMPLETED"
        for job in jobs for result in aggregation_repo.list_temporal_session_results(db, job.id)
    ):
        raise HTTPException(409, "All Recording Sessions must be completed")
    configuration = payload.model_dump(mode="json", exclude={"aggregation_id"})
    digest = hashlib.sha256(json.dumps(configuration, sort_keys=True).encode()).hexdigest()
    generation = repo.find_generation(db, payload.aggregation_id, digest)
    if generation is not None and generation.status != "FAILED":
        return _status(generation)
    if generation is None:
        generation = LagFeatureGeneration(
            id=uuid4(), aggregation_id=payload.aggregation_id, configuration_hash=digest,
            configuration=configuration, status="PROCESSING",
        )
        try:
            db.add(generation)
            db.commit()
        except IntegrityError:
            db.rollback()
            existing = repo.find_generation(db, payload.aggregation_id, digest)
            if existing is not None:
                return _status(existing)
            raise HTTPException(409, "Feature Generation is being created concurrently") from None
    else:
        generation.status = "PROCESSING"
        generation.error_message = None
        db.commit()
    try:
        observations = [VehicleObservation(
            dataset_id=job.dataset_id,
            session_id=UUID(row.recording_session_id),
            timestamp=row.time_bucket, vehicle_count=row.vehicle_count,
        ) for row, job in repo.list_aggregation_bins(db, jobs)]
        windows = build_training_windows(observations)
        samples = [LagFeatureSample(
            generation_id=generation.id, aggregation_id=payload.aggregation_id,
            dataset_id=window.dataset_id,
            session_id=window.session_id, timestamp=window.timestamp,
            **{f"lag_{n}": value for n, value in enumerate(window.lags, 1)},
            **{f"target_h{h}": value for h, value in zip((1, 3, 5), window.targets)},
        ) for window in windows]
        db.add_all(samples)
        generation.status = "COMPLETED"
        generation.sample_count = len(samples)
        generation.completed_at = datetime.now(UTC)
        db.commit()
    except (SQLAlchemyError, ValueError) as exc:
        db.rollback()
        generation = repo.get_generation(db, generation.id)
        generation.status = "FAILED"
        generation.error_message = str(exc)[:2000]
        db.commit()
        raise HTTPException(409, "Feature Generation failed; see saved status") from exc
    return _status(generation)


def get_generation_status(db: Session, user: User, generation_id: UUID) -> LagGenerationStatus:
    return _status(accessible_generation(db, user, generation_id))


def get_generation_sessions(db: Session, user: User, generation_id: UUID) -> LagSessionResponse:
    generation = accessible_generation(db, user, generation_id)
    jobs = get_accessible_temporal_jobs(db, user, generation.aggregation_id)
    counts = repo.session_counts(db, generation_id)
    sessions = [LagSessionCount(
        dataset_id=job.dataset_id, session_id=result.session_id,
        sample_count=counts.get(result.session_id, 0),
    ) for job in jobs for result in aggregation_repo.list_temporal_session_results(db, job.id)]
    return LagSessionResponse(
        feature_generation_id=generation_id,
        sessions=sorted(sessions, key=lambda item: (str(item.dataset_id), str(item.session_id))),
    )


def get_generation_preview(
    db: Session, user: User, generation_id: UUID, page: int, page_size: int,
) -> LagPreviewResponse:
    accessible_generation(db, user, generation_id)
    count = repo.count_samples(db, generation_id)
    rows = repo.page_samples(db, generation_id, page, page_size)
    return LagPreviewResponse(
        feature_generation_id=generation_id, total_records=count,
        page=page, page_size=page_size, total_pages=(count + page_size - 1) // page_size,
        data=[LagSampleResponse.model_validate(row) for row in rows],
    )


def get_generation_summary(db: Session, user: User, generation_id: UUID) -> LagSummaryResponse:
    generation = accessible_generation(db, user, generation_id)
    sessions = get_generation_sessions(db, user, generation_id).sessions
    count = repo.count_samples(db, generation_id)
    return LagSummaryResponse(
        feature_generation_id=generation_id, aggregation_id=generation.aggregation_id,
        total_datasets=len({session.dataset_id for session in sessions}),
        total_sessions=len(sessions), total_samples=count,
        samples_by_horizon={f"h{h}": count for h in (1, 3, 5)},
    )
