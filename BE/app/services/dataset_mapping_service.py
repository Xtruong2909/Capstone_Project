from collections import Counter
from uuid import UUID

from sqlalchemy.orm import Session

from app.crud import crud_dataset
from app.models.dataset import Dataset, DatasetColumnMapping, DatasetVersion
from app.models.user import User
from app.schemas.dataset import DatasetPreviewResponse
from app.schemas.dataset_mapping import (
    DatasetColumnInfo,
    DatasetColumnMappingInput,
    DatasetColumnMappingItem,
    DatasetColumnMappingsResponse,
    DatasetColumnsResponse,
    GroupDatasetColumnsResponse,
    GroupDatasetMappingsResponse,
    GroupMappingDataset,
)
from app.services.dataset_preview_service import (
    DatasetPreviewFormatError,
    DatasetPreviewNotFoundError,
    DatasetPreviewReadError,
    _read_csv,
    get_dataset_preview,
    resolve_stored_file_path,
)
from app.services.dataset_version_service import get_version_recording_sessions


class DatasetMappingNotFoundError(FileNotFoundError):
    """Raised when a dataset, version, or source file does not exist."""


class DatasetMappingReadError(ValueError):
    """Raised when the dataset schema cannot be read."""


class DatasetMappingValidationError(ValueError):
    """Raised when requested column mappings are invalid."""


class DatasetMappingConflictError(ValueError):
    """Raised when group members already have different mappings."""


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
    sessions = get_version_recording_sessions(db, version)
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


def _group_schemas(
    db: Session, group_id: UUID,
) -> list[tuple[Dataset, DatasetVersion, list[dict[str, str]], int]]:
    if crud_dataset.get_dataset_group_by_id(db, group_id) is None:
        raise DatasetMappingNotFoundError("Không tìm thấy nhóm Dataset")
    datasets = crud_dataset.list_group_datasets(db, group_id, None)
    if not datasets:
        raise DatasetMappingNotFoundError("Nhóm Dataset chưa có Dataset để mapping")
    schemas: list[tuple[Dataset, DatasetVersion, list[dict[str, str]], int]] = []
    reference_names: list[str] | None = None
    for dataset in datasets:
        try:
            version, columns, session_count = _dataset_schema(db, dataset.id)
        except (DatasetMappingNotFoundError, DatasetMappingReadError) as exc:
            raise type(exc)(f"Dataset {dataset.name}: {exc}") from exc
        names = [column["name"] for column in columns]
        if reference_names is not None and names != reference_names:
            raise DatasetMappingReadError(
                f"Dataset {dataset.name} có cấu trúc cột khác các Dataset trong nhóm"
            )
        reference_names = names
        schemas.append((dataset, version, columns, session_count))
    return schemas


def _group_dataset_items(
    schemas: list[tuple[Dataset, DatasetVersion, list[dict[str, str]], int]],
) -> list[GroupMappingDataset]:
    return [GroupMappingDataset(
        dataset_id=dataset.id, dataset_version_id=version.id, session_count=count,
    ) for dataset, version, _, count in schemas]


def _shared_group_mapping(
    db: Session,
    schemas: list[tuple[Dataset, DatasetVersion, list[dict[str, str]], int]],
) -> dict[str, str]:
    shared: dict[str, str] | None = None
    for dataset, version, columns, _ in schemas:
        mapping = _mapping_dict(_mapping_for_version(db, dataset.id, version.id))
        if set(mapping) - {column["name"] for column in columns}:
            mapping = {}
        if shared is not None and mapping != shared:
            raise DatasetMappingConflictError(
                "Các Dataset trong nhóm đang có mapping khác nhau; hãy đồng bộ mapping từng Dataset trước"
            )
        shared = mapping
    return shared or {}


def get_group_dataset_columns(db: Session, group_id: UUID) -> GroupDatasetColumnsResponse:
    schemas = _group_schemas(db, group_id)
    return GroupDatasetColumnsResponse(
        group_id=group_id, dataset_count=len(schemas),
        session_count=sum(count for _, _, _, count in schemas),
        datasets=_group_dataset_items(schemas),
        columns=[DatasetColumnInfo(
            source_column=column["name"], data_type=column["type"],
            mapped_column=None, is_mapped=False,
        ) for column in schemas[0][2]],
    )


def get_group_dataset_mappings(db: Session, group_id: UUID) -> GroupDatasetMappingsResponse:
    schemas = _group_schemas(db, group_id)
    shared = _shared_group_mapping(db, schemas)
    return GroupDatasetMappingsResponse(
        group_id=group_id, dataset_count=len(schemas),
        session_count=sum(count for _, _, _, count in schemas),
        datasets=_group_dataset_items(schemas),
        mappings=[DatasetColumnMappingItem(source_column=source, target_column=target)
                  for source, target in shared.items()],
    )


def patch_group_dataset_mappings(
    db: Session, *, group_id: UUID,
    requested_mappings: list[DatasetColumnMappingInput], user: User,
) -> GroupDatasetMappingsResponse:
    # Validate every dataset and session before writing any mapping.
    schemas = _group_schemas(db, group_id)
    source_columns = [column["name"] for column in schemas[0][2]]
    requested_sources = [item.source_column for item in requested_mappings]
    duplicates = sorted(source for source, count in Counter(requested_sources).items() if count > 1)
    if duplicates:
        raise DatasetMappingValidationError(
            "Cột nguồn xuất hiện nhiều lần trong request: " + ", ".join(duplicates)
        )
    missing = sorted(set(requested_sources) - set(source_columns))
    if missing:
        raise DatasetMappingValidationError(
            "Không tìm thấy cột nguồn trong nhóm Dataset: " + ", ".join(missing)
        )
    # A group request is the desired shared mapping, replacing divergent old maps.
    merged: dict[str, str] = {}
    for item in requested_mappings:
        if item.target_column is None:
            merged.pop(item.source_column, None)
        else:
            merged[item.source_column] = item.target_column
    _validate_mappings(source_columns, merged)
    updates = [(
        dataset.id, version.id,
        [{"source_column": source, "target_column": target}
         for source, target in merged.items()],
    ) for dataset, version, _, _ in schemas]
    crud_dataset.save_group_column_mappings(db, updates=updates, user_id=user.id)
    return GroupDatasetMappingsResponse(
        group_id=group_id, dataset_count=len(schemas),
        session_count=sum(count for _, _, _, count in schemas),
        datasets=_group_dataset_items(schemas),
        mappings=[DatasetColumnMappingItem(source_column=source, target_column=target)
                  for source, target in merged.items()],
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
            and getattr(saved_mapping, "dataset_version_id", version.id) != version.id
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
