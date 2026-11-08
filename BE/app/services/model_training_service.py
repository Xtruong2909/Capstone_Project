"""Fit real forests on an immutable supplied split and persist both result tables."""

import hashlib
import json
import logging
import math
import platform
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.dataset_access import require_dataset_reader, require_dataset_scientist
from app.crud import crud_dataset_access
from app.crud import crud_model_training as repository
from app.models.model_training import ModelTrainingExperiment
from app.models.user import User
from app.schemas.model_training import (
    Hyperparameters,
    Prediction,
    ResultTables,
    TrainingExperimentRequest,
    TrainingExperimentResponse,
    TrainingSplit,
    TrainingSplitInput,
)

logger = logging.getLogger(__name__)
EVALUATION_POLICY = "traffic-v2:train-target-before-test-history;HA=train-target-mean"


def build_parameter_request(
    version_id: UUID, split_id: UUID | None, split_result: TrainingSplitInput | None,
    hyperparameters: dict, evaluation_mode: str,
) -> TrainingExperimentRequest:
    """Adapt separate query parameters to the validated training contract."""
    if (split_id is None) == (split_result is None):
        raise HTTPException(422, "Supply either split_id or a split response in the request body, not both")
    parameters = dict(hyperparameters)
    features = parameters["max_features"].strip()
    if features in ("sqrt", "log2"):
        parameters["max_features"] = features
    elif features.lower() in ("none", "null"):
        parameters["max_features"] = None
    else:
        try:
            parameters["max_features"] = json.loads(features)
        except ValueError as exc:
            raise HTTPException(422, "max_features: use 1.0, integer 1..5, sqrt, log2 or null") from exc
    try:
        validated_split = None
        if split_result is not None:
            data = split_result.model_dump()
            if data["dataset_version_id"] is None:
                data["dataset_version_id"] = version_id
            validated_split = TrainingSplit.model_validate(data)
        return TrainingExperimentRequest(
            dataset_version_id=version_id, split_id=split_id, split_result=validated_split,
            hyperparameters=parameters, evaluation_mode=evaluation_mode,
        )
    except ValidationError as exc:
        raise HTTPException(422, json.loads(exc.json(
            include_input=False, include_context=False, include_url=False,
        ))) from exc


def split_fingerprint(split: TrainingSplit) -> str:
    canonical = json.dumps(split.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def create_from_saved_split(
    db: Session, split_id: UUID, hyperparameters: dict, evaluation_mode: str, user: User,
) -> TrainingExperimentResponse:
    stored = repository.get_split(db, split_id)
    if stored is None:
        raise HTTPException(404, "Split not found; call the train/test split API first")
    request = build_parameter_request(
        stored.dataset_version_id, split_id, None, hyperparameters, evaluation_mode,
    )
    return create_and_run(db, request, user)


def evaluate_validity(split: TrainingSplit, requested_mode: str) -> dict:
    # Lag 1 is the observation at origin; lag 5 is origin minus four minutes.
    latest_train_target = split.train_times[-1] + timedelta(minutes=5)
    earliest_test_history = split.test_times[0] - timedelta(minutes=4)
    overlap = latest_train_target >= earliest_test_history
    eligible = not overlap
    if requested_mode == "official" and not eligible:
        raise HTTPException(422, {
            "code": "INVALID_OFFICIAL_EVALUATION",
            "message": "Dữ liệu Train/Test bị chồng lấn thời gian; không đủ điều kiện đánh giá chính thức.",
        })
    return {
        "evaluation_mode": requested_mode,
        "official_evaluation_eligible": eligible,
        "evaluation_policy": EVALUATION_POLICY,
    }


def train_models(
    split: TrainingSplit,
    parameters: Hyperparameters,
    progress: Callable[[str], None] | None = None,
) -> dict:
    import numpy as np
    import sklearn
    from sklearn.ensemble import RandomForestRegressor

    training_time = 0.0
    prediction_time = 0.0
    rows = []
    performance = {}
    x_train, x_test = np.asarray(split.X_train), np.asarray(split.X_test)
    y_train, y_test = np.asarray(split.y_train), np.asarray(split.y_test)
    for target_index, horizon in enumerate((1, 3, 5)):
        if progress:
            progress(f"Training Random Forest for the {horizon}-minute forecast horizon.")
        model = RandomForestRegressor(**parameters.model_dump(), n_jobs=1)
        started = time.perf_counter()
        model.fit(x_train, y_train[:, target_index])
        # Historical Average is the mean of TRAIN labels for this horizon.
        historical_mean = float(np.mean(y_train[:, target_index]))
        training_time += time.perf_counter() - started
        started = time.perf_counter()
        predictions = {
            "random_forest": model.predict(x_test),
            "persistence": x_test[:, 0],  # lag_1, never lag_5 or a test label
            "historical_average": np.full(len(x_test), historical_mean),
        }
        prediction_time += time.perf_counter() - started
        performance[str(horizon)] = {}
        for model_name, values in predictions.items():
            errors = []
            for index, predicted in enumerate(values):
                actual = float(y_test[index, target_index])
                error = actual - float(predicted)
                square = error ** 2
                if not math.isfinite(square):
                    raise ValueError("Non-finite error; traffic values exceed supported numerical range")
                errors.append(error)
                origin = split.test_times[index]
                rows.append(Prediction(
                    model=model_name.upper(), horizon_minutes=horizon,
                    forecast_origin_time=origin,
                    target_timestamp=origin + timedelta(minutes=horizon),
                    actual_traffic_flow=actual, predicted_traffic_flow=float(predicted),
                    absolute_error=abs(error), squared_error=square,
                ).model_dump(mode="json"))
            performance[str(horizon)][model_name] = {
                "mae": float(np.mean(np.abs(errors))),
                "rmse": float(np.sqrt(np.mean(np.square(errors)))),
                "sample_count": len(errors),
            }
        if progress:
            metric = performance[str(horizon)]["random_forest"]
            progress(
                f"Evaluated {len(x_test)} test rows for the {horizon}-minute horizon "
                f"(Random Forest MAE={metric['mae']:.4f}, RMSE={metric['rmse']:.4f})."
            )
    return {
        "training_time_sec": training_time,
        "prediction_time_sec": prediction_time,
        "performance_by_horizon": performance,
        "prediction_rows": rows,
        "library_versions": {
            "python": platform.python_version(), "scikit-learn": sklearn.__version__,
            "numpy": np.__version__, "implementation": "model-training-v1",
        },
    }


def require_version(db: Session, version_id: UUID, user: User, training: bool = False) -> None:
    version = crud_dataset_access.get_version(db, version_id)
    if version is None:
        raise HTTPException(404, "Dataset version not found")
    guard = require_dataset_scientist if training else require_dataset_reader
    guard(dataset_id=version.dataset_id, current_user=user, db=db)


def build_result_tables(prediction_rows: list[dict]) -> ResultTables:
    """Derive three display tables from stored predictions, including older experiments."""
    rows = [Prediction.model_validate(row) for row in prediction_rows]
    forecasts = []
    summaries = []
    for model in ("RANDOM_FOREST", "PERSISTENCE", "HISTORICAL_AVERAGE"):
        model_rows = [row for row in rows if row.model == model]
        if not model_rows:
            continue
        mse = math.fsum(row.squared_error for row in model_rows) / len(model_rows)
        summaries.append({
            "model": model, "sample_count": len(model_rows), "mse": mse,
            "rmse": math.sqrt(mse),
            "mae": math.fsum(row.absolute_error for row in model_rows) / len(model_rows),
        })
        if model == "RANDOM_FOREST":
            for horizon in (1, 3, 5):
                horizon_rows = [row for row in model_rows if row.horizon_minutes == horizon]
                if not horizon_rows:
                    continue
                latest = max(horizon_rows, key=lambda row: row.forecast_origin_time)
                horizon_mse = math.fsum(row.squared_error for row in horizon_rows) / len(horizon_rows)
                forecasts.append({
                    **latest.model_dump(), "sample_count": len(horizon_rows),
                    "mse": horizon_mse, "rmse": math.sqrt(horizon_mse),
                })
    return ResultTables(
        horizon_forecasts=forecasts, prediction_details=rows, model_summary=summaries,
    )


def serialize_experiment(experiment: ModelTrainingExperiment) -> TrainingExperimentResponse:
    config = experiment.configuration
    return TrainingExperimentResponse(
        experiment_id=experiment.id, experiment_name=experiment.name,
        dataset_version_id=config["dataset_version_id"], split_id=experiment.split_id,
        model=config["model"], forecast_horizons=config["forecast_horizons"],
        hyperparameters=config["hyperparameters"], status=experiment.status,
        training_time_sec=experiment.training_time_sec,
        prediction_time_sec=experiment.prediction_time_sec,
        execution_time_sec=experiment.execution_time_sec,
        evaluation_mode=experiment.evaluation["evaluation_mode"],
        official_evaluation_eligible=experiment.evaluation["official_evaluation_eligible"],
        evaluation_policy=experiment.evaluation["evaluation_policy"],
        performance_by_horizon=experiment.performance_by_horizon,
        prediction_rows=experiment.prediction_rows,
        result_tables=build_result_tables(experiment.prediction_rows),
        library_versions=experiment.library_versions, error=experiment.error,
        created_at=experiment.created_at,
        logs=getattr(experiment, "logs", None) or [],
    )


def create_and_run(db: Session, request: TrainingExperimentRequest, user: User) -> TrainingExperimentResponse:
    started = time.perf_counter()
    require_version(db, request.dataset_version_id, user, training=True)
    try:
        if request.split_result is not None:
            split = request.split_result
            evaluation = evaluate_validity(split, request.evaluation_mode)
            stored_split = repository.save_split(
                db, request.dataset_version_id, split_fingerprint(split), split.model_dump(mode="json")
            )
        else:
            stored_split = repository.get_split(db, request.split_id)
            if stored_split is None or stored_split.dataset_version_id != request.dataset_version_id:
                raise HTTPException(404, "Split not found for this dataset version")
            try:
                split = TrainingSplit.model_validate(stored_split.payload)
            except ValidationError as exc:
                raise HTTPException(422, "Stored split is incompatible with chronological 70/30 training") from exc
            evaluation = evaluate_validity(split, request.evaluation_mode)
        configuration = request.model_dump(mode="json", exclude={"split_result"})
        configuration["split_id"] = str(stored_split.id)
        experiment = repository.create_experiment(db, stored_split.id, user.id, configuration, evaluation)
        logs = [
            {
                "timestamp": datetime.now(UTC).isoformat(),
                "level": "INFO",
                "message": "Dataset access validated and experiment created.",
            },
            {
                "timestamp": datetime.now(UTC).isoformat(),
                "level": "INFO",
                "message": (
                    f"Chronological split loaded: {len(split.X_train)} training rows, "
                    f"{len(split.X_test)} test rows; evaluation mode={evaluation['evaluation_mode']}."
                ),
            },
            {
                "timestamp": datetime.now(UTC).isoformat(),
                "level": "INFO",
                "message": "Training started.",
            },
        ]
        repository.update_experiment(db, experiment, status="RUNNING", logs=logs)

        def record_progress(message: str) -> None:
            logs.append({
                "timestamp": datetime.now(UTC).isoformat(),
                "level": "INFO",
                "message": message,
            })
            repository.update_experiment(db, experiment, logs=list(logs))

        try:
            results = train_models(split, request.hyperparameters, progress=record_progress)
        except Exception:
            logger.exception("Training failed for experiment %s", experiment.id)
            logs.append({
                "timestamp": datetime.now(UTC).isoformat(),
                "level": "ERROR",
                "message": "Training failed; see server logs with experiment ID.",
            })
            repository.update_experiment(
                db, experiment, status="FAILED", error="Training failed; see server logs with experiment ID.",
                execution_time_sec=time.perf_counter() - started, logs=list(logs),
            )
        else:
            logs.append({
                "timestamp": datetime.now(UTC).isoformat(),
                "level": "INFO",
                "message": "Training completed successfully.",
            })
            repository.update_experiment(
                db, experiment, status="COMPLETED", **results,
                execution_time_sec=time.perf_counter() - started, logs=list(logs),
            )
        return serialize_experiment(experiment)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(503, "Experiment storage unavailable") from exc


def get_detail(db: Session, experiment_id: UUID, user: User) -> TrainingExperimentResponse:
    experiment = repository.get_experiment(db, experiment_id)
    if experiment is None:
        raise HTTPException(404, "Experiment not found")
    require_version(db, UUID(experiment.configuration["dataset_version_id"]), user)
    return serialize_experiment(experiment)


def list_results(db: Session, user: User, version_id: UUID | None, skip: int,
                 limit: int) -> list[TrainingExperimentResponse]:
    if user.role_id not in ("admin", "data_scientist", "business_user"):
        raise HTTPException(403, "Training experiment read access required")
    if version_id:
        require_version(db, version_id, user)
    return [serialize_experiment(item)
            for item in repository.list_experiments(db, user, version_id, skip, limit)]


def compare_results(db: Session, ids: list[UUID], user: User) -> dict:
    if not 2 <= len(ids) <= 20:
        raise HTTPException(422, "Select between 2 and 20 experiments")
    if len(set(ids)) != len(ids):
        raise HTTPException(422, "Experiment IDs must be distinct")
    results = [get_detail(db, experiment_id, user) for experiment_id in ids]
    signatures = {
        (r.dataset_version_id, r.split_id, r.evaluation_policy, r.evaluation_mode,
         tuple(r.forecast_horizons)) for r in results
    }
    if len(signatures) != 1:
        raise HTTPException(422, "Comparison requires the same dataset version, split, horizons and evaluation rules")
    if any(r.status != "COMPLETED" for r in results):
        raise HTTPException(409, "Only completed experiments can be compared")
    test_signature = None
    experiments = []
    for result in results:
        rows = [row for row in result.prediction_rows if row.model == "RANDOM_FOREST"]
        signature = sorted((row.horizon_minutes, row.forecast_origin_time,
                            row.target_timestamp, row.actual_traffic_flow) for row in rows)
        if not signature or len(set(signature)) != len(signature):
            raise HTTPException(422, "Missing or duplicate Random Forest test predictions")
        if test_signature is not None and signature != test_signature:
            raise HTTPException(422, "Experiments must use identical Test timestamps and actual values")
        test_signature = signature
        performance = {}
        for horizon in (1, 3, 5):
            metric = result.performance_by_horizon.get(str(horizon), {}).get("random_forest")
            count = sum(row.horizon_minutes == horizon for row in rows)
            if (metric is None or not count or metric.sample_count != count
                    or not math.isfinite(metric.mae) or not math.isfinite(metric.rmse)
                    or metric.mae < 0 or metric.rmse < 0):
                raise HTTPException(422, "Incomplete or invalid stored Random Forest metrics")
            performance[str(horizon)] = {"mae": metric.mae, "rmse": metric.rmse}
        experiments.append({
            "experiment_id": result.experiment_id, "experiment_name": result.experiment_name,
            **result.hyperparameters.model_dump(), "training_time_sec": result.training_time_sec,
            "prediction_time_sec": result.prediction_time_sec, "performance": performance,
        })
    best, best_ids, ties = {}, {}, {}
    for horizon in ("1", "3", "5"):
        minimum = min(item["performance"][horizon]["rmse"] for item in experiments)
        winners = sorted(
            [item for item in experiments if item["performance"][horizon]["rmse"] == minimum],
            key=lambda item: str(item["experiment_id"]),
        )
        best[horizon] = winners[0]["experiment_name"]
        best_ids[horizon] = winners[0]["experiment_id"]
        ties[horizon] = [item["experiment_id"] for item in winners]
    return {"experiments": experiments, "best_by_horizon": best,
            "best_experiment_ids_by_horizon": best_ids, "tied_experiment_ids_by_horizon": ties}
