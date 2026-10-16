from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from app.core.deps import require_data_engineer
from app.database.database import get_db
from app.models.user import User
from app.schemas.dataset import (
    DatasetPreviewResponse,
    DatasetUploadMetadata,
    DatasetUploadResponse,
)
from app.services.dataset_preview_service import (
    DatasetPreviewFormatError,
    DatasetPreviewNotFoundError,
    DatasetPreviewReadError,
    get_dataset_preview,
)
from app.services.dataset_service import (
    DatasetConflictError,
    DatasetFileTooLargeError,
    EmptyDatasetFileError,
    UnsupportedDatasetFormatError,
    create_dataset_upload,
)

router = APIRouter()


@router.get(
    "/{dataset_id}/preview",
    summary="Xem trước dữ liệu dataset",
)
def preview_dataset(
    dataset_id: UUID,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    representation: Literal["raw", "normalized"] = "normalized",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> DatasetPreviewResponse:
    """Read metadata and a paginated sample from the latest dataset version."""
    try:
        return get_dataset_preview(
            db,
            dataset_id=dataset_id,
            page=page,
            page_size=page_size,
            representation=representation,
        )
    except DatasetPreviewNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except DatasetPreviewFormatError as exc:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=str(exc),
        ) from exc
    except DatasetPreviewReadError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.post(
    "/upload",
    response_model=DatasetUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tải dataset giao thông lên",
)
def upload_dataset(
    request: Request,
    file: Annotated[UploadFile, File(description="CSV, JSON, Excel (.xls/.xlsx) hoặc Parquet")],
    name: Annotated[str, Form(min_length=3, max_length=128)],
    source: Annotated[str, Form(min_length=1, max_length=255)],
    location_name: Annotated[str, Form(min_length=1, max_length=255)],
    description: Annotated[str | None, Form()] = None,
    capture_date: Annotated[date | None, Form()] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> DatasetUploadResponse:
    """Upload a dataset file with its catalog metadata."""
    try:
        metadata = DatasetUploadMetadata(
            name=name,
            source=source,
            location_name=location_name,
            description=description,
            capture_date=capture_date,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    try:
        dataset, version = create_dataset_upload(
            db,
            metadata=metadata,
            file_stream=file.file,
            filename=file.filename or "",
            creator_id=current_user.id,
            ip_address=request.client.host if request.client else None,
        )
    except UnsupportedDatasetFormatError as exc:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=str(exc),
        ) from exc
    except DatasetFileTooLargeError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=str(exc),
        ) from exc
    except EmptyDatasetFileError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except DatasetConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    return DatasetUploadResponse(
        dataset_id=dataset.id,
        version_id=version.id,
        name=dataset.name,
        code=dataset.code,
        source=dataset.source,
        description=dataset.description,
        capture_date=dataset.capture_date,
        location_name=dataset.location_name,
        version_tag=version.version_tag,
        file_format=version.file_format,
        original_filename=version.original_filename or "",
        file_size_bytes=version.file_size_bytes,
        approval_status=version.approval_status,
        created_at=version.created_at,
    )
