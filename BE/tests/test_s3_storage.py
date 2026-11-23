"""S3 failure, rollback and pipeline integration checks without live AWS or DB."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Lock
from time import sleep
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pyarrow.parquet as pq
import pytest
from botocore.exceptions import ClientError
from test_pneuma_upload import MemoryDB, upload
from test_pneuma_upload import storage as storage  # noqa: PLC0414 -- pytest fixture re-export

from app.core import config
from app.schemas.dataset_normalization import DatasetExportRequest
from app.services import dataset_normalization_service as normalization
from app.services import dataset_preview_service as preview
from app.services import storage_service as service
from app.services.normalization_batch import FIELDS


class MemoryS3:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}
        self.downloads = 0
        self.denied = False

    def upload_file(self, filename: str, bucket: str, key: str, **kwargs: object) -> None:
        self.objects[bucket, key] = Path(filename).read_bytes()

    def download_file(self, bucket: str, key: str, filename: str, **kwargs: object) -> None:
        self.head_object(Bucket=bucket, Key=key)
        self.downloads += 1
        Path(filename).write_bytes(self.objects[bucket, key])

    def head_object(self, *, Bucket: str, Key: str) -> dict:
        if self.denied:
            raise ClientError({"Error": {"Code": "403"}}, "HeadObject")
        if (Bucket, Key) not in self.objects:
            raise ClientError({"Error": {"Code": "404"}}, "HeadObject")
        return {"ContentLength": len(self.objects[Bucket, Key])}

    def delete_object(self, *, Bucket: str, Key: str) -> None:
        self.objects.pop((Bucket, Key), None)


@pytest.fixture
def remote(monkeypatch: pytest.MonkeyPatch) -> MemoryS3:
    fake = MemoryS3()
    monkeypatch.setattr(config, "STORAGE_BACKEND", "s3")
    monkeypatch.setattr(config, "S3_BUCKET_NAME", "test-private-bucket")
    monkeypatch.setattr(config, "S3_KEY_PREFIX", "datasets")
    monkeypatch.setattr(service, "get_s3_client", lambda: fake)
    return fake


def save(tmp_path: Path, content: bytes = b"id,speed\n1,12\n") -> str:
    source = tmp_path / "recording.csv"
    source.write_bytes(content)
    return service.persist_dataset_file(source, upload_root=tmp_path)


def test_local_mode_needs_no_s3_and_old_files_still_work_in_s3_mode(
    tmp_path: Path, remote: MemoryS3, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(config, "STORAGE_BACKEND", "local")
    assert save(tmp_path) == "recording.csv"
    assert not remote.objects
    monkeypatch.setattr(config, "STORAGE_BACKEND", "s3")
    assert service.resolve_dataset_file("recording.csv", upload_root=tmp_path).is_file()


def test_remote_roundtrip_cache_concurrency_and_delete(tmp_path: Path, remote: MemoryS3) -> None:
    reference = save(tmp_path)
    assert reference == "s3://test-private-bucket/datasets/recording.csv"
    (tmp_path / "recording.csv").unlink()
    assert service.dataset_file_exists(reference, upload_root=tmp_path)
    with ThreadPoolExecutor(max_workers=4) as pool:
        paths = list(pool.map(lambda _: service.resolve_dataset_file(reference, upload_root=tmp_path), range(8)))
    assert remote.downloads == 1
    assert all(path.read_bytes() == b"id,speed\n1,12\n" for path in paths)
    service.delete_dataset_file(reference, upload_root=tmp_path)
    assert not remote.objects and not paths[0].exists()
    assert not service.dataset_file_exists(reference, upload_root=tmp_path)


def test_source_prefetch_is_bounded_ordered_and_reuses_cache(
    tmp_path: Path, remote: MemoryS3, monkeypatch: pytest.MonkeyPatch,
) -> None:
    references = [f's3://test-private-bucket/datasets/source-{index}.csv' for index in range(6)]
    contents = [f'id,speed\n{index},12\n'.encode() for index in range(6)]
    for index, content in enumerate(contents):
        remote.objects['test-private-bucket', f'datasets/source-{index}.csv'] = content
    original = remote.download_file
    active = maximum = 0
    lock = Lock()

    def download(bucket: str, key: str, filename: str, **kwargs: object) -> None:
        nonlocal active, maximum
        with lock:
            active += 1
            maximum = max(maximum, active)
        try:
            sleep(0.04 if key.endswith('0.csv') else 0.01)
            original(bucket, key, filename, **kwargs)
        finally:
            with lock:
                active -= 1

    monkeypatch.setattr(remote, 'download_file', download)
    paths = service.resolve_dataset_files(references, upload_root=tmp_path)
    assert maximum == 2
    assert [path.read_bytes() for path in paths] == contents
    assert remote.downloads == 6
    assert service.resolve_dataset_files(references, upload_root=tmp_path) == paths
    assert remote.downloads == 6


def test_cached_sources_need_no_s3_connection(tmp_path: Path, remote: MemoryS3, monkeypatch: pytest.MonkeyPatch) -> None:
    references = [f's3://test-private-bucket/datasets/cached-{index}.csv' for index in range(2)]
    for reference in references:
        path = service._cache_path(reference, tmp_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b'cached')

    def unavailable() -> None:
        raise AssertionError('Cached sources must not reconnect to S3')

    monkeypatch.setattr(service, 'get_s3_client', unavailable)
    assert all(path.read_bytes() == b'cached' for path in service.resolve_dataset_files(references, upload_root=tmp_path))


def test_prefetch_failure_preserves_objects_and_removes_partial_downloads(tmp_path: Path, remote: MemoryS3) -> None:
    references = [f's3://test-private-bucket/datasets/denied-{index}.csv' for index in range(3)]
    remote.denied = True
    with pytest.raises(service.StorageUnavailableError):
        service.resolve_dataset_files(references, upload_root=tmp_path)
    assert not list(tmp_path.rglob('*.part'))


@pytest.mark.parametrize("reference", [
    "s3://other-bucket/datasets/a.csv", "s3://test-private-bucket/other/a.csv",
    "s3://test-private-bucket/datasets/../a.csv",
    "s3://test-private-bucket/datasets/a.csv?token=secret", "../outside.csv",
])
def test_rejects_foreign_bucket_prefix_and_traversal(
    tmp_path: Path, remote: MemoryS3, reference: str,
) -> None:
    with pytest.raises(FileNotFoundError):
        service.resolve_dataset_file(reference, upload_root=tmp_path)
    assert remote.downloads == 0


def test_access_denied_is_not_misreported_as_missing(tmp_path: Path, remote: MemoryS3) -> None:
    reference = save(tmp_path)
    remote.denied = True
    for action in (service.resolve_dataset_file, service.dataset_file_exists):
        with pytest.raises(service.StorageUnavailableError):
            action(reference, upload_root=tmp_path)
    assert not list((tmp_path / ".s3-cache").glob("*.part"))


def test_partial_download_is_never_cached_and_retry_can_succeed(
    tmp_path: Path, remote: MemoryS3, monkeypatch: pytest.MonkeyPatch,
) -> None:
    reference = save(tmp_path)
    original = remote.download_file

    def failed(bucket: str, key: str, filename: str, **kwargs: object) -> None:
        Path(filename).write_bytes(b"partial")
        raise OSError("connection lost")

    monkeypatch.setattr(remote, "download_file", failed)
    with pytest.raises(service.StorageUnavailableError):
        service.resolve_dataset_file(reference, upload_root=tmp_path)
    assert not list((tmp_path / ".s3-cache").iterdir())
    monkeypatch.setattr(remote, "download_file", original)
    assert service.resolve_dataset_file(reference, upload_root=tmp_path).read_bytes().startswith(b"id,")


def test_pneuma_upload_stores_s3_reference_and_duplicate_does_not_reupload(
    storage: MemoryDB, remote: MemoryS3, tmp_path: Path,
) -> None:
    result = upload(storage, ("20181024_d1_0830_0900.csv", b"a,b\n1,2\n"))
    assert result.uploaded_count == 1
    reference = storage.sessions[0].file_path
    assert reference.startswith("s3://test-private-bucket/datasets/")
    assert storage.dataset_files[0].data_file_path == reference
    assert not list(tmp_path.glob("20181024-d1/*.csv"))
    again = upload(storage, ("20181024_d1_0830_0900.csv", b"a,b\n1,2\n"))
    assert again.duplicate_count == 1
    assert len(remote.objects) == 1


def test_group_db_flush_failure_removes_only_new_s3_objects(
    storage: MemoryDB, remote: MemoryS3, monkeypatch: pytest.MonkeyPatch,
) -> None:
    upload(storage, ("20181024_d1_0830_0900.csv", b"first"))
    originals = remote.objects.copy()

    def fail() -> None:
        raise RuntimeError("flush failed")

    monkeypatch.setattr(storage, "flush", fail)
    result = upload(storage, ("20181024_d1_0900_0930.csv", b"second"))
    assert result.failed_count == 1
    assert remote.objects == originals


@pytest.mark.parametrize("export_format", ["CSV", "PARQUET"])
def test_normalization_and_export_s3_survive_cache_loss(
    tmp_path: Path, remote: MemoryS3, monkeypatch: pytest.MonkeyPatch, export_format: str,
) -> None:
    monkeypatch.setattr(normalization, "DATASET_UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(preview, "DATASET_UPLOAD_DIR", tmp_path)
    content = (";".join(FIELDS) + "\n1;car;100;10;37;23;12;0;0;0;38;24;13;0;0;60\n").encode()
    reference = save(tmp_path, content)
    (tmp_path / "recording.csv").unlink()
    dataset_id, file_id = uuid4(), uuid4()
    dataset = SimpleNamespace(name="Actual batch")
    source = SimpleNamespace(id=file_id, data_file_path=reference,
        original_filename="20181024_d1_0830_0900.csv", dataset=dataset)
    crud = normalization.crud_dataset
    monkeypatch.setattr(normalization, "_get_normalization_source_file", lambda *a: (dataset, source))
    monkeypatch.setattr(crud, "list_all_file_sessions", lambda *a: [])
    monkeypatch.setattr(crud, "get_dataset_column_mapping", lambda *a: None)
    monkeypatch.setattr(crud, "get_latest_dataset_column_mapping", lambda *a: None)
    monkeypatch.setattr(crud, "get_dataset_latest_file", lambda *a: (dataset, source))
    monkeypatch.setattr(crud, "get_dataset_file", lambda *a: (dataset, source))
    captured = {}

    def create(db: object, **kwargs: object) -> tuple:
        captured.update(kwargs)
        source.data_file_path = kwargs["file_path"]
        return SimpleNamespace(id=file_id), SimpleNamespace(id=1)

    monkeypatch.setattr(crud, "create_normalized_file", create)
    db, user = MagicMock(), SimpleNamespace(id=uuid4())
    normalized = normalization.normalize_dataset_structure_service(db, dataset_id=dataset_id, user=user)
    assert normalized.records_after == 2
    result = normalization.export_normalized_dataset_service(db, dataset_id=dataset_id,
        payload=DatasetExportRequest(staging_id=normalized.staging_id, export_format=export_format), user=user)
    assert result.total_records == 2 and captured["file_path"].startswith("s3://")
    cached = preview.resolve_stored_file_path(captured["file_path"])
    cached.unlink()  # Simulate a new backend/container with no cached export.
    recovered = preview.resolve_stored_file_path(captured["file_path"])
    if export_format == "PARQUET":
        assert pq.read_table(recovered).num_rows == 2
    else:
        assert len(recovered.read_text().splitlines()) == 3


def test_normalization_keeps_session_provenance_and_row_order_after_parallel_downloads(
    tmp_path: Path, remote: MemoryS3, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(normalization, 'DATASET_UPLOAD_DIR', tmp_path)
    dataset_id, file_id = uuid4(), uuid4()
    sessions = []
    for index in range(2):
        key = f'datasets/session-{index}.csv'
        remote.objects['test-private-bucket', key] = (';'.join(FIELDS)
            + f'\n{index + 1};car;100;10;37;23;12;0;0;0;38;24;13;0;0;60\n').encode()
        sessions.append(SimpleNamespace(id=uuid4(), original_filename=f'session-{index}.csv',
                                        file_path=f's3://test-private-bucket/{key}'))
    dataset = SimpleNamespace(name='Parallel test')
    source = SimpleNamespace(id=file_id, data_file_path=None, dataset=dataset)
    monkeypatch.setattr(normalization, '_get_normalization_source_file', lambda *args: (dataset, source))
    monkeypatch.setattr(normalization.crud_dataset, 'list_all_file_sessions', lambda *args: sessions)
    monkeypatch.setattr(normalization.crud_dataset, 'get_dataset_column_mapping', lambda *args: None)
    monkeypatch.setattr(normalization.crud_dataset, 'get_latest_dataset_column_mapping', lambda *args: None)
    result = normalization.normalize_dataset_structure_service(MagicMock(), dataset_id=dataset_id,
                                                              user=SimpleNamespace(id=uuid4()))
    assert result.source_session_ids == [session.id for session in sessions]
    assert (result.records_before, result.records_after) == (2, 4)
    table = pq.read_table(tmp_path / 'staging' / f'{result.staging_id}.parquet')
    assert table.column('track_id').to_pylist() == [1, 1, 2, 2]


def test_partial_upload_is_compensated_and_local_staging_retained(
    tmp_path: Path, remote: MemoryS3, monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Real normalization/export is covered above; exercise compensation separately
    # by failing object storage after a partial write.
    def fail(filename: str, bucket: str, key: str, **kwargs: object) -> None:
        remote.objects[bucket, key] = b"partial"
        raise ClientError({"Error": {"Code": "AccessDenied"}}, "PutObject")

    monkeypatch.setattr(remote, "upload_file", fail)
    with pytest.raises(service.StorageUnavailableError):
        save(tmp_path)
    assert not remote.objects
    assert (tmp_path / "recording.csv").is_file()
