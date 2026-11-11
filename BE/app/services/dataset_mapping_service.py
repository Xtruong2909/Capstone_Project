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
    _read_csv,
    get_dataset_preview,
    resolve_stored_file_path,
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
) -> tuple[DatasetVersion, list[dict[str, str]], int]:
    dataset_version = crud_dataset.get_dataset_latest_version(db, dataset_id)
    if dataset_version is None:
        raise DatasetMappingNotFoundError(
            "Không tìm thấy dataset hoặc phiên bản đã upload"
        )
    _, version = dataset_version
    sessions = crud_dataset.list_all_version_sessions(db, version.id)
    if sessions:
        columns: list[dict[str, str]] | None = None
        reference_filename = ""
        for session in sessions:
            try:
                path = resolve_stored_file_path(session.file_path)
                preview = _read_csv(
                    path, offset=0, page_size=1, representation="raw",
                )
            except DatasetPreviewNotFoundError as exc:
                raise DatasetMappingNotFoundError(
                    f"Không tìm thấy file session {session.original_filename}: {exc}"
                ) from exc
            except (DatasetPreviewFormatError, DatasetPreviewReadError, OSError, ValueError) as exc:
                raise DatasetMappingReadError(
                    f"Không đọc được cấu trúc cột của {session.original_filename}: {exc}"
                ) from exc

            session_columns = [
                {"name": column.name, "type": column.type}
                for column in preview.columns
            ]
            if columns is None:
                columns = session_columns
                reference_filename = session.original_filename
                continue
            if [column["name"] for column in session_columns] != [
                column["name"] for column in columns
            ]:
                raise DatasetMappingReadError(
                    "Các session trong Dataset Version không cùng cấu trúc cột: "
                    f"{reference_filename} và {session.original_filename}. "
                    "Hãy kiểm tra file trước khi tạo mapping dùng chung."
                )
        columns = columns or []
        session_count = len(sessions)
    else:
        # Keep support for legacy single-file Dataset Versions.
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
        session_count = 1
    if not columns:
        raise DatasetMappingReadError("Dataset không có header/cột hợp lệ")
    return version, columns, session_count


def _mapping_for_version(
    db: Session,
    dataset_id: UUID,
    version_id: UUID,
) -> DatasetColumnMapping | None:
    """Prefer this version's mapping, then reuse the dataset's latest saved mapping."""
    return crud_dataset.get_dataset_column_mapping(
        db, dataset_id, version_id,
    ) or crud_dataset.get_latest_dataset_column_mapping(db, dataset_id)


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
    session_count: int,
    mapping_reused: bool = False,
) -> DatasetColumnMappingsResponse:
    return DatasetColumnMappingsResponse(
        dataset_id=dataset_id,
        dataset_version_id=version_id,
        session_count=session_count,
        mapping_scope="all_sessions_with_matching_columns",
        mapping_reused=mapping_reused,
        mappings=[
            DatasetColumnMappingItem(
                source_column=source_column,
                target_column=target_column,
            )
            for source_column, target_column in mappings.items()
        ],
    )


def get_dataset_columns(db: Session, dataset_id: UUID) -> DatasetColumnsResponse:
    version, source_profile, session_count = _dataset_schema(db, dataset_id)
    saved_mapping = _mapping_for_version(db, dataset_id, version.id)
    mapping_by_source = _mapping_dict(saved_mapping)
    if set(mapping_by_source) - {column["name"] for column in source_profile}:
        # A new version can change schema. Do not silently apply an obsolete map.
        mapping_by_source = {}
    return DatasetColumnsResponse(
        dataset_id=dataset_id,
        dataset_version_id=version.id,
        session_count=session_count,
        mapping_scope="all_sessions_with_matching_columns",
        mapping_reused=bool(
            saved_mapping
            and saved_mapping.dataset_version_id != version.id
            and mapping_by_source
        ),
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
    version, source_profile, session_count = _dataset_schema(db, dataset_id)
    source_columns = [column["name"] for column in source_profile]
    saved_mapping = _mapping_for_version(db, dataset_id, version.id)
    mapping_by_source = _mapping_dict(saved_mapping)
    if set(mapping_by_source) - set(source_columns):
        mapping_by_source = {}

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
        session_count,
    )


def get_dataset_column_mappings(
    db: Session,
    dataset_id: UUID,
) -> DatasetColumnMappingsResponse:
    version, columns, session_count = _dataset_schema(db, dataset_id)
    saved_mapping = _mapping_for_version(db, dataset_id, version.id)
    mapping_by_source = _mapping_dict(saved_mapping)
    if set(mapping_by_source) - {column["name"] for column in columns}:
        mapping_by_source = {}
    return _response(
        dataset_id,
        version.id,
        mapping_by_source,
        session_count,
        mapping_reused=bool(
            saved_mapping
            and saved_mapping.dataset_version_id != version.id
            and mapping_by_source
        ),
    )


def apply_saved_column_mappings(
    db: Session,
    *,
    dataset_id: UUID,
    preview: DatasetPreviewResponse,
) -> DatasetPreviewResponse:
    version_id = preview.dataset_version_id or preview_version_id(db, dataset_id)
    saved_mapping = _mapping_for_version(db, dataset_id, version_id)
    mapping_by_source = _mapping_dict(saved_mapping)
    if not mapping_by_source:
        return preview

    source_columns = [column.name for column in preview.columns]
    if set(mapping_by_source) - set(source_columns):
        return preview
    try:
        _validate_mappings(source_columns, mapping_by_source)
    except DatasetMappingValidationError:
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
