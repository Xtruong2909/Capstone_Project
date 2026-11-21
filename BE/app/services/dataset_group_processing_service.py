"""Run normalization and export for every dated Dataset in a drone group."""

import logging
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import DATASET_UPLOAD_DIR
from app.crud import crud_dataset
from app.database.database import SessionLocal
from app.models.dataset import DatasetGroupProcessingJob
from app.models.user import User
from app.schemas.dataset_normalization import (
    DatasetExportRequest,
    GroupProcessingDatasetResult,
    GroupProcessingJobResponse,
)
from app.services.dataset_normalization_service import (
    export_normalized_dataset_service,
    normalize_dataset_structure_service,
)

logger = logging.getLogger(__name__)


def _response(job: DatasetGroupProcessingJob) -> GroupProcessingJobResponse:
    return GroupProcessingJobResponse(
        group_id=job.group_id,
        staging_id=job.staging_id,
        job_id=job.id,
        operation=job.operation,
        status=job.status,
        total_datasets=job.total_datasets,
        processed_datasets=job.processed_datasets,
        results=[GroupProcessingDatasetResult.model_validate(item) for item in job.results],
    )


def start_group_processing(
    db: Session, *, group_id: UUID, operation: str, user: User,
) -> GroupProcessingJobResponse:
    if crud_dataset.get_dataset_group_by_id(db, group_id) is None:
        raise HTTPException(404, "Không tìm thấy nhóm Dataset")
    datasets = crud_dataset.list_group_datasets(db, group_id, None)
    if not datasets:
        raise HTTPException(404, "Nhóm Dataset chưa có dữ liệu")
    if crud_dataset.get_active_group_processing_job(db, group_id) is not None:
        raise HTTPException(409, "Nhóm Dataset đang được xử lý; hãy xem tiến độ job hiện tại")

    source_results: dict[UUID, dict] = {}
    if operation == "EXPORT":
        normalize_job = crud_dataset.get_latest_group_normalize_job(db, group_id)
        if normalize_job is None:
            raise HTTPException(409, "Hãy chuẩn hóa nhóm Dataset trước khi xuất")
        source_results = {
            UUID(item["dataset_id"]): item for item in normalize_job.results
        }
        if any(
            item["status"] != "COMPLETED" or not item.get("staging_id")
            for item in source_results.values()
        ) or set(source_results) != {dataset.id for dataset in datasets}:
            raise HTTPException(409, "Chưa chuẩn hóa thành công tất cả Dataset trong nhóm")

        completed_export = crud_dataset.get_latest_completed_group_export_job(db, group_id)
        if (completed_export is not None
                and completed_export.staging_id == normalize_job.staging_id
                and completed_export.created_at >= normalize_job.updated_at):
            exported_results = completed_export.results
            if {UUID(item["dataset_id"]) for item in exported_results} == set(source_results) and all(
                item["status"] == "COMPLETED"
                and item.get("staging_id") == source_results[UUID(item["dataset_id"])]["staging_id"]
                for item in exported_results
            ):
                return _response(completed_export)

        staging_dir = DATASET_UPLOAD_DIR.resolve() / "staging"
        missing = [dataset.name for dataset in datasets if not (
            staging_dir / f"{source_results[dataset.id]['staging_id']}.json"
        ).is_file()]
        if missing:
            raise HTTPException(
                409,
                "File chuẩn hóa đã được sử dụng hoặc không còn tồn tại cho: "
                + ", ".join(missing)
                + ". Hãy chạy Normalize lại trước khi Export.",
            )

    results = []
    for dataset in datasets:
        item = GroupProcessingDatasetResult(
            dataset_id=dataset.id,
            dataset_name=dataset.name,
            status="PENDING",
            session_count=(source_results[dataset.id]["session_count"] if source_results else 0),
        ).model_dump(mode="json")
        if source_results:
            item["staging_id"] = source_results[dataset.id]["staging_id"]
        results.append(item)
    job_id = uuid4()
    job = DatasetGroupProcessingJob(
        id=job_id, group_id=group_id,
        staging_id=job_id if operation == "NORMALIZE" else normalize_job.staging_id,
        operation=operation, status="PENDING",
        total_datasets=len(datasets), processed_datasets=0,
        results=results, created_by=user.id,
    )
    return _response(crud_dataset.create_group_processing_job(db, job=job))


def get_group_processing_result(
    db: Session, *, group_id: UUID, job_id: UUID, user_id: UUID,
) -> GroupProcessingJobResponse:
    job = crud_dataset.get_group_processing_job(db, job_id)
    if job is None or job.group_id != group_id or job.created_by != user_id:
        raise HTTPException(404, "Không tìm thấy job chuẩn hóa/xuất dữ liệu")
    return _response(job)


def run_group_processing_job(job_id: UUID) -> None:
    """Use a new DB session because the request session is closed before this runs."""
    db = SessionLocal()
    try:
        job = crud_dataset.get_group_processing_job(db, job_id)
        if job is None:
            return
        user = db.get(User, job.created_by)
        if user is None:
            job.status = "FAILED"
            crud_dataset.save_group_processing_job(db, job)
            return
        job.status = "RUNNING"
        crud_dataset.save_group_processing_job(db, job)
        results = [dict(item) for item in job.results]
        for item in results:
            dataset_id = UUID(item["dataset_id"])
            item["status"] = "RUNNING"
            job.results = results
            crud_dataset.save_group_processing_job(db, job)
            try:
                if job.operation == "NORMALIZE":
                    normalized = normalize_dataset_structure_service(
                        db, dataset_id=dataset_id, user=user,
                    )
                    item.update(
                        status="COMPLETED",
                        session_count=normalized.source_session_count,
                        staging_id=str(normalized.staging_id),
                        source_version_id=str(normalized.source_version_id),
                        records_before=normalized.records_before,
                        records_after=normalized.records_after,
                    )
                else:
                    exported = export_normalized_dataset_service(
                        db, dataset_id=dataset_id,
                        payload=DatasetExportRequest(staging_id=UUID(item["staging_id"])),
                        user=user,
                    )
                    item.update(
                        status="COMPLETED",
                        session_count=exported.source_session_count,
                        source_version_id=str(exported.source_version_id),
                        version_id=str(exported.version_id),
                        records_after=exported.total_records,
                    )
            except Exception as exc:
                db.rollback()
                logger.exception("Group %s %s failed for dataset %s", job.group_id, job.operation, dataset_id)
                item.update(
                    status="FAILED",
                    error_message=str(exc.detail) if isinstance(exc, HTTPException) else "Xử lý Dataset thất bại; xem log server",
                )
            job.results = results
            job.processed_datasets += 1
            crud_dataset.save_group_processing_job(db, job)
        successes = sum(item["status"] == "COMPLETED" for item in results)
        job.status = (
            "COMPLETED" if successes == job.total_datasets else
            "PARTIAL_SUCCESS" if successes else "FAILED"
        )
        crud_dataset.save_group_processing_job(db, job)
    except Exception:
        logger.exception("Group processing job %s failed", job_id)
        db.rollback()
        job = crud_dataset.get_group_processing_job(db, job_id)
        if job is not None:
            job.status = "FAILED"
            crud_dataset.save_group_processing_job(db, job)
    finally:
        db.close()
