from uuid import UUID

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.audit import AuditLog
from app.models.dataset import Dataset, DatasetVersion
from app.models.experiment import EvaluationMetric, Experiment
from app.models.user import Role, User
from app.schemas.admin import UserCreate, UserRoleId


def get_admin_stats(db: Session) -> dict:
    """Compute real platform counts from database tables."""
    total_users = db.query(User).count()
    total_roles = db.query(Role).count()
    total_datasets = db.query(Dataset).count()
    pending_approvals = (
        db.query(DatasetVersion)
        .filter(
            DatasetVersion.approval_status == "SUBMITTED",
            DatasetVersion.submitted_by.is_not(None),
            DatasetVersion.submitted_at.is_not(None),
        )
        .count()
    )
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


def create_user(db: Session, user_in: UserCreate, initial_password: str) -> User:
    """Create a user whose temporary password must be changed at first login."""
    role_id_by_number = {
        UserRoleId.BUSINESS_USER: "business_user",
        UserRoleId.DATA_ENGINEER: "data_engineer",
        UserRoleId.DATA_SCIENTIST: "data_scientist",
    }
    user = User(
        email=user_in.email,
        full_name=user_in.full_name,
        role_id=role_id_by_number[user_in.role_id],
        hashed_password=hash_password(initial_password),
        is_active=user_in.is_active,
        must_change_password=True,
    )
    db.add(user)
    db.flush()
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
        .filter(
            DatasetVersion.approval_status == "SUBMITTED",
            DatasetVersion.submitted_by.is_not(None),
            DatasetVersion.submitted_at.is_not(None),
        )
        .order_by(DatasetVersion.submitted_at.desc().nullslast(), DatasetVersion.created_at.desc())
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


def get_experiments_overview_data(db: Session, limit: int = 10) -> dict:
    """Retrieve ML forecasting experiments and compute summary metrics."""
    total_experiments = db.query(Experiment).count()
    running_count = db.query(Experiment).filter(Experiment.status == "RUNNING").count()
    completed_count = db.query(Experiment).filter(Experiment.status == "COMPLETED").count()
    failed_count = db.query(Experiment).filter(Experiment.status == "FAILED").count()

    # Find best model based on highest R2 score
    best_record = (
        db.query(EvaluationMetric, Experiment)
        .join(Experiment, EvaluationMetric.experiment_id == Experiment.id)
        .order_by(EvaluationMetric.r2_score.desc())
        .first()
    )

    best_model_name = None
    best_r2_score = None
    if best_record:
        metric, exp = best_record
        best_model_name = f"{exp.name} ({exp.model_type})"
        best_r2_score = float(metric.r2_score)

    stats = {
        "total_experiments": total_experiments,
        "running_count": running_count,
        "completed_count": completed_count,
        "failed_count": failed_count,
        "best_model_name": best_model_name,
        "best_r2_score": best_r2_score,
    }

    # Retrieve experiments with details
    experiments_query = (
        db.query(Experiment)
        .order_by(Experiment.created_at.desc())
        .limit(limit)
        .all()
    )

    experiments = []
    for exp in experiments_query:
        metrics_dict = None
        if exp.evaluation_metric:
            metrics_dict = {
                "mae": float(exp.evaluation_metric.mae),
                "rmse": float(exp.evaluation_metric.rmse),
                "mape": float(exp.evaluation_metric.mape),
                "r2_score": float(exp.evaluation_metric.r2_score),
            }

        experiments.append({
            "id": exp.id,
            "name": exp.name,
            "model_type": exp.model_type,
            "target_variable": exp.target_variable,
            "temporal_aggregation_sec": exp.temporal_aggregation_sec,
            "status": exp.status,
            "execution_time_sec": float(exp.execution_time_sec) if exp.execution_time_sec else None,
            "creator_name": exp.creator.full_name if exp.creator else None,
            "dataset_version_tag": exp.dataset_version.version_tag if exp.dataset_version else None,
            "dataset_name": exp.dataset_version.dataset.name if exp.dataset_version and exp.dataset_version.dataset else None,
            "metrics": metrics_dict,
            "created_at": exp.created_at,
        })

    return {
        "stats": stats,
        "experiments": experiments,
    }
