"""New per-resource sharing workflow, using the existing report storage."""

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

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
