"""Recalculate from source m/s, making repeat repairs safe (no double conversion)."""

from typing import Any

from sqlalchemy.orm import Session

from app.crud.crud_traffic_speed import get_speed_records, list_speed_groups, update_speed
from app.services.recording_time_service import recording_timestamp
from app.services.traffic_aggregation_service import (
    _iter_rows_from_version,
    _recording_start,
    aggregate_time_series_rows,
)


def repair_traffic_speeds(db: Session) -> list[dict[str, Any]]:
    """Stage repairs for all existing groups; caller must commit or roll back."""
    results: list[dict[str, Any]] = []
    for version, interval, roi in list_speed_groups(db):
        start = _recording_start(db, version)
        buckets = aggregate_time_series_rows(
            _iter_rows_from_version(version), aggregation_interval=interval,
            roi_identifier=roi, recording_start=start,
        )
        by_time = {bucket["time_bucket"]: bucket for bucket in buckets}
        records = get_speed_records(db, version_id=version.id, interval=interval, roi=roi)
        for record in records:
            key = recording_timestamp(record.time_bucket, start)
            if key not in by_time:
                raise ValueError(f"Source bucket missing for traffic record {record.id}; repair aborted")
        for record in records:
            bucket = by_time[recording_timestamp(record.time_bucket, start)]
            update_speed(record, bucket["mean_speed"])
        results.append({"version_id": str(version.id), "records": len(records)})
    return results
