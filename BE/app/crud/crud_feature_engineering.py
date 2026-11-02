from datetime import datetime
from uuid import UUID

from sqlalchemy.orm import Session

from app.crud.crud_traffic_time import traffic_time_query
from app.models.traffic import TrafficTimeSeries


def read_feature_series(
    db: Session, *, version_id: UUID, roi_identifier: str,
    recording_start: datetime | None, latest_only: bool = False,
) -> list[TrafficTimeSeries]:
    query = traffic_time_query(
        db, recording_start=recording_start, start_time=None, end_time=None,
        descending=latest_only,
    ).filter(
        TrafficTimeSeries.dataset_version_id == version_id,
        TrafficTimeSeries.roi_identifier == roi_identifier,
        TrafficTimeSeries.aggregation_interval == 60,
    )
    # Never filter missing flow: doing so could hide an unobserved minute.
    return query.limit(5).all() if latest_only else query.all()
