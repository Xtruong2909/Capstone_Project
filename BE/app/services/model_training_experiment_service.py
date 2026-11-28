"""Split-scoped experiment training, evaluation, and result APIs."""

import hashlib
import json
import logging
import math
import platform
import time
from datetime import UTC, datetime
from uuid import UUID, uuid4

import numpy as np
import sklearn
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.crud import crud_model_training_experiments as repository
from app.models.model_training import (
    ExperimentTrainedModel,
    ModelTrainingExperiment,
    ModelTrainingForecastResult,
)
from app.models.user import User
from app.schemas.model_training import (
    BestOverallSelection,
    ExperimentComparisonRequest,
    ExperimentComparisonResponse,
    Hyperparameters,
    OverallExperimentScore,
    TrainingExperimentResponse,
)
from app.schemas.model_training_experiment import (
    ExperimentModelsResponse,
    ExperimentPrediction,
    ExperimentPredictionListResponse,
    TrainedModelSummary,
    TrainingExperimentCreateRequest,
)
from app.services import model_training_service as legacy_service
from app.services.audit_log_service import record_audit_event
from app.services.lag_feature_model_service import (
    fit_saved_split,
    remove_forest_artifact,
)
from app.services.scientist_ownership_service import require_scientist_owner
from app.services.train_test_splits_service import get_accessible_split

logger = logging.getLogger(__name__)
SUPPORTED_HORIZONS = (1, 3, 5)
EQUIVALENT_TEST_POLICIES = {
    "persisted-lag-feature-split; test set is evaluation-only",
    "frozen validation selection; refit Train + Validation; final Test evaluation",
}


def _comparison_key(db: Session, experiment: ModelTrainingExperiment) -> str | None:
    evaluation = experiment.evaluation or {}
    if (experiment.lag_feature_split_id is None
        or evaluation.get("evaluation_subset", "TEST") != "TEST"
        or evaluation.get("evaluation_policy") not in EQUIVALENT_TEST_POLICIES):
        return None
    partition = repository.get_comparison_partition(db, experiment.lag_feature_split_id)
    if partition is None:
        return None
    signature = (
        partition, evaluation.get("evaluation_mode", "exploratory"),
        experiment.configuration.get("forecast_horizons"),
        experiment.library_versions or {},
    )
    return hashlib.sha256(json.dumps(signature, sort_keys=True).encode()).hexdigest()


def _audit_finished_experiment(experiment: ModelTrainingExperiment, user: User) -> None:
    """Record the final outcome after the experiment transaction has committed."""
    record_audit_event(
        action="RUN_EXPERIMENT",
        module="Model Training",
        status="SUCCESS" if experiment.status == "COMPLETED" else "FAILED",
        description=f"{experiment.name} {experiment.status.lower()}",
        user=user,
        resource_id=experiment.id,
        details={
            "experiment_name": experiment.name,
            "split_id": str(experiment.lag_feature_split_id or experiment.split_id),
            "model": (experiment.configuration or {}).get("model", "RANDOM_FOREST"),
            "forecast_horizons": (experiment.configuration or {}).get("forecast_horizons", []),
        },
    )


def _next_name(number: int) -> str:
    return f"Ex-{number:02d}"


def _new_experiment_response(
    experiment: ModelTrainingExperiment,
    group_id: UUID | None = None,
) -> TrainingExperimentResponse:
    configuration = experiment.configuration
    split_id = experiment.lag_feature_split_id or experiment.split_id
    if split_id is None:
        raise HTTPException(409, "Experiment has no associated Train/Test Split")
    evaluation = experiment.evaluation or {}
    performance_by_model = experiment.performance_by_model_and_horizon or {}
    if not performance_by_model:
        for horizon, models in (experiment.performance_by_horizon or {}).items():
            for model_type, metric in models.items():
                performance_by_model.setdefault(model_type.upper(), {})[horizon] = metric
    return TrainingExperimentResponse(
        experiment_id=experiment.id,
        experiment_name=experiment.name,
        name=experiment.name,
        dataset_file_id=configuration.get("dataset_file_id"),
        group_id=group_id,
        split_id=split_id,
        train_samples=configuration.get("train_samples"),
        test_samples=configuration.get("test_samples"),
        model=configuration.get("model", "RANDOM_FOREST"),
        forecast_horizons=configuration.get("forecast_horizons", []),
        hyperparameters=Hyperparameters.model_validate(
            configuration.get("hyperparameters", {}),
        ),
        baseline_configuration=configuration.get("baseline_configuration", {}),
        model_ids=configuration.get("model_ids", {}),
        status=experiment.status,
        training_time_sec=experiment.training_time_sec,
        prediction_time_sec=experiment.prediction_time_sec,
        training_time_ms=experiment.training_time_ms,
        prediction_time_ms=experiment.prediction_time_ms,
        execution_time_sec=experiment.execution_time_sec,
        evaluation_mode=evaluation.get("evaluation_mode", "exploratory"),
        evaluation_subset=evaluation.get("evaluation_subset", "TEST"),
        official_evaluation_eligible=evaluation.get("official_evaluation_eligible", False),
        evaluation_policy=evaluation.get("evaluation_policy", "persisted-lag-feature-split"),
        performance_by_horizon=experiment.performance_by_horizon or {},
        performance_by_model_and_horizon=performance_by_model,
        prediction_rows=experiment.prediction_rows or [],
        result_tables=legacy_service.build_result_tables(experiment.prediction_rows or []),
        library_versions=experiment.library_versions or {},
        error=experiment.error,
        created_at=experiment.created_at,
        completed_at=experiment.completed_at,
        logs=experiment.logs or [],
        warnings=evaluation.get("warnings", [])
        if experiment.lag_feature_split_id is not None
        else [],
        best_overall_selection=evaluation.get("best_overall_selection"),
    )


def create_experiment(
    db: Session,
    user: User,
    payload: TrainingExperimentCreateRequest,
    *,
    validation_stage: str | None = None,
) -> TrainingExperimentResponse:
    split, _generation = get_accessible_split(db, user, payload.split_id)
    purpose = getattr(split, "purpose", "STANDARD") or "STANDARD"
    if purpose != "STANDARD" and validation_stage != purpose:
        raise HTTPException(409, "Use the validation study workflow for this reserved partition")
    if tuple(payload.forecast_horizons) != SUPPORTED_HORIZONS:
        raise HTTPException(
            422, "All forecast horizons 1, 3 and 5 are required for prediction compatibility"
        )

    try:
        reserve_number = (
            repository.reserve_split_experiment_number if validation_stage == "VALIDATION"
            else repository.reserve_batch_experiment_number
        )
        number = reserve_number(db, split.id)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(503, "Could not reserve the next experiment number") from exc
    name = _next_name(number)
    now = datetime.now(UTC)
    hyperparameters = payload.hyperparameters.model_dump(mode="json")
    experiment = ModelTrainingExperiment(
        id=uuid4(),
        dataset_id=None,
        name=name,
        split_id=None,
        lag_feature_split_id=split.id,
        experiment_number=number,
        created_by=user.id,
        configuration={
            "model": payload.model,
            "forecast_horizons": list(payload.forecast_horizons),
            "hyperparameters": hyperparameters,
            "split_id": str(split.id),
            "train_samples": split.train_sample_count,
            "test_samples": split.test_sample_count,
            "model_ids": {},
            "baseline_configuration": {
                "PERSISTENCE": "prediction_h = lag_1 for each Test sample",
                "HISTORICAL_AVERAGE": (
                    "For each horizon, predict the mean of TRAIN target_h{h}; "
                    "Test targets are never used to calculate the mean."
                ),
            },
        },
        evaluation={
            "evaluation_mode": "exploratory",
            "evaluation_subset": "VALIDATION" if validation_stage == "VALIDATION" else "TEST",
            "official_evaluation_eligible": validation_stage is None and split.leakage_check.get("has_leakage") is False,
            "evaluation_policy": (
                "validation-only model selection" if validation_stage == "VALIDATION" else
                "frozen validation selection; refit Train + Validation; final Test evaluation"
                if validation_stage == "FINAL_TEST" else
                "persisted-lag-feature-split; test set is evaluation-only"
            ),
            "warnings": list(split.warnings or []),
        },
        status="QUEUED",
        created_at=now,
    )
    db.add(experiment)
    try:
        db.commit()
        db.refresh(experiment)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Could not reserve the next experiment number") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(503, "Experiment storage unavailable") from exc

    started = time.perf_counter()
    experiment.status = "RUNNING"
    experiment.logs = [
        {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": "INFO",
            "message": f"{name} reserved for split {split.id}; training started.",
        }
    ]
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        failed = repository.get_experiment(db, experiment.id)
        if failed is None:
            raise HTTPException(503, "Experiment status could not be persisted") from exc
        logger.exception("Could not start experiment %s", experiment.id)
        failed.status = "FAILED"
        failed.error = "Could not persist RUNNING status"
        failed.execution_time_sec = time.perf_counter() - started
        failed.completed_at = datetime.now(UTC)
        failed.logs = [
            *(failed.logs or []),
            {
                "timestamp": datetime.now(UTC).isoformat(),
                "level": "ERROR",
                "message": failed.error,
            },
        ]
        try:
            db.commit()
        except SQLAlchemyError as save_exc:
            db.rollback()
            raise HTTPException(503, "Could not persist failed experiment status") from save_exc
        _audit_finished_experiment(failed, user)
        return _new_experiment_response(failed, repository.get_experiment_group_id(db, failed))
    run = None
    try:
        run = fit_saved_split(
            db,
            user,
            split.id,
            payload.hyperparameters.model_dump(),
            persist=False,
            **({"validation_stage": validation_stage} if validation_stage else {}),
        )
        model_ids: dict[str, str] = {}
        trained_models = []
        forecast_rows = []
        prediction_rows = []
        performance_by_horizon = {}
        for horizon in payload.forecast_horizons:
            model_id = uuid4()
            model_ids[str(horizon)] = str(model_id)
            trained_models.append(
                ExperimentTrainedModel(
                    model_id=model_id,
                    experiment_id=experiment.id,
                    horizon=horizon,
                    model_type=payload.model,
                    hyperparameters=hyperparameters,
                    training_time_ms=run.training_time_ms[horizon],
                    artifact_reference=run.forest.artifact_path,
                    lag_feature_forest_id=run.forest.id,
                    status="COMPLETED",
                )
            )
            values = run.predictions[horizon]
            performance_by_horizon[str(horizon)] = {
                "random_forest": {
                    **run.metrics[str(horizon)],
                    "sample_count": len(values),
                },
            }
        for model_type, predictions_by_horizon in run.predictions_by_model_and_horizon.items():
            for horizon, values in predictions_by_horizon.items():
                model_id = UUID(model_ids[str(horizon)]) if model_type == "RANDOM_FOREST" else None
                for value in values:
                    error = value["actual_vehicle_count"] - value["predicted_vehicle_count"]
                    forecast_rows.append(
                        ModelTrainingForecastResult(
                            experiment_id=experiment.id,
                            model_id=model_id,
                            **value,
                        )
                    )
                    prediction_rows.append(
                        {
                            "model": model_type,
                            "horizon_minutes": horizon,
                            "forecast_origin_time": value["input_timestamp"].isoformat(),
                            "target_timestamp": value["forecast_timestamp"].isoformat(),
                            "actual_traffic_flow": value["actual_vehicle_count"],
                            "predicted_traffic_flow": value["predicted_vehicle_count"],
                            "absolute_error": abs(error),
                            "squared_error": error**2,
                            "dataset_id": str(value["dataset_id"]),
                            "session_id": str(value["session_id"]),
                        }
                    )
        experiment.configuration = {
            **experiment.configuration,
            "model_ids": model_ids,
            "historical_average_train_target_means": {
                str(horizon): metric["train_target_mean"]
                for horizon, metric in (
                    run.performance_by_model_and_horizon.get("HISTORICAL_AVERAGE", {}).items()
                )
                if "train_target_mean" in metric
            },
        }
        experiment.performance_by_horizon = performance_by_horizon
        experiment.performance_by_model_and_horizon = run.performance_by_model_and_horizon
        experiment.prediction_rows = prediction_rows
        experiment.training_time_ms = sum(run.training_time_ms.values())
        experiment.prediction_time_ms = sum(run.prediction_time_ms.values())
        experiment.training_time_sec = experiment.training_time_ms / 1000
        experiment.prediction_time_sec = experiment.prediction_time_ms / 1000
        experiment.execution_time_sec = time.perf_counter() - started
        experiment.library_versions = {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "scikit-learn": sklearn.__version__,
            "implementation": "split-scoped-baseline-evaluation-v1",
        }
        experiment.logs = [
            *experiment.logs,
            {
                "timestamp": datetime.now(UTC).isoformat(),
                "level": "INFO",
                "message": (
                    f"Random Forest and both baselines were evaluated on the same saved {validation_stage or 'Test'} samples "
                    "for all forecast horizons."
                ),
            },
        ]
        experiment.status = "COMPLETED"
        experiment.completed_at = datetime.now(UTC)
        db.add_all([run.forest, *trained_models, *forecast_rows])
        db.commit()
        db.refresh(experiment)
    except Exception as exc:
        db.rollback()
        if run is not None:
            remove_forest_artifact(run.forest)
        logger.exception("Experiment %s failed", experiment.id)
        failed = repository.get_experiment(db, experiment.id)
        if failed is None:
            raise HTTPException(503, "Failed experiment record is unavailable") from exc
        failed.status = "FAILED"
        failed.error = str(exc)[:512] or "Training failed"
        failed.execution_time_sec = time.perf_counter() - started
        failed.completed_at = datetime.now(UTC)
        failed.logs = [
            *(failed.logs or []),
            {
                "timestamp": datetime.now(UTC).isoformat(),
                "level": "ERROR",
                "message": failed.error,
            },
        ]
        try:
            db.commit()
            db.refresh(failed)
        except SQLAlchemyError as save_exc:
            db.rollback()
            raise HTTPException(503, "Could not persist failed experiment status") from save_exc
        _audit_finished_experiment(failed, user)
        return _new_experiment_response(failed, repository.get_experiment_group_id(db, failed))
    _audit_finished_experiment(experiment, user)
    return _new_experiment_response(experiment, repository.get_experiment_group_id(db, experiment))


def list_experiments(
    db: Session,
    user: User,
    *,
    split_id: UUID | None,
    status: str | None,
    dataset_file_id: UUID | None,
    page: int,
    page_size: int,
    offset: int | None = None,
) -> tuple[int, list[TrainingExperimentResponse]]:
    rows = repository.list_experiments(
        db,
        split_id=split_id,
        status=status,
        dataset_file_id=dataset_file_id,
        offset=0,
        limit=None,
        owner_id=user.id if user.role_id == "data_scientist" else None,
    )
    visible = []
    for item in rows:
        try:
            response = get_experiment(db, user, item.id)
            visible.append((response, item.created_at))
        except HTTPException as exc:
            if exc.status_code in (403, 404):
                continue
            raise
    visible.sort(key=lambda result: (result[1], result[0].experiment_id), reverse=True)
    total = len(visible)
    start = offset if offset is not None else (page - 1) * page_size
    return total, [response for response, _created_at in visible[start : start + page_size]]


def get_experiment(
    db: Session,
    user: User,
    experiment_id: UUID,
) -> TrainingExperimentResponse:
    if user.role_id == "business_user":
        raise HTTPException(403, "Business Users must use published shared results")
    experiment = repository.get_experiment(db, experiment_id)
    if experiment is None:
        raise HTTPException(404, "Experiment not found")
    require_scientist_owner(user, experiment.created_by)
    if experiment.lag_feature_split_id is not None:
        get_accessible_split(db, user, experiment.lag_feature_split_id)
        response = _new_experiment_response(experiment, repository.get_experiment_group_id(db, experiment))
        response.comparison_key = _comparison_key(db, experiment)
        return response
    response = legacy_service.get_detail(db, experiment_id, user)
    response.group_id = repository.get_experiment_group_id(db, experiment)
    selection = (experiment.evaluation or {}).get("best_overall_selection")
    response.best_overall_selection = BestOverallSelection.model_validate(selection) if selection else None
    return response


def get_experiment_predictions(
    db: Session,
    user: User,
    experiment_id: UUID,
    *,
    model_type: str | None,
    horizon: int | None,
    session_id: UUID | None,
    page: int,
    page_size: int,
) -> ExperimentPredictionListResponse:
    get_experiment(db, user, experiment_id)
    total = repository.count_predictions(
        db,
        experiment_id=experiment_id,
        model_type=model_type,
        horizon=horizon,
        session_id=session_id,
    )
    rows = repository.list_predictions(
        db,
        experiment_id=experiment_id,
        model_type=model_type,
        horizon=horizon,
        session_id=session_id,
        offset=(page - 1) * page_size,
        limit=page_size,
    )
    return ExperimentPredictionListResponse(
        experiment_id=experiment_id,
        horizon=horizon,
        session_id=session_id,
        page=page,
        page_size=page_size,
        total_records=total,
        total_pages=math.ceil(total / page_size),
        data=[
            ExperimentPrediction(
                dataset_id=row.dataset_id,
                session_id=row.session_id,
                input_timestamp=row.input_timestamp,
                forecast_timestamp=row.forecast_timestamp,
                model_type=row.model_type,
                horizon=row.horizon,
                actual_vehicle_count=row.actual_vehicle_count,
                predicted_vehicle_count=row.predicted_vehicle_count,
                absolute_error=row.absolute_error,
            )
            for row in rows
        ],
    )


def get_experiment_models(
    db: Session,
    user: User,
    experiment_id: UUID,
) -> ExperimentModelsResponse:
    get_experiment(db, user, experiment_id)
    models = repository.list_trained_models(db, experiment_id)
    return ExperimentModelsResponse(
        experiment_id=experiment_id,
        data=[
            TrainedModelSummary(
                model_id=model.model_id,
                experiment_id=model.experiment_id,
                horizon=model.horizon,
                model_type=model.model_type,
                hyperparameters=Hyperparameters.model_validate(model.hyperparameters),
                training_time_ms=model.training_time_ms,
                artifact_reference=model.artifact_reference,
                status=model.status,
            )
            for model in models
        ],
    )


def compare_experiments(
    db: Session,
    user: User,
    payload: ExperimentComparisonRequest,
) -> ExperimentComparisonResponse:
    results = [get_experiment(db, user, experiment_id) for experiment_id in payload.experiment_ids]
    return _compare_results(results, payload.forecast_horizons)


def _compare_results(
    results: list[TrainingExperimentResponse], forecast_horizons: list[int],
) -> ExperimentComparisonResponse:
    if any(result.status != "COMPLETED" for result in results):
        raise HTTPException(409, "Only completed experiments can be compared")
    signatures = {
        (
            ("partition", result.comparison_key) if getattr(result, "comparison_key", None)
            else ("split", result.split_id, result.evaluation_policy),
            getattr(result, "dataset_file_id", None),
            tuple(result.forecast_horizons),
            result.evaluation_mode,
            getattr(result, "evaluation_subset", "TEST"),
        )
        for result in results
    }
    if len(signatures) != 1:
        raise HTTPException(
            422,
            "Comparison requires identical Train/Test samples, features, horizons and evaluation rules",
        )

    compared = []
    expected_test_rows = None
    model_types = ("RANDOM_FOREST", "PERSISTENCE", "HISTORICAL_AVERAGE")
    for result in results:
        predictions = result.prediction_rows
        performance = result.performance_by_model_and_horizon
        model_metrics = {model_type: {} for model_type in model_types}
        for horizon in forecast_horizons:
            horizon_rows = [row for row in predictions if row.horizon_minutes == horizon]
            rf_rows = [row for row in horizon_rows if row.model == "RANDOM_FOREST"]
            signature = sorted(
                (
                    str(row.dataset_id or ""),
                    str(row.session_id or ""),
                    row.forecast_origin_time,
                    row.target_timestamp,
                    row.actual_traffic_flow,
                )
                for row in rf_rows
            )
            if not signature or len(set(signature)) != len(signature):
                raise HTTPException(422, "Missing or duplicate Test predictions")
            if expected_test_rows is None:
                expected_test_rows = {}
            if horizon in expected_test_rows and expected_test_rows[horizon] != signature:
                raise HTTPException(
                    422,
                    "Experiments must use identical Test timestamps and actual values",
                )
            expected_test_rows[horizon] = signature

            for model_type in model_types:
                rows = [row for row in horizon_rows if row.model == model_type]
                row_signature = sorted(
                    (
                        str(row.dataset_id or ""),
                        str(row.session_id or ""),
                        row.forecast_origin_time,
                        row.target_timestamp,
                        row.actual_traffic_flow,
                    )
                    for row in rows
                )
                if row_signature != signature:
                    raise HTTPException(
                        422,
                        "All methods must use identical Test samples for each horizon",
                    )
                metric = performance.get(model_type, {}).get(str(horizon))
                if (
                    metric is None
                    or metric.sample_count != len(rows)
                    or not math.isfinite(metric.mae)
                    or not math.isfinite(metric.rmse)
                    or metric.mae < 0
                    or metric.rmse < 0
                ):
                    raise HTTPException(422, "Incomplete or invalid stored evaluation metrics")
                model_metrics[model_type][str(horizon)] = {
                    "mae": metric.mae,
                    "rmse": metric.rmse,
                    "sample_count": metric.sample_count,
                }

        improvements = {}
        for baseline in ("PERSISTENCE", "HISTORICAL_AVERAGE"):
            improvements[baseline] = {}
            for horizon in forecast_horizons:
                rf_metric = model_metrics["RANDOM_FOREST"][str(horizon)]
                baseline_metric = model_metrics[baseline][str(horizon)]
                improvements[baseline][str(horizon)] = {
                    "mae": baseline_metric["mae"] - rf_metric["mae"],
                    "rmse": baseline_metric["rmse"] - rf_metric["rmse"],
                }
        compared.append(
            {
                "experiment_id": result.experiment_id,
                "experiment_name": result.experiment_name,
                "hyperparameters": result.hyperparameters,
                "performance_by_model_and_horizon": model_metrics,
                "improvement_vs_baselines": improvements,
            }
        )

    return ExperimentComparisonResponse(
        forecast_horizons=forecast_horizons,
        experiments=compared,
        best_overall=_rank_overall(results) if set(forecast_horizons) == set(SUPPORTED_HORIZONS) else None,
    )


def _rank_overall(results: list[TrainingExperimentResponse]) -> BestOverallSelection:
    """Equal horizon weights; use unrounded Test RMSE, then MAE, then prediction time."""
    ranking: list[OverallExperimentScore] = []
    for result in results:
        metrics = result.performance_by_model_and_horizon["RANDOM_FOREST"]
        milliseconds = getattr(result, "prediction_time_ms", None)
        seconds = getattr(result, "prediction_time_sec", None)
        if milliseconds is None and seconds is not None:
            milliseconds = seconds * 1000
        if milliseconds is not None and (not math.isfinite(milliseconds) or milliseconds < 0):
            milliseconds = None
        ranking.append(OverallExperimentScore(
            experiment_id=result.experiment_id, experiment_name=result.experiment_name,
            average_rmse=math.fsum(metrics[str(h)].rmse for h in SUPPORTED_HORIZONS) / 3,
            average_mae=math.fsum(metrics[str(h)].mae for h in SUPPORTED_HORIZONS) / 3,
            prediction_time_ms=milliseconds, model_ids=getattr(result, "model_ids", {}),
        ))
    ranking.sort(key=lambda item: (
        item.average_rmse, item.average_mae,
        item.prediction_time_ms if item.prediction_time_ms is not None else math.inf,
        str(item.experiment_id),
    ))
    winner = ranking[0]
    return BestOverallSelection(
        split_id=results[0].split_id, selected_experiment_id=winner.experiment_id,
        selected_model_ids=winner.model_ids, average_rmse=winner.average_rmse,
        average_mae=winner.average_mae, ranking=ranking,
    )


def select_best_overall(
    db: Session, user: User, split_id: UUID, *, experiment_ids: list[UUID] | None = None,
) -> ExperimentComparisonResponse:
    """Rank the explicit selection, or all owned completed forests when no IDs are supplied."""
    split, _ = get_accessible_split(db, user, split_id)
    if getattr(split, "purpose", "STANDARD") not in (None, "STANDARD"):
        raise HTTPException(409, "Validation studies freeze their selection through the Finalize action")
    if user.role_id not in ("admin", "data_scientist"):
        raise HTTPException(403, "Chỉ Data Scientist hoặc Admin được chọn Best Overall")
    if experiment_ids is not None:
        if not 2 <= len(experiment_ids) <= 20 or len(set(experiment_ids)) != len(experiment_ids):
            raise HTTPException(422, "Chọn từ 2 đến 20 thí nghiệm khác nhau")
        candidate_ids = experiment_ids
    else:
        rows = repository.list_experiments(
            db, split_id=split_id, status="COMPLETED", offset=0, limit=None,
            owner_id=user.id if user.role_id == "data_scientist" else None,
        )
        candidate_ids = [row.id for row in rows]
    results: list[TrainingExperimentResponse] = []
    excluded: list[UUID] = []
    for experiment_id in candidate_ids:
        result = get_experiment(db, user, experiment_id)
        if result.split_id != split_id:
            raise HTTPException(422, "Các thí nghiệm đã chọn phải thuộc cùng Split")
        if result.status != "COMPLETED":
            raise HTTPException(409, "Chỉ chọn các thí nghiệm đã hoàn thành")
        if result.model != "RANDOM_FOREST" or set(result.forecast_horizons) != set(SUPPORTED_HORIZONS):
            if experiment_ids is not None:
                raise HTTPException(422, "Các thí nghiệm đã chọn phải là Random Forest với đủ horizon +1, +3, +5 phút")
            excluded.append(experiment_id)
            continue
        metrics = result.performance_by_model_and_horizon.get("RANDOM_FOREST", {})
        if not all(
            str(h) in metrics and metrics[str(h)].sample_count > 0
            and math.isfinite(metrics[str(h)].rmse) and metrics[str(h)].rmse >= 0
            and math.isfinite(metrics[str(h)].mae) and metrics[str(h)].mae >= 0
            for h in SUPPORTED_HORIZONS
        ):
            if experiment_ids is not None:
                raise HTTPException(422, "Thí nghiệm đã chọn chưa có đủ chỉ số đánh giá hợp lệ")
            excluded.append(experiment_id)
            continue
        models = repository.list_trained_models(db, experiment_id)
        model_ids = {str(model.horizon): model.model_id for model in models
                     if model.status == "COMPLETED" and model.model_type == "RANDOM_FOREST"
                     and model.artifact_reference}
        if set(model_ids) != {"1", "3", "5"} or model_ids != result.model_ids:
            if experiment_ids is not None:
                raise HTTPException(422, "Thí nghiệm đã chọn chưa có đủ 3 mô hình Random Forest hợp lệ")
            excluded.append(experiment_id)
            continue
        results.append(result)
    if not results:
        raise HTTPException(409, "Chưa có thí nghiệm Random Forest hợp lệ với đủ kết quả và mô hình +1, +3, +5 phút trong Split này")
    comparison = _compare_results(results, list(SUPPORTED_HORIZONS))
    selection = comparison.best_overall
    assert selection is not None
    selection.scope = "compared_experiments" if experiment_ids is not None else "completed_experiments_in_split"
    selection.excluded_experiment_ids = excluded
    selection.selection_saved = True
    selection.selected_at = datetime.now(UTC)
    try:
        repository.save_best_overall_selection(
            db, selection.selected_experiment_id,
            {**selection.model_dump(mode="json"), "selected_by": str(user.id)},
        )
    except (SQLAlchemyError, LookupError) as exc:
        db.rollback()
        raise HTTPException(503, "Không lưu được lựa chọn Best Overall. Vui lòng thử lại.") from exc
    return comparison
