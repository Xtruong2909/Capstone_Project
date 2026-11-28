from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError

from app.schemas.comparison_history import ComparisonHistoryCreate
from app.schemas.model_training import ExperimentComparisonResponse
from app.services import comparison_history_service as service


def test_history_rejects_duplicate_experiments() -> None:
    experiment_id = uuid4()
    with pytest.raises(ValidationError):
        ComparisonHistoryCreate(group_id=uuid4(), experiment_ids=[experiment_id, experiment_id])


def prepare(monkeypatch: pytest.MonkeyPatch) -> tuple:
    group_id = uuid4()
    user = SimpleNamespace(id=uuid4(), role_id="data_scientist")
    payload = ComparisonHistoryCreate(group_id=group_id, experiment_ids=[uuid4(), uuid4()], mode="overall")
    result = ExperimentComparisonResponse(forecast_horizons=[1, 3, 5], experiments=[])
    monkeypatch.setattr(service, "compare_experiments", lambda *_: result)
    monkeypatch.setattr(service.experiments, "get_experiment", lambda *_: object())
    monkeypatch.setattr(service.experiments, "get_experiment_group_id", lambda *_: group_id)

    def add(_db: object, history: object) -> None:
        history.id = uuid4()
        history.created_at = datetime.now(UTC)

    monkeypatch.setattr(service.repository, "add_history", add)
    return MagicMock(), user, payload


def test_history_saves_mode_and_snapshot(monkeypatch: pytest.MonkeyPatch) -> None:
    db, user, payload = prepare(monkeypatch)
    saved = service.create_history(db, user, payload)
    assert saved.mode == "overall" and saved.group_id == payload.group_id
    assert saved.experiment_ids == payload.experiment_ids
    assert saved.result.forecast_horizons == [1, 3, 5]
    db.commit.assert_called_once()


def test_history_rejects_experiments_from_another_batch(monkeypatch: pytest.MonkeyPatch) -> None:
    db, user, payload = prepare(monkeypatch)
    monkeypatch.setattr(service.experiments, "get_experiment_group_id", lambda *_: uuid4())
    with pytest.raises(HTTPException) as error:
        service.create_history(db, user, payload)
    assert error.value.status_code == 422
    db.commit.assert_not_called()


def test_history_rolls_back_failed_save(monkeypatch: pytest.MonkeyPatch) -> None:
    db, user, payload = prepare(monkeypatch)
    db.commit.side_effect = SQLAlchemyError("unavailable")
    with pytest.raises(HTTPException) as error:
        service.create_history(db, user, payload)
    assert error.value.status_code == 503
    db.rollback.assert_called_once()


def test_history_is_private_and_role_restricted(monkeypatch: pytest.MonkeyPatch) -> None:
    db = MagicMock()
    user = SimpleNamespace(id=uuid4(), role_id="data_scientist")
    monkeypatch.setattr(service.repository, "get_history", lambda *_: None)
    with pytest.raises(HTTPException) as missing:
        service.get_history(db, user, uuid4())
    assert missing.value.status_code == 404
    with pytest.raises(HTTPException) as forbidden:
        service.list_history(db, SimpleNamespace(role_id="business_user"), uuid4())
    assert forbidden.value.status_code == 403
