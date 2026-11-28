"""Database operations for validation studies; transactions owned by services."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.validation_study import ValidationStudy


def get_study(db: Session, study_id: UUID, *, lock: bool = False) -> ValidationStudy | None:
    query = select(ValidationStudy).where(ValidationStudy.id == study_id)
    if lock:
        query = query.with_for_update()
    return db.execute(query.execution_options(populate_existing=True)).scalar_one_or_none()


def list_studies(db: Session, generation_id: UUID, owner_id: UUID) -> list[ValidationStudy]:
    return list(db.scalars(select(ValidationStudy).where(
        ValidationStudy.feature_generation_id == generation_id,
        ValidationStudy.created_by == owner_id,
    ).order_by(ValidationStudy.created_at.desc())))


def add_study(db: Session, study: ValidationStudy) -> None:
    db.add(study)


def add_partition(db: Session, split: object, memberships: list) -> None:
    db.add(split)
    db.flush()
    db.add_all(memberships)
