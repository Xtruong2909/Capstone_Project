"""Opt-in real S3 + PostgreSQL pipeline, isolated in a rolled-back test schema.

RUN_S3_PIPELINE_POSTGRES=1 and STORAGE_BACKEND=s3 are required. Only small synthetic
recordings are uploaded; this test deletes its own S3 objects in finally.
"""

import os
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.api.v1.api import api_router
from app.core import config
from app.core.deps import get_current_user
from app.database.database import Base, engine, get_db
from app.models.dataset import (
    DatasetAccessGrant,
    DatasetFile,
    DatasetGroupProcessingJob,
    RecordingSession,
)
from app.models.traffic import TrafficTimeSeries
from app.models.user import Role, User
from app.schemas.dataset_normalization import DatasetExportRequest
from app.schemas.traffic_aggregation import GroupTemporalAggregationRequest
from app.services import dataset_group_file_service as review
from app.services import dataset_mapping_service as mapping
from app.services import dataset_normalization_service as normalization
from app.services import dataset_pipeline_service as pipeline
from app.services import dataset_preview_service as preview
from app.services import dataset_schema_service as schema_reader
from app.services import ds_temporal_aggregation_service as temporal
from app.services import pneuma_upload_service as upload
from app.services import storage_service as storage
from app.services.data_quality_service import _file_path as quality_path
from app.services.ds_temporal_aggregation_service import _normalized_path as scientist_path
from app.services.normalization_batch import FIELDS
from app.services.traffic_aggregation_service import _resolve_dataset_file_path as aggregation_path

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_S3_PIPELINE_POSTGRES") != "1" or config.STORAGE_BACKEND != "s3",
    reason="Live S3/PostgreSQL pipeline is opt-in",
)


def test_upload_preview_normalize_export_resume_and_submit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    schema = "s3_pipeline_test_" + uuid4().hex
    references: list[str] = []
    original_persist = storage.persist_dataset_file
    monkeypatch.setattr(config, 'S3_KEY_PREFIX', '.checks/' + schema)

    def track(path: Path, *, upload_root: Path) -> str:
        reference = original_persist(path, upload_root=upload_root)
        references.append(reference)
        return reference

    for module in (upload, normalization, preview, pipeline, schema_reader):
        monkeypatch.setattr(module, "DATASET_UPLOAD_DIR", tmp_path)
    for module in (upload, normalization):
        monkeypatch.setattr(module, "persist_dataset_file", track)
    for module in (upload, review):
        monkeypatch.setattr(module, "record_audit_event", lambda **kwargs: None)
    test_engine = create_engine(engine.url, connect_args={"connect_timeout": 5})
    try:
        with test_engine.connect() as connection, connection.begin() as transaction:
            connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
            connection.exec_driver_sql(f'SET LOCAL search_path TO "{schema}", public')
            scoped = connection.execution_options(schema_translate_map={None: schema})
            Base.metadata.create_all(scoped)
            try:
                with Session(bind=scoped, join_transaction_mode="create_savepoint", expire_on_commit=False) as db:
                    role = Role(id="data_engineer", name="DATA_ENGINEER")
                    user = User(id=uuid4(), email="s3-test@example.invalid", full_name="S3 pipeline test",
                        hashed_password="not-a-login-credential", role=role)
                    db.add_all([role, user])
                    db.commit()
                    content = (";".join(FIELDS) + "\n1;car;100;10;37;23;12;0;0;0;38;24;13;0;0;60\n").encode()
                    uploaded = upload.upload_pneuma_batch(db,
                        [("20181024_d1_0830_0900.csv", BytesIO(content))], creator_id=user.id)
                    assert uploaded.uploaded_count == 1
                    group = uploaded.datasets[0]
                    raw = db.scalars(select(RecordingSession)).one()
                    assert raw.file_path.startswith("s3://")
                    # Real concurrent cold-cache downloads under the test-only prefix.
                    extra = tmp_path / 'prefetch.csv'
                    extra.write_bytes(content)
                    extra_reference = original_persist(extra, upload_root=tmp_path)
                    references.append(extra_reference)
                    extra.unlink()
                    ready = storage.resolve_dataset_files([raw.file_path, extra_reference], upload_root=tmp_path)
                    assert [path.read_bytes() for path in ready] == [content, content]
                    columns = mapping.get_group_dataset_columns(db, group.group_id, owner_id=user.id)
                    assert len(columns.columns) == len(FIELDS)
                    initial = preview.get_dataset_preview(db, dataset_id=group.dataset_id,
                        page=1, page_size=10)
                    assert len(initial.rows) == 2
                    started_at = datetime.now(UTC)
                    normalized = normalization.normalize_dataset_structure_service(db,
                        dataset_id=group.dataset_id, user=user)
                    exported = normalization.export_normalized_dataset_service(db,
                        dataset_id=group.dataset_id, user=user,
                        payload=DatasetExportRequest(staging_id=normalized.staging_id, export_format="PARQUET"))
                    assert exported.total_records == 2
                    current = db.get(DatasetFile, exported.file_id)
                    assert current.data_file_path.startswith("s3://")
                    db.add(DatasetGroupProcessingJob(
                        group_id=group.group_id, staging_id=uuid4(), created_by=user.id,
                        operation="EXPORT", status="COMPLETED", total_datasets=1, processed_datasets=1,
                        created_at=started_at,
                        results=[{"dataset_id": str(group.dataset_id), "file_id": str(exported.file_id),
                            "dataset_name": group.name, "status": "COMPLETED"}],
                    ))
                    db.commit()
                    cached = preview.resolve_stored_file_path(current.data_file_path)
                    cached.unlink()
                    db.expire_all()  # Reload DB state instead of relying on in-memory objects.
                    recovered = preview.get_dataset_preview(db, dataset_id=group.dataset_id,
                        page=1, page_size=10)
                    assert len(recovered.rows) == 2 and recovered.rows[1]["time"] == 60.0
                    state = pipeline.get_group_pipeline_state(db, group.group_id, user.id)
                    assert state.exported and state.step == 4
                    submitted = review.submit_group_files(db, group.group_id, user, note="S3 test")
                    assert submitted.approval_status == "SUBMITTED"
                    assert pipeline.get_group_pipeline_state(db, group.group_id, user.id).completed
                    _check_read_apis(db, user, raw, current)
            finally:
                transaction.rollback()
    finally:
        test_engine.dispose()
        for reference in references:
            storage.delete_dataset_file(reference, upload_root=tmp_path)


def _check_read_apis(db: Session, engineer: User, raw: RecordingSession, current: DatasetFile) -> None:
    """Exercise actual routers against isolated PostgreSQL rows and real S3 objects."""
    app = FastAPI()
    app.include_router(api_router, prefix='/api/v1')
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: engineer
    dataset_id, group_id = current.dataset_id, current.dataset.group_id
    batch = f'/api/v1/datasets/groups/{group_id}'
    dataset = f'/api/v1/datasets/{dataset_id}'
    # Force reads through S3 instead of letting a warm disk cache mask an issue.
    preview.resolve_stored_file_path(raw.file_path).unlink(missing_ok=True)
    preview.resolve_stored_file_path(current.data_file_path).unlink(missing_ok=True)
    paths = [
        batch + '/workflow', batch + '/columns', batch + '/column-mappings',
        batch + '/files', batch + '/status', batch + '/report', batch + '/datasets',
        batch + f'/datasets/{dataset_id}/sessions',
        batch + f'/datasets/{dataset_id}/sessions/{raw.id}?representation=raw&limit=2',
        dataset + '/preview?page_size=2', dataset + '/columns',
    ]
    with TestClient(app) as client:
        for path in paths:
            response = client.get(path)
            assert response.status_code == 200, (path, response.text)
        # Missing S3 objects must return an actionable 404, rather than an SDK 500.
        original = raw.file_path
        raw.file_path = original + '.missing.csv'
        db.commit()
        missing_session = batch + f'/datasets/{dataset_id}/sessions/{raw.id}?representation=raw&limit=2'
        assert client.get(missing_session).status_code == 404
        raw.file_path = original
        original = current.data_file_path
        current.data_file_path = original + '.missing.parquet'
        db.commit()
        assert client.get(dataset + '/preview?page_size=2').status_code == 404
        current.data_file_path = original
        db.commit()
        # Both aggregation readers and quality checks share the durable S3 resolver.
        assert quality_path(current).is_file()
        assert scientist_path(current).is_file()
        assert aggregation_path(current).is_file()
        admin_role = Role(id='admin', name='ADMIN')
        ds_role = Role(id='data_scientist', name='DATA_SCIENTIST')
        admin = User(id=uuid4(), email='s3-admin@example.invalid', full_name='S3 Admin',
                     hashed_password='not-a-login-credential', role=admin_role)
        scientist = User(id=uuid4(), email='s3-ds@example.invalid', full_name='S3 Scientist',
                         hashed_password='not-a-login-credential', role=ds_role)
        db.add_all([admin_role, ds_role, admin, scientist])
        current.approval_status = 'APPROVED'
        db.commit()
        app.dependency_overrides[get_current_user] = lambda: admin
        assert client.get(dataset + '/preview?page_size=2').status_code == 200
        app.dependency_overrides[get_current_user] = lambda: scientist
        approved = f'/api/v1/datasets/approved/groups/{group_id}/datasets/{dataset_id}/sessions/{raw.id}/preview'
        assert client.get(approved).status_code == 403
        db.add(DatasetAccessGrant(dataset_id=dataset_id, user_id=scientist.id, granted_by=admin.id))
        db.commit()
        for representation in ('normalized', 'raw'):
            response = client.get(approved, params={'representation': representation, 'limit': 2})
            assert response.status_code == 200, response.text
        assert client.get(approved.replace(str(raw.id), str(uuid4()))).status_code == 404
        _check_temporal_aggregation(db, scientist, current)


def _check_temporal_aggregation(db: Session, scientist: User, current: DatasetFile) -> None:
    """Job creation is metadata-only; the worker reads S3 and persists minute bins."""
    preview.resolve_stored_file_path(current.data_file_path).unlink(missing_ok=True)
    with patch.object(temporal, '_normalized_path', side_effect=AssertionError('S3 must be read in the worker')):
        jobs, results = temporal.create_group_temporal_aggregation(
            db, scientist, GroupTemporalAggregationRequest(group_id=current.dataset.group_id),
        )
    started = temporal.serialize_group_aggregation_run(jobs, results)
    assert started.status == 'PROCESSING' and started.total_sessions == 1
    connection = db.get_bind()

    def worker_session() -> Session:
        return Session(bind=connection, join_transaction_mode='create_savepoint', expire_on_commit=False)

    temporal.run_group_temporal_aggregation(db_session_factory=worker_session, aggregation_id=started.aggregation_id)
    db.expire_all()
    finished = temporal.get_latest_group_temporal_aggregation(db, scientist, current.dataset.group_id)
    assert finished.status == 'COMPLETED'
    assert finished.completed_sessions == 1 and finished.failed_sessions == 0
    rows = list(db.scalars(select(TrafficTimeSeries).where(
        TrafficTimeSeries.aggregation_id == started.aggregation_id,
    ).order_by(TrafficTimeSeries.time_bucket)))
    assert [row.vehicle_count for row in rows] == [1, 1]
    assert [float(row.mean_speed) for row in rows] == [43.2, 46.8]
