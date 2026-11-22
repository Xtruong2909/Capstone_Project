"""Admin review of the exported dataset_files belonging to a Dataset group."""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.crud import crud_admin, crud_dataset
from app.models.dataset import DatasetFile
from app.models.user import User
from app.schemas.admin import (
    AdminGroupApprovalSummary,
    AdminGroupReviewResponse,
    DatasetApprovalAction,
)
from app.schemas.dataset import (
    GroupDatasetListResponse,
    RecordingSessionListResponse,
    RecordingSessionPreviewResponse,
    UploadedDatasetSummary,
)
from app.services.audit_log_service import record_audit_event
from app.services.dataset_file_service import build_dataset_file_item
from app.services.dataset_group_file_service import get_exported_group_files
from app.services.dataset_review_service import list_recording_sessions, preview_recording_session


def list_groups_for_review(
    db: Session, *, skip: int, limit: int,
) -> list[AdminGroupApprovalSummary]:
    groups: list[AdminGroupApprovalSummary] = []
    for group_id in crud_admin.list_submitted_group_ids(db):
        try:
            _, dataset_files = get_exported_group_files(db, group_id)
        except HTTPException as exc:
            if exc.status_code in (404, 409):
                continue
            raise
        submitted = sum(dataset_file.approval_status == "SUBMITTED" for dataset_file in dataset_files)
        if not submitted:
            continue
        group = crud_dataset.get_dataset_group_by_id(db, group_id)
        groups.append(AdminGroupApprovalSummary(
            group_id=group_id, group_name=group.name, drone_id=group.drone_id,
            total_datasets=len(dataset_files), submitted_datasets=submitted,
            approved_datasets=sum(dataset_file.approval_status == "APPROVED" for dataset_file in dataset_files),
            rejected_datasets=sum(dataset_file.approval_status == "REJECTED" for dataset_file in dataset_files),
        ))
    return groups[skip:skip + limit]


def list_group_datasets_for_review(db: Session, group_id: UUID) -> GroupDatasetListResponse:
    _, dataset_files = get_exported_group_files(db, group_id)
    group = crud_dataset.get_dataset_group_by_id(db, group_id)
    items = []
    for dataset_file in dataset_files:
        dataset = dataset_file.dataset
        source = build_dataset_file_item(db, dataset_file)
        items.append(UploadedDatasetSummary(
            dataset_id=dataset.id, group_id=group_id, group_name=group.name,
            name=dataset.name, file_id=dataset_file.id,
            drone_id=dataset.drone_id, recording_date=dataset.recording_date,
            total_sessions=source.source_session_count,
            approval_status=dataset_file.approval_status,
        ))
    return GroupDatasetListResponse(
        group_id=group_id, group_name=group.name, datasets=items, total=len(items),
    )


def _selected_file(db: Session, group_id: UUID, dataset_id: UUID) -> DatasetFile:
    _, dataset_files = get_exported_group_files(db, group_id)
    for dataset_file in dataset_files:
        if dataset_file.dataset_id == dataset_id:
            return dataset_file
    raise HTTPException(404, "Dataset không thuộc lần Export hoàn tất của nhóm")


def list_group_sessions_for_review(
    db: Session, group_id: UUID, dataset_id: UUID, *, page: int, page_size: int,
) -> RecordingSessionListResponse:
    dataset_file = _selected_file(db, group_id, dataset_id)
    return list_recording_sessions(db, dataset_id, dataset_file.id, page=page, page_size=page_size)


def preview_group_session_for_review(
    db: Session, group_id: UUID, dataset_id: UUID, session_id: UUID,
    *, page: int, limit: int, column_offset: int, representation: str,
) -> RecordingSessionPreviewResponse:
    dataset_file = _selected_file(db, group_id, dataset_id)
    return preview_recording_session(
        db, dataset_id, dataset_file.id, session_id, page=page, limit=limit,
        column_offset=column_offset, representation=representation,
    )


def review_group(
    db: Session, group_id: UUID, action: DatasetApprovalAction, admin: User,
) -> AdminGroupReviewResponse:
    _, exported = get_exported_group_files(db, group_id)
    locked = crud_admin.lock_dataset_files(db, [dataset_file.id for dataset_file in exported])
    if len(locked) != len(exported):
        db.rollback()
        raise HTTPException(409, "Các dữ liệu của nhóm đã thay đổi; vui lòng tải lại")
    submitted = [dataset_file for dataset_file in locked if dataset_file.approval_status == "SUBMITTED"]
    if not submitted:
        db.rollback()
        raise HTTPException(409, "Nhóm không có dữ liệu đã gửi cần xét duyệt")
    for dataset_file in submitted:
        dataset_file.approval_status = action.status
        dataset_file.approved_by = admin.id
        dataset_file.approval_note = action.note
    db.commit()
    record_audit_event(
        user=admin, action="REVIEW_DATASET_GROUP", module="Dataset",
        status="SUCCESS", description="Dataset group dataset_files reviewed",
        resource_id=group_id,
        details={"status": action.status, "file_ids": [str(item.id) for item in submitted]},
    )
    statuses = {dataset_file.approval_status for dataset_file in locked}
    return AdminGroupReviewResponse(
        group_id=group_id,
        status=statuses.pop() if len(statuses) == 1 else "MIXED",
        reviewed_files=len(submitted), file_ids=[dataset_file.id for dataset_file in submitted],
    )
