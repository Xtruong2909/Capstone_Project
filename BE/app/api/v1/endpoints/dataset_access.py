from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin
from app.database.database import get_db
from app.models.user import User
from app.schemas.dataset import RecordingSessionListResponse, RecordingSessionPreviewResponse
from app.schemas.dataset_access import (
    AccessibleDataset,
    ApprovedDatasetResponse,
    DatasetAccessRequest,
    DatasetAccessResponse,
    EligibleDatasetUser,
)
from app.services import dataset_access_service as service
from app.services.dataset_consumer_service import (
    list_approved_recording_sessions,
    preview_approved_recording_session,
)

admin_router = APIRouter(dependencies=[Depends(require_admin)])
router = APIRouter()
approved_router = APIRouter()


@admin_router.get(
    "/catalog",
    response_model=list[AccessibleDataset],
    summary="Danh sách toàn bộ Dataset để Admin quản lý quyền truy cập",
)
def admin_dataset_catalog(
    search: str | None = Query(None, max_length=255),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[AccessibleDataset]:
    """List all datasets for Admin, regardless of version approval status."""
    return service.list_accessible(db, admin, search, skip, limit)


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
    responses={409: {"description": "Dataset chưa có phiên bản APPROVED hoặc quyền đã tồn tại"}},
)
def grant_access(
    dataset_id: UUID,
    payload: DatasetAccessRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> DatasetAccessResponse:
    """Admin cấp quyền toàn dataset cho Data Scientist hoặc Business User.

    Dataset phải có ít nhất một phiên bản APPROVED trước khi cấp quyền.
    Trả về 409 nếu chưa được duyệt hoặc quyền đã tồn tại.
    Ghi nhận người cấp và thời gian cấp quyền.
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


@approved_router.get(
    "/approved",
    response_model=list[ApprovedDatasetResponse],
    summary="Danh sách dataset đã duyệt dành cho Data Scientist và Business User",
)
def approved_datasets(
    search: str | None = Query(None, max_length=255),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ApprovedDatasetResponse]:
    """Chỉ Data Scientist và Business User được gọi API này.

    Trả về các phiên bản APPROVED của dataset đã được Admin cấp quyền.
    Admin và Data Engineer nhận lỗi 403.
    """
    return service.list_approved_datasets(db, current_user, search, skip, limit)


@approved_router.get(
    "/{dataset_id}/versions/{version_id}/sessions",
    response_model=RecordingSessionListResponse,
    summary="DS/BU xem danh sách Recording Sessions của Dataset Version đã duyệt",
    responses={
        403: {"description": "Sai vai trò, chưa có quyền hoặc phiên bản chưa duyệt"},
        404: {"description": "Không tìm thấy dataset, phiên bản hoặc file"},
    },
)
def list_consumer_dataset_sessions(
    dataset_id: UUID,
    version_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RecordingSessionListResponse:
    """Lấy dataset_id và version_id từ GET /datasets/approved.

    Chỉ DS/BU có grant được xem đúng phiên bản APPROVED đã chọn.
    Trả metadata, columns, rows và pagination; không chỉnh sửa file.
    """
    return list_approved_recording_sessions(
        db, current_user, dataset_id, version_id, page, page_size,
    )


@approved_router.get(
    "/{dataset_id}/versions/{version_id}/sessions/{session_id}/preview",
    response_model=RecordingSessionPreviewResponse,
    summary="DS/BU xem trước nội dung CSV của một Recording Session",
    responses={
        403: {"description": "Không có quyền hoặc Version chưa được duyệt"},
        404: {"description": "Không tìm thấy Dataset, Version, Session hoặc file"},
        415: {"description": "Định dạng không được hỗ trợ"},
        422: {"description": "Không đọc được nội dung Session"},
    },
)
def preview_consumer_recording_session(
    dataset_id: UUID,
    version_id: UUID,
    session_id: UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    column_offset: int = Query(0, ge=0),
    representation: Literal["raw", "normalized"] = "normalized",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RecordingSessionPreviewResponse:
    """Preview paginated CSV rows for one session in an approved version."""
    return preview_approved_recording_session(
        db, current_user, dataset_id, version_id, session_id,
        page=page, limit=limit, column_offset=column_offset,
        representation=representation,
    )
