"""Opt-in isolated PostgreSQL deletion, ownership and submission-history checks."""
import os
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.crud import crud_dataset_batch as crud
from app.database.database import Base, engine
from app.models.audit import AuditLog
from app.models.dataset import (
    Dataset,
    DatasetFile,
    DatasetFileSession,
    DatasetGroup,
    DatasetGroupProcessingJob,
    DatasetUploadJob,
    RecordingSession,
)
from app.models.user import Role, User
from app.services import dataset_batch_service as service
from app.services import dataset_group_file_service as submissions

pytestmark = pytest.mark.skipif(os.getenv('RUN_BATCH_DELETE_POSTGRES') != '1', reason='Isolated PostgreSQL checks are opt-in')


@pytest.fixture
def database(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    schema = 'batch_delete_test_' + uuid4().hex
    test_engine = create_engine(engine.url, connect_args={'connect_timeout': 5})
    scoped = test_engine.execution_options(schema_translate_map={None: schema})
    models = (Role, User, DatasetGroup, Dataset, DatasetFile, RecordingSession,
              DatasetFileSession, DatasetUploadJob, DatasetGroupProcessingJob, AuditLog)
    monkeypatch.setattr(service, 'DATASET_UPLOAD_DIR', tmp_path)
    monkeypatch.setattr(service, 'record_audit_event', lambda **kwargs: None)
    monkeypatch.setattr(submissions, 'record_audit_event', lambda **kwargs: None)
    try:
        with test_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        Base.metadata.create_all(scoped, tables=[model.__table__ for model in models])
        with Session(scoped) as db:
            role = Role(id='data_engineer', name='DATA_ENGINEER')
            user = User(id=uuid4(), email='delete-test@example.invalid', full_name='Delete Test',
                        hashed_password='not-a-login-credential', role=role)
            db.add_all([role, user])
            db.commit()
            yield SimpleNamespace(db=db, user=user, root=tmp_path, schema=schema)
    finally:
        with test_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        test_engine.dispose()


def create_batch(database: SimpleNamespace, status: str = 'PENDING') -> tuple:
    group = DatasetGroup(id=uuid4(), name='Batch ' + uuid4().hex[:6], source='pneuma', drone_id='d' + uuid4().hex[:8])
    dataset_id, file_id, session_id = uuid4(), uuid4(), uuid4()
    dataset = Dataset(id=dataset_id, name=uuid4().hex, code=uuid4().hex, source='pneuma',
        location_name='test', created_by=database.user.id, group=group, recording_date=date(2018, 10, 24), drone_id=group.drone_id)
    path = database.root / str(dataset_id) / 'raw.csv'
    path.parent.mkdir(parents=True)
    path.write_text('id,speed\n1,10\n', encoding='utf-8')
    file = DatasetFile(id=file_id, dataset=dataset, file_format='CSV', approval_status=status,
        data_file_path=path.relative_to(database.root).as_posix(), file_size_bytes=path.stat().st_size)
    start = datetime(2018, 10, 24, 8, 30, tzinfo=UTC)
    session = RecordingSession(id=session_id, dataset_id=dataset_id, original_filename='20181024_d1_0830_0900.csv',
        drone_id=group.drone_id, recording_date=date(2018, 10, 24), scheduled_start=start,
        scheduled_end=start + timedelta(minutes=30), file_path=file.data_file_path, file_size=file.file_size_bytes,
        checksum=None, upload_status='UPLOADED')
    database.db.add_all([group, dataset, file])
    database.db.flush()
    database.db.add(session)
    database.db.flush()
    database.db.add(DatasetFileSession(file_id=file_id, session_id=session_id))
    database.db.commit()
    return group, dataset, file, session, path


def test_delete_draft_preserves_other_batch_and_cleans_only_its_files(database: SimpleNamespace) -> None:
    draft, dataset, file, session, path = create_batch(database)
    sent, _, _, _, kept_path = create_batch(database, 'APPROVED')
    draft_id, dataset_id, file_id, session_id = draft.id, dataset.id, file.id, session.id
    assert crud.deletable_group_ids(database.db, [draft.id, sent.id], database.user.id) == {draft.id}
    receipt = service.delete_batch(database.db, draft.id, database.user)
    assert receipt.deleted_datasets == receipt.deleted_sessions == 1
    database.db.expire_all()
    for model, key in ((DatasetGroup, draft_id), (Dataset, dataset_id), (DatasetFile, file_id), (RecordingSession, session_id)):
        assert database.db.get(model, key) is None
    assert database.db.get(DatasetGroup, sent.id) is not None
    assert not path.exists() and kept_path.is_file()


def test_first_submission_remains_locked_after_file_metadata_resets(database: SimpleNamespace, monkeypatch: pytest.MonkeyPatch) -> None:
    group, _, file, _, path = create_batch(database)
    monkeypatch.setattr(submissions, 'get_exported_group_files', lambda *a, **kw: (object(), [file]))
    monkeypatch.setattr(submissions.crud_dataset, 'get_cleaning_history_by_file', lambda *a: object())
    monkeypatch.setattr(submissions, '_group_status', lambda *a, **kw: object())
    submissions.submit_group_files(database.db, group.id, database.user)
    assert group.first_submitted_at is not None
    first = group.first_submitted_at
    file.approval_status = 'PENDING'
    file.submitted_at = file.submitted_by = file.approved_by = None
    database.db.commit()
    assert not crud.deletable_group_ids(database.db, [group.id], database.user.id)
    with pytest.raises(HTTPException) as raised:
        service.delete_batch(database.db, group.id, database.user)
    assert raised.value.status_code == 409
    assert database.db.get(DatasetGroup, group.id).first_submitted_at == first
    assert path.is_file()


def test_fully_rejected_batch_is_listed_as_deletable_and_removed(database: SimpleNamespace) -> None:
    group, _, file, _, path = create_batch(database, 'REJECTED')
    group.first_submitted_at = datetime.now(UTC)
    file.submitted_at = datetime.now(UTC)
    file.submitted_by = file.approved_by = database.user.id
    database.db.commit()
    group_id = group.id
    assert crud.deletable_group_ids(database.db, [group_id], database.user.id) == {group_id}
    service.delete_batch(database.db, group_id, database.user)
    database.db.expire_all()
    assert database.db.get(DatasetGroup, group_id) is None
    assert not path.exists()


@pytest.mark.parametrize('other_status', ['PENDING', 'SUBMITTED', 'APPROVED', 'UNKNOWN', None])
def test_mixed_or_missing_files_never_make_rejected_batch_deletable(
    database: SimpleNamespace, other_status: str | None,
) -> None:
    group, _, _, _, path = create_batch(database, 'REJECTED')
    _, second_dataset, second_file, _, kept_path = create_batch(database, other_status or 'PENDING')
    second_dataset.group = group
    group.first_submitted_at = datetime.now(UTC)
    if other_status is None:
        database.db.delete(second_file)
    database.db.commit()
    assert not crud.deletable_group_ids(database.db, [group.id], database.user.id)
    with pytest.raises(HTTPException) as raised:
        service.delete_batch(database.db, group.id, database.user)
    assert raised.value.status_code == 409
    assert path.is_file() and kept_path.is_file()


def test_partial_ownership_cannot_delete_global_group(database: SimpleNamespace) -> None:
    group, _dataset, _file, _session, path = create_batch(database)
    user = User(id=uuid4(), email='other-delete-test@example.invalid', full_name='Other',
                hashed_password='not-a-login-credential', role_id='data_engineer')
    database.db.add(user)
    database.db.commit()
    assert not crud.deletable_group_ids(database.db, [group.id], user.id)
    with pytest.raises(HTTPException) as raised:
        service.delete_batch(database.db, group.id, user)
    assert raised.value.status_code == 404
    assert path.is_file()
    shared = Dataset(id=uuid4(), name=uuid4().hex, code=uuid4().hex, source='pneuma',
        location_name='test', created_by=user.id, group_id=group.id,
        recording_date=date(2018, 10, 29), drone_id=group.drone_id)
    database.db.add(shared)
    database.db.commit()
    assert not crud.deletable_group_ids(database.db, [group.id], database.user.id)
    with pytest.raises(HTTPException) as mixed:
        service.delete_batch(database.db, group.id, database.user)
    assert mixed.value.status_code == 404
    assert path.is_file()


def test_backfill_retains_legacy_submission_evidence(database: SimpleNamespace) -> None:
    approved, _, _, _, _ = create_batch(database, 'APPROVED')
    audited, _, _, _, _ = create_batch(database)
    untouched, _, _, _, _ = create_batch(database)
    database.db.add(AuditLog(user_id=database.user.id, action='SUBMIT_DATASET_GROUP_FOR_REVIEW', module='Dataset',
        status='SUCCESS', resource_type='DATASET', resource_id=str(audited.id)))
    database.db.commit()
    migration = (Path(__file__).parents[1] / 'migrations/20261204_batch_deletion_policy.sql').read_text(encoding='utf-8')
    # Execute against the isolated schema only; public application data is untouched.
    connection = database.db.connection()
    connection.exec_driver_sql(f'SET LOCAL search_path TO "{database.schema}", public')
    for statement in migration.split(';'):
        if statement.strip() and statement.strip() not in {'BEGIN', 'COMMIT'}:
            connection.exec_driver_sql(statement)
    database.db.commit()
    database.db.expire_all()
    assert database.db.get(DatasetGroup, approved.id).first_submitted_at is not None
    assert database.db.get(DatasetGroup, audited.id).first_submitted_at is not None
    assert database.db.get(DatasetGroup, untouched.id).first_submitted_at is None
