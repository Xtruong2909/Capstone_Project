from uuid import UUID

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.crud.crud_dataset_access import access_filter
from app.crud.crud_recording_metadata import resolve_original_filename
from app.models.dataset import (
    DataCleaningHistory,  # Import model đã có sẵn trong init_db
    Dataset,
    DatasetColumnMapping,
    DatasetUploadJob,
    DatasetVersion,
    DatasetVersionSession,
    RecordingSession,
)
from app.schemas.dataset import DatasetUploadMetadata
from app.services.audit_log_service import record_audit_event


def get_dataset_by_name(db: Session, name: str) -> Dataset | None:
    """Get a dataset by its unique catalog name."""
    return db.query(Dataset).filter(Dataset.name == name).first()


def lock_dataset_upload(db: Session, name: str) -> None:
    """Serialize uploads for a dataset, including its first creation."""
    db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:name, 0))"), {"name": name})


def get_recording_sessions(db: Session, dataset_id: UUID) -> list[RecordingSession]:
    return db.query(RecordingSession).filter(RecordingSession.dataset_id == dataset_id).all()


def list_uploaded_datasets(
    db: Session, *, search: str | None, page: int, page_size: int,
    visible_user_id: UUID | None,
) -> tuple[list[Dataset], int]:
    """List pNEUMA groups once, scoped to granted datasets when needed."""
    query = db.query(Dataset).filter(
        Dataset.drone_id.is_not(None), Dataset.recording_date.is_not(None),
        Dataset.versions.any(),
    )
    if visible_user_id is not None:
        query = query.filter(access_filter(visible_user_id))
    if search:
        query = query.filter(Dataset.name.ilike(f"%{search}%"))
    total = query.count()
    rows = query.order_by(Dataset.recording_date.desc(), Dataset.name).offset(
        (page - 1) * page_size,
    ).limit(page_size).all()
    return rows, total


def get_dataset_by_id(db: Session, dataset_id: UUID) -> Dataset | None:
    return db.get(Dataset, dataset_id)


def get_latest_versions_for_datasets(
    db: Session, dataset_ids: list[UUID],
) -> dict[UUID, DatasetVersion]:
    if not dataset_ids:
        return {}
    versions = db.query(DatasetVersion).filter(
        DatasetVersion.dataset_id.in_(dataset_ids),
    ).order_by(DatasetVersion.created_at.desc(), DatasetVersion.id.desc()).all()
    latest: dict[UUID, DatasetVersion] = {}
    for version in versions:
        latest.setdefault(version.dataset_id, version)
    return latest


def get_version_session_counts(db: Session, version_ids: list[UUID]) -> dict[UUID, int]:
    if not version_ids:
        return {}
    rows = db.query(
        DatasetVersionSession.version_id, func.count(DatasetVersionSession.session_id),
    ).filter(DatasetVersionSession.version_id.in_(version_ids)).group_by(
        DatasetVersionSession.version_id,
    ).all()
    return dict(rows)


def list_version_sessions(
    db: Session, version_id: UUID, page: int, page_size: int,
) -> tuple[list[RecordingSession], int]:
    query = db.query(RecordingSession).join(
        DatasetVersionSession, DatasetVersionSession.session_id == RecordingSession.id,
    ).filter(DatasetVersionSession.version_id == version_id)
    total = query.count()
    sessions = query.order_by(
        RecordingSession.scheduled_start, RecordingSession.id,
    ).offset((page - 1) * page_size).limit(page_size).all()
    return sessions, total


def list_all_version_sessions(db: Session, version_id: UUID) -> list[RecordingSession]:
    """Return session metadata for schema compatibility checks within a version."""
    return db.query(RecordingSession).join(
        DatasetVersionSession, DatasetVersionSession.session_id == RecordingSession.id,
    ).filter(
        DatasetVersionSession.version_id == version_id,
    ).order_by(
        RecordingSession.scheduled_start, RecordingSession.id,
    ).all()


def get_version_session(
    db: Session, version_id: UUID, session_id: UUID,
) -> RecordingSession | None:
    return db.query(RecordingSession).join(
        DatasetVersionSession, DatasetVersionSession.session_id == RecordingSession.id,
    ).filter(
        DatasetVersionSession.version_id == version_id,
        RecordingSession.id == session_id,
    ).first()


def get_next_upload_version(db: Session, dataset_id: UUID) -> tuple[int, str]:
    versions = db.query(DatasetVersion).filter(DatasetVersion.dataset_id == dataset_id).all()
    number = max((version.version_number or 0 for version in versions), default=0) + 1
    used_tags = {version.version_tag for version in versions}
    major = max((int(tag.split(".")[0][1:]) for tag in used_tags
                 if tag.startswith("v") and tag[1:].split(".")[0].isdigit()), default=0) + 1
    while f"v{major}.0" in used_tags:
        major += 1
    return number, f"v{major}.0"


def add_recording_session(db: Session, session: RecordingSession) -> None:
    db.add(session)


def link_version_sessions(db: Session, version_id: UUID, session_ids: list[UUID]) -> None:
    db.add_all(DatasetVersionSession(version_id=version_id, session_id=session_id)
               for session_id in session_ids)


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


def get_dataset_latest_version(db: Session, dataset_id: UUID) -> tuple[Dataset, DatasetVersion] | None:
    """Get a dataset and its latest uploaded version."""
    result = (
        db.query(Dataset, DatasetVersion)
        .join(DatasetVersion, DatasetVersion.dataset_id == Dataset.id)
        .filter(Dataset.id == dataset_id)
        .order_by(DatasetVersion.created_at.desc(), DatasetVersion.id.desc())
        .first()
    )
    return result


def get_dataset_version(
    db: Session,
    dataset_id: UUID,
    dataset_version_id: UUID,
) -> tuple[Dataset, DatasetVersion] | None:
    """Get a specific version belonging to a dataset."""
    return (
        db.query(Dataset, DatasetVersion)
        .join(DatasetVersion, DatasetVersion.dataset_id == Dataset.id)
        .filter(
            Dataset.id == dataset_id,
            DatasetVersion.id == dataset_version_id,
        )
        .first()
    )


def get_dataset_column_mapping(
    db: Session,
    dataset_id: UUID,
    dataset_version_id: UUID,
) -> DatasetColumnMapping | None:
    return (
        db.query(DatasetColumnMapping)
        .filter(
            DatasetColumnMapping.dataset_id == dataset_id,
            DatasetColumnMapping.dataset_version_id == dataset_version_id,
        )
        .first()
    )


def get_latest_dataset_column_mapping(
    db: Session,
    dataset_id: UUID,
) -> DatasetColumnMapping | None:
    """Get the most recently saved mapping so matching new versions can reuse it."""
    return db.query(DatasetColumnMapping).filter(
        DatasetColumnMapping.dataset_id == dataset_id,
    ).order_by(
        DatasetColumnMapping.updated_at.desc(), DatasetColumnMapping.id.desc(),
    ).first()


def save_dataset_column_mapping(
    db: Session,
    *,
    dataset_id: UUID,
    dataset_version_id: UUID,
    mappings: list[dict[str, str | None]],
    user_id: UUID,
) -> DatasetColumnMapping:
    saved_mapping = get_dataset_column_mapping(db, dataset_id, dataset_version_id)
    if saved_mapping is None:
        saved_mapping = DatasetColumnMapping(
            dataset_id=dataset_id,
            dataset_version_id=dataset_version_id,
            mappings=mappings,
            updated_by=user_id,
        )
        db.add(saved_mapping)
    else:
        saved_mapping.dataset_version_id = dataset_version_id
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
            "dataset_version_id": str(dataset_version_id),
            "mapping_count": len(mappings),
        },
    )
    return saved_mapping


def create_dataset_version(
    db: Session,
    *,
    metadata: DatasetUploadMetadata,
    dataset_id: UUID,
    version_id: UUID,
    creator_id: UUID,
    dataset_code: str,
    version_tag: str,
    data_file_path: str,
    original_filename: str,
    file_format: str,
    file_size_bytes: int,
    ip_address: str | None,
) -> tuple[Dataset, DatasetVersion]:
    """Persist a dataset and its uploaded file version."""
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
    version = DatasetVersion(
        id=version_id,
        dataset_id=dataset_id,
        version_tag=version_tag,
        data_file_path=data_file_path,
        original_filename=original_filename,
        file_format=file_format,
        file_size_bytes=file_size_bytes,
        approval_status="PENDING",
    )
    if file_format == "CSV":
        version.csv_file_path = data_file_path
    elif file_format == "PARQUET":
        version.parquet_file_path = data_file_path

    db.add_all([dataset, version])
    db.commit()
    db.refresh(dataset)
    db.refresh(version)
    record_audit_event(
        user_id=creator_id,
        action="UPLOAD_DATASET",
        module="Dataset",
        status="SUCCESS",
        description="Dataset uploaded successfully",
        resource_id=version_id,
        ip_address=ip_address,
        details={
            "dataset_code": dataset_code,
            "version_tag": version_tag,
            "original_filename": original_filename,
            "file_format": file_format,
            "file_size_bytes": file_size_bytes,
        },
    )
    return dataset, version

def create_normalized_version(
    db: Session,
    *,
    dataset_id: UUID,
    new_version_id: UUID,
    version_tag: str,
    file_format: str,
    file_path: str,
    file_size_bytes: int,
    total_records: int,
    records_before: int,
    user_id: UUID,
    cleaning_parameters: dict,
    original_filename: str | None = None,
) -> tuple[DatasetVersion, DataCleaningHistory]:
    # Older staging metadata has no filename; recover it from the source version.
    if original_filename is None and cleaning_parameters.get("source_version_id"):
        source_id = UUID(str(cleaning_parameters["source_version_id"]))
        source = db.query(DatasetVersion).filter(
            DatasetVersion.id == UUID(str(cleaning_parameters["source_version_id"])),
            DatasetVersion.dataset_id == dataset_id,
        ).first()
        if source is not None:
            original_filename = source.original_filename
        original_filename = resolve_original_filename(
            db, dataset_id=dataset_id, version_id=source_id,
            original_filename=original_filename,
        )
    # 1. Tạo DatasetVersion mới (ở trạng thái PENDING chờ Admin duyệt)
    new_version = DatasetVersion(
        id=new_version_id,
        dataset_id=dataset_id,
        version_tag=version_tag,
        file_format=file_format,
        data_file_path=file_path,
        original_filename=original_filename,
        csv_file_path=file_path if file_format == "CSV" else None,
        parquet_file_path=file_path if file_format == "PARQUET" else None,
        file_size_bytes=file_size_bytes,
        total_records=total_records,
        approval_status="PENDING",
    )
    db.add(new_version)
    # 2. Ghi nhận lịch sử làm sạch vào bảng data_cleaning_histories
    history = DataCleaningHistory(
        dataset_version_id=new_version_id,
        step_order=1,
        cleaning_operation="PNEUMA_UNPIVOT_AND_NORMALIZE",
        parameters=cleaning_parameters,
        records_before=records_before,
        records_after=total_records,
        executed_by=user_id,
    )
    db.add(history)
    db.commit()
    db.refresh(new_version)
    db.refresh(history)
    return new_version, history


def get_cleaning_history_by_version(
    db: Session,
    version_id: UUID,
) -> DataCleaningHistory | None:
    """Lấy bản ghi lịch sử làm sạch/chuẩn hóa của phiên bản dataset."""
    return (
        db.query(DataCleaningHistory)
        .filter(DataCleaningHistory.dataset_version_id == version_id)
        .order_by(DataCleaningHistory.created_at.desc())
        .first()
    )
