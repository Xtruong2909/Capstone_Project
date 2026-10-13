from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.deps import require_admin
from app.crud import crud_admin, crud_user
from app.database.database import get_db
from app.models.user import User
from app.schemas.admin import (
    AdminStats,
    AuditLogResponse,
    DatasetApprovalAction,
    DatasetApprovalResponse,
    RoleResponse,
    UserCreate,
    UserStatusUpdate,
)
from app.schemas.user import UserResponse

router = APIRouter()


@router.get("/stats", response_model=AdminStats, summary="Thống kê tổng quan hệ thống")
def get_stats(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AdminStats:
    """Lấy số lượng thực tế từ các bảng trong database."""
    stats = crud_admin.get_admin_stats(db)
    return AdminStats(**stats)


@router.get("/users", response_model=list[UserResponse], summary="Danh sách người dùng")
def list_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[UserResponse]:
    """Lấy toàn bộ danh sách người dùng trong hệ thống."""
    users = crud_admin.get_all_users(db, skip=skip, limit=limit)
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

    user = crud_admin.create_user(db, user_in)

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


@router.patch("/users/{user_id}/status", response_model=UserResponse, summary="Thay đổi trạng thái kích hoạt tài khoản")
def update_user_status(
    user_id: UUID,
    status_update: UserStatusUpdate,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> UserResponse:
    """Khóa hoặc kích hoạt lại tài khoản người dùng."""
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
    admin: User = Depends(require_admin),
) -> list[RoleResponse]:
    """Lấy danh sách 5 roles chuẩn hóa."""
    roles = crud_admin.get_all_roles(db)
    return [RoleResponse.model_validate(r) for r in roles]


@router.get("/audit-logs", response_model=list[AuditLogResponse], summary="Nhật ký hoạt động hệ thống")
def list_audit_logs(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[AuditLogResponse]:
    """Xem audit trail thực tế của hệ thống."""
    logs = crud_admin.get_audit_logs(db, skip=skip, limit=limit)
    return [AuditLogResponse(**log) for log in logs]


@router.get("/datasets", response_model=list[DatasetApprovalResponse], summary="Danh sách phiên bản dataset")
def list_datasets_for_approval(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[DatasetApprovalResponse]:
    """Xem danh sách các phiên bản dataset để phê duyệt."""
    datasets = crud_admin.get_dataset_versions_for_approval(db, skip=skip, limit=limit)
    return [DatasetApprovalResponse(**d) for d in datasets]


@router.post("/datasets/{version_id}/review", summary="Phê duyệt hoặc từ chối phiên bản dataset")
def review_dataset(
    version_id: UUID,
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

    ver = crud_admin.approve_or_reject_dataset_version(
        db,
        version_id=version_id,
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

    return {"message": f"Đã cập nhật trạng thái phiên bản thành {action.status}", "id": str(ver.id)}
