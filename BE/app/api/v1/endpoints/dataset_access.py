from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin
from app.database.database import get_db
from app.models.user import User
from app.schemas.dataset_access import (
    AccessibleDataset,
    DatasetAccessRequest,
    DatasetAccessResponse,
    EligibleDatasetUser,
)
from app.services import dataset_access_service as service

admin_router = APIRouter(dependencies=[Depends(require_admin)])
router = APIRouter()


@admin_router.get(
    "/{dataset_id}/eligible-users",
    response_model=list[EligibleDatasetUser],
    summary="Danh sách người dùng có thể được cấp quyền truy cập dataset",
)
def eligible_users(
    dataset_id: UUID,
    search: str | None = Query(None, max_length=255),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[EligibleDatasetUser]:
    """Chỉ Admin được xem Data Scientist và Business User cùng trạng thái đã được cấp quyền.

    Hỗ trợ tìm kiếm theo tên hoặc email và phân trang bằng skip, limit.
    """
    return service.list_eligible_users(db, dataset_id, search, skip, limit)


@admin_router.post(
    "/{dataset_id}/access",
    response_model=DatasetAccessResponse,
    status_code=201,
    summary="Cấp quyền truy cập dataset cho người dùng",
)
def grant_access(
    dataset_id: UUID,
    payload: DatasetAccessRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> DatasetAccessResponse:
    """Admin cấp quyền toàn dataset cho Data Scientist hoặc Business User.

    Ghi nhận người cấp và thời gian cấp quyền. Trả về lỗi 409 nếu quyền đã tồn tại.
    Quyền truy cập dataset không thay thế quyền thực hiện từng chức năng theo vai trò.
    """
    return service.grant_access(db, dataset_id, payload.user_id, admin)


@admin_router.get(
    "/{dataset_id}/access",
    response_model=list[DatasetAccessResponse],
    summary="Danh sách người dùng đã được cấp quyền truy cập dataset",
)
def list_access(
    dataset_id: UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[DatasetAccessResponse]:
    """Chỉ Admin được xem danh sách cấp quyền, người cấp và thời gian cấp.

    Hỗ trợ phân trang bằng skip, limit. Trả về danh sách rỗng nếu chưa có quyền nào.
    """
    return service.list_access(db, dataset_id, skip, limit)


@admin_router.delete(
    "/{dataset_id}/access/{user_id}",
    status_code=204,
    summary="Thu hồi quyền truy cập dataset của người dùng",
)
def revoke_access(
    dataset_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> Response:
    """Admin thu hồi quyền toàn dataset của người dùng được chọn.

    Không xóa người dùng, dataset hoặc quyền trên dataset khác.
    Thành công trả về 204 không có nội dung; quyền không tồn tại trả về 404.
    """
    service.revoke_access(db, dataset_id, user_id, admin)
    return Response(status_code=204)


@router.get(
    "/accessible",
    response_model=list[AccessibleDataset],
    summary="Danh sách dataset người dùng được phép truy cập",
)
def accessible_datasets(
    search: str | None = Query(None, max_length=255),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AccessibleDataset]:
    """Xác định người dùng từ JWT: Admin xem toàn bộ dataset.

    Data Scientist và Business User chỉ xem dataset đã được Admin cấp quyền.
    Hỗ trợ tìm kiếm theo tên hoặc mã dataset và phân trang bằng skip, limit.
    Chưa được cấp quyền thì trả về danh sách rỗng.
    """
    return service.list_accessible(db, current_user, search, skip, limit)
