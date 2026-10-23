import smtplib

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_user_requiring_password_change
from app.core.security import create_access_token, verify_password
from app.crud import crud_user
from app.database.database import get_db
from app.models.user import User
from app.schemas.user import (
    ChangePasswordProfileRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    PasswordChangeRequest,
    ResetPasswordWithOtpRequest,
    Token,
    UserResponse,
    VerifyOtpRequest,
)
from app.services import otp_service
from app.services.email_service import EmailConfigurationError, send_otp_email

router = APIRouter()


def _send_otp(email: str) -> None:
    otp = otp_service.generate_otp_for_email(email)
    try:
        send_otp_email(email, otp)
    except EmailConfigurationError as exc:
        otp_service.clear_otp_session(email)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email chưa được cấu hình. Không thể gửi mã OTP.",
        ) from exc
    except (OSError, smtplib.SMTPException) as exc:
        otp_service.clear_otp_session(email)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Không gửi được email OTP. Vui lòng thử lại sau.",
        ) from exc


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

##########Quên mật khẩu (Forgot Password)#########
@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    summary="Yêu cầu gửi mã OTP đặt lại mật khẩu",
)
def forgot_password(
    request: ForgotPasswordRequest,
    db: Session = Depends(get_db),
) -> MessageResponse:
    """Kiểm tra email người dùng và gửi mã OTP 6 số."""
    user = crud_user.get_user_by_email(db, email=request.email)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email không tồn tại trong hệ thống hoặc tài khoản đã bị khóa",
        )

    _send_otp(user.email)

    return MessageResponse(
        message=f"Mã OTP xác thực đã được gửi tới hòm thư {user.email}."
    )


@router.post(
    "/verify-otp",
    response_model=MessageResponse,
    summary="Xác thực mã OTP 6 số",
)
def verify_otp(request: VerifyOtpRequest) -> MessageResponse:
    """Kiểm tra mã OTP. Nếu đúng, cấp reset_token để dùng ở bước đặt lại mật khẩu."""
    reset_token = otp_service.verify_otp_code(email=request.email, otp=request.otp)
    if not reset_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mã OTP không chính xác hoặc đã hết hạn (5 phút). Vui lòng thử lại.",
        )

    return MessageResponse(
        message="Xác thực mã OTP thành công.",
        reset_token=reset_token,
    )


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Đặt lại mật khẩu mới bằng OTP reset token",
)
def reset_password(
    request: ResetPasswordWithOtpRequest,
    db: Session = Depends(get_db),
) -> MessageResponse:
    """Cập nhật mật khẩu mới cho người dùng sau khi xác thực OTP thành công."""
    if not otp_service.verify_reset_token(email=request.email, reset_token=request.reset_token):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phiên đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng gửi lại OTP.",
        )

    user = crud_user.get_user_by_email(db, email=request.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy người dùng",
        )

    # Cập nhật mật khẩu mới qua tầng CRUD
    crud_user.change_user_password(db, user, request.new_password)

    # Dọn dẹp phiên OTP
    otp_service.clear_otp_session(request.email)

    return MessageResponse(
        message="Đặt lại mật khẩu thành công! Bạn có thể đăng nhập bằng mật khẩu mới."
    )

#########Thay đổi mật khẩu trong Profile (User đang đăng nhập)#########
@router.post(
    "/profile/change-password",
    response_model=MessageResponse,
    summary="[Profile] Đổi mật khẩu bằng mật khẩu hiện tại",
)
def change_password_in_profile(
    request: ChangePasswordProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    """Change the password after verifying the current password."""
    if not verify_password(request.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu hiện tại không chính xác.",
        )
    if verify_password(request.new_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu mới phải khác mật khẩu hiện tại.",
        )

    crud_user.change_user_password(db, current_user, request.new_password)
    return MessageResponse(
        message="Đổi mật khẩu thành công! Mật khẩu mới đã có hiệu lực."
    )