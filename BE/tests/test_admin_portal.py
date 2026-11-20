"""Admin filtering, totals, page boundaries and authorization against isolated data."""
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import JSON, Column, MetaData, Table, create_engine, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.v1.endpoints.admin_portal import router
from app.core.deps import get_current_user
from app.crud import crud_dataset_access
from app.database.database import get_db
from app.models.audit import AuditLog
from app.models.dataset import Dataset, DatasetAccessGrant, DatasetGroup, DatasetVersion
from app.models.experiment import Experiment
from app.models.user import User
from app.services import admin_monitoring_service


@pytest.fixture
def portal():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    metadata = MetaData()
    for model in (User, Dataset, DatasetGroup, DatasetVersion, DatasetAccessGrant, AuditLog):
        Table(model.__tablename__, metadata, *[
            Column(column.name, JSON() if isinstance(column.type, JSONB) else column.type,
                   primary_key=column.primary_key)
            for column in model.__table__.columns
        ])
    metadata.create_all(engine)
    with Session(engine) as db:
        now = datetime.now(UTC)
        users = [User(id=uuid4(), email=f"person{i}@example.com", full_name=f"Person {i}",
                      role_id="data_scientist" if i < 4 else "business_user",
                      is_active=i != 0, hashed_password="unused", created_at=now) for i in range(6)]
        dataset = Dataset(id=uuid4(), name="Athens traffic", code="test", source="test",
                          location_name="Athens")
        versions = [DatasetVersion(id=uuid4(), dataset_id=dataset.id, version_tag=f"v{i}",
                                   file_format="CSV", total_records=100,
                                   approval_status=status, created_at=now,
                                   submitted_by=users[0].id, submitted_at=now)
                    for i, status in enumerate(["SUBMITTED", "APPROVED", "REJECTED"])]
        db.add_all([*users, dataset, *versions, DatasetAccessGrant(
            id=uuid4(), dataset_id=dataset.id, user_id=users[0].id,
            granted_by=users[5].id, created_at=now,
        )])
        db.commit()
        actor = SimpleNamespace(role_id="admin")
        app = FastAPI()
        app.include_router(router, prefix="/admin/portal")
        app.dependency_overrides[get_current_user] = lambda: actor
        app.dependency_overrides[get_db] = lambda: db
        with TestClient(app) as client:
            yield client, actor, app
    engine.dispose()


def test_user_pages_filter_before_count_and_do_not_overlap(portal) -> None:
    client, _, _ = portal
    first = client.get("/admin/portal/users?role=data_scientist&page_size=2").json()
    second = client.get("/admin/portal/users?role=data_scientist&page_size=2&page=2").json()
    assert first["total"] == second["total"] == 4
    assert len(first["items"]) == len(second["items"]) == 2
    assert {item["id"] for item in first["items"]}.isdisjoint(item["id"] for item in second["items"])
    active = client.get("/admin/portal/users?role=data_scientist&is_active=true").json()
    assert active["total"] == 3
    missing = client.get("/admin/portal/users?search=missing").json()
    assert missing["items"] == [] and missing["total"] == 0
    assert "hashed_password" not in str(first)


def test_approved_catalog_does_not_depend_on_audit_or_browser_cache(portal) -> None:
    client, _, _ = portal
    result = client.get("/admin/portal/datasets?approval_status=APPROVED&search=Athens").json()
    assert result["total"] == 1
    assert result["items"][0]["approval_status"] == "APPROVED"
    assert client.get("/admin/portal/datasets?page=4&page_size=1").json()["items"] == []


def test_grants_and_summary_use_database_counts(portal) -> None:
    client, _, _ = portal
    result = client.get("/admin/portal/access-grants?search=person0").json()
    assert result["total"] == 1
    assert result["items"][0]["user_email"] == "person0@example.com"
    assert "expires_at" not in result["items"][0]
    summary = client.get("/admin/portal/summary").json()
    assert summary["total_users"] == 6
    assert summary["active_users"] == 5
    assert summary["approved_versions"] == summary["pending_approvals"] == 1
    assert summary["total_access_grants"] == 1


def test_eligible_dataset_and_batch_users_only_include_scientists(portal) -> None:
    client, _, app = portal
    db = app.dependency_overrides[get_db]()
    dataset_id = client.get("/admin/portal/datasets").json()["items"][0]["dataset_id"]
    eligible = crud_dataset_access.eligible_users(db, UUID(dataset_id), None, 0, 20)
    assert len(eligible) == 4
    assert all(user.role_id == "data_scientist" for user, _ in eligible)
    first = crud_dataset_access.list_eligible_group_users(db, None, 0, 2)
    second = crud_dataset_access.list_eligible_group_users(db, None, 2, 2)
    assert len(first) == len(second) == 2
    assert {user.id for user in first}.isdisjoint(user.id for user in second)
    assert all(user.role_id == "data_scientist" for user in first + second)
    assert crud_dataset_access.list_eligible_group_users(db, "person5", 0, 20) == []


def test_batch_catalog_counts_before_pagination_and_filters_datasets(portal) -> None:
    client, _, app = portal
    db = app.dependency_overrides[get_db]()
    groups = [DatasetGroup(id=uuid4(), name=f"Batch {i}", source="test") for i in range(2)]
    db.add_all(groups)
    for index, group in enumerate(groups):
        for number in range(index + 1):
            dataset = Dataset(id=uuid4(), name=f"Dataset {index}-{number}",
                              code=f"batch-{index}-{number}", source="test", group_id=group.id)
            db.add(dataset)
            for version in range(2):
                db.add(DatasetVersion(id=uuid4(), dataset_id=dataset.id,
                                      version_tag=f"v{version}", file_format="CSV",
                                      total_records=10, approval_status="APPROVED",
                                      approval_note=f"Approved batch {index}"))
    db.commit()
    pages = [client.get(f"/admin/portal/dataset-groups?approval_status=APPROVED&page_size=1&page={page}")
             .json() for page in range(1, 4)]
    assert all(page["total"] == 3 for page in pages)
    items = [page["items"][0] for page in pages]
    assert len({item["group_id"] for item in items}) == 3
    second = next(item for item in items if item["group_id"] == str(groups[1].id))
    assert second["dataset_count"] == 2 and second["version_count"] == 4
    assert second["approval_status"] == "APPROVED"
    assert second["approval_notes"] == ["Approved batch 1"]
    first = next(item for item in items if item["group_id"] == str(groups[0].id))
    assert first["approval_notes"] == ["Approved batch 0"]
    selected = client.get(f"/admin/portal/datasets?group_id={groups[1].id}&approval_status=APPROVED&page_size=1").json()
    assert selected["total"] == 4 and len(selected["items"]) == 1
    assert selected["items"][0]["group_id"] == str(groups[1].id)
    legacy = client.get("/admin/portal/datasets?ungrouped=true&approval_status=APPROVED").json()
    assert legacy["total"] == 1 and legacy["items"][0]["group_id"] is None
    search = client.get("/admin/portal/dataset-groups?search=Dataset%201-0&approval_status=APPROVED").json()
    assert search["total"] == 1 and search["items"][0]["dataset_count"] == 1
    assert client.get("/admin/portal/dataset-groups?approval_status=SUBMITTED").json()["total"] == 1
    assert client.get("/admin/portal/datasets?group_id=invalid").status_code == 422


def test_batch_status_and_notes_respect_status_filter(portal) -> None:
    client, _, app = portal
    db = app.dependency_overrides[get_db]()
    versions = list(db.scalars(select(DatasetVersion)))
    for version in versions:
        version.approval_note = "  Approved quality  " if version.approval_status == "APPROVED" else " "
    db.commit()
    all_statuses = client.get("/admin/portal/dataset-groups").json()["items"][0]
    assert all_statuses["approval_status"] == "MIXED"
    assert all_statuses["approval_notes"] == ["Approved quality"]
    approved = client.get("/admin/portal/dataset-groups?approval_status=APPROVED").json()["items"][0]
    assert approved["approval_status"] == "APPROVED"
    assert approved["approval_notes"] == ["Approved quality"]
    submitted = client.get("/admin/portal/dataset-groups?approval_status=SUBMITTED").json()["items"][0]
    assert submitted["approval_notes"] == []


@pytest.mark.parametrize("query", ["page=0", "page_size=101", "role=unknown"])
def test_invalid_query_is_rejected(portal, query: str) -> None:
    assert portal[0].get(f"/admin/portal/users?{query}").status_code == 422


def test_admin_endpoints_reject_other_roles_and_anonymous_requests(portal) -> None:
    client, actor, app = portal
    actor.role_id = "data_engineer"
    assert client.get("/admin/portal/users").status_code == 403
    app.dependency_overrides.pop(get_current_user)
    assert client.get("/admin/portal/summary").status_code == 401


def test_experiment_page_has_stable_order_and_respects_offset(monkeypatch) -> None:
    now = datetime.now(UTC)
    rows = [SimpleNamespace(
        id=uuid4(), name=f"Experiment {i}", model_type="RANDOM_FOREST",
        target_variable="traffic_flow", temporal_aggregation_sec=60,
        status="COMPLETED", execution_time_sec=None, creator=None,
        dataset_version=None, evaluation_metric=None, created_at=now,
    ) for i in range(3)]
    rows.sort(key=lambda item: str(item.id), reverse=True)
    repo = admin_monitoring_service.crud_admin
    monkeypatch.setattr(repo, "count_experiments", lambda db, model, status=None:
                        3 if model is Experiment and status in (None, "COMPLETED") else 0)
    monkeypatch.setattr(repo, "list_recent_legacy_experiments", lambda db, limit: rows[:limit])
    monkeypatch.setattr(repo, "list_recent_training_experiments", lambda db, limit: [])
    result = admin_monitoring_service.get_experiments_overview(None, skip=1, limit=1)
    assert result.stats.total_experiments == 3
    assert [item.id for item in result.experiments] == [rows[1].id]
