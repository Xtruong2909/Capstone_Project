"""New per-resource sharing workflow, using the existing report storage."""

from datetime import UTC, date, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.deps import get_current_user, get_db
from app.crud import crud_sharing
from app.database.database import get_db as database_get_db
from app.main import app
from app.services import sharing_service


def actor(role: str = "data_scientist") -> SimpleNamespace:
    return SimpleNamespace(id=uuid4(), role_id=role, is_active=True)


def client_for(user: SimpleNamespace) -> TestClient:
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: MagicMock()
    app.dependency_overrides[database_get_db] = lambda: MagicMock()
    return TestClient(app, raise_server_exceptions=False)


def test_available_resources_is_role_guarded() -> None:
    client = client_for(actor("business_user"))
    try:
        assert client.get("/api/shares/available-resources?resource_type=DATASET").status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_available_resources_returns_paged_share_status() -> None:
    client = client_for(actor())
    resource_id = uuid4()
    try:
        with patch.object(sharing_service, "available_resources", return_value=([
            {"resource_type": "DATASET", "resource_id": resource_id,
             "name": "Dataset A", "is_shared": True},
        ], 1)) as catalog:
            response = client.get("/api/shares/available-resources?resource_type=DATASET&page=2")
        assert response.status_code == 200
        assert response.json()["data"][0]["is_shared"] is True
        assert catalog.call_args.kwargs["page"] == 2
    finally:
        app.dependency_overrides.clear()


def test_batch_share_reports_partial_result() -> None:
    user = actor()
    client = client_for(user)
    good_id, bad_id, report_id = uuid4(), uuid4(), uuid4()
    prepared = [{"resource_type": "DATASET", "resource_id": good_id,
                 "name": "Dataset A", "visible_sections": ["metadata"]}]
    failure = {"resource_type": "EXPERIMENT", "resource_id": bad_id,
               "success": False, "message": "Không có quyền."}
    report = SimpleNamespace(
        id=report_id, items=[SimpleNamespace(resource_type="DATASET", resource_id=good_id)],
    )
    try:
        with (
            patch.object(sharing_service, "prepare_resource_shares", return_value=(prepared, [failure])),
            patch.object(crud_sharing, "create_resource_shares", return_value=([report], set())) as create,
            patch("app.api.v1.endpoints.sharing.audit_log_service.record_audit_event"),
        ):
            response = client.post("/api/shares/batch", json={"resources": [
                {"resource_type": "DATASET", "resource_id": str(good_id)},
                {"resource_type": "EXPERIMENT", "resource_id": str(bad_id)},
            ]})
        assert response.status_code == 200
        assert response.json()["created_count"] == 1
        assert response.json()["failed_count"] == 1
        assert create.call_args.kwargs["owner_id"] == user.id
    finally:
        app.dependency_overrides.clear()


def test_batch_share_rejects_business_user() -> None:
    client = client_for(actor("business_user"))
    try:
        response = client.post("/api/shares/batch", json={"resources": [
            {"resource_type": "DATASET", "resource_id": str(uuid4())},
        ]})
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_share_catalog_is_role_guarded() -> None:
    client = client_for(actor("business_user"))
    try:
        assert client.get("/api/shares/catalog").status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_group_selection_creates_one_report_with_all_selected_resources() -> None:
    user = actor()
    client = client_for(user)
    group_id, dataset_id, experiment_id, prediction_id = (uuid4() for _ in range(4))
    report = SimpleNamespace(id=uuid4(), title="Batch A", description=None,
                             created_by=user.id, visibility="BUSINESS_USER",
                             status="PUBLISHED", created_at=datetime.now(UTC),
                             updated_at=datetime.now(UTC), published_at=datetime.now(UTC),
                             revoked_at=None, items=[])
    prepared = [
        {"resource_type": "DATASET", "resource_id": dataset_id,
         "visible_sections": ["metadata", "sessions"]},
        {"resource_type": "EXPERIMENT", "resource_id": experiment_id,
         "visible_sections": ["experiment_summary"]},
        {"resource_type": "PREDICTION", "resource_id": prediction_id,
         "visible_sections": ["forecast_summary"]},
    ]
    try:
        with (
            patch.object(sharing_service, "prepare_group_share", return_value=("Batch A", prepared)) as prepare,
            patch.object(crud_sharing, "create_share", return_value=report) as create,
            patch("app.api.v1.endpoints.sharing.audit_log_service.record_audit_event"),
        ):
            response = client.post("/api/shares/selection", json={
                "group_id": str(group_id), "experiment_ids": [str(experiment_id)],
                "prediction_ids": [str(prediction_id)],
            })
        assert response.status_code == 201
        assert prepare.call_args.args[2:] == (group_id, [experiment_id], [prediction_id])
        assert create.call_args.kwargs["items_data"] == prepared
        assert create.call_count == 1
    finally:
        app.dependency_overrides.clear()


def test_group_selection_rejects_result_from_other_batch() -> None:
    group_id, other_group_id, experiment_id, dataset_id = (uuid4() for _ in range(4))
    with (
        patch.object(crud_sharing, "get_dataset_group", return_value=SimpleNamespace(id=group_id, name="A")),
        patch.object(sharing_service, "_shareable_group_datasets", return_value=[
            {"resource_type": "DATASET", "resource_id": dataset_id,
             "visible_sections": ["sessions"]},
        ]),
        patch.object(crud_sharing, "get_experiment", return_value=SimpleNamespace(id=experiment_id)),
        patch.object(crud_sharing, "experiment_group_id", return_value=other_group_id),
    ):
        with pytest.raises(HTTPException) as exc:
            sharing_service.prepare_group_share(MagicMock(), actor(), group_id, [experiment_id], [])
        assert exc.value.status_code == 422


def test_repository_skips_existing_active_share() -> None:
    db = MagicMock()
    resource_id = uuid4()
    with patch.object(crud_sharing, "active_share_ids", return_value={("DATASET", resource_id)}):
        created, duplicate = crud_sharing.create_resource_shares(
            db, owner_id=uuid4(), resources=[{"resource_type": "DATASET", "resource_id": resource_id}],
        )
    assert created == []
    assert duplicate == {("DATASET", resource_id)}
    db.commit.assert_called_once()
    db.add.assert_not_called()


def test_revoke_requires_owner() -> None:
    client = client_for(actor())
    foreign = SimpleNamespace(
        id=uuid4(), created_by=uuid4(), status="PUBLISHED", items=[],
    )
    try:
        with patch.object(crud_sharing, "get_share_by_id", return_value=foreign):
            assert client.patch(f"/api/shares/{foreign.id}/revoke").status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_revoke_persisted_status_blocks_business_detail() -> None:
    user = actor()
    client = client_for(user)
    now = datetime.now(UTC)
    report = SimpleNamespace(
        id=uuid4(), title="Dataset A", description=None, created_by=user.id,
        visibility="BUSINESS_USER", status="PUBLISHED", items=[],
        created_at=now, updated_at=now, published_at=now, revoked_at=None,
    )

    def persist_revoke(_db: MagicMock, **kwargs: object) -> SimpleNamespace:
        report.status = "REVOKED"
        report.revoked_at = now
        return report

    try:
        with (
            patch.object(crud_sharing, "get_share_by_id", return_value=report),
            patch.object(crud_sharing, "update_share", side_effect=persist_revoke),
            patch("app.api.v1.endpoints.sharing.audit_log_service.record_audit_event"),
        ):
            assert client.patch(f"/api/shares/{report.id}/revoke").status_code == 200
        user.role_id = "business_user"
        with patch.object(crud_sharing, "get_share_by_id", return_value=report):
            assert client.get(f"/api/shared-results/{report.id}").status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_shared_dataset_sessions_show_recording_clock() -> None:
    session = SimpleNamespace(
        session_id=uuid4(), original_filename="20181024_d1_0900_1000.csv",
        recording_date=date(2018, 10, 24),
        scheduled_start=datetime(2018, 10, 24, 6, 0, tzinfo=UTC),
        scheduled_end=datetime(2018, 10, 24, 7, 0, tzinfo=UTC),
    )
    with (
        patch.object(crud_sharing, "get_dataset", return_value=SimpleNamespace(
            drone_id=uuid4(), recording_date=session.recording_date,
        )),
        patch.object(sharing_service, "list_recording_sessions", return_value=SimpleNamespace(
            total=1, sessions=[session],
        )),
    ):
        total, rows = sharing_service._dataset_session_page(
            MagicMock(), uuid4(), uuid4(), 1, 20,
        )
    assert total == 1
    assert rows[0]["scheduled_start"] == "2018-10-24T09:00:00+03:00"
    assert rows[0]["scheduled_end"] == "2018-10-24T10:00:00+03:00"


def test_shared_traffic_rows_show_recording_clock_on_every_page() -> None:
    session_id = uuid4()
    item = SimpleNamespace(
        id=uuid4(), share_id=uuid4(), resource_type="DATASET",
        resource_id=uuid4(), resource_file_id=uuid4(),
        visible_sections=["traffic_flow_chart"],
    )
    traffic_row = SimpleNamespace(
        recording_session_id=session_id,
        time_bucket=datetime(2018, 10, 24, 6, 11, tzinfo=UTC),
        vehicle_count=12,
    )
    with (
        patch.object(crud_sharing, "page_traffic_bins", return_value=(1, [traffic_row])),
        patch.object(crud_sharing, "get_session_names", return_value={
            str(session_id): "20181024_d1_0900_1000.csv",
        }),
    ):
        result = sharing_service.page_item_section(
            MagicMock(), None, item, "traffic_flow_chart", 2, 20,
        )
    assert result["data"][0]["timestamp"] == "2018-10-24T09:11:00+03:00"


def test_shared_experiment_and_forecast_times_follow_athens_dst() -> None:
    experiment_row = SimpleNamespace(
        session_id=uuid4(), model_type="RANDOM_FOREST", horizon=1,
        input_timestamp=datetime(2018, 10, 24, 6, 11, tzinfo=UTC),
        forecast_timestamp=datetime(2018, 10, 24, 6, 12, tzinfo=UTC),
        actual_timestamp=datetime(2018, 10, 24, 6, 12, tzinfo=UTC),
        actual_vehicle_count=10, predicted_vehicle_count=11,
        absolute_error=1, squared_error=1,
    )
    row = sharing_service._experiment_row(experiment_row)
    assert row["input_timestamp"] == "2018-10-24T09:11:00+03:00"
    assert row["forecast_timestamp"] == "2018-10-24T09:12:00+03:00"

    forecast_row = SimpleNamespace(
        session_id=uuid4(), horizon=1,
        forecast_timestamp=datetime(2018, 11, 1, 6, 11, tzinfo=UTC),
        predicted_vehicle_count=11, actual_vehicle_count=None,
    )
    assert sharing_service._forecast_row(forecast_row)["forecast_timestamp"] == (
        "2018-11-01T08:11:00+02:00"
    )


def test_shared_forecast_history_shows_athens_clock() -> None:
    session_id = uuid4()
    item = SimpleNamespace(
        resource_id=uuid4(), visible_sections=["forecast_chart"],
    )
    run = SimpleNamespace(session_snapshots=[{
        "session_id": str(session_id),
        "historical": [{"timestamp": "2018-10-24T06:11:00+00:00", "traffic_flow": 12}],
    }])
    with (
        patch.object(crud_sharing, "get_prediction", return_value=run),
        patch.object(crud_sharing, "get_session_names", return_value={}),
        patch.object(sharing_service, "page_item_section", return_value={"data": []}),
    ):
        result = sharing_service._prediction_sections(MagicMock(), item)
    assert result["forecast_chart"]["historical"][0]["points"][0]["timestamp"] == (
        "2018-10-24T09:11:00+03:00"
    )
