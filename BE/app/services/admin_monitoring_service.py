"""Admin-facing audit and experiment monitoring responses."""

from datetime import datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.crud import crud_admin
from app.models.experiment import Experiment
from app.models.model_training import ModelTrainingExperiment
from app.schemas.admin import (
    AuditLogPage,
    AuditLogResponse,
    ExperimentsOverviewResponse,
)


def list_audit_logs(
    db: Session,
    *,
    skip: int,
    limit: int,
    user_id: UUID | None,
    action: str | None,
    module: str | None,
    resource_id: str | None,
    status: str | None,
    start_date: datetime | None,
    end_date: datetime | None,
    search: str | None,
) -> AuditLogPage:
    """Validate a bounded audit query and serialize its persisted events."""
    if start_date and (start_date.tzinfo is None or start_date.utcoffset() is None):
        raise HTTPException(status_code=422, detail="start_date must include a timezone")
    if end_date and (end_date.tzinfo is None or end_date.utcoffset() is None):
        raise HTTPException(status_code=422, detail="end_date must include a timezone")
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=422, detail="start_date must not be later than end_date")

    total, logs = crud_admin.get_audit_logs(
        db,
        skip=skip,
        limit=limit,
        user_id=user_id,
        action=action,
        module=module,
        resource_id=resource_id,
        status=status,
        start_date=start_date,
        end_date=end_date,
        search=search,
    )
    return AuditLogPage(
        total=total,
        skip=skip,
        limit=limit,
        items=[AuditLogResponse.model_validate(log) for log in logs],
    )


def get_experiments_overview(db: Session, *, limit: int) -> ExperimentsOverviewResponse:
    """Expose the latest persisted experiments and evaluation metrics."""
    count = crud_admin.count_experiments
    stats = {
        "total_experiments": count(db, Experiment) + count(db, ModelTrainingExperiment),
        "pending_count": count(db, ModelTrainingExperiment, "PENDING")
        + count(db, ModelTrainingExperiment, "QUEUED"),
        "running_count": count(db, Experiment, "RUNNING")
        + count(db, ModelTrainingExperiment, "RUNNING"),
        "completed_count": count(db, Experiment, "COMPLETED")
        + count(db, ModelTrainingExperiment, "COMPLETED"),
        "failed_count": count(db, Experiment, "FAILED")
        + count(db, ModelTrainingExperiment, "FAILED"),
    }

    experiments: list[dict] = []
    for exp in crud_admin.list_recent_legacy_experiments(db, limit):
        metrics = None
        if exp.evaluation_metric:
            metrics = {
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
            "dataset_name": exp.dataset_version.dataset.name
            if exp.dataset_version and exp.dataset_version.dataset else None,
            "metrics": metrics,
            "created_at": exp.created_at,
            "experiment_type": "FORECASTING",
        })

    for (exp, creator_name, version_tag, dataset_name, feature_generation_id,
         aggregation_id, aggregation_interval, group_id, group_name) in (
        crud_admin.list_recent_training_experiments(db, limit)
    ):
        configuration = exp.configuration or {}
        performance = exp.performance_by_model_and_horizon or {}
        random_forest_h1 = performance.get("RANDOM_FOREST", {}).get("1", {})
        if not random_forest_h1:
            random_forest_h1 = (
                (exp.performance_by_horizon or {}).get("1", {}).get("random_forest", {})
            )
        experiments.append({
            "id": exp.id,
            "name": exp.name,
            "model_type": configuration.get("model", "RANDOM_FOREST"),
            "target_variable": "vehicle_count" if feature_generation_id else "traffic_flow",
            "temporal_aggregation_sec": aggregation_interval or 60,
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
            "split_id": exp.lag_feature_split_id or exp.split_id,
            "group_id": group_id,
            "group_name": group_name,
            "aggregation_id": aggregation_id,
            "feature_generation_id": feature_generation_id,
            "train_samples": configuration.get("train_samples"),
            "test_samples": configuration.get("test_samples"),
            "forecast_horizons": configuration.get("forecast_horizons", []),
            "metrics_by_model_and_horizon": performance,
            "hyperparameters": configuration.get("hyperparameters"),
            "evaluation_mode": (exp.evaluation or {}).get("evaluation_mode"),
            "logs": exp.logs or [],
            "error": exp.error,
            "completed_at": exp.completed_at,
        })

    experiments.sort(key=lambda item: item["created_at"], reverse=True)
    return ExperimentsOverviewResponse.model_validate({
        "stats": stats,
        "experiments": experiments[:limit],
    })
