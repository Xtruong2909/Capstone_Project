from collections import Counter
from uuid import UUID

from sqlalchemy.orm import Session

from app.crud import crud_dataset
from app.models.dataset import DatasetColumnMapping, DatasetVersion
from app.models.user import User
from app.schemas.dataset import DatasetPreviewResponse
from app.schemas.dataset_mapping import (
    DatasetColumnInfo,
    DatasetColumnMappingInput,
    DatasetColumnMappingItem,
    DatasetColumnMappingsResponse,
    DatasetColumnsResponse,
)
from app.services.dataset_preview_service import (
    DatasetPreviewFormatError,
    DatasetPreviewNotFoundError,
    DatasetPreviewReadError,
    get_dataset_preview,
)


class DatasetMappingNotFoundError(FileNotFoundError):
    """Raised when a dataset, version, or source file does not exist."""


class DatasetMappingReadError(ValueError):
    """Raised when the dataset schema cannot be read."""


class DatasetMappingValidationError(ValueError):
    """Raised when requested column mappings are invalid."""


def _dataset_schema(
    db: Session,
    dataset_id: UUID,
) -> tuple[DatasetVersion, list[dict[str, str]]]:
    dataset_version = crud_dataset.get_dataset_latest_version(db, dataset_id)
    if dataset_version is None:
        raise DatasetMappingNotFoundError(
            "Không tìm thấy dataset hoặc phiên bản đã upload"
        )
    _, version = dataset_version
    try:
        preview = get_dataset_preview(
            db,
            dataset_id=dataset_id,
            dataset_version_id=version.id,
            page=1,
            page_size=1,
            representation="raw",
        )
    except DatasetPreviewNotFoundError as exc:
        raise DatasetMappingNotFoundError(str(exc)) from exc
    except (DatasetPreviewFormatError, DatasetPreviewReadError) as exc:
        raise DatasetMappingReadError(str(exc)) from exc

    columns = [
        {"name": column.name, "type": column.type}
        for column in preview.columns
    ]
    if not columns:
        raise DatasetMappingReadError("Dataset không có header/cột hợp lệ")
    return version, columns


def _mapping_dict(mapping: DatasetColumnMapping | None) -> dict[str, str]:
    if mapping is None:
        return {}
    return {
        item["source_column"]: item["target_column"]
        for item in mapping.mappings
        if item.get("target_column") is not None
    }


def _validate_mappings(
    source_columns: list[str],
    mappings: dict[str, str],
) -> None:
    missing_sources = sorted(set(mappings) - set(source_columns))
    if missing_sources:
        raise DatasetMappingValidationError(
            "Không tìm thấy cột nguồn trong dataset: " + ", ".join(missing_sources)
        )

    duplicate_targets = sorted(
        target for target, count in Counter(mappings.values()).items() if count > 1
    )
    if duplicate_targets:
        raise DatasetMappingValidationError(
            "Tên cột đích bị trùng: " + ", ".join(duplicate_targets)
        )
    if "extra_values" in mappings.values():
        raise DatasetMappingValidationError(
            "Tên cột đích 'extra_values' được dành riêng cho dữ liệu bổ sung"
        )

    final_names = [
        mappings.get(source_column, source_column)
        for source_column in source_columns
    ]
    colliding_names = sorted(
        name for name, count in Counter(final_names).items() if count > 1
    )
    if colliding_names:
        raise DatasetMappingValidationError(
            "Tên cột sau khi áp dụng mapping bị trùng: "
            + ", ".join(colliding_names)
        )


def _response(
    dataset_id: UUID,
    version_id: UUID,
    mappings: dict[str, str],
) -> DatasetColumnMappingsResponse:
    return DatasetColumnMappingsResponse(
        dataset_id=dataset_id,
        dataset_version_id=version_id,
        mappings=[
            DatasetColumnMappingItem(
                source_column=source_column,
                target_column=target_column,
            )
            for source_column, target_column in mappings.items()
        ],
    )


def get_dataset_columns(db: Session, dataset_id: UUID) -> DatasetColumnsResponse:
    version, source_profile = _dataset_schema(db, dataset_id)
    saved_mapping = crud_dataset.get_dataset_column_mapping(
        db,
        dataset_id,
        version.id,
    )
    mapping_by_source = _mapping_dict(saved_mapping)
    return DatasetColumnsResponse(
        dataset_id=dataset_id,
        dataset_version_id=version.id,
        columns=[
            DatasetColumnInfo(
                source_column=column["name"],
                data_type=column["type"],
                mapped_column=mapping_by_source.get(column["name"]),
                is_mapped=column["name"] in mapping_by_source,
            )
            for column in source_profile
        ],
    )


def patch_dataset_column_mappings(
    db: Session,
    *,
    dataset_id: UUID,
    requested_mappings: list[DatasetColumnMappingInput],
    user: User,
) -> DatasetColumnMappingsResponse:
    version, source_profile = _dataset_schema(db, dataset_id)
    source_columns = [column["name"] for column in source_profile]
    saved_mapping = crud_dataset.get_dataset_column_mapping(
        db,
        dataset_id,
        version.id,
    )
    mapping_by_source = _mapping_dict(saved_mapping)

    requested_sources = [item.source_column for item in requested_mappings]
    duplicate_sources = sorted(
        source for source, count in Counter(requested_sources).items() if count > 1
    )
    if duplicate_sources:
        raise DatasetMappingValidationError(
            "Cột nguồn xuất hiện nhiều lần trong request: "
            + ", ".join(duplicate_sources)
        )

    missing_sources = sorted(set(requested_sources) - set(source_columns))
    if missing_sources:
        raise DatasetMappingValidationError(
            "Không tìm thấy cột nguồn trong dataset: " + ", ".join(missing_sources)
        )

    for item in requested_mappings:
        if item.target_column is None:
            mapping_by_source.pop(item.source_column, None)
        else:
            mapping_by_source[item.source_column] = item.target_column

    _validate_mappings(source_columns, mapping_by_source)
    stored_mapping = crud_dataset.save_dataset_column_mapping(
        db,
        dataset_id=dataset_id,
        dataset_version_id=version.id,
        mappings=[
            {"source_column": source_column, "target_column": target_column}
            for source_column, target_column in mapping_by_source.items()
        ],
        user_id=user.id,
    )
    return _response(
        dataset_id,
        stored_mapping.dataset_version_id,
        _mapping_dict(stored_mapping),
    )


def get_dataset_column_mappings(
    db: Session,
    dataset_id: UUID,
) -> DatasetColumnMappingsResponse:
    version_id = preview_version_id(db, dataset_id)
    saved_mapping = crud_dataset.get_dataset_column_mapping(
        db,
        dataset_id,
        version_id,
    )
    return _response(dataset_id, version_id, _mapping_dict(saved_mapping))


def apply_saved_column_mappings(
    db: Session,
    *,
    dataset_id: UUID,
    preview: DatasetPreviewResponse,
) -> DatasetPreviewResponse:
    version_id = preview.dataset_version_id or preview_version_id(db, dataset_id)
    saved_mapping = crud_dataset.get_dataset_column_mapping(
        db,
        dataset_id,
        version_id,
    )
    mapping_by_source = _mapping_dict(saved_mapping)
    if not mapping_by_source:
        return preview

    return preview.model_copy(
        update={
            "columns": [
                column.model_copy(
                    update={"name": mapping_by_source.get(column.name, column.name)}
                )
                for column in preview.columns
            ],
            "rows": [
                {
                    mapping_by_source.get(name, name): value
                    for name, value in row.items()
                }
                for row in preview.rows
            ],
        }
    )


def preview_version_id(db: Session, dataset_id: UUID) -> UUID:
    dataset_version = crud_dataset.get_dataset_latest_version(db, dataset_id)
    if dataset_version is None:
        raise DatasetMappingNotFoundError(
            "Không tìm thấy dataset hoặc phiên bản đã upload"
        )
    return dataset_version[1].id
