"""Read approved Dataset Files and their Recording Sessions for consumers."""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.crud import crud_dataset_access as repo
from app.models.user import User
from app.schemas.dataset import (
    GroupDatasetListResponse,
    RecordingSessionListResponse,
    RecordingSessionPreviewResponse,
)
from app.services.dataset_access_service import check_dataset_access
from app.services.dataset_preview_service import (
    DatasetPreviewFormatError,
    DatasetPreviewNotFoundError,
    DatasetPreviewReadError,
)
from app.services.dataset_review_service import (
    list_datasets_in_group,
    list_recording_sessions,
    preview_recording_session,
    resolve_group_dataset_file,
)


def _require_consumer(user: User) -> None:
    if user.role_id not in repo.ACCESS_ROLES:
        raise HTTPException(403, "Data Scientist or Business User role required")


def list_approved_group_datasets(
    db: Session, user: User, group_id: UUID,
) -> GroupDatasetListResponse:
    _require_consumer(user)
    try:
        return list_datasets_in_group(db, group_id, user)
    except DatasetPreviewNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc


def _approved_group_file_id(
    db: Session, user: User, group_id: UUID, dataset_id: UUID,
) -> UUID:
    _require_consumer(user)
    check_dataset_access(user, dataset_id, db)
    try:
        dataset_file = resolve_group_dataset_file(db, group_id, dataset_id, user)
    except DatasetPreviewNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    require_approved_file(db, user, dataset_id, dataset_file.id)
    return dataset_file.id


def list_approved_group_sessions(
    db: Session, user: User, group_id: UUID, dataset_id: UUID,
    page: int, page_size: int,
) -> RecordingSessionListResponse:
    file_id = _approved_group_file_id(db, user, group_id, dataset_id)
    return list_approved_recording_sessions(
        db, user, dataset_id, file_id, page, page_size,
    )


def preview_approved_group_session(
    db: Session, user: User, group_id: UUID, dataset_id: UUID,
    session_id: UUID, *, page: int, limit: int, column_offset: int,
    representation: str,
) -> RecordingSessionPreviewResponse:
    file_id = _approved_group_file_id(db, user, group_id, dataset_id)
    return preview_approved_recording_session(
        db, user, dataset_id, file_id, session_id,
        page=page, limit=limit, column_offset=column_offset,
        representation=representation,
    )


def require_approved_file(
    db: Session, user: User, dataset_id: UUID, file_id: UUID,
) -> None:
    # Data Engineers use these shared session endpoints during review before
    # submission. Consumers must have a dataset grant and see approved data only.
    if user.role_id == "data_engineer":
        return
    if user.role_id not in repo.ACCESS_ROLES:
        raise HTTPException(403, "Data Scientist or Business User role required")
    check_dataset_access(user, dataset_id, db)
    dataset_file = repo.get_file(db, file_id)
    if dataset_file is None or dataset_file.dataset_id != dataset_id:
        raise HTTPException(404, "Không tìm thấy dữ liệu thuộc Dataset này")
    if dataset_file.approval_status != "APPROVED":
        raise HTTPException(403, "Chỉ được xem Dataset File đã được Admin phê duyệt")


def list_approved_recording_sessions(
    db: Session,
    user: User,
    dataset_id: UUID,
    file_id: UUID,
    page: int,
    page_size: int,
) -> RecordingSessionListResponse:
    """List sessions only when the consumer can access the approved dataset_file."""
    require_approved_file(db, user, dataset_id, file_id)
    try:
        return list_recording_sessions(
            db, dataset_id, file_id, page=page, page_size=page_size,
        )
    except DatasetPreviewNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc


def preview_approved_recording_session(
    db: Session,
    user: User,
    dataset_id: UUID,
    file_id: UUID,
    session_id: UUID,
    *,
    page: int,
    limit: int,
    column_offset: int,
    representation: str,
) -> RecordingSessionPreviewResponse:
    """Return a bounded raw or normalized preview for one approved session."""
    require_approved_file(db, user, dataset_id, file_id)
    try:
        return preview_recording_session(
            db, dataset_id, file_id, session_id,
            page=page, limit=limit, column_offset=column_offset,
            representation=representation,
        )
    except DatasetPreviewNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except DatasetPreviewFormatError as exc:
        raise HTTPException(415, str(exc)) from exc
    except DatasetPreviewReadError as exc:
        raise HTTPException(422, str(exc)) from exc
