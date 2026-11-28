"""Persistence only; history is scoped to its creator and batch."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.comparison_history import ComparisonHistory


def list_history(db: Session, group_id: UUID, owner_id: UUID) -> list[ComparisonHistory]:
    return list(db.scalars(select(ComparisonHistory).where(
        ComparisonHistory.group_id == group_id, ComparisonHistory.created_by == owner_id,
    ).order_by(ComparisonHistory.created_at.desc(), ComparisonHistory.id).limit(100)))


def get_history(db: Session, history_id: UUID, owner_id: UUID) -> ComparisonHistory | None:
    return db.scalar(select(ComparisonHistory).where(
        ComparisonHistory.id == history_id, ComparisonHistory.created_by == owner_id,
    ))


def add_history(db: Session, history: ComparisonHistory) -> None:
    db.add(history)
    db.flush()
