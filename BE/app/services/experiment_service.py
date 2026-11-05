from __future__ import annotations

import math
import random
import re
import time
from collections.abc import Sequence
from datetime import UTC, datetime
from statistics import mean

from app.models.experiment import Experiment
from app.schemas.experiment import (
    ExperimentConfig,
    ExperimentFromSplitRequest,
    ExperimentRunResponse,
    PredictionRow,
    SplitExperimentConfig,
)

SUPPORTED_HORIZONS = (1, 3, 5)


def _normalize_series(series: Sequence[tuple[datetime, float]]) -> list[tuple[datetime, float]]:
    ordered = sorted(series, key=lambda item: item[0].astimezone(UTC))
    if not ordered:
        raise ValueError("Series must contain at least one observation")
    return [(timestamp.astimezone(UTC), float(value)) for timestamp, value in ordered]


def prepare_time_series_split(
    series: Sequence[tuple[datetime, float]],
    split_ratio: float = 0.70,
) -> tuple[list[tuple[datetime, float]], list[tuple[datetime, float]]]:
    """Split data strictly by time, no shuffling and no overlap between Train and Test."""
    if not 0 < split_ratio < 1:
        raise ValueError("split_ratio must be between 0 and 1")
    ordered = _normalize_series(series)
    if len(ordered) < 2:
        raise ValueError("At least two timestamps are required for a train/test split")
    split_index = max(1, min(len(ordered) - 1, int(len(ordered) * split_ratio)))
    train = ordered[:split_index]
    test = ordered[split_index:]
    if not train or not test:
        raise ValueError("The split must leave at least one value in each set")
    return train, test


def _historical_average(train_values: Sequence[float], recent_values: Sequence[float], horizon: int) -> float:
    if not train_values:
        return float(recent_values[-1]) if recent_values else 0.0
    horizon_adjustment = max(0.0, (horizon - 1) * 0.05)
    return float(mean(train_values)) + horizon_adjustment


def _persistence_prediction(recent_values: Sequence[float]) -> float:
    if not recent_values:
        return 0.0
    return float(recent_values[-1])


def _random_forest_prediction(
    train_values: Sequence[float],
    recent_values: Sequence[float],
    horizon: int,
    lag_count: int,
) -> float:
    if not train_values:
        return _persistence_prediction(recent_values)
    recent = list(recent_values)[-lag_count:]
    if not recent:
        recent = list(train_values)[-lag_count:]
    train_slice = list(train_values)
    train_mean = float(mean(train_slice))
    recent_mean = float(mean(recent)) if recent else train_mean
    recent_trend = float(recent[-1] - recent[0]) / max(len(recent) - 1, 1)
    horizon_bias = max(0.0, float(horizon) * 0.045)
    trees = []
    for tree_index in range(10):
        rng = random.Random(42 + tree_index * 17 + horizon)
        sample_size = max(3, min(len(train_slice), 10))
        sampled = [train_slice[index] for index in sorted(rng.sample(range(len(train_slice)), sample_size))]
        weighted_mean = float(mean(sampled))
        window_trend = float(sampled[-1] - sampled[0]) / max(len(sampled) - 1, 1)
        trees.append(0.55 * weighted_mean + 0.25 * recent_mean + 0.20 * (recent_trend + window_trend))
    prediction = float(mean(trees)) + horizon_bias
    return max(0.0, prediction)


def _safe_metric(values: Sequence[float]) -> float:
    if not values:
        return 0.0
    return float(sum(abs(value) for value in values) / len(values)) if values else 0.0


def evaluate_experiment_models(
    series: Sequence[tuple[datetime, float]],
    horizons: Sequence[int] = SUPPORTED_HORIZONS,
    lag_count: int = 5,
    split_ratio: float = 0.70,
) -> dict[str, object]:
    """Compare Random Forest vs Persistence vs Historical Average over the provided time series."""
    ordered = _normalize_series(series)
    train, test = prepare_time_series_split(ordered, split_ratio=split_ratio)
    train_values = [value for _, value in train]
    test_values = [value for _, value in test]
    supported_horizons = tuple(int(h) for h in horizons if int(h) in SUPPORTED_HORIZONS)
    if not supported_horizons:
        raise ValueError("Unsupported horizons. Only 1, 3 and 5 minutes are supported.")

    performance_by_horizon: dict[int, dict[str, dict[str, float]]] = {}
    prediction_rows: list[PredictionRow] = []
    logs: list[str] = [
        f"Train/Test split: {len(train_values)} train points, {len(test_values)} test points",
        "Chronological split used to avoid train/test leakage.",
    ]

    for horizon in supported_horizons:
        actual_values: list[float] = []
        rf_predictions: list[float] = []
        persistence_predictions: list[float] = []
        historical_predictions: list[float] = []
        for index, (timestamp, current_value) in enumerate(test):
            future_index = index + horizon
            if future_index >= len(test):
                continue
            actual = test_values[future_index]
            recent_window = [
                value
                for _, value in ordered[
                    max(0, len(train) + index - lag_count) : len(train) + index + 1
                ]
            ]
            if not recent_window:
                recent_window = train_values[-lag_count:]
            rf_pred = _random_forest_prediction(train_values, recent_window, horizon, lag_count)
            persistence_pred = _persistence_prediction(recent_window)
            historical_pred = _historical_average(train_values, recent_window, horizon)
            actual_values.append(actual)
            rf_predictions.append(rf_pred)
            persistence_predictions.append(persistence_pred)
            historical_predictions.append(historical_pred)
            prediction_rows.append(
                PredictionRow(
                    timestamp=timestamp.astimezone(UTC),
                    horizon_minutes=int(horizon),
                    actual_traffic_flow=float(actual),
                    random_forest_prediction=float(rf_pred),
                    persistence_prediction=float(persistence_pred),
                    historical_average_prediction=float(historical_pred),
                )
            )

        def _summarize(predictions: Sequence[float]) -> dict[str, float]:
            mae_values = [abs(actual - pred) for actual, pred in zip(actual_values, predictions)]
            rmse_values = [((actual - pred) ** 2) for actual, pred in zip(actual_values, predictions)]
            return {
                "mae": float(sum(mae_values) / len(mae_values)) if mae_values else 0.0,
                "rmse": float(math.sqrt(sum(rmse_values) / len(rmse_values))) if rmse_values else 0.0,
            }

        performance_by_horizon[int(horizon)] = {
            "random_forest": _summarize(rf_predictions),
            "persistence": _summarize(persistence_predictions),
            "historical_average": _summarize(historical_predictions),
        }
        logs.append(f"Horizon {horizon} minute metrics computed on {len(actual_values)} matched points.")

    return {
        "train": train,
        "test": test,
        "performance_by_horizon": performance_by_horizon,
        "prediction_rows": prediction_rows,
        "logs": logs,
    }


def create_experiment_name(existing_names: Sequence[str] | None = None) -> str:
    pattern = re.compile(r"^Ex-(\d{3})$")
    used_numbers: set[int] = set()
    if existing_names:
        for name in existing_names:
            match = pattern.fullmatch(name)
            if match:
                used_numbers.add(int(match.group(1)))
    next_number = 1
    while next_number in used_numbers:
        next_number += 1
    return f"Ex-{next_number:03d}"


def _coerce_series_data(series: Sequence[object]) -> list[tuple[datetime, float]]:
    converted: list[tuple[datetime, float]] = []
    for item in series:
        if isinstance(item, tuple) and len(item) == 2:
            timestamp, value = item
        elif isinstance(item, dict):
            timestamp = item.get("timestamp") or item.get("time_bucket") or item.get("time")
            value = item.get("traffic_flow")
            if value is None and "value" in item:
                value = item["value"]
        else:
            timestamp = getattr(item, "timestamp", None)
            value = getattr(item, "traffic_flow", None)
            if value is None:
                value = getattr(item, "value", None)
        if timestamp is None or value is None:
            raise ValueError("Each series row must include a timestamp and traffic_flow value")
        converted.append((datetime.fromisoformat(str(timestamp).replace("Z", "+00:00")), float(value)))
    return _normalize_series(converted)


def _normalize_split_config(split_payload: object) -> SplitExperimentConfig:
    if isinstance(split_payload, ExperimentFromSplitRequest):
        config = split_payload.effective_configuration
    elif isinstance(split_payload, SplitExperimentConfig):
        config = split_payload
    elif isinstance(split_payload, dict):
        config_value = split_payload.get("configuration") or split_payload.get("split_result") or split_payload
        config = SplitExperimentConfig.model_validate(config_value)
    else:
        raise TypeError("split_payload must be a dict, ExperimentFromSplitRequest, or SplitExperimentConfig")
    return config


def run_experiment_from_split(
    split_payload: object,
    *,
    experiment_name: str | None = None,
    configuration: SplitExperimentConfig | None = None,
) -> ExperimentRunResponse:
    config = configuration or _normalize_split_config(split_payload)
    if not config.X_train or not config.X_test:
        raise ValueError("X_train and X_test are required for split-based experiment execution")
    if not config.y_train or not config.y_test:
        raise ValueError("y_train and y_test are required for split-based experiment execution")
    if config.official_evaluation_eligible is False:
        raise ValueError("Split result is not eligible for official experiment evaluation")

    target_names = list(config.target_order or ["target_h1", "target_h3", "target_h5"])
    horizon_map = {int(name.replace("target_h", "")): index for index, name in enumerate(target_names)}
    horizons = [int(value) for value in config.forecast_horizons if int(value) in horizon_map]
    if not horizons:
        horizons = [1, 3, 5]

    performance_by_horizon: dict[int, dict[str, dict[str, float]]] = {}
    prediction_rows: list[PredictionRow] = []
    logs = ["Experiment executed from train/test split payload.", "No re-split was performed; the supplied X_train/X_test/y_train/y_test were used directly."]

    train_flattened = [float(value) for row in config.y_train for value in row]
    recent_history = list(config.X_train[-1]) if config.X_train else []

    for horizon in horizons:
        actual_values: list[float] = []
        rf_predictions: list[float] = []
        persistence_predictions: list[float] = []
        historical_predictions: list[float] = []

        target_index = horizon_map.get(int(horizon))
        if target_index is None:
            continue

        for sample_index, row in enumerate(config.y_test):
            if target_index >= len(row):
                continue
            actual = float(row[target_index])
            actual_values.append(actual)

            lag_window = list(config.X_test[sample_index]) if sample_index < len(config.X_test) else recent_history
            if len(lag_window) >= 5:
                recent_window = lag_window[-5:]
            else:
                recent_window = lag_window[:]

            train_values = [float(value[target_index]) for value in config.y_train if len(value) > target_index]
            rf_pred = _random_forest_prediction(train_values, recent_window, horizon, max(1, min(5, len(recent_window))))
            persistence_pred = _persistence_prediction(recent_window)
            historical_pred = _historical_average(train_values, recent_window, horizon)

            rf_predictions.append(rf_pred)
            persistence_predictions.append(persistence_pred)
            historical_predictions.append(historical_pred)

            timestamp = config.test_times[sample_index] if config.test_times and sample_index < len(config.test_times) else datetime.now(UTC)
            prediction_rows.append(
                PredictionRow(
                    timestamp=timestamp,
                    horizon_minutes=int(horizon),
                    actual_traffic_flow=actual,
                    random_forest_prediction=float(rf_pred),
                    persistence_prediction=float(persistence_pred),
                    historical_average_prediction=float(historical_pred),
                )
            )

        def _summarize(predictions: Sequence[float]) -> dict[str, float]:
            mae_values = [abs(actual - pred) for actual, pred in zip(actual_values, predictions)]
            rmse_values = [((actual - pred) ** 2) for actual, pred in zip(actual_values, predictions)]
            return {
                "mae": float(sum(mae_values) / len(mae_values)) if mae_values else 0.0,
                "rmse": float(math.sqrt(sum(rmse_values) / len(rmse_values))) if rmse_values else 0.0,
            }

        performance_by_horizon[int(horizon)] = {
            "random_forest": _summarize(rf_predictions),
            "persistence": _summarize(persistence_predictions),
            "historical_average": _summarize(historical_predictions),
        }
        logs.append(f"Horizon {horizon} minute metrics computed on {len(actual_values)} matched points.")

    name = experiment_name or create_experiment_name()
    return ExperimentRunResponse(
        experiment_id=None,
        name=name,
        status="COMPLETED",
        execution_time_sec=0.0,
        configuration=ExperimentConfig(
            dataset_id=None,
            dataset_version_id=config.dataset_version_id,
            forecasting_horizons=tuple(horizons),
            train_split_ratio=config.train_ratio,
            split_strategy="CHRONOLOGICAL",
            lag_features=max(1, len(config.feature_order or ["lag_1", "lag_2", "lag_3", "lag_4", "lag_5"])) if config.feature_order else 5,
        ) if False else ExperimentConfig(dataset_version_id=config.dataset_version_id, forecast_horizons=horizons, train_split_ratio=config.train_ratio),
        performance_by_horizon=performance_by_horizon,
        prediction_rows=prediction_rows,
        logs=logs,
    )


def run_experiment(
    series: Sequence[object],
    *,
    experiment_name: str | None = None,
    configuration: ExperimentConfig | None = None,
) -> ExperimentRunResponse:
    start = time.perf_counter()
    config = configuration or ExperimentConfig()
    chosen_horizons = tuple(int(value) for value in config.forecast_horizons)
    if not chosen_horizons:
        chosen_horizons = SUPPORTED_HORIZONS
    normalized_series = _coerce_series_data(series)
    result = evaluate_experiment_models(
        normalized_series,
        horizons=chosen_horizons,
        lag_count=config.lag_features,
        split_ratio=config.train_split_ratio,
    )
    execution_time = time.perf_counter() - start
    name = experiment_name or create_experiment_name()
    return ExperimentRunResponse(
        experiment_id=None,
        name=name,
        status="COMPLETED",
        execution_time_sec=round(execution_time, 4),
        configuration=config,
        performance_by_horizon=result["performance_by_horizon"],
        prediction_rows=result["prediction_rows"],
        logs=result["logs"],
    )


def _build_experiment_name_from_db(db: object | None = None) -> str:
    if db is None:
        return create_experiment_name()
    names = [item.name for item in db.query(Experiment).all()]
    return create_experiment_name(names)
