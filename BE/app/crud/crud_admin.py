from datetime import datetime
from uuid import UUID

from sqlalchemy import Text, cast, func, or_
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.audit import AuditLog
from app.models.dataset import Dataset, DatasetVersion
from app.models.experiment import Experiment
from app.models.model_training import ModelTrainingExperiment, ModelTrainingSplit
from app.models.user import Role, User
from app.schemas.admin import UserCreate, UserRoleId
from app.services.audit_log_service import record_audit_event


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


def get_audit_logs(
    db: Session,
    *,
    skip: int = 0,
    limit: int = 50,
    user_id: UUID | None = None,
    action: str | None = None,
    module: str | None = None,
    status: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    search: str | None = None,
) -> tuple[int, list[AuditLog]]:
    """Return a stable, filtered audit-log page and its matching total."""
    query = db.query(AuditLog)
    if user_id is not None:
        query = query.filter(AuditLog.user_id == user_id)
    if action:
        query = query.filter(func.lower(AuditLog.action) == action.lower())
    if module:
        query = query.filter(func.lower(AuditLog.module) == module.lower())
    if status:
        query = query.filter(AuditLog.status == status)
    if start_date is not None:
        query = query.filter(AuditLog.created_at >= start_date)
    if end_date is not None:
        query = query.filter(AuditLog.created_at <= end_date)
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(or_(
            AuditLog.username.ilike(search_pattern),
            AuditLog.action.ilike(search_pattern),
            AuditLog.module.ilike(search_pattern),
            AuditLog.description.ilike(search_pattern),
            AuditLog.resource_id.ilike(search_pattern),
            cast(AuditLog.details, Text).ilike(search_pattern),
        ))

    total = query.count()
    logs = (
        query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return total, logs


def create_audit_log(
    db: Session,
    user_id: UUID | None,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
) -> None:
    """Compatibility wrapper for existing callers; logging is isolated from business DB work."""
    actor = db.get(User, user_id) if user_id is not None else None
    module = {
        "USER": "User Management",
        "DATASET_VERSION": "Dataset",
        "DATASET": "Dataset",
    }.get(resource_type.upper(), resource_type.replace("_", " ").title())
    record_audit_event(
        user=actor,
        user_id=user_id,
        action=action,
        module=module,
        status="SUCCESS",
        description=action.replace("_", " ").title(),
        resource_id=resource_id,
        ip_address=ip_address,
        details=details,
    )


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
    """Return legacy forecasting and persisted Data Scientist training runs."""
    legacy_total = db.query(Experiment).count()
    training_total = db.query(ModelTrainingExperiment).count()
    total_experiments = legacy_total + training_total

    def count_status(model: type, value: str) -> int:
        return db.query(model).filter(model.status == value).count()

    stats = {
        "total_experiments": total_experiments,
        "pending_count": count_status(ModelTrainingExperiment, "PENDING"),
        "running_count": (
            count_status(Experiment, "RUNNING") + count_status(ModelTrainingExperiment, "RUNNING")
        ),
        "completed_count": (
            count_status(Experiment, "COMPLETED") + count_status(ModelTrainingExperiment, "COMPLETED")
        ),
        "failed_count": (
            count_status(Experiment, "FAILED") + count_status(ModelTrainingExperiment, "FAILED")
        ),
    }

    legacy_query = (
        db.query(Experiment)
        .order_by(Experiment.created_at.desc())
        .limit(limit)
        .all()
    )

    experiments: list[dict] = []
    for exp in legacy_query:
        metrics_dict = None
        if exp.evaluation_metric:
            metrics_dict = {
                "mae": float(exp.evaluation_metric.mae),
                "rmse": float(exp.evaluation_metric.rmse),
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
            "experiment_type": "FORECASTING",
            "logs": [],
        })

    training_query = (
        db.query(
            ModelTrainingExperiment,
            User.full_name.label("creator_name"),
            DatasetVersion.version_tag.label("dataset_version_tag"),
            Dataset.name.label("dataset_name"),
        )
        .join(ModelTrainingSplit, ModelTrainingExperiment.split_id == ModelTrainingSplit.id)
        .join(DatasetVersion, ModelTrainingSplit.dataset_version_id == DatasetVersion.id)
        .join(Dataset, DatasetVersion.dataset_id == Dataset.id)
        .outerjoin(User, ModelTrainingExperiment.created_by == User.id)
        .order_by(ModelTrainingExperiment.created_at.desc())
        .limit(limit)
        .all()
    )
    for exp, creator_name, version_tag, dataset_name in training_query:
        random_forest_h1 = (
            (exp.performance_by_horizon or {}).get("1", {}).get("random_forest", {})
        )
        experiments.append({
            "id": exp.id,
            "name": exp.name,
            "model_type": (exp.configuration or {}).get("model", "RANDOM_FOREST"),
            "target_variable": "traffic_flow",
            "temporal_aggregation_sec": 60,
            "status": exp.status,
            "execution_time_sec": exp.execution_time_sec,
            "creator_name": creator_name,
            "dataset_version_tag": version_tag,
            "dataset_name": dataset_name,
            "metrics": {
                "mae": random_forest_h1["mae"],
                "rmse": random_forest_h1["rmse"],
            } if "mae" in random_forest_h1 and "rmse" in random_forest_h1 else None,
            "created_at": exp.created_at,
            "experiment_type": "MODEL_TRAINING",
            "split_id": exp.split_id,
            "hyperparameters": (exp.configuration or {}).get("hyperparameters"),
            "evaluation_mode": (exp.evaluation or {}).get("evaluation_mode"),
            "logs": exp.logs or [],
        })

    experiments.sort(key=lambda item: item["created_at"], reverse=True)

    return {
        "stats": stats,
        "experiments": experiments[:limit],
    }
