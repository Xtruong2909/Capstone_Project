"""pNEUMA upload behavior without touching the real database or upload directory."""

from datetime import UTC, date, datetime
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints import datasets as dataset_endpoint
from app.core.deps import require_data_engineer
from app.database.database import get_db
from app.models.dataset import Dataset, DatasetVersion, RecordingSession
from app.services import pneuma_upload_service as service


class MemoryDB:
    def __init__(self) -> None:
        self.datasets: dict[str, Dataset] = {}
        self.versions: list[DatasetVersion] = []
        self.sessions: list[RecordingSession] = []
        self.links: dict[object, list[object]] = {}

    def add(self, item: object) -> None:
        if isinstance(item, Dataset):
            self.datasets[item.name] = item
        elif isinstance(item, DatasetVersion):
            self.versions.append(item)
        elif isinstance(item, RecordingSession):
            self.sessions.append(item)

    def flush(self) -> None:
        pass

    def commit(self) -> None:
        pass

    def rollback(self) -> None:
        pass


@pytest.fixture
def storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> MemoryDB:
    db = MemoryDB()
    monkeypatch.setattr(service, "DATASET_UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(service, "record_audit_event", lambda **kwargs: None)
    crud = service.crud_dataset
    monkeypatch.setattr(crud, "lock_dataset_upload", lambda *args: None)
    monkeypatch.setattr(crud, "get_dataset_by_name", lambda _db, name: db.datasets.get(name))
    monkeypatch.setattr(crud, "get_recording_sessions",
                        lambda _db, dataset_id: [s for s in db.sessions if s.dataset_id == dataset_id])
    monkeypatch.setattr(crud, "get_next_upload_version", lambda _db, dataset_id: (
        1 + sum(v.dataset_id == dataset_id for v in db.versions),
        f"v{1 + sum(v.dataset_id == dataset_id for v in db.versions)}.0",
    ))
    monkeypatch.setattr(crud, "add_recording_session", lambda _db, item: db.add(item))
    monkeypatch.setattr(crud, "link_version_sessions",
                        lambda _db, version_id, session_ids: db.links.update({version_id: session_ids}))
    monkeypatch.setattr(crud, "get_dataset_latest_version",
                        lambda _db, dataset_id: next(
                            ((next(d for d in db.datasets.values() if d.id == dataset_id), v)
                             for v in reversed(db.versions)
                             if v.dataset_id == dataset_id), None,
                        ))
    return db


def upload(db: MemoryDB, *files: tuple[str, bytes]):
    return service.upload_pneuma_batch(
        db, [(name, BytesIO(content)) for name, content in files], creator_id=uuid4(),
    )


def test_single_file_auto_creates_dataset_session_and_version(storage: MemoryDB) -> None:
    result = upload(storage, ("20181024_d1_0830_0900.csv", b"a,b\n1,2\n"))
    assert (result.total_files, result.uploaded_count, result.failed_count) == (1, 1, 0)
    assert result.datasets[0].name == "20181024-d1"
    assert result.datasets[0].session_count == 1
    assert storage.datasets["20181024-d1"].source == "pNEUMA"
    assert storage.sessions[0].scheduled_start.strftime("%Y-%m-%d %H:%M") == "2018-10-24 08:30"
    assert (service.DATASET_UPLOAD_DIR / storage.sessions[0].file_path).read_bytes() == b"a,b\n1,2\n"


def test_batch_groups_by_date_and_drone_with_one_version_each(storage: MemoryDB) -> None:
    result = upload(
        storage,
        ("20181024_d1_0830_0900.csv", b"one"),
        ("20181024_d1_0900_0930.csv", b"two"),
        ("20181024_d2_0830_0900.csv", b"three"),
        ("20181101_d1_0830_0900.csv", b"four"),
    )
    assert result.uploaded_count == 4
    assert {group.name: group.session_count for group in result.datasets} == {
        "20181024-d1": 2, "20181024-d2": 1, "20181101-d1": 1,
    }
    assert len(storage.versions) == 3
    assert storage.versions[0].data_file_path is None
    assert len(storage.links[result.datasets[0].version_id]) == 2


def test_duplicate_conflict_and_supplemental_version(storage: MemoryDB) -> None:
    first = upload(storage, ("20181024_d1_0830_0900.csv", b"one"))
    again = upload(storage, ("20181024_d1_0830_0900.csv", b"one"))
    conflict = upload(storage, ("20181024_d1_0830_0900.csv", b"changed"))
    supplement = upload(storage, ("20181024_d1_0900_0930.csv", b"two"))
    assert again.duplicate_count == 1
    assert again.files[0].session_id == first.files[0].session_id
    assert conflict.files[0].status == "CONFLICT"
    assert conflict.failed_count == 1
    assert supplement.uploaded_count == 1
    assert supplement.datasets[0].session_count == 2
    assert len(storage.versions) == 2
    assert storage.versions[0].id != storage.versions[1].id
    assert storage.versions[1].data_file_path is None
    assert storage.versions[1].file_size_bytes == len(b"one") + len(b"two")
    assert len(storage.links[storage.versions[1].id]) == 2


def test_invalid_file_does_not_block_valid_file(storage: MemoryDB) -> None:
    result = upload(storage, ("../invalid.csv", b"bad"),
                    ("20181024_d1_0830_0900.csv", b"good"))
    assert (result.uploaded_count, result.failed_count) == (1, 1)
    assert [item.status for item in result.files] == ["ERROR", "UPLOADED"]
    assert len(storage.sessions) == 1


def test_metadata_conflict_and_size_limit(storage: MemoryDB, monkeypatch: pytest.MonkeyPatch) -> None:
    filename = "20181024_d1_0830_0900.csv"
    bad_metadata = service.upload_pneuma_batch(
        storage, [(filename, BytesIO(b"one"))], creator_id=uuid4(),
        capture_date=date(2018, 10, 25),
    )
    monkeypatch.setattr(service, "MAX_DATASET_UPLOAD_BYTES", 2)
    oversized = upload(storage, (filename, b"large"))
    assert bad_metadata.files[0].status == "ERROR"
    assert oversized.files[0].status == "ERROR"
    assert not storage.sessions


def test_optional_metadata_is_saved_and_checked_on_append(storage: MemoryDB) -> None:
    first = service.upload_pneuma_batch(
        storage, [("20181024_d1_0830_0900.csv", BytesIO(b"one"))],
        creator_id=uuid4(), source="UAV", location_name="Athens, Greece",
        description="Drone morning session", capture_date=date(2018, 10, 24),
    )
    dataset = storage.datasets["20181024-d1"]
    assert first.uploaded_count == 1
    assert (dataset.source, dataset.location_name, dataset.description) == (
        "UAV", "Athens, Greece", "Drone morning session",
    )
    append = upload(storage, ("20181024_d1_0900_0930.csv", b"two"))
    assert append.uploaded_count == 1
    mismatch = service.upload_pneuma_batch(
        storage, [("20181024_d1_0930_1000.csv", BytesIO(b"three"))],
        creator_id=uuid4(), location_name="Elsewhere",
    )
    assert mismatch.files[0].status == "ERROR"
    assert len(storage.sessions) == 2


def test_prepared_batch_keeps_metadata_for_background_upload(storage: MemoryDB) -> None:
    prepared = service.prepare_pneuma_batch(
        [("20181024_d2_0830_0900.csv", BytesIO(b"one"))],
        source="UAV", location_name="Athens, Greece",
        description="Second drone",
    )
    result = service.finish_pneuma_batch(storage, prepared, uuid4())
    assert result.uploaded_count == 1
    assert storage.datasets["20181024-d2"].description == "Second drone"
    assert storage.datasets["20181024-d2"].source == "UAV"


def test_batch_budget_rejects_only_excess_file(storage: MemoryDB,
                                               monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(service, "MAX_DATASET_UPLOAD_BATCH_BYTES", 5)
    result = upload(storage,
                    ("20181024_d1_0830_0900.csv", b"one"),
                    ("20181024_d2_0830_0900.csv", b"four"))
    assert [item.status for item in result.files] == ["UPLOADED", "ERROR"]
    assert len(storage.sessions) == 1


def test_supplied_metadata_is_checked_per_file(storage: MemoryDB) -> None:
    result = service.upload_pneuma_batch(storage, [
        ("20181024_d1_0830_0900.csv", BytesIO(b"one")),
        ("20181024_d2_0830_0900.csv", BytesIO(b"two")),
    ], creator_id=uuid4(), name="20181024-d1")
    assert [item.status for item in result.files] == ["UPLOADED", "ERROR"]
    assert list(storage.datasets) == ["20181024-d1"]


@pytest.mark.parametrize("filename", [
    "20180230_d1_0830_0900.csv", "20181024_d1_2500_2600.csv",
    "20181024_d1_0900_0830.csv", "20181024_d1_0830_0900.csv/../x.csv",
])
def test_invalid_recording_filename(filename: str) -> None:
    with pytest.raises(ValueError):
        service.parse_recording_filename(filename)


def test_api_accepts_repeated_files_without_metadata(storage: MemoryDB) -> None:
    app = FastAPI()
    app.include_router(dataset_endpoint.router, prefix="/api/v1/datasets")
    app.include_router(
        dataset_endpoint.upload_router,
        prefix="/api/v1/datasets",
        tags=["pNEUMA Dataset Upload Bước 1"],
    )
    app.dependency_overrides[get_db] = lambda: storage
    app.dependency_overrides[require_data_engineer] = lambda: type("UserStub", (), {"id": uuid4()})()
    with TestClient(app) as client:
        response = client.post("/api/v1/datasets/upload", files=[
            ("files", ("20181024_d1_0830_0900.csv", b"one", "text/csv")),
            ("files", ("20181024_d2_0830_0900.csv", b"two", "text/csv")),
        ])
    assert response.status_code == 201, response.text
    assert response.json()["uploaded_count"] == 2
    assert len(response.json()["datasets"]) == 2


def test_swagger_shows_files_and_optional_metadata_without_name() -> None:
    app = FastAPI()
    app.include_router(dataset_endpoint.router, prefix="/api/v1/datasets")
    app.include_router(
        dataset_endpoint.upload_router,
        prefix="/api/v1/datasets",
        tags=["pNEUMA Dataset Upload Bước 1"],
    )
    paths = app.openapi()["paths"]
    assert paths["/api/v1/datasets"]["get"]["tags"] == ["pNEUMA Dataset Upload Bước 1"]
    assert paths["/api/v1/datasets/upload"]["post"]["tags"] == ["pNEUMA Dataset Upload Bước 1"]
    assert paths["/api/v1/datasets/upload/jobs/{job_id}"]["get"]["tags"] == [
        "pNEUMA Dataset Upload Bước 1",
    ]
    schema = paths["/api/v1/datasets/upload"]["post"]
    assert schema["tags"] == ["pNEUMA Dataset Upload Bước 1"]
    upload_schema = schema["requestBody"]["content"]["multipart/form-data"]["schema"]
    assert list(upload_schema["properties"]) == [
        "files", "source", "location_name", "description", "capture_date",
    ]
    assert upload_schema["required"] == ["files"]


def test_api_accepts_optional_metadata(storage: MemoryDB) -> None:
    app = FastAPI()
    app.include_router(dataset_endpoint.router, prefix="/api/v1/datasets")
    app.include_router(
        dataset_endpoint.upload_router,
        prefix="/api/v1/datasets",
        tags=["pNEUMA Dataset Upload Bước 1"],
    )
    app.dependency_overrides[get_db] = lambda: storage
    app.dependency_overrides[require_data_engineer] = lambda: type("UserStub", (), {"id": uuid4()})()
    with TestClient(app) as client:
        response = client.post("/api/v1/datasets/upload", data={
            "source": "UAV", "location_name": "Athens, Greece",
            "description": "Morning recordings", "capture_date": "2018-10-24",
        }, files={"files": ("20181024_d1_0830_0900.csv", b"one", "text/csv")})
    assert response.status_code == 201, response.text
    assert response.json()["uploaded_count"] == 1
    assert storage.datasets["20181024-d1"].description == "Morning recordings"


def test_api_has_no_fixed_file_count_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    app = FastAPI()
    app.include_router(dataset_endpoint.router, prefix="/api/v1/datasets")
    app.include_router(
        dataset_endpoint.upload_router,
        prefix="/api/v1/datasets",
        tags=["pNEUMA Dataset Upload Bước 1"],
    )
    app.dependency_overrides[get_db] = lambda: object()
    app.dependency_overrides[require_data_engineer] = lambda: type("UserStub", (), {"id": uuid4()})()
    observed = []

    def fake_upload(db, files, **kwargs):
        observed.append(len(files))
        return service.DatasetBatchUploadResponse(
            total_files=len(files), uploaded_count=0, duplicate_count=0,
            failed_count=0, datasets=[], files=[],
        )

    monkeypatch.setattr(dataset_endpoint, "upload_pneuma_batch", fake_upload)
    files = [("files", ("20181024_d1_0830_0900.csv", b"x", "text/csv"))] * 1001
    with TestClient(app) as client:
        response = client.post("/api/v1/datasets/upload", files=files)
    assert response.status_code == 201, response.text
    assert observed == [1001]


def test_legacy_single_file_request_keeps_flat_response(monkeypatch: pytest.MonkeyPatch) -> None:
    app = FastAPI()
    app.include_router(dataset_endpoint.router, prefix="/api/v1/datasets")
    app.include_router(
        dataset_endpoint.upload_router,
        prefix="/api/v1/datasets",
        tags=["pNEUMA Dataset Upload Bước 1"],
    )
    app.dependency_overrides[get_db] = lambda: object()
    app.dependency_overrides[require_data_engineer] = lambda: type("UserStub", (), {"id": uuid4()})()
    dataset_id, version_id = uuid4(), uuid4()
    dataset = SimpleNamespace(
        id=dataset_id, name="Legacy UAV", code="LEGACY_UAV", source="UAV",
        description=None, capture_date=None, location_name="Athens",
    )
    version = SimpleNamespace(
        id=version_id, version_tag="v1.0", file_format="CSV",
        original_filename="legacy.csv", file_size_bytes=3,
        approval_status="PENDING", created_at=datetime.now(UTC),
    )
    monkeypatch.setattr(dataset_endpoint, "create_dataset_upload",
                        lambda *args, **kwargs: (dataset, version))
    with TestClient(app) as client:
        response = client.post("/api/v1/datasets/upload", data={
            "name": "Legacy UAV", "source": "UAV", "location_name": "Athens",
        }, files={"file": ("legacy.csv", b"abc", "text/csv")})
    assert response.status_code == 201, response.text
    assert response.json()["dataset_id"] == str(dataset_id)
    assert response.json()["original_filename"] == "legacy.csv"
    assert "uploaded_count" not in response.json()


def test_large_batch_returns_job_and_job_status(monkeypatch: pytest.MonkeyPatch) -> None:
    app = FastAPI()
    app.include_router(dataset_endpoint.router, prefix="/api/v1/datasets")
    app.include_router(
        dataset_endpoint.upload_router,
        prefix="/api/v1/datasets",
        tags=["pNEUMA Dataset Upload Bước 1"],
    )
    user_id = uuid4()
    app.dependency_overrides[get_db] = lambda: object()
    app.dependency_overrides[require_data_engineer] = lambda: type("UserStub", (), {"id": user_id})()
    monkeypatch.setattr(dataset_endpoint, "ASYNC_DATASET_UPLOAD_THRESHOLD_BYTES", 1)
    prepared = service.PreparedBatch(total_files=1, results=[], groups={}, staged_files=[])
    monkeypatch.setattr(dataset_endpoint, "prepare_pneuma_batch", lambda *args: prepared)
    jobs = {}

    def create_job(db, job_id, creator_id, total_files):
        jobs[job_id] = SimpleNamespace(
            id=job_id, created_by=creator_id, status="PENDING", total_files=total_files,
            processed_files=0, result=None, error_message=None,
        )

    def run_job(job_id, prepared, creator_id, ip_address):
        jobs[job_id].status = "COMPLETED"
        jobs[job_id].processed_files = prepared.total_files

    monkeypatch.setattr(dataset_endpoint.crud_dataset, "create_upload_job", create_job)
    monkeypatch.setattr(dataset_endpoint.crud_dataset, "get_upload_job",
                        lambda db, job_id: jobs.get(job_id))
    monkeypatch.setattr(dataset_endpoint, "run_pneuma_upload_job", run_job)
    with TestClient(app) as client:
        started = client.post("/api/v1/datasets/upload", files={
            "files": ("20181024_d1_0830_0900.csv", b"one", "text/csv"),
        })
        assert started.status_code == 202, started.text
        status = client.get(f"/api/v1/datasets/upload/jobs/{started.json()['job_id']}")
    assert status.status_code == 200, status.text
    assert status.json()["status"] == "COMPLETED"
    assert status.json()["processed_files"] == 1
