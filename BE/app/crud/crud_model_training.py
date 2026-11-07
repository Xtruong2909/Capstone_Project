"""PostgreSQL persistence and access-filtered experiment queries."""

from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.dataset import DatasetAccessGrant, DatasetVersion
from app.models.model_training import ModelTrainingExperiment, ModelTrainingSplit
from app.models.user import User


def save_split(db: Session, version_id: UUID, fingerprint: str, payload: dict) -> ModelTrainingSplit:
    db.execute(insert(ModelTrainingSplit).values(
        id=uuid4(), dataset_version_id=version_id, fingerprint=fingerprint, payload=payload,
    ).on_conflict_do_nothing(index_elements=["fingerprint"]))
    return db.scalar(select(ModelTrainingSplit).where(ModelTrainingSplit.fingerprint == fingerprint))


def get_split(db: Session, split_id: UUID) -> ModelTrainingSplit | None:
    return db.get(ModelTrainingSplit, split_id)


def create_experiment(db: Session, split_id: UUID, user_id: UUID, configuration: dict,
                      evaluation: dict) -> ModelTrainingExperiment:
    experiment = ModelTrainingExperiment(
        split_id=split_id, created_by=user_id, configuration=configuration, evaluation=evaluation,
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
