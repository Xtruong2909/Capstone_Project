from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.api.v1.endpoints import datasets
from app.schemas.data_quality import DataQualityCheckRequest
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


def test_submit_does_not_require_separate_quality_check(monkeypatch: pytest.MonkeyPatch) -> None:
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
    monkeypatch.setattr(
        datasets,
        "get_version_source_context",
        lambda *_args, **_kwargs: (version_id, "v1.0", []),
    )

    response = datasets.submit_dataset_version_for_admin(
        dataset_id=dataset_id,
        version_id=version_id,
        payload=DatasetVersionSubmitRequest(note="Đã kiểm tra dữ liệu chuẩn hóa"),
        db=db,
        current_user=SimpleNamespace(id=user_id),
    )

    assert response.approval_status == "SUBMITTED"
    assert version.submitted_at is not None


def test_data_quality_routes_are_not_exposed() -> None:
    from app.main import app

    assert not any("/quality-checks" in getattr(route, "path", "") for route in app.routes)
    assert not any("/quality-checks" in path for path in app.openapi()["paths"])


def test_admin_can_preview_a_specific_recording_session() -> None:
    from app.api.v1.endpoints.admin import router as admin_router
    from app.main import app

    route_contract = {
        (route.path, method)
        for route in admin_router.routes
        for method in route.methods
    }
    assert (
        "/datasets/groups/{group_id}/datasets/{dataset_id}/sessions/{session_id}/preview",
        "GET",
    ) in route_contract

    operation = app.openapi()["paths"][
        "/api/v1/admin/datasets/groups/{group_id}/datasets/{dataset_id}/sessions/{session_id}/preview"
    ]["get"]
    path_parameters = {
        parameter["name"]
        for parameter in operation["parameters"]
        if parameter["in"] == "path"
    }
    assert path_parameters == {"group_id", "dataset_id", "session_id"}
    parameters = {
        parameter["name"]: parameter
        for parameter in operation["parameters"]
        if parameter["in"] == "query"
    }
    assert parameters["page"]["schema"]["default"] == 1
    assert parameters["limit"]["schema"]["default"] == 20
    assert parameters["representation"]["schema"]["default"] == "normalized"


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


def test_data_quality_request_schema_remains_available_for_internal_use() -> None:
    from app.main import app

    spec = app.openapi()
    assert not any("/quality-checks" in path for path in spec["paths"])
    assert DataQualityCheckRequest().outlier_rules == []
