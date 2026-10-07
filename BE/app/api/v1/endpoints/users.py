from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_roles
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserResponse, UserUpdate

router = APIRouter()
admin_only = require_roles(UserRole.ADMIN)


@router.get(
    "/", response_model=list[UserResponse], summary="[Admin] Xem danh sách người dùng và vai trò"
)
def list_users(db: Session = Depends(get_db), current_user: User = Depends(admin_only)):
    """Admin xem danh sách toàn bộ người dùng và vai trò trong hệ thống."""
    return db.query(User).order_by(User.id.asc()).all()


@router.post(
    "/", response_model=UserResponse, summary="[Admin] Tạo người dùng và gán vai trò (Role)"
)
def create_user(
    request: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(admin_only)
):
    """Admin tạo tài khoản mới và gán 1 trong 4 vai trò: Admin, Data Engineer, Data Scientist, Business User."""
    existing = db.query(User).filter(User.email == request.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email này đã được đăng ký")

    new_user = User(
        email=request.email,
        full_name=request.full_name,
        role=request.role,
        hashed_password=hash_password(request.password),
        is_active=request.is_active,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return UserResponse.model_validate(new_user)


@router.put(
    "/{user_id}",
    response_model=UserResponse,
    summary="[Admin] Cập nhật vai trò hoặc trạng thái tài khoản",
)
def update_user(
    user_id: int,
    request: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_only),
):
    """Admin phân lại vai trò (Role) hoặc kích hoạt/khóa tài khoản."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")

    if request.role is not None:
        user.role = request.role
    if request.is_active is not None:
        user.is_active = request.is_active
    if request.full_name is not None:
        user.full_name = request.full_name
    if request.password:
        user.hashed_password = hash_password(request.password)

    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)
