"""Database access for saved vehicle-count features and models."""

from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.lag_feature import LagFeatureForest, LagFeatureGeneration, LagFeatureSample
from app.models.traffic import TrafficAggregationJob, TrafficTimeSeries


def get_generation(db: Session, generation_id: UUID) -> LagFeatureGeneration | None:
    return db.query(LagFeatureGeneration).filter(LagFeatureGeneration.id == generation_id).one_or_none()


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
        LagFeatureSample.dataset_id, LagFeatureSample.session_id, LagFeatureSample.timestamp,
    ).offset((page - 1) * page_size).limit(page_size).all()


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
