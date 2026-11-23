"""Group-scoped dataset_file review using the dataset_files from one completed export."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.crud import crud_dataset
from app.models.dataset import Dataset, DatasetFile, DatasetGroupProcessingJob
from app.models.user import User
from app.schemas.dataset_normalization import (
    DatasetFileStatusResponse,
    GroupDatasetFilesResponse,
    GroupFileStatusResponse,
    GroupProcessingReportResponse,
)
from app.services.audit_log_service import record_audit_event
from app.services.dataset_file_service import build_dataset_file_item
from app.services.dataset_normalization_service import get_processing_report_service


def _group_datasets(db: Session, group_id: UUID, owner_id: UUID | None = None) -> list[Dataset]:
    if crud_dataset.get_dataset_group_by_id(db, group_id) is None:
        raise HTTPException(404, "Không tìm thấy nhóm Dataset")
    datasets = crud_dataset.list_group_datasets(db, group_id, None,
        **({"owner_id": owner_id} if owner_id is not None else {}))
    if not datasets:
        raise HTTPException(404, "Nhóm Dataset chưa có Dataset")
    return datasets


def list_group_files(
    db: Session, group_id: UUID, approval_status: str | None = None,
    *, owner_id: UUID | None = None,
) -> GroupDatasetFilesResponse:
    datasets = _group_datasets(db, group_id, owner_id)
    dataset_files = crud_dataset.list_group_dataset_files(db, group_id, approval_status,
        **({"owner_id": owner_id} if owner_id is not None else {}))
    return GroupDatasetFilesResponse(
        group_id=group_id,
        total_datasets=len(datasets),
        total_files=len(dataset_files),
        dataset_files=[build_dataset_file_item(db, dataset_file) for dataset_file in dataset_files],
    )


def get_exported_group_files(
    db: Session, group_id: UUID, *, owner_id: UUID | None = None,
) -> tuple[DatasetGroupProcessingJob, list[DatasetFile]]:
    datasets = _group_datasets(db, group_id, owner_id)
    job = crud_dataset.get_latest_completed_group_export_job(db, group_id,
        **({"owner_id": owner_id} if owner_id is not None else {}))
    if job is None:
        raise HTTPException(409, "Nhóm chưa Export thành công tất cả Dataset")
    try:
        exported_ids = {
            UUID(item["dataset_id"]): UUID(item["file_id"])
            for item in job.results if item["status"] == "COMPLETED"
        }
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(409, "Kết quả Export của nhóm không hợp lệ") from exc
    if len(job.results) != len(datasets) or set(exported_ids) != {item.id for item in datasets}:
        raise HTTPException(409, "Nhóm đã thay đổi; hãy Normalize và Export lại")
    dataset_files = crud_dataset.get_group_dataset_files_by_ids(
        db, group_id, list(exported_ids.values()),
    )
    by_id = {dataset_file.id: dataset_file for dataset_file in dataset_files}
    if len(by_id) != len(datasets) or any(
        by_id.get(file_id) is None or by_id[file_id].dataset_id != dataset_id
        for dataset_id, file_id in exported_ids.items()
    ):
        raise HTTPException(409, "dữ liệu Export không còn thuộc nhóm Dataset")
    return job, [by_id[exported_ids[dataset.id]] for dataset in datasets]


def _group_status(
    db: Session, group_id: UUID,
    job: DatasetGroupProcessingJob, dataset_files: list[DatasetFile],
    message: str | None = None,
) -> GroupFileStatusResponse:
    items = [DatasetFileStatusResponse.model_validate(
        build_dataset_file_item(db, dataset_file).model_dump(),
    ) for dataset_file in dataset_files]
    statuses = {item.approval_status for item in items}
    return GroupFileStatusResponse(
        group_id=group_id,
        staging_id=job.staging_id,
        total_datasets=len(dataset_files),
        approval_status=statuses.pop() if len(statuses) == 1 else "MIXED",
        dataset_files=items,
        message=message,
    )


def get_group_file_status(
    db: Session, group_id: UUID, *, owner_id: UUID | None = None,
) -> GroupFileStatusResponse:
    job, dataset_files = get_exported_group_files(db, group_id, owner_id=owner_id)
    return _group_status(db, group_id, job, dataset_files)


def get_group_processing_report(
    db: Session, group_id: UUID, *, owner_id: UUID | None = None,
) -> GroupProcessingReportResponse:
    job, dataset_files = get_exported_group_files(db, group_id, owner_id=owner_id)
    reports = [get_processing_report_service(
        db=db, dataset_id=dataset_file.dataset_id, file_id=dataset_file.id,
    ) for dataset_file in dataset_files]
    return GroupProcessingReportResponse(
        group_id=group_id,
        staging_id=job.staging_id,
        total_datasets=len(reports),
        total_sessions=sum(report.source_session_count for report in reports),
        total_records_before=sum(report.records_before for report in reports),
        total_records_after=sum(report.records_after for report in reports),
        reports=reports,
    )


def submit_group_files(
    db: Session, group_id: UUID, user: User, note: str | None = None,
) -> GroupFileStatusResponse:
    group = crud_dataset.get_dataset_group_by_id(db, group_id, for_update=True)
    if group is None:
        raise HTTPException(404, "Không tìm thấy nhóm Dataset")
    job, dataset_files = get_exported_group_files(db, group_id, owner_id=user.id)
    if any(dataset_file.approval_status == "REJECTED" for dataset_file in dataset_files):
        raise HTTPException(409, "Nhóm có dữ liệu bị từ chối; hãy dùng API Resubmit")
    if any(dataset_file.approval_status not in {"PENDING", "SUBMITTED", "APPROVED"} for dataset_file in dataset_files):
        raise HTTPException(409, "Nhóm có trạng thái dữ liệu không hợp lệ")
    pending = [dataset_file for dataset_file in dataset_files if dataset_file.approval_status == "PENDING"]
    if any(crud_dataset.get_cleaning_history_by_file(db, dataset_file.id) is None for dataset_file in pending):
        raise HTTPException(409, "Nhóm có dữ liệu chưa được chuẩn hóa và Export")
    submitted_at = datetime.now(UTC)
    if pending and group.first_submitted_at is None:
        group.first_submitted_at = submitted_at
    for dataset_file in pending:
        dataset_file.approval_status = "SUBMITTED"
        dataset_file.submitted_by = user.id
        dataset_file.submitted_at = submitted_at
        dataset_file.approved_by = None
        dataset_file.approval_note = note.strip() if note and note.strip() else "Đã gửi nhóm Dataset cho Admin phê duyệt"
    if pending:
        db.commit()
        record_audit_event(
            user=user, action="SUBMIT_DATASET_GROUP_FOR_REVIEW", module="Dataset",
            status="SUCCESS", description="Dataset group submitted for review",
            resource_id=group_id,
            details={"file_ids": [str(dataset_file.id) for dataset_file in pending]},
        )
    return _group_status(db, group_id, job, dataset_files, "Đã gửi các dữ liệu đủ điều kiện trong nhóm.")


def resubmit_group_files(
    db: Session, group_id: UUID, user: User,
) -> GroupFileStatusResponse:
    group = crud_dataset.get_dataset_group_by_id(db, group_id, for_update=True)
    if group is None:
        raise HTTPException(404, "Không tìm thấy nhóm Dataset")
    job, dataset_files = get_exported_group_files(db, group_id, owner_id=user.id)
    rejected = [dataset_file for dataset_file in dataset_files if dataset_file.approval_status == "REJECTED"]
    if not rejected:
        raise HTTPException(409, "Nhóm không có dữ liệu bị từ chối để gửi lại")
    submitted_at = datetime.now(UTC)
    if group.first_submitted_at is None:
        group.first_submitted_at = submitted_at
    for dataset_file in rejected:
        dataset_file.approval_status = "SUBMITTED"
        dataset_file.submitted_by = user.id
        dataset_file.submitted_at = submitted_at
        dataset_file.approved_by = None
        dataset_file.approval_note = "Đã sửa theo phản hồi và gửi lại nhóm Dataset"
    db.commit()
    record_audit_event(
        user=user, action="RESUBMIT_DATASET_GROUP_FOR_REVIEW", module="Dataset",
        status="SUCCESS", description="Rejected Dataset group dataset_files resubmitted",
        resource_id=group_id,
        details={"file_ids": [str(dataset_file.id) for dataset_file in rejected]},
    )
    return _group_status(db, group_id, job, dataset_files, "Đã gửi lại các dữ liệu bị từ chối.")
