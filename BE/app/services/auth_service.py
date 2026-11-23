"""Authentication business operations."""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.security import verify_password
from app.crud import crud_user
from app.models.user import User
from app.services.audit_log_service import record_audit_event
from app.services.login_rate_limit_service import check_login_limit


def authenticate_browser_user(
    db: Session, email: str, password: str, ip_address: str
) -> User:
    check_login_limit(ip_address)
    user = crud_user.authenticate_user(db, email=email, password=password)
    if not user or not user.is_active:
        record_audit_event(
            action="LOGIN_FAILED", module="Authentication", status="FAILED",
            description="Login failed", username=email, ip_address=ip_address,
        )
        raise HTTPException(status_code=401, detail="Email hoặc mật khẩu không chính xác")
    if user.role_id != "admin":
        record_audit_event(
            action="LOGIN", module="Authentication", status="SUCCESS",
            description="Login successful", user=user, ip_address=ip_address,
        )
    return user


def logout_user(user: User, ip_address: str | None = None) -> None:
    """Record a successful logout for the authenticated account."""
    record_audit_event(
        action="LOGOUT",
        module="Authentication",
        status="SUCCESS",
        description="Logout successful",
        user=user,
        ip_address=ip_address,
    )


def change_temporary_password(db: Session, user: User, new_password: str) -> User:
    if not user.must_change_password:
        raise HTTPException(status_code=403, detail="Account does not require a password change")
    if verify_password(new_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="New password must differ from temporary password")
    return crud_user.change_user_password(db, user, new_password)
