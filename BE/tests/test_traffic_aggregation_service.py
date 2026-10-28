from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

from app.models.traffic import TrafficTimeSeries
from app.services import traffic_aggregation_service as service
from app.services.traffic_aggregation_service import aggregate_time_series_rows


def test_aggregate_time_series_rows_builds_one_minute_summary() -> None:
    rows = [
        {
            "track_id": 1,
            "time": datetime(2026, 1, 1, 10, 0, 10, tzinfo=UTC),
            "speed": 50.0,
            "avg_speed": 50.0,
        },
        {
            "track_id": 1,
            "time": datetime(2026, 1, 1, 10, 0, 50, tzinfo=UTC),
            "speed": 60.0,
            "avg_speed": 60.0,
        },
        {
            "track_id": 2,
            "time": datetime(2026, 1, 1, 10, 0, 40, tzinfo=UTC),
            "speed": 30.0,
            "avg_speed": 30.0,
        },
    ]

    points = aggregate_time_series_rows(rows, aggregation_interval=60, roi_identifier="MAIN_ROI")

    assert len(points) == 1
    bucket = points[0]
    assert bucket["roi_identifier"] == "MAIN_ROI"
    assert bucket["vehicle_count"] == 2
    assert bucket["traffic_flow"] == 2.0
    assert bucket["mean_speed"] == 46.67
    assert bucket["traffic_density"] == 0.002


def test_aggregate_time_series_rows_supports_pneuma_relative_timestamps() -> None:
    rows = [
        {"track_id": 14, "timestamp": 0.0, "speed": 16.4298},
        {"track_id": 14, "timestamp": 0.04, "speed": 16.2937},
        {"track_id": 14, "timestamp": 62.0, "speed": 15.5},
    ]

    points = aggregate_time_series_rows(rows, aggregation_interval=60, roi_identifier="MAIN_ROI")

    assert len(points) == 2
    assert points[0]["vehicle_count"] == 1
    assert points[1]["vehicle_count"] == 1
    assert points[0]["time_bucket"] == datetime(1970, 1, 1, 0, 0, tzinfo=UTC)
    assert points[1]["time_bucket"] == datetime(1970, 1, 1, 0, 1, tzinfo=UTC)


def test_read_rows_from_version_skips_header_row() -> None:
    rows = [
        {"track_id": "track_id", "speed": "speed", "timestamp": "timestamp"},
        {"track_id": 14, "speed": 16.4, "timestamp": 0.0},
    ]

    assert aggregate_time_series_rows(rows, aggregation_interval=60, roi_identifier="MAIN_ROI")


def test_build_traffic_aggregation_uses_single_existing_bucket_lookup(monkeypatch) -> None:
    class FakeQuery:
        def __init__(self, rows):
            self._rows = rows

        def filter(self, *args, **kwargs):
            return self

        def all(self):
            return self._rows

        def delete(self):
            return None

    class FakeDB:
        def __init__(self):
            self.query_calls = 0
            self.saved = []

        def query(self, model):
            self.query_calls += 1
            if model is TrafficTimeSeries:
                return FakeQuery([])
            return FakeQuery([])

        def add_all(self, items):
            self.saved.extend(items)

        def commit(self):
            return None

    dataset = SimpleNamespace(id=uuid4())
    version = SimpleNamespace(id=uuid4())
    db = FakeDB()

    monkeypatch.setattr(
        service.crud_dataset,
        "get_dataset_latest_version",
        lambda db, dataset_id: (dataset, version),
    )
    monkeypatch.setattr(
        service,
        "_read_rows_from_version",
        lambda version: [
            {"track_id": 1, "time": datetime(2026, 1, 1, 10, 0, 10, tzinfo=UTC), "speed": 50.0},
            {"track_id": 2, "time": datetime(2026, 1, 1, 10, 1, 10, tzinfo=UTC), "speed": 60.0},
        ],
    )

    result = service.build_traffic_aggregation(
        db,
        dataset_id=uuid4(),
        aggregation_interval=60,
        roi_identifier="MAIN_ROI",
    )

    assert result["records_created"] == 2
    assert db.query_calls == 1
