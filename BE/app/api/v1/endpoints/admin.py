import secrets
import smtplib
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.core.deps import require_admin
from app.crud import crud_admin, crud_user
from app.database.database import get_db
from app.models.dataset import DatasetVersion
from app.models.user import User
from app.schemas.admin import (
    AdminStats,
    AuditLogResponse,
    DatasetApprovalAction,
    DatasetApprovalResponse,
    ExperimentsOverviewResponse,
    RoleResponse,
    UserCreate,
    UserStatusUpdate,
)
from app.schemas.dataset import DatasetPreviewResponse
from app.schemas.user import UserResponse
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
from app.services.email_service import EmailConfigurationError, send_initial_credentials

router = APIRouter(dependencies=[Depends(require_admin)])


@router.get("/stats", response_model=AdminStats, summary="Thống kê tổng quan hệ thống")
def get_stats(
    db: Session = Depends(get_db),
) -> AdminStats:
    """Lấy số lượng thực tế từ các bảng trong database."""
    stats = crud_admin.get_admin_stats(db)
    return AdminStats(**stats)


@router.get("/users", response_model=list[UserResponse], summary="Danh sách người dùng")
def list_users(
    db: Session = Depends(get_db),
) -> list[UserResponse]:
    """Lấy toàn bộ danh sách người dùng trong hệ thống."""
    users = crud_admin.get_all_users(db, skip=0, limit=100)
    return [UserResponse.model_validate(u) for u in users]


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED, summary="Tạo người dùng mới")
def create_new_user(
    user_in: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> UserResponse:
    """Tạo tài khoản mới và gán Role."""
    if user_in.role_id == "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể tạo tài khoản Administrator qua biểu mẫu này",
        )

    existing = crud_user.get_user_by_email(db, email=user_in.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email đã được sử dụng trong hệ thống",
        )

    temporary_password = secrets.token_urlsafe(18)
    user = crud_admin.create_user(db, user_in, initial_password=temporary_password)
    try:
        send_initial_credentials(user.email, user.full_name, temporary_password)
    except EmailConfigurationError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email chưa được cấu hình. Chưa tạo tài khoản.",
        ) from exc
    except (OSError, smtplib.SMTPException) as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Không gửi được email tài khoản. Chưa tạo tài khoản.",
        ) from exc

    # Ghi nhận Audit Log
    client_ip = request.client.host if request.client else None
    crud_admin.create_audit_log(
        db,
        user_id=admin.id,
        action="CREATE_USER",
        resource_type="USER",
        resource_id=str(user.id),
        details={"created_email": user.email, "assigned_role": user.role_id},
        ip_address=client_ip,
    )

    return UserResponse.model_validate(user)


@router.patch(
    "/users/{user_id}/status",
    response_model=UserResponse,
    summary="Khóa/thu hồi quyền truy cập hoặc kích hoạt lại tài khoản",
)
def update_user_status(
    user_id: UUID,
    status_update: UserStatusUpdate,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> UserResponse:
    """Khóa tài khoản để chặn đăng nhập/API, hoặc kích hoạt lại tài khoản."""
    if admin.id == user_id and not status_update.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể tự vô hiệu hóa tài khoản của chính mình",
        )

    user = crud_admin.update_user_status(db, user_id=user_id, is_active=status_update.is_active)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy người dùng",
        )

    # Ghi nhận Audit Log
    client_ip = request.client.host if request.client else None
    crud_admin.create_audit_log(
        db,
        user_id=admin.id,
        action="UPDATE_USER_STATUS",
        resource_type="USER",
        resource_id=str(user.id),
        details={"email": user.email, "is_active": user.is_active},
        ip_address=client_ip,
    )

    return UserResponse.model_validate(user)


@router.get("/roles", response_model=list[RoleResponse], summary="Danh sách vai trò hệ thống")
def list_roles(
    db: Session = Depends(get_db),
) -> list[RoleResponse]:
    """Lấy danh sách 5 roles chuẩn hóa."""
    roles = crud_admin.get_all_roles(db)
    return [RoleResponse.model_validate(r) for r in roles]


@router.get("/audit-logs", response_model=list[AuditLogResponse], summary="Nhật ký hoạt động hệ thống")
def list_audit_logs(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
) -> list[AuditLogResponse]:
    """Xem audit trail thực tế của hệ thống."""
    logs = crud_admin.get_audit_logs(db, skip=skip, limit=limit)
    return [AuditLogResponse(**log) for log in logs]


@router.get("/datasets", response_model=list[DatasetApprovalResponse], summary="Danh sách phiên bản dataset")
def list_datasets_for_approval(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
) -> list[DatasetApprovalResponse]:
    """Xem danh sách các phiên bản dataset để phê duyệt."""
    datasets = crud_admin.get_dataset_versions_for_approval(db, skip=skip, limit=limit)
    return [DatasetApprovalResponse(**d) for d in datasets]


@router.get(
    "/datasets/{dataset_id}/versions/{id}/preview",
    response_model=DatasetPreviewResponse,
    summary="Admin xem trước nội dung phiên bản dataset",
)
def preview_dataset_version_for_admin(
    dataset_id: UUID,
    id: UUID,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    representation: Literal["raw", "normalized"] = "normalized",
    db: Session = Depends(get_db),
) -> DatasetPreviewResponse:
    """Read a paginated preview of a specific dataset version for admin review."""
    try:
        preview = get_dataset_preview(
            db,
            dataset_id=dataset_id,
            dataset_version_id=id,
            page=page,
            page_size=page_size,
            representation=representation,
        )
        return apply_saved_column_mappings(
            db,
            dataset_id=dataset_id,
            preview=preview,
        )
    except DatasetPreviewNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
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
    except DatasetMappingNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post(
    "/datasets/{dataset_id}/versions/{id}/review",
    summary="Phê duyệt hoặc từ chối phiên bản dataset",
)
def review_dataset(
    dataset_id: UUID,
    id: UUID,
    action: DatasetApprovalAction,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Phê duyệt hoặc từ chối phiên bản dataset do Data Engineer gửi."""
    if action.status not in ["APPROVED", "REJECTED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trạng thái phê duyệt không hợp lệ (APPROVED hoặc REJECTED)",
        )

    dataset_version = (
        db.query(DatasetVersion)
        .filter(DatasetVersion.id == id, DatasetVersion.dataset_id == dataset_id)
        .first()
    )
    if not dataset_version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy phiên bản dataset trong dataset này",
        )

    ver = crud_admin.approve_or_reject_dataset_version(
        db,
        version_id=id,
        status=action.status,
        note=action.note,
        admin_id=admin.id,
    )
    if not ver:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy phiên bản dataset",
        )

    # Ghi nhận Audit Log
    client_ip = request.client.host if request.client else None
    crud_admin.create_audit_log(
        db,
        user_id=admin.id,
        action=f"DATASET_{action.status}",
        resource_type="DATASET_VERSION",
        resource_id=str(ver.id),
        details={"status": action.status, "note": action.note},
        ip_address=client_ip,
    )

    return {
        "message": f"Đã cập nhật trạng thái phiên bản thành {action.status}",
        "id": str(ver.id),
        "status": ver.approval_status,
        "note": ver.approval_note,
    }


@router.post("/datasets/{version_id}/review", include_in_schema=False)
def review_dataset_legacy(
    version_id: UUID,
    action: DatasetApprovalAction,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    dataset_version = db.query(DatasetVersion).filter(DatasetVersion.id == version_id).first()
    if not dataset_version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy phiên bản dataset",
        )

    return review_dataset(
        dataset_id=dataset_version.dataset_id,
        id=version_id,
        action=action,
        request=request,
        db=db,
        admin=admin,
    )


@router.get("/experiments/overview", response_model=ExperimentsOverviewResponse, summary="Tổng quan thí nghiệm AI/ML")
def get_experiments_overview(
    limit: int = 10,
    db: Session = Depends(get_db),
) -> ExperimentsOverviewResponse:
    """Giám sát các thí nghiệm mô hình AI/ML (ARIMA, Prophet) và metrics."""
    data = crud_admin.get_experiments_overview_data(db, limit=limit)
    return ExperimentsOverviewResponse(**data)
