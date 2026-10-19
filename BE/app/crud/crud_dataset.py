from uuid import UUID

from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.dataset import Dataset, DatasetColumnMapping, DatasetVersion
from app.schemas.dataset import DatasetUploadMetadata


def get_dataset_by_name(db: Session, name: str) -> Dataset | None:
    """Get a dataset by its unique catalog name."""
    return db.query(Dataset).filter(Dataset.name == name).first()


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

    db.add(
        AuditLog(
            user_id=user_id,
            action="CONFIRM_DATASET_COLUMN_MAPPING",
            resource_type="DATASET",
            resource_id=str(dataset_id),
            details={
                "dataset_version_id": str(dataset_version_id),
                "mapping_count": len(mappings),
            },
        )
    )
    db.commit()
    db.refresh(saved_mapping)
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

    audit_log = AuditLog(
        user_id=creator_id,
        action="UPLOAD_DATASET",
        resource_type="DATASET_VERSION",
        resource_id=str(version_id),
        details={
            "dataset_code": dataset_code,
            "version_tag": version_tag,
            "original_filename": original_filename,
            "file_format": file_format,
            "file_size_bytes": file_size_bytes,
        },
        ip_address=ip_address,
    )

    db.add_all([dataset, version, audit_log])
    db.commit()
    db.refresh(dataset)
    db.refresh(version)
    return dataset, version
