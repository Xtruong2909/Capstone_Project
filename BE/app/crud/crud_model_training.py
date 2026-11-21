"""PostgreSQL persistence and access-filtered experiment queries."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.dataset import Dataset, DatasetAccessGrant, DatasetVersion
from app.models.experiment import ForecastResult
from app.models.model_training import (
    FinalModel,
    ModelTrainingExperiment,
    ModelTrainingSplit,
    ModelValidationResult,
)
from app.models.user import User


def save_split(db: Session, version_id: UUID, fingerprint: str, payload: dict) -> ModelTrainingSplit:
    db.execute(insert(ModelTrainingSplit).values(
        id=uuid4(), dataset_version_id=version_id, fingerprint=fingerprint, payload=payload,
    ).on_conflict_do_nothing(index_elements=["fingerprint"]))
    return db.scalar(select(ModelTrainingSplit).where(ModelTrainingSplit.fingerprint == fingerprint))


def get_split(db: Session, split_id: UUID) -> ModelTrainingSplit | None:
    return db.get(ModelTrainingSplit, split_id)


def lock_dataset_for_experiment(db: Session, version_id: UUID) -> UUID | None:
    return db.scalar(
        select(Dataset.id)
        .join(DatasetVersion, DatasetVersion.dataset_id == Dataset.id)
        .where(DatasetVersion.id == version_id)
        .with_for_update(of=Dataset)
    )


def list_dataset_experiment_names(db: Session, dataset_id: UUID) -> list[str]:
    return list(
        db.scalars(
            select(ModelTrainingExperiment.name).where(ModelTrainingExperiment.dataset_id == dataset_id)
        )
    )


def create_experiment(db: Session, split_id: UUID, user_id: UUID, configuration: dict,
                      evaluation: dict, dataset_id: UUID, name: str) -> ModelTrainingExperiment:
    experiment = ModelTrainingExperiment(
        split_id=split_id, dataset_id=dataset_id, name=name, created_by=user_id,
        configuration=configuration, evaluation=evaluation,
    )
    db.add(experiment)
    db.commit()
    db.refresh(experiment)
    return experiment


def update_experiment(db: Session, experiment: ModelTrainingExperiment, **values: object) -> None:
    for key, value in values.items():
        setattr(experiment, key, value)
    db.commit()
    db.refresh(experiment)


def get_experiment(db: Session, experiment_id: UUID) -> ModelTrainingExperiment | None:
    return db.get(ModelTrainingExperiment, experiment_id)


def list_completed_forests(db: Session, version_id: UUID) -> list[ModelTrainingExperiment]:
    """Candidates are scoped by the saved split, not an untrusted JSON version field."""
    query = (select(ModelTrainingExperiment)
             .join(ModelTrainingSplit)
             .where(ModelTrainingSplit.dataset_version_id == version_id)
             .where(ModelTrainingExperiment.status == "COMPLETED")
             .where(ModelTrainingExperiment.configuration["model"].astext == "RANDOM_FOREST")
             .order_by(ModelTrainingExperiment.number))
    return list(db.scalars(query))


def get_validation_result(db: Session, experiment_id: UUID) -> ModelValidationResult | None:
    return db.get(ModelValidationResult, experiment_id)


def get_final_model(db: Session, experiment_id: UUID) -> FinalModel | None:
    return db.scalar(select(FinalModel).where(FinalModel.experiment_id == experiment_id))


def save_final_forecasts(
    db: Session, model_id: UUID, origin: datetime,
    forecasts: list[tuple[int, datetime, Decimal]],
) -> None:
    """Keep repeated requests for the same model/origin idempotent."""
    rows = [{
        "model_id": model_id, "last_observed_time": origin,
        "horizon_minutes": horizon, "timestamp": target_time,
        "predicted_value": value,
    } for horizon, target_time, value in forecasts]
    db.execute(insert(ForecastResult).values(rows).on_conflict_do_nothing(
        index_elements=["model_id", "last_observed_time", "horizon_minutes"],
        index_where=ForecastResult.model_id.is_not(None),
    ))
    db.commit()


def list_experiments(db: Session, user: User, version_id: UUID | None, skip: int,
                     limit: int) -> list[ModelTrainingExperiment]:
    query = select(ModelTrainingExperiment).join(ModelTrainingSplit).join(DatasetVersion)
    if user.role_id != "admin":
        query = query.where(select(DatasetAccessGrant.id).where(
            DatasetAccessGrant.dataset_id == DatasetVersion.dataset_id,
            DatasetAccessGrant.user_id == user.id,
        ).exists())
    if version_id is not None:
        query = query.where(ModelTrainingSplit.dataset_version_id == version_id)
    return list(db.scalars(query.order_by(ModelTrainingExperiment.number.desc()).offset(skip).limit(limit)))
