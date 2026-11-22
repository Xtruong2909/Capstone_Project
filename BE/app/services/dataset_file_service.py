"""Dataset-dataset_file reporting with provenance back to pNEUMA recording sessions."""

from uuid import UUID

from sqlalchemy.orm import Session

from app.crud import crud_dataset
from app.models.dataset import DatasetFile, RecordingSession
from app.schemas.dataset_normalization import (
    DatasetFileListItem,
    DatasetFileSessionSummary,
)


def get_file_source_context(
    db: Session,
    dataset_file: DatasetFile,
    *,
    history: object | None = None,
) -> tuple[UUID | None, list[DatasetFileSessionSummary]]:
    """Resolve the source dataset_file and sessions represented by a raw or normalized dataset_file."""
    if history is None:
        history = crud_dataset.get_cleaning_history_by_file(db, dataset_file.id)
    parameters = getattr(history, "parameters", None) or {}

    raw_source_file_id = parameters.get("source_file_id")
    try:
        source_file_id = UUID(str(raw_source_file_id)) if raw_source_file_id else dataset_file.id
    except (TypeError, ValueError):
        source_file_id = dataset_file.id

    raw_session_ids = parameters.get("source_session_ids") or []
    session_ids: list[UUID] = []
    for raw_session_id in raw_session_ids:
        try:
            session_ids.append(UUID(str(raw_session_id)))
        except (TypeError, ValueError):
            continue

    source_file = dataset_file if source_file_id == dataset_file.id else db.query(DatasetFile).filter(
        DatasetFile.id == source_file_id,
        DatasetFile.dataset_id == dataset_file.dataset_id,
    ).first()
    if source_file is None:
        source_file_id = dataset_file.id

    source_sessions: list[RecordingSession]
    if session_ids:
        found = db.query(RecordingSession).filter(
            RecordingSession.dataset_id == dataset_file.dataset_id,
            RecordingSession.id.in_(session_ids),
        ).all()
        found_by_id = {session.id: session for session in found}
        source_sessions = [found_by_id[session_id] for session_id in session_ids if session_id in found_by_id]
        if not source_sessions:
            source_sessions = crud_dataset.list_all_file_sessions(db, source_file_id)
    else:
        source_sessions = crud_dataset.list_all_file_sessions(db, source_file_id)


    return (
        source_file_id,
        [
            DatasetFileSessionSummary(
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


def get_file_recording_sessions(
    db: Session, dataset_file: DatasetFile,
) -> list[RecordingSession]:
    """Resolve uploaded sessions represented by an original or exported dataset_file."""
    sessions = crud_dataset.list_all_file_sessions(db, dataset_file.id)
    if sessions:
        return sessions
    _, summaries = get_file_source_context(db, dataset_file)
    if not summaries:
        return []
    session_ids = [summary.session_id for summary in summaries]
    sessions, _ = crud_dataset.list_dataset_sessions_by_ids(
        db, dataset_file.dataset_id, session_ids, 1, len(session_ids),
    )
    return sessions


def build_dataset_file_item(
    db: Session,
    dataset_file: DatasetFile,
) -> DatasetFileListItem:
    history = crud_dataset.get_cleaning_history_by_file(db, dataset_file.id)
    source_file_id, source_sessions = get_file_source_context(
        db, dataset_file, history=history,
    )
    # Return only the basename; storage paths are internal server details.
    file_path = getattr(dataset_file, "data_file_path", None)
    if not file_path:
        file_path = getattr(
            dataset_file,
            "parquet_file_path" if dataset_file.file_format == "PARQUET" else "csv_file_path",
            None,
        )
    filename = str(file_path).replace("\\", "/").rsplit("/", 1)[-1] if file_path else None
    return DatasetFileListItem(
        dataset_id=dataset_file.dataset_id,
        dataset_name=dataset_file.dataset.name if dataset_file.dataset else None,
        code=getattr(dataset_file.dataset, "code", None),
        source=getattr(dataset_file.dataset, "source", None),
        description=getattr(dataset_file.dataset, "description", None),
        location_name=getattr(dataset_file.dataset, "location_name", None),
        capture_date=getattr(dataset_file.dataset, "capture_date", None),
        recording_date=getattr(dataset_file.dataset, "recording_date", None),
        group_id=getattr(dataset_file.dataset, "group_id", None),
        group_name=getattr(getattr(dataset_file.dataset, "group", None), "name", None),
        file_id=dataset_file.id,

        original_filename=getattr(dataset_file, "original_filename", None),
        filename=filename,
        file_format=dataset_file.file_format,
        file_size_bytes=dataset_file.file_size_bytes or 0,
        total_records=dataset_file.total_records or 0,
        # Upload initializes this counter to zero before any recording is read.
        # A completed Parquet export can also have a genuine count of zero.
        total_records_known=bool(
            (dataset_file.total_records or 0) > 0
            or (history is not None and dataset_file.file_format == "PARQUET" and file_path)
        ),
        source_file_id=source_file_id,
        source_session_count=len(source_sessions),
        source_sessions=source_sessions,
        approval_status=dataset_file.approval_status,
        submitted_by=dataset_file.submitted_by,
        submitted_at=dataset_file.submitted_at,
        approved_by=dataset_file.approved_by,
        approval_note=dataset_file.approval_note,
        created_at=dataset_file.created_at,
        updated_at=getattr(dataset_file, "updated_at", None),
    )


def list_dataset_files(
    db: Session,
    *,
    dataset_id: UUID | None = None,
    approval_status: str | None = None,
    owner_id: UUID | None = None,
) -> list[DatasetFileListItem]:
    dataset_files = crud_dataset.list_dataset_files(
        db, dataset_id=dataset_id, approval_status=approval_status, owner_id=owner_id,
    )
    return [build_dataset_file_item(db, dataset_file) for dataset_file in dataset_files]
