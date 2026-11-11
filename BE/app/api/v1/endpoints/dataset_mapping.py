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
    summary="Lấy cấu trúc cột dùng chung cho các session",
    description=(
        "Đọc cấu trúc từ các Recording Session trong Dataset Version mới nhất. "
        "Các session phải có cùng danh sách cột để dùng một mapping chung. "
        "Mapping đã lưu được tái sử dụng khi version mới vẫn tương thích."
    ),
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
    summary="Ánh xạ cột một lần cho toàn bộ session",
    description=(
        "Tạo hoặc cập nhật mapping ở cấp Dataset Version. Mapping áp dụng cho tất cả "
        "session trong version có cùng cấu trúc cột; version tiếp theo sẽ kế thừa "
        "mapping nếu tên các cột nguồn vẫn tương thích."
    ),
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
    summary="Lấy mapping dùng chung của Dataset",
    description=(
        "Trả mapping đang áp dụng cho toàn bộ session của Dataset Version mới nhất. "
        "Mapping từ version trước được dùng lại khi cấu trúc cột vẫn tương thích."
    ),
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
