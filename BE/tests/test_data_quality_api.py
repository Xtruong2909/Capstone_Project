from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import BackgroundTasks
from pydantic import ValidationError

from app.api.v1.endpoints import data_quality as quality_api
from app.api.v1.endpoints import datasets
from app.api.v1.endpoints.data_quality import router
from app.schemas.data_quality import DataQualityCheckRequest, DataQualityOutlierRule
from app.schemas.dataset_normalization import DatasetVersionSubmitRequest


class FakeQuery:
    def __init__(self, result: object) -> None:
        self.result = result

    def filter(self, *args: object) -> "FakeQuery":
        return self

    def first(self) -> object:
        return self.result


class SubmitWithoutQualityCheckDb:
    def __init__(self, version: SimpleNamespace, export_history: object) -> None:
        self.version = version
        self.export_history = export_history

    def query(self, model: object) -> FakeQuery:
        if model is datasets.DatasetVersion:
            return FakeQuery(self.version)
        if model is datasets.DataCleaningHistory:
            return FakeQuery(self.export_history)
        raise AssertionError(f"Unexpected database query: {model}")

    def commit(self) -> None:
        pass

    def refresh(self, instance: object) -> None:
        pass

    def add(self, instance: object) -> None:
        pass


def test_submit_dataset_version_route_is_registered() -> None:
    routes = {
        (route.path, method)
        for route in datasets.router.routes
        for method in route.methods
    }

    assert ("/{dataset_id}/versions/{version_id}/submit", "POST") in routes


def test_submit_does_not_require_separate_quality_check() -> None:
    dataset_id = uuid4()
    version_id = uuid4()
    user_id = uuid4()
    version = SimpleNamespace(
        id=version_id,
        dataset_id=dataset_id,
        version_tag="v1.1",
        approval_status="PENDING",
        submitted_by=None,
        submitted_at=None,
        approved_by=None,
        approval_note=None,
    )
    db = SubmitWithoutQualityCheckDb(version, export_history=object())

    response = datasets.submit_dataset_version_for_admin(
        dataset_id=dataset_id,
        version_id=version_id,
        payload=DatasetVersionSubmitRequest(note="Đã kiểm tra dữ liệu chuẩn hóa"),
        db=db,
        current_user=SimpleNamespace(id=user_id),
    )

    assert response.approval_status == "SUBMITTED"
    assert version.submitted_at is not None


def test_data_quality_routes_are_registered() -> None:
    routes = {
        (route.path, method)
        for route in router.routes
        for method in route.methods
    }

    assert (
        "/{dataset_id}/quality-checks",
        "POST",
    ) in routes
    assert (
        "/{dataset_id}/quality-checks/{check_id}",
        "GET",
    ) in routes
    assert (
        "/{dataset_id}/quality-checks/{check_id}/report",
        "GET",
    ) in routes
    assert (
        "/{dataset_id}/quality-checks/{check_id}/issues",
        "GET",
    ) in routes


def test_admin_can_preview_a_specific_dataset_version() -> None:
    from app.api.v1.endpoints.admin import router as admin_router
    from app.main import app

    route_contract = {
        (route.path, method)
        for route in admin_router.routes
        for method in route.methods
    }
    assert (
        "/datasets/{dataset_id}/versions/{id}/preview",
        "GET",
    ) in route_contract

    operation = app.openapi()["paths"][
        "/api/v1/admin/datasets/{dataset_id}/versions/{id}/preview"
    ]["get"]
    path_parameters = {
        parameter["name"]
        for parameter in operation["parameters"]
        if parameter["in"] == "path"
    }
    assert path_parameters == {"dataset_id", "id"}
    parameters = {
        parameter["name"]: parameter
        for parameter in operation["parameters"]
        if parameter["in"] == "query"
    }
    assert parameters["page"]["schema"]["default"] == 1
    assert parameters["page_size"]["schema"]["default"] == 20
    assert parameters["representation"]["schema"]["default"] == "normalized"


@pytest.mark.parametrize("configured", [False, True])
def test_quality_check_passes_optional_rules_to_existing_worker(
    monkeypatch: pytest.MonkeyPatch, configured: bool,
) -> None:
    started = SimpleNamespace(id=uuid4(), check_id=uuid4())
    monkeypatch.setattr(quality_api, "start_data_quality_check", lambda *args, **kwargs: (started, None))
    tasks = BackgroundTasks()
    payload = DataQualityCheckRequest(outlier_rules=[DataQualityOutlierRule(
        field="speed", max_value=10, unit="km/h", basis="Synthetic test only",
    )]) if configured else None

    response = quality_api.start_quality_check(
        dataset_id=uuid4(), background_tasks=tasks, db=object(),
        current_user=SimpleNamespace(id=uuid4()), payload=payload,
    )

    assert response is started
    assert len(tasks.tasks) == 1
    assert tasks.tasks[0].func is quality_api.run_data_quality_check
    assert tasks.tasks[0].args == (started.check_id,)
    assert tasks.tasks[0].kwargs["outlier_rules"] == (payload.outlier_rules if payload else None)


@pytest.mark.parametrize("changes", [
    {"max_value": None}, {"min_value": 11}, {"max_value": float("inf")},
    {"max_value": float("-inf")}, {"max_value": float("nan")},
    {"max_value": True}, {"field": "latitude"}, {"unit": "m/s^2"},
    {"basis": " "}, {"max_value": -1}, {"min_value": -1}, {"unknown": 10},
])
def test_outlier_configuration_rejects_invalid_bounds_units_and_basis(changes: dict) -> None:
    rule = {"field": "speed", "max_value": 10, "unit": "km/h", "basis": "Synthetic test"}
    rule.update(changes)
    with pytest.raises(ValidationError):
        DataQualityCheckRequest.model_validate({"outlier_rules": [rule]})


def test_outlier_configuration_rejects_duplicate_fields_and_missing_basis() -> None:
    rule = {"field": "speed", "max_value": 10, "unit": "km/h", "basis": "Synthetic test"}
    with pytest.raises(ValidationError):
        DataQualityCheckRequest.model_validate({"outlier_rules": [rule, rule]})
    rule.pop("basis")
    with pytest.raises(ValidationError):
        DataQualityCheckRequest.model_validate({"outlier_rules": [rule]})


def test_outlier_request_is_optional_in_existing_api_contract() -> None:
    from app.main import app

    spec = app.openapi()
    request = spec["paths"]["/api/v1/datasets/{dataset_id}/quality-checks"]["post"]["requestBody"]
    assert not request.get("required", False)
    assert "outlier_rules" in spec["components"]["schemas"]["DataQualityCheckRequest"]["properties"]
    assert spec["components"]["schemas"]["DataQualityCheckRequest"]["examples"] == [
        {"outlier_rules": []}
    ]
    assert "severity" in spec["components"]["schemas"]["DataQualityIssueItem"]["properties"]
