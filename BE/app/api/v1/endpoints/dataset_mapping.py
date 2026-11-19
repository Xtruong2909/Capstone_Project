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
    GroupDatasetColumnsResponse,
    GroupDatasetMappingsResponse,
)
from app.services.dataset_mapping_service import (
    DatasetMappingConflictError,
    DatasetMappingNotFoundError,
    DatasetMappingReadError,
    DatasetMappingValidationError,
    get_dataset_column_mappings,
    get_dataset_columns,
    get_group_dataset_columns,
    get_group_dataset_mappings,
    patch_dataset_column_mappings,
    patch_group_dataset_mappings,
)

router = APIRouter()


@router.get(
    "/groups/{group_id}/columns",
    response_model=GroupDatasetColumnsResponse,
    summary="Xem cấu trúc cột chung của tất cả Dataset trong nhóm",
)
def list_group_columns(
    group_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> GroupDatasetColumnsResponse:
    try:
        return get_group_dataset_columns(db, group_id)
    except DatasetMappingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DatasetMappingReadError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.patch(
    "/groups/{group_id}/column-mappings",
    response_model=GroupDatasetMappingsResponse,
    summary="Mapping cột cho mọi Dataset và Session trong nhóm",
    description=(
        "Kiểm tra cấu trúc cột của mọi Session trong nhóm trước khi lưu. "
        "Request body là mapping chung đầy đủ, thay thế mapping cũ của từng Dataset. "
        "Lưu cho phiên bản mới nhất của từng Dataset trong một giao dịch."
    ),
)
def update_group_column_mappings(
    group_id: UUID,
    payload: DatasetColumnMappingsPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> GroupDatasetMappingsResponse:
    try:
        return patch_group_dataset_mappings(
            db, group_id=group_id, requested_mappings=payload.mappings, user=current_user,
        )
    except DatasetMappingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DatasetMappingConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (DatasetMappingReadError, DatasetMappingValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get(
    "/groups/{group_id}/column-mappings",
    response_model=GroupDatasetMappingsResponse,
    summary="Xem mapping cột chung của nhóm Dataset",
)
def read_group_column_mappings(
    group_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_data_engineer),
) -> GroupDatasetMappingsResponse:
    try:
        return get_group_dataset_mappings(db, group_id)
    except DatasetMappingNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DatasetMappingConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except DatasetMappingReadError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get(
    "/{dataset_id}/columns",
    include_in_schema=False,
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
    include_in_schema=False,
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
    include_in_schema=False,
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
