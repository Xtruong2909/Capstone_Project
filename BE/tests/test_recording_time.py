from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from app.crud.crud_traffic_time import traffic_time_query
from app.services import traffic_aggregation_service as service
from app.services.recording_time_service import (
    recording_start_from_filename,
    recording_timestamp,
)

FILENAME = "20181024_d1_0830_0900.csv"


@pytest.mark.parametrize(
    ("filename", "expected"),
    [
        (FILENAME, "2018-10-24T08:30:00+03:00"),
        ("20181029_dX_0830_0900.csv", "2018-10-29T08:30:00+02:00"),
        ("20181224_d10_0830_0900.parquet", "2018-12-24T08:30:00+02:00"),
        ("20181024_d1_0830_0900_normalized.csv", "2018-10-24T08:30:00+03:00"),
        (None, None),
        ("unrelated.csv", None),
        ("20180230_d1_0830_0900.csv", None),
        ("20181024_d1_2560_0900.csv", None),
        ("20181024_d1_0830_9999.csv", None),
    ],
)
def test_filename_clock(filename: str | None, expected: str | None) -> None:
    start = recording_start_from_filename(filename)
    assert (start.isoformat() if start else None) == expected


def test_relative_seconds_and_decimal_csv_values_cross_minute_boundary() -> None:
    points = service.aggregate_time_series_rows(
        [
            {"track_id": 1, "timestamp": 0, "speed": 10},
            {"track_id": 1, "timestamp": "0.04", "speed": 10},
            {"track_id": 2, "timestamp": "59.96", "speed": 10},
            {"track_id": 3, "timestamp": 60, "speed": 10},
        ],
        recording_start=recording_start_from_filename(FILENAME),
    )
    assert [p["time_bucket"].isoformat() for p in points] == [
        "2018-10-24T08:30:00+03:00", "2018-10-24T08:31:00+03:00"
    ]
    assert [p["vehicle_count"] for p in points] == [2, 1]


def test_absolute_time_is_not_added_to_recording_start() -> None:
    start = recording_start_from_filename(FILENAME)
    absolute = datetime(2018, 10, 24, 5, 32, tzinfo=UTC)
    for value in (absolute, absolute.isoformat(), absolute.timestamp()):
        points = service.aggregate_time_series_rows(
            [{"track_id": 1, "timestamp": value}], recording_start=start,
        )
        assert points[0]["time_bucket"].isoformat() == "2018-10-24T08:32:00+03:00"


def test_milliseconds_and_legacy_epoch_datetime() -> None:
    start = recording_start_from_filename(FILENAME)
    points = service.aggregate_time_series_rows(
        [{"track_id": 1, "timestamp_ms": 62000}], recording_start=start,
    )
    assert points[0]["time_bucket"].isoformat() == "2018-10-24T08:31:00+03:00"
    assert recording_timestamp(datetime(1970, 1, 1, 0, 13, tzinfo=UTC), start).isoformat() == (
        "2018-10-24T08:43:00+03:00"
    )


def test_query_filters_legacy_rows_using_real_time() -> None:
    with Session() as db:
        query = traffic_time_query(
            db, recording_start=recording_start_from_filename(FILENAME),
            # Intentionally test a filter without an explicit timezone.
            start_time=datetime(2018, 10, 24, 8, 31), end_time=None,  # noqa: DTZ001
        )
        compiled = query.statement.compile(dialect=postgresql.dialect())
        assert "CASE WHEN" in str(compiled)
        assert any(
            isinstance(value, datetime) and value.isoformat() == "2018-10-24T08:31:00+03:00"
            for value in compiled.params.values()
        )


def test_preview_and_chart_return_same_local_time_without_mutating_rows(monkeypatch) -> None:
    version = SimpleNamespace(id=uuid4(), dataset_id=uuid4(), original_filename=FILENAME)
    epoch_bucket = datetime(1970, 1, 1, tzinfo=UTC)
    item = SimpleNamespace(
        id=1, dataset_version_id=version.id, time_bucket=epoch_bucket,
        aggregation_interval=60, roi_identifier="MAIN_ROI", vehicle_count=324,
        traffic_flow=324, traffic_density=0.324, mean_speed=12.76,
        created_at=datetime.now(UTC),
    )

    class FakeQuery:
        def filter(self, *args: object) -> "FakeQuery":
            return self

        def offset(self, value: int) -> "FakeQuery":
            return self

        def limit(self, value: int) -> "FakeQuery":
            return self

        def count(self) -> int:
            return 1

        def all(self) -> list[SimpleNamespace]:
            return [item]

    monkeypatch.setattr(service.crud_dataset, "get_dataset_latest_version", lambda *a: (None, version))
    monkeypatch.setattr(service, "traffic_time_query", lambda *a, **kw: FakeQuery())
    preview = service.preview_traffic_aggregation(None, dataset_id=uuid4())
    chart = service.get_traffic_chart_data(None, dataset_id=uuid4())
    assert preview["items"][0].time_bucket.isoformat() == "2018-10-24T08:30:00+03:00"
    assert chart["time_labels"] == ["2018-10-24T08:30:00+03:00"]
    assert set(chart) == {
        "dataset_id",
        "dataset_version_id",
        "aggregation_interval",
        "roi_identifier",
        "time_labels",
        "vehicle_count",
        "average_speed",
        "traffic_flow",
    }
    assert item.time_bucket == epoch_bucket


@pytest.mark.parametrize("staging_filename", [FILENAME, None])
def test_export_preserves_original_filename(staging_filename: str | None) -> None:
    class FakeDB:
        def query(self, *args: object) -> "FakeDB":
            return self

        def filter(self, *args: object) -> "FakeDB":
            return self

        def first(self) -> SimpleNamespace:
            return SimpleNamespace(original_filename=FILENAME)

        def add(self, value: object) -> None:
            pass

        def commit(self) -> None:
            pass

        def refresh(self, value: object) -> None:
            pass

    version, _ = service.crud_dataset.create_normalized_version(
        FakeDB(), dataset_id=uuid4(), new_version_id=uuid4(), version_tag="v2.0",
        file_format="PARQUET", file_path="normalized.parquet", file_size_bytes=100,
        total_records=1, records_before=1, user_id=uuid4(),
        cleaning_parameters={"source_version_id": str(uuid4())},
        original_filename=staging_filename,
    )
    assert version.original_filename == FILENAME
