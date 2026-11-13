"""Persistence helpers for reusable Lag Feature Train/Test splits."""

from datetime import date
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.dataset import RecordingSession
from app.models.lag_feature import (
    LagFeatureSample,
    LagFeatureSplit,
    LagFeatureSplitSample,
)


def get_split(db: Session, split_id: UUID) -> LagFeatureSplit | None:
    return db.get(LagFeatureSplit, split_id)


def find_split(
    db: Session, feature_generation_id: UUID, configuration_hash: str,
) -> LagFeatureSplit | None:
    return db.query(LagFeatureSplit).filter(
        LagFeatureSplit.feature_generation_id == feature_generation_id,
        LagFeatureSplit.configuration_hash == configuration_hash,
    ).one_or_none()


def list_generation_samples(
    db: Session, feature_generation_id: UUID,
) -> list[tuple[LagFeatureSample, date]]:
    return db.query(LagFeatureSample, RecordingSession.recording_date).join(
        RecordingSession, RecordingSession.id == LagFeatureSample.session_id,
    ).filter(
        LagFeatureSample.generation_id == feature_generation_id,
    ).order_by(
        LagFeatureSample.timestamp, LagFeatureSample.dataset_id,
        LagFeatureSample.session_id, LagFeatureSample.id,
    ).all()


def save_split(
    db: Session, split: LagFeatureSplit, memberships: list[LagFeatureSplitSample],
) -> LagFeatureSplit:
    db.add(split)
    db.flush()
    db.add_all(memberships)
    db.commit()
    db.refresh(split)
    return split


def list_split_samples(
    db: Session, split_id: UUID, subset: str,
) -> list[LagFeatureSample]:
    return db.query(LagFeatureSample).join(
        LagFeatureSplitSample,
        LagFeatureSplitSample.sample_id == LagFeatureSample.id,
    ).join(
        LagFeatureSplit, LagFeatureSplit.id == LagFeatureSplitSample.split_id,
    ).filter(
        LagFeatureSplitSample.split_id == split_id,
        LagFeatureSplitSample.subset == subset,
        LagFeatureSample.generation_id == LagFeatureSplit.feature_generation_id,
    ).order_by(
        LagFeatureSample.timestamp, LagFeatureSample.dataset_id,
        LagFeatureSample.session_id, LagFeatureSample.id,
    ).all()


def page_split_samples(
    db: Session, split_id: UUID, subset: str, page: int, page_size: int,
    session_id: UUID | None,
) -> tuple[int, list[tuple[LagFeatureSample, str]]]:
    query = db.query(LagFeatureSample, LagFeatureSplitSample.subset).join(
        LagFeatureSplitSample,
        LagFeatureSplitSample.sample_id == LagFeatureSample.id,
    ).join(
        LagFeatureSplit, LagFeatureSplit.id == LagFeatureSplitSample.split_id,
    ).filter(
        LagFeatureSplitSample.split_id == split_id,
        LagFeatureSplitSample.subset == subset,
        LagFeatureSample.generation_id == LagFeatureSplit.feature_generation_id,
    )
    if session_id is not None:
        query = query.filter(LagFeatureSample.session_id == session_id)
    total = query.with_entities(func.count(LagFeatureSplitSample.sample_id)).scalar() or 0
    rows = query.order_by(
        LagFeatureSample.dataset_id, LagFeatureSample.session_id,
        LagFeatureSample.timestamp, LagFeatureSample.id,
    ).offset((page - 1) * page_size).limit(page_size).all()
    return total, rows
