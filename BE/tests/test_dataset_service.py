import errno
import os
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from app.schemas.dataset import DatasetUploadMetadata
from app.services import dataset_service
from app.services.dataset_service import DatasetConflictError, create_dataset_upload


@pytest.mark.parametrize("fallback_after_partial", [False, True])
def test_kernel_copy_handles_short_writes_and_partial_fallback(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, fallback_after_partial: bool,
) -> None:
    payload = b"0123456789abcdefghijklmnopqrstuvwxyz"
    source_path = tmp_path / "source.csv"
    source_path.write_bytes(payload)
    monkeypatch.setattr(dataset_service, "UPLOAD_CHUNK_SIZE", 4)
    monkeypatch.setattr(dataset_service, "SENDFILE_CHUNK_SIZE", 7)
    calls = 0
    with source_path.open("rb") as source, (tmp_path / "destination.csv").open("xb") as target:
        def fake_sendfile(out_fd: int, in_fd: int, offset: int, count: int) -> int:
            nonlocal calls
            calls += 1
            if fallback_after_partial and calls == 2:
                raise OSError(errno.EINVAL, "unsupported filesystem")
            source.seek(offset)
            return os.write(out_fd, source.read(min(count, 3)))

        monkeypatch.setattr(os, "sendfile", fake_sendfile, raising=False)
        assert dataset_service._copy_upload(source, target, len(payload)) == len(payload)
    assert (tmp_path / "destination.csv").read_bytes() == payload
    assert calls >= 2


def test_portable_copy_keeps_current_stream_position(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delattr(os, "sendfile", raising=False)
    source = BytesIO(b"skip,payload")
    source.seek(5)
    size = dataset_service._remaining_upload_bytes(source)
    assert size == 7
    assert source.tell() == 5
    with (tmp_path / "copy.csv").open("xb") as target:
        assert dataset_service._copy_upload(source, target, size) == 7
    assert (tmp_path / "copy.csv").read_bytes() == b"payload"


def test_oversize_is_rejected_before_destination_is_created(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(dataset_service, "DATASET_UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(dataset_service, "MAX_DATASET_UPLOAD_BYTES", 4)
    monkeypatch.setattr(dataset_service.crud_dataset, "get_dataset_by_name", lambda *a: None)
    with pytest.raises(dataset_service.DatasetFileTooLargeError):
        create_dataset_upload(
            FakeSession(), metadata=DatasetUploadMetadata(
                name="large file", source="UAV", location_name="Athens",
            ), file_stream=BytesIO(b"12345"), filename="large.csv",
            creator_id=uuid4(), ip_address=None,
        )
    assert list(tmp_path.iterdir()) == []


class FakeSession:
    def __init__(self) -> None:
        self.was_rolled_back = False

    def rollback(self) -> None:
        self.was_rolled_back = True


def test_duplicate_dataset_name_is_rejected_before_file_is_written(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(dataset_service, "DATASET_UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(
        dataset_service.crud_dataset,
        "get_dataset_by_name",
        lambda db, name: object(),
    )
    metadata = DatasetUploadMetadata(
        name="pNeuma",
        source="UAV",
        location_name="Hy lap",
    )

    with pytest.raises(DatasetConflictError, match="Tên dataset 'pNeuma' đã tồn tại"):
        create_dataset_upload(
            FakeSession(),
            metadata=metadata,
            file_stream=BytesIO(b"data"),
            filename="traffic.csv",
            creator_id=uuid4(),
            ip_address=None,
        )

    assert list(tmp_path.rglob("*")) == []


def test_concurrent_duplicate_name_returns_clear_conflict(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = FakeSession()

    def raise_duplicate_name(*args: object, **kwargs: object) -> None:
        raise IntegrityError(
            "INSERT",
            {},
            SimpleNamespace(diag=SimpleNamespace(constraint_name="datasets_name_key")),
        )

    monkeypatch.setattr(dataset_service, "DATASET_UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(
        dataset_service.crud_dataset,
        "get_dataset_by_name",
        lambda db, name: None,
    )
    monkeypatch.setattr(
        dataset_service.crud_dataset,
        "create_dataset_version",
        raise_duplicate_name,
    )
    metadata = DatasetUploadMetadata(
        name="pNeuma",
        source="UAV",
        location_name="Hy lap",
    )

    with pytest.raises(DatasetConflictError, match="Tên dataset 'pNeuma' đã tồn tại"):
        create_dataset_upload(
            session,
            metadata=metadata,
            file_stream=BytesIO(b"data"),
            filename="traffic.csv",
            creator_id=uuid4(),
            ip_address=None,
        )

    assert session.was_rolled_back
    assert list(tmp_path.rglob("*.csv")) == []
