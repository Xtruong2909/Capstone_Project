from datetime import UTC, date, datetime
from types import SimpleNamespace
from uuid import uuid4

from app.models.dataset import DatasetFile, RecordingSession
from app.services import dataset_file_service
from app.services.dataset_file_service import (
    get_file_recording_sessions,
    get_file_source_context,
)


class FakeQuery:
    def __init__(self, *, result: object = None, rows: list[object] | None = None) -> None:
        self.result = result
        self.rows = rows or []

    def filter(self, *_args: object) -> "FakeQuery":
        return self

    def all(self) -> list[object]:
        return self.rows

    def first(self) -> object:
        return self.result


def test_file_response_identifies_its_batch(monkeypatch) -> None:
    group_id = uuid4()
    dataset_file = SimpleNamespace(
        id=uuid4(), dataset_id=uuid4(),
        dataset=SimpleNamespace(
            name="20181101-d3", group_id=group_id, group=SimpleNamespace(name="Batch 3"),
            code="real-code", source="Uploaded source", location_name="Uploaded location",
            description="Real description", capture_date=None, recording_date=date(2018, 11, 1),
        ),
         file_format="PARQUET", file_size_bytes=100, total_records=20,
         original_filename=None, data_file_path="/private/storage/export.parquet",
        approval_status="APPROVED", submitted_by=None, submitted_at=None,
        approved_by=None, approval_note="Ok", created_at=datetime.now(UTC),
    )
    monkeypatch.setattr(dataset_file_service.crud_dataset, "get_cleaning_history_by_file", lambda *args: None)
    monkeypatch.setattr(dataset_file_service, "get_file_source_context", lambda *args, **kwargs: (None, []))
    response = dataset_file_service.build_dataset_file_item(None, dataset_file)
    assert response.group_id == group_id
    assert response.group_name == "Batch 3"
    assert response.code == "real-code"
    assert response.source == "Uploaded source"
    assert response.location_name == "Uploaded location"
    assert response.description == "Real description"
    assert response.recording_date == date(2018, 11, 1)
    assert response.capture_date is None
    assert response.filename == "export.parquet"
    assert response.total_records_known is True
    assert response.original_filename is None
    dataset_file.dataset = SimpleNamespace(name="Legacy")
    legacy = dataset_file_service.build_dataset_file_item(None, dataset_file)
    assert legacy.group_id is None and legacy.group_name is None
    assert legacy.code is None and legacy.source is None and legacy.location_name is None
    dataset_file.data_file_path = None
    dataset_file.parquet_file_path = r"C:\private\export-windows.parquet"
    windows = dataset_file_service.build_dataset_file_item(None, dataset_file)
    assert windows.filename == "export-windows.parquet"


def test_upload_zero_count_is_unknown_but_empty_export_is_known(monkeypatch) -> None:
    dataset_file = SimpleNamespace(
        id=uuid4(), dataset_id=uuid4(), dataset=None,
        file_format="CSV", file_size_bytes=100, total_records=0,
        data_file_path="source.csv", approval_status="PENDING", submitted_by=None,
        submitted_at=None, approved_by=None, approval_note=None, created_at=datetime.now(UTC),
    )
    history = None
    monkeypatch.setattr(dataset_file_service.crud_dataset, "get_cleaning_history_by_file", lambda *args: history)
    monkeypatch.setattr(dataset_file_service, "get_file_source_context", lambda *args, **kwargs: (None, []))
    response = dataset_file_service.build_dataset_file_item(None, dataset_file)
    assert response.total_records == 0
    assert response.total_records_known is False
    # A previous export's history must not make a newly uploaded CSV count known.
    history = SimpleNamespace(parameters={})
    assert dataset_file_service.build_dataset_file_item(None, dataset_file).total_records_known is False
    dataset_file.file_format = "PARQUET"
    dataset_file.data_file_path = "empty-export.parquet"
    response = dataset_file_service.build_dataset_file_item(None, dataset_file)
    assert response.total_records == 0
    assert response.total_records_known is True


class FakeDb:
    def __init__(self, source_file: object, sessions: list[object]) -> None:
        self.source_file = source_file
        self.sessions = sessions

    def query(self, model: object) -> FakeQuery:
        if model is RecordingSession:
            return FakeQuery(rows=self.sessions)
        if model is DatasetFile:
            return FakeQuery(result=self.source_file)
        raise AssertionError(f"Unexpected model: {model}")


def test_normalized_file_resolves_its_source_recording_sessions() -> None:
    dataset_id = uuid4()
    raw_file_id = uuid4()
    session_id = uuid4()
    start = datetime(2018, 10, 24, 8, 30, tzinfo=UTC)
    session = SimpleNamespace(
        id=session_id,
        dataset_id=dataset_id,
        original_filename="20181024_d1_0830_0900.csv",
        drone_id="d1",
        recording_date=date(2018, 10, 24),
        scheduled_start=start,
        scheduled_end=datetime(2018, 10, 24, 9, 0, tzinfo=UTC),
        file_size=1234,
        checksum="a" * 64,
        upload_status="UPLOADED",
    )
    normalized_file = SimpleNamespace(id=uuid4(), dataset_id=dataset_id)
    source_file = SimpleNamespace(id=raw_file_id, )
    history = SimpleNamespace(parameters={
        "source_file_id": str(raw_file_id),
        "source_session_ids": [str(session_id)],
    })

    source_id, source_sessions = get_file_source_context(
        FakeDb(source_file, [session]), normalized_file, history=history,
    )

    assert source_id == raw_file_id
    assert len(source_sessions) == 1
    assert source_sessions[0].session_id == session_id
    assert source_sessions[0].original_filename == "20181024_d1_0830_0900.csv"


def test_exported_file_resolves_only_its_own_dataset_sessions(monkeypatch) -> None:
    dataset_id = uuid4()
    source_file_id = uuid4()
    own_session_id = uuid4()
    foreign_session_id = uuid4()
    dataset_file = SimpleNamespace(id=uuid4(), dataset_id=dataset_id)
    source_file = SimpleNamespace(id=source_file_id, )
    start = datetime(2018, 10, 24, 8, 30, tzinfo=UTC)
    own_session = SimpleNamespace(
        id=own_session_id, dataset_id=dataset_id,
        original_filename="20181024_d1_0830_0900.csv", drone_id="d1",
        recording_date=date(2018, 10, 24), scheduled_start=start,
        scheduled_end=datetime(2018, 10, 24, 9, 0, tzinfo=UTC),
        file_size=1234, checksum="a" * 64, upload_status="UPLOADED",
    )
    history = SimpleNamespace(parameters={
        "source_file_id": str(source_file_id),
        "source_session_ids": [str(own_session_id), str(foreign_session_id)],
    })
    db = FakeDb(source_file, [own_session])
    monkeypatch.setattr(dataset_file_service.crud_dataset,
                        "list_all_file_sessions", lambda db, file_id: [])
    monkeypatch.setattr(dataset_file_service.crud_dataset,
                        "get_cleaning_history_by_file", lambda db, file_id: history)
    monkeypatch.setattr(dataset_file_service.crud_dataset,
                        "list_dataset_sessions_by_ids", lambda db, dataset_id, ids, page, page_size: (
                            [own_session] if own_session_id in ids else [], 1,
                        ))

    sessions = get_file_recording_sessions(db, dataset_file)

    assert [session.id for session in sessions] == [own_session_id]
