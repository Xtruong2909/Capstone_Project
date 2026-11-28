"""Visible experiment sequences span splits while candidates stay separate."""

from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.crud import crud_model_training_experiments as repository
from sqlalchemy.dialects import postgresql


def test_batch_sequence_continues_across_new_splits(monkeypatch: pytest.MonkeyPatch) -> None:
    db = MagicMock()
    db.scalar.side_effect = [4, 7]
    counter = SimpleNamespace(last_number=1)
    db.get.return_value = counter
    monkeypatch.setattr(repository, "get_experiment_group_id", lambda *_: uuid4())
    monkeypatch.setattr(repository, "reserve_split_experiment_number", lambda *_: 1)

    assert repository.reserve_batch_experiment_number(db, uuid4()) == 8
    assert counter.last_number == 8
    assert "pg_advisory_xact_lock" in str(db.execute.call_args.args[0])
    assert "purpose" in str(db.scalar.call_args_list[0].args[0])
    statement = str(db.scalar.call_args_list[0].args[0].compile(
        dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True},
    ))
    assert "lag_feature_splits.purpose = 'STANDARD'" in statement


def test_new_batch_starts_at_one(monkeypatch: pytest.MonkeyPatch) -> None:
    db = MagicMock()
    db.scalar.side_effect = [None, None]
    counter = SimpleNamespace(last_number=1)
    db.get.return_value = counter
    monkeypatch.setattr(repository, "get_experiment_group_id", lambda *_: uuid4())
    monkeypatch.setattr(repository, "reserve_split_experiment_number", lambda *_: 1)

    assert repository.reserve_batch_experiment_number(db, uuid4()) == 1


def test_unassigned_source_uses_split_counter(monkeypatch: pytest.MonkeyPatch) -> None:
    db = MagicMock()
    monkeypatch.setattr(repository, "get_experiment_group_id", lambda *_: None)
    monkeypatch.setattr(repository, "reserve_split_experiment_number", lambda *_: 3)

    assert repository.reserve_batch_experiment_number(db, uuid4()) == 3
    db.execute.assert_not_called()
