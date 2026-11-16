"""Database access for saved vehicle-count features and models."""

from datetime import date
from uuid import UUID

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models.dataset import RecordingSession
from app.models.lag_feature import LagFeatureForest, LagFeatureGeneration, LagFeatureSample
from app.models.traffic import TrafficAggregationJob, TrafficTimeSeries


def get_generation(db: Session, generation_id: UUID) -> LagFeatureGeneration | None:
    return db.query(LagFeatureGeneration).filter(LagFeatureGeneration.id == generation_id).one_or_none()


def get_latest_generation(db: Session, aggregation_id: UUID) -> LagFeatureGeneration | None:
    return db.query(LagFeatureGeneration).filter(
        LagFeatureGeneration.aggregation_id == aggregation_id,
    ).order_by(
        case((LagFeatureGeneration.status == "COMPLETED", 0), else_=1),
        LagFeatureGeneration.created_at.desc(),
        LagFeatureGeneration.id.desc(),
    ).first()


def find_generation(db: Session, aggregation_id: UUID, configuration_hash: str) -> LagFeatureGeneration | None:
    return db.query(LagFeatureGeneration).filter(
        LagFeatureGeneration.aggregation_id == aggregation_id,
        LagFeatureGeneration.configuration_hash == configuration_hash,
    ).one_or_none()


def list_aggregation_bins(
    db: Session, jobs: list[TrafficAggregationJob],
) -> list[tuple[TrafficTimeSeries, TrafficAggregationJob]]:
    return db.query(TrafficTimeSeries, TrafficAggregationJob).join(
        TrafficAggregationJob, TrafficAggregationJob.id == TrafficTimeSeries.aggregation_id,
    ).filter(TrafficTimeSeries.aggregation_id.in_([job.id for job in jobs])).order_by(
        TrafficTimeSeries.recording_session_id, TrafficTimeSeries.time_bucket,
    ).all()


def list_session_bins(
    db: Session, jobs: list[TrafficAggregationJob], session_id: UUID,
) -> list[tuple[TrafficTimeSeries, TrafficAggregationJob]]:
    return db.query(TrafficTimeSeries, TrafficAggregationJob).join(
        TrafficAggregationJob, TrafficAggregationJob.id == TrafficTimeSeries.aggregation_id,
    ).filter(
        TrafficTimeSeries.aggregation_id.in_([job.id for job in jobs]),
        TrafficTimeSeries.recording_session_id == str(session_id),
    ).order_by(TrafficTimeSeries.time_bucket).all()


def save_generation(db: Session, generation: LagFeatureGeneration, samples: list[LagFeatureSample]) -> None:
    db.add(generation)
    db.flush()
    db.add_all(samples)
    db.commit()


def list_samples(db: Session, generation_id: UUID) -> list[LagFeatureSample]:
    return db.query(LagFeatureSample).filter(
        LagFeatureSample.generation_id == generation_id,
    ).order_by(LagFeatureSample.timestamp, LagFeatureSample.dataset_id, LagFeatureSample.session_id).all()


def count_samples(db: Session, generation_id: UUID) -> int:
    return db.query(func.count(LagFeatureSample.id)).filter(
        LagFeatureSample.generation_id == generation_id,
    ).scalar() or 0


def page_samples(db: Session, generation_id: UUID, page: int, page_size: int) -> list[LagFeatureSample]:
    return db.query(LagFeatureSample).filter(
        LagFeatureSample.generation_id == generation_id,
    ).order_by(
        LagFeatureSample.timestamp, LagFeatureSample.dataset_id,
        LagFeatureSample.session_id, LagFeatureSample.id,
    ).offset((page - 1) * page_size).limit(page_size).all()


def list_sample_recording_dates(db: Session, generation_id: UUID) -> list[date]:
    rows = db.query(RecordingSession.recording_date).join(
        LagFeatureSample, LagFeatureSample.session_id == RecordingSession.id,
    ).filter(LagFeatureSample.generation_id == generation_id).distinct().order_by(
        RecordingSession.recording_date,
    ).all()
    return [row[0] for row in rows]


def samples_for_recording_dates(
    db: Session, generation_id: UUID, recording_dates: list[date],
) -> list[LagFeatureSample]:
    if not recording_dates:
        return []
    return db.query(LagFeatureSample).join(
        RecordingSession, RecordingSession.id == LagFeatureSample.session_id,
    ).filter(
        LagFeatureSample.generation_id == generation_id,
        RecordingSession.recording_date.in_(recording_dates),
    ).order_by(
        RecordingSession.recording_date,
        RecordingSession.scheduled_start,
        LagFeatureSample.timestamp,
        LagFeatureSample.session_id,
        LagFeatureSample.id,
    ).all()


def session_counts(db: Session, generation_id: UUID) -> dict[UUID, int]:
    rows = db.query(LagFeatureSample.session_id, func.count(LagFeatureSample.id)).filter(
        LagFeatureSample.generation_id == generation_id,
    ).group_by(LagFeatureSample.session_id).all()
    return dict(rows)


def get_forest(db: Session, model_id: UUID) -> LagFeatureForest | None:
    return db.query(LagFeatureForest).filter(LagFeatureForest.id == model_id).one_or_none()


def save_forest(db: Session, model: LagFeatureForest) -> None:
    db.add(model)
    db.commit()
