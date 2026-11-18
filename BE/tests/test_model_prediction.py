"""Automatic Validation selection and inference from persisted Final Models."""

import hashlib
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import joblib
import pytest
from fastapi import HTTPException
from sklearn.ensemble import RandomForestRegressor

from app.main import app
from app.schemas.feature_engineering import PredictionFeatureResponse, TrafficObservation
from app.schemas.model_prediction import ForecastPoint, ModelPredictionRequest
from app.schemas.model_training import Hyperparameters, TrainingSplit
from app.services import model_prediction_service as service
from app.services.feature_engineering_service import build_prediction_features


def make_history() -> tuple[TrainingSplit, list[TrafficObservation]]:
    start = datetime(2018, 10, 24, 6, 30, tzinfo=UTC)
    version_id = uuid4()

    def flow(timestamp: datetime) -> float:
        minute = int((timestamp - start).total_seconds() // 60)
        return float(100 + minute * 2 + (minute % 3) * 4)

    origins = [start + timedelta(minutes=4 + i) for i in range(10)]
    x = [[flow(origin - timedelta(minutes=i)) for i in range(5)] for origin in origins]
    y = [[flow(origin + timedelta(minutes=h)) for h in (1, 3, 5)] for origin in origins]
    split = TrainingSplit(
        dataset_version_id=version_id, roi_identifier="MAIN_ROI",
        recording_session_id=str(version_id),
        X_train=x[:7], y_train=y[:7], X_test=x[7:], y_test=y[7:],
        train_times=origins[:7], test_times=origins[7:],
    )
    observations = [TrafficObservation(
        dataset_version_id=version_id, roi_identifier="MAIN_ROI",
        recording_session_id=str(version_id), time_bucket=start + timedelta(minutes=i),
        traffic_flow=flow(start + timedelta(minutes=i)),
    ) for i in range(19)]
    return split, observations


def make_experiment(
    split: TrainingSplit, split_id: UUID, number: int, parameters: Hyperparameters,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(), number=number, name=f"Ex-{number:03d}", split_id=split_id,
        configuration={"dataset_version_id": str(split.dataset_version_id),
                       "model": "RANDOM_FOREST", "forecast_horizons": [1, 3, 5],
                       "hyperparameters": parameters.model_dump()},
        evaluation={"evaluation_mode": "exploratory",
                    "official_evaluation_eligible": False,
                    "evaluation_policy": "test-policy"},
    )


def validation(mae: float, rmse: float) -> SimpleNamespace:
    return SimpleNamespace(
        sample_count=3, validation_fingerprint="a" * 64,
        performance_by_horizon={str(h): {"mae": mae, "rmse": rmse} for h in (1, 3, 5)},
    )


def test_select_best_uses_validation_mean_and_rmse_tiebreak(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    split, _ = make_history()
    split_id = uuid4()
    params = Hyperparameters(n_estimators=3)
    first = make_experiment(split, split_id, 1, params)
    second = make_experiment(split, split_id, 2, params)
    third = make_experiment(split, split_id, 3, params)
    scores = {first.id: validation(10, 9), second.id: validation(10, 8),
              third.id: validation(12, 1)}
    monkeypatch.setattr(service.repository, "get_validation_result",
                        lambda db, experiment_id: scores.get(experiment_id))
    assert service.select_best_experiment(MagicMock(), [first, second, third]) is second


def test_missing_validation_is_not_replaced_with_test_scores(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    split, _ = make_history()
    candidate = make_experiment(split, uuid4(), 1, Hyperparameters())
    monkeypatch.setattr(service.repository, "get_validation_result", lambda db, key: None)
    with pytest.raises(HTTPException) as error:
        service.select_best_experiment(MagicMock(), [candidate])
    assert error.value.status_code == 409
    assert error.value.detail["code"] == "VALIDATION_NOT_AVAILABLE"


def test_candidate_without_validation_is_skipped(monkeypatch: pytest.MonkeyPatch) -> None:
    split, _ = make_history()
    split_id = uuid4()
    old = make_experiment(split, split_id, 1, Hyperparameters())
    eligible = make_experiment(split, split_id, 2, Hyperparameters())
    monkeypatch.setattr(service.repository, "get_validation_result",
                        lambda db, key: validation(2, 3) if key == eligible.id else None)
    assert service.select_best_experiment(MagicMock(), [old, eligible]) is eligible


def setup_prediction(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path,
) -> tuple[ModelPredictionRequest, SimpleNamespace, SimpleNamespace, PredictionFeatureResponse, MagicMock]:
    split, observations = make_history()
    split_id = uuid4()
    parameters = Hyperparameters(n_estimators=3, max_depth=3)
    candidate = make_experiment(split, split_id, 4, parameters)
    features = build_prediction_features(observations)
    models = {str(h): RandomForestRegressor(**parameters.model_dump()).fit(
        split.X_train, [row[i] for row in split.y_train],
    ) for i, h in enumerate((1, 3, 5))}
    artifact = tmp_path / "final.joblib"
    joblib.dump(models, artifact)
    final = SimpleNamespace(
        id=uuid4(), experiment_id=candidate.id, dataset_version_id=split.dataset_version_id,
        split_id=split_id, roi_identifier=split.roi_identifier,
        recording_session_id=split.recording_session_id,
        artifact_path=artifact.name, artifact_sha256=hashlib.sha256(artifact.read_bytes()).hexdigest(),
        trained_through=split.test_times[-1] + timedelta(minutes=5),
        feature_order=split.feature_order, forecast_horizons=[1, 3, 5],
        hyperparameters=parameters.model_dump(),
    )
    saved = MagicMock()
    monkeypatch.setenv("FINAL_MODEL_DIR", str(tmp_path))
    monkeypatch.setattr(service, "require_version", lambda db, version, user, training: None)
    monkeypatch.setattr(service.repository, "list_completed_forests", lambda db, version: [candidate])
    monkeypatch.setattr(service.repository, "get_validation_result",
                        lambda db, key: validation(3, 4))
    monkeypatch.setattr(service.repository, "get_final_model", lambda db, key: final)
    monkeypatch.setattr(service.repository, "get_split", lambda db, key: SimpleNamespace(
        dataset_version_id=split.dataset_version_id, payload=split.model_dump(mode="json"),
    ))
    monkeypatch.setattr(service.repository, "save_final_forecasts", saved)
    monkeypatch.setattr(service, "prepare_features",
                        lambda db, request, user, prediction: features)
    request = ModelPredictionRequest(dataset_version_id=split.dataset_version_id, split_id=split_id)
    return request, candidate, final, features, saved


def test_predict_loads_existing_model_and_persists_three_forecasts(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path,
) -> None:
    request, candidate, final, features, saved = setup_prediction(monkeypatch, tmp_path)
    monkeypatch.setattr(RandomForestRegressor, "fit", lambda *args, **kwargs: pytest.fail(
        "Predict must never refit a model",
    ))
    result = service.predict_experiment(MagicMock(), request, SimpleNamespace())
    assert result.experiment_id == candidate.id
    assert result.model_id == final.id
    assert result.source_experiment_official_evaluation_eligible is False
    assert result.last_observed_time == features.latest_time_bucket
    assert [point.horizon for point in result.predictions] == [1, 3, 5]
    assert [point.forecast_time for point in result.predictions] == features.target_times
    assert all(point.predicted_flow >= 0 for point in result.predictions)
    assert result.last_observed_flow == features.x[0]
    chart = result.visualization.traffic_flow_chart
    assert [point.time for point in chart.history] == [
        features.latest_time_bucket - timedelta(minutes=offset) for offset in (4, 3, 2, 1, 0)
    ]
    assert [point.traffic_flow for point in chart.history] == list(reversed(features.x))
    assert chart.forecast == result.predictions
    assert result.visualization.forecast_by_horizon == result.predictions
    for row, prediction in zip(result.visualization.forecast_table, result.predictions, strict=True):
        assert row.forecast_time == prediction.forecast_time
        assert row.predicted_flow == prediction.predicted_flow
        assert row.change_from_last_observed == pytest.approx(
            prediction.predicted_flow - result.last_observed_flow, abs=0.01,
        )
    assert saved.call_count == 1
    assert saved.call_args.args[1:3] == (final.id, features.latest_time_bucket)
    assert len(saved.call_args.args[3]) == 3
    assert "/api/model-training/predict" not in app.openapi()["paths"]


def test_missing_final_model_returns_clear_error(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path,
) -> None:
    request, _, _, _, _ = setup_prediction(monkeypatch, tmp_path)
    monkeypatch.setattr(service.repository, "get_final_model", lambda db, key: None)
    with pytest.raises(HTTPException) as error:
        service.predict_experiment(MagicMock(), request, SimpleNamespace())
    assert error.value.status_code == 409
    assert error.value.detail["code"] == "FINAL_MODEL_NOT_AVAILABLE"


def test_prediction_rejects_discontinuous_latest_observations() -> None:
    _, observations = make_history()
    observations.pop(-2)
    with pytest.raises(ValueError, match="not continuous"):
        build_prediction_features(observations)


def test_prediction_rejects_artifact_with_changed_checksum(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path,
) -> None:
    request, _, final, _, saved = setup_prediction(monkeypatch, tmp_path)
    final.artifact_sha256 = "0" * 64
    with pytest.raises(HTTPException, match="checksum"):
        service.predict_experiment(MagicMock(), request, SimpleNamespace())
    saved.assert_not_called()


def test_visualization_reports_sparse_horizons_and_trend_from_last_observation() -> None:
    _, observations = make_history()
    features = build_prediction_features(observations)
    origin = features.latest_time_bucket
    last = features.x[0]
    points = [ForecastPoint(
        horizon=horizon, forecast_time=origin + timedelta(minutes=horizon),
        predicted_flow=flow,
    ) for horizon, flow in ((1, last + 4), (3, last - 2), (5, last))]
    visual = service.build_visualization(features, points)
    assert [point.time for point in visual.traffic_flow_chart.history] == [
        origin - timedelta(minutes=offset) for offset in (4, 3, 2, 1, 0)
    ]
    assert [point.forecast_time for point in visual.traffic_flow_chart.forecast] == [
        origin + timedelta(minutes=horizon) for horizon in (1, 3, 5)
    ]
    assert [row.change_from_last_observed for row in visual.forecast_table] == [4, -2, 0]
    assert [row.trend for row in visual.forecast_table] == [
        "increase", "decrease", "unchanged",
    ]
