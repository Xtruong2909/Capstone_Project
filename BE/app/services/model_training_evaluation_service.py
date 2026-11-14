"""RQ2/RQ3 tables from persisted Test predictions; no training or split mutation."""

import math
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.crud import crud_model_training_evaluation as evaluation_repo
from app.crud import crud_model_training_experiments as experiment_repo
from app.models.model_training import ModelTrainingForecastResult
from app.models.user import User
from app.schemas.model_training import TrainingExperimentResponse
from app.schemas.model_training_evaluation import (
    EvaluationPage,
    EvaluationRow,
    HorizonForecastResults,
    HorizonMetrics,
    ModelEvaluationMetric,
    ModelEvaluationSummary,
    RandomForestBaselineDifference,
)
from app.services.model_training_experiment_service import get_experiment

MODELS = ("RANDOM_FOREST", "PERSISTENCE", "HISTORICAL_AVERAGE")
HORIZONS = (1, 3, 5)


def _completed_experiment(
    db: Session, user: User, experiment_id: UUID,
) -> TrainingExperimentResponse:
    experiment = get_experiment(db, user, experiment_id)
    if experiment.status != "COMPLETED":
        raise HTTPException(409, "Evaluation is available after the experiment completes")
    return experiment


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise HTTPException(409, "Saved evaluation timestamp has no timezone")
    return value.astimezone(UTC)


def _row(saved: ModelTrainingForecastResult) -> EvaluationRow:
    origin = _utc(saved.input_timestamp)
    forecast = _utc(saved.forecast_timestamp)
    actual = _utc(saved.actual_timestamp)
    if forecast != origin + timedelta(minutes=saved.horizon) or actual != forecast:
        raise HTTPException(409, "Saved Test timestamps are inconsistent")
    return EvaluationRow(
        dataset_id=saved.dataset_id,
        session_id=saved.session_id,
        model=saved.model_type,
        horizon=saved.horizon,
        input_timestamp=origin,
        forecast_timestamp=forecast,
        actual_timestamp=actual,
        actual_vehicle_count=saved.actual_vehicle_count,
        predicted_vehicle_count=saved.predicted_vehicle_count,
        absolute_error=saved.absolute_error,
        squared_error=saved.squared_error,
    )


def _metrics(db: Session, experiment_id: UUID) -> list[ModelEvaluationMetric]:
    rows = evaluation_repo.evaluation_metrics(db, experiment_id)
    metrics = [
        ModelEvaluationMetric(
            model=model,
            horizon=horizon,
            test_sample_count=count,
            mae=float(mae),
            mse=float(mse),
            rmse=math.sqrt(float(mse)),
        )
        for model, horizon, count, mae, mse in rows
    ]
    if {(item.model, item.horizon) for item in metrics} != {
        (model, horizon) for model in MODELS for horizon in HORIZONS
    }:
        raise HTTPException(409, "Experiment does not contain all nine evaluation metric sets")
    for horizon in HORIZONS:
        counts = {item.test_sample_count for item in metrics if item.horizon == horizon}
        if len(counts) != 1 or 0 in counts:
            raise HTTPException(409, "Evaluation methods do not share the same Test samples")
    return metrics


def evaluation_page(
    db: Session, user: User, experiment_id: UUID, *,
    model: str | None, horizon: int | None, session_id: UUID | None,
    page: int, page_size: int, horizon_table: bool,
) -> EvaluationPage | HorizonForecastResults:
    _completed_experiment(db, user, experiment_id)
    selected_model = "RANDOM_FOREST" if horizon_table else model
    total = experiment_repo.count_predictions(
        db, experiment_id=experiment_id, model_type=selected_model,
        horizon=horizon, session_id=session_id,
    )
    saved = experiment_repo.list_predictions(
        db, experiment_id=experiment_id, model_type=selected_model,
        horizon=horizon, session_id=session_id,
        offset=(page - 1) * page_size, limit=page_size,
    )
    common = {
        "experiment_id": experiment_id, "horizon": horizon, "model": selected_model,
        "session_id": session_id, "page": page, "page_size": page_size,
        "total_records": total, "total_pages": math.ceil(total / page_size),
        "data": [_row(row) for row in saved],
    }
    if horizon_table:
        metrics = _metrics(db, experiment_id)
        return HorizonForecastResults(
            **common,
            metrics_by_horizon=[
                HorizonMetrics(**item.model_dump(exclude={"model"}))
                for item in metrics
                if item.model == "RANDOM_FOREST" and (horizon is None or item.horizon == horizon)
            ],
        )
    return EvaluationPage(**common)


def evaluation_summary(
    db: Session, user: User, experiment_id: UUID,
) -> ModelEvaluationSummary:
    experiment = _completed_experiment(db, user, experiment_id)
    metrics = _metrics(db, experiment_id)
    lookup = {(item.model, item.horizon): item for item in metrics}
    return ModelEvaluationSummary(
        experiment_id=experiment_id,
        baseline_configuration=experiment.baseline_configuration,
        historical_average_train_target_means=(
            experiment_repo.get_experiment(db, experiment_id).configuration.get(
                "historical_average_train_target_means", {}
            )
        ),
        metrics=metrics,
        random_forest_vs_baselines=[
            RandomForestBaselineDifference(
                horizon=horizon,
                baseline=baseline,
                mae_delta_rf_minus_baseline=(
                    lookup[("RANDOM_FOREST", horizon)].mae - lookup[(baseline, horizon)].mae
                ),
                rmse_delta_rf_minus_baseline=(
                    lookup[("RANDOM_FOREST", horizon)].rmse - lookup[(baseline, horizon)].rmse
                ),
            )
            for horizon in HORIZONS
            for baseline in MODELS[1:]
        ],
    )
