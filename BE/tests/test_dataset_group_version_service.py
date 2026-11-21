from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.services import dataset_group_version_service as service


def test_group_export_requires_every_dataset_and_matching_version(monkeypatch: pytest.MonkeyPatch) -> None:
    group_id, dataset_a, dataset_b, version_id = (uuid4() for _ in range(4))
    db = MagicMock()
    datasets = [SimpleNamespace(id=dataset_a), SimpleNamespace(id=dataset_b)]
    job = SimpleNamespace(results=[{
        "dataset_id": str(dataset_a), "version_id": str(version_id), "status": "COMPLETED",
    }])
    monkeypatch.setattr(service, "_group_datasets", lambda *_: datasets)
    monkeypatch.setattr(service.crud_dataset, "get_latest_completed_group_export_job", lambda *_: job)

    with pytest.raises(HTTPException) as exc:
        service.get_exported_group_versions(db, group_id)

    assert exc.value.status_code == 409
    db.commit.assert_not_called()


def test_submit_group_is_atomic_when_one_version_was_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    group_id = uuid4()
    versions = [
        SimpleNamespace(id=uuid4(), approval_status="PENDING"),
        SimpleNamespace(id=uuid4(), approval_status="REJECTED"),
    ]
    db = MagicMock()
    monkeypatch.setattr(service, "get_exported_group_versions", lambda *_: (object(), versions))

    with pytest.raises(HTTPException) as exc:
        service.submit_group_versions(db, group_id, SimpleNamespace(id=uuid4()))

    assert exc.value.status_code == 409
    assert versions[0].approval_status == "PENDING"
    db.commit.assert_not_called()


def test_submit_group_updates_all_pending_versions_once(monkeypatch: pytest.MonkeyPatch) -> None:
    group_id = uuid4()
    versions = [
        SimpleNamespace(id=uuid4(), approval_status="PENDING"),
        SimpleNamespace(id=uuid4(), approval_status="PENDING"),
    ]
    db = MagicMock()
    user = SimpleNamespace(id=uuid4())
    monkeypatch.setattr(service, "get_exported_group_versions", lambda *_: (object(), versions))
    monkeypatch.setattr(service.crud_dataset, "get_cleaning_history_by_version", lambda *_: object())
    monkeypatch.setattr(service, "record_audit_event", lambda **_: None)
    monkeypatch.setattr(service, "_group_status", lambda *_args, **_kwargs: "submitted")

    result = service.submit_group_versions(db, group_id, user, note="Xin duyệt nhóm Dataset")

    assert result == "submitted"
    assert all(version.approval_status == "SUBMITTED" for version in versions)
    assert all(version.submitted_by == user.id for version in versions)
    assert all(version.approval_note == "Xin duyệt nhóm Dataset" for version in versions)
    db.commit.assert_called_once_with()


def test_submit_group_without_note_uses_default(monkeypatch: pytest.MonkeyPatch) -> None:
    group_id = uuid4()
    version = SimpleNamespace(id=uuid4(), approval_status="PENDING")
    db = MagicMock()
    monkeypatch.setattr(service, "get_exported_group_versions", lambda *_: (object(), [version]))
    monkeypatch.setattr(service.crud_dataset, "get_cleaning_history_by_version", lambda *_: object())
    monkeypatch.setattr(service, "record_audit_event", lambda **_: None)
    monkeypatch.setattr(service, "_group_status", lambda *_args, **_kwargs: "submitted")

    service.submit_group_versions(db, group_id, SimpleNamespace(id=uuid4()))

    assert version.approval_note == "Đã gửi nhóm Dataset cho Admin phê duyệt"


def test_resubmit_group_changes_only_rejected_versions(monkeypatch: pytest.MonkeyPatch) -> None:
    group_id = uuid4()
    rejected = SimpleNamespace(id=uuid4(), approval_status="REJECTED")
    approved = SimpleNamespace(id=uuid4(), approval_status="APPROVED")
    db = MagicMock()
    monkeypatch.setattr(service, "get_exported_group_versions", lambda *_: (object(), [rejected, approved]))
    monkeypatch.setattr(service, "record_audit_event", lambda **_: None)
    monkeypatch.setattr(service, "_group_status", lambda *_args, **_kwargs: "resubmitted")

    result = service.resubmit_group_versions(db, group_id, SimpleNamespace(id=uuid4()))

    assert result == "resubmitted"
    assert rejected.approval_status == "SUBMITTED"
    assert approved.approval_status == "APPROVED"
    db.commit.assert_called_once_with()
