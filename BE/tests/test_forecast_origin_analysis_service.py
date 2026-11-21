from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.services import forecast_origin_analysis_service as service


def _window():
    dataset_id, version_id, session_id, job_id = (uuid4() for _ in range(4))
    origin = datetime(2018, 11, 1, 6, 10, tzinfo=UTC)
    sample = SimpleNamespace(
        dataset_id=dataset_id, session_id=session_id, timestamp=origin,
        aggregation_id=job_id,
        **{f"lag_{index}": 100 + index for index in range(1, 6)},
        **{f"target_h{horizon}": 120 + horizon for horizon in (1, 3, 5)},
    )
    job = SimpleNamespace(id=job_id, dataset_id=dataset_id, dataset_version_id=version_id)
    bins = {}
    for index in range(5):
        bins[session_id, origin - timedelta(minutes=index)] = SimpleNamespace(
            dataset_version_id=version_id, aggregation_id=job_id,
            aggregation_interval=60, bin_status="UNKNOWN", eligible_for_training=None,
            vehicle_count=100 + index + 1,
        )
    rows = {}
    for horizon in (1, 3, 5):
        target = origin + timedelta(minutes=horizon)
        actual = 120 + horizon
        bins[session_id, target] = SimpleNamespace(
            dataset_version_id=version_id, aggregation_id=job_id,
            aggregation_interval=60, bin_status="UNKNOWN", eligible_for_training=None,
            vehicle_count=actual,
        )
        rows[horizon] = SimpleNamespace(
            dataset_id=dataset_id, session_id=session_id, input_timestamp=origin,
            forecast_timestamp=target, actual_timestamp=target,
            actual_vehicle_count=actual, predicted_vehicle_count=actual - horizon,
            absolute_error=float(horizon), squared_error=float(horizon * horizon),
        )
    return sample, rows, bins, job


def test_origin_requires_five_same_session_lags_and_three_test_targets() -> None:
    sample, rows, bins, job = _window()
    assert service._valid_origin(sample, rows, bins, job, 60)
    removed = bins.pop((sample.session_id, sample.timestamp - timedelta(minutes=4)))
    assert not service._valid_origin(sample, rows, bins, job, 60)
    bins[sample.session_id, sample.timestamp - timedelta(minutes=4)] = removed
    assert not service._valid_origin(sample, {1: rows[1], 3: rows[3]}, bins, job, 60)


def test_origin_rejects_wrong_target_and_error() -> None:
    sample, rows, bins, job = _window()
    rows[3].actual_timestamp += timedelta(minutes=1)
    assert not service._valid_origin(sample, rows, bins, job, 60)
    rows[3].actual_timestamp -= timedelta(minutes=1)
    rows[3].absolute_error = 99.0
    assert not service._valid_origin(sample, rows, bins, job, 60)


def test_aggregate_metrics_use_all_complete_origins() -> None:
    _, rows, _, _ = _window()
    metrics = service._metrics([rows, rows])
    assert [metric.horizon_minutes for metric in metrics] == [1, 3, 5]
    assert [metric.sample_count for metric in metrics] == [2, 2, 2]
    assert [metric.mae for metric in metrics] == [1, 3, 5]
    assert [metric.rmse for metric in metrics] == [1, 3, 5]


def test_analysis_uses_completed_aggregation_sessions_without_version_link(monkeypatch) -> None:
    sample, rows, bins, job = _window()
    experiment_id, split_id, generation_id, root_id = (uuid4() for _ in range(4))
    sample.generation_id = generation_id
    sample.aggregation_id = root_id
    job.status = "COMPLETED"
    job.aggregation_interval = 60
    experiment = SimpleNamespace(
        id=experiment_id, status="COMPLETED", lag_feature_split_id=split_id,
        performance_by_model_and_horizon={"RANDOM_FOREST": {
            str(horizon): {"mae": float(horizon), "rmse": float(horizon), "sample_count": 1}
            for horizon in (1, 3, 5)
        }},
    )
    split = SimpleNamespace(
        id=split_id, leakage_check={"checked": True, "has_leakage": False},
        test_sample_count=1,
    )
    generation = SimpleNamespace(id=generation_id, aggregation_id=root_id)
    session = SimpleNamespace(id=sample.session_id, dataset_id=sample.dataset_id, original_filename="session.csv")
    for (session_id, timestamp), observed in bins.items():
        observed.recording_session_id = str(session_id)
        observed.time_bucket = timestamp
    for horizon, row in rows.items():
        row.horizon = horizon
    monkeypatch.setattr(service.experiment_repo, "get_experiment", lambda *_: experiment)
    monkeypatch.setattr(service, "get_accessible_split", lambda *_: (split, generation))
    monkeypatch.setattr(service, "get_accessible_temporal_jobs", lambda *_: [job])
    monkeypatch.setattr(service.repo, "list_test_samples", lambda *_: [sample])
    monkeypatch.setattr(service.repo, "list_train_samples", lambda *_: [])
    monkeypatch.setattr(service.repo, "list_completed_run_sessions", lambda *_: [session])
    monkeypatch.setattr(service.repo, "list_observations", lambda *_: list(bins.values()))
    monkeypatch.setattr(service.repo, "list_random_forest_predictions", lambda *_: list(rows.values()))

    result = service.get_forecast_origin_analysis(
        None, SimpleNamespace(role_id="data_scientist"), experiment_id,
    )
    assert len(result.sessions) == 1
    assert result.selected_session_id == sample.session_id
    assert result.origins == [sample.timestamp]
    assert [row.horizon_minutes for row in result.predictions] == [1, 3, 5]
    assert [row.sample_count for row in result.overall_metrics] == [1, 1, 1]
    with pytest.raises(HTTPException) as invalid:
        service.get_forecast_origin_analysis(
            None, SimpleNamespace(role_id="data_scientist"), experiment_id,
            session_id=sample.session_id, origin_time=sample.timestamp + timedelta(minutes=1),
        )
    assert invalid.value.status_code == 422
