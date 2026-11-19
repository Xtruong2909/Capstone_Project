"""Dataset review and bounded raw Recording Session previews."""

from datetime import date, datetime
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.api.v1.endpoints import dataset_access as access_endpoints
from app.api.v1.endpoints import datasets as endpoints
from app.core import dataset_access
from app.core.deps import get_current_user
from app.database.database import get_db
from app.models.dataset import Dataset, DatasetGroup, DatasetVersion, RecordingSession
from app.services import dataset_consumer_service, dataset_preview_service, dataset_review_service


@pytest.fixture
def review(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    dataset_id, version_id, session_id = uuid4(), uuid4(), uuid4()
    group_id = uuid4()
    dataset = Dataset(
        id=dataset_id, name="20181024-d1", source="pNEUMA",
        location_name="Athens, Greece", drone_id="d1",
        recording_date=date(2018, 10, 24), group_id=group_id,
    )
    dataset.group = DatasetGroup(id=group_id, name="Batch 01", source="pneuma", drone_id="d1")
    version = DatasetVersion(
        id=version_id, dataset_id=dataset_id, version_tag="v1.0",
        approval_status="PENDING",
    )
    session = RecordingSession(
        id=session_id, dataset_id=dataset_id,
        original_filename="20181024_d1_0830_0900.csv",
        drone_id="d1", recording_date=date(2018, 10, 24),
        scheduled_start=datetime.fromisoformat("2018-10-24T08:30:00+03:00"),
        scheduled_end=datetime.fromisoformat("2018-10-24T09:00:00+03:00"),
        file_path="20181024-d1/recording.csv", file_size=27,
        checksum="a" * 64, upload_status="UPLOADED",
    )
    path = tmp_path / session.file_path
    path.parent.mkdir(parents=True)
    path.write_text("id,flow\n1,100\n2,110\n3,120\n", encoding="utf-8")
    monkeypatch.setattr(dataset_preview_service, "DATASET_UPLOAD_DIR", tmp_path)
    repo = dataset_review_service.crud_dataset
    monkeypatch.setattr(repo, "list_uploaded_datasets", lambda db, **kwargs: ([dataset], 1))
    monkeypatch.setattr(repo, "get_latest_versions_for_datasets",
                        lambda db, ids: {dataset_id: version})
    monkeypatch.setattr(repo, "get_version_session_counts", lambda db, ids: {version_id: 1})
    monkeypatch.setattr(repo, "get_dataset_by_id",
                        lambda db, key: dataset if key == dataset_id else None)
    monkeypatch.setattr(repo, "list_group_datasets",
                        lambda db, key, visible_user_id: [dataset] if key == group_id else [])
    monkeypatch.setattr(repo, "get_dataset_group_by_id",
                        lambda db, key: dataset.group if key == group_id else None)
    monkeypatch.setattr(repo, "get_dataset_latest_version",
                        lambda db, key: (dataset, version) if key == dataset_id else None)
    monkeypatch.setattr(repo, "get_dataset_latest_approved_version",
                        lambda db, key: (dataset, version)
                        if key == dataset_id and version.approval_status == "APPROVED" else None)
    monkeypatch.setattr(repo, "get_dataset_version",
                        lambda db, did, vid: (dataset, version)
                        if (did, vid) == (dataset_id, version_id) else None)
    monkeypatch.setattr(repo, "list_version_sessions",
                        lambda db, vid, page, page_size: ([session], 1)
                        if vid == version_id else ([], 0))
    monkeypatch.setattr(repo, "get_version_session",
                        lambda db, vid, sid: session
                        if (vid, sid) == (version_id, session_id) else None)
    monkeypatch.setattr(repo, "get_dataset_column_mapping", lambda db, did, vid: None)
    monkeypatch.setattr(repo, "get_latest_dataset_column_mapping", lambda db, did: None)
    monkeypatch.setattr(repo, "get_cleaning_history_by_version", lambda db, vid: None)
    engineer = SimpleNamespace(id=uuid4(), role_id="data_engineer")
    app = FastAPI()
    app.include_router(endpoints.router, prefix="/api/v1/datasets")
    app.include_router(
        endpoints.upload_router,
        prefix="/api/v1/datasets",
        tags=["pNEUMA Dataset Upload Bước 1"],
    )
    app.include_router(
        endpoints.review_router,
        prefix="/api/v1/datasets",
        tags=["Dataset Preview & Review Bước 2"],
    )
    app.dependency_overrides[get_db] = lambda: object()
    app.dependency_overrides[get_current_user] = lambda: engineer
    return SimpleNamespace(
        app=app, dataset=dataset, version=version, session=session,
        path=path, engineer=engineer,
        base=f"/api/v1/datasets/{dataset_id}/versions/{version_id}/sessions",
    )


def test_dataset_list_detail_and_sessions(review: SimpleNamespace) -> None:
    with TestClient(review.app) as client:
        listing = client.get("/api/v1/datasets")
        detail = client.get(f"/api/v1/datasets/{review.dataset.id}")
        sessions = client.get(review.base)
        one = client.get(f"{review.base}/{review.session.id}")
    assert listing.status_code == 200, listing.text
    assert listing.json()["total"] == 1
    assert listing.json()["groups"] == [{
        "group_id": str(review.dataset.group_id), "group_name": "Batch 01",
        "source": "pneuma", "drone_id": "d1",
        "dataset_count": 1, "total_sessions": 1,
    }]
    assert detail.status_code == 200, detail.text
    assert detail.json()["approval_status"] == "PENDING"
    assert detail.json()["group_id"] == str(review.dataset.group_id)
    assert detail.json()["related_datasets"][0]["dataset_id"] == str(review.dataset.id)
    assert sessions.status_code == 200, sessions.text
    assert sessions.json()["sessions"][0]["checksum"] == "a" * 64
    assert one.json()["scheduled_duration_seconds"] == 1800
    assert one.json()["group_id"] == str(review.dataset.group_id)
    assert one.json()["actual_duration_seconds"] is None
    assert one.json()["validation_status"] is None


def test_group_review_three_step_flow(review: SimpleNamespace) -> None:
    group_base = f"/api/v1/datasets/groups/{review.dataset.group_id}/datasets"
    dataset_base = f"{group_base}/{review.dataset.id}"
    with TestClient(review.app) as client:
        group = client.get(group_base)
        sessions = client.get(f"{dataset_base}/sessions")
        data = client.get(
            f"{dataset_base}/sessions/{review.session.id}",
            params={"representation": "raw", "limit": 2},
        )
        wrong_group = client.get(
            f"/api/v1/datasets/groups/{uuid4()}/datasets/{review.dataset.id}/sessions",
        )
        wrong_session = client.get(
            f"{dataset_base}/sessions/{uuid4()}", params={"representation": "raw"},
        )
        paths = {
            path for path, methods in client.get("/openapi.json").json()["paths"].items()
            if any(tag.startswith("Dataset Preview & Review")
                   for tag in methods.get("get", {}).get("tags", []))
        }
    assert group.status_code == 200, group.text
    assert group.json()["total"] == 1
    assert group.json()["datasets"][0]["dataset_id"] == str(review.dataset.id)
    assert sessions.status_code == 200, sessions.text
    assert sessions.json()["sessions"][0]["session_id"] == str(review.session.id)
    assert data.status_code == 200, data.text
    assert len(data.json()["rows"]) == 2
    assert wrong_group.status_code == 404
    assert wrong_session.status_code == 404
    assert paths == {
        "/api/v1/datasets/groups/{group_id}/datasets",
        "/api/v1/datasets/groups/{group_id}/datasets/{dataset_id}/sessions",
        "/api/v1/datasets/groups/{group_id}/datasets/{dataset_id}/sessions/{session_id}",
    }


def test_group_review_consumer_requires_approved_version(
    review: SimpleNamespace, monkeypatch: pytest.MonkeyPatch,
) -> None:
    scientist = SimpleNamespace(id=uuid4(), role_id="data_scientist")
    review.app.dependency_overrides[get_current_user] = lambda: scientist
    monkeypatch.setattr(dataset_access, "check_dataset_access",
                        lambda user, dataset_id, db: review.dataset)
    monkeypatch.setattr(dataset_consumer_service, "check_dataset_access",
                        lambda user, dataset_id, db: review.dataset)
    monkeypatch.setattr(dataset_consumer_service.repo, "get_version",
                        lambda db, version_id: review.version)
    base = f"/api/v1/datasets/groups/{review.dataset.group_id}/datasets"
    with TestClient(review.app) as client:
        assert client.get(base).status_code == 404
        assert client.get(f"{base}/{review.dataset.id}/sessions").status_code == 404
        review.version.approval_status = "APPROVED"
        assert client.get(base).status_code == 200
        assert client.get(f"{base}/{review.dataset.id}/sessions").status_code == 200
        assert client.get(
            f"{base}/{review.dataset.id}/sessions/{review.session.id}",
            params={"representation": "raw"},
        ).status_code == 200


def test_consumer_routes_check_approval_when_review_route_matches_first(
    review: SimpleNamespace, monkeypatch: pytest.MonkeyPatch,
) -> None:
    review.app.include_router(access_endpoints.approved_router, prefix="/api/v1/datasets")
    scientist = SimpleNamespace(id=uuid4(), role_id="data_scientist")
    review.app.dependency_overrides[get_current_user] = lambda: scientist
    monkeypatch.setattr(dataset_access, "check_dataset_access",
                        lambda user, dataset_id, db: review.dataset)
    monkeypatch.setattr(dataset_consumer_service, "check_dataset_access",
                        lambda user, dataset_id, db: review.dataset)
    monkeypatch.setattr(dataset_consumer_service.repo, "get_version",
                        lambda db, version_id: review.version)

    with TestClient(review.app) as client:
        assert client.get(review.base).status_code == 403
        assert client.get(f"{review.base}/{review.session.id}").status_code == 403
        assert client.get(f"{review.base}/{review.session.id}/preview").status_code == 403
        review.version.approval_status = "APPROVED"
        assert client.get(review.base).status_code == 200
        assert client.get(f"{review.base}/{review.session.id}").status_code == 200
        assert client.get(f"{review.base}/{review.session.id}/preview",
                          params={"representation": "raw"}).status_code == 200


def test_dataset_list_filters_same_drone_across_recording_dates(
    review: SimpleNamespace, monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    def list_groups(db: object, **kwargs: object) -> tuple[list[Dataset], int]:
        captured.update(kwargs)
        return [review.dataset], 1

    monkeypatch.setattr(dataset_review_service.crud_dataset, "list_uploaded_datasets", list_groups)
    with TestClient(review.app) as client:
        response = client.get("/api/v1/datasets", params={
            "group_id": str(review.dataset.group_id),
            "drone_id": "d1",
            "recording_date_from": "2018-10-24",
            "recording_date_to": "2018-11-01",
        })
        invalid = client.get("/api/v1/datasets", params={
            "recording_date_from": "2018-11-01",
            "recording_date_to": "2018-10-24",
        })

    assert response.status_code == 200
    assert response.json()["groups"][0]["datasets"][0]["name"] == "20181024-d1"
    assert captured["drone_id"] == "d1"
    assert captured["group_id"] == review.dataset.group_id
    assert captured["recording_date_from"] == date(2018, 10, 24)
    assert captured["recording_date_to"] == date(2018, 11, 1)
    assert invalid.status_code == 422


def test_dataset_list_shows_one_group_for_multiple_dates(
    review: SimpleNamespace, monkeypatch: pytest.MonkeyPatch,
) -> None:
    other_id, other_version_id = uuid4(), uuid4()
    other = Dataset(
        id=other_id, name="20181029-d1", source="pNEUMA",
        location_name="Athens, Greece", drone_id="d1",
        recording_date=date(2018, 10, 29), group_id=review.dataset.group_id,
    )
    other.group = review.dataset.group
    other_version = DatasetVersion(
        id=other_version_id, dataset_id=other_id, version_tag="v1.0",
        approval_status="PENDING",
    )
    repo = dataset_review_service.crud_dataset
    monkeypatch.setattr(repo, "list_uploaded_datasets",
                        lambda db, **kwargs: ([review.dataset, other], 1))
    monkeypatch.setattr(repo, "get_latest_versions_for_datasets",
                        lambda db, ids: {
                            review.dataset.id: review.version, other_id: other_version,
                        })
    monkeypatch.setattr(repo, "get_version_session_counts",
                        lambda db, ids: {review.version.id: 1, other_version_id: 2})

    with TestClient(review.app) as client:
        default = client.get("/api/v1/datasets")
        expanded = client.get("/api/v1/datasets", params={
            "group_id": str(review.dataset.group_id),
        })

    assert default.status_code == expanded.status_code == 200
    assert default.json()["total"] == 1
    assert default.json()["groups"][0]["dataset_count"] == 2
    assert default.json()["groups"][0]["total_sessions"] == 3
    assert "datasets" not in default.json()["groups"][0]
    assert [item["name"] for item in expanded.json()["groups"][0]["datasets"]] == [
        "20181024-d1", "20181029-d1",
    ]


def test_dataset_list_preserves_session_count_for_derived_version(
    review: SimpleNamespace, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        dataset_review_service.crud_dataset, "get_version_session_counts",
        lambda db, ids: {},
    )
    monkeypatch.setattr(
        dataset_review_service.crud_dataset, "get_cleaning_history_by_version",
        lambda db, version_id: SimpleNamespace(parameters={
            "source_session_ids": [str(review.session.id)],
        }),
    )

    with TestClient(review.app) as client:
        listing = client.get("/api/v1/datasets")
        detail = client.get(f"/api/v1/datasets/{review.dataset.id}")

    assert listing.status_code == detail.status_code == 200
    assert listing.json()["groups"][0]["total_sessions"] == 1
    assert detail.json()["total_sessions"] == 1


def test_session_preview_reads_raw_csv_with_pagination(review: SimpleNamespace) -> None:
    url = f"{review.base}/{review.session.id}/preview"
    with TestClient(review.app) as client:
        first = client.get(url, params={"limit": 2, "representation": "raw"})
        second = client.get(url, params={"limit": 2, "page": 2,
                                          "representation": "raw"})
        invalid_limit = client.get(url, params={"limit": 101})
    assert first.status_code == 200, first.text
    assert first.json()["session_id"] == str(review.session.id)
    assert first.json()["dataset_version_id"] == str(review.version.id)
    assert first.json()["dataset_name"] == "20181024-d1"
    assert first.json()["original_filename"] == review.session.original_filename
    assert first.json()["file_format"] == "csv"
    assert first.json()["file_size"] == review.session.file_size
    assert first.json()["status"] == "UPLOADED"
    assert first.json()["detected_structure"] == "csv_with_header"
    assert first.json()["representation"] == "raw"
    assert [column["name"] for column in first.json()["columns"]] == ["id", "flow"]
    assert first.json()["rows"] == [{"id": "1", "flow": "100"}, {"id": "2", "flow": "110"}]
    assert first.json()["rows_read"] == 3
    assert first.json()["pagination"]["has_more"] is True
    assert second.json()["rows"] == [{"id": "3", "flow": "120"}]
    assert second.json()["pagination"]["has_more"] is False
    assert invalid_limit.status_code == 422


def test_session_preview_normalizes_pneuma_points_as_typed_rows(
    review: SimpleNamespace,
) -> None:
    review.path.write_text(
        "track_id;type;traveled_d;avg_speed;lat;lon;speed;lon_acc;lat_acc;time\n"
        "1;Bus;17.84;17.835195;37.977149;23.737802;21.6886;0.0571;0.306;0;"
        "37.977147;23.737802;21.6917;-0.0139;0.356;0.04\n"
        "2;Car;10;5;37;23;6;0;0;0\n",
        encoding="utf-8",
    )
    url = f"{review.base}/{review.session.id}/preview"
    with TestClient(review.app) as client:
        first = client.get(url, params={"limit": 2})
        second = client.get(url, params={"limit": 2, "page": 2})
        invalid_columns = client.get(url, params={"column_offset": 1})
        raw = client.get(url, params={"representation": "raw"})
    assert first.status_code == 200, first.text
    payload = first.json()
    assert payload["representation"] == "normalized"
    assert payload["detected_structure"] == "pneuma_trajectory"
    assert payload["file_format"] == "csv"
    assert [column["name"] for column in payload["columns"]] == [
        "track_id", "type", "traveled_d", "avg_speed", "lat", "lon",
        "speed", "lon_acc", "lat_acc", "time",
    ]
    assert payload["columns"][0]["type"] == "integer"
    assert payload["rows"][0]["track_id"] == 1
    assert payload["rows"][0]["lat"] == 37.977149
    assert payload["rows"][1]["time"] == 0.04
    assert payload["pagination"]["total_rows"] == 3
    assert payload["pagination"]["has_more"] is True
    assert second.json()["rows"][0]["track_id"] == 2
    assert second.json()["pagination"]["has_more"] is False
    assert invalid_columns.status_code == 422
    assert raw.status_code == 200, raw.text
    assert raw.json()["representation"] == "raw"
    assert raw.json()["rows"][0]["track_id"] == "1"


def test_headerless_pneuma_and_wide_rows_are_bounded(review: SimpleNamespace) -> None:
    review.path.write_text(
        "1,Car,20,5,1,2,3,4,5,6\n2,Car,21,6,7,8,9,10,11,12\n",
        encoding="utf-8",
    )
    with TestClient(review.app) as client:
        response = client.get(f"{review.base}/{review.session.id}/preview",
                              params={"representation": "raw"})
    assert response.status_code == 200, response.text
    assert response.json()["columns"][0]["name"] == "column_1"
    assert response.json()["detected_structure"] == "csv_without_header"
    assert response.json()["rows"][0]["column_2"] == "Car"
    assert len(response.json()["rows"]) == 2


def test_wide_csv_reports_column_limit(review: SimpleNamespace,
                                       monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(dataset_review_service, "MAX_PREVIEW_COLUMNS", 3)
    review.path.write_text("a,b,c,d\n1,2,3,4\n", encoding="utf-8")
    with TestClient(review.app) as client:
        response = client.get(f"{review.base}/{review.session.id}/preview",
                              params={"representation": "raw"})
        next_columns = client.get(
            f"{review.base}/{review.session.id}/preview",
            params={"column_offset": 3, "representation": "raw"},
        )
    assert response.status_code == 200, response.text
    assert response.json()["total_columns"] == 4
    assert len(response.json()["columns"]) == 3
    assert response.json()["has_more_columns"] is True
    assert "chỉ hiển thị 3 cột" in response.json()["warnings"][0]
    assert next_columns.status_code == 200, next_columns.text
    assert next_columns.json()["columns"][0]["name"] == "d"
    assert next_columns.json()["rows"][0]["d"] == "4"
    assert next_columns.json()["has_more_columns"] is False


def test_session_file_path_cannot_escape_upload_root(review: SimpleNamespace) -> None:
    review.session.file_path = "../outside.csv"
    with TestClient(review.app) as client:
        response = client.get(f"{review.base}/{review.session.id}/preview",
                              params={"representation": "raw"})
    assert response.status_code == 404


def test_missing_and_malformed_csv_return_clear_errors(review: SimpleNamespace) -> None:
    url = f"{review.base}/{review.session.id}/preview"
    with TestClient(review.app) as client:
        review.path.write_bytes(b"id,flow\n\"unterminated,1\n")
        malformed = client.get(url, params={"representation": "raw"})
        review.path.unlink()
        missing = client.get(url, params={"representation": "raw"})
    assert malformed.status_code == 422
    assert "CSV" in malformed.json()["detail"]
    assert missing.status_code == 404


def test_review_requires_reader_role(review: SimpleNamespace,
                                     monkeypatch: pytest.MonkeyPatch) -> None:
    guest = SimpleNamespace(id=uuid4(), role_id="guest")
    review.app.dependency_overrides[get_current_user] = lambda: guest
    monkeypatch.setattr(dataset_access, "check_dataset_access",
                        lambda user, dataset_id, db: (_ for _ in ()).throw(
                            HTTPException(403, "Dataset access has not been granted"),
                        ))
    with TestClient(review.app) as client:
        assert client.get("/api/v1/datasets").status_code == 403
        assert client.get(f"{review.base}/{review.session.id}/preview").status_code == 403


def test_swagger_exposes_dataset_review_contracts(review: SimpleNamespace) -> None:
    paths = review.app.openapi()["paths"]
    assert "/api/v1/datasets" in paths
    de_paths = (
        "/api/v1/datasets/groups/{group_id}/datasets",
        "/api/v1/datasets/groups/{group_id}/datasets/{dataset_id}/sessions",
        "/api/v1/datasets/groups/{group_id}/datasets/{dataset_id}/sessions/{session_id}",
    )
    for path in de_paths:
        assert paths[path]["get"]["tags"] == ["Dataset Preview & Review B\u01b0\u1edbc 2"]
    assert "/api/v1/datasets/{dataset_id}" not in paths
    assert "/api/v1/datasets/{dataset_id}/versions/{version_id}/sessions/{session_id}" not in paths
    assert "/api/v1/datasets/{dataset_id}/preview" not in paths
