from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints import ds_temporal_aggregation
from app.core.deps import get_current_user
from app.database.database import get_db
from app.main import app as main_app


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(ds_temporal_aggregation.router, prefix="/api/v1/ds/aggregations")
    app.dependency_overrides[get_db] = lambda: object()
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id=uuid4(), role_id="data_scientist",
    )
    return TestClient(app)


def test_run_returns_processing_with_all_session_ids(monkeypatch) -> None:
    group_id = uuid4()
    dataset_id = uuid4()
    version_id = uuid4()
    session_ids = [uuid4() for _ in range(5)]
    job = SimpleNamespace(
        id=uuid4(), dataset_id=dataset_id, dataset_version_id=version_id,
        job_metadata={"group_id": str(group_id)}, aggregation_interval=60,
        status="PROCESSING", total_sessions=5, completed_sessions=0, failed_sessions=0,
    )
    results = [
        SimpleNamespace(
            aggregation_id=job.id, session_id=session_id, status="QUEUED", time_bins=0,
            records_read=0, error_message=None,
        )
        for session_id in session_ids
    ]
    monkeypatch.setattr(ds_temporal_aggregation, "create_group_temporal_aggregation", lambda db, user, payload: ([job], results))
    monkeypatch.setattr(ds_temporal_aggregation, "run_group_temporal_aggregation", lambda **kwargs: None)

    response = _client().post(
        "/api/v1/ds/aggregations",
        json={"group_id": str(group_id)},
    )

    assert response.status_code == 202
    assert response.json()["status"] == "PROCESSING"
    assert response.json()["total_sessions"] == 5
    assert len(response.json()["sessions"]) == 5
    assert response.json()["group_id"] == str(group_id)
    assert response.json()["total_datasets"] == 1
    assert response.json()["dataset_version_id"] == str(version_id)


def test_results_accepts_full_and_filtered_pagination(monkeypatch) -> None:
    aggregation_id = uuid4()
    group_id = uuid4()
    dataset_id = uuid4()
    session_id = uuid4()
    version_id = uuid4()
    captured = []

    def results(
        db: Any, user: Any, run_id: Any, selected_session: Any,
        page: int, page_size: int,
    ) -> dict[str, Any]:
        captured.append((run_id, selected_session, page, page_size))
        return {
            "aggregation_id": aggregation_id,
            "group_id": group_id,
            "dataset_id": dataset_id,
            "dataset_version_id": version_id,
            "aggregation_interval": 60,
            "status": "COMPLETED",
            "session_id": selected_session,
            "total_sessions": 1 if selected_session else 5,
            "total_time_bins": 18 if selected_session else 87,
            "total_records": 18 if selected_session else 87,
            "page": page,
            "page_size": page_size,
            "total_pages": 1 if selected_session else 5,
            "data": [{
                "session_id": session_id,
                "timestamp": datetime(2018, 10, 24, 5, 30, tzinfo=UTC),
                "vehicle_count": 2,
            }],
        }

    monkeypatch.setattr(ds_temporal_aggregation, "get_temporal_aggregation_results", results)
    client = _client()
    full = client.get(f"/api/v1/ds/aggregations/{aggregation_id}/results")
    selected = client.get(
        f"/api/v1/ds/aggregations/{aggregation_id}/results"
        f"?session_id={session_id}&page=2&page_size=10"
    )

    assert full.status_code == selected.status_code == 200
    assert full.json()["total_sessions"] == 5
    assert selected.json()["total_sessions"] == 1
    assert selected.json()["data"][0]["vehicle_count"] == 2
    assert captured == [
        (aggregation_id, None, 1, 20),
        (aggregation_id, session_id, 2, 10),
    ]


def test_combined_results_needs_only_aggregation_id(monkeypatch) -> None:
    aggregation_id = uuid4()
    group_id = uuid4()
    dataset_id = uuid4()
    version_id = uuid4()
    session_id = uuid4()
    captured = []

    def combined(db: Any, user: Any, run_id: Any) -> dict[str, Any]:
        captured.append(run_id)
        return {
            "aggregation_id": aggregation_id,
            "group_id": group_id,
            "dataset_id": dataset_id,
            "dataset_version_id": version_id,
            "aggregation_interval": 60,
            "status": "COMPLETED",
            "timezone": "Europe/Athens",
            "total_sessions": 5,
            "completed_sessions": 5,
            "failed_sessions": 0,
            "total_time_bins": 1,
            "data": [{
                "session_id": session_id,
                "timestamp": "2018-10-24T08:30:00+03:00",
                "vehicle_count": 12,
            }],
        }

    monkeypatch.setattr(
        ds_temporal_aggregation, "get_combined_temporal_aggregation_results", combined,
    )
    response = _client().get(
        f"/api/v1/ds/aggregations/{aggregation_id}/combined-results",
    )

    assert response.status_code == 200
    assert response.json()["data"][0]["vehicle_count"] == 12
    assert response.json()["data"][0]["session_id"] == str(session_id)
    assert "contributing_sessions" not in response.json()["data"][0]
    assert captured == [aggregation_id]


def test_openapi_contains_ds_aggregation_and_lag_routes() -> None:
    paths = main_app.openapi()["paths"]
    assert "/api/v1/ds/aggregations" in paths
    assert "/api/v1/ds/aggregations/{aggregation_id}/results" in paths
    assert "/api/v1/ds/aggregations/{aggregation_id}/combined-results" in paths
    assert len([path for path in paths if path.startswith("/api/v1/ds/aggregations")]) == 3
    assert "/api/aggregation/quality-check" not in paths
    request_ref = paths["/api/v1/ds/aggregations"]["post"]["requestBody"]["content"][
        "application/json"
    ]["schema"]["$ref"]
    request_schema = main_app.openapi()["components"]["schemas"][request_ref.rsplit("/", 1)[-1]]
    assert set(request_schema["required"]) == {"group_id"}
    assert "dataset_id" not in request_schema["properties"]
    assert "dataset_version_id" not in request_schema["properties"]
    assert not any(
        path.startswith("/api/v1/datasets/traffic/aggregation") for path in paths
    )
