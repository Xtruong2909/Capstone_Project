from uuid import UUID

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.audit import AuditLog
from app.models.dataset import Dataset, DatasetVersion
from app.models.user import Role, User
from app.schemas.admin import UserCreate


def get_admin_stats(db: Session) -> dict:
    """Compute real platform counts from database tables."""
    total_users = db.query(User).count()
    total_roles = db.query(Role).count()
    total_datasets = db.query(Dataset).count()
    pending_approvals = db.query(DatasetVersion).filter(DatasetVersion.approval_status == "PENDING").count()
    total_audit_logs = db.query(AuditLog).count()

    return {
        "total_users": total_users,
        "total_roles": total_roles,
        "total_datasets": total_datasets,
        "pending_approvals": pending_approvals,
        "total_audit_logs": total_audit_logs,
    }


def get_all_users(db: Session, skip: int = 0, limit: int = 100) -> list[User]:
    """Get all users ordered by creation date descending."""
    return db.query(User).order_by(User.created_at.desc()).offset(skip).limit(limit).all()


def create_user(db: Session, user_in: UserCreate) -> User:
    """Create a new user with hashed password."""
    user = User(
        email=user_in.email,
        full_name=user_in.full_name,
        role_id=user_in.role_id,
        hashed_password=hash_password(user_in.password),
        is_active=user_in.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_user_status(db: Session, user_id: UUID, is_active: bool) -> User | None:
    """Toggle or update is_active status of user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    user.is_active = is_active
    db.commit()
    db.refresh(user)
    return user


def get_all_roles(db: Session) -> list[Role]:
    """List all available system roles."""
    return db.query(Role).order_by(Role.id).all()


def get_audit_logs(db: Session, skip: int = 0, limit: int = 50) -> list[dict]:
    """Retrieve audit logs with associated user email."""
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()
    result = []
    for log in logs:
        user_email = log.user.email if log.user else None
        result.append({
            "id": log.id,
            "user_id": log.user_id,
            "user_email": user_email,
            "action": log.action,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "details": log.details,
            "ip_address": log.ip_address,
            "created_at": log.created_at,
        })
    return result


def create_audit_log(
    db: Session,
    user_id: UUID | None,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    """Record an audit trail entry."""
    log = AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details,
        ip_address=ip_address,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def get_dataset_versions_for_approval(db: Session, skip: int = 0, limit: int = 50) -> list[dict]:
    """Retrieve dataset versions for approval management."""
    versions = (
        db.query(DatasetVersion, Dataset.name.label("dataset_name"))
        .join(Dataset, DatasetVersion.dataset_id == Dataset.id)
        .order_by(DatasetVersion.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    result = []
    for ver, dataset_name in versions:
        result.append({
            "id": ver.id,
            "dataset_id": ver.dataset_id,
            "dataset_name": dataset_name,
            "version_tag": ver.version_tag,
            "file_format": ver.file_format,
            "total_records": ver.total_records,
            "approval_status": ver.approval_status,
            "created_at": ver.created_at,
        })
    return result


def approve_or_reject_dataset_version(
    db: Session,
    version_id: UUID,
    status: str,
    note: str | None,
    admin_id: UUID,
) -> DatasetVersion | None:
    """Approve or reject a dataset version."""
    version = db.query(DatasetVersion).filter(DatasetVersion.id == version_id).first()
    if not version:
        return None
    version.approval_status = status.upper()
    version.approved_by = admin_id
    version.approval_note = note
    db.commit()
    db.refresh(version)
    return version
