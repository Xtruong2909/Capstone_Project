"""Repeated aggregation runs must not duplicate shared traffic observations."""

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import Column, MetaData, Table, create_engine
from sqlalchemy.orm import Session

from app.crud.crud_sharing import page_traffic_bins
from app.models.traffic import TrafficTimeSeries


def test_shared_traffic_uses_latest_observation_before_paging() -> None:
    engine = create_engine("sqlite://")
    metadata = MetaData()
    # Only the observation table is needed; omit PostgreSQL-specific constraints
    # and foreign keys to keep this query regression test independent of Postgres.
    Table("traffic_time_series", metadata, *[
        Column(column.name, column.type, primary_key=column.primary_key)
        for column in TrafficTimeSeries.__table__.columns
    ])
    metadata.create_all(engine)
    file_id, session_id = uuid4(), str(uuid4())
    timestamp = datetime(2018, 10, 24, 8, 30, tzinfo=UTC)
    created = datetime(2026, 11, 19, tzinfo=UTC)

    def observation(
        row_id: int, *, minute: int = 0, session: str = session_id,
        dataset_file: UUID = file_id, count: int = 156, age: int = 0,
    ) -> TrafficTimeSeries:
        return TrafficTimeSeries(
            id=row_id, dataset_file_id=dataset_file, aggregation_id=uuid4(),
            recording_session_id=session, time_bucket=timestamp + timedelta(minutes=minute),
            vehicle_count=count, created_at=created + timedelta(seconds=age),
        )

    with Session(engine) as db:
        db.add_all([
            observation(1), observation(2, count=160, age=1),
            observation(3, minute=1), observation(4, session=str(uuid4())),
            observation(5, dataset_file=uuid4()),
        ])
        db.commit()
        total, first_page = page_traffic_bins(db, file_id, 1, 2)
        second_total, second_page = page_traffic_bins(db, file_id, 2, 2)
        rows = first_page + second_page
        assert total == second_total == 3
        assert len(first_page) == 2
        assert len(second_page) == 1
        assert {row.id for row in rows} == {2, 3, 4}
        assert next(row for row in rows if row.id == 2).vehicle_count == 160
