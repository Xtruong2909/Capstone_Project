from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import numpy as np
import pytest
from fastapi import HTTPException

from app.schemas.lag_feature import LagForestTrainingRequest, VehiclePredictionRequest
from app.services import lag_feature_model_service as service


def _sample(session_id, timestamp, value):
    return SimpleNamespace(
        dataset_id=uuid4(),
        session_id=session_id,
        timestamp=timestamp,
        **{f"lag_{n}": value + n for n in range(1, 6)},
        **{f"target_h{h}": value + h for h in (1, 3, 5)},
    )


def test_training_uses_persisted_split_and_saves_fitted_forest(monkeypatch, tmp_path) -> None:
    generation_id = uuid4()
    split_id = uuid4()
    generation = SimpleNamespace(id=generation_id, status="COMPLETED")
    split = SimpleNamespace(
        id=split_id,
        feature_generation_id=generation_id,
        status="COMPLETED",
        split_strategy="DAY_BASED",
        forecast_horizons=[1, 3, 5],
        train_sample_count=6,
        test_sample_count=6,
        leakage_check={"has_leakage": False},
    )
    origin = datetime(2018, 10, 24, 5, 30, tzinfo=UTC)
    rows = [
        _sample(session, origin + timedelta(days=day, minutes=minute), day + minute)
        for day, session in enumerate([uuid4() for _ in range(4)])
        for minute in range(3)
    ]
    saved = []
    monkeypatch.setattr(service, "get_accessible_split", lambda *_: (split, generation))
    monkeypatch.setattr(
        service.split_repo,
        "list_split_samples",
        lambda _db, _split_id, subset: rows[:6] if subset == "TRAIN" else rows[6:],
    )
    monkeypatch.setattr(service.repo, "save_forest", lambda db, model: saved.append(model))
    monkeypatch.setattr(service, "_artifact_root", lambda: tmp_path)
    response = service.train_vehicle_forest(
        None,
        None,
        LagForestTrainingRequest(
            split_id=split_id,
            n_estimators=3,
        ),
    )
    assert (response.train_samples, response.test_samples) == (6, 6)
    assert response.split_id == split_id
    assert set(response.metrics) == {"1", "3", "5"}
    assert len(saved) == 1
    assert saved[0].split_id == split_id
    assert set(service._load_forest(saved[0])) == {"1", "3", "5"}


def test_saved_split_evaluates_baselines_on_the_same_test_rows_without_test_fit(
    monkeypatch, tmp_path
) -> None:
    split_id = uuid4()
    session_id = uuid4()
    dataset_id = uuid4()
    split = SimpleNamespace(
        id=split_id,
        status="COMPLETED",
        split_strategy="DAY_BASED",
        forecast_horizons=[1, 3, 5],
        train_sample_count=3,
        test_sample_count=2,
        leakage_check={"has_leakage": False},
    )
    start = datetime(2018, 10, 24, 5, 30, tzinfo=UTC)
    train = [
        _sample(session_id, start + timedelta(minutes=5 + index), 10.0 + index)
        for index in range(3)
    ]
    test = [
        _sample(session_id, start + timedelta(minutes=20 + index), 100.0 + index)
        for index in range(2)
    ]
    for row in train + test:
        row.dataset_id = dataset_id
    for row in test:
        for horizon in (1, 3, 5):
            setattr(row, f"target_h{horizon}", 1000.0 + horizon)

    monkeypatch.setattr(
        service,
        "get_accessible_split",
        lambda *_: (split, SimpleNamespace(id=uuid4())),
    )
    monkeypatch.setattr(
        service.split_repo,
        "list_split_samples",
        lambda _db, _split_id, subset: train if subset == "TRAIN" else test,
    )
    monkeypatch.setattr(service, "_artifact_root", lambda: tmp_path)

    run = service.fit_saved_split(
        MagicMock(),
        SimpleNamespace(id=uuid4()),
        split_id,
        {"n_estimators": 3, "max_depth": 3, "random_state": 42},
        persist=False,
    )

    for horizon in (1, 3, 5):
        test_rows = [
            run.predictions_by_model_and_horizon[model_type][horizon]
            for model_type in ("RANDOM_FOREST", "PERSISTENCE", "HISTORICAL_AVERAGE")
        ]
        assert (
            [row["input_timestamp"] for row in test_rows[0]]
            == [row["input_timestamp"] for row in test_rows[1]]
            == [row["input_timestamp"] for row in test_rows[2]]
        )
        assert [row["forecast_timestamp"] for row in test_rows[0]] == [
            sample.timestamp + timedelta(minutes=horizon) for sample in test
        ]
        assert all(
            row["actual_timestamp"] == row["forecast_timestamp"]
            and row["squared_error"] == row["absolute_error"] ** 2
            for method_rows in test_rows for row in method_rows
        )
        assert [row["predicted_vehicle_count"] for row in test_rows[1]] == [
            sample.lag_1 for sample in test
        ]
        expected_average = np.mean([getattr(sample, f"target_h{horizon}") for sample in train])
        assert [row["predicted_vehicle_count"] for row in test_rows[2]] == [
            expected_average,
            expected_average,
        ]
        assert run.performance_by_model_and_horizon["HISTORICAL_AVERAGE"][str(horizon)][
            "train_target_mean"
        ] == expected_average
        assert {
            run.performance_by_model_and_horizon[model_type][str(horizon)]["sample_count"]
            for model_type in ("RANDOM_FOREST", "PERSISTENCE", "HISTORICAL_AVERAGE")
        } == {len(test)}
        for model_type, method_rows in zip(
            ("RANDOM_FOREST", "PERSISTENCE", "HISTORICAL_AVERAGE"), test_rows, strict=True
        ):
            metric = run.performance_by_model_and_horizon[model_type][str(horizon)]
            assert metric["mae"] == pytest.approx(
                np.mean([row["absolute_error"] for row in method_rows])
            )
            assert metric["mse"] == pytest.approx(
                np.mean([row["squared_error"] for row in method_rows])
            )
            assert metric["rmse"] == pytest.approx(np.sqrt(metric["mse"]))


def test_prediction_uses_latest_session_lags_and_never_refits(monkeypatch) -> None:
    model_id, aggregation_id, generation_id, dataset_id, session_id = [uuid4() for _ in range(5)]
    start = datetime(2018, 10, 24, 5, 30, tzinfo=UTC)
    model = SimpleNamespace(
        id=model_id,
        generation_id=generation_id,
        trained_through=start + timedelta(minutes=3),
    )
    generation = SimpleNamespace(aggregation_id=aggregation_id)
    job = SimpleNamespace(dataset_id=dataset_id, status="COMPLETED")
    rows = [
        (
            SimpleNamespace(
                time_bucket=start + timedelta(minutes=i),
                vehicle_count=i + 1,
            ),
            job,
        )
        for i in range(6)
    ]

    class Forest:
        def predict(self, x):
            assert x.tolist() == [[6, 5, 4, 3, 2]]
            return np.asarray([12.6])

    monkeypatch.setattr(service.repo, "get_forest", lambda *_: model)
    monkeypatch.setattr(service, "accessible_generation", lambda *_: generation)
    monkeypatch.setattr(service, "get_accessible_temporal_jobs", lambda *_: [job])
    monkeypatch.setattr(service.repo, "list_session_bins", lambda *_: rows)
    monkeypatch.setattr(service, "_load_forest", lambda *_: {str(h): Forest() for h in (1, 3, 5)})
    payload = VehiclePredictionRequest(
        model_id=model_id,
        aggregation_id=aggregation_id,
        session_id=session_id,
    )
    response = service.predict_vehicle_count(None, None, payload)
    assert response.lag_1 == 6 and response.lag_5 == 2
    assert [point.predicted_vehicle_count for point in response.predictions] == [13, 13, 13]
    assert [point.forecast_timestamp for point in response.predictions] == [
        start + timedelta(minutes=5 + h) for h in (1, 3, 5)
    ]
    model.trained_through = start + timedelta(minutes=6)
    with pytest.raises(HTTPException) as exc:
        service.predict_vehicle_count(None, None, payload)
    assert exc.value.status_code == 409


def test_prediction_accepts_experiment_horizon_model_id(monkeypatch) -> None:
    bundle_id, model_id, aggregation_id, generation_id, dataset_id, session_id = [
        uuid4() for _ in range(6)
    ]
    start = datetime(2018, 10, 24, 5, 30, tzinfo=UTC)
    model = SimpleNamespace(
        id=bundle_id,
        generation_id=generation_id,
        trained_through=start + timedelta(minutes=3),
    )
    generation = SimpleNamespace(aggregation_id=aggregation_id)
    job = SimpleNamespace(dataset_id=dataset_id, status="COMPLETED")
    rows = [
        (
            SimpleNamespace(
                time_bucket=start + timedelta(minutes=i),
                vehicle_count=i + 1,
            ),
            job,
        )
        for i in range(6)
    ]

    class Forest:
        def predict(self, x):
            return np.asarray([12.6])

    trained_model = SimpleNamespace(
        model_id=model_id,
        status="COMPLETED",
        horizon=3,
        lag_feature_forest_id=bundle_id,
    )
    monkeypatch.setattr(
        service.repo,
        "get_forest",
        lambda _db, requested_id: None if requested_id == model_id else model,
    )
    monkeypatch.setattr(service.experiment_repo, "get_trained_model", lambda *_: trained_model)
    monkeypatch.setattr(service, "accessible_generation", lambda *_: generation)
    monkeypatch.setattr(service, "get_accessible_temporal_jobs", lambda *_: [job])
    monkeypatch.setattr(service.repo, "list_session_bins", lambda *_: rows)
    monkeypatch.setattr(service, "_load_forest", lambda *_: {str(h): Forest() for h in (1, 3, 5)})

    response = service.predict_vehicle_count(
        None,
        None,
        VehiclePredictionRequest(
            model_id=model_id,
            aggregation_id=aggregation_id,
            session_id=session_id,
        ),
    )

    assert response.model_id == model_id
    assert [point.horizon for point in response.predictions] == [3]
