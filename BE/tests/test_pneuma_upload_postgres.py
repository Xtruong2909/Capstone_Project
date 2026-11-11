"""Opt-in PostgreSQL transaction test in an isolated, disposable schema."""

import os
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database.database import engine
from app.models.dataset import (
    Dataset,
    DatasetUploadJob,
    DatasetVersion,
    DatasetVersionSession,
    RecordingSession,
)
from app.models.user import Role, User
from app.services import pneuma_upload_service as service

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_PNEUMA_POSTGRES_TESTS") != "1", reason="PostgreSQL integration is opt-in",
)


def test_concurrent_uploads_keep_both_sessions_and_versions(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    schema = "pneuma_test_" + uuid4().hex
    user_id = uuid4()
    monkeypatch.setattr(service, "DATASET_UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(service, "record_audit_event", lambda **kwargs: None)
    tables = [
        Role.__table__, User.__table__, Dataset.__table__, DatasetVersion.__table__,
        RecordingSession.__table__, DatasetVersionSession.__table__, DatasetUploadJob.__table__,
    ]
    with engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        connection.execute(text(f'SET search_path TO "{schema}"'))
        for table in tables:
            table.create(connection, checkfirst=False)
        connection.execute(text("INSERT INTO roles (id, name) VALUES ('data_engineer', 'DE')"))
        connection.execute(text(
            "INSERT INTO users (id, email, hashed_password, full_name, role_id, is_active, must_change_password) "
            "VALUES (:id, 'test@example.test', 'test', 'Test', 'data_engineer', TRUE, FALSE)"
        ), {"id": user_id})
    try:
        def upload(filename: str, payload: bytes):
            with engine.connect() as connection:
                connection.execute(text(f'SET search_path TO "{schema}"'))
                connection.commit()
                with Session(bind=connection) as db:
                    return service.upload_pneuma_batch(
                        db, [(filename, BytesIO(payload))], creator_id=user_id,
                    )

        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(upload, "20181024_d1_0830_0900.csv", b"one")
            second = pool.submit(upload, "20181024_d1_0900_0930.csv", b"two")
            assert first.result().uploaded_count == 1
            assert second.result().uploaded_count == 1

        with engine.connect() as connection:
            connection.execute(text(f'SET search_path TO "{schema}"'))
            assert connection.execute(text("SELECT count(*) FROM datasets")).scalar() == 1
            assert connection.execute(text("SELECT count(*) FROM recording_sessions")).scalar() == 2
            assert connection.execute(text("SELECT count(*) FROM dataset_versions")).scalar() == 2
            assert connection.execute(text(
                "SELECT count(*) FROM dataset_version_sessions WHERE version_id = "
                "(SELECT id FROM dataset_versions ORDER BY version_number DESC LIMIT 1)"
            )).scalar() == 2
    finally:
        with engine.begin() as connection:
            connection.execute(text("SET search_path TO public"))
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))


def test_migration_preserves_old_version_and_is_repeatable() -> None:
    schema = "pneuma_migration_test_" + uuid4().hex
    dataset_id, version_id = uuid4(), uuid4()
    migration = Path("migrations/20261111_pneuma_recording_sessions.sql").read_text(
        encoding="utf-8",
    )
    with engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    try:
        with engine.begin() as connection:
            connection.execute(text(f'SET search_path TO "{schema}"'))
            connection.execute(text("CREATE TABLE users (id UUID PRIMARY KEY)"))
            connection.execute(text("CREATE TABLE datasets (id UUID PRIMARY KEY)"))
            connection.execute(text(
                "CREATE TABLE dataset_versions (id UUID PRIMARY KEY, "
                "dataset_id UUID NOT NULL REFERENCES datasets(id), created_at TIMESTAMPTZ)"
            ))
            connection.execute(text("INSERT INTO datasets (id) VALUES (:id)"), {"id": dataset_id})
            connection.execute(text(
                "INSERT INTO dataset_versions (id, dataset_id, created_at) "
                "VALUES (:id, :dataset_id, CURRENT_TIMESTAMP)"
            ), {"id": version_id, "dataset_id": dataset_id})
            connection.exec_driver_sql(migration)
            connection.exec_driver_sql(migration)
            assert connection.execute(text(
                "SELECT version_number FROM dataset_versions WHERE id = :id"
            ), {"id": version_id}).scalar() == 1
            assert connection.execute(text(
                "SELECT count(*) FROM information_schema.tables "
                "WHERE table_schema = :schema AND table_name IN "
                "('recording_sessions', 'dataset_version_sessions', 'dataset_upload_jobs')"
            ), {"schema": schema}).scalar() == 3
    finally:
        with engine.begin() as connection:
            connection.execute(text("SET search_path TO public"))
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
