"""Allowlisted reads for Gemini context; no model-generated database queries."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.dataset import DatasetVersion
from app.models.experiment import ForecastResult
from app.models.model_training import FinalModel, ModelTrainingExperiment, ModelTrainingSplit


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
