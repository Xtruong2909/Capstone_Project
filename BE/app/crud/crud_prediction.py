"""Database queries for manual traffic-flow prediction."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.dataset import DatasetVersion, RecordingSession
from app.models.model_training import ExperimentTrainedModel, ModelTrainingExperiment
from app.models.prediction import PredictionResult, PredictionRun
from app.models.traffic import (
    TrafficAggregationJob,
    TrafficAggregationSessionResult,
    TrafficTimeSeries,
)


def completed_experiments(db: Session) -> list[ModelTrainingExperiment]:
    return list(db.scalars(select(ModelTrainingExperiment).where(
        ModelTrainingExperiment.status == "COMPLETED",
        ModelTrainingExperiment.lag_feature_split_id.is_not(None),
    ).order_by(ModelTrainingExperiment.created_at.desc(), ModelTrainingExperiment.id)))


def experiment(db: Session, experiment_id: UUID) -> ModelTrainingExperiment | None:
    return db.get(ModelTrainingExperiment, experiment_id)


def models(db: Session, experiment_id: UUID) -> list[ExperimentTrainedModel]:
    return list(db.scalars(select(ExperimentTrainedModel).where(
        ExperimentTrainedModel.experiment_id == experiment_id,
    ).order_by(ExperimentTrainedModel.horizon)))


def session_candidates(
    db: Session, aggregation_ids: list[UUID] | None = None,
) -> list[tuple[TrafficAggregationSessionResult, TrafficAggregationJob, RecordingSession, DatasetVersion]]:
    statement = select(
        TrafficAggregationSessionResult, TrafficAggregationJob, RecordingSession, DatasetVersion,
    ).join(TrafficAggregationJob, TrafficAggregationJob.id == TrafficAggregationSessionResult.aggregation_id).join(
        RecordingSession, RecordingSession.id == TrafficAggregationSessionResult.session_id,
    ).join(DatasetVersion, DatasetVersion.id == TrafficAggregationJob.dataset_version_id).where(
        TrafficAggregationJob.status == "COMPLETED",
        TrafficAggregationJob.aggregation_interval == 60,
        TrafficAggregationSessionResult.status == "COMPLETED",
        DatasetVersion.approval_status == "APPROVED",
        RecordingSession.dataset_id == TrafficAggregationJob.dataset_id,
    )
    if aggregation_ids is not None:
        statement = statement.where(TrafficAggregationJob.id.in_(aggregation_ids))
    return list(db.execute(statement.order_by(TrafficAggregationJob.created_at.desc())).all())


def session_bins(db: Session, aggregation_id: UUID, session_id: UUID) -> list[TrafficTimeSeries]:
    return list(db.scalars(select(TrafficTimeSeries).where(
        TrafficTimeSeries.aggregation_id == aggregation_id,
        TrafficTimeSeries.recording_session_id == str(session_id),
    ).order_by(TrafficTimeSeries.time_bucket)))


def existing_run(db: Session, fingerprint: str) -> PredictionRun | None:
    return db.scalar(select(PredictionRun).where(PredictionRun.request_fingerprint == fingerprint))


def get_run(db: Session, run_id: UUID) -> PredictionRun | None:
    return db.get(PredictionRun, run_id)


def run_results(db: Session, run_id: UUID) -> list[PredictionResult]:
    return list(db.scalars(select(PredictionResult).where(
        PredictionResult.prediction_run_id == run_id,
    ).order_by(PredictionResult.session_id, PredictionResult.horizon)))


def list_runs(
    db: Session, *, created_by: UUID, experiment_id: UUID | None, session_id: UUID | None,
    status: str | None, created_from: datetime | None, created_to: datetime | None,
    page: int, page_size: int,
) -> tuple[int, list[tuple[PredictionRun, str]]]:
    statement = select(PredictionRun.id).where(PredictionRun.created_by == created_by)
    if experiment_id is not None:
        statement = statement.where(PredictionRun.experiment_id == experiment_id)
    if session_id is not None:
        statement = statement.join(PredictionResult).where(PredictionResult.session_id == session_id)
    if status is not None:
        statement = statement.where(PredictionRun.status == status)
    if created_from is not None:
        statement = statement.where(PredictionRun.created_at >= created_from)
    if created_to is not None:
        statement = statement.where(PredictionRun.created_at <= created_to)
    ids = statement.distinct().subquery()
    total = db.scalar(select(func.count()).select_from(ids)) or 0
    rows = db.execute(select(PredictionRun, ModelTrainingExperiment.name).join(
        ModelTrainingExperiment, ModelTrainingExperiment.id == PredictionRun.experiment_id,
    ).where(PredictionRun.id.in_(select(ids.c.id))).order_by(
        PredictionRun.created_at.desc(), PredictionRun.id,
    ).offset((page - 1) * page_size).limit(page_size)).all()
    return total, list(rows)


def page_results(
    db: Session, run_id: UUID, *, session_id: UUID | None,
    horizon: int | None, page: int, page_size: int,
) -> tuple[int, list[PredictionResult]]:
    statement = select(PredictionResult).where(PredictionResult.prediction_run_id == run_id)
    if session_id is not None:
        statement = statement.where(PredictionResult.session_id == session_id)
    if horizon is not None:
        statement = statement.where(PredictionResult.horizon == horizon)
    total = db.scalar(select(func.count()).select_from(statement.subquery())) or 0
    rows = db.scalars(statement.order_by(
        PredictionResult.session_id, PredictionResult.horizon,
    ).offset((page - 1) * page_size).limit(page_size)).all()
    return total, list(rows)
