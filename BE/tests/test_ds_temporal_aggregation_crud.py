"""Verify that full results preserve session identity and chronological order."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import Column, DateTime, Integer, String, create_engine
from sqlalchemy.orm import Session, declarative_base

from app.crud import crud_traffic_aggregation as repo


def test_full_series_keeps_sessions_separate_at_the_same_time(monkeypatch) -> None:
    base = declarative_base()

    class TimeSeries(base):
        __tablename__ = "test_traffic_time_series"

        id = Column(Integer, primary_key=True)
        aggregation_id = Column(String, nullable=False)
        recording_session_id = Column(String, nullable=False)
        time_bucket = Column(DateTime(timezone=True), nullable=False)
        vehicle_count = Column(Integer, nullable=False)

    engine = create_engine("sqlite:///:memory:")
    base.metadata.create_all(engine)
    aggregation_id = str(uuid4())
    first = datetime(2018, 10, 24, 5, 30, tzinfo=UTC)
    with Session(engine) as db:
        db.add_all([
            TimeSeries(aggregation_id=aggregation_id, recording_session_id="S1",
                       time_bucket=first, vehicle_count=2),
            TimeSeries(aggregation_id=aggregation_id, recording_session_id="S2",
                       time_bucket=first, vehicle_count=3),
            TimeSeries(aggregation_id=aggregation_id, recording_session_id="S1",
                       time_bucket=first + timedelta(minutes=1), vehicle_count=4),
            TimeSeries(aggregation_id=aggregation_id, recording_session_id="S2",
                       time_bucket=first + timedelta(minutes=3), vehicle_count=1),
        ])
        db.commit()
        monkeypatch.setattr(repo, "TrafficTimeSeries", TimeSeries)

        rows = repo.list_temporal_time_series(db, aggregation_id)

    assert [(row.recording_session_id, row.vehicle_count) for row in rows] == [
        ("S1", 2), ("S2", 3), ("S1", 4), ("S2", 1),
    ]
    assert len(rows) == 4
