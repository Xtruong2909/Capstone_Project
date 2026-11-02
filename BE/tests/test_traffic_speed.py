from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.schemas.traffic_aggregation import (
    TrafficAggregationChartResponse,
    TrafficAggregationPreviewResponse,
    TrafficAggregationRecord,
)
from app.services import traffic_speed_repair_service as repair
from app.services.traffic_aggregation_service import aggregate_time_series_rows


@pytest.mark.parametrize(
    ("speed", "expected"),
    [(0, 0), (5, 18), (10, 36), (15, 54), (20, 72)],
)
def test_convert_source_speed_to_kmh(speed: float, expected: float) -> None:
    bucket = aggregate_time_series_rows([{"time": 0, "track_id": 1, "speed": speed}])[0]
    assert bucket["mean_speed"] == expected


def test_mean_uses_unrounded_samples_and_avg_speed_fallback() -> None:
    bucket = aggregate_time_series_rows([
        {"time": 0, "track_id": 1, "speed": "1.234"},
        {"time": 1, "track_id": 2, "avg_speed": "2.345"},
    ])[0]
    assert bucket["mean_speed"] == 6.44
    assert bucket["vehicle_count"] == 2


def test_aggregation_contract_does_not_expose_congestion_level() -> None:
    bucket = aggregate_time_series_rows([{"time": 0, "track_id": 1, "speed": 10}])[0]

    assert "congestion_level" not in bucket
    assert "congestion_level" not in TrafficAggregationRecord.model_fields


def test_traffic_aggregation_api_contracts_exclude_density() -> None:
    for schema in (
        TrafficAggregationRecord,
        TrafficAggregationPreviewResponse,
        TrafficAggregationChartResponse,
    ):
        assert "traffic_density" not in schema.model_fields

    chart_metadata = TrafficAggregationChartResponse.model_fields[
        "calculation_metadata"
    ].default
    assert "traffic_density" not in chart_metadata
    assert "1000.0" not in str(chart_metadata)


def test_repair_preserves_other_fields_and_is_idempotent(monkeypatch) -> None:
    version = SimpleNamespace(id=uuid4())
    record = SimpleNamespace(
        id=23, time_bucket=datetime(1970, 1, 1, tzinfo=UTC), mean_speed=10,
        vehicle_count=342, traffic_flow=342, traffic_density=0.342,
    )
    monkeypatch.setattr(repair, "list_speed_groups", lambda db: [(version, 60, "MAIN_ROI")])
    monkeypatch.setattr(repair, "_recording_start", lambda db, v: None)
    monkeypatch.setattr(repair, "_iter_rows_from_version", lambda v: iter([
        {"time": 0, "track_id": 1, "speed": 10},
    ]))
    monkeypatch.setattr(repair, "get_speed_records", lambda *a, **kw: [record])
    original = vars(record).copy()
    for _ in range(2):
        assert repair.repair_traffic_speeds(None)[0]["records"] == 1
        assert record.mean_speed == 36
        for key in ("id", "time_bucket", "vehicle_count", "traffic_flow", "traffic_density"):
            assert getattr(record, key) == original[key]


def test_repair_aborts_when_source_bucket_is_missing(monkeypatch) -> None:
    version = SimpleNamespace(id=uuid4())
    record = SimpleNamespace(id=23, time_bucket=datetime(1970, 1, 1, tzinfo=UTC), mean_speed=10)
    monkeypatch.setattr(repair, "list_speed_groups", lambda db: [(version, 60, "MAIN_ROI")])
    monkeypatch.setattr(repair, "_recording_start", lambda db, v: None)
    monkeypatch.setattr(repair, "_iter_rows_from_version", lambda v: iter([]))
    monkeypatch.setattr(repair, "get_speed_records", lambda *a, **kw: [record])
    with pytest.raises(ValueError, match="Source bucket missing"):
        repair.repair_traffic_speeds(None)
    assert record.mean_speed == 10
