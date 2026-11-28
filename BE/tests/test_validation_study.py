from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas.validation_study import ValidationStudyCreate
from app.services import validation_study_service as service


def records(days: int, sessions: int = 1) -> list:
    rows = []
    for day in range(days):
        for session in range(sessions):
            session_id = uuid4()
            timestamp = datetime(2018, 10, 24, 8, tzinfo=UTC) + timedelta(days=day, hours=session)
            for minute in range(3):
                row = SimpleNamespace(id=len(rows) + 1, dataset_id=uuid4(), session_id=session_id,
                    timestamp=timestamp + timedelta(minutes=minute), target_h1=1, target_h3=2, target_h5=3)
                # Samples from one session must share their dataset.
                if minute:
                    row.dataset_id = rows[-1][0].dataset_id
                rows.append((row, timestamp.date()))
    return rows


def test_four_days_partition_two_one_one_and_refit_union() -> None:
    inner, final = service.build_validation_plans(records(4, 5), "DAY_BASED", .5, .25)
    assert [len(inner.train_sessions), len(inner.test_sessions), len(final.test_sessions)] == [10, 5, 5]
    train = {row.id for row, _ in inner.train_rows}
    validation = {row.id for row, _ in inner.test_rows}
    test = {row.id for row, _ in final.test_rows}
    assert train.isdisjoint(validation | test) and validation.isdisjoint(test)
    assert {row.id for row, _ in final.train_rows} == train | validation
    assert inner.leakage_check["has_leakage"] is False
    assert final.leakage_check["has_leakage"] is False


def test_twenty_sessions_partition_ten_five_five() -> None:
    inner, final = service.build_validation_plans(records(1, 20), "SESSION_BASED", .5, .25)
    assert [len(inner.train_sessions), len(inner.test_sessions), len(final.test_sessions)] == [10, 5, 5]


def test_too_few_days_and_temporal_overlap_rejected() -> None:
    with pytest.raises(HTTPException, match="three recording"):
        service.build_validation_plans(records(2), "DAY_BASED", .5, .25)
    rows = records(1, 3)
    for row, _ in rows:
        row.timestamp = datetime(2018, 10, 24, 8, tzinfo=UTC)
    with pytest.raises(HTTPException) as error:
        service.build_validation_plans(rows, "SESSION_BASED", .5, .25)
    assert error.value.status_code == 422


def test_request_rejects_duplicate_configs_and_no_test_share() -> None:
    for kwargs in ({"candidates": [{}, {}]}, {"train_ratio": .8, "validation_ratio": .3,
                                              "candidates": [{"n_estimators": 50}, {"n_estimators": 100}]}):
        with pytest.raises(ValidationError):
            ValidationStudyCreate(feature_generation_id=uuid4(), **kwargs)


def test_selection_uses_only_validation_and_stable_tie_breaks() -> None:
    rows = [
        {"index": 0, "status": "COMPLETED", "mean_rmse": 20, "mean_mae": 10, "test_rmse": 1},
        {"index": 1, "status": "COMPLETED", "mean_rmse": 15, "mean_mae": 11, "test_rmse": 999},
        {"index": 2, "status": "COMPLETED", "mean_rmse": 15, "mean_mae": 12, "test_rmse": 0},
    ]
    assert service.choose_candidate(rows)["index"] == 1
    rows[2]["mean_mae"] = 11
    assert service.choose_candidate(rows)["index"] == 1
    rows[0]["status"] = "FAILED"
    with pytest.raises(HTTPException):
        service.choose_candidate(rows)


def test_final_selection_frozen_before_test_and_cannot_repeat(monkeypatch) -> None:
    study = SimpleNamespace(id=uuid4(), final_split_id=uuid4(), status="VALIDATED", result=None,
        candidates=[{"index": 0, "status": "COMPLETED", "mean_rmse": 1, "mean_mae": 1, "hyperparameters": {}}])
    monkeypatch.setattr(service, "_accessible", lambda *a, **k: study)
    monkeypatch.setattr(service, "_response", lambda value: value)
    monkeypatch.setattr(service, "_summary", lambda value: {"status": value.status})
    from app.services import model_training_experiment_service

    calls = []

    def run(db, user, payload, **kwargs):
        assert study.status == "FINALIZING"
        assert study.result["selected_candidate_index"] == 0
        assert payload.split_id == study.final_split_id
        assert kwargs["validation_stage"] == "FINAL_TEST"
        calls.append(payload)
        return SimpleNamespace(status="COMPLETED")

    monkeypatch.setattr(model_training_experiment_service, "create_experiment", run)
    db = MagicMock()
    service.finalize_study(db, None, study.id)
    service.finalize_study(db, None, study.id)
    assert len(calls) == 1


@pytest.mark.parametrize("purpose", ["VALIDATION", "FINAL_TEST"])
def test_generic_training_cannot_bypass_study(monkeypatch, purpose) -> None:
    from app.schemas.model_training_experiment import TrainingExperimentCreateRequest
    from app.services import model_training_experiment_service as experiments
    monkeypatch.setattr(experiments, "get_accessible_split", lambda *args: (SimpleNamespace(purpose=purpose), None))
    with pytest.raises(HTTPException, match="reserved partition"):
        experiments.create_experiment(None, None, TrainingExperimentCreateRequest(split_id=uuid4()))
