from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.services import dataset_consumer_service as consumer
from app.services.dataset_preview_service import DatasetPreviewNotFoundError


def test_group_sessions_select_latest_approved_version(monkeypatch: pytest.MonkeyPatch) -> None:
    db, user = object(), SimpleNamespace(id=uuid4(), role_id="data_scientist")
    group_id, dataset_id, version_id = uuid4(), uuid4(), uuid4()
    access = Mock()
    approved = Mock()
    sessions = Mock(return_value="sessions")
    monkeypatch.setattr(consumer, "check_dataset_access", access)
    monkeypatch.setattr(
        consumer, "resolve_group_dataset_version",
        lambda *_: SimpleNamespace(id=version_id),
    )
    monkeypatch.setattr(consumer, "require_approved_version", approved)
    monkeypatch.setattr(consumer, "list_approved_recording_sessions", sessions)

    result = consumer.list_approved_group_sessions(db, user, group_id, dataset_id, 2, 20)

    assert result == "sessions"
    access.assert_called_once_with(user, dataset_id, db)
    approved.assert_called_once_with(db, user, dataset_id, version_id)
    sessions.assert_called_once_with(db, user, dataset_id, version_id, 2, 20)


def test_group_preview_rejects_dataset_from_other_group(monkeypatch: pytest.MonkeyPatch) -> None:
    db, user = object(), SimpleNamespace(id=uuid4(), role_id="business_user")
    monkeypatch.setattr(consumer, "check_dataset_access", lambda *_: None)
    monkeypatch.setattr(
        consumer, "resolve_group_dataset_version",
        Mock(side_effect=DatasetPreviewNotFoundError("Dataset không thuộc nhóm")),
    )
    preview = Mock()
    monkeypatch.setattr(consumer, "preview_approved_recording_session", preview)

    with pytest.raises(HTTPException) as exc:
        consumer.preview_approved_group_session(
            db, user, uuid4(), uuid4(), uuid4(),
            page=1, limit=20, column_offset=0, representation="normalized",
        )

    assert exc.value.status_code == 404
    preview.assert_not_called()


def test_group_sessions_reject_missing_grant(monkeypatch: pytest.MonkeyPatch) -> None:
    user = SimpleNamespace(id=uuid4(), role_id="data_scientist")
    monkeypatch.setattr(
        consumer, "check_dataset_access",
        Mock(side_effect=HTTPException(403, "Dataset access has not been granted")),
    )
    resolve = Mock()
    monkeypatch.setattr(consumer, "resolve_group_dataset_version", resolve)

    with pytest.raises(HTTPException) as exc:
        consumer.list_approved_group_sessions(object(), user, uuid4(), uuid4(), 1, 20)

    assert exc.value.status_code == 403
    resolve.assert_not_called()


def test_group_sessions_reject_non_consumer_role(monkeypatch: pytest.MonkeyPatch) -> None:
    resolve = Mock()
    monkeypatch.setattr(consumer, "resolve_group_dataset_version", resolve)
    with pytest.raises(HTTPException) as exc:
        consumer.list_approved_group_sessions(
            object(), SimpleNamespace(role_id="data_engineer"), uuid4(), uuid4(), 1, 20,
        )
    assert exc.value.status_code == 403
    resolve.assert_not_called()
