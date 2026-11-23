"""Schema discovery reads bounded S3 prefixes, preserving CSV parsing and ownership checks."""
import io
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from botocore.exceptions import ClientError
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints import dataset_mapping
from app.core import config
from app.core.dataset_access import require_dataset_reader
from app.database.database import get_db
from app.main import storage_unavailable
from app.services import dataset_mapping_service as mapping
from app.services import dataset_schema_service as schema
from app.services import storage_service as storage


@pytest.fixture
def remote(monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    client = MagicMock()
    context = SimpleNamespace(client=client, content=b'track_id;time\n1;0.04\n2;0.08\n', bodies=[])
    monkeypatch.setattr(config, 'S3_BUCKET_NAME', 'schema-test')
    monkeypatch.setattr(config, 'S3_KEY_PREFIX', 'datasets')
    monkeypatch.setattr(storage, 'get_s3_client', lambda: client)

    def get_object(**kwargs: object) -> dict:
        assert kwargs['Range'] == f'bytes=0-{schema.SCHEMA_SAMPLE_BYTES}'
        body = io.BytesIO(context.content[:schema.SCHEMA_SAMPLE_BYTES + 1])
        context.bodies.append(body)
        return {'Body': body}

    client.get_object.side_effect = get_object
    return context


def test_mapping_discovers_real_remote_columns_without_full_download(
    remote: SimpleNamespace, monkeypatch: pytest.MonkeyPatch,
) -> None:
    sessions = [SimpleNamespace(file_path='s3://schema-test/datasets/a.csv', original_filename='a.csv'),
                SimpleNamespace(file_path='s3://schema-test/datasets/b.csv', original_filename='b.csv')]
    file = SimpleNamespace(id=uuid4())
    monkeypatch.setattr(mapping.crud_dataset, 'get_dataset_latest_file', lambda *args: (None, file))
    monkeypatch.setattr(mapping, 'get_file_recording_sessions', lambda *args: sessions)
    _, columns, count = mapping._dataset_schema(None, uuid4())
    assert columns == [{'name': 'track_id', 'type': 'integer'}, {'name': 'time', 'type': 'float'}]
    assert count == remote.client.get_object.call_count == 2
    remote.client.download_file.assert_not_called()
    assert all(body.closed for body in remote.bodies)


def test_prefix_does_not_treat_a_truncated_record_as_complete(remote: SimpleNamespace) -> None:
    remote.content = b'track_id;time\n1;0.04\n2;"' + b'x' * (schema.SCHEMA_SAMPLE_BYTES + 100)
    columns = schema.read_remote_recording_columns('s3://schema-test/datasets/a.csv')
    assert columns[1]['type'] == 'float'
    assert all(body.closed for body in remote.bodies)


def test_complete_multiline_csv_fields_still_parse(remote: SimpleNamespace) -> None:
    remote.content = b'track_id;comment\n1;"line one\nline two"\n2;ok\n'
    assert schema.read_remote_recording_columns('s3://schema-test/datasets/a.csv') == [
        {'name': 'track_id', 'type': 'integer'}, {'name': 'comment', 'type': 'string'},
    ]


def test_foreign_s3_reference_cannot_be_sampled(remote: SimpleNamespace) -> None:
    with pytest.raises(FileNotFoundError):
        schema.read_remote_recording_columns('s3://another-bucket/datasets/a.csv')
    remote.client.get_object.assert_not_called()


def test_permission_failure_remains_an_error_instead_of_empty_columns(remote: SimpleNamespace) -> None:
    remote.client.get_object.side_effect = ClientError({'Error': {'Code': '403'}}, 'GetObject')
    with pytest.raises(storage.StorageUnavailableError):
        schema.read_remote_recording_columns('s3://schema-test/datasets/a.csv')


def test_mapping_api_returns_503_for_s3_permission_failure(
    remote: SimpleNamespace, monkeypatch: pytest.MonkeyPatch,
) -> None:
    file = SimpleNamespace(id=uuid4())
    session = SimpleNamespace(file_path='s3://schema-test/datasets/a.csv', original_filename='a.csv')
    monkeypatch.setattr(mapping.crud_dataset, 'get_dataset_latest_file', lambda *args: (None, file))
    monkeypatch.setattr(mapping, 'get_file_recording_sessions', lambda *args: [session])
    remote.client.get_object.side_effect = ClientError({'Error': {'Code': '403'}}, 'GetObject')
    app = FastAPI()
    app.include_router(dataset_mapping.router, prefix='/datasets')
    app.add_exception_handler(storage.StorageUnavailableError, storage_unavailable)
    app.dependency_overrides[get_db] = lambda: None
    app.dependency_overrides[require_dataset_reader] = lambda: None
    with TestClient(app) as client:
        response = client.get(f'/datasets/{uuid4()}/columns')
    assert response.status_code == 503
    assert 'S3' in response.json()['detail']
    assert 'schema-test' not in response.text
