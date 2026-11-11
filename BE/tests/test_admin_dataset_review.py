"""Admin review endpoints expose session lists and bounded CSV previews."""

from datetime import date, datetime
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints import admin
from app.core.deps import get_current_user
from app.database.database import get_db
from app.models.dataset import Dataset, DatasetVersion, RecordingSession
from app.services import dataset_preview_service, dataset_review_service


def _admin_review_app(tmp_path: Path, monkeypatch):
    dataset_id, version_id, session_id = uuid4(), uuid4(), uuid4()
    dataset = Dataset(
        id=dataset_id, name="20181024-d1", source="pNEUMA",
        location_name="Athens, Greece", drone_id="d1",
        recording_date=date(2018, 10, 24),
    )
    version = DatasetVersion(
        id=version_id, dataset_id=dataset_id, version_tag="v1.0",
        approval_status="SUBMITTED", created_at=datetime.now().astimezone(),
    )
    session = RecordingSession(
        id=session_id, dataset_id=dataset_id,
        original_filename="20181024_d1_0830_0900.csv",
        drone_id="d1", recording_date=date(2018, 10, 24),
        scheduled_start=datetime.fromisoformat("2018-10-24T08:30:00+03:00"),
        scheduled_end=datetime.fromisoformat("2018-10-24T09:00:00+03:00"),
        file_path="20181024-d1/recording.csv", file_size=20,
        checksum="a" * 64, upload_status="UPLOADED",
    )
    path = tmp_path / session.file_path
    path.parent.mkdir(parents=True)
    path.write_text("id,flow\n1,100\n", encoding="utf-8")
    monkeypatch.setattr(dataset_preview_service, "DATASET_UPLOAD_DIR", tmp_path)
    repo = dataset_review_service.crud_dataset
    monkeypatch.setattr(repo, "get_dataset_by_id", lambda db, key: dataset if key == dataset_id else None)
    monkeypatch.setattr(repo, "get_dataset_version", lambda db, did, vid:
                        (dataset, version) if (did, vid) == (dataset_id, version_id) else None)
    monkeypatch.setattr(repo, "get_version_session_counts", lambda db, ids: {version_id: 1})
    monkeypatch.setattr(repo, "list_version_sessions", lambda db, vid, page, page_size:
                        ([session], 1) if vid == version_id else ([], 0))
    monkeypatch.setattr(repo, "get_version_session", lambda db, vid, sid:
                        session if (vid, sid) == (version_id, session_id) else None)

    app = FastAPI()
    app.include_router(
        admin.router,
        prefix="/api/v1/admin",
        tags=["Administration"],
    )
    app.dependency_overrides[get_db] = lambda: object()
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id=uuid4(), role_id="admin",
    )
    return app, dataset, version, session


def test_admin_can_list_sessions_and_preview_session_csv(
    tmp_path: Path, monkeypatch,
) -> None:
    app, dataset, version, session = _admin_review_app(tmp_path, monkeypatch)
    base = f"/api/v1/admin/datasets/{dataset.id}/versions/{version.id}"
    with TestClient(app) as client:
        sessions = client.get(f"{base}/sessions")
        preview = client.get(f"{base}/sessions/{session.id}/preview",
                             params={"representation": "raw"})

    assert sessions.status_code == 200, sessions.text
    assert sessions.json()["sessions"][0]["session_id"] == str(session.id)
    assert preview.status_code == 200, preview.text
    assert preview.json()["rows"] == [{"id": "1", "flow": "100"}]


def test_admin_can_review_sessions_from_normalized_version_provenance(
    tmp_path: Path, monkeypatch,
) -> None:
    app, dataset, version, session = _admin_review_app(tmp_path, monkeypatch)
    repo = dataset_review_service.crud_dataset
    history = SimpleNamespace(parameters={"source_session_ids": [str(session.id)]})
    monkeypatch.setattr(repo, "list_version_sessions", lambda db, vid, page, page_size: ([], 0))
    monkeypatch.setattr(repo, "get_version_session", lambda db, vid, sid: None)
    monkeypatch.setattr(repo, "get_cleaning_history_by_version", lambda db, vid: history)
    monkeypatch.setattr(
        repo, "list_dataset_sessions_by_ids",
        lambda db, did, ids, page, page_size: ([session], 1),
    )
    monkeypatch.setattr(
        repo, "get_dataset_session_by_id",
        lambda db, did, sid: session if (did, sid) == (dataset.id, session.id) else None,
    )
    base = f"/api/v1/admin/datasets/{dataset.id}/versions/{version.id}/sessions"

    with TestClient(app) as client:
        sessions = client.get(base)
        preview = client.get(f"{base}/{session.id}/preview",
                             params={"representation": "raw"})

    assert sessions.status_code == 200, sessions.text
    assert sessions.json()["total"] == 1
    assert sessions.json()["sessions"][0]["session_id"] == str(session.id)
    assert preview.status_code == 200, preview.text
    assert preview.json()["rows"][0] == {"id": "1", "flow": "100"}


def test_admin_session_review_endpoints_are_in_swagger(
    tmp_path: Path, monkeypatch,
) -> None:
    app, _, _, _ = _admin_review_app(tmp_path, monkeypatch)
    paths = app.openapi()["paths"]
    base = "/api/v1/admin/datasets/{dataset_id}/versions/{id}"
    assert f"{base}/sessions" in paths
    assert f"{base}/sessions/{{session_id}}/preview" in paths
    assert "/api/v1/admin/datasets" in paths
    assert f"{base}/preview" not in paths
    assert base not in paths
    assert f"{base}/sessions/{{session_id}}" not in paths
    assert paths[f"{base}/sessions/{{session_id}}/preview"]["get"]["tags"] == [
        "Administration",
    ]
    assert paths[f"{base}/sessions"]["get"]["tags"] == ["Administration"]
    assert "Admin Dataset Review" not in {
        tag for path in paths.values() for operation in path.values()
        for tag in operation.get("tags", [])
    }
