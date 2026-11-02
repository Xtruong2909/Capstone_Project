"""Read approved dataset versions for authorized consumers."""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.crud import crud_dataset_access as repo
from app.models.user import User
from app.schemas.dataset import DatasetPreviewResponse
from app.services.dataset_access_service import check_dataset_access
from app.services.dataset_mapping_service import (
    DatasetMappingNotFoundError,
    apply_saved_column_mappings,
)
from app.services.dataset_preview_service import (
    DatasetPreviewFormatError,
    DatasetPreviewNotFoundError,
    DatasetPreviewReadError,
    get_dataset_preview,
)


def preview_approved_dataset(
    db: Session,
    user: User,
    dataset_id: UUID,
    version_id: UUID,
    page: int,
    page_size: int,
    representation: str,
) -> DatasetPreviewResponse:
    if user.role_id not in repo.ACCESS_ROLES:
        raise HTTPException(403, "Data Scientist or Business User role required")
    check_dataset_access(user, dataset_id, db)
    version = repo.get_version(db, version_id)
    if version is None or version.dataset_id != dataset_id:
        raise HTTPException(404, "Không tìm thấy phiên bản thuộc dataset này")
    if version.approval_status != "APPROVED":
        raise HTTPException(403, "Chỉ được xem phiên bản đã được Admin phê duyệt (APPROVED)")
    try:
        preview = get_dataset_preview(
            db,
            dataset_id=dataset_id,
            dataset_version_id=version_id,
            page=page,
            page_size=page_size,
            representation=representation,
        )
        return apply_saved_column_mappings(db, dataset_id=dataset_id, preview=preview)
    except (DatasetPreviewNotFoundError, DatasetMappingNotFoundError) as exc:
        raise HTTPException(404, str(exc)) from exc
    except DatasetPreviewFormatError as exc:
        raise HTTPException(415, str(exc)) from exc
    except DatasetPreviewReadError as exc:
        raise HTTPException(422, str(exc)) from exc
