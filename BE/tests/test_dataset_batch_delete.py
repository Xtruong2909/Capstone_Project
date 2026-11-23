"""Deletion policy, authorization and storage compensation for engineer batches."""
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError, OperationalError

from app.api.v1.endpoints import dataset_batches
from app.core.deps import require_data_engineer
from app.database.database import get_db
from app.services import dataset_batch_service as service
from app.services.storage_service import StorageUnavailableError


@pytest.fixture
def batch(monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    user = SimpleNamespace(id=uuid4())
    group = SimpleNamespace(id=uuid4(), name='Draft batch', drone_id='d2', first_submitted_at=None)
    datasets = [SimpleNamespace(id=uuid4(), created_by=user.id)]
    files = [SimpleNamespace(approval_status='PENDING', submitted_at=None, submitted_by=None, approved_by=None,
                             data_file_path='draft/export.parquet', csv_file_path=None, parquet_file_path='draft/export.parquet')]
    sessions = [SimpleNamespace(file_path='draft/raw.csv')]
    db = MagicMock()
    removed = []
    monkeypatch.setattr(service.crud_dataset, 'get_dataset_group_by_id', lambda *a, **kw: group)
    monkeypatch.setattr(service.crud, 'lock_group_datasets', lambda *a: datasets)
    monkeypatch.setattr(service.crud, 'lock_group_files', lambda *a: files)
    monkeypatch.setattr(service.crud, 'group_sessions', lambda *a: sessions)
    monkeypatch.setattr(service.crud, 'group_processing_jobs', lambda *a: [])
    monkeypatch.setattr(service.crud, 'has_active_upload', lambda *a: False)
    monkeypatch.setattr(service.crud, 'referenced_paths', lambda *a: set())
    delete = MagicMock()
    monkeypatch.setattr(service.crud, 'delete_group_rows', delete)
    monkeypatch.setattr(service, 'record_audit_event', lambda **kw: None)

    def remove(path: str, **kwargs: object) -> None:
        db.commit.assert_called_once()
        removed.append(path)

    monkeypatch.setattr(service, 'delete_dataset_file', remove)
    return SimpleNamespace(db=db, user=user, group=group, datasets=datasets, files=files,
                           sessions=sessions, delete=delete, removed=removed)


def test_unsubmitted_batch_deletes_rows_then_unique_storage_files(batch: SimpleNamespace) -> None:
    result = service.delete_batch(batch.db, batch.group.id, batch.user)
    assert result.deleted_datasets == result.deleted_sessions == 1
    assert not result.cleanup_pending
    assert batch.removed == ['draft/export.parquet', 'draft/raw.csv']
    batch.delete.assert_called_once_with(batch.db, batch.group.id, [batch.datasets[0].id], batch.user.id)


@pytest.mark.parametrize('status', ['SUBMITTED', 'APPROVED', 'REJECTED', 'UNKNOWN'])
def test_sent_and_unknown_statuses_are_not_deletable(batch: SimpleNamespace, status: str) -> None:
    batch.files[0].approval_status = status
    with pytest.raises(HTTPException) as raised:
        service.delete_batch(batch.db, batch.group.id, batch.user)
    assert raised.value.status_code == 409
    batch.delete.assert_not_called()
    assert not batch.removed


@pytest.mark.parametrize('field', ['first_submitted_at', 'submitted_at', 'submitted_by', 'approved_by'])
def test_submission_history_blocks_delete_even_when_current_status_is_pending(batch: SimpleNamespace, field: str) -> None:
    target = batch.group if field == 'first_submitted_at' else batch.files[0]
    setattr(target, field, datetime.now(UTC) if field.endswith('_at') else uuid4())
    with pytest.raises(HTTPException) as raised:
        service.delete_batch(batch.db, batch.group.id, batch.user)
    assert raised.value.status_code == 409
    batch.delete.assert_not_called()


def test_batch_with_datasets_from_another_owner_is_not_deletable(batch: SimpleNamespace) -> None:
    batch.datasets.append(SimpleNamespace(id=uuid4(), created_by=uuid4()))
    with pytest.raises(HTTPException) as raised:
        service.delete_batch(batch.db, batch.group.id, batch.user)
    assert raised.value.status_code == 404
    batch.delete.assert_not_called()


@pytest.mark.parametrize('operation', ['processing', 'upload'])
def test_active_work_blocks_delete(batch: SimpleNamespace, monkeypatch: pytest.MonkeyPatch, operation: str) -> None:
    if operation == 'processing':
        monkeypatch.setattr(service.crud, 'group_processing_jobs', lambda *a: [SimpleNamespace(status='RUNNING')])
    else:
        monkeypatch.setattr(service.crud, 'has_active_upload', lambda *a: True)
    with pytest.raises(HTTPException) as raised:
        service.delete_batch(batch.db, batch.group.id, batch.user)
    assert raised.value.status_code == 409
    batch.delete.assert_not_called()


def test_failed_database_delete_preserves_all_storage(batch: SimpleNamespace) -> None:
    batch.delete.side_effect = IntegrityError('delete', {}, Exception('dependent resource'))
    with pytest.raises(HTTPException) as raised:
        service.delete_batch(batch.db, batch.group.id, batch.user)
    assert raised.value.status_code == 409
    batch.db.rollback.assert_called_once()
    batch.db.commit.assert_not_called()
    assert not batch.removed


def test_storage_failure_reports_cleanup_pending_without_losing_success_receipt(
    batch: SimpleNamespace, monkeypatch: pytest.MonkeyPatch,
) -> None:
    def unavailable(*args: object, **kwargs: object) -> None:
        raise StorageUnavailableError('offline')
    monkeypatch.setattr(service, 'delete_dataset_file', unavailable)
    result = service.delete_batch(batch.db, batch.group.id, batch.user)
    assert result.cleanup_pending
    batch.db.commit.assert_called_once()
    assert 'draft/' not in result.model_dump_json()


def test_storage_still_used_by_another_dataset_is_preserved(batch: SimpleNamespace, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(service.crud, 'referenced_paths', lambda *a: {'draft/raw.csv'})
    service.delete_batch(batch.db, batch.group.id, batch.user)
    assert batch.removed == ['draft/export.parquet']


def test_reference_check_failure_defers_cleanup_after_successful_delete(
    batch: SimpleNamespace, monkeypatch: pytest.MonkeyPatch,
) -> None:
    def unavailable(*args: object) -> set[str]:
        raise OperationalError('select', {}, Exception('connection lost'))

    monkeypatch.setattr(service.crud, 'referenced_paths', unavailable)
    result = service.delete_batch(batch.db, batch.group.id, batch.user)
    assert result.cleanup_pending
    assert not batch.removed
    batch.db.commit.assert_called_once()


def test_delete_endpoint_rechecks_policy_and_requires_auth(batch: SimpleNamespace) -> None:
    app = FastAPI()
    app.include_router(dataset_batches.router, prefix='/api/v1/datasets')
    app.dependency_overrides[get_db] = lambda: batch.db
    with TestClient(app) as client:
        assert client.delete(f'/api/v1/datasets/groups/{batch.group.id}').status_code == 401
        app.dependency_overrides[require_data_engineer] = lambda: batch.user
        batch.group.first_submitted_at = datetime.now(UTC)
        response = client.delete(f'/api/v1/datasets/groups/{batch.group.id}')
    assert response.status_code == 409
    batch.delete.assert_not_called()
