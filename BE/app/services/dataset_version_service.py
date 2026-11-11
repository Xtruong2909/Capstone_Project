"""Dataset-version reporting with provenance back to pNEUMA recording sessions."""

from uuid import UUID

from sqlalchemy.orm import Session

from app.crud import crud_dataset
from app.models.dataset import DatasetVersion, RecordingSession
from app.schemas.dataset_normalization import (
    DatasetVersionListItem,
    DatasetVersionSessionSummary,
)


def get_version_source_context(
    db: Session,
    version: DatasetVersion,
    *,
    history: object | None = None,
) -> tuple[UUID | None, str | None, list[DatasetVersionSessionSummary]]:
    """Resolve the source version and sessions represented by a raw or normalized version."""
    if history is None:
        history = crud_dataset.get_cleaning_history_by_version(db, version.id)
    parameters = getattr(history, "parameters", None) or {}

    raw_source_version_id = parameters.get("source_version_id")
    try:
        source_version_id = UUID(str(raw_source_version_id)) if raw_source_version_id else version.id
    except (TypeError, ValueError):
        source_version_id = version.id

    raw_session_ids = parameters.get("source_session_ids") or []
    session_ids: list[UUID] = []
    for raw_session_id in raw_session_ids:
        try:
            session_ids.append(UUID(str(raw_session_id)))
        except (TypeError, ValueError):
            continue

    source_sessions: list[RecordingSession]
    if session_ids:
        found = db.query(RecordingSession).filter(
            RecordingSession.dataset_id == version.dataset_id,
            RecordingSession.id.in_(session_ids),
        ).all()
        found_by_id = {session.id: session for session in found}
        source_sessions = [found_by_id[session_id] for session_id in session_ids if session_id in found_by_id]
        if not source_sessions:
            source_sessions = crud_dataset.list_all_version_sessions(db, source_version_id)
    else:
        source_sessions = crud_dataset.list_all_version_sessions(db, source_version_id)

    source_version = version if source_version_id == version.id else db.query(DatasetVersion).filter(
        DatasetVersion.id == source_version_id,
        DatasetVersion.dataset_id == version.dataset_id,
    ).first()
    source_version_tag = source_version.version_tag if source_version else None

    return (
        source_version_id,
        source_version_tag,
        [
            DatasetVersionSessionSummary(
                session_id=session.id,
                original_filename=session.original_filename,
                drone_id=session.drone_id,
                recording_date=session.recording_date,
                scheduled_start=session.scheduled_start,
                scheduled_end=session.scheduled_end,
                file_size=session.file_size,
                checksum=session.checksum,
                upload_status=session.upload_status,
            )
            for session in source_sessions
        ],
    )


def build_dataset_version_item(
    db: Session,
    version: DatasetVersion,
) -> DatasetVersionListItem:
    history = crud_dataset.get_cleaning_history_by_version(db, version.id)
    source_version_id, source_version_tag, source_sessions = get_version_source_context(
        db, version, history=history,
    )
    return DatasetVersionListItem(
        dataset_id=version.dataset_id,
        dataset_name=version.dataset.name if version.dataset else None,
        version_id=version.id,
        version_tag=version.version_tag,
        file_format=version.file_format,
        file_size_bytes=version.file_size_bytes or 0,
        total_records=version.total_records or 0,
        source_version_id=source_version_id,
        source_version_tag=source_version_tag,
        source_session_count=len(source_sessions),
        source_sessions=source_sessions,
        approval_status=version.approval_status,
        submitted_by=version.submitted_by,
        submitted_at=version.submitted_at,
        approved_by=version.approved_by,
        approval_note=version.approval_note,
        created_at=version.created_at,
    )


def list_dataset_versions(
    db: Session,
    *,
    dataset_id: UUID | None = None,
    approval_status: str | None = None,
) -> list[DatasetVersionListItem]:
    query = db.query(DatasetVersion)
    if dataset_id is not None:
        query = query.filter(DatasetVersion.dataset_id == dataset_id)
    if approval_status is not None:
        query = query.filter(DatasetVersion.approval_status == approval_status)
    versions = query.order_by(DatasetVersion.created_at.desc()).all()
    return [build_dataset_version_item(db, version) for version in versions]
