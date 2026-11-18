from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints import dataset_mapping as mapping_endpoints
from app.core.deps import get_current_user
from app.crud import crud_dataset
from app.database.database import get_db
from app.schemas.dataset import (
    DatasetPreviewColumn,
    DatasetPreviewPagination,
    DatasetPreviewResponse,
)
from app.schemas.dataset_mapping import DatasetColumnMappingInput
from app.services import dataset_mapping_service
from app.services.dataset_mapping_service import (
    DatasetMappingConflictError,
    DatasetMappingReadError,
    DatasetMappingValidationError,
    apply_saved_column_mappings,
    get_dataset_columns,
    get_group_dataset_columns,
    get_group_dataset_mappings,
    patch_dataset_column_mappings,
    patch_group_dataset_mappings,
)


class FakeSession:
    pass


@pytest.fixture(autouse=True)
def no_recording_sessions(monkeypatch: pytest.MonkeyPatch) -> None:
    """Legacy mapping tests use a dataset preview without a database session."""
    monkeypatch.setattr(dataset_mapping_service, "get_version_recording_sessions", lambda db, version: [])
    monkeypatch.setattr(dataset_mapping_service.crud_dataset,
                        "get_latest_dataset_column_mapping", lambda db, dataset_id: None)


def _preview() -> DatasetPreviewResponse:
    return DatasetPreviewResponse(
        dataset_id=uuid4(),
        dataset_name="traffic",
        original_filename="traffic.csv",
        file_format="CSV",
        file_size=20,
        status="PENDING",
        columns=[
            DatasetPreviewColumn(name="track_id", type="integer"),
            DatasetPreviewColumn(name="time", type="float"),
        ],
        rows=[{"track_id": 7, "time": 1.5}],
        pagination=DatasetPreviewPagination(
            page=1,
            page_size=1,
            returned_rows=1,
            has_more=False,
        ),
    )


def _dataset_stub() -> tuple[object, SimpleNamespace]:
    return object(), SimpleNamespace(id=uuid4())


def test_get_columns_reports_type_and_saved_target(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    dataset_id = uuid4()
    _, version = _dataset_stub()
    monkeypatch.setattr(
        dataset_mapping_service.crud_dataset,
        "get_dataset_latest_version",
        lambda db, requested_id: (object(), version),
    )
    monkeypatch.setattr(
        dataset_mapping_service,
        "get_dataset_preview",
        lambda *args, **kwargs: _preview(),
    )
    monkeypatch.setattr(
        dataset_mapping_service.crud_dataset,
        "get_dataset_column_mapping",
        lambda *args: SimpleNamespace(
            mappings=[{"source_column": "track_id", "target_column": "vehicle_id"}]
        ),
    )

    result = get_dataset_columns(FakeSession(), dataset_id)

    assert result.dataset_version_id == version.id
    assert result.columns[0].source_column == "track_id"
    assert result.columns[0].data_type == "integer"
    assert result.columns[0].mapped_column == "vehicle_id"
    assert result.columns[0].is_mapped
    assert result.columns[1].mapped_column is None
    assert not result.columns[1].is_mapped


def test_patch_merges_mappings_and_null_removes_existing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    dataset_id = uuid4()
    user_id = uuid4()
    _, version = _dataset_stub()
    persisted: dict[str, object] = {}

    monkeypatch.setattr(
        dataset_mapping_service.crud_dataset,
        "get_dataset_latest_version",
        lambda db, requested_id: (object(), version),
    )
    monkeypatch.setattr(
        dataset_mapping_service,
        "get_dataset_preview",
        lambda *args, **kwargs: _preview(),
    )
    monkeypatch.setattr(
        dataset_mapping_service.crud_dataset,
        "get_dataset_column_mapping",
        lambda *args: SimpleNamespace(
            mappings=[
                {"source_column": "track_id", "target_column": "vehicle_id"},
                {"source_column": "time", "target_column": "timestamp"},
            ]
        ),
    )

    def save_mapping(db: object, **kwargs: object) -> SimpleNamespace:
        persisted.update(kwargs)
        return SimpleNamespace(
            dataset_version_id=version.id,
            mappings=kwargs["mappings"],
        )

    monkeypatch.setattr(
        dataset_mapping_service.crud_dataset,
        "save_dataset_column_mapping",
        save_mapping,
    )
    result = patch_dataset_column_mappings(
        FakeSession(),
        dataset_id=dataset_id,
        requested_mappings=[
            DatasetColumnMappingInput(source_column="track_id", target_column=None),
        ],
        user=SimpleNamespace(id=user_id),
    )

    assert [mapping.model_dump() for mapping in result.mappings] == [
        {"source_column": "time", "target_column": "timestamp"}
    ]
    assert persisted["dataset_version_id"] == version.id


@pytest.mark.parametrize(
    ("requested", "error"),
    [
        (
            [
                DatasetColumnMappingInput(source_column="unknown", target_column="id"),
            ],
            "Không tìm thấy cột nguồn",
        ),
        (
            [
                DatasetColumnMappingInput(source_column="track_id", target_column="id"),
                DatasetColumnMappingInput(source_column="time", target_column="id"),
            ],
            "Tên cột đích bị trùng",
        ),
        (
            [
                DatasetColumnMappingInput(source_column="track_id", target_column="time"),
            ],
            "Tên cột sau khi áp dụng mapping bị trùng",
        ),
    ],
)
def test_patch_rejects_invalid_mappings(
    monkeypatch: pytest.MonkeyPatch,
    requested: list[DatasetColumnMappingInput],
    error: str,
) -> None:
    _, version = _dataset_stub()
    monkeypatch.setattr(
        dataset_mapping_service.crud_dataset,
        "get_dataset_latest_version",
        lambda db, requested_id: (object(), version),
    )
    monkeypatch.setattr(
        dataset_mapping_service,
        "get_dataset_preview",
        lambda *args, **kwargs: _preview(),
    )
    monkeypatch.setattr(
        dataset_mapping_service.crud_dataset,
        "get_dataset_column_mapping",
        lambda *args: None,
    )

    with pytest.raises(DatasetMappingValidationError, match=error):
        patch_dataset_column_mappings(
            FakeSession(),
            dataset_id=uuid4(),
            requested_mappings=requested,
            user=SimpleNamespace(id=uuid4()),
        )


def test_preview_renames_column_metadata_and_row_keys_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    dataset_id = uuid4()
    _, version = _dataset_stub()
    preview = _preview()
    preview.rows[0]["extra_values"] = [99]
    monkeypatch.setattr(
        dataset_mapping_service.crud_dataset,
        "get_dataset_latest_version",
        lambda db, requested_id: (object(), version),
    )
    monkeypatch.setattr(
        dataset_mapping_service.crud_dataset,
        "get_dataset_column_mapping",
        lambda *args: SimpleNamespace(
            mappings=[
                {"source_column": "track_id", "target_column": "vehicle_id"},
            ]
        ),
    )

    mapped = apply_saved_column_mappings(
        FakeSession(),
        dataset_id=dataset_id,
        preview=preview,
    )

    assert [column.name for column in mapped.columns] == ["vehicle_id", "time"]
    assert mapped.rows == [{"vehicle_id": 7, "time": 1.5, "extra_values": [99]}]
    assert preview.rows[0]["track_id"] == 7
    assert mapped.rows[0]["vehicle_id"] == 7


def test_group_mapping_saves_every_dataset_version_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    group_id = uuid4()
    datasets = [SimpleNamespace(id=uuid4(), name=f"day-{index}") for index in range(2)]
    versions = {dataset.id: SimpleNamespace(id=uuid4()) for dataset in datasets}
    saved: dict[str, object] = {}
    repo = dataset_mapping_service.crud_dataset
    monkeypatch.setattr(repo, "get_dataset_group_by_id", lambda db, key: object())
    monkeypatch.setattr(repo, "list_group_datasets", lambda db, key, visible_user_id: datasets)
    monkeypatch.setattr(
        dataset_mapping_service, "_dataset_schema",
        lambda db, key: (
            versions[key], [{"name": "track_id", "type": "integer"}], 5,
        ),
    )
    monkeypatch.setattr(repo, "save_group_column_mappings",
                        lambda db, **kwargs: saved.update(kwargs))
    user = SimpleNamespace(id=uuid4())

    response = patch_group_dataset_mappings(
        FakeSession(), group_id=group_id,
        requested_mappings=[DatasetColumnMappingInput(
            source_column="track_id", target_column="vehicle_id",
        )], user=user,
    )

    assert response.dataset_count == 2
    assert response.session_count == 10
    assert len(saved["updates"]) == 2
    assert {row[0] for row in saved["updates"]} == {dataset.id for dataset in datasets}
    assert all(row[2] == [{"source_column": "track_id", "target_column": "vehicle_id"}]
               for row in saved["updates"])
    assert saved["user_id"] == user.id


def test_group_mapping_rejects_mismatched_dataset_before_save(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    group_id = uuid4()
    datasets = [SimpleNamespace(id=uuid4(), name=f"day-{index}") for index in range(2)]
    repo = dataset_mapping_service.crud_dataset
    monkeypatch.setattr(repo, "get_dataset_group_by_id", lambda db, key: object())
    monkeypatch.setattr(repo, "list_group_datasets", lambda db, key, visible_user_id: datasets)
    monkeypatch.setattr(
        dataset_mapping_service, "_dataset_schema",
        lambda db, key: (
            SimpleNamespace(id=uuid4()),
            [{"name": "track_id" if key == datasets[0].id else "car_id", "type": "integer"}],
            5,
        ),
    )
    writes: list[object] = []
    monkeypatch.setattr(repo, "save_group_column_mappings",
                        lambda db, **kwargs: writes.append(kwargs))

    with pytest.raises(DatasetMappingReadError, match="day-1"):
        patch_group_dataset_mappings(
            FakeSession(), group_id=group_id,
            requested_mappings=[DatasetColumnMappingInput(
                source_column="track_id", target_column="vehicle_id",
            )], user=SimpleNamespace(id=uuid4()),
        )
    assert writes == []


def test_group_mapping_reads_shared_mapping_and_reports_conflict(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    group_id = uuid4()
    datasets = [SimpleNamespace(id=uuid4(), name=f"day-{index}") for index in range(2)]
    repo = dataset_mapping_service.crud_dataset
    monkeypatch.setattr(repo, "get_dataset_group_by_id", lambda db, key: object())
    monkeypatch.setattr(repo, "list_group_datasets", lambda db, key, visible_user_id: datasets)
    monkeypatch.setattr(dataset_mapping_service, "_dataset_schema",
                        lambda db, key: (SimpleNamespace(id=uuid4()),
                                         [{"name": "track_id", "type": "integer"}], 5))
    targets = {dataset.id: "vehicle_id" for dataset in datasets}
    monkeypatch.setattr(dataset_mapping_service, "_mapping_for_version",
                        lambda db, key, version_id: SimpleNamespace(mappings=[{
                            "source_column": "track_id", "target_column": targets[key],
                        }]))

    columns = get_group_dataset_columns(FakeSession(), group_id)
    mapping = get_group_dataset_mappings(FakeSession(), group_id)
    assert columns.dataset_count == 2
    assert mapping.mappings[0].target_column == "vehicle_id"
    targets[datasets[1].id] = "car_id"
    with pytest.raises(DatasetMappingConflictError):
        get_group_dataset_mappings(FakeSession(), group_id)


def test_group_mapping_swagger_only_shows_group_routes() -> None:
    app = FastAPI()
    app.include_router(mapping_endpoints.router, prefix="/api/v1/datasets",
                       tags=["Dataset Column Mapping Bước 3"])
    app.dependency_overrides[get_db] = lambda: FakeSession()
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id=uuid4(), role_id="data_engineer",
    )
    with TestClient(app) as client:
        paths = client.get("/openapi.json").json()["paths"]
    assert set(paths) == {
        "/api/v1/datasets/groups/{group_id}/columns",
        "/api/v1/datasets/groups/{group_id}/column-mappings",
    }
    assert set(paths["/api/v1/datasets/groups/{group_id}/column-mappings"]) == {
        "get", "patch",
    }


def test_group_mapping_crud_commits_once_and_rolls_back_on_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    dataset_ids = [uuid4(), uuid4()]
    updates = [(dataset_id, uuid4(), [{
        "source_column": "track_id", "target_column": "vehicle_id",
    }]) for dataset_id in dataset_ids]
    monkeypatch.setattr(crud_dataset, "get_dataset_column_mapping",
                        lambda db, dataset_id, version_id: None)
    audit_events: list[object] = []
    monkeypatch.setattr(crud_dataset, "record_audit_event",
                        lambda **kwargs: audit_events.append(kwargs))

    class BatchDb:
        def __init__(self, fail: bool = False) -> None:
            self.fail = fail
            self.added: list[object] = []
            self.commits = 0
            self.rollbacks = 0

        def add(self, value: object) -> None:
            self.added.append(value)

        def commit(self) -> None:
            self.commits += 1
            if self.fail:
                raise RuntimeError("commit failed")

        def rollback(self) -> None:
            self.rollbacks += 1

    db = BatchDb()
    crud_dataset.save_group_column_mappings(db, updates=updates, user_id=uuid4())
    assert len(db.added) == 2
    assert db.commits == 1
    assert db.rollbacks == 0
    assert len(audit_events) == 2

    failing_db = BatchDb(fail=True)
    with pytest.raises(RuntimeError, match="commit failed"):
        crud_dataset.save_group_column_mappings(
            failing_db, updates=updates, user_id=uuid4(),
        )
    assert failing_db.commits == failing_db.rollbacks == 1
    assert len(audit_events) == 2
