"""Select by genuine Validation scores and predict with an existing Final Model."""

import hashlib
import math
import os
from datetime import UTC, timedelta
from decimal import ROUND_HALF_UP, Decimal
from io import BytesIO
from pathlib import Path
from uuid import UUID

import joblib
import numpy as np
from fastapi import HTTPException
from pydantic import ValidationError
from sklearn.ensemble import RandomForestRegressor
from sklearn.utils.validation import check_is_fitted
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.crud import crud_model_training as repository
from app.models.model_training import FinalModel, ModelTrainingExperiment
from app.models.user import User
from app.schemas.feature_engineering import FeatureRequest, PredictionFeatureResponse
from app.schemas.model_prediction import (
    ForecastPoint,
    ForecastTableRow,
    ForecastVisualization,
    HistoricalFlowPoint,
    ModelPredictionRequest,
    ModelPredictionResponse,
    TrafficFlowChart,
    ValidationScores,
)
from app.schemas.model_training import Hyperparameters, TrainingSplit
from app.services.feature_engineering_service import prepare_features
from app.services.model_training_service import require_version

HORIZONS = (1, 3, 5)
FEATURE_ORDER = [f"lag_{index}" for index in range(1, 6)]
MAX_ARTIFACT_BYTES = 256 * 1024 * 1024


def select_best_experiment(
    db: Session, candidates: list[ModelTrainingExperiment],
) -> ModelTrainingExperiment:
    """Score the same Validation set; never relabel stored Test scores."""
    if not candidates:
        raise HTTPException(404, "No completed Random Forest experiments exist for this split")
    ranked = []
    signatures = set()
    for experiment in candidates:
        validation = repository.get_validation_result(db, experiment.id)
        if validation is None:
            continue
        try:
            scores = ValidationScores(scores=validation.performance_by_horizon).scores
        except ValidationError as exc:
            raise HTTPException(409, "Stored Validation scores are incomplete or invalid") from exc
        if validation.sample_count < 1 or len(validation.validation_fingerprint) != 64:
            raise HTTPException(409, "Stored Validation provenance is invalid")
        if tuple(experiment.configuration.get("forecast_horizons", ())) != HORIZONS:
            raise HTTPException(409, "Experiment horizons are incompatible with prediction")
        signatures.add((
            experiment.split_id,
            experiment.evaluation.get("evaluation_policy"),
            experiment.evaluation.get("evaluation_mode"),
            validation.validation_fingerprint,
            validation.sample_count,
        ))
        average_mae = math.fsum(scores[str(h)].mae for h in HORIZONS) / len(HORIZONS)
        average_rmse = math.fsum(scores[str(h)].rmse for h in HORIZONS) / len(HORIZONS)
        ranked.append((average_mae, average_rmse, experiment.number, str(experiment.id), experiment))
    if not ranked:
        raise HTTPException(409, {
            "code": "VALIDATION_NOT_AVAILABLE",
            "message": "Chưa có điểm Validation để chọn thí nghiệm tốt nhất.",
        })
    if len(signatures) != 1:
        raise HTTPException(409, "Experiments need the same split, Validation set and evaluation rules")
    return min(ranked, key=lambda item: item[:4])[4]


def _resolve_scope(
    db: Session, payload: ModelPredictionRequest, user: User,
) -> tuple[UUID, UUID, list[ModelTrainingExperiment]]:
    anchor = repository.get_experiment(db, payload.experiment_id) if payload.experiment_id else None
    if payload.experiment_id and anchor is None:
        raise HTTPException(404, "Experiment not found")
    version_id = UUID(anchor.configuration["dataset_version_id"]) if anchor else payload.dataset_version_id
    if version_id is None:
        raise HTTPException(422, "dataset_version_id is required")
    require_version(db, version_id, user, training=True)
    if anchor and payload.dataset_version_id and payload.dataset_version_id != version_id:
        raise HTTPException(422, "Experiment and dataset_version_id do not match")
    if anchor and payload.split_id and payload.split_id != anchor.split_id:
        raise HTTPException(422, "Experiment and split_id do not match")
    requested_split = anchor.split_id if anchor else payload.split_id
    candidates = repository.list_completed_forests(db, version_id)
    if requested_split is None:
        distinct_splits = {experiment.split_id for experiment in candidates}
        if len(distinct_splits) > 1:
            raise HTTPException(409, "Multiple splits exist; supply split_id for a fair comparison")
        if not distinct_splits:
            raise HTTPException(404, "No completed Random Forest experiments exist for this dataset")
        requested_split = next(iter(distinct_splits))
    scoped = [experiment for experiment in candidates if experiment.split_id == requested_split]
    if not scoped:
        raise HTTPException(404, "No completed Random Forest experiments exist for this split")
    return version_id, requested_split, scoped


def _load_models(final: FinalModel, parameters: Hyperparameters) -> dict[int, RandomForestRegressor]:
    """Load only a trusted, checksum-matched artifact under the configured model root."""
    root = Path(os.getenv(
        "FINAL_MODEL_DIR", str(Path(__file__).resolve().parents[2] / "artifacts" / "final_models"),
    )).resolve()
    path = (root / final.artifact_path).resolve()
    if not path.is_relative_to(root) or path == root:
        raise HTTPException(409, "Final Model artifact path is outside the configured model directory")
    try:
        if path.stat().st_size > MAX_ARTIFACT_BYTES:
            raise HTTPException(409, "Final Model artifact exceeds the size limit")
        content = path.read_bytes()
    except FileNotFoundError as exc:
        raise HTTPException(409, "Final Model artifact file is missing") from exc
    except OSError as exc:
        raise HTTPException(409, "Final Model artifact cannot be read") from exc
    if hashlib.sha256(content).hexdigest() != final.artifact_sha256:
        raise HTTPException(409, "Final Model artifact checksum does not match")
    try:
        bundle = joblib.load(BytesIO(content))
    except Exception as exc:
        raise HTTPException(409, "Final Model artifact cannot be loaded") from exc
    if not isinstance(bundle, dict) or set(bundle) != {"1", "3", "5"}:
        raise HTTPException(409, "Final Model must contain fitted forests for 1, 3 and 5 minutes")
    models = {}
    expected_parameters = parameters.model_dump()
    for horizon in HORIZONS:
        model = bundle[str(horizon)]
        if not isinstance(model, RandomForestRegressor):
            raise HTTPException(409, "Final Model contains an unsupported estimator")
        try:
            check_is_fitted(model)
        except Exception as exc:
            raise HTTPException(409, "Final Model contains an unfitted estimator") from exc
        if model.n_features_in_ != 5:
            raise HTTPException(409, "Final Model does not accept five lag features")
        fitted_parameters = model.get_params(deep=False)
        if any(
            fitted_parameters[key] != value
            or (key == "max_features" and type(fitted_parameters[key]) is not type(value))
            for key, value in expected_parameters.items()
        ):
            raise HTTPException(409, "Final Model parameters do not match the chosen Experiment")
        models[horizon] = model
    return models


def _validate_features(
    features: PredictionFeatureResponse, split: TrainingSplit, final: FinalModel,
) -> None:
    origin = features.latest_time_bucket.astimezone(UTC)
    if (features.dataset_version_id != split.dataset_version_id
            or features.roi_identifier != split.roi_identifier
            or features.recording_session_id != split.recording_session_id
            or final.dataset_version_id != split.dataset_version_id
            or final.roi_identifier != split.roi_identifier
            or final.recording_session_id != split.recording_session_id
            or final.split_id is None):
        raise HTTPException(409, "Final Model, split and Recording Session do not match")
    if (features.feature_order != FEATURE_ORDER or split.feature_order != FEATURE_ORDER
            or final.feature_order != FEATURE_ORDER
            or tuple(features.forecast_horizons) != HORIZONS
            or tuple(final.forecast_horizons) != HORIZONS):
        raise HTTPException(409, "Final Model and prediction features must use five lags and three horizons")
    if (features.history_start_time.astimezone(UTC) != origin - timedelta(minutes=4)
            or len(features.x) != 5
            or features.x != [getattr(features.features, name) for name in FEATURE_ORDER]
            or any(not math.isfinite(value) or value < 0 for value in features.x)
            or [value.astimezone(UTC) for value in features.target_times]
            != [origin + timedelta(minutes=h) for h in HORIZONS]):
        raise HTTPException(422, "Five continuous, valid observed lag values are required")
    if final.trained_through.astimezone(UTC) > origin:
        raise HTTPException(409, "Final Model was trained using observations after the forecast origin")


def build_visualization(
    features: PredictionFeatureResponse, predictions: list[ForecastPoint],
) -> ForecastVisualization:
    """Expose sparse forecast points and the five observed buckets without inventing values."""
    origin = features.latest_time_bucket.astimezone(UTC)
    history = [
        HistoricalFlowPoint(
            time=origin - timedelta(minutes=4 - index), traffic_flow=flow,
        )
        for index, flow in enumerate(reversed(features.x))
    ]
    last_observed = Decimal(str(features.x[0]))
    rows = []
    for point in predictions:
        change = (Decimal(str(point.predicted_flow)) - last_observed).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP,
        )
        trend = "increase" if change > 0 else "decrease" if change < 0 else "unchanged"
        rows.append(ForecastTableRow(
            **point.model_dump(), change_from_last_observed=float(change), trend=trend,
        ))
    return ForecastVisualization(
        traffic_flow_chart=TrafficFlowChart(history=history, forecast=predictions),
        forecast_by_horizon=predictions,
        forecast_table=rows,
    )


def predict_experiment(
    db: Session, payload: ModelPredictionRequest, user: User,
) -> ModelPredictionResponse:
    """No fitting occurs here: read Validation, fitted forests and current observations."""
    try:
        version_id, split_id, candidates = _resolve_scope(db, payload, user)
        selected = select_best_experiment(db, candidates)
        final = repository.get_final_model(db, selected.id)
        if final is None:
            raise HTTPException(409, {
                "code": "FINAL_MODEL_NOT_AVAILABLE",
                "message": "Thí nghiệm tốt nhất chưa có Final Model đã huấn luyện.",
                "experiment_id": str(selected.id),
            })
        stored_split = repository.get_split(db, split_id)
        if stored_split is None or stored_split.dataset_version_id != version_id:
            raise HTTPException(409, "The chosen Experiment's saved split is unavailable")
        try:
            split = TrainingSplit.model_validate(stored_split.payload)
            parameters = Hyperparameters.model_validate(selected.configuration["hyperparameters"])
            final_parameters = Hyperparameters.model_validate(final.hyperparameters)
        except (ValidationError, KeyError) as exc:
            raise HTTPException(409, "Stored Final Model or Experiment configuration is invalid") from exc
        if (split.dataset_version_id != version_id or final.experiment_id != selected.id
                or final.split_id != split_id or final_parameters != parameters):
            raise HTTPException(409, "Final Model provenance does not match the chosen Experiment")
        features = prepare_features(
            db, FeatureRequest(dataset_version_id=version_id, roi_identifier=split.roi_identifier),
            user, prediction=True,
        )
        if not isinstance(features, PredictionFeatureResponse):
            raise HTTPException(500, "Prediction feature service returned an unexpected result")
        _validate_features(features, split, final)
        models = _load_models(final, parameters)
        origin = features.latest_time_bucket.astimezone(UTC)
        x = np.asarray([features.x], dtype=float)
        points = []
        values = []
        for horizon in HORIZONS:
            predicted = float(models[horizon].predict(x)[0])
            if not math.isfinite(predicted) or predicted < 0:
                raise HTTPException(409, "Final Model produced an invalid traffic-flow forecast")
            rounded = Decimal(str(predicted)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if rounded > Decimal("99999999.99"):
                raise HTTPException(409, "Forecast exceeds the database's supported range")
            target_time = origin + timedelta(minutes=horizon)
            points.append(ForecastPoint(
                horizon=horizon, forecast_time=target_time, predicted_flow=float(rounded),
            ))
            values.append((horizon, target_time, rounded))
        repository.save_final_forecasts(db, final.id, origin, values)
        return ModelPredictionResponse(
            experiment_id=selected.id, model_id=final.id, dataset_version_id=version_id,
            last_observed_time=origin,
            last_observed_flow=features.x[0],
            source_experiment_evaluation_mode=selected.evaluation["evaluation_mode"],
            source_experiment_official_evaluation_eligible=selected.evaluation[
                "official_evaluation_eligible"
            ],
            predictions=points,
            visualization=build_visualization(features, points),
        )
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(503, "Forecast database is unavailable") from exc
