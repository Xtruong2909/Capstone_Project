import secrets
import smtplib
from datetime import datetime
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
    AuditLogPage,
    AuditLogResponse,
    DatasetApprovalAction,
    DatasetApprovalResponse,
    ExperimentsOverviewResponse,
    RoleResponse,
    UserCreate,
    UserStatusUpdate,
)
from app.schemas.dataset import (
    RecordingSessionListResponse,
    RecordingSessionPreviewResponse,
)
from app.schemas.user import UserResponse
from app.services.audit_log_service import audit_action, record_audit_event
from app.services.dataset_preview_service import (
    DatasetPreviewFormatError,
    DatasetPreviewNotFoundError,
    DatasetPreviewReadError,
)
from app.services.dataset_review_service import (
    list_recording_sessions,
    preview_recording_session,
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
    with audit_action(
        action="CREATE_USER",
        module="User Management",
        description="User account creation",
        user=admin,
        ip_address=request.client.host if request.client else None,
        record_success=False,
    ):
        user = crud_admin.create_user(db, user_in, initial_password=temporary_password)
    try:
        send_initial_credentials(user.email, user.full_name, temporary_password)
    except EmailConfigurationError as exc:
        db.rollback()
        record_audit_event(
            user=admin,
            action="CREATE_USER",
            module="User Management",
            status="FAILED",
            description="User creation failed because email delivery is unavailable",
            resource_id=user.id,
            ip_address=request.client.host if request.client else None,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email chưa được cấu hình. Chưa tạo tài khoản.",
        ) from exc
    except (OSError, smtplib.SMTPException) as exc:
        db.rollback()
        record_audit_event(
            user=admin,
            action="CREATE_USER",
            module="User Management",
            status="FAILED",
            description="User creation failed because credentials could not be emailed",
            resource_id=user.id,
            ip_address=request.client.host if request.client else None,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Không gửi được email tài khoản. Chưa tạo tài khoản.",
        ) from exc

    db.commit()
    db.refresh(user)

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

    with audit_action(
        action="UPDATE_USER",
        module="User Management",
        description="User status updated",
        user=admin,
        resource_id=user_id,
        ip_address=request.client.host if request.client else None,
        details={"is_active": status_update.is_active},
        record_success=False,
    ):
        user = crud_admin.update_user_status(db, user_id=user_id, is_active=status_update.is_active)
    if not user:
        record_audit_event(
            user=admin,
            action="UPDATE_USER",
            module="User Management",
            status="FAILED",
            description="User status update failed because the user was not found",
            resource_id=user_id,
            ip_address=request.client.host if request.client else None,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy người dùng",
        )

    # Ghi nhận Audit Log
    client_ip = request.client.host if request.client else None
    crud_admin.create_audit_log(
        db,
        user_id=admin.id,
        action="UPDATE_USER",
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


@router.get("/audit-logs", response_model=AuditLogPage, summary="Nhật ký hoạt động hệ thống")
def list_audit_logs(
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    user_id: UUID | None = None,
    action: Annotated[str | None, Query(max_length=100)] = None,
    module: Annotated[str | None, Query(max_length=100)] = None,
    status_filter: Annotated[
        Literal["SUCCESS", "FAILED"] | None, Query(alias="status")
    ] = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    search: Annotated[str | None, Query(max_length=255)] = None,
    db: Session = Depends(get_db),
) -> AuditLogPage:
    """Search and page the append-only audit trail; timestamps must include timezone."""
    if start_date and (start_date.tzinfo is None or start_date.utcoffset() is None):
        raise HTTPException(status_code=422, detail="start_date must include a timezone")
    if end_date and (end_date.tzinfo is None or end_date.utcoffset() is None):
        raise HTTPException(status_code=422, detail="end_date must include a timezone")
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=422, detail="start_date must not be later than end_date")

    total, logs = crud_admin.get_audit_logs(
        db,
        skip=skip,
        limit=limit,
        user_id=user_id,
        action=action,
        module=module,
        status=status_filter,
        start_date=start_date,
        end_date=end_date,
        search=search,
    )
    return AuditLogPage(
        total=total,
        skip=skip,
        limit=limit,
        items=[AuditLogResponse.model_validate(log) for log in logs],
    )


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
    "/datasets/{dataset_id}/versions/{id}/sessions",
    response_model=RecordingSessionListResponse,
    summary="Admin xem Recording Sessions thuộc phiên bản Dataset",
)
def list_dataset_version_sessions_for_admin(
    dataset_id: UUID,
    id: UUID,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    db: Session = Depends(get_db),
) -> RecordingSessionListResponse:
    try:
        return list_recording_sessions(
            db, dataset_id, id, page=page, page_size=page_size,
        )
    except DatasetPreviewNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get(
    "/datasets/{dataset_id}/versions/{id}/sessions/{session_id}/preview",
    response_model=RecordingSessionPreviewResponse,
    summary="Admin preview nội dung CSV của một Recording Session",
    description=(
        "Trả về dữ liệu dạng bảng có phân trang. representation=raw giữ nguyên cột CSV gốc; "
        "representation=normalized áp dụng mapping đã lưu nếu có. Mặc định 20 dòng."
    ),
    responses={
        404: {"description": "Dataset, phiên bản, session hoặc file không tồn tại"},
        415: {"description": "Session không chứa file CSV"},
        422: {"description": "CSV lỗi định dạng hoặc không đọc được"},
    },
)
def preview_dataset_session_for_admin(
    dataset_id: UUID,
    id: UUID,
    session_id: UUID,
    page: Annotated[int, Query(ge=1, le=10000)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    column_offset: Annotated[int, Query(ge=0, le=100000)] = 0,
    representation: Literal["raw", "normalized"] = "normalized",
    db: Session = Depends(get_db),
) -> RecordingSessionPreviewResponse:
    try:
        return preview_recording_session(
            db, dataset_id, id, session_id,
            page=page, limit=limit, column_offset=column_offset,
            representation=representation,
        )
    except DatasetPreviewNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except DatasetPreviewFormatError as exc:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=str(exc)) from exc
    except DatasetPreviewReadError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


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

    with audit_action(
        action="APPROVE_DATASET",
        module="Dataset",
        description="Dataset approval review",
        user=admin,
        resource_id=id,
        ip_address=request.client.host if request.client else None,
        details={"status": action.status},
        record_success=False,
    ):
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
        action="APPROVE_DATASET",
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
    limit: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
) -> ExperimentsOverviewResponse:
    """Giám sát trạng thái, metrics và nhật ký chạy thí nghiệm AI/ML."""
    data = crud_admin.get_experiments_overview_data(db, limit=limit)
    return ExperimentsOverviewResponse(**data)
