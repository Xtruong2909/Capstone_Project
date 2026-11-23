"""Queries and atomic row deletion for privately owned, unsubmitted batches."""
from uuid import UUID

from sqlalchemy import delete, exists, or_, select
from sqlalchemy.orm import Session

from app.models.dataset import (
    Dataset,
    DatasetFile,
    DatasetGroup,
    DatasetGroupProcessingJob,
    DatasetUploadJob,
    RecordingSession,
)


def deletable_group_ids(db: Session, group_ids: list[UUID], owner_id: UUID) -> set[UUID]:
    if not group_ids:
        return set()
    other_owner = exists(select(Dataset.id).where(
        Dataset.group_id == DatasetGroup.id,
        or_(Dataset.created_by != owner_id, Dataset.created_by.is_(None)),
    ))
    own_dataset = exists(select(Dataset.id).where(Dataset.group_id == DatasetGroup.id, Dataset.created_by == owner_id))
    submitted = exists(select(DatasetFile.id).join(Dataset).where(
        Dataset.group_id == DatasetGroup.id,
        or_(DatasetFile.approval_status != 'PENDING', DatasetFile.submitted_at.is_not(None),
            DatasetFile.submitted_by.is_not(None), DatasetFile.approved_by.is_not(None)),
    ))
    return set(db.scalars(select(DatasetGroup.id).where(
        DatasetGroup.id.in_(group_ids), DatasetGroup.first_submitted_at.is_(None),
        own_dataset, ~other_owner, ~submitted,
    )).all())


def lock_group_datasets(db: Session, group_id: UUID) -> list[Dataset]:
    return db.query(Dataset).filter(Dataset.group_id == group_id).order_by(Dataset.id).populate_existing().with_for_update().all()


def lock_group_files(db: Session, dataset_ids: list[UUID]) -> list[DatasetFile]:
    return db.query(DatasetFile).filter(DatasetFile.dataset_id.in_(dataset_ids)).order_by(DatasetFile.id).populate_existing().with_for_update().all()


def group_sessions(db: Session, dataset_ids: list[UUID]) -> list[RecordingSession]:
    return db.query(RecordingSession).filter(RecordingSession.dataset_id.in_(dataset_ids)).all()


def group_processing_jobs(db: Session, group_id: UUID) -> list[DatasetGroupProcessingJob]:
    return db.query(DatasetGroupProcessingJob).filter(DatasetGroupProcessingJob.group_id == group_id).all()


def has_active_upload(db: Session, owner_id: UUID) -> bool:
    return db.query(DatasetUploadJob.id).filter(
        DatasetUploadJob.created_by == owner_id,
        DatasetUploadJob.status.in_(('PENDING', 'UPLOADING', 'QUEUED', 'RUNNING', 'PROCESSING')),
    ).first() is not None


def delete_group_rows(db: Session, group_id: UUID, dataset_ids: list[UUID], owner_id: UUID) -> None:
    # Cascades remove sessions, mappings, quality reports and group processing jobs.
    # RESTRICT/NO ACTION dependencies deliberately abort the entire transaction.
    db.execute(delete(Dataset).where(Dataset.id.in_(dataset_ids)), execution_options={'synchronize_session': False})
    db.execute(delete(DatasetGroup).where(DatasetGroup.id == group_id), execution_options={'synchronize_session': False})
    jobs = db.query(DatasetUploadJob).filter(DatasetUploadJob.created_by == owner_id).all()
    removed = {str(dataset_id) for dataset_id in dataset_ids}
    for job in jobs:
        members = (job.result or {}).get('datasets', [])
        if members and all(item.get('dataset_id') in removed for item in members):
            db.delete(job)


def referenced_paths(db: Session, paths: list[str]) -> set[str]:
    if not paths:
        return set()
    used = set(db.scalars(select(RecordingSession.file_path).where(RecordingSession.file_path.in_(paths))).all())
    for column in (DatasetFile.data_file_path, DatasetFile.csv_file_path, DatasetFile.parquet_file_path):
        used.update(db.scalars(select(column).where(column.in_(paths))).all())
    return used
