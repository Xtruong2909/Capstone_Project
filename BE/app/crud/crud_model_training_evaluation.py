"""Read saved Test predictions and aggregate their errors in PostgreSQL."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.model_training import ModelTrainingForecastResult


def evaluation_metrics(db: Session, experiment_id: UUID) -> list[tuple[str, int, int, float, float]]:
    row = ModelTrainingForecastResult
    statement = (
        select(
            row.model_type,
            row.horizon,
            func.count(row.id),
            func.avg(row.absolute_error),
            func.avg(row.squared_error),
        )
        .where(row.experiment_id == experiment_id)
        .group_by(row.model_type, row.horizon)
        .order_by(row.model_type, row.horizon)
    )
    return list(db.execute(statement).all())
