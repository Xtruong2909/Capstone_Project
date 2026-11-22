"""Dataset and recording-session review for uploaded pNEUMA CSVs."""

import csv
from datetime import date
from itertools import chain
from pathlib import Path
from typing import TextIO
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.crud import crud_dataset
from app.models.dataset import Dataset, DatasetFile, RecordingSession
from app.models.user import User
from app.schemas.dataset import (
    DatasetPreviewColumn,
    DatasetPreviewPagination,
    GroupDatasetListResponse,
    RecordingSessionDetail,
    RecordingSessionListResponse,
    RecordingSessionPreviewResponse,
    UploadedDatasetDetail,
    UploadedDatasetGroupSummary,
    UploadedDatasetListResponse,
    UploadedDatasetSummary,
)
from app.services.dataset_mapping_service import apply_saved_column_mappings
from app.services.dataset_preview_service import (
    DatasetPreviewFormatError,
    DatasetPreviewNotFoundError,
    DatasetPreviewReadError,
    _csv_dialect,
    _detect_csv_header,
    _read_csv,
    resolve_stored_file_path,
)

MAX_PREVIEW_COLUMNS = 512
MAX_PREVIEW_PHYSICAL_LINE_BYTES = 16 * 1024 * 1024


def _is_recording_dataset(dataset: Dataset | None) -> bool:
    return dataset is not None and dataset.drone_id is not None and dataset.recording_date is not None


def _summary(dataset: Dataset, dataset_file: DatasetFile, count: int) -> UploadedDatasetSummary:
    return UploadedDatasetSummary(
        dataset_id=dataset.id, group_id=dataset.group_id,
        group_name=dataset.group.name if dataset.group is not None else None,
        name=dataset.name, file_id=dataset_file.id,
        drone_id=dataset.drone_id,
        recording_date=dataset.recording_date, total_sessions=count,
        approval_status=dataset_file.approval_status,
    )


def list_datasets_in_group(db: Session, group_id: UUID, user: User) -> GroupDatasetListResponse:
    """List only accessible recording datasets in the requested group."""
    if user.role_id in ("data_engineer", "admin"):
        visible_user_id = None
    elif user.role_id in ("data_scientist", "business_user"):
        visible_user_id = user.id
    else:
        raise HTTPException(403, "Không có quyền xem Dataset")
    group = crud_dataset.get_dataset_group_by_id(db, group_id)
    if group is None:
        raise DatasetPreviewNotFoundError("Không tìm thấy nhóm Dataset")
    owner_scope = {"owner_id": user.id} if user.role_id == "data_engineer" else {}
    datasets = crud_dataset.list_group_datasets(db, group_id, visible_user_id, **owner_scope)
    if user.role_id == "data_engineer" and not datasets:
        raise DatasetPreviewNotFoundError("Không tìm thấy nhóm Dataset thuộc tài khoản của bạn")
    if visible_user_id is not None and not datasets:
        raise DatasetPreviewNotFoundError("Không tìm thấy nhóm Dataset được cấp quyền")
    items: list[UploadedDatasetSummary] = []
    for dataset in datasets:
        if not _is_recording_dataset(dataset):
            continue
        pair = (
            crud_dataset.get_dataset_latest_approved_file(db, dataset.id)
            if visible_user_id is not None
            else crud_dataset.get_dataset_latest_file(db, dataset.id)
        )
        if pair is None:
            continue
        dataset_file = pair[1]
        linked_count = crud_dataset.get_file_session_counts(db, [dataset_file.id]).get(dataset_file.id, 0)
        items.append(_summary(dataset, dataset_file, _effective_session_count(db, dataset_file, linked_count)))
    if visible_user_id is not None and not items:
        raise DatasetPreviewNotFoundError("Không tìm thấy Dataset đã duyệt được cấp quyền")
    return GroupDatasetListResponse(
        group_id=group_id, group_name=group.name, datasets=items, total=len(items),
    )


def resolve_group_dataset_file(
    db: Session, group_id: UUID, dataset_id: UUID, user: User,
) -> DatasetFile:
    """Select the newest dataset_file visible to this reader after checking group membership."""
    dataset = crud_dataset.get_dataset_by_id(db, dataset_id)
    if not _is_recording_dataset(dataset) or dataset.group_id != group_id:
        raise DatasetPreviewNotFoundError("Dataset không thuộc nhóm đã chọn")
    pair = (
        crud_dataset.get_dataset_latest_approved_file(db, dataset_id)
        if user.role_id in ("data_scientist", "business_user")
        else crud_dataset.get_dataset_latest_file(db, dataset_id)
    )
    if pair is None:
        raise DatasetPreviewNotFoundError("Không tìm thấy dữ liệu Dataset phù hợp")
    return pair[1]


def list_uploaded_datasets(
    db: Session, user: User, *, search: str | None, page: int, page_size: int,
    group_id: UUID | None = None,
    drone_id: str | None = None,
    recording_date_from: date | None = None,
    recording_date_to: date | None = None,
) -> UploadedDatasetListResponse:
    """List groups once; expand their datasets only when a group is selected."""
    if user.role_id in ("data_engineer", "admin"):
        visible_user_id = None
    elif user.role_id in ("data_scientist", "business_user"):
        visible_user_id = user.id
    else:
        raise HTTPException(403, "Không có quyền xem Dataset")
    datasets, total = crud_dataset.list_uploaded_datasets(
        db, search=search, page=page, page_size=page_size,
        visible_user_id=visible_user_id,
        **({"owner_id": user.id} if user.role_id == "data_engineer" else {}),
        group_id=group_id,
        drone_id=drone_id,
        recording_date_from=recording_date_from,
        recording_date_to=recording_date_to,
    )
    dataset_files = crud_dataset.get_latest_files_for_datasets(
        db, [dataset.id for dataset in datasets],
    )
    counts = crud_dataset.get_file_session_counts(
        db, [dataset_file.id for dataset_file in dataset_files.values()],
    )
    grouped: dict[UUID, list[UploadedDatasetSummary]] = {}
    first_dataset: dict[UUID, Dataset] = {}
    for dataset in datasets:
        dataset_file = dataset_files.get(dataset.id)
        if dataset.group_id is None or dataset_file is None:
            continue
        first_dataset.setdefault(dataset.group_id, dataset)
        grouped.setdefault(dataset.group_id, []).append(_summary(
            dataset, dataset_file,
            _effective_session_count(db, dataset_file, counts.get(dataset_file.id, 0)),
        ))
    approval_counts = crud_dataset.get_group_approval_counts(
        db, list(grouped), owner_id=user.id if user.role_id == "data_engineer" else None,
        visible_user_id=visible_user_id,
    )
    return UploadedDatasetListResponse(
        groups=[UploadedDatasetGroupSummary(
            group_id=key,
            group_name=items[0].group_name,
            source=(first_dataset[key].group.source
                    if first_dataset[key].group is not None else first_dataset[key].source),
            drone_id=first_dataset[key].drone_id,
            dataset_count=len(items),
            total_sessions=sum(item.total_sessions for item in items),
            approval_status=(next(iter(approval_counts[key])) if len(approval_counts.get(key, {})) == 1
                             else "MIXED" if approval_counts.get(key) else "UNKNOWN"),
            approval_counts=approval_counts.get(key, {}),
            datasets=items if group_id is not None else None,
        ) for key, items in grouped.items()],
        total=total, page=page, page_size=page_size,
    )


def get_uploaded_dataset_detail(db: Session, dataset_id: UUID, user: User) -> UploadedDatasetDetail:
    dataset = crud_dataset.get_dataset_by_id(db, dataset_id)
    if not _is_recording_dataset(dataset):
        raise DatasetPreviewNotFoundError("Không tìm thấy Dataset pNEUMA đã upload")
    pair = crud_dataset.get_dataset_latest_file(db, dataset_id)
    if pair is None:
        raise DatasetPreviewNotFoundError("Dataset chưa có dữ liệu")
    _, dataset_file = pair
    linked_count = crud_dataset.get_file_session_counts(db, [dataset_file.id]).get(dataset_file.id, 0)
    count = _effective_session_count(db, dataset_file, linked_count)
    related: list[UploadedDatasetSummary] = []
    if dataset.group_id is not None:
        visible_user_id = user.id if user.role_id in ("data_scientist", "business_user") else None
        members = crud_dataset.list_group_datasets(db, dataset.group_id, visible_user_id,
            **({"owner_id": user.id} if user.role_id == "data_engineer" else {}))
        latest = crud_dataset.get_latest_files_for_datasets(db, [item.id for item in members])
        counts = crud_dataset.get_file_session_counts(db, [item.id for item in latest.values()])
        related = [
            _summary(item, latest[item.id], _effective_session_count(
                db, latest[item.id], counts.get(latest[item.id].id, 0),
            ))
            for item in members if item.id in latest
        ]
    return UploadedDatasetDetail(
        **_summary(dataset, dataset_file, count).model_dump(),
        source=dataset.source, location_name=dataset.location_name,
        description=dataset.description,
        related_datasets=related,
    )


def _get_file(db: Session, dataset_id: UUID, file_id: UUID) -> DatasetFile:
    pair = crud_dataset.get_dataset_file(db, dataset_id, file_id)
    if pair is None or not _is_recording_dataset(pair[0]):
        raise DatasetPreviewNotFoundError("Không tìm thấy dữ liệu Dataset pNEUMA")
    return pair[1]


def _session_provenance(
    db: Session, dataset_file: DatasetFile,
) -> tuple[list[UUID], UUID | None]:
    history = crud_dataset.get_cleaning_history_by_file(db, dataset_file.id)
    parameters = getattr(history, "parameters", None) or {}
    if not isinstance(parameters, dict):
        return [], None
    source_session_ids: list[UUID] = []
    for value in parameters.get("source_session_ids", []):
        try:
            source_session_ids.append(UUID(str(value)))
        except (TypeError, ValueError):
            continue
    try:
        source_file_id = UUID(str(parameters.get("source_file_id")))
    except (TypeError, ValueError):
        source_file_id = None
    return source_session_ids, source_file_id


def _effective_session_count(db: Session, dataset_file: DatasetFile, linked_count: int) -> int:
    """Keep the Dataset list accurate after export creates a derived dataset_file."""
    if linked_count:
        return linked_count
    source_session_ids, source_file_id = _session_provenance(db, dataset_file)
    if source_session_ids:
        return len(set(source_session_ids))
    if source_file_id and source_file_id != dataset_file.id:
        return crud_dataset.get_file_session_counts(db, [source_file_id]).get(
            source_file_id, 0,
        )
    return 0


def _get_recording_session_for_file(
    db: Session, dataset_id: UUID, file_id: UUID, session_id: UUID,
) -> RecordingSession | None:
    session = crud_dataset.get_file_session(db, file_id, session_id)
    if session is not None:
        return session if session.dataset_id == dataset_id else None

    dataset_file = _get_file(db, dataset_id, file_id)
    source_session_ids, source_file_id = _session_provenance(db, dataset_file)
    if source_session_ids:
        if session_id not in source_session_ids:
            return None
        return crud_dataset.get_dataset_session_by_id(db, dataset_id, session_id)
    if source_file_id and source_file_id != file_id:
        if crud_dataset.get_dataset_file(db, dataset_id, source_file_id) is None:
            return None
        return crud_dataset.get_file_session(db, source_file_id, session_id)
    return None


def _session_detail(
    session: RecordingSession, file_id: UUID, group_id: UUID | None,
) -> RecordingSessionDetail:
    return RecordingSessionDetail(
        session_id=session.id, dataset_id=session.dataset_id,
        group_id=group_id, file_id=file_id,
        original_filename=session.original_filename, drone_id=session.drone_id,
        recording_date=session.recording_date, file_size=session.file_size,
        scheduled_start=session.scheduled_start, scheduled_end=session.scheduled_end,
        scheduled_duration_seconds=int((session.scheduled_end - session.scheduled_start).total_seconds()),
        actual_duration_seconds=None, checksum=session.checksum,
        upload_status=session.upload_status, validation_status=None,
    )


def list_recording_sessions(
    db: Session, dataset_id: UUID, file_id: UUID, *, page: int, page_size: int,
) -> RecordingSessionListResponse:
    dataset_file = _get_file(db, dataset_id, file_id)
    sessions, total = crud_dataset.list_file_sessions(db, file_id, page, page_size)
    if total == 0:
        source_session_ids, source_file_id = _session_provenance(db, dataset_file)
        if source_session_ids:
            sessions, total = crud_dataset.list_dataset_sessions_by_ids(
                db, dataset_id, source_session_ids, page, page_size,
            )
        elif (
            source_file_id
            and source_file_id != file_id
            and crud_dataset.get_dataset_file(db, dataset_id, source_file_id) is not None
        ):
            sessions, total = crud_dataset.list_file_sessions(
                db, source_file_id, page, page_size,
            )
    dataset = crud_dataset.get_dataset_by_id(db, dataset_id)
    group_id = dataset.group_id if dataset is not None else None
    return RecordingSessionListResponse(
        dataset_id=dataset_id, file_id=file_id, total=total,
        page=page, page_size=page_size,
        sessions=[_session_detail(session, file_id, group_id) for session in sessions],
    )


def get_recording_session_detail(
    db: Session, dataset_id: UUID, file_id: UUID, session_id: UUID,
) -> RecordingSessionDetail:
    session = _get_recording_session_for_file(
        db, dataset_id, file_id, session_id,
    )
    if session is None or session.dataset_id != dataset_id:
        raise DatasetPreviewNotFoundError("Không tìm thấy Recording Session trong dữ liệu")
    dataset = crud_dataset.get_dataset_by_id(db, dataset_id)
    return _session_detail(session, file_id, dataset.group_id if dataset is not None else None)


def _bounded_lines(source: TextIO):
    while line := source.readline(MAX_PREVIEW_PHYSICAL_LINE_BYTES + 1):
        if len(line) > MAX_PREVIEW_PHYSICAL_LINE_BYTES:
            raise DatasetPreviewReadError("Dòng CSV vượt giới hạn 16 MiB cho Preview")
        yield line


def _column_names(header: list[str] | None, width: int, column_offset: int) -> list[str]:
    names = []
    seen: dict[str, int] = {}
    for index in range(min(width, column_offset + MAX_PREVIEW_COLUMNS)):
        name = (header[index].strip() if header and index < len(header) else "") or f"column_{index + 1}"
        seen[name] = seen.get(name, 0) + 1
        if index >= column_offset:
            names.append(name if seen[name] == 1 else f"{name}_{seen[name]}")
    return names


def _read_raw_csv_page(path: Path, *, page: int, page_size: int,
                       column_offset: int) -> tuple[
    list[DatasetPreviewColumn], list[dict[str, str | None]], int, int, bool, str, list[str]
]:
    """Read at most the requested page plus one lookahead row, never the whole file."""
    offset = (page - 1) * page_size
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        sample = source.readline(64 * 1024)
        source.seek(0)
        reader = csv.reader(_bounded_lines(source), _csv_dialect(sample), strict=True)
        first = next(reader, None)
        if not first or not any(value.strip() for value in first):
            raise DatasetPreviewReadError("CSV trống hoặc không có bản ghi hợp lệ")
        second = next(reader, None)
        has_header, header_warning = _detect_csv_header(first, [second] if second else [])
        width = max(len(first), len(second or []))
        header = first if has_header else None
        names = _column_names(header, width, column_offset)
        data_rows = chain(
            [] if has_header else [first],
            [second] if second else [],
            reader,
        )
        selected: list[dict[str, str | None]] = []
        rows_read = 0
        for values in data_rows:
            if not values or not any(value.strip() for value in values):
                continue
            rows_read += 1
            width = max(width, len(values))
            if rows_read <= offset:
                continue
            if (len(values) > column_offset + len(names)
                    and len(names) < MAX_PREVIEW_COLUMNS):
                expanded = _column_names(header, len(values), column_offset)
                for selected_row in selected:
                    selected_row.update({name: None for name in expanded[len(names):]})
                names = expanded
            if len(selected) <= page_size:
                selected.append({name: values[index + column_offset]
                                 if index + column_offset < len(values) else None
                                 for index, name in enumerate(names)})
            if len(selected) > page_size:
                break
    warnings = [header_warning] if header_warning else []
    if column_offset >= width:
        raise DatasetPreviewReadError("column_offset vượt số cột của CSV")
    if width > column_offset + MAX_PREVIEW_COLUMNS:
        warnings.append(
            f"CSV có ít nhất {width} cột; Preview chỉ hiển thị {MAX_PREVIEW_COLUMNS} cột "
            f"từ vị trí {column_offset + 1}. Dùng column_offset để xem tiếp."
        )
    detected_structure = "csv_with_header" if has_header else "csv_without_header"
    return ([DatasetPreviewColumn(name=name, type="string") for name in names],
            selected[:page_size], width, rows_read, len(selected) > page_size,
            detected_structure, warnings)


def preview_recording_session(
    db: Session, dataset_id: UUID, file_id: UUID, session_id: UUID,
    *, page: int, limit: int, column_offset: int = 0,
    representation: str = "normalized",
) -> RecordingSessionPreviewResponse:
    session = _get_recording_session_for_file(
        db, dataset_id, file_id, session_id,
    )
    if session is None:
        raise DatasetPreviewNotFoundError("Không tìm thấy Recording Session trong dữ liệu")
    dataset = crud_dataset.get_dataset_by_id(db, dataset_id)
    if not session.original_filename.lower().endswith(".csv"):
        raise DatasetPreviewFormatError("Recording Session không phải file CSV")
    path = resolve_stored_file_path(session.file_path)
    try:
        if representation == "normalized":
            if column_offset:
                raise DatasetPreviewReadError(
                    "column_offset chỉ áp dụng khi representation=raw"
                )
            preview = _read_csv(
                path, offset=(page - 1) * limit,
                page_size=limit, representation="normalized", build_index=False,
            )
            if preview.representation != "normalized":
                raise DatasetPreviewReadError(
                    "Session không đúng cấu trúc pNEUMA để xem dạng chuẩn hóa; "
                    "dùng representation=raw để xem CSV gốc"
                )
            columns, rows = preview.columns, preview.rows
            total_columns = len(columns)
            has_more = preview.has_more
            detected_structure, warnings = preview.detected_structure, preview.warnings
            total_rows = preview.total_rows
            rows_read = (page - 1) * limit + len(rows) + int(has_more)
        else:
            (columns, rows, total_columns, rows_read, has_more,
             detected_structure, warnings) = _read_raw_csv_page(
                path, page=page, page_size=limit, column_offset=column_offset,
            )
            total_rows = None
    except DatasetPreviewReadError:
        raise
    except (UnicodeDecodeError, csv.Error, OSError, ValueError) as exc:
        raise DatasetPreviewReadError("Không đọc được CSV của Recording Session") from exc
    response = RecordingSessionPreviewResponse(
        session_id=session.id, dataset_id=dataset_id, file_id=file_id,
        dataset_file_id=file_id, dataset_name=dataset.name,
        original_filename=session.original_filename, columns=columns,
        file_format="csv", file_size=session.file_size, status=session.upload_status,
        detected_structure=detected_structure,
        representation=representation,
        total_columns=total_columns, column_offset=column_offset,
        has_more_columns=total_columns > column_offset + len(columns),
        rows=rows, rows_read=rows_read,
        pagination=DatasetPreviewPagination(
            page=page, page_size=limit, returned_rows=len(rows), has_more=has_more,
            total_rows=total_rows,
        ),
        warnings=warnings,
    )
    # Keep `raw` as an exact view of the uploaded CSV. The normalized review
    # view uses the Dataset mapping so users see canonical column names.
    if representation == "normalized":
        mapped_response = apply_saved_column_mappings(
            db, dataset_id=dataset_id, preview=response,
        )
        mapped_response.mapping_applied = [
            column.name for column in mapped_response.columns
        ] != [column.name for column in response.columns]
        response = mapped_response
    return response
