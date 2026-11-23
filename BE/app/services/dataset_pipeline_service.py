"""Recover the current batch workflow from persisted jobs and current source files."""

import hashlib
import json
from datetime import datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import DATASET_UPLOAD_DIR
from app.crud import crud_dataset
from app.models.dataset import Dataset, DatasetGroupProcessingJob
from app.schemas.dataset_normalization import GroupProcessingJobResponse
from app.schemas.dataset_pipeline import (
    GroupPipelineState,
    PipelineGroupListResponse,
    PipelineGroupSummary,
)
from app.services.storage_service import dataset_file_exists


def _after(value: datetime | None, baseline: datetime | None) -> bool:
    return bool(value and baseline and value.timestamp() > baseline.timestamp())


def build_group_pipeline_state(
    db: Session, group_id: UUID, owner_id: UUID, datasets: list[Dataset],
) -> GroupPipelineState:
    latest = crud_dataset.get_latest_group_processing_job(db, group_id, owner_id)
    source_parts: list[dict] = []
    exported = True
    mapped = True
    job_current = latest is not None
    export_dates: list[datetime | None] = []
    for dataset in sorted(datasets, key=lambda item: str(item.id)):
        current = dataset.dataset_files[0]
        sessions = current.recording_sessions
        session_ids = {str(item.id) for item in sessions}
        mapping = crud_dataset.get_dataset_column_mapping(db, dataset.id, current.id)
        mappings = mapping.mappings if mapping is not None else []
        mapped = mapped and bool(mappings)
        source_parts.append({"dataset": str(dataset.id), "file": str(current.id),
            "sessions": sorted((str(item.id), item.checksum) for item in sessions),
            "mappings": mappings})
        history = crud_dataset.get_cleaning_history_by_file(db, current.id)
        export_dates.append(history.created_at if history is not None else None)
        parameters = history.parameters if history is not None else {}
        expected_sessions = set((parameters or {}).get("source_session_ids", []))
        stored_path = current.data_file_path or current.parquet_file_path or current.csv_file_path
        file_exists = history is not None and dataset_file_exists(stored_path, upload_root=DATASET_UPLOAD_DIR)
        changed_after_export = history is not None and (
            any(_after(item.created_at, history.created_at) for item in sessions)
            or (mapping is not None and _after(mapping.updated_at, history.created_at)))
        exported = exported and bool(history and file_exists and not changed_after_export
            and (not expected_sessions or expected_sessions == session_ids))
        if latest is not None and (
            any(_after(item.created_at, latest.created_at) for item in sessions)
            or (mapping is not None and _after(mapping.updated_at, latest.created_at))
        ):
            job_current = False
    source_key = hashlib.sha256(json.dumps(source_parts, sort_keys=True).encode()).hexdigest()
    dataset_ids = {str(item.id) for item in datasets}
    if latest is not None and {item.get("dataset_id") for item in latest.results} != dataset_ids:
        job_current = False
    job = latest if job_current else None
    if job is not None:
        exported = exported and all(not _after(job.created_at, value) for value in export_dates)
    normalized = exported or bool(job and job.operation == "EXPORT")
    if job and job.operation == "NORMALIZE" and job.status == "COMPLETED":
        normalized = len(job.results) == len(datasets) and all(
            item.get("status") == "COMPLETED"
            and (DATASET_UPLOAD_DIR / "staging" / f"{UUID(item['staging_id'])}.parquet").is_file()
            for item in job.results if item.get("staging_id")
        ) and all(item.get("staging_id") for item in job.results)
    running = bool(job and job.status in {"PENDING", "RUNNING"})
    completed = exported and not running and all(
        item.dataset_files[0].approval_status in {"SUBMITTED", "APPROVED"} for item in datasets)
    step = 4 if exported else 3 if normalized else 2 if mapped else 1
    if job and (running or job.status in {"FAILED", "PARTIAL_SUCCESS"}):
        step = 2 if job.operation == "NORMALIZE" else 3
    return GroupPipelineState(
        group_id=group_id, source_key=source_key, step=step, mapped=mapped,
        normalized=normalized, exported=exported, completed=completed,
        job=_job_response(job) if job else None,
    )


def _job_response(job: DatasetGroupProcessingJob) -> GroupProcessingJobResponse:
    return GroupProcessingJobResponse(
        group_id=job.group_id, staging_id=job.staging_id, job_id=job.id,
        operation=job.operation, status=job.status, total_datasets=job.total_datasets,
        processed_datasets=job.processed_datasets, results=job.results,
    )


def get_group_pipeline_state(db: Session, group_id: UUID, owner_id: UUID) -> GroupPipelineState:
    datasets = crud_dataset.list_group_datasets(db, group_id, None, owner_id=owner_id)
    if not datasets:
        raise HTTPException(404, "Không tìm thấy batch thuộc tài khoản của bạn")
    return build_group_pipeline_state(db, group_id, owner_id, datasets)


def list_pipeline_groups(
    db: Session, owner_id: UUID, *, page: int, page_size: int, search: str | None,
) -> PipelineGroupListResponse:
    grouped: dict[UUID, list[Dataset]] = {}
    for dataset in crud_dataset.list_owned_pipeline_datasets(db, owner_id):
        grouped.setdefault(dataset.group_id, []).append(dataset)
    items: list[PipelineGroupSummary] = []
    for group_id, datasets in grouped.items():
        group = datasets[0].group
        if search and search.casefold() not in " ".join(
            [group.name or "", group.drone_id, *(item.name for item in datasets)],
        ).casefold():
            continue
        state = build_group_pipeline_state(db, group_id, owner_id, datasets)
        if state.completed:
            continue
        items.append(PipelineGroupSummary(
            group_id=group_id, group_name=group.name, source=group.source,
            drone_id=group.drone_id, dataset_count=len(datasets),
            total_sessions=sum(len(item.dataset_files[0].recording_sessions) for item in datasets),
            pipeline=state,
        ))
    return PipelineGroupListResponse(
        groups=items[(page - 1) * page_size:page * page_size], total=len(items), page=page, page_size=page_size,
    )
