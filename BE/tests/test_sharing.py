"""Result sharing permissions, section isolation, paging and transactions."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import inspect, select
from sqlalchemy.exc import OperationalError

from app.core.deps import get_current_user
from app.crud import crud_sharing
from app.database.database import SessionLocal, engine, get_db
from app.main import app
from app.models.dataset import DatasetVersion
from app.models.lag_feature import LagFeatureSplit
from app.models.model_training import ModelTrainingExperiment
from app.models.prediction import PredictionRun
from app.models.user import User
from app.services import sharing_service

NOW = datetime.now(UTC)


def user(role: str = "data_scientist") -> SimpleNamespace:
    return SimpleNamespace(id=uuid4(), role_id=role, is_active=True)


def item(kind: str = "EXPERIMENT", sections: list[str] | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(), share_id=uuid4(), resource_type=kind, resource_id=uuid4(),
        resource_version_id=None, visible_sections=sections or ["experiment_summary"],
        created_at=NOW, updated_at=NOW,
    )


def share(owner: SimpleNamespace, status: str = "PUBLISHED", items: list | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(), title="Kết quả", description=None, created_by=owner.id,
        visibility="BUSINESS_USER", status=status, items=items or [],
        created_at=NOW, updated_at=NOW,
        published_at=NOW if status == "PUBLISHED" else None,
        revoked_at=NOW if status == "REVOKED" else None,
    )


@pytest.fixture
def api():
    actor = user()
    db = MagicMock()
    app.dependency_overrides[get_current_user] = lambda: actor
    app.dependency_overrides[get_db] = lambda: db
    with patch("app.api.v1.endpoints.sharing.audit_log_service.record_audit_event"):
        yield TestClient(app, raise_server_exceptions=False), actor, db
    app.dependency_overrides.clear()


def test_openapi_registers_only_requested_share_paths() -> None:
    paths = app.openapi()["paths"]
    assert "/api/shares" in paths
    assert "/api/shares/{share_id}" in paths
    assert "/api/shares/mine" in paths
    assert "/api/shared-results" in paths
    assert "/api/shared-results/{share_id}" in paths
    assert "/api/shared-results/{share_id}/items/{item_id}/rows" in paths
    assert "/api/v1/shares" not in paths


def test_ds_create_uses_authenticated_owner(api) -> None:
    client, actor, _db = api
    saved = share(actor, items=[item()])
    with (
        patch.object(sharing_service, "validate_and_check_items") as validate,
        patch.object(crud_sharing, "create_share", return_value=saved) as create,
    ):
        response = client.post("/api/shares", json={
            "title": "Kết quả", "status": "PUBLISHED",
            "items": [{"resource_type": "EXPERIMENT", "resource_id": str(uuid4()),
                       "visible_sections": ["experiment_summary"]}],
        })
    assert response.status_code == 201
    assert response.json()["share_id"] == str(saved.id)
    assert create.call_args.kwargs["created_by"] == actor.id
    assert validate.call_args.args[2] is actor


def test_bu_cannot_create_or_update(api) -> None:
    client, actor, _db = api
    actor.role_id = "business_user"
    assert client.post("/api/shares", json={"title": "x"}).status_code == 403
    assert client.patch(f"/api/shares/{uuid4()}", json={"title": "x"}).status_code == 403


def test_update_replaces_items_and_records_change(api) -> None:
    client, actor, _db = api
    before = share(actor, "DRAFT", [item()])
    after = share(actor, "PUBLISHED", [item("PREDICTION", ["forecast_summary"])])
    with (
        patch.object(crud_sharing, "get_share_by_id", return_value=before),
        patch.object(crud_sharing, "update_share", return_value=after) as update,
        patch.object(sharing_service, "validate_and_check_items"),
        patch("app.api.v1.endpoints.sharing.audit_log_service.record_audit_event") as audit,
    ):
        response = client.patch(f"/api/shares/{before.id}", json={
            "status": "PUBLISHED", "items": [
                {"resource_type": "PREDICTION", "resource_id": str(after.items[0].resource_id),
                 "visible_sections": ["forecast_summary"]},
            ],
        })
    assert response.status_code == 200
    assert len(update.call_args.kwargs["items_data"]) == 1
    actions = [call.kwargs["action"] for call in audit.call_args_list]
    assert {"SHARE_UPDATED", "SHARE_PUBLISHED", "SHARE_ITEM_ADDED", "SHARE_ITEM_REMOVED"} <= set(actions)


def test_ds_cannot_update_another_owner(api) -> None:
    client, _actor, _db = api
    foreign = share(user(), "DRAFT")
    with patch.object(crud_sharing, "get_share_by_id", return_value=foreign):
        assert client.patch(f"/api/shares/{foreign.id}", json={"title": "x"}).status_code == 403


def test_revoke_prevents_next_bu_read(api) -> None:
    client, actor, _db = api
    published = share(actor, items=[item()])
    revoked = share(actor, "REVOKED", published.items)
    with (
        patch.object(crud_sharing, "get_share_by_id", return_value=published),
        patch.object(crud_sharing, "update_share", return_value=revoked),
    ):
        response = client.patch(f"/api/shares/{published.id}", json={"status": "REVOKED"})
    assert response.status_code == 200
    actor.role_id = "business_user"
    with patch.object(crud_sharing, "get_share_by_id", return_value=revoked):
        assert client.get(f"/api/shared-results/{published.id}").status_code == 404


@pytest.mark.parametrize("state", ["DRAFT", "REVOKED"])
def test_unpublished_share_is_not_visible(api, state: str) -> None:
    client, actor, _db = api
    actor.role_id = "business_user"
    hidden = share(user(), state)
    with patch.object(crud_sharing, "get_share_by_id", return_value=hidden):
        assert client.get(f"/api/shared-results/{hidden.id}").status_code == 404


def test_bu_list_is_paged(api) -> None:
    client, actor, _db = api
    actor.role_id = "business_user"
    published = share(user(), items=[item()])
    with patch.object(crud_sharing, "get_published_shares", return_value=([published], 1)) as query:
        response = client.get("/api/shared-results?page=2&page_size=5&resource_type=EXPERIMENT")
    assert response.status_code == 200
    assert response.json()["total_records"] == 1
    assert response.json()["data"][0]["share_id"] == str(published.id)
    assert query.call_args.kwargs["page"] == 2
    assert query.call_args.kwargs["page_size"] == 5


def test_bu_detail_uses_published_guard(api) -> None:
    client, actor, _db = api
    actor.role_id = "business_user"
    published = share(user(), items=[item()])
    detail = {"share_id": published.id, "title": published.title, "status": "PUBLISHED",
              "resources": []}
    with (
        patch.object(sharing_service, "require_published_share", return_value=published) as guard,
        patch.object(sharing_service, "assemble_shared_result_detail", return_value=detail),
    ):
        response = client.get(f"/api/shared-results/{published.id}")
    assert response.status_code == 200
    guard.assert_called_once()


def test_disabled_experiment_section_never_appears() -> None:
    selected = item(sections=["experiment_summary"])
    exp = SimpleNamespace(
        id=selected.resource_id, name="Ex-03", status="COMPLETED",
        configuration={"model": "RANDOM_FOREST", "hyperparameters": {"secret": 123}},
        performance_by_model_and_horizon={}, performance_by_horizon={},
    )
    with patch.object(crud_sharing, "get_experiment", return_value=exp):
        data = sharing_service._experiment_sections(MagicMock(), selected)
    assert data["experiment_summary"]["experiment_name"] == "Ex-03"
    assert "hyperparameters" not in data
    assert "secret" not in str(data)


def test_turning_section_off_removes_it_from_bu_response() -> None:
    selected = item(sections=["experiment_summary", "hyperparameters"])
    exp = SimpleNamespace(
        id=selected.resource_id, name="Ex-03", status="COMPLETED",
        configuration={"model": "RANDOM_FOREST"},
        performance_by_model_and_horizon={}, performance_by_horizon={},
    )
    model = SimpleNamespace(horizon=1, hyperparameters={"n_estimators": 100})
    with (
        patch.object(crud_sharing, "get_experiment", return_value=exp),
        patch.object(crud_sharing, "get_models", return_value=[model]),
    ):
        assert "hyperparameters" in sharing_service._experiment_sections(MagicMock(), selected)
        selected.visible_sections = ["experiment_summary"]
        assert "hyperparameters" not in sharing_service._experiment_sections(MagicMock(), selected)


def test_bu_response_loses_section_immediately_after_patch(api) -> None:
    client, actor, _db = api
    selected = item(sections=["experiment_summary", "hyperparameters"])
    published = share(actor, items=[selected])
    exp = SimpleNamespace(
        id=selected.resource_id, name="Ex-03", status="COMPLETED",
        configuration={"model": "RANDOM_FOREST"},
        performance_by_model_and_horizon={}, performance_by_horizon={},
    )
    model = SimpleNamespace(horizon=1, hyperparameters={"n_estimators": 100})

    def replace_items(_db, **kwargs):
        selected.visible_sections = kwargs["items_data"][0]["visible_sections"]
        return published

    with (
        patch.object(crud_sharing, "get_share_by_id", return_value=published),
        patch.object(crud_sharing, "get_experiment", return_value=exp),
        patch.object(crud_sharing, "get_models", return_value=[model]),
        patch.object(crud_sharing, "update_share", side_effect=replace_items),
        patch.object(sharing_service, "validate_and_check_items"),
        patch.object(sharing_service, "require_published_share", return_value=published),
    ):
        actor.role_id = "business_user"
        before = client.get(f"/api/shared-results/{published.id}")
        assert "hyperparameters" in before.json()["resources"][0]["data"]
        actor.role_id = "data_scientist"
        changed = client.patch(f"/api/shares/{published.id}", json={"items": [{
            "resource_type": "EXPERIMENT", "resource_id": str(selected.resource_id),
            "visible_sections": ["experiment_summary"],
        }]})
        assert changed.status_code == 200
        actor.role_id = "business_user"
        after = client.get(f"/api/shared-results/{published.id}")
        assert "hyperparameters" not in after.json()["resources"][0]["data"]


def test_unshared_section_cannot_be_paged() -> None:
    selected = item(sections=["experiment_summary"])
    with pytest.raises(HTTPException) as error:
        sharing_service.page_item_section(MagicMock(), None, selected, "prediction_rows", 1, 20)
    assert error.value.status_code == 403


def test_shared_prediction_rows_are_paged(api) -> None:
    client, actor, _db = api
    actor.role_id = "business_user"
    selected = item(sections=["prediction_rows"])
    published = share(user(), items=[selected])
    row = SimpleNamespace(
        session_id=uuid4(), model_type="RANDOM_FOREST", horizon=1,
        input_timestamp=NOW, forecast_timestamp=NOW, actual_timestamp=NOW,
        actual_vehicle_count=2, predicted_vehicle_count=3,
        absolute_error=1, squared_error=1,
    )
    with (
        patch.object(sharing_service, "require_published_share", return_value=published),
        patch.object(crud_sharing, "page_experiment_predictions", return_value=(101, [row])) as query,
    ):
        response = client.get(
            f"/api/shared-results/{published.id}/items/{selected.id}/rows"
            "?section=prediction_rows&page=2&page_size=10"
        )
    assert response.status_code == 200
    assert response.json()["total_records"] == 101
    assert len(response.json()["data"]) == 1
    assert query.call_args.args[2:] == (2, 10)


def test_resource_not_found_and_duplicate_item() -> None:
    actor = user()
    resource_id = uuid4()
    selected = {"resource_type": "EXPERIMENT", "resource_id": resource_id,
                "visible_sections": ["experiment_summary"]}
    with patch.object(crud_sharing, "get_experiment", return_value=None), pytest.raises(HTTPException) as error:
        sharing_service.validate_and_check_items(MagicMock(), [selected], actor)
    assert error.value.detail["code"] == "RESOURCE_NOT_FOUND"
    with patch.object(sharing_service, "_require_resource"), pytest.raises(HTTPException) as error:
        sharing_service.validate_and_check_items(MagicMock(), [selected, selected], actor)
    assert error.value.detail["code"] == "DUPLICATE_SHARE_ITEM"


def test_dataset_share_pins_approved_version() -> None:
    actor = user()
    selected = {"resource_type": "DATASET", "resource_id": uuid4(),
                "visible_sections": ["metadata"]}
    dataset = SimpleNamespace(id=selected["resource_id"])
    version = SimpleNamespace(id=uuid4(), dataset_id=dataset.id, approval_status="APPROVED")
    with (
        patch.object(crud_sharing, "get_dataset", return_value=dataset),
        patch.object(crud_sharing, "get_latest_approved_version", return_value=version),
        patch.object(sharing_service, "check_dataset_access"),
    ):
        sharing_service.validate_and_check_items(MagicMock(), [selected], actor)
    assert selected["resource_version_id"] == version.id


def test_experiment_cannot_be_shared_by_another_scientist() -> None:
    actor = user()
    experiment = SimpleNamespace(id=uuid4(), status="COMPLETED", created_by=uuid4())
    with patch.object(crud_sharing, "get_experiment", return_value=experiment), pytest.raises(HTTPException) as error:
        sharing_service.validate_and_check_items(MagicMock(), [{
            "resource_type": "EXPERIMENT", "resource_id": experiment.id,
            "visible_sections": ["experiment_summary"],
        }], actor)
    assert error.value.status_code == 403


def test_create_transaction_rolls_back_on_error() -> None:
    db = MagicMock()
    db.flush.side_effect = RuntimeError("write failed")
    with pytest.raises(RuntimeError):
        crud_sharing.create_share(
            db, title="Report", description=None, created_by=uuid4(),
            status="DRAFT", items_data=[],
        )
    db.rollback.assert_called_once()
    db.commit.assert_not_called()


def test_update_transaction_rolls_back_on_error() -> None:
    db = MagicMock()
    existing = share(user(), "DRAFT")
    db.commit.side_effect = RuntimeError("write failed")
    with pytest.raises(RuntimeError):
        crud_sharing.update_share(db, share=existing, title="Updated")
    db.rollback.assert_called_once()


def test_request_rejects_invalid_type_section_and_status(api) -> None:
    client, _actor, _db = api
    resource_id = str(uuid4())
    bad_type = client.post("/api/shares", json={
        "title": "x", "items": [{
            "resource_type": "INVALID", "resource_id": resource_id, "visible_sections": [],
        }],
    })
    assert bad_type.status_code == 422
    assert bad_type.json()["detail"]["code"] == "INVALID_RESOURCE_TYPE"
    bad_section = client.post("/api/shares", json={
        "title": "x", "items": [{
            "resource_type": "EXPERIMENT", "resource_id": resource_id,
            "visible_sections": ["metadata"],
        }],
    })
    assert bad_section.status_code == 422
    assert bad_section.json()["detail"]["code"] == "INVALID_VISIBLE_SECTION"
    bad_status = client.post("/api/shares", json={"title": "x", "status": "INVALID"})
    assert bad_status.status_code == 422
    assert bad_status.json()["detail"]["code"] == "INVALID_SHARE_STATUS"


def test_deleted_or_inaccessible_resource_invalidates_published_share() -> None:
    owner = user()
    published = share(owner, items=[item()])
    with (
        patch.object(crud_sharing, "get_share_by_id", return_value=published),
        patch.object(crud_sharing, "get_user", return_value=owner),
        patch.object(sharing_service, "validate_and_check_items", side_effect=HTTPException(404)),
        pytest.raises(HTTPException) as error,
    ):
        sharing_service.require_published_share(MagicMock(), published.id)
    assert error.value.status_code == 404


def test_business_user_cannot_bypass_share_with_internal_read_apis(api) -> None:
    client, actor, _db = api
    actor.role_id = "business_user"
    assert client.get(f"/api/model-training/experiments/{uuid4()}").status_code == 403
    assert client.get("/api/v1/datasets/approved").status_code == 403
    assert client.get(f"/api/v1/datasets/{uuid4()}/versions").status_code == 403


def test_postgres_share_round_trip_with_rollback() -> None:
    """Exercise real PostgreSQL constraints and replacement without committing test rows."""
    try:
        if not inspect(engine).has_table("shared_reports"):
            pytest.skip("Result Sharing migration is not installed")
        with SessionLocal() as db:
            owner_id = db.scalar(select(User.id).where(User.role_id == "data_scientist").limit(1))
            if owner_id is None:
                pytest.skip("No Data Scientist user in the integration database")
            with patch.object(db, "commit", db.flush):
                created = crud_sharing.create_share(
                    db, title="Temporary sharing test", description=None,
                    created_by=owner_id, status="DRAFT", items_data=[],
                )
                assert crud_sharing.get_share_by_id(db, created.id) is not None
                resource_id = uuid4()
                updated = crud_sharing.update_share(
                    db, share=created, status="PUBLISHED", items_data=[{
                        "resource_type": "EXPERIMENT", "resource_id": resource_id,
                        "visible_sections": ["experiment_summary"],
                    }],
                )
                assert updated.status == "PUBLISHED"
                assert len(updated.items) == 1
                # Replacing the same resource must not violate the unique item constraint.
                updated = crud_sharing.update_share(
                    db, share=updated, items_data=[{
                        "resource_type": "EXPERIMENT", "resource_id": resource_id,
                        "visible_sections": ["evaluation_metrics"],
                    }],
                )
                assert updated.items[0].visible_sections == ["evaluation_metrics"]
                db.rollback()
    except OperationalError as exc:
        pytest.skip(f"PostgreSQL unavailable: {type(exc).__name__}")


def test_postgres_reads_each_saved_resource_without_exposing_paths() -> None:
    """Read real existing results, including large sections, through the BU allowlists."""
    try:
        with SessionLocal() as db:
            version = db.scalars(select(DatasetVersion).where(
                DatasetVersion.approval_status == "APPROVED",
            ).limit(1)).first()
            split = db.scalars(select(LagFeatureSplit).limit(1)).first()
            experiment = db.scalars(select(ModelTrainingExperiment).where(
                ModelTrainingExperiment.status == "COMPLETED",
            ).limit(1)).first()
            prediction = db.scalars(select(PredictionRun).where(
                PredictionRun.status == "COMPLETED",
            ).limit(1)).first()
            if not all((version, split, experiment, prediction)):
                pytest.skip("Complete real results not available for all four resource types")
            examples = [
                ("DATASET", version.dataset_id, version.id,
                 ["metadata", "statistics", "sessions", "traffic_flow_chart"]),
                ("TRAIN_TEST", split.id, None,
                 ["split_summary", "train_test_counts", "session_distribution", "split_configuration"]),
                ("EXPERIMENT", experiment.id, None,
                 ["experiment_summary", "hyperparameters", "evaluation_metrics",
                  "baseline_comparison", "prediction_rows", "horizon_comparison"]),
                ("PREDICTION", prediction.id, None,
                 ["forecast_summary", "model_information", "lag_features",
                  "forecast_results", "forecast_chart"]),
            ]
            for kind, resource_id, version_id, sections in examples:
                selected = item(kind, sections)
                selected.resource_id = resource_id
                selected.resource_version_id = version_id
                result = sharing_service._ASSEMBLERS[kind](db, selected)
                assert set(result) == set(sections)
                assert "file_path" not in str(result)
                assert "artifact_path" not in str(result)
    except OperationalError as exc:
        pytest.skip(f"PostgreSQL unavailable: {type(exc).__name__}")
