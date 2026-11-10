"""Allowlisted reads for Gemini context; no model-generated database queries."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.data_quality import DataQualityCheck
from app.models.dataset import DatasetVersion
from app.models.experiment import ForecastResult
from app.models.model_training import FinalModel, ModelTrainingExperiment, ModelTrainingSplit
from app.models.traffic import TrafficTimeSeries


def get_experiment(db: Session, experiment_id: UUID) -> ModelTrainingExperiment | None:
    return db.get(ModelTrainingExperiment, experiment_id)


def get_split(db: Session, split_id: UUID) -> ModelTrainingSplit | None:
    return db.get(ModelTrainingSplit, split_id)


def get_forecast(db: Session, prediction_id: int) -> ForecastResult | None:
    return db.get(ForecastResult, prediction_id)


def get_final_model(db: Session, model_id: UUID) -> FinalModel | None:
    return db.get(FinalModel, model_id)


def get_dataset_version(db: Session, version_id: UUID) -> DatasetVersion | None:
    return db.get(DatasetVersion, version_id)


def get_latest_quality_check(db: Session, version_id: UUID) -> DataQualityCheck | None:
    return db.scalars(
        select(DataQualityCheck).where(
            DataQualityCheck.dataset_version_id == version_id,
            DataQualityCheck.status == "completed",
        ).order_by(DataQualityCheck.completed_at.desc()).limit(1)
    ).first()


def get_traffic_overview(db: Session, version_id: UUID) -> dict | None:
    row = db.execute(
        select(
            func.count(TrafficTimeSeries.id),
            func.min(TrafficTimeSeries.time_bucket),
            func.max(TrafficTimeSeries.time_bucket),
            func.avg(TrafficTimeSeries.traffic_flow),
            func.avg(TrafficTimeSeries.mean_speed),
        ).where(TrafficTimeSeries.dataset_version_id == version_id)
    ).one()
    if not row[0]:
        return None
    return {
        "aggregation_points": row[0],
        "first_time_bucket": row[1].isoformat() if row[1] else None,
        "last_time_bucket": row[2].isoformat() if row[2] else None,
        "average_traffic_flow": float(row[3]) if row[3] is not None else None,
        "average_speed_kmh": float(row[4]) if row[4] is not None else None,
    }


def get_latest_forecast_for_version(db: Session, version_id: UUID) -> ForecastResult | None:
    return db.scalars(
        select(ForecastResult).join(FinalModel, ForecastResult.model_id == FinalModel.id).where(
            FinalModel.dataset_version_id == version_id,
            ForecastResult.horizon_minutes == 1,
        ).order_by(ForecastResult.last_observed_time.desc(), ForecastResult.id.desc()).limit(1)
    ).first()


def list_recent_experiments(db: Session, version_id: UUID) -> list[ModelTrainingExperiment]:
    return list(db.scalars(
        select(ModelTrainingExperiment).join(ModelTrainingSplit).where(
            ModelTrainingSplit.dataset_version_id == version_id,
            ModelTrainingExperiment.status == "COMPLETED",
        ).order_by(ModelTrainingExperiment.number.desc()).limit(5)
    ))


def list_final_models(db: Session, version_id: UUID) -> list[FinalModel]:
    return list(db.scalars(
        select(FinalModel).where(FinalModel.dataset_version_id == version_id)
        .order_by(FinalModel.created_at.desc()).limit(5)
    ))


def get_forecast_group(db: Session, model_id: UUID, observed_time: datetime) -> list[ForecastResult]:
    return list(db.scalars(
        select(ForecastResult).where(
            ForecastResult.model_id == model_id,
            ForecastResult.last_observed_time == observed_time,
        ).order_by(ForecastResult.horizon_minutes)
    ))
