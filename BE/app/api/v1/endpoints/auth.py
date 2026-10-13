from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.security import create_access_token
from app.crud.crud_user import authenticate_user
from app.database.database import get_db
from app.models.user import User
from app.schemas.user import LoginRequest, Token, UserResponse

router = APIRouter()


@router.post("/login", response_model=Token, summary="Đăng nhập tài khoản")
def login(request: LoginRequest, db: Session = Depends(get_db)) -> Token:
    """Xác thực tài khoản bằng Email & Mật khẩu, trả về JWT Access Token kèm thông tin User."""
    user = authenticate_user(db, email=request.email, password=request.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không chính xác",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản đã bị vô hiệu hóa hoặc khóa",
        )

    token_data = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role_id,
    }
    access_token = create_access_token(data=token_data)

    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse, summary="Lấy thông tin tài khoản hiện tại")
def get_current_user_profile(current_user: User = Depends(get_current_user)) -> UserResponse:
    """Xem thông tin tài khoản và vai trò đang đăng nhập."""
    return UserResponse.model_validate(current_user)
