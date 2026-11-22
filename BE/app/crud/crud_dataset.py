from datetime import date
from uuid import UUID

from sqlalchemy import func, or_, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, selectinload

from app.crud.crud_dataset_access import access_filter
from app.crud.crud_recording_metadata import resolve_original_filename
from app.models.dataset import (
    DataCleaningHistory,  # Import model đã có sẵn trong init_db
    Dataset,
    DatasetColumnMapping,
    DatasetFile,
    DatasetFileSession,
    DatasetGroup,
    DatasetGroupProcessingJob,
    DatasetUploadJob,
    RecordingSession,
)
from app.schemas.dataset import DatasetUploadMetadata
from app.services.audit_log_service import record_audit_event


def get_dataset_by_name(db: Session, name: str) -> Dataset | None:
    """Get a dataset by its unique catalog name."""
    return db.query(Dataset).filter(Dataset.name == name).first()


def get_or_create_dataset_group(db: Session, source: str, drone_id: str) -> DatasetGroup:
    """Return the persistent group shared by recording dates from one drone."""
    normalized_source = source.strip().lower()
    normalized_drone = drone_id.strip().lower()
    statement = insert(DatasetGroup).values(
        source=normalized_source, drone_id=normalized_drone,
    ).on_conflict_do_nothing(index_elements=["source", "drone_id"])
    db.execute(statement)
    group = db.query(DatasetGroup).filter(
        DatasetGroup.source == normalized_source,
        DatasetGroup.drone_id == normalized_drone,
    ).one()
    return group


def get_dataset_group_by_id(
    db: Session, group_id: UUID, *, for_update: bool = False,
) -> DatasetGroup | None:
    query = db.query(DatasetGroup).filter(DatasetGroup.id == group_id)
    return (query.with_for_update() if for_update else query).first()


def create_group_processing_job(
    db: Session, *, job: DatasetGroupProcessingJob,
) -> DatasetGroupProcessingJob:
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def get_group_processing_job(
    db: Session, job_id: UUID,
) -> DatasetGroupProcessingJob | None:
    return db.get(DatasetGroupProcessingJob, job_id)


def list_owned_pipeline_datasets(db: Session, owner_id: UUID) -> list[Dataset]:
    return db.query(Dataset).options(
        selectinload(Dataset.group),
        selectinload(Dataset.dataset_files).selectinload(DatasetFile.recording_sessions),
    ).filter(
        Dataset.created_by == owner_id, Dataset.group_id.is_not(None),
        Dataset.dataset_files.any(),
    ).order_by(Dataset.created_at.desc(), Dataset.id).all()


def get_latest_group_processing_job(
    db: Session, group_id: UUID, owner_id: UUID,
) -> DatasetGroupProcessingJob | None:
    return db.query(DatasetGroupProcessingJob).filter(
        DatasetGroupProcessingJob.group_id == group_id,
        DatasetGroupProcessingJob.created_by == owner_id,
    ).order_by(DatasetGroupProcessingJob.created_at.desc(), DatasetGroupProcessingJob.id.desc()).first()


def get_active_group_processing_job(
    db: Session, group_id: UUID, owner_id: UUID | None = None,
) -> DatasetGroupProcessingJob | None:
    query = db.query(DatasetGroupProcessingJob).filter(
        DatasetGroupProcessingJob.group_id == group_id,
        DatasetGroupProcessingJob.status.in_(("PENDING", "RUNNING")),
    )
    if owner_id is not None:
        query = query.filter(DatasetGroupProcessingJob.created_by == owner_id)
    return query.first()


def get_latest_group_normalize_job(
    db: Session, group_id: UUID, owner_id: UUID | None = None,
) -> DatasetGroupProcessingJob | None:
    query = db.query(DatasetGroupProcessingJob).filter(
        DatasetGroupProcessingJob.group_id == group_id,
        DatasetGroupProcessingJob.operation == "NORMALIZE",
        DatasetGroupProcessingJob.status.in_(("COMPLETED", "PARTIAL_SUCCESS")),
    )
    if owner_id is not None:
        query = query.filter(DatasetGroupProcessingJob.created_by == owner_id)
    return query.order_by(DatasetGroupProcessingJob.created_at.desc()).first()


def get_latest_completed_group_export_job(
    db: Session, group_id: UUID, owner_id: UUID | None = None,
) -> DatasetGroupProcessingJob | None:
    query = db.query(DatasetGroupProcessingJob).filter(
        DatasetGroupProcessingJob.group_id == group_id,
        DatasetGroupProcessingJob.operation == "EXPORT",
        DatasetGroupProcessingJob.status == "COMPLETED",
    )
    if owner_id is not None:
        query = query.filter(DatasetGroupProcessingJob.created_by == owner_id)
    return query.order_by(DatasetGroupProcessingJob.created_at.desc()).first()


def save_group_processing_job(db: Session, job: DatasetGroupProcessingJob) -> None:
    db.add(job)
    db.commit()


def list_group_datasets(
    db: Session, group_id: UUID, visible_user_id: UUID | None,
    *, owner_id: UUID | None = None,
) -> list[Dataset]:
    query = db.query(Dataset).options(selectinload(Dataset.group)).filter(
        Dataset.group_id == group_id, Dataset.dataset_files.any(),
    )
    if visible_user_id is not None:
        query = query.filter(access_filter(visible_user_id))
    if owner_id is not None:
        query = query.filter(Dataset.created_by == owner_id)
    return query.order_by(Dataset.recording_date, Dataset.id).all()


def list_group_dataset_files(
    db: Session, group_id: UUID, approval_status: str | None = None,
    *, owner_id: UUID | None = None,
) -> list[DatasetFile]:
    query = db.query(DatasetFile).join(Dataset).options(
        selectinload(DatasetFile.dataset),
    ).filter(Dataset.group_id == group_id)
    if approval_status is not None:
        query = query.filter(DatasetFile.approval_status == approval_status)
    if owner_id is not None:
        query = query.filter(Dataset.created_by == owner_id)
    return query.order_by(
        Dataset.recording_date, Dataset.id, DatasetFile.created_at.desc(),
    ).all()


def get_group_dataset_files_by_ids(
    db: Session, group_id: UUID, file_ids: list[UUID],
) -> list[DatasetFile]:
    if not file_ids:
        return []
    return db.query(DatasetFile).join(Dataset).options(
        selectinload(DatasetFile.dataset),
    ).filter(
        Dataset.group_id == group_id,
        DatasetFile.id.in_(file_ids),
    ).all()


def get_dataset_group_ids(db: Session, dataset_ids: list[UUID]) -> dict[UUID, UUID | None]:
    if not dataset_ids:
        return {}
    return dict(db.query(Dataset.id, Dataset.group_id).filter(Dataset.id.in_(dataset_ids)).all())


def get_group_approval_counts(
    db: Session, group_ids: list[UUID], *, owner_id: UUID | None = None,
    visible_user_id: UUID | None = None,
) -> dict[UUID, dict[str, int]]:
    if not group_ids:
        return {}
    query = db.query(Dataset.group_id, DatasetFile.approval_status, func.count(DatasetFile.id)).join(
        DatasetFile, DatasetFile.dataset_id == Dataset.id,
    ).filter(Dataset.group_id.in_(group_ids))
    if owner_id is not None:
        query = query.filter(Dataset.created_by == owner_id)
    if visible_user_id is not None:
        query = query.filter(access_filter(visible_user_id), DatasetFile.approval_status == "APPROVED")
    result: dict[UUID, dict[str, int]] = {}
    for group_id, approval_status, count in query.group_by(Dataset.group_id, DatasetFile.approval_status).all():
        result.setdefault(group_id, {})[approval_status] = count
    return result


def lock_dataset_upload(db: Session, name: str) -> None:
    """Serialize uploads for a dataset, including its first creation."""
    db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:name, 0))"), {"name": name})


def get_recording_sessions(db: Session, dataset_id: UUID) -> list[RecordingSession]:
    return db.query(RecordingSession).filter(RecordingSession.dataset_id == dataset_id).all()


def list_uploaded_datasets(
    db: Session, *, search: str | None, page: int, page_size: int,
    visible_user_id: UUID | None,
    owner_id: UUID | None = None,
    group_id: UUID | None = None,
    drone_id: str | None = None,
    recording_date_from: date | None = None,
    recording_date_to: date | None = None,
) -> tuple[list[Dataset], int]:
    """Page by group, then load only visible datasets in those groups."""
    query = db.query(Dataset).options(selectinload(Dataset.group)).filter(
        Dataset.drone_id.is_not(None), Dataset.recording_date.is_not(None),
        Dataset.group_id.is_not(None),
        Dataset.dataset_files.any(),
    )
    if visible_user_id is not None:
        query = query.filter(access_filter(visible_user_id))
    if owner_id is not None:
        query = query.filter(Dataset.created_by == owner_id)
    if search:
        pattern = f"%{search}%"
        query = query.filter(or_(
            Dataset.name.ilike(pattern),
            Dataset.group.has(DatasetGroup.name.ilike(pattern)),
        ))
    if group_id is not None:
        query = query.filter(Dataset.group_id == group_id)
    if drone_id is not None:
        query = query.filter(Dataset.drone_id == drone_id.lower())
    if recording_date_from is not None:
        query = query.filter(Dataset.recording_date >= recording_date_from)
    if recording_date_to is not None:
        query = query.filter(Dataset.recording_date <= recording_date_to)
    grouped = query.with_entities(Dataset.group_id).distinct()
    total = grouped.count()
    group_ids = [row[0] for row in grouped.order_by(Dataset.group_id).offset(
        (page - 1) * page_size,
    ).limit(page_size).all()]
    if not group_ids:
        return [], total
    rows = query.filter(Dataset.group_id.in_(group_ids)).order_by(
        Dataset.group_id, Dataset.recording_date, Dataset.id,
    ).all()
    return rows, total


def get_dataset_by_id(db: Session, dataset_id: UUID) -> Dataset | None:
    return db.get(Dataset, dataset_id)


def list_dataset_files(
    db: Session, *, dataset_id: UUID | None = None,
    approval_status: str | None = None, owner_id: UUID | None = None,
) -> list[DatasetFile]:
    query = db.query(DatasetFile).join(Dataset)
    if dataset_id is not None:
        query = query.filter(DatasetFile.dataset_id == dataset_id)
    if approval_status is not None:
        query = query.filter(DatasetFile.approval_status == approval_status)
    if owner_id is not None:
        query = query.filter(Dataset.created_by == owner_id)
    return query.order_by(DatasetFile.created_at.desc(), DatasetFile.id).all()


def group_has_other_owners(db: Session, group_id: UUID, owner_id: UUID) -> bool:
    return db.query(Dataset.id).filter(Dataset.group_id == group_id, or_(
        Dataset.created_by != owner_id, Dataset.created_by.is_(None),
    )).first() is not None


def get_latest_files_for_datasets(
    db: Session, dataset_ids: list[UUID],
) -> dict[UUID, DatasetFile]:
    if not dataset_ids:
        return {}
    dataset_files = db.query(DatasetFile).filter(
        DatasetFile.dataset_id.in_(dataset_ids),
    ).order_by(DatasetFile.created_at.desc(), DatasetFile.id.desc()).all()
    latest: dict[UUID, DatasetFile] = {}
    for dataset_file in dataset_files:
        latest.setdefault(dataset_file.dataset_id, dataset_file)
    return latest


def get_file_session_counts(db: Session, file_ids: list[UUID]) -> dict[UUID, int]:
    if not file_ids:
        return {}
    rows = db.query(
        DatasetFileSession.file_id, func.count(DatasetFileSession.session_id),
    ).filter(DatasetFileSession.file_id.in_(file_ids)).group_by(
        DatasetFileSession.file_id,
    ).all()
    return dict(rows)


def list_file_sessions(
    db: Session, file_id: UUID, page: int, page_size: int,
) -> tuple[list[RecordingSession], int]:
    query = db.query(RecordingSession).join(
        DatasetFileSession, DatasetFileSession.session_id == RecordingSession.id,
    ).filter(DatasetFileSession.file_id == file_id)
    total = query.count()
    sessions = query.order_by(
        RecordingSession.scheduled_start, RecordingSession.id,
    ).offset((page - 1) * page_size).limit(page_size).all()
    return sessions, total


def list_all_file_sessions(db: Session, file_id: UUID) -> list[RecordingSession]:
    """Return session metadata for schema compatibility checks within a dataset_file."""
    return db.query(RecordingSession).join(
        DatasetFileSession, DatasetFileSession.session_id == RecordingSession.id,
    ).filter(
        DatasetFileSession.file_id == file_id,
    ).order_by(
        RecordingSession.scheduled_start, RecordingSession.id,
    ).all()


def get_file_session(
    db: Session, file_id: UUID, session_id: UUID,
) -> RecordingSession | None:
    return db.query(RecordingSession).join(
        DatasetFileSession, DatasetFileSession.session_id == RecordingSession.id,
    ).filter(
        DatasetFileSession.file_id == file_id,
        RecordingSession.id == session_id,
    ).first()


def list_dataset_sessions_by_ids(
    db: Session,
    dataset_id: UUID,
    session_ids: list[UUID],
    page: int,
    page_size: int,
) -> tuple[list[RecordingSession], int]:
    """List provenance sessions by ID while keeping pagination in the database."""
    if not session_ids:
        return [], 0
    query = db.query(RecordingSession).filter(
        RecordingSession.dataset_id == dataset_id,
        RecordingSession.id.in_(session_ids),
    )
    total = query.count()
    sessions = query.order_by(
        RecordingSession.scheduled_start, RecordingSession.id,
    ).offset((page - 1) * page_size).limit(page_size).all()
    return sessions, total


def get_dataset_session_by_id(
    db: Session,
    dataset_id: UUID,
    session_id: UUID,
) -> RecordingSession | None:
    return db.query(RecordingSession).filter(
        RecordingSession.dataset_id == dataset_id,
        RecordingSession.id == session_id,
    ).first()


def add_recording_session(db: Session, session: RecordingSession) -> None:
    db.add(session)


def link_file_sessions(db: Session, file_id: UUID, session_ids: list[UUID]) -> None:
    existing = {row[0] for row in db.query(DatasetFileSession.session_id).filter(
        DatasetFileSession.file_id == file_id,
    ).all()}
    db.add_all(DatasetFileSession(file_id=file_id, session_id=session_id)
               for session_id in set(session_ids) - existing)


def create_upload_job(db: Session, job_id: UUID, creator_id: UUID, total_files: int) -> DatasetUploadJob:
    job = DatasetUploadJob(id=job_id, created_by=creator_id, total_files=total_files,
                           processed_files=0, status="PENDING")
    db.add(job)
    db.commit()
    return job


def get_upload_job(db: Session, job_id: UUID) -> DatasetUploadJob | None:
    return db.get(DatasetUploadJob, job_id)


def save_upload_job(db: Session, job: DatasetUploadJob) -> None:
    db.add(job)
    db.commit()


def get_dataset_latest_file(db: Session, dataset_id: UUID) -> tuple[Dataset, DatasetFile] | None:
    """Get a dataset and its latest uploaded dataset_file."""
    result = (
        db.query(Dataset, DatasetFile)
        .join(DatasetFile, DatasetFile.dataset_id == Dataset.id)
        .filter(Dataset.id == dataset_id)
        .order_by(DatasetFile.created_at.desc(), DatasetFile.id.desc())
        .first()
    )
    return result


def get_dataset_latest_approved_file(
    db: Session, dataset_id: UUID,
) -> tuple[Dataset, DatasetFile] | None:
    """Get the newest dataset_file approved for downstream Data Scientist access."""
    return (
        db.query(Dataset, DatasetFile)
        .join(DatasetFile, DatasetFile.dataset_id == Dataset.id)
        .filter(Dataset.id == dataset_id, DatasetFile.approval_status == "APPROVED")
        .order_by(DatasetFile.created_at.desc(), DatasetFile.id.desc())
        .first()
    )


def get_dataset_file(
    db: Session,
    dataset_id: UUID,
    dataset_file_id: UUID,
) -> tuple[Dataset, DatasetFile] | None:
    """Get a specific dataset_file belonging to a dataset."""
    return (
        db.query(Dataset, DatasetFile)
        .join(DatasetFile, DatasetFile.dataset_id == Dataset.id)
        .filter(
            Dataset.id == dataset_id,
            DatasetFile.id == dataset_file_id,
        )
        .first()
    )


def get_dataset_column_mapping(
    db: Session,
    dataset_id: UUID,
    dataset_file_id: UUID,
) -> DatasetColumnMapping | None:
    return (
        db.query(DatasetColumnMapping)
        .filter(
            DatasetColumnMapping.dataset_id == dataset_id,
            DatasetColumnMapping.dataset_file_id == dataset_file_id,
        )
        .first()
    )


def get_latest_dataset_column_mapping(
    db: Session,
    dataset_id: UUID,
) -> DatasetColumnMapping | None:
    """Get the most recently saved mapping so matching new dataset_files can reuse it."""
    return db.query(DatasetColumnMapping).filter(
        DatasetColumnMapping.dataset_id == dataset_id,
    ).order_by(
        DatasetColumnMapping.updated_at.desc(), DatasetColumnMapping.id.desc(),
    ).first()


def save_dataset_column_mapping(
    db: Session,
    *,
    dataset_id: UUID,
    dataset_file_id: UUID,
    mappings: list[dict[str, str | None]],
    user_id: UUID,
) -> DatasetColumnMapping:
    saved_mapping = get_dataset_column_mapping(db, dataset_id, dataset_file_id)
    if saved_mapping is None:
        saved_mapping = DatasetColumnMapping(
            dataset_id=dataset_id,
            dataset_file_id=dataset_file_id,
            mappings=mappings,
            updated_by=user_id,
        )
        db.add(saved_mapping)
    else:
        saved_mapping.dataset_file_id = dataset_file_id
        saved_mapping.mappings = mappings
        saved_mapping.updated_by = user_id

    db.commit()
    db.refresh(saved_mapping)
    record_audit_event(
        user_id=user_id,
        action="CONFIRM_DATASET_COLUMN_MAPPING",
        module="Dataset",
        status="SUCCESS",
        description="Dataset column mapping updated",
        resource_id=dataset_id,
        details={
            "dataset_file_id": str(dataset_file_id),
            "mapping_count": len(mappings),
        },
    )
    return saved_mapping


def save_group_column_mappings(
    db: Session,
    *,
    updates: list[tuple[UUID, UUID, list[dict[str, str | None]]]],
    user_id: UUID,
) -> None:
    """Persist all dataset_files in one transaction after service-level validation."""
    try:
        for dataset_id, file_id, mappings in updates:
            saved = get_dataset_column_mapping(db, dataset_id, file_id)
            if saved is None:
                db.add(DatasetColumnMapping(
                    dataset_id=dataset_id,
                    dataset_file_id=file_id,
                    mappings=mappings,
                    updated_by=user_id,
                ))
            else:
                saved.mappings = mappings
                saved.updated_by = user_id
        db.commit()
    except Exception:
        db.rollback()
        raise
    for dataset_id, file_id, mappings in updates:
        record_audit_event(
            user_id=user_id,
            action="CONFIRM_DATASET_COLUMN_MAPPING",
            module="Dataset",
            status="SUCCESS",
            description="Dataset column mapping updated through group",
            resource_id=dataset_id,
            details={"dataset_file_id": str(file_id), "mapping_count": len(mappings)},
        )


def create_dataset_file(
    db: Session,
    *,
    metadata: DatasetUploadMetadata,
    dataset_id: UUID,
    file_id: UUID,
    creator_id: UUID,
    dataset_code: str,
    data_file_path: str,
    original_filename: str,
    file_format: str,
    file_size_bytes: int,
    ip_address: str | None,
) -> tuple[Dataset, DatasetFile]:
    """Persist a dataset and its uploaded file dataset_file."""
    dataset = Dataset(
        id=dataset_id,
        name=metadata.name,
        code=dataset_code,
        source=metadata.source,
        description=metadata.description,
        capture_date=metadata.capture_date,
        location_name=metadata.location_name,
        created_by=creator_id,
    )
    dataset_file = DatasetFile(
        id=file_id,
        dataset_id=dataset_id,
        data_file_path=data_file_path,
        original_filename=original_filename,
        file_format=file_format,
        file_size_bytes=file_size_bytes,
        approval_status="PENDING",
    )
    if file_format == "CSV":
        dataset_file.csv_file_path = data_file_path
    elif file_format == "PARQUET":
        dataset_file.parquet_file_path = data_file_path

    db.add_all([dataset, dataset_file])
    db.commit()
    db.refresh(dataset)
    db.refresh(dataset_file)
    record_audit_event(
        user_id=creator_id,
        action="UPLOAD_DATASET",
        module="Dataset",
        status="SUCCESS",
        description="Dataset uploaded successfully",
        resource_id=file_id,
        ip_address=ip_address,
        details={
            "dataset_code": dataset_code,
            "original_filename": original_filename,
            "file_format": file_format,
            "file_size_bytes": file_size_bytes,
        },
    )
    return dataset, dataset_file

def create_normalized_file(
    db: Session,
    *,
    dataset_id: UUID,
    new_file_id: UUID,
    file_format: str,
    file_path: str,
    file_size_bytes: int,
    total_records: int,
    records_before: int,
    user_id: UUID,
    cleaning_parameters: dict,
    original_filename: str | None = None,
) -> tuple[DatasetFile, DataCleaningHistory]:
    # Older staging metadata has no filename; recover it from the source dataset_file.
    if original_filename is None and cleaning_parameters.get("source_file_id"):
        source_id = UUID(str(cleaning_parameters["source_file_id"]))
        source = db.query(DatasetFile).filter(
            DatasetFile.id == UUID(str(cleaning_parameters["source_file_id"])),
            DatasetFile.dataset_id == dataset_id,
        ).first()
        if source is not None:
            original_filename = source.original_filename
        original_filename = resolve_original_filename(
            db, dataset_id=dataset_id, file_id=source_id,
            original_filename=original_filename,
        )
    # Each dataset has one current file. Export updates it in place.
    new_file = db.query(DatasetFile).filter(
        DatasetFile.dataset_id == dataset_id,
    ).with_for_update().one()
    if new_file.id != new_file_id:
        raise ValueError("Dataset file changed during processing")
    new_file.file_format = file_format
    new_file.data_file_path = file_path
    new_file.original_filename = original_filename
    new_file.csv_file_path = file_path if file_format == "CSV" else None
    new_file.parquet_file_path = file_path if file_format == "PARQUET" else None
    new_file.file_size_bytes = file_size_bytes
    new_file.total_records = total_records
    new_file.approval_status = "PENDING"
    new_file.submitted_by = new_file.submitted_at = new_file.approved_by = new_file.approval_note = None
    # 2. Ghi nhận lịch sử làm sạch vào bảng data_cleaning_histories
    history = DataCleaningHistory(
        dataset_file_id=new_file_id,
        step_order=1,
        cleaning_operation="PNEUMA_UNPIVOT_AND_NORMALIZE",
        parameters=cleaning_parameters,
        records_before=records_before,
        records_after=total_records,
        executed_by=user_id,
    )
    db.add(history)
    db.commit()
    db.refresh(new_file)
    db.refresh(history)
    return new_file, history


def get_cleaning_history_by_file(
    db: Session,
    file_id: UUID,
) -> DataCleaningHistory | None:
    """Lấy bản ghi lịch sử làm sạch/chuẩn hóa của dữ liệu dataset."""
    return (
        db.query(DataCleaningHistory)
        .filter(DataCleaningHistory.dataset_file_id == file_id)
        .order_by(DataCleaningHistory.created_at.desc())
        .first()
    )
