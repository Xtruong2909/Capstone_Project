"""SQLAlchemy queries and atomic writes for published result shares."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from app.models.dataset import Dataset, DatasetVersion, DatasetVersionSession, RecordingSession
from app.models.lag_feature import LagFeatureSplit
from app.models.model_training import (
    ExperimentTrainedModel,
    ModelTrainingExperiment,
    ModelTrainingForecastResult,
)
from app.models.prediction import PredictionResult, PredictionRun
from app.models.sharing import SharedReport, SharedReportItem
from app.models.traffic import TrafficTimeSeries
from app.models.user import User


def get_share_by_id(db: Session, share_id: UUID, *, for_update: bool = False) -> SharedReport | None:
    stmt = select(SharedReport).where(SharedReport.id == share_id)
    if for_update:
        stmt = stmt.with_for_update(of=SharedReport)
    return db.execute(stmt).scalar_one_or_none()


def get_shares_by_owner(
    db: Session, owner_id: UUID, *, status: str | None = None,
    search: str | None = None, page: int = 1, page_size: int = 20,
) -> tuple[list[SharedReport], int]:
    condition = [SharedReport.created_by == owner_id]
    if status:
        condition.append(SharedReport.status == status)
    if search:
        condition.append(SharedReport.title.ilike(f"%{search}%"))
    total = db.scalar(select(func.count()).select_from(SharedReport).where(*condition)) or 0
    rows = db.scalars(
        select(SharedReport).options(selectinload(SharedReport.items)).where(*condition)
        .order_by(SharedReport.created_at.desc(), SharedReport.id)
        .offset((page - 1) * page_size).limit(page_size)
    ).all()
    return list(rows), total


def get_published_shares(
    db: Session, *, resource_type: str | None = None, search: str | None = None,
    page: int = 1, page_size: int = 20,
) -> tuple[list[SharedReport], int]:
    condition = [SharedReport.status == "PUBLISHED"]
    if search:
        condition.append(SharedReport.title.ilike(f"%{search}%"))
    if resource_type:
        condition.append(
            select(SharedReportItem.id).where(
                SharedReportItem.share_id == SharedReport.id,
                SharedReportItem.resource_type == resource_type,
            ).exists()
        )
    total = db.scalar(select(func.count()).select_from(SharedReport).where(*condition)) or 0
    rows = db.scalars(
        select(SharedReport).options(selectinload(SharedReport.items)).where(*condition)
        .order_by(SharedReport.published_at.desc(), SharedReport.id)
        .offset((page - 1) * page_size).limit(page_size)
    ).all()
    return list(rows), total


def create_share(
    db: Session, *, title: str, description: str | None, created_by: UUID,
    status: str, items_data: list[dict[str, Any]],
) -> SharedReport:
    now = datetime.now(UTC)
    report = SharedReport(
        title=title, description=description, created_by=created_by, status=status,
        published_at=now if status == "PUBLISHED" else None,
    )
    try:
        db.add(report)
        db.flush()
        report.items = [SharedReportItem(**item) for item in items_data]
        db.commit()
        db.refresh(report)
    except Exception:
        db.rollback()
        raise
    return report


def update_share(
    db: Session, *, share: SharedReport, title: str | None = None,
    description: str | None = None, set_description: bool = False,
    status: str | None = None, items_data: list[dict[str, Any]] | None = None,
) -> SharedReport:
    now = datetime.now(UTC)
    try:
        if title is not None:
            share.title = title
        if set_description:
            share.description = description
        if status is not None and status != share.status:
            share.status = status
            if status == "PUBLISHED":
                share.published_at = now
            elif status == "REVOKED":
                share.revoked_at = now
        if items_data is not None:
            # Replacing the collection is a single transaction with the report update.
            db.execute(delete(SharedReportItem).where(SharedReportItem.share_id == share.id))
            db.flush()
            db.expire(share, ["items"])
            share.items = [SharedReportItem(**item) for item in items_data]
        share.updated_at = now
        db.commit()
        db.refresh(share)
    except Exception:
        db.rollback()
        raise
    return share


def get_dataset(db: Session, resource_id: UUID) -> Dataset | None:
    return db.get(Dataset, resource_id)


def get_latest_approved_version(db: Session, dataset_id: UUID) -> DatasetVersion | None:
    return db.scalars(
        select(DatasetVersion).where(
            DatasetVersion.dataset_id == dataset_id,
            DatasetVersion.approval_status == "APPROVED",
        ).order_by(DatasetVersion.created_at.desc(), DatasetVersion.id.desc()).limit(1)
    ).first()


def get_version(db: Session, version_id: UUID) -> DatasetVersion | None:
    return db.get(DatasetVersion, version_id)


def get_split(db: Session, resource_id: UUID) -> LagFeatureSplit | None:
    return db.get(LagFeatureSplit, resource_id)


def get_experiment(db: Session, resource_id: UUID) -> ModelTrainingExperiment | None:
    return db.get(ModelTrainingExperiment, resource_id)


def get_prediction(db: Session, resource_id: UUID) -> PredictionRun | None:
    return db.get(PredictionRun, resource_id)


def get_user(db: Session, user_id: UUID) -> User | None:
    return db.get(User, user_id)


def get_models(db: Session, experiment_id: UUID) -> list[ExperimentTrainedModel]:
    return list(db.scalars(select(ExperimentTrainedModel).where(
        ExperimentTrainedModel.experiment_id == experiment_id,
        ExperimentTrainedModel.status == "COMPLETED",
    ).order_by(ExperimentTrainedModel.horizon)).all())


def page_dataset_sessions(
    db: Session, version_id: UUID, page: int, page_size: int,
) -> tuple[int, list[RecordingSession]]:
    condition = DatasetVersionSession.version_id == version_id
    total = db.scalar(select(func.count()).select_from(DatasetVersionSession).where(condition)) or 0
    rows = db.scalars(
        select(RecordingSession).join(
            DatasetVersionSession, DatasetVersionSession.session_id == RecordingSession.id,
        ).where(condition).order_by(RecordingSession.scheduled_start, RecordingSession.id)
        .offset((page - 1) * page_size).limit(page_size)
    ).all()
    return total, list(rows)


def page_traffic_bins(
    db: Session, version_id: UUID, page: int, page_size: int,
) -> tuple[int, list[TrafficTimeSeries]]:
    condition = TrafficTimeSeries.dataset_version_id == version_id
    total = db.scalar(select(func.count()).select_from(TrafficTimeSeries).where(condition)) or 0
    rows = db.scalars(
        select(TrafficTimeSeries).where(condition)
        .order_by(TrafficTimeSeries.time_bucket, TrafficTimeSeries.recording_session_id)
        .offset((page - 1) * page_size).limit(page_size)
    ).all()
    return total, list(rows)


def page_experiment_predictions(
    db: Session, experiment_id: UUID, page: int, page_size: int,
) -> tuple[int, list[ModelTrainingForecastResult]]:
    condition = ModelTrainingForecastResult.experiment_id == experiment_id
    total = db.scalar(select(func.count()).select_from(ModelTrainingForecastResult).where(condition)) or 0
    rows = db.scalars(
        select(ModelTrainingForecastResult).where(condition)
        .order_by(ModelTrainingForecastResult.input_timestamp, ModelTrainingForecastResult.id)
        .offset((page - 1) * page_size).limit(page_size)
    ).all()
    return total, list(rows)


def page_forecast_results(
    db: Session, run_id: UUID, page: int, page_size: int,
) -> tuple[int, list[PredictionResult]]:
    condition = PredictionResult.prediction_run_id == run_id
    total = db.scalar(select(func.count()).select_from(PredictionResult).where(condition)) or 0
    rows = db.scalars(
        select(PredictionResult).where(condition)
        .order_by(PredictionResult.forecast_timestamp, PredictionResult.session_id, PredictionResult.horizon)
        .offset((page - 1) * page_size).limit(page_size)
    ).all()
    return total, list(rows)
