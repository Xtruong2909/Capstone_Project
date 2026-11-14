"""Persistence helpers for split-scoped model-training experiments."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.model_training import (
    ExperimentTrainedModel,
    ModelTrainingExperiment,
    ModelTrainingForecastResult,
    ModelTrainingSplitExperimentCounter,
)


def reserve_split_experiment_number(db: Session, split_id: UUID) -> int:
    last_number = (
        db.scalar(
            select(func.max(ModelTrainingExperiment.experiment_number)).where(
                ModelTrainingExperiment.lag_feature_split_id == split_id,
            )
        )
        or 0
    )
    db.execute(
        insert(ModelTrainingSplitExperimentCounter)
        .values(split_id=split_id, last_number=last_number)
        .on_conflict_do_nothing(index_elements=["split_id"])
    )
    counter = db.scalar(
        select(ModelTrainingSplitExperimentCounter)
        .where(ModelTrainingSplitExperimentCounter.split_id == split_id)
        .with_for_update()
    )
    if counter is None:
        raise RuntimeError("Experiment counter could not be initialized")
    counter.last_number += 1
    db.flush()
    return counter.last_number


def list_experiments(
    db: Session,
    *,
    split_id: UUID | None,
    status: str | None,
    dataset_version_id: UUID | None = None,
    offset: int,
    limit: int | None,
) -> list[ModelTrainingExperiment]:
    statement = select(ModelTrainingExperiment)
    if split_id is not None:
        statement = statement.where(
            (ModelTrainingExperiment.lag_feature_split_id == split_id)
            | (ModelTrainingExperiment.split_id == split_id)
        )
    if status is not None:
        statement = statement.where(ModelTrainingExperiment.status == status)
    if dataset_version_id is not None:
        statement = statement.where(
            ModelTrainingExperiment.configuration["dataset_version_id"].astext
            == str(dataset_version_id)
        )
    statement = statement.order_by(
        ModelTrainingExperiment.created_at.desc(),
        ModelTrainingExperiment.id,
    ).offset(offset)
    if limit is not None:
        statement = statement.limit(limit)
    return list(db.scalars(statement))


def get_experiment(db: Session, experiment_id: UUID) -> ModelTrainingExperiment | None:
    return db.get(ModelTrainingExperiment, experiment_id)


def list_trained_models(db: Session, experiment_id: UUID) -> list[ExperimentTrainedModel]:
    return list(
        db.scalars(
            select(ExperimentTrainedModel)
            .where(ExperimentTrainedModel.experiment_id == experiment_id)
            .order_by(ExperimentTrainedModel.horizon)
        )
    )


def get_trained_model(db: Session, model_id: UUID) -> ExperimentTrainedModel | None:
    return db.get(ExperimentTrainedModel, model_id)


def list_predictions(
    db: Session,
    *,
    experiment_id: UUID,
    model_type: str | None,
    horizon: int | None,
    session_id: UUID | None,
    offset: int,
    limit: int,
) -> list[ModelTrainingForecastResult]:
    statement = select(ModelTrainingForecastResult).where(
        ModelTrainingForecastResult.experiment_id == experiment_id,
    )
    if horizon is not None:
        statement = statement.where(ModelTrainingForecastResult.horizon == horizon)
    if model_type is not None:
        statement = statement.where(ModelTrainingForecastResult.model_type == model_type)
    if session_id is not None:
        statement = statement.where(ModelTrainingForecastResult.session_id == session_id)
    return list(
        db.scalars(
            statement.order_by(
                ModelTrainingForecastResult.input_timestamp,
                ModelTrainingForecastResult.session_id,
                ModelTrainingForecastResult.model_type,
                ModelTrainingForecastResult.horizon,
            )
            .offset(offset)
            .limit(limit)
        )
    )


def count_predictions(
    db: Session,
    *,
    experiment_id: UUID,
    model_type: str | None,
    horizon: int | None,
    session_id: UUID | None,
) -> int:
    statement = select(func.count(ModelTrainingForecastResult.id)).where(
        ModelTrainingForecastResult.experiment_id == experiment_id,
    )
    if horizon is not None:
        statement = statement.where(ModelTrainingForecastResult.horizon == horizon)
    if model_type is not None:
        statement = statement.where(ModelTrainingForecastResult.model_type == model_type)
    if session_id is not None:
        statement = statement.where(ModelTrainingForecastResult.session_id == session_id)
    return db.scalar(statement) or 0
