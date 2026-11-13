"""Group-scoped version review using the versions from one completed export."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.crud import crud_dataset
from app.models.dataset import Dataset, DatasetGroupProcessingJob, DatasetVersion
from app.models.user import User
from app.schemas.dataset_normalization import (
    DatasetVersionStatusResponse,
    GroupDatasetVersionsResponse,
    GroupProcessingReportResponse,
    GroupVersionStatusResponse,
)
from app.services.audit_log_service import record_audit_event
from app.services.dataset_normalization_service import get_processing_report_service
from app.services.dataset_version_service import build_dataset_version_item


def _group_datasets(db: Session, group_id: UUID) -> list[Dataset]:
    if crud_dataset.get_dataset_group_by_id(db, group_id) is None:
        raise HTTPException(404, "Không tìm thấy nhóm Dataset")
    datasets = crud_dataset.list_group_datasets(db, group_id, None)
    if not datasets:
        raise HTTPException(404, "Nhóm Dataset chưa có Dataset")
    return datasets


def list_group_versions(
    db: Session, group_id: UUID, approval_status: str | None = None,
) -> GroupDatasetVersionsResponse:
    datasets = _group_datasets(db, group_id)
    versions = crud_dataset.list_group_dataset_versions(db, group_id, approval_status)
    return GroupDatasetVersionsResponse(
        group_id=group_id,
        total_datasets=len(datasets),
        total_versions=len(versions),
        versions=[build_dataset_version_item(db, version) for version in versions],
    )


def get_exported_group_versions(
    db: Session, group_id: UUID,
) -> tuple[DatasetGroupProcessingJob, list[DatasetVersion]]:
    datasets = _group_datasets(db, group_id)
    job = crud_dataset.get_latest_completed_group_export_job(db, group_id)
    if job is None:
        raise HTTPException(409, "Nhóm chưa Export thành công tất cả Dataset")
    try:
        exported_ids = {
            UUID(item["dataset_id"]): UUID(item["version_id"])
            for item in job.results if item["status"] == "COMPLETED"
        }
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(409, "Kết quả Export của nhóm không hợp lệ") from exc
    if len(job.results) != len(datasets) or set(exported_ids) != {item.id for item in datasets}:
        raise HTTPException(409, "Nhóm đã thay đổi; hãy Normalize và Export lại")
    versions = crud_dataset.get_group_dataset_versions_by_ids(
        db, group_id, list(exported_ids.values()),
    )
    by_id = {version.id: version for version in versions}
    if len(by_id) != len(datasets) or any(
        by_id.get(version_id) is None or by_id[version_id].dataset_id != dataset_id
        for dataset_id, version_id in exported_ids.items()
    ):
        raise HTTPException(409, "Phiên bản Export không còn thuộc nhóm Dataset")
    return job, [by_id[exported_ids[dataset.id]] for dataset in datasets]


def _group_status(
    db: Session, group_id: UUID,
    job: DatasetGroupProcessingJob, versions: list[DatasetVersion],
    message: str | None = None,
) -> GroupVersionStatusResponse:
    items = [DatasetVersionStatusResponse.model_validate(
        build_dataset_version_item(db, version).model_dump(),
    ) for version in versions]
    statuses = {item.approval_status for item in items}
    return GroupVersionStatusResponse(
        group_id=group_id,
        staging_id=job.staging_id,
        total_datasets=len(versions),
        approval_status=statuses.pop() if len(statuses) == 1 else "MIXED",
        versions=items,
        message=message,
    )


def get_group_version_status(db: Session, group_id: UUID) -> GroupVersionStatusResponse:
    job, versions = get_exported_group_versions(db, group_id)
    return _group_status(db, group_id, job, versions)


def get_group_processing_report(
    db: Session, group_id: UUID,
) -> GroupProcessingReportResponse:
    job, versions = get_exported_group_versions(db, group_id)
    reports = [get_processing_report_service(
        db=db, dataset_id=version.dataset_id, version_id=version.id,
    ) for version in versions]
    return GroupProcessingReportResponse(
        group_id=group_id,
        staging_id=job.staging_id,
        total_datasets=len(reports),
        total_sessions=sum(report.source_session_count for report in reports),
        total_records_before=sum(report.records_before for report in reports),
        total_records_after=sum(report.records_after for report in reports),
        reports=reports,
    )


def submit_group_versions(
    db: Session, group_id: UUID, user: User, note: str | None = None,
) -> GroupVersionStatusResponse:
    job, versions = get_exported_group_versions(db, group_id)
    if any(version.approval_status == "REJECTED" for version in versions):
        raise HTTPException(409, "Nhóm có phiên bản bị từ chối; hãy dùng API Resubmit")
    if any(version.approval_status not in {"PENDING", "SUBMITTED", "APPROVED"} for version in versions):
        raise HTTPException(409, "Nhóm có trạng thái phiên bản không hợp lệ")
    pending = [version for version in versions if version.approval_status == "PENDING"]
    if any(crud_dataset.get_cleaning_history_by_version(db, version.id) is None for version in pending):
        raise HTTPException(409, "Nhóm có phiên bản chưa được chuẩn hóa và Export")
    submitted_at = datetime.now(UTC)
    for version in pending:
        version.approval_status = "SUBMITTED"
        version.submitted_by = user.id
        version.submitted_at = submitted_at
        version.approved_by = None
        version.approval_note = note.strip() if note and note.strip() else "Đã gửi nhóm Dataset cho Admin phê duyệt"
    if pending:
        db.commit()
        record_audit_event(
            user=user, action="SUBMIT_DATASET_GROUP_FOR_REVIEW", module="Dataset",
            status="SUCCESS", description="Dataset group submitted for review",
            resource_id=group_id,
            details={"version_ids": [str(version.id) for version in pending]},
        )
    return _group_status(db, group_id, job, versions, "Đã gửi các phiên bản đủ điều kiện trong nhóm.")


def resubmit_group_versions(
    db: Session, group_id: UUID, user: User,
) -> GroupVersionStatusResponse:
    job, versions = get_exported_group_versions(db, group_id)
    rejected = [version for version in versions if version.approval_status == "REJECTED"]
    if not rejected:
        raise HTTPException(409, "Nhóm không có phiên bản bị từ chối để gửi lại")
    submitted_at = datetime.now(UTC)
    for version in rejected:
        version.approval_status = "SUBMITTED"
        version.submitted_by = user.id
        version.submitted_at = submitted_at
        version.approved_by = None
        version.approval_note = "Đã sửa theo phản hồi và gửi lại nhóm Dataset"
    db.commit()
    record_audit_event(
        user=user, action="RESUBMIT_DATASET_GROUP_FOR_REVIEW", module="Dataset",
        status="SUCCESS", description="Rejected Dataset group versions resubmitted",
        resource_id=group_id,
        details={"version_ids": [str(version.id) for version in rejected]},
    )
    return _group_status(db, group_id, job, versions, "Đã gửi lại các phiên bản bị từ chối.")
