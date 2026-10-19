from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.schemas.dataset import (
    DatasetPreviewColumn,
    DatasetPreviewPagination,
    DatasetPreviewResponse,
)
from app.schemas.dataset_mapping import DatasetColumnMappingInput
from app.services import dataset_mapping_service
from app.services.dataset_mapping_service import (
    DatasetMappingValidationError,
    apply_saved_column_mappings,
    get_dataset_columns,
    patch_dataset_column_mappings,
)


class FakeSession:
    pass


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
