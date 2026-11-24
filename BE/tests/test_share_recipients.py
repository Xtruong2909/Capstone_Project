"""Recipient isolation for every Business User read surface and atomic publishing."""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.deps import get_current_user, get_db
from app.crud import crud_sharing as repo
from app.main import app
from app.schemas.sharing import GroupShareRequest
from app.services import sharing_service as service


def actor(role: str = "business_user") -> SimpleNamespace:
    return SimpleNamespace(id=uuid4(), role_id=role, is_active=True)


@pytest.mark.parametrize("ids", [[], [uuid4()] * 2])
def test_reject_empty_or_duplicate_recipient_ids(ids: list) -> None:
    with pytest.raises(HTTPException) as error:
        service.validate_recipients(MagicMock(), ids)
    assert error.value.status_code == 422


def test_reject_nonexistent_disabled_or_wrong_role_recipient() -> None:
    with patch.object(repo, "get_business_recipients", return_value=[]), \
         pytest.raises(HTTPException) as error:
        service.validate_recipients(MagicMock(), [uuid4()])
    assert error.value.status_code == 422


def test_two_valid_recipients_are_accepted() -> None:
    users = [actor(), actor()]
    with patch.object(repo, "get_business_recipients", return_value=users):
        service.validate_recipients(MagicMock(), [u.id for u in users])


@pytest.mark.parametrize("path", ["", "/items/{item_id}/rows?section=sessions"])
def test_unselected_business_user_cannot_read_detail_or_paginated_rows(path: str) -> None:
    viewer = actor()
    report = SimpleNamespace(id=uuid4(), status="PUBLISHED", visibility="BUSINESS_USER")
    app.dependency_overrides[get_current_user] = lambda: viewer
    app.dependency_overrides[get_db] = lambda: MagicMock()
    try:
        with patch.object(repo, "get_share_by_id", return_value=report), \
             patch.object(repo, "has_share_recipient", return_value=False), \
             patch.object(service, "assemble_shared_result_detail") as assemble:
            response = TestClient(app).get(
                f"/api/shared-results/{report.id}" + path.format(item_id=uuid4())
            )
        assert response.status_code == 404
        assemble.assert_not_called()
    finally:
        app.dependency_overrides.clear()


def test_list_filters_by_authenticated_user_not_request_parameter() -> None:
    viewer = actor()
    app.dependency_overrides[get_current_user] = lambda: viewer
    app.dependency_overrides[get_db] = lambda: MagicMock()
    try:
        with patch.object(repo, "get_published_shares", return_value=([], 0)) as query:
            response = TestClient(app).get(f"/api/shared-results?viewer_id={uuid4()}")
        assert response.status_code == 200
        assert query.call_args.kwargs["viewer_id"] == viewer.id
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize("role", ["business_user", "data_engineer"])
def test_other_roles_cannot_enumerate_recipients(role: str) -> None:
    app.dependency_overrides[get_current_user] = lambda: actor(role)
    app.dependency_overrides[get_db] = lambda: MagicMock()
    try:
        assert TestClient(app).get("/api/shares/recipients").status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_selected_user_can_read_but_revoked_share_is_hidden() -> None:
    viewer, owner = actor(), actor("data_scientist")
    report = SimpleNamespace(id=uuid4(), created_by=owner.id, status="PUBLISHED",
                             visibility="BUSINESS_USER", items=[])
    with patch.object(repo, "get_share_by_id", return_value=report), \
         patch.object(repo, "has_share_recipient", return_value=True), \
         patch.object(repo, "get_user", return_value=owner), \
         patch.object(service, "validate_and_check_items"):
        assert service.require_published_share(MagicMock(), report.id, viewer) is report
        report.status = "REVOKED"
        with pytest.raises(HTTPException) as error:
            service.require_published_share(MagicMock(), report.id, viewer)
        assert error.value.status_code == 404


def test_sharing_to_second_user_preserves_first_and_skips_duplicate_resources() -> None:
    db = MagicMock()
    first, second = uuid4(), uuid4()
    resource = {"resource_type": "EXPERIMENT", "resource_id": uuid4(),
                "visible_sections": ["experiment_summary"]}
    key = (resource["resource_type"], resource["resource_id"])
    with patch.object(repo, "_lock_share_resources"), \
         patch.object(repo, "active_share_ids", side_effect=[{key}, set()]):
        created = repo.create_selection_shares(
            db, title="Batch", owner_id=uuid4(), items_data=[resource], recipient_ids=[first, second],
        )
    assert len(created) == 1
    assert created[0].recipient_ids == [second]
    assert created[0].items[0].resource_id == resource["resource_id"]
    db.commit.assert_called_once()


def test_multi_recipient_publish_is_atomic_on_failure() -> None:
    db = MagicMock()
    db.commit.side_effect = RuntimeError("database failure")
    resource = {"resource_type": "DATASET", "resource_id": uuid4(), "visible_sections": ["sessions"]}
    with patch.object(repo, "_lock_share_resources"), \
         patch.object(repo, "active_share_ids", return_value=set()), \
         pytest.raises(RuntimeError):
        repo.create_selection_shares(
            db, title="Batch", owner_id=uuid4(), items_data=[resource],
            recipient_ids=[uuid4(), uuid4()],
        )
    db.rollback.assert_called_once()


def test_group_request_requires_explicit_recipient_selection() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        GroupShareRequest(group_id=uuid4())


def test_resource_is_fully_shared_only_for_all_selected_recipients() -> None:
    db = MagicMock()
    key = ("DATASET", uuid4())
    db.execute.side_effect = [MagicMock(all=lambda: [key]), MagicMock(all=list)]
    assert repo.active_share_ids(db, [key], recipient_ids=[uuid4(), uuid4()]) == set()


def test_catalog_recomputes_shared_status_for_selected_recipients() -> None:
    db = MagicMock()
    recipient = uuid4()
    group = SimpleNamespace(id=uuid4(), name="Batch")
    dataset = {"resource_type": "DATASET", "resource_id": uuid4(), "resource_file_id": uuid4()}
    with patch.object(repo, "list_dataset_groups", return_value=[group]), \
         patch.object(service, "_shareable_group_datasets", return_value=[dataset]), \
         patch.object(service, "_dataset_session_page", return_value=(1, [])), \
         patch.object(repo, "list_resource_candidates", return_value=[]), \
         patch.object(repo, "active_share_ids", return_value=set()) as active:
        catalog = service.share_catalog(db, actor("data_scientist"), [recipient])
    assert catalog[0]["is_shared"] is False
    assert active.call_args.kwargs["recipient_ids"] == [recipient]
