"""Time-series read queries, including legacy relative-time compatibility."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import case
from sqlalchemy.orm import Query, Session

from app.models.traffic import TrafficTimeSeries


def traffic_time_query(
    db: Session,
    *,
    recording_start: datetime | None,
    start_time: datetime | None,
    end_time: datetime | None,
    descending: bool = False,
) -> Query:
    """Filter and order legacy and absolute buckets on the same real timeline."""
    bucket = TrafficTimeSeries.time_bucket
    if recording_start is not None:
        epoch = datetime(1970, 1, 1, tzinfo=UTC)
        bucket = case(
            (
                (bucket >= epoch) & (bucket < epoch + timedelta(days=1)),
                bucket + (recording_start.astimezone(UTC) - epoch),
            ),
            else_=bucket,
        )
    query = db.query(TrafficTimeSeries)
    for boundary, is_start in ((start_time, True), (end_time, False)):
        if boundary is None:
            continue
        if boundary.tzinfo is None:
            boundary = boundary.replace(tzinfo=recording_start.tzinfo if recording_start else UTC)
        query = query.filter(bucket >= boundary if is_start else bucket <= boundary)
    return query.order_by(bucket.desc() if descending else bucket.asc())
