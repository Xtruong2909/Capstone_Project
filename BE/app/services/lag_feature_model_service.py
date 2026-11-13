"""Train a vehicle-count forest from saved features, then forecast without refitting."""

import hashlib
import math
import os
from datetime import UTC, timedelta
from decimal import ROUND_HALF_UP, Decimal
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import joblib
import numpy as np
from fastapi import HTTPException
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sqlalchemy.orm import Session

from app.crud import crud_lag_feature as repo
from app.crud import crud_train_test_splits as split_repo
from app.models.lag_feature import LagFeatureForest, LagFeatureSample
from app.models.user import User
from app.schemas.lag_feature import (
    LagForestTrainingRequest,
    LagForestTrainingResponse,
    VehicleForecastPoint,
    VehiclePredictionRequest,
    VehiclePredictionResponse,
)
from app.services.ds_temporal_aggregation_service import get_accessible_temporal_jobs
from app.services.lag_feature_service import accessible_generation
from app.services.lag_window_service import VehicleObservation, latest_lags
from app.services.train_test_splits_service import get_accessible_split

HORIZONS = (1, 3, 5)
MAX_ARTIFACT_BYTES = 128 * 1024 * 1024


def _artifact_root() -> Path:
    root = Path(os.getenv(
        "LAG_FEATURE_MODEL_DIR",
        str(Path(__file__).resolve().parents[2] / "artifacts" / "lag_feature_forests"),
    )).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _xy(rows: list[LagFeatureSample], horizon: int) -> tuple[np.ndarray, np.ndarray]:
    x = np.asarray([[getattr(row, f"lag_{i}") for i in range(1, 6)] for row in rows], dtype=float)
    y = np.asarray([getattr(row, f"target_h{horizon}") for row in rows], dtype=float)
    return x, y


def train_vehicle_forest(
    db: Session, user: User, payload: LagForestTrainingRequest,
) -> LagForestTrainingResponse:
    split, generation = get_accessible_split(db, user, payload.split_id)
    if split.leakage_check.get("has_leakage") is not False:
        raise HTTPException(409, "Train/Test Split failed its Data Leakage check")
    if split.forecast_horizons != list(HORIZONS):
        raise HTTPException(409, "Train/Test Split must include forecast horizons 1, 3 and 5")
    train = split_repo.list_split_samples(db, split.id, "TRAIN")
    test = split_repo.list_split_samples(db, split.id, "TEST")
    if (
        len(train) != split.train_sample_count
        or len(test) != split.test_sample_count
        or not train
        or not test
    ):
        raise HTTPException(409, "Saved Train/Test Split samples do not match its stored counts")
    latest_train_target = max(
        (row.timestamp if row.timestamp.tzinfo else row.timestamp.replace(tzinfo=UTC)).astimezone(UTC)
        + timedelta(minutes=max(HORIZONS)) for row in train
    )
    earliest_test_history = min(
        (row.timestamp if row.timestamp.tzinfo else row.timestamp.replace(tzinfo=UTC)).astimezone(UTC)
        - timedelta(minutes=4) for row in test
    )
    if latest_train_target >= earliest_test_history:
        raise HTTPException(409, "Saved Train/Test Split has overlapping target and test-history timestamps")
    parameters = {
        "n_estimators": payload.n_estimators,
        "max_depth": payload.max_depth,
        "random_state": payload.random_state,
    }
    models = {}
    metrics = {}
    for horizon in HORIZONS:
        x_train, y_train = _xy(train, horizon)
        x_test, y_test = _xy(test, horizon)
        model = RandomForestRegressor(**parameters)
        model.fit(x_train, y_train)
        prediction = model.predict(x_test)
        metrics[str(horizon)] = {
            "mae": float(mean_absolute_error(y_test, prediction)),
            "rmse": float(math.sqrt(mean_squared_error(y_test, prediction))),
        }
        models[str(horizon)] = model
    stream = BytesIO()
    joblib.dump(models, stream)
    content = stream.getvalue()
    if len(content) > MAX_ARTIFACT_BYTES:
        raise HTTPException(409, "Random Forest artifact exceeds size limit")
    model_id = uuid4()
    path = _artifact_root() / f"{model_id}.joblib"
    path.write_bytes(content)
    trained_through = max(
        (row.timestamp if row.timestamp.tzinfo else row.timestamp.replace(tzinfo=UTC)).astimezone(UTC)
        + timedelta(minutes=5) for row in train
    )
    model = LagFeatureForest(
        id=model_id, generation_id=generation.id, split_id=split.id,
        split_strategy=split.split_strategy, train_samples=len(train), test_samples=len(test),
        trained_through=trained_through, hyperparameters=parameters, metrics=metrics,
        artifact_path=path.name, artifact_sha256=hashlib.sha256(content).hexdigest(),
    )
    try:
        repo.save_forest(db, model)
    except Exception:
        db.rollback()
        path.unlink(missing_ok=True)
        raise
    return LagForestTrainingResponse(
        model_id=model.id, split_id=split.id, feature_generation_id=generation.id,
        split_strategy=model.split_strategy, train_samples=model.train_samples,
        test_samples=model.test_samples, metrics=metrics,
    )


def _load_forest(model: LagFeatureForest) -> dict[str, RandomForestRegressor]:
    root = _artifact_root()
    path = (root / model.artifact_path).resolve()
    if not path.is_relative_to(root) or path == root or not path.is_file():
        raise HTTPException(409, "Saved Random Forest artifact is unavailable")
    if path.stat().st_size > MAX_ARTIFACT_BYTES:
        raise HTTPException(409, "Saved Random Forest artifact exceeds size limit")
    content = path.read_bytes()
    if hashlib.sha256(content).hexdigest() != model.artifact_sha256:
        raise HTTPException(409, "Saved Random Forest checksum does not match")
    try:
        models = joblib.load(BytesIO(content))
    except Exception as exc:
        raise HTTPException(409, "Saved Random Forest artifact is invalid") from exc
    if not isinstance(models, dict) or set(models) != {"1", "3", "5"} or any(
        not isinstance(item, RandomForestRegressor) or getattr(item, "n_features_in_", None) != 5
        for item in models.values()
    ):
        raise HTTPException(409, "Saved models must be fitted five-feature Random Forests")
    return models


def predict_vehicle_count(
    db: Session, user: User, payload: VehiclePredictionRequest,
) -> VehiclePredictionResponse:
    model = repo.get_forest(db, payload.model_id)
    if model is None:
        raise HTTPException(404, "Vehicle-count Random Forest not found")
    generation = accessible_generation(db, user, model.generation_id)
    if generation.aggregation_id != payload.aggregation_id:
        raise HTTPException(409, "Model and Aggregation do not match")
    jobs = get_accessible_temporal_jobs(db, user, payload.aggregation_id)
    if any(job.status != "COMPLETED" for job in jobs):
        raise HTTPException(409, "Aggregation must be COMPLETED")
    saved = repo.list_session_bins(db, jobs, payload.session_id)
    if not saved:
        raise HTTPException(404, "Session has no aggregated vehicle counts")
    dataset_ids = {job.dataset_id for _, job in saved}
    if len(dataset_ids) != 1:
        raise HTTPException(409, "Session spans multiple Datasets")
    observations = [VehicleObservation(
        dataset_id=job.dataset_id, session_id=payload.session_id,
        timestamp=row.time_bucket, vehicle_count=row.vehicle_count,
    ) for row, job in saved]
    try:
        origin, lags = latest_lags(observations)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    trained_through = model.trained_through
    trained_through = (trained_through if trained_through.tzinfo else trained_through.replace(tzinfo=UTC)).astimezone(UTC)
    if trained_through > origin:
        raise HTTPException(409, "Model training used targets after this forecast origin")
    models = _load_forest(model)
    x = np.asarray([lags], dtype=float)
    points = []
    for horizon in HORIZONS:
        value = float(models[str(horizon)].predict(x)[0])
        if not math.isfinite(value):
            raise HTTPException(409, "Random Forest produced an invalid prediction")
        count = max(0, int(Decimal(str(value)).quantize(Decimal(1), rounding=ROUND_HALF_UP)))
        points.append(VehicleForecastPoint(
            forecast_timestamp=origin + timedelta(minutes=horizon),
            horizon=horizon, predicted_vehicle_count=count,
        ))
    return VehiclePredictionResponse(
        model_id=model.id, aggregation_id=payload.aggregation_id,
        dataset_id=next(iter(dataset_ids)), session_id=payload.session_id,
        latest_timestamp=origin,
        **{f"lag_{i}": value for i, value in enumerate(lags, 1)},
        predictions=points,
    )
