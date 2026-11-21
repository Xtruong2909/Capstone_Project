from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.main import app
from app.services import model_training_evaluation_service as service


def test_evaluation_routes_have_separate_swagger_section() -> None:
    paths = app.openapi()["paths"]
    prefix = "/api/model-training/experiments/{experiment_id}/evaluation"
    for suffix in ("/horizon-results", "/comparison", "/summary"):
        assert f"{prefix}{suffix}" in paths
        assert paths[f"{prefix}{suffix}"]["get"]["tags"] == [
            "Thí nghiệm - Evaluation RQ2/RQ3"
        ]


def test_evaluation_row_uses_saved_errors_and_utc_timestamps() -> None:
    origin = datetime(2018, 10, 24, 8, 30, tzinfo=UTC)
    saved = SimpleNamespace(
        dataset_id=uuid4(), session_id=uuid4(), model_type="RANDOM_FOREST",
        horizon=3, input_timestamp=origin,
        forecast_timestamp=origin + timedelta(minutes=3),
        actual_timestamp=origin + timedelta(minutes=3),
        actual_vehicle_count=25.0, predicted_vehicle_count=20.0,
        absolute_error=5.0, squared_error=25.0,
    )
    row = service._row(saved)
    assert row.forecast_timestamp == origin + timedelta(minutes=3)
    assert row.actual_timestamp == row.forecast_timestamp
    assert row.squared_error == 25.0


def test_summary_has_nine_aggregate_metrics_and_six_rf_deltas(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    experiment_id = uuid4()
    experiment = SimpleNamespace(
        status="COMPLETED",
        baseline_configuration={
            "PERSISTENCE": "prediction_h = lag_1",
            "HISTORICAL_AVERAGE": "mean of TRAIN target_h{h}",
        },
    )
    monkeypatch.setattr(service, "get_experiment", lambda *_: experiment)
    monkeypatch.setattr(
        service.experiment_repo, "get_experiment",
        lambda *_: SimpleNamespace(configuration={
            "historical_average_train_target_means": {"1": 20.0, "3": 21.0, "5": 22.0}
        }),
    )
    fake_rows = [
        (model, horizon, 4, mae, mse)
        for model, mae, mse in (
            ("RANDOM_FOREST", 2.0, 5.0),
            ("PERSISTENCE", 3.0, 10.0),
            ("HISTORICAL_AVERAGE", 4.0, 17.0),
        )
        for horizon in (1, 3, 5)
    ]
    monkeypatch.setattr(service.evaluation_repo, "evaluation_metrics", lambda *_: fake_rows)
    result = service.evaluation_summary(MagicMock(), SimpleNamespace(), experiment_id)
    assert len(result.metrics) == 9
    assert len(result.random_forest_vs_baselines) == 6
    assert result.metrics[0].test_sample_count == 4
    assert result.metrics[0].mse == 5.0
    assert result.random_forest_vs_baselines[0].mae_delta_rf_minus_baseline == -1.0
    assert result.historical_average_train_target_means["3"] == 21.0


def test_incomplete_evaluation_does_not_report_partial_summary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(service.evaluation_repo, "evaluation_metrics", lambda *_: [
        ("RANDOM_FOREST", 1, 1, 2.0, 4.0)
    ])
    with pytest.raises(HTTPException) as error:
        service._metrics(MagicMock(), uuid4())
    assert error.value.status_code == 409
