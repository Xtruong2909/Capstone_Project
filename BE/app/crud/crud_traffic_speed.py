"""Database operations for repairing aggregated speeds without replacing rows."""

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.dataset import DatasetFile
from app.models.traffic import TrafficTimeSeries


def list_speed_groups(db: Session) -> list[tuple[DatasetFile, int, str]]:
    return (
        db.query(
            DatasetFile, TrafficTimeSeries.aggregation_interval, TrafficTimeSeries.roi_identifier,
        )
        .join(TrafficTimeSeries, TrafficTimeSeries.dataset_file_id == DatasetFile.id)
        .distinct()
        .all()
    )


def get_speed_records(
    db: Session, *, file_id: UUID, interval: int, roi: str,
) -> list[TrafficTimeSeries]:
    return db.query(TrafficTimeSeries).filter(
        TrafficTimeSeries.dataset_file_id == file_id,
        TrafficTimeSeries.aggregation_interval == interval,
        TrafficTimeSeries.roi_identifier == roi,
    ).with_for_update().all()


def update_speed(record: TrafficTimeSeries, speed_kmh: float) -> None:
    # Deliberately leave IDs, timestamps, counts, density and flow untouched.
    record.mean_speed = speed_kmh
