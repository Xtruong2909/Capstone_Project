"""Persistence helpers for split-scoped model-training experiments."""

from typing import Any
from uuid import UUID

from sqlalchemy import cast, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.dataset import Dataset, DatasetFile
from app.models.lag_feature import LagFeatureGeneration, LagFeatureSplit, LagFeatureSplitSample
from app.models.model_training import (
    ExperimentTrainedModel,
    ModelTrainingExperiment,
    ModelTrainingForecastResult,
    ModelTrainingSplitExperimentCounter,
)
from app.models.traffic import TrafficAggregationJob


def get_comparison_partition(db: Session, split_id: UUID) -> tuple | None:
    """Return persisted membership, never infer equivalence from sample counts."""
    split = db.get(LagFeatureSplit, split_id)
    if split is None:
        return None
    rows = db.execute(select(
        LagFeatureSplitSample.subset, LagFeatureSplitSample.sample_id,
    ).where(LagFeatureSplitSample.split_id == split_id).order_by(
        LagFeatureSplitSample.subset, LagFeatureSplitSample.sample_id,
    ))
    memberships = tuple((subset, sample_id) for subset, sample_id in rows)
    if not memberships or {row[0] for row in memberships} != {"TRAIN", "TEST"}:
        return None
    return str(split.feature_generation_id), tuple(split.forecast_horizons), memberships


def reserve_batch_experiment_number(db: Session, split_id: UUID) -> int:
    """Keep visible experiment names unique across all splits of a dataset batch.

    Validation candidates and final tests use their own split counters, not the
    visible sequence. The transaction lock serializes reservations across splits.
    """
    group_id = get_experiment_group_id(
        db, ModelTrainingExperiment(lag_feature_split_id=split_id),
    )
    if group_id is None:
        return reserve_split_experiment_number(db, split_id)
    db.execute(select(func.pg_advisory_xact_lock(
        func.hashtextextended(f"experiment-number:{group_id}", 0),
    )))
    group_splits = (
        select(LagFeatureSplit.id)
        .join(LagFeatureGeneration, LagFeatureGeneration.id == LagFeatureSplit.feature_generation_id)
        .join(TrafficAggregationJob, TrafficAggregationJob.id == LagFeatureGeneration.aggregation_id)
        .join(Dataset, Dataset.id == TrafficAggregationJob.dataset_id)
        .where(
            func.coalesce(
                cast(TrafficAggregationJob.job_metadata["group_id"].as_string(), Dataset.group_id.type),
                Dataset.group_id,
            ) == group_id,
            LagFeatureSplit.purpose == "STANDARD",
        )
    )
    last_saved = db.scalar(select(func.max(ModelTrainingExperiment.experiment_number)).where(
        ModelTrainingExperiment.lag_feature_split_id.in_(group_splits),
    )) or 0
    last_reserved = db.scalar(select(func.max(ModelTrainingSplitExperimentCounter.last_number)).where(
        ModelTrainingSplitExperimentCounter.split_id.in_(group_splits),
    )) or 0
    split_number = reserve_split_experiment_number(db, split_id)
    number = max(split_number, last_saved + 1, last_reserved + 1)
    counter = db.get(ModelTrainingSplitExperimentCounter, split_id)
    counter.last_number = number
    db.flush()
    return number


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
    dataset_file_id: UUID | None = None,
    offset: int,
    limit: int | None,
    owner_id: UUID | None = None,
) -> list[ModelTrainingExperiment]:
    statement = select(ModelTrainingExperiment).where(
        (ModelTrainingExperiment.evaluation["evaluation_subset"].astext.is_(None))
        | (ModelTrainingExperiment.evaluation["evaluation_subset"].astext != "VALIDATION")
    )
    if owner_id is not None:
        statement = statement.where(ModelTrainingExperiment.created_by == owner_id)
    if split_id is not None:
        statement = statement.where(
            (ModelTrainingExperiment.lag_feature_split_id == split_id)
            | (ModelTrainingExperiment.split_id == split_id)
        )
    if status is not None:
        statement = statement.where(ModelTrainingExperiment.status == status)
    if dataset_file_id is not None:
        statement = statement.where(
            ModelTrainingExperiment.configuration["dataset_file_id"].astext
            == str(dataset_file_id)
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


def save_best_overall_selection(
    db: Session, experiment_id: UUID, selection: dict[str, Any],
) -> None:
    experiment = db.get(ModelTrainingExperiment, experiment_id)
    if experiment is None:
        raise LookupError("Experiment no longer exists")
    experiment.evaluation = {**(experiment.evaluation or {}), "best_overall_selection": selection}
    db.commit()


def get_experiment_group_id(db: Session, experiment: ModelTrainingExperiment) -> UUID | None:
    """Resolve the dataset batch from the persisted experiment's training source."""
    if experiment.lag_feature_split_id is not None:
        row = db.execute(
            select(TrafficAggregationJob.job_metadata, Dataset.group_id)
            .select_from(TrafficAggregationJob)
            .join(LagFeatureGeneration, LagFeatureGeneration.aggregation_id == TrafficAggregationJob.id)
            .join(LagFeatureSplit, LagFeatureSplit.feature_generation_id == LagFeatureGeneration.id)
            .join(Dataset, Dataset.id == TrafficAggregationJob.dataset_id)
            .where(LagFeatureSplit.id == experiment.lag_feature_split_id)
        ).one_or_none()
        if row is None:
            return None
        metadata, dataset_group_id = row
        group_id = (metadata or {}).get("group_id")
        return UUID(group_id) if group_id else dataset_group_id
    if experiment.dataset_id is not None:
        return db.scalar(select(Dataset.group_id).where(Dataset.id == experiment.dataset_id))
    file_id = (experiment.configuration or {}).get("dataset_file_id")
    if file_id is None:
        return None
    return db.scalar(
        select(Dataset.group_id)
        .join(DatasetFile, DatasetFile.dataset_id == Dataset.id)
        .where(DatasetFile.id == UUID(file_id))
    )


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
