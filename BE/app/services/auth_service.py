"""Authentication business operations."""

from app.models.user import User
from app.services.audit_log_service import record_audit_event


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
