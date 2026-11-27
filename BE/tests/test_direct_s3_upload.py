"""Browser multipart control plane and disk-free catalog registration."""
import hashlib
from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from botocore.exceptions import ClientError
from fastapi import HTTPException
from test_pneuma_upload import MemoryDB
from test_pneuma_upload import storage as storage  # noqa: PLC0414 -- pytest fixture re-export

from app.core import config
from app.schemas.direct_upload import (
    CompleteFileRequest,
    DirectFileRequest,
    DirectUploadRequest,
    PartUrlsRequest,
    UploadedPart,
)
from app.services import direct_upload_service as service
from app.services import s3_multipart_service as multipart
from app.services import storage_service


class BrowserS3:
    def __init__(self) -> None:
        self.uploads: dict[str, dict] = {}
        self.objects: dict[str, dict] = {}
        self.completed = 0

    def create_multipart_upload(self, **kwargs: object) -> dict:
        upload_id = str(uuid4())
        self.uploads[upload_id] = {**kwargs, 'parts': {}}
        return {'UploadId': upload_id}

    def generate_presigned_url(self, operation: str, **kwargs: object) -> str:
        assert operation == 'upload_part'
        assert kwargs['ExpiresIn'] == 900
        assert kwargs['Params']['ContentLength'] > 0
        return 'https://s3.example.invalid/private-part'

    def get_paginator(self, operation: str) -> object:
        assert operation == 'list_parts'

        def paginate(**kwargs: object) -> list[dict]:
            upload = self.uploads[kwargs['UploadId']]
            return [{'Parts': [{'PartNumber': n, 'ETag': p['etag'], 'Size': len(p['body'])}
                               for n, p in sorted(upload['parts'].items())]}]

        return SimpleNamespace(paginate=paginate)

    def complete_multipart_upload(self, **kwargs: object) -> dict:
        upload = self.uploads.pop(kwargs['UploadId'])
        content = b''.join(upload['parts'][p['PartNumber']]['body'] for p in kwargs['MultipartUpload']['Parts'])
        self.objects[kwargs['Key']] = {'body': content, 'Metadata': upload['Metadata']}
        self.completed += 1
        return {}

    def head_object(self, **kwargs: object) -> dict:
        if kwargs['Key'] not in self.objects:
            raise ClientError({'Error': {'Code': '404'}}, 'HeadObject')
        item = self.objects[kwargs['Key']]
        return {'ContentLength': len(item['body']), 'Metadata': item['Metadata']}

    def get_object(self, **kwargs: object) -> dict:
        raise AssertionError('Upload must not read object bodies from S3')

    def download_file(self, *args: object, **kwargs: object) -> None:
        raise AssertionError('Upload must not download files from S3')

    def abort_multipart_upload(self, **kwargs: object) -> None:
        self.uploads.pop(kwargs['UploadId'], None)

    def delete_object(self, **kwargs: object) -> None:
        self.objects.pop(kwargs['Key'], None)


@pytest.fixture
def direct(storage: MemoryDB, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> SimpleNamespace:
    s3, jobs = BrowserS3(), {}
    monkeypatch.setattr(config, 'STORAGE_BACKEND', 's3')
    monkeypatch.setattr(config, 'S3_BUCKET_NAME', 'test-private-bucket')
    monkeypatch.setattr(config, 'S3_KEY_PREFIX', 'datasets')
    monkeypatch.setattr(config, 'DATASET_UPLOAD_DIR', tmp_path)
    monkeypatch.setattr(multipart, 'PART_SIZE', 8)
    monkeypatch.setattr(multipart, 'get_s3_client', lambda: s3)
    monkeypatch.setattr(storage_service, 'get_s3_client', lambda: s3)
    monkeypatch.setattr(service, 'SessionLocal', lambda: storage)
    monkeypatch.setattr(storage, 'close', lambda: None, raising=False)

    def create(_db: object, job_id: object, owner: object, count: int) -> object:
        job = SimpleNamespace(id=job_id, created_by=owner, status='PENDING', total_files=count,
                              processed_files=0, result=None, upload_state=None, error_message=None)
        jobs[job_id] = job
        return job

    monkeypatch.setattr(service.crud_dataset, 'create_upload_job', create)
    monkeypatch.setattr(service.crud_dataset, 'get_upload_job', lambda db, key: jobs.get(key))
    monkeypatch.setattr(service.crud_dataset, 'lock_upload_job', lambda db, key: jobs.get(key))
    monkeypatch.setattr(service.crud_dataset, 'save_upload_job', lambda db, job: None)
    monkeypatch.setattr(service.crud_dataset, 'referenced_recording_paths',
                        lambda db, paths: {s.file_path for s in storage.sessions if s.file_path in paths})
    return SimpleNamespace(db=storage, s3=s3, jobs=jobs, owner=storage.creator_id)


def start(direct: SimpleNamespace, name: str, content: bytes) -> object:
    return service.start_direct_upload(direct.db, direct.owner, DirectUploadRequest(
        files=[DirectFileRequest(filename=name, size=len(content))]))


def browser_upload(direct: SimpleNamespace, ticket: object, content: bytes) -> CompleteFileRequest:
    item = direct.jobs[ticket.job_id].upload_state['files'][0]
    parts = []
    for offset in range(0, len(content), multipart.PART_SIZE):
        body = content[offset:offset + multipart.PART_SIZE]
        number = offset // multipart.PART_SIZE + 1
        etag = '"' + hashlib.md5(body).hexdigest() + '"'
        direct.s3.uploads[item['upload_id']]['parts'][number] = {'body': body, 'etag': etag}
        parts.append(UploadedPart(part_number=number, etag=etag))
    return CompleteFileRequest(parts=parts)


def test_browser_upload_registers_all_sessions_without_local_staging(
    direct: SimpleNamespace, tmp_path: Path,
) -> None:
    content = b'track_id,type\n1,car\n'
    ticket = start(direct, '20181024_d1_0830_0900.csv', content)
    urls = service.get_part_urls(direct.db, direct.owner, ticket.job_id, ticket.files[0].file_id,
                                 PartUrlsRequest(part_numbers=[1, 2]))
    assert len(urls.parts) == 2
    parts = browser_upload(direct, ticket, content)
    service.complete_direct_file(direct.db, direct.owner, ticket.job_id, ticket.files[0].file_id, parts)
    result, queued = service.queue_direct_upload(direct.db, direct.owner, ticket.job_id)
    assert queued and result.status == 'QUEUED'
    service.run_direct_upload(ticket.job_id, None)
    job = direct.jobs[ticket.job_id]
    assert job.status == 'COMPLETED'
    assert job.result['uploaded_count'] == 1
    assert direct.db.sessions[0].checksum is None
    assert job.upload_state['stage'] == 'DONE'
    assert result.stage == 'SAVING'
    assert direct.db.sessions[0].file_path.startswith('s3://test-private-bucket/')
    assert len(direct.s3.objects) == 1
    assert not list(tmp_path.rglob('*.csv'))
    assert not list(tmp_path.rglob('*.parquet'))


def test_completion_and_queue_retries_are_idempotent(direct: SimpleNamespace) -> None:
    ticket = start(direct, '20181024_d1_0830_0900.csv', b'content')
    parts = browser_upload(direct, ticket, b'content')
    service.complete_direct_file(direct.db, direct.owner, ticket.job_id, ticket.files[0].file_id, parts)
    service.complete_direct_file(direct.db, direct.owner, ticket.job_id, ticket.files[0].file_id, parts)
    assert direct.s3.completed == 1
    assert service.queue_direct_upload(direct.db, direct.owner, ticket.job_id)[1]
    assert not service.queue_direct_upload(direct.db, direct.owner, ticket.job_id)[1]


def test_existing_filename_retry_compares_bytes_and_reuses_session(
    direct: SimpleNamespace, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(direct.s3, 'get_object', lambda **kw: {
        'Body': BytesIO(direct.s3.objects[kw['Key']]['body']),
    })
    for _ in range(2):
        ticket = start(direct, '20181024_d1_0830_0900.csv', b'content')
        parts = browser_upload(direct, ticket, b'content')
        service.complete_direct_file(direct.db, direct.owner, ticket.job_id, ticket.files[0].file_id, parts)
        service.queue_direct_upload(direct.db, direct.owner, ticket.job_id)
        service.run_direct_upload(ticket.job_id, None)
    assert len(direct.db.sessions) == len(direct.s3.objects) == 1
    assert direct.jobs[ticket.job_id].status == 'COMPLETED'
    assert direct.jobs[ticket.job_id].result['failed_count'] == 0
    assert direct.jobs[ticket.job_id].result['duplicate_count'] == 1
    assert direct.jobs[ticket.job_id].result['files'][0]['status'] == 'DUPLICATE'
    assert direct.jobs[ticket.job_id].result['files'][0]['session_id'] == str(direct.db.sessions[0].id)
    assert direct.db.sessions[0].checksum == hashlib.sha256(b'content').hexdigest()


def test_same_size_changed_content_preserves_existing_recording(
    direct: SimpleNamespace, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(direct.s3, 'get_object', lambda **kw: {
        'Body': BytesIO(direct.s3.objects[kw['Key']]['body']),
    })
    for content in (b'original', b'modified'):
        ticket = start(direct, '20181024_d1_0830_0900.csv', content)
        parts = browser_upload(direct, ticket, content)
        service.complete_direct_file(direct.db, direct.owner, ticket.job_id, ticket.files[0].file_id, parts)
        service.queue_direct_upload(direct.db, direct.owner, ticket.job_id)
        service.run_direct_upload(ticket.job_id, None)
    assert len(direct.db.sessions) == len(direct.s3.objects) == 1
    assert next(iter(direct.s3.objects.values()))['body'] == b'original'
    assert direct.jobs[ticket.job_id].result['files'][0]['status'] == 'CONFLICT'


def test_retry_storage_failure_does_not_accept_unverified_content(
    direct: SimpleNamespace, monkeypatch: pytest.MonkeyPatch,
) -> None:
    def unavailable(**kwargs: object) -> dict:
        raise ClientError({'Error': {'Code': 'AccessDenied'}}, 'GetObject')

    monkeypatch.setattr(direct.s3, 'get_object', unavailable)
    for _ in range(2):
        ticket = start(direct, '20181024_d1_0830_0900.csv', b'content')
        parts = browser_upload(direct, ticket, b'content')
        service.complete_direct_file(direct.db, direct.owner, ticket.job_id, ticket.files[0].file_id, parts)
        service.queue_direct_upload(direct.db, direct.owner, ticket.job_id)
        service.run_direct_upload(ticket.job_id, None)
    assert len(direct.db.sessions) == len(direct.s3.objects) == 1
    assert direct.jobs[ticket.job_id].result['files'][0]['status'] == 'ERROR'


def test_upload_defers_csv_content_checks_until_processing(direct: SimpleNamespace) -> None:
    ticket = start(direct, '20181024_d1_0830_0900.csv', b'bad\x00csv')
    parts = browser_upload(direct, ticket, b'bad\x00csv')
    service.complete_direct_file(direct.db, direct.owner, ticket.job_id, ticket.files[0].file_id, parts)
    service.queue_direct_upload(direct.db, direct.owner, ticket.job_id)
    service.run_direct_upload(ticket.job_id, None)
    assert direct.jobs[ticket.job_id].status == 'COMPLETED'
    assert len(direct.s3.objects) == len(direct.db.sessions) == 1
    assert direct.db.sessions[0].checksum is None


def test_unknown_checksums_do_not_make_different_sessions_duplicates(direct: SimpleNamespace) -> None:
    for filename in ('20181024_d1_0830_0900.csv', '20181024_d1_0900_0930.csv'):
        ticket = start(direct, filename, b'content')
        parts = browser_upload(direct, ticket, b'content')
        service.complete_direct_file(direct.db, direct.owner, ticket.job_id, ticket.files[0].file_id, parts)
        service.queue_direct_upload(direct.db, direct.owner, ticket.job_id)
        service.run_direct_upload(ticket.job_id, None)
        assert direct.jobs[ticket.job_id].result['uploaded_count'] == 1
    assert len(direct.db.sessions) == len(direct.s3.objects) == 2
    assert all(session.checksum is None for session in direct.db.sessions)


def test_part_urls_are_scoped_to_owner_file_and_size(direct: SimpleNamespace) -> None:
    ticket = start(direct, '20181024_d1_0830_0900.csv', b'content')
    for owner, file_id, numbers, expected in [
        (uuid4(), ticket.files[0].file_id, [1], 404),
        (direct.owner, uuid4(), [1], 404),
        (direct.owner, ticket.files[0].file_id, [0], 422),
        (direct.owner, ticket.files[0].file_id, [2], 422),
    ]:
        with pytest.raises(HTTPException) as raised:
            service.get_part_urls(direct.db, owner, ticket.job_id, file_id, PartUrlsRequest(part_numbers=numbers))
        assert raised.value.status_code == expected


def test_expired_transfer_can_be_cancelled_but_not_signed(direct: SimpleNamespace) -> None:
    ticket = start(direct, '20181024_d1_0830_0900.csv', b'content')
    direct.jobs[ticket.job_id].upload_state['expires_at'] = (datetime.now(UTC) - timedelta(seconds=1)).timestamp()
    with pytest.raises(HTTPException) as raised:
        service.get_part_urls(direct.db, direct.owner, ticket.job_id, ticket.files[0].file_id, PartUrlsRequest(part_numbers=[1]))
    assert raised.value.status_code == 410
    service.cancel_direct_upload(direct.db, direct.owner, ticket.job_id)
    assert not direct.s3.uploads


def test_bad_etag_and_part_size_cannot_be_finalized(direct: SimpleNamespace) -> None:
    ticket = start(direct, '20181024_d1_0830_0900.csv', b'long content')
    parts = browser_upload(direct, ticket, b'long content')
    parts.parts[0].etag = 'invalid'
    with pytest.raises(HTTPException) as raised:
        service.complete_direct_file(direct.db, direct.owner, ticket.job_id, ticket.files[0].file_id, parts)
    assert raised.value.status_code == 422
    assert direct.s3.completed == 0


def test_incomplete_batch_and_committed_batch_cannot_be_cancelled(direct: SimpleNamespace) -> None:
    ticket = start(direct, '20181024_d1_0830_0900.csv', b'content')
    with pytest.raises(HTTPException):
        service.queue_direct_upload(direct.db, direct.owner, ticket.job_id)
    parts = browser_upload(direct, ticket, b'content')
    service.complete_direct_file(direct.db, direct.owner, ticket.job_id, ticket.files[0].file_id, parts)
    service.queue_direct_upload(direct.db, direct.owner, ticket.job_id)
    with pytest.raises(HTTPException):
        service.cancel_direct_upload(direct.db, direct.owner, ticket.job_id)
    assert len(direct.s3.objects) == 1


@pytest.mark.parametrize('filename,size', [('invalid.csv', 8), ('20181024_d1_0830_0900.csv', 3 * 1024**3)])
def test_invalid_requests_create_no_multipart_upload(direct: SimpleNamespace, filename: str, size: int) -> None:
    with pytest.raises(HTTPException) as raised:
        service.start_direct_upload(direct.db, direct.owner, DirectUploadRequest(
            files=[DirectFileRequest(filename=filename, size=size)]))
    assert raised.value.status_code == 422
    assert not direct.s3.uploads
