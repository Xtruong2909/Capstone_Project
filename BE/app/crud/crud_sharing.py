"""SQLAlchemy queries and atomic writes for published result shares."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session, selectinload

from app.models.dataset import (
    Dataset,
    DatasetFile,
    DatasetFileSession,
    DatasetGroup,
    RecordingSession,
)
from app.models.lag_feature import LagFeatureGeneration, LagFeatureSplit
from app.models.model_training import (
    ExperimentTrainedModel,
    ModelTrainingExperiment,
    ModelTrainingForecastResult,
    ModelTrainingSplit,
)
from app.models.prediction import PredictionResult, PredictionRun
from app.models.sharing import SharedReport, SharedReportItem, SharedReportRecipient
from app.models.traffic import TrafficAggregationJob, TrafficTimeSeries
from app.models.user import User


class DuplicateActiveShareError(Exception):
    """A resource already has an active share for the Business User role."""


def list_business_recipients(db: Session) -> list[User]:
    return list(db.scalars(select(User).where(
        User.role_id == "business_user", User.is_active.is_(True),
    ).order_by(User.full_name, User.email, User.id)).all())


def get_business_recipients(db: Session, user_ids: list[UUID]) -> list[User]:
    return list(db.scalars(select(User).where(
        User.id.in_(user_ids), User.role_id == "business_user", User.is_active.is_(True),
    ).order_by(User.id).with_for_update(of=User)).all())


def has_share_recipient(db: Session, share_id: UUID, user_id: UUID) -> bool:
    return db.scalar(select(SharedReportRecipient.user_id).where(
        SharedReportRecipient.share_id == share_id, SharedReportRecipient.user_id == user_id,
    )) is not None


def create_selection_shares(
    db: Session, *, title: str, owner_id: UUID,
    items_data: list[dict[str, Any]], recipient_ids: list[UUID],
) -> list[SharedReport]:
    """One bundle per recipient; skip only resources already visible to that recipient."""
    created: list[SharedReport] = []
    try:
        keys = [(item["resource_type"], item["resource_id"]) for item in items_data]
        _lock_share_resources(db, keys)
        for user_id in recipient_ids:
            covered = active_share_ids(db, keys, recipient_ids=[user_id])
            missing = [item for item in items_data
                       if (item["resource_type"], item["resource_id"]) not in covered]
            if not missing:
                continue
            report = SharedReport(
                title=title, created_by=owner_id, status="PUBLISHED", published_at=datetime.now(UTC),
                items=[SharedReportItem(**item) for item in missing],
                recipients=[SharedReportRecipient(user_id=user_id)],
            )
            db.add(report)
            created.append(report)
        if not created:
            raise DuplicateActiveShareError
        db.commit()
        for report in created:
            db.refresh(report)
    except Exception:
        db.rollback()
        raise
    return created


def _lock_share_resources(db: Session, keys: list[tuple[str, UUID]]) -> None:
    for kind, resource_id in sorted(set(keys), key=lambda value: (value[0], str(value[1]))):
        db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
                   {"key": f"share:{kind}:{resource_id}"})


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
    viewer_id: UUID | None = None,
) -> tuple[list[SharedReport], int]:
    condition = [SharedReport.status == "PUBLISHED",
                 select(User.id).where(User.id == SharedReport.created_by,
                                       User.is_active.is_(True)).exists()]
    if viewer_id is not None:
        condition.append(select(SharedReportRecipient.share_id).where(
            SharedReportRecipient.share_id == SharedReport.id,
            SharedReportRecipient.user_id == viewer_id,
        ).exists())
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
    recipient_ids: list[UUID],
) -> SharedReport:
    now = datetime.now(UTC)
    report = SharedReport(
        title=title, description=description, created_by=created_by, status=status,
        published_at=now if status == "PUBLISHED" else None,
    )
    try:
        if status == "PUBLISHED":
            keys = [(item["resource_type"], item["resource_id"]) for item in items_data]
            _lock_share_resources(db, keys)
            if any(active_share_ids(db, keys, recipient_ids=[recipient]) for recipient in recipient_ids):
                raise DuplicateActiveShareError
        db.add(report)
        db.flush()
        report.items = [SharedReportItem(**item) for item in items_data]
        report.recipients = [SharedReportRecipient(user_id=user_id) for user_id in recipient_ids]
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
    recipient_ids: list[UUID] | None = None,
) -> SharedReport:
    now = datetime.now(UTC)
    try:
        effective_status = status if status is not None else share.status
        if effective_status == "PUBLISHED":
            selected = items_data if items_data is not None else [
                {"resource_type": item.resource_type, "resource_id": item.resource_id}
                for item in share.items
            ]
            keys = [(item["resource_type"], item["resource_id"]) for item in selected]
            _lock_share_resources(db, keys)
            audience = recipient_ids if recipient_ids is not None else share.recipient_ids
            if any(active_share_ids(db, keys, exclude_share_id=share.id, recipient_ids=[recipient])
                   for recipient in audience):
                raise DuplicateActiveShareError
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
        if recipient_ids is not None:
            db.execute(delete(SharedReportRecipient).where(SharedReportRecipient.share_id == share.id))
            db.flush()
            db.expire(share, ["recipients"])
            share.recipients = [SharedReportRecipient(user_id=user_id) for user_id in recipient_ids]
        db.commit()
        db.refresh(share)
    except Exception:
        db.rollback()
        raise
    return share


def get_dataset(db: Session, resource_id: UUID) -> Dataset | None:
    return db.get(Dataset, resource_id)


def list_dataset_groups(db: Session) -> list[DatasetGroup]:
    return list(db.scalars(select(DatasetGroup).order_by(DatasetGroup.created_at.desc())).all())


def get_dataset_group(db: Session, group_id: UUID) -> DatasetGroup | None:
    return db.get(DatasetGroup, group_id)


def list_group_datasets(db: Session, group_id: UUID) -> list[Dataset]:
    return list(db.scalars(
        select(Dataset).where(Dataset.group_id == group_id)
        .order_by(Dataset.recording_date, Dataset.id)
    ).all())


def experiment_group_id(db: Session, experiment: ModelTrainingExperiment) -> UUID | None:
    if experiment.dataset_id:
        return db.scalar(select(Dataset.group_id).where(Dataset.id == experiment.dataset_id))
    if experiment.split_id:
        return db.scalar(
            select(Dataset.group_id)
            .join(DatasetFile, DatasetFile.dataset_id == Dataset.id)
            .join(ModelTrainingSplit, ModelTrainingSplit.dataset_file_id == DatasetFile.id)
            .where(ModelTrainingSplit.id == experiment.split_id)
        )
    if experiment.lag_feature_split_id:
        return db.scalar(
            select(Dataset.group_id)
            .join(TrafficAggregationJob, TrafficAggregationJob.dataset_id == Dataset.id)
            .join(LagFeatureGeneration, LagFeatureGeneration.aggregation_id == TrafficAggregationJob.id)
            .join(LagFeatureSplit, LagFeatureSplit.feature_generation_id == LagFeatureGeneration.id)
            .where(LagFeatureSplit.id == experiment.lag_feature_split_id)
        )
    return None


def get_latest_approved_file(db: Session, dataset_id: UUID) -> DatasetFile | None:
    return db.scalars(
        select(DatasetFile).where(
            DatasetFile.dataset_id == dataset_id,
            DatasetFile.approval_status == "APPROVED",
        ).order_by(DatasetFile.created_at.desc(), DatasetFile.id.desc()).limit(1)
    ).first()


def get_file(db: Session, file_id: UUID) -> DatasetFile | None:
    return db.get(DatasetFile, file_id)


def get_split(db: Session, resource_id: UUID) -> LagFeatureSplit | None:
    return db.get(LagFeatureSplit, resource_id)


def get_experiment(db: Session, resource_id: UUID) -> ModelTrainingExperiment | None:
    return db.get(ModelTrainingExperiment, resource_id)


def get_prediction(db: Session, resource_id: UUID) -> PredictionRun | None:
    return db.get(PredictionRun, resource_id)


def list_resource_candidates(db: Session, resource_type: str) -> list[Any]:
    """Return persisted resources; authorization is checked by the service."""
    model = {
        "DATASET": Dataset,
        "TRAIN_TEST": LagFeatureSplit,
        "EXPERIMENT": ModelTrainingExperiment,
        "PREDICTION": PredictionRun,
    }[resource_type]
    return list(db.scalars(select(model).order_by(model.created_at.desc(), model.id)).all())


def active_share_ids(
    db: Session, keys: list[tuple[str, UUID]], *, exclude_share_id: UUID | None = None,
    recipient_ids: list[UUID] | None = None,
) -> set[tuple[str, UUID]]:
    if not keys:
        return set()
    if recipient_ids is not None:
        if not recipient_ids:
            return set()
        # A resource is fully shared only when every selected user can already see it.
        covered = set(keys)
        for recipient_id in recipient_ids:
            recipient_stmt = (
                select(SharedReportItem.resource_type, SharedReportItem.resource_id)
                .join(SharedReport, SharedReport.id == SharedReportItem.share_id)
                .join(SharedReportRecipient, SharedReportRecipient.share_id == SharedReport.id)
                .join(User, User.id == SharedReport.created_by)
                .where(SharedReport.status == "PUBLISHED", User.is_active.is_(True),
                       SharedReportRecipient.user_id == recipient_id,
                       SharedReportItem.resource_type.in_({kind for kind, _ in keys}),
                       SharedReportItem.resource_id.in_({resource_id for _, resource_id in keys}))
            )
            if exclude_share_id is not None:
                recipient_stmt = recipient_stmt.where(SharedReport.id != exclude_share_id)
            covered &= set(db.execute(recipient_stmt).all())
        return covered
    types = {kind for kind, _ in keys}
    ids = {resource_id for _, resource_id in keys}
    stmt = (
        select(SharedReportItem.resource_type, SharedReportItem.resource_id)
        .join(SharedReport, SharedReport.id == SharedReportItem.share_id)
        .join(User, User.id == SharedReport.created_by)
        .where(SharedReport.status == "PUBLISHED",
               User.is_active.is_(True),
               SharedReportItem.resource_type.in_(types),
               SharedReportItem.resource_id.in_(ids))
    )
    if exclude_share_id is not None:
        stmt = stmt.where(SharedReport.id != exclude_share_id)
    rows = db.execute(stmt).all()
    return set(rows) & set(keys)


def create_resource_shares(
    db: Session, *, owner_id: UUID, resources: list[dict[str, Any]],
    recipient_ids: list[UUID],
) -> tuple[list[SharedReport], set[tuple[str, UUID]]]:
    """Create one published report per resource in one transaction.

    Transaction advisory locks serialize duplicate requests for the same resource.
    """
    created: list[SharedReport] = []
    duplicate: set[tuple[str, UUID]] = set()
    try:
        for item in sorted(resources, key=lambda value: (value["resource_type"], str(value["resource_id"]))):
            kind, resource_id = item["resource_type"], item["resource_id"]
            key = (kind, resource_id)
            _lock_share_resources(db, [key])
            if any(key in active_share_ids(db, [key], recipient_ids=[recipient]) for recipient in recipient_ids):
                duplicate.add(key)
                continue
            report = SharedReport(
                title=item["name"], created_by=owner_id, status="PUBLISHED",
                published_at=datetime.now(UTC),
            )
            db.add(report)
            report.recipients = [SharedReportRecipient(user_id=user_id) for user_id in recipient_ids]
            db.flush()
            db.add(SharedReportItem(
                share_id=report.id, resource_type=kind, resource_id=resource_id,
                resource_file_id=item.get("resource_file_id"),
                visible_sections=list(item["visible_sections"]),
            ))
            db.flush()
            created.append(report)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return created, duplicate


def list_managed_resource_shares(
    db: Session, *, owner_id: UUID, resource_type: str | None,
    status: str | None, search: str | None, page: int, page_size: int,
) -> tuple[list[SharedReport], int, int, int]:
    base = select(SharedReport).options(selectinload(SharedReport.items)).where(
        SharedReport.created_by == owner_id,
    )
    counts = db.execute(
        select(SharedReport.status, func.count(SharedReport.id))
        .where(SharedReport.created_by == owner_id)
        .group_by(SharedReport.status)
    ).all()
    count_map = dict(counts)
    if resource_type:
        base = base.where(select(SharedReportItem.id).where(
            SharedReportItem.share_id == SharedReport.id,
            SharedReportItem.resource_type == resource_type,
        ).exists())
    if status:
        base = base.where(SharedReport.status == status)
    if search:
        base = base.where(SharedReport.title.ilike(f"%{search}%"))
    total = db.scalar(select(func.count()).select_from(base.order_by(None).subquery())) or 0
    rows = db.scalars(
        base.order_by(SharedReport.created_at.desc(), SharedReport.id)
        .offset((page - 1) * page_size).limit(page_size)
    ).all()
    return list(rows), total, count_map.get("PUBLISHED", 0), count_map.get("REVOKED", 0)


def get_user(db: Session, user_id: UUID) -> User | None:
    return db.get(User, user_id)


def get_models(db: Session, experiment_id: UUID) -> list[ExperimentTrainedModel]:
    return list(db.scalars(select(ExperimentTrainedModel).where(
        ExperimentTrainedModel.experiment_id == experiment_id,
        ExperimentTrainedModel.status == "COMPLETED",
    ).order_by(ExperimentTrainedModel.horizon)).all())


def get_session_names(db: Session, session_ids: set[UUID]) -> dict[str, str]:
    """Resolve names for sessions already present in an authorized shared result."""
    if not session_ids:
        return {}
    rows = db.execute(
        select(RecordingSession.id, RecordingSession.original_filename)
        .where(RecordingSession.id.in_(session_ids))
    ).all()
    return {str(session_id): filename for session_id, filename in rows}


def page_dataset_sessions(
    db: Session, file_id: UUID, page: int, page_size: int,
) -> tuple[int, list[RecordingSession]]:
    condition = DatasetFileSession.file_id == file_id
    total = db.scalar(select(func.count()).select_from(DatasetFileSession).where(condition)) or 0
    rows = db.scalars(
        select(RecordingSession).join(
            DatasetFileSession, DatasetFileSession.session_id == RecordingSession.id,
        ).where(condition).order_by(RecordingSession.scheduled_start, RecordingSession.id)
        .offset((page - 1) * page_size).limit(page_size)
    ).all()
    return total, list(rows)


def page_traffic_bins(
    db: Session, file_id: UUID, page: int, page_size: int,
) -> tuple[int, list[TrafficTimeSeries]]:
    # Repeated aggregation runs may contain the same observation. Select the
    # newest saved value before counting/paging so duplicates cannot span pages.
    ranked = select(
        TrafficTimeSeries.id,
        func.row_number().over(
            partition_by=(
                TrafficTimeSeries.recording_session_id, TrafficTimeSeries.time_bucket,
                TrafficTimeSeries.roi_identifier, TrafficTimeSeries.aggregation_interval,
            ),
            order_by=(TrafficTimeSeries.created_at.desc().nulls_last(), TrafficTimeSeries.id.desc()),
        ).label("observation_rank"),
    ).where(TrafficTimeSeries.dataset_file_id == file_id).subquery()
    latest = select(ranked.c.id).where(ranked.c.observation_rank == 1).subquery()
    total = db.scalar(select(func.count()).select_from(latest)) or 0
    rows = db.scalars(
        select(TrafficTimeSeries).join(latest, latest.c.id == TrafficTimeSeries.id)
        .order_by(
            TrafficTimeSeries.time_bucket, TrafficTimeSeries.recording_session_id,
            TrafficTimeSeries.id,
        )
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
