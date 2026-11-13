from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import numpy as np
import pytest
from fastapi import HTTPException

from app.schemas.lag_feature import LagForestTrainingRequest, VehiclePredictionRequest
from app.services import lag_feature_model_service as service


def _sample(session_id, timestamp, value):
    return SimpleNamespace(
        session_id=session_id, timestamp=timestamp,
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
        service.split_repo, "list_split_samples",
        lambda _db, _split_id, subset: rows[:6] if subset == "TRAIN" else rows[6:],
    )
    monkeypatch.setattr(service.repo, "save_forest", lambda db, model: saved.append(model))
    monkeypatch.setattr(service, "_artifact_root", lambda: tmp_path)
    response = service.train_vehicle_forest(
        None, None, LagForestTrainingRequest(
            split_id=split_id, n_estimators=3,
        ),
    )
    assert (response.train_samples, response.test_samples) == (6, 6)
    assert response.split_id == split_id
    assert set(response.metrics) == {"1", "3", "5"}
    assert len(saved) == 1
    assert saved[0].split_id == split_id
    assert set(service._load_forest(saved[0])) == {"1", "3", "5"}


def test_prediction_uses_latest_session_lags_and_never_refits(monkeypatch) -> None:
    model_id, aggregation_id, generation_id, dataset_id, session_id = [uuid4() for _ in range(5)]
    start = datetime(2018, 10, 24, 5, 30, tzinfo=UTC)
    model = SimpleNamespace(
        id=model_id, generation_id=generation_id,
        trained_through=start + timedelta(minutes=3),
    )
    generation = SimpleNamespace(aggregation_id=aggregation_id)
    job = SimpleNamespace(dataset_id=dataset_id, status="COMPLETED")
    rows = [(SimpleNamespace(
        time_bucket=start + timedelta(minutes=i), vehicle_count=i + 1,
    ), job) for i in range(6)]

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
        model_id=model_id, aggregation_id=aggregation_id, session_id=session_id,
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
