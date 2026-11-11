from typing import Any
from uuid import UUID

from sqlalchemy import insert
from sqlalchemy.orm import Session

from app.models.data_quality import DataQualityCheck, DataQualityIssue


def insert_issues(db: Session, issues: list[dict[str, Any]]) -> None:
    """Insert one bounded batch without ORM objects or generated-ID round trips."""
    if issues:
        db.execute(insert(DataQualityIssue.__table__), issues)


def get_active_check(
    db: Session,
    dataset_version_id: UUID,
) -> DataQualityCheck | None:
    return (
        db.query(DataQualityCheck)
        .filter(
            DataQualityCheck.dataset_version_id == dataset_version_id,
            DataQualityCheck.status.in_(("queued", "running")),
        )
        .first()
    )


def get_latest_completed_check(
    db: Session,
    dataset_version_id: UUID,
) -> DataQualityCheck | None:
    return (
        db.query(DataQualityCheck)
        .filter(
            DataQualityCheck.dataset_version_id == dataset_version_id,
            DataQualityCheck.status == "completed",
            DataQualityCheck.report.is_not(None),
        )
        .order_by(DataQualityCheck.completed_at.desc(), DataQualityCheck.id.desc())
        .first()
    )


def get_check(
    db: Session,
    dataset_id: UUID,
    check_id: UUID,
) -> DataQualityCheck | None:
    return (
        db.query(DataQualityCheck)
        .filter(
            DataQualityCheck.dataset_id == dataset_id,
            DataQualityCheck.id == check_id,
        )
        .first()
    )


def list_issues(
    db: Session,
    check_id: UUID | list[UUID],
    *,
    offset: int,
    limit: int,
    recording_session_id: UUID | None = None,
) -> tuple[list[DataQualityIssue], int]:
    check_filter = (
        DataQualityIssue.check_id.in_(check_id)
        if isinstance(check_id, list)
        else DataQualityIssue.check_id == check_id
    )
    query = db.query(DataQualityIssue).filter(check_filter)
    if recording_session_id is not None:
        query = query.filter(
            DataQualityIssue.recording_session_id == recording_session_id,
        )
    total = query.count()
    issues = (
        query.order_by(DataQualityIssue.row_number, DataQualityIssue.id)
        .offset(offset)
        .limit(limit)
        .all()
    )
    return issues, total
