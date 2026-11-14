from copy import deepcopy
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models.model_training import (
    ExperimentTrainedModel,
    ModelTrainingExperiment,
    ModelTrainingForecastResult,
)
from app.schemas.model_training import (
    ExperimentComparisonRequest,
    Hyperparameters,
    Metric,
    Prediction,
)
from app.schemas.model_training_experiment import TrainingExperimentCreateRequest
from app.services import model_training_experiment_service as service

MODEL_TYPES = ("RANDOM_FOREST", "PERSISTENCE", "HISTORICAL_AVERAGE")
HORIZONS = (1, 3, 5)


def _training_run():
    dataset_id, session_id = uuid4(), uuid4()
    origin = datetime(2018, 10, 24, 6, 30, tzinfo=UTC)
    predictions_by_model = {model_type: {} for model_type in MODEL_TYPES}
    for model_type in MODEL_TYPES:
        for horizon in HORIZONS:
            predictions_by_model[model_type][horizon] = [
                {
                    "dataset_id": dataset_id,
                    "session_id": session_id,
                    "input_timestamp": origin,
                    "forecast_timestamp": origin + timedelta(minutes=horizon),
                    "model_type": model_type,
                    "horizon": horizon,
                    "actual_vehicle_count": 20.0 + horizon,
                    "predicted_vehicle_count": 18.0 + horizon,
                    "absolute_error": 2.0,
                }
            ]
    return SimpleNamespace(
        forest=SimpleNamespace(id=uuid4(), artifact_path="artifact.joblib"),
        metrics={str(h): {"mae": float(h), "rmse": float(h + 1)} for h in HORIZONS},
        performance_by_model_and_horizon={
            model_type: {
                str(horizon): {"mae": 2.0, "rmse": 2.0, "sample_count": 1} for horizon in HORIZONS
            }
            for model_type in MODEL_TYPES
        },
        predictions={h: predictions_by_model["RANDOM_FOREST"][h] for h in HORIZONS},
        predictions_by_model_and_horizon=predictions_by_model,
        training_time_ms={h: 2.0 for h in HORIZONS},
        prediction_time_ms={h: 1.0 for h in HORIZONS},
    )


def test_experiments_are_numbered_per_split_and_only_rf_models_are_persisted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    split_id = uuid4()
    split = SimpleNamespace(
        id=split_id,
        status="COMPLETED",
        train_sample_count=4,
        test_sample_count=2,
        leakage_check={"has_leakage": False},
        warnings=[],
    )
    monkeypatch.setattr(service, "get_accessible_split", lambda *_: (split, object()))
    reserve = MagicMock(side_effect=[1, 2])
    monkeypatch.setattr(service.repository, "reserve_split_experiment_number", reserve)
    monkeypatch.setattr(service, "fit_saved_split", lambda *_args, **_kwargs: _training_run())
    events = []
    monkeypatch.setattr(service, "record_audit_event", lambda **event: events.append(event))
    db = MagicMock()
    added_experiments = []
    db.add.side_effect = lambda record: (
        added_experiments.append(record) if isinstance(record, ModelTrainingExperiment) else None
    )
    user = SimpleNamespace(id=uuid4())
    payload = TrainingExperimentCreateRequest(split_id=split_id)

    first = service.create_experiment(db, user, payload)
    second = service.create_experiment(db, user, payload)

    assert (first.name, second.name) == ("Ex-01", "Ex-02")
    assert (first.status, second.status) == ("COMPLETED", "COMPLETED")
    assert first.split_id == split_id
    assert first.train_samples == 4 and first.test_samples == 2
    assert set(first.model_ids) == {"1", "3", "5"}
    assert len(set(first.model_ids.values())) == 3
    assert set(first.performance_by_model_and_horizon) == set(MODEL_TYPES)
    assert first.training_time_ms == 6.0
    assert first.prediction_time_ms == 3.0
    persisted = db.add_all.call_args_list[0].args[0]
    assert len(added_experiments) == 2
    assert sum(isinstance(item, ExperimentTrainedModel) for item in persisted) == 3
    assert sum(isinstance(item, ModelTrainingForecastResult) for item in persisted) == 9
    assert reserve.call_args_list == [((db, split_id),), ((db, split_id),)]
    assert len(events) == 2
    assert all(event["action"] == "RUN_EXPERIMENT" and event["status"] == "SUCCESS"
               and event["details"]["split_id"] == str(split_id) for event in events)


def test_failed_training_keeps_reserved_name_and_failed_record(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    split_id = uuid4()
    split = SimpleNamespace(
        id=split_id,
        status="COMPLETED",
        train_sample_count=4,
        test_sample_count=2,
        leakage_check={"has_leakage": False},
        warnings=[],
    )
    saved = {}
    events = []
    monkeypatch.setattr(service, "record_audit_event", lambda **event: events.append(event))
    monkeypatch.setattr(service, "get_accessible_split", lambda *_: (split, object()))
    monkeypatch.setattr(service.repository, "reserve_split_experiment_number", lambda *_: 1)

    def capture_add(record):
        if isinstance(record, ModelTrainingExperiment):
            saved[record.id] = record

    db = MagicMock()
    db.add.side_effect = capture_add
    monkeypatch.setattr(
        service,
        "fit_saved_split",
        MagicMock(side_effect=RuntimeError("fit error")),
    )
    monkeypatch.setattr(
        service.repository,
        "get_experiment",
        lambda _db, experiment_id: saved[experiment_id],
    )

    result = service.create_experiment(
        db,
        SimpleNamespace(id=uuid4()),
        TrainingExperimentCreateRequest(split_id=split_id),
    )

    assert result.name == "Ex-01"
    assert result.status == "FAILED"
    assert result.error == "fit error"
    assert events[0]["status"] == "FAILED"
    assert events[0]["resource_id"] == result.experiment_id


def test_experiment_listing_includes_accessible_records_and_paginates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = datetime.now(UTC)
    rows = [
        SimpleNamespace(id=uuid4(), created_at=now - timedelta(minutes=3)),
        SimpleNamespace(id=uuid4(), created_at=now - timedelta(minutes=1)),
        SimpleNamespace(id=uuid4(), created_at=now - timedelta(minutes=2)),
    ]
    monkeypatch.setattr(service.repository, "list_experiments", lambda *_args, **_kwargs: rows)
    monkeypatch.setattr(
        service,
        "get_experiment",
        lambda _db, _user, experiment_id: SimpleNamespace(experiment_id=experiment_id),
    )

    total, data = service.list_experiments(
        MagicMock(),
        SimpleNamespace(id=uuid4()),
        split_id=None,
        status=None,
        dataset_version_id=None,
        page=2,
        page_size=1,
    )

    assert total == 3
    assert [item.experiment_id for item in data] == [rows[2].id]


def _comparison_result(experiment_id, *, split_id, forecast_rows):
    metrics = {
        model_type: {
            str(horizon): Metric(mae=2.0, rmse=3.0, sample_count=1) for horizon in HORIZONS
        }
        for model_type in MODEL_TYPES
    }
    return SimpleNamespace(
        experiment_id=experiment_id,
        experiment_name="Ex-01",
        split_id=split_id,
        forecast_horizons=list(HORIZONS),
        evaluation_policy="same-test-set",
        evaluation_mode="exploratory",
        status="COMPLETED",
        prediction_rows=forecast_rows,
        performance_by_model_and_horizon=metrics,
        hyperparameters=Hyperparameters(),
    )


def test_comparison_requires_same_split_and_test_rows_and_reports_deltas(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    split_id = uuid4()
    rows = []
    dataset_id, session_id = uuid4(), uuid4()
    for model_type in MODEL_TYPES:
        for horizon in HORIZONS:
            rows.append(
                Prediction(
                    model=model_type,
                    horizon_minutes=horizon,
                    forecast_origin_time=datetime(2018, 10, 24, 6, 30, tzinfo=UTC),
                    target_timestamp=datetime(2018, 10, 24, 6, 30, tzinfo=UTC)
                    + timedelta(minutes=horizon),
                    actual_traffic_flow=20.0 + horizon,
                    predicted_traffic_flow=18.0 + horizon,
                    absolute_error=2.0,
                    squared_error=4.0,
                    dataset_id=dataset_id,
                    session_id=session_id,
                )
            )
    first_id, second_id = uuid4(), uuid4()
    results = {
        first_id: _comparison_result(first_id, split_id=split_id, forecast_rows=rows),
        second_id: _comparison_result(second_id, split_id=split_id, forecast_rows=deepcopy(rows)),
    }
    monkeypatch.setattr(service, "get_experiment", lambda _db, _user, item_id: results[item_id])

    response = service.compare_experiments(
        MagicMock(),
        SimpleNamespace(id=uuid4()),
        ExperimentComparisonRequest(experiment_ids=[first_id, second_id]),
    )

    assert len(response.experiments) == 2
    assert response.experiments[0].improvement_vs_baselines["PERSISTENCE"]["1"].mae == 0

    results[second_id].split_id = uuid4()
    with pytest.raises(HTTPException) as error:
        service.compare_experiments(
            MagicMock(),
            SimpleNamespace(id=uuid4()),
            ExperimentComparisonRequest(experiment_ids=[first_id, second_id]),
        )
    assert error.value.status_code == 422


def test_comparison_rejects_misaligned_method_test_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    split_id = uuid4()
    experiment_ids = [uuid4(), uuid4()]
    dataset_id, session_id = uuid4(), uuid4()
    one_sample = [
        Prediction(
            model=model_type,
            horizon_minutes=1,
            forecast_origin_time=datetime(2018, 10, 24, 6, 30, tzinfo=UTC),
            target_timestamp=datetime(2018, 10, 24, 6, 31, tzinfo=UTC),
            actual_traffic_flow=21.0,
            predicted_traffic_flow=19.0,
            absolute_error=2.0,
            squared_error=4.0,
            dataset_id=dataset_id,
            session_id=session_id,
        )
        for model_type in MODEL_TYPES
    ]
    results = {
        experiment_ids[0]: _comparison_result(
            experiment_ids[0], split_id=split_id, forecast_rows=one_sample
        ),
        experiment_ids[1]: _comparison_result(
            experiment_ids[1], split_id=split_id, forecast_rows=one_sample[:-1]
        ),
    }
    for result in results.values():
        result.forecast_horizons = [1, 3, 5]
    monkeypatch.setattr(service, "get_experiment", lambda _db, _user, item_id: results[item_id])

    with pytest.raises(HTTPException) as error:
        service.compare_experiments(
            MagicMock(),
            SimpleNamespace(id=uuid4()),
            ExperimentComparisonRequest(experiment_ids=experiment_ids),
        )
    assert error.value.status_code == 422
