from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from app.schemas.dataset import DatasetUploadMetadata
from app.services import dataset_service
from app.services.dataset_service import DatasetConflictError, create_dataset_upload


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
