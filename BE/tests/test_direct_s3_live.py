"""Opt-in real signed HTTP uploads, isolated PostgreSQL schema and S3 prefix."""
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core import config
from app.database.database import Base, engine
from app.models.dataset import (
    Dataset,
    DatasetFile,
    DatasetFileSession,
    DatasetGroup,
    DatasetUploadJob,
    RecordingSession,
)
from app.models.user import Role, User
from app.schemas.direct_upload import (
    CompleteFileRequest,
    DirectFileRequest,
    DirectUploadRequest,
    PartUrlsRequest,
    UploadedPart,
)
from app.services import direct_upload_service as direct
from app.services import pneuma_upload_service as upload
from app.services import s3_multipart_service as multipart
from app.services import storage_service as storage

pytestmark = pytest.mark.skipif(
    os.getenv('RUN_DIRECT_S3_LIVE') != '1' or config.STORAGE_BACKEND != 's3',
    reason='Real direct S3/PostgreSQL upload is opt-in',
)


def test_signed_multipart_upload_and_disk_free_registration(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    schema = 'direct_upload_test_' + uuid4().hex
    test_engine = create_engine(engine.url, connect_args={'connect_timeout': 5})
    scoped = test_engine.execution_options(schema_translate_map={None: schema})
    tables = [model.__table__ for model in (
        Role, User, DatasetGroup, Dataset, DatasetFile, RecordingSession, DatasetFileSession, DatasetUploadJob,
    )]
    monkeypatch.setattr(config, 'S3_KEY_PREFIX', '.checks/' + schema)
    monkeypatch.setattr(config, 'DATASET_UPLOAD_DIR', tmp_path)
    monkeypatch.setattr(upload, 'DATASET_UPLOAD_DIR', tmp_path)
    monkeypatch.setattr(upload, 'record_audit_event', lambda **kwargs: None)
    monkeypatch.setattr(direct, 'SessionLocal', sessionmaker(bind=scoped))
    references = []
    transfers = []
    try:
        with test_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        Base.metadata.create_all(scoped, tables=tables)
        with Session(scoped) as db:
            role = Role(id='DIRECT_TEST_DE', name='DATA_ENGINEER')
            user = User(id=uuid4(), email='direct-test@example.invalid', full_name='Direct S3 Test',
                        hashed_password='not-a-login-credential', role=role)
            db.add_all([role, user])
            db.commit()
            owner_id = user.id
            # Two parts with a real S3-sized first part. Every byte is synthetic.
            content = b'track_id,type\n' + b'1,car\n' * (multipart.PART_SIZE // 6 + 3)
            request = DirectUploadRequest(files=[DirectFileRequest(filename='20181024_d1_0830_0900.csv', size=len(content))])
            ticket = direct.start_direct_upload(db, owner_id, request)
            job_id = ticket.job_id
            state = db.get(DatasetUploadJob, job_id).upload_state
            transfers.extend(state['files'])
            references.extend(f's3://{config.S3_BUCKET_NAME}/{item["key"]}' for item in state['files'])
            parts = []
            for offset in range(0, len(content), multipart.PART_SIZE):
                number = offset // multipart.PART_SIZE + 1
                urls = direct.get_part_urls(db, owner_id, job_id, ticket.files[0].file_id, PartUrlsRequest(part_numbers=[number]))
                body = content[offset:offset + multipart.PART_SIZE]
                try:
                    with urlopen(Request(urls.parts[0].url, data=body, method='PUT', headers={'Content-Type': 'text/csv'}), timeout=90) as response:
                        assert response.status == 200
                        parts.append(UploadedPart(part_number=number, etag=response.headers['ETag']))
                except HTTPError as exc:
                    raise AssertionError(f'Signed upload failed with HTTP {exc.code}') from None
            direct.complete_direct_file(db, owner_id, job_id, ticket.files[0].file_id, CompleteFileRequest(parts=parts))
            assert direct.queue_direct_upload(db, owner_id, job_id)[1]
        # Signed PUTs and object HEADs are permitted; object bodies must never
        # be read back during upload registration, including against real S3.
        def forbidden_read(*args: object, **kwargs: object) -> None:
            raise AssertionError('Post-upload body read is forbidden')

        monkeypatch.setattr(storage.get_s3_client(), 'get_object', forbidden_read)
        monkeypatch.setattr(storage.get_s3_client(), 'download_file', forbidden_read)
        direct.run_direct_upload(job_id, None)
        with Session(scoped) as db:
            job = db.get(DatasetUploadJob, job_id)
            assert job.status == 'COMPLETED', job.error_message
            assert job.result['uploaded_count'] == 1
            session = db.query(RecordingSession).one()
            assert session.file_path == references[0]
            assert session.checksum is None
        assert not list(tmp_path.rglob('*.csv'))
        assert not list(tmp_path.rglob('*.parquet'))
    finally:
        for item in transfers:
            multipart.abort_transfer(item)
        for reference in references:
            storage.delete_dataset_file(reference, upload_root=tmp_path)
        with test_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        test_engine.dispose()
