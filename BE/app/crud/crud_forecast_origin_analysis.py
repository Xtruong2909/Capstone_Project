"""Read persisted Test windows and forecast results for origin analysis."""

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.dataset import RecordingSession
from app.models.lag_feature import LagFeatureSample, LagFeatureSplitSample
from app.models.model_training import ModelTrainingForecastResult
from app.models.traffic import TrafficAggregationSessionResult, TrafficTimeSeries


def list_test_samples(db: Session, split_id: UUID) -> list[LagFeatureSample]:
    return (
        db.query(LagFeatureSample)
        .join(LagFeatureSplitSample, LagFeatureSplitSample.sample_id == LagFeatureSample.id)
        .filter(LagFeatureSplitSample.split_id == split_id, LagFeatureSplitSample.subset == "TEST")
        .order_by(LagFeatureSample.session_id, LagFeatureSample.timestamp)
        .all()
    )


def list_train_samples(db: Session, split_id: UUID) -> list[LagFeatureSample]:
    return (
        db.query(LagFeatureSample)
        .join(LagFeatureSplitSample, LagFeatureSplitSample.sample_id == LagFeatureSample.id)
        .filter(LagFeatureSplitSample.split_id == split_id, LagFeatureSplitSample.subset == "TRAIN")
        .all()
    )


def list_completed_run_sessions(
    db: Session, aggregation_id: UUID, dataset_id: UUID,
) -> list[RecordingSession]:
    return (
        db.query(RecordingSession)
        .join(
            TrafficAggregationSessionResult,
            TrafficAggregationSessionResult.session_id == RecordingSession.id,
        )
        .filter(
            TrafficAggregationSessionResult.aggregation_id == aggregation_id,
            TrafficAggregationSessionResult.status == "COMPLETED",
            RecordingSession.dataset_id == dataset_id,
        )
        .all()
    )


def list_observations(db: Session, aggregation_ids: list[UUID]) -> list[TrafficTimeSeries]:
    return (
        db.query(TrafficTimeSeries)
        .filter(TrafficTimeSeries.aggregation_id.in_(aggregation_ids))
        .order_by(TrafficTimeSeries.recording_session_id, TrafficTimeSeries.time_bucket)
        .all()
    )


def list_random_forest_predictions(
    db: Session, experiment_id: UUID,
) -> list[ModelTrainingForecastResult]:
    return (
        db.query(ModelTrainingForecastResult)
        .filter(
            ModelTrainingForecastResult.experiment_id == experiment_id,
            ModelTrainingForecastResult.model_type == "RANDOM_FOREST",
        )
        .order_by(
            ModelTrainingForecastResult.session_id,
            ModelTrainingForecastResult.input_timestamp,
            ModelTrainingForecastResult.horizon,
        )
        .all()
    )
