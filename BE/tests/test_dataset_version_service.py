from datetime import UTC, date, datetime
from types import SimpleNamespace
from uuid import uuid4

from app.models.dataset import DatasetVersion, RecordingSession
from app.services.dataset_version_service import get_version_source_context


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


class FakeDb:
    def __init__(self, source_version: object, sessions: list[object]) -> None:
        self.source_version = source_version
        self.sessions = sessions

    def query(self, model: object) -> FakeQuery:
        if model is RecordingSession:
            return FakeQuery(rows=self.sessions)
        if model is DatasetVersion:
            return FakeQuery(result=self.source_version)
        raise AssertionError(f"Unexpected model: {model}")


def test_normalized_version_resolves_its_source_recording_sessions() -> None:
    dataset_id = uuid4()
    raw_version_id = uuid4()
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
    normalized_version = SimpleNamespace(id=uuid4(), dataset_id=dataset_id)
    source_version = SimpleNamespace(id=raw_version_id, version_tag="v1.0")
    history = SimpleNamespace(parameters={
        "source_version_id": str(raw_version_id),
        "source_session_ids": [str(session_id)],
    })

    source_id, source_tag, source_sessions = get_version_source_context(
        FakeDb(source_version, [session]), normalized_version, history=history,
    )

    assert source_id == raw_version_id
    assert source_tag == "v1.0"
    assert len(source_sessions) == 1
    assert source_sessions[0].session_id == session_id
    assert source_sessions[0].original_filename == "20181024_d1_0830_0900.csv"
