"""Best-effort append-only audit event persistence."""

import logging
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.database.database import SessionLocal
from app.models.audit import AuditLog
from app.models.user import User

logger = logging.getLogger(__name__)


def record_audit_event(
    *,
    action: str,
    module: str,
    status: str,
    description: str,
    user: User | None = None,
    user_id: UUID | None = None,
    username: str | None = None,
    resource_id: str | UUID | None = None,
    ip_address: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    """Persist an event in an independent transaction without changing business outcomes."""
    audit_db = None
    try:
        audit_db = SessionLocal()
        actor_id = user.id if user else user_id
        actor_name = user.full_name if user else username
        if actor_id is not None and actor_name is None:
            actor = audit_db.get(User, actor_id)
            actor_name = actor.full_name if actor else None
        audit_db.add(AuditLog(
            user_id=actor_id,
            username=actor_name,
            action=action,
            module=module,
            status=status,
            description=description,
            resource_type=module.upper().replace(" ", "_"),
            resource_id=str(resource_id) if resource_id is not None else None,
            ip_address=ip_address,
            details=details,
            created_at=datetime.now(UTC),
        ))
        audit_db.commit()
    except Exception:
        if audit_db is not None:
            audit_db.rollback()
        logger.exception("Could not persist audit event %s", action)
    finally:
        if audit_db is not None:
            try:
                audit_db.close()
            except Exception:
                logger.exception("Could not close the audit-log database session")


@contextmanager
def audit_action(
    *,
    action: str,
    module: str,
    description: str,
    user: User | None,
    ip_address: str | None,
    resource_id: str | UUID | None = None,
    details: dict[str, Any] | None = None,
    record_success: bool = True,
) -> Iterator[None]:
    """Audit the final outcome of an operation and re-raise its original errors."""
    try:
        yield
    except Exception as exc:
        failure_details = dict(details or {})
        failure_details["error_type"] = type(exc).__name__
        record_audit_event(
            action=action,
            module=module,
            status="FAILED",
            description=f"{description} failed",
            user=user,
            resource_id=resource_id,
            ip_address=ip_address,
            details=failure_details,
        )
        raise
    else:
        if record_success:
            record_audit_event(
                action=action,
                module=module,
                status="SUCCESS",
                description=description,
                user=user,
                resource_id=resource_id,
                ip_address=ip_address,
                details=details,
            )
