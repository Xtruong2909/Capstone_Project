from uuid import UUID

from sqlalchemy.orm import Session

from app.models.data_quality import DataQualityCheck, DataQualityIssue


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
    check_id: UUID,
    *,
    offset: int,
    limit: int,
) -> tuple[list[DataQualityIssue], int]:
    query = db.query(DataQualityIssue).filter(DataQualityIssue.check_id == check_id)
    total = query.count()
    issues = (
        query.order_by(DataQualityIssue.row_number, DataQualityIssue.id)
        .offset(offset)
        .limit(limit)
        .all()
    )
    return issues, total
