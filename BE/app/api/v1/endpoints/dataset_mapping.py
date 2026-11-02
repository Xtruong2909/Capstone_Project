from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dataset_access import require_dataset_reader
from app.core.deps import require_data_engineer
from app.database.database import get_db
from app.models.user import User
from app.schemas.dataset_mapping import (
    DatasetColumnMappingsPatch,
    DatasetColumnMappingsResponse,
    DatasetColumnsResponse,
)
from app.services.dataset_mapping_service import (
    DatasetMappingNotFoundError,
    DatasetMappingReadError,
    DatasetMappingValidationError,
    get_dataset_column_mappings,
    get_dataset_columns,
    patch_dataset_column_mappings,
)

router = APIRouter()


@router.get(
    "/{dataset_id}/columns",
    response_model=DatasetColumnsResponse,
    summary="[Bước 2.1] Lấy danh sách cột của dataset",
)
def list_dataset_columns(
    dataset_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dataset_reader),
) -> DatasetColumnsResponse:
    try:
        return get_dataset_columns(db, dataset_id)
    except DatasetMappingNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except DatasetMappingReadError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.patch(
    "/{dataset_id}/column-mappings",
    response_model=DatasetColumnMappingsResponse,
    summary="[Bước 2.2] Tạo hoặc cập nhật ánh xạ tên cột",
)
def update_dataset_column_mappings(
    dataset_id: UUID,
    payload: DatasetColumnMappingsPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> DatasetColumnMappingsResponse:
    try:
        return patch_dataset_column_mappings(
            db,
            dataset_id=dataset_id,
            requested_mappings=payload.mappings,
            user=current_user,
        )
    except DatasetMappingNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except DatasetMappingReadError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except DatasetMappingValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get(
    "/{dataset_id}/column-mappings",
    response_model=DatasetColumnMappingsResponse,
    summary="[Bước 2.3] Lấy ánh xạ cột đã lưu",
)
def read_dataset_column_mappings(
    dataset_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dataset_reader),
) -> DatasetColumnMappingsResponse:
    try:
        return get_dataset_column_mappings(db, dataset_id)
    except DatasetMappingNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except DatasetMappingReadError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
