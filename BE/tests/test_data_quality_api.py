from types import SimpleNamespace
from uuid import uuid4

from app.api.v1.endpoints import datasets
from app.api.v1.endpoints.data_quality import router
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
