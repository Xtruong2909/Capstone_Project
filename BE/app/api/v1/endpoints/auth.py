from app.core.deps import get_current_user, get_user_requiring_password_change
from app.core.security import create_access_token, verify_password
from app.crud import crud_user
from app.database.database import get_db
from app.models.user import User
from app.schemas.user import LoginRequest, PasswordChangeRequest, Token, UserResponse
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

router = APIRouter()


@router.post("/login", response_model=Token, summary="Đăng nhập tài khoản")
def login(request: LoginRequest, db: Session = Depends(get_db)) -> Token:
    """Xác thực tài khoản bằng Email & Mật khẩu, trả về JWT Access Token kèm thông tin User."""
    user = crud_user.authenticate_user(db, email=request.email, password=request.password)
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
    if user.must_change_password:
        token_data["pwd_change_only"] = True
    access_token = create_access_token(data=token_data)

    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
        must_change_password=user.must_change_password,
    )


@router.post("/change-password", response_model=Token, summary="Đổi mật khẩu tạm thời")
def change_password(
    request: PasswordChangeRequest,
    user: User = Depends(get_user_requiring_password_change),
    db: Session = Depends(get_db),
) -> Token:
    """Change the temporary password and return a regular access token."""
    if verify_password(request.new_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu mới phải khác mật khẩu tạm thời",
        )

    user = crud_user.change_user_password(db, user, request.new_password)
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email, "role": user.role_id}
    )
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
        must_change_password=False,
    )


@router.get("/me", response_model=UserResponse, summary="Lấy thông tin tài khoản hiện tại")
def get_current_user_profile(current_user: User = Depends(get_current_user)) -> UserResponse:
    """Xem thông tin tài khoản và vai trò đang đăng nhập."""
    return UserResponse.model_validate(current_user)
