"""Admin review of the exported versions belonging to a Dataset group."""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.crud import crud_admin, crud_dataset
from app.models.dataset import DatasetVersion
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
from app.services.dataset_group_version_service import get_exported_group_versions
from app.services.dataset_review_service import list_recording_sessions, preview_recording_session
from app.services.dataset_version_service import build_dataset_version_item


def list_groups_for_review(
    db: Session, *, skip: int, limit: int,
) -> list[AdminGroupApprovalSummary]:
    groups: list[AdminGroupApprovalSummary] = []
    for group_id in crud_admin.list_submitted_group_ids(db):
        try:
            _, versions = get_exported_group_versions(db, group_id)
        except HTTPException as exc:
            if exc.status_code in (404, 409):
                continue
            raise
        submitted = sum(version.approval_status == "SUBMITTED" for version in versions)
        if not submitted:
            continue
        group = crud_dataset.get_dataset_group_by_id(db, group_id)
        groups.append(AdminGroupApprovalSummary(
            group_id=group_id, group_name=group.name, drone_id=group.drone_id,
            total_datasets=len(versions), submitted_datasets=submitted,
            approved_datasets=sum(version.approval_status == "APPROVED" for version in versions),
            rejected_datasets=sum(version.approval_status == "REJECTED" for version in versions),
        ))
    return groups[skip:skip + limit]


def list_group_datasets_for_review(db: Session, group_id: UUID) -> GroupDatasetListResponse:
    _, versions = get_exported_group_versions(db, group_id)
    group = crud_dataset.get_dataset_group_by_id(db, group_id)
    items = []
    for version in versions:
        dataset = version.dataset
        source = build_dataset_version_item(db, version)
        items.append(UploadedDatasetSummary(
            dataset_id=dataset.id, group_id=group_id, group_name=group.name,
            name=dataset.name, version_id=version.id, version=version.version_tag,
            drone_id=dataset.drone_id, recording_date=dataset.recording_date,
            total_sessions=source.source_session_count,
            approval_status=version.approval_status,
        ))
    return GroupDatasetListResponse(
        group_id=group_id, group_name=group.name, datasets=items, total=len(items),
    )


def _selected_version(db: Session, group_id: UUID, dataset_id: UUID) -> DatasetVersion:
    _, versions = get_exported_group_versions(db, group_id)
    for version in versions:
        if version.dataset_id == dataset_id:
            return version
    raise HTTPException(404, "Dataset không thuộc lần Export hoàn tất của nhóm")


def list_group_sessions_for_review(
    db: Session, group_id: UUID, dataset_id: UUID, *, page: int, page_size: int,
) -> RecordingSessionListResponse:
    version = _selected_version(db, group_id, dataset_id)
    return list_recording_sessions(db, dataset_id, version.id, page=page, page_size=page_size)


def preview_group_session_for_review(
    db: Session, group_id: UUID, dataset_id: UUID, session_id: UUID,
    *, page: int, limit: int, column_offset: int, representation: str,
) -> RecordingSessionPreviewResponse:
    version = _selected_version(db, group_id, dataset_id)
    return preview_recording_session(
        db, dataset_id, version.id, session_id, page=page, limit=limit,
        column_offset=column_offset, representation=representation,
    )


def review_group(
    db: Session, group_id: UUID, action: DatasetApprovalAction, admin: User,
) -> AdminGroupReviewResponse:
    _, exported = get_exported_group_versions(db, group_id)
    locked = crud_admin.lock_dataset_versions(db, [version.id for version in exported])
    if len(locked) != len(exported):
        db.rollback()
        raise HTTPException(409, "Các phiên bản của nhóm đã thay đổi; vui lòng tải lại")
    submitted = [version for version in locked if version.approval_status == "SUBMITTED"]
    if not submitted:
        db.rollback()
        raise HTTPException(409, "Nhóm không có phiên bản đã gửi cần xét duyệt")
    for version in submitted:
        version.approval_status = action.status
        version.approved_by = admin.id
        version.approval_note = action.note
    db.commit()
    record_audit_event(
        user=admin, action="REVIEW_DATASET_GROUP", module="Dataset",
        status="SUCCESS", description="Dataset group versions reviewed",
        resource_id=group_id,
        details={"status": action.status, "version_ids": [str(item.id) for item in submitted]},
    )
    statuses = {version.approval_status for version in locked}
    return AdminGroupReviewResponse(
        group_id=group_id,
        status=statuses.pop() if len(statuses) == 1 else "MIXED",
        reviewed_versions=len(submitted), version_ids=[version.id for version in submitted],
    )
