import csv
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.services import data_quality_service
from app.services.data_quality_service import (
    DataQualitySchemaError,
    _open_records,
    _parse_coordinate,
    _parse_timestamp,
    _run_check,
)


class FakeQuery:
    def __init__(self, check: SimpleNamespace) -> None:
        self.check = check

    def filter(self, *args: object) -> "FakeQuery":
        return self

    def one(self) -> SimpleNamespace:
        return self.check

    def one_or_none(self) -> SimpleNamespace:
        return self.check


class FakeSession:
    def __init__(self, check: SimpleNamespace) -> None:
        self.check = check
        self.issues: list[object] = []

    def query(self, model: object) -> FakeQuery:
        return FakeQuery(self.check)

    def add(self, item: object) -> None:
        self.issues.append(item)

    def commit(self) -> None:
        pass

    def flush(self) -> None:
        pass

    def rollback(self) -> None:
        pass

    def close(self) -> None:
        pass


def _run_file_check(
    monkeypatch: pytest.MonkeyPatch,
    path: Path,
    *,
    file_format: str = "CSV",
    mappings: dict[str, str] | None = None,
) -> tuple[SimpleNamespace, FakeSession]:
    check = SimpleNamespace(
        id=uuid4(),
        dataset_id=uuid4(),
        dataset_version_id=uuid4(),
        status="queued",
        progress_percent=0,
        processed_rows=0,
        total_rows=None,
        report=None,
        error_message=None,
        started_at=None,
        completed_at=None,
    )
    session = FakeSession(check)
    monkeypatch.setattr(data_quality_service, "SessionLocal", lambda: session)
    version = SimpleNamespace(id=check.dataset_version_id, file_format=file_format)
    _run_check(check.id, path, version, mappings or {})
    return check, session


def test_quality_check_reports_missing_duplicate_timestamp_and_coordinates(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = tmp_path / "traffic.csv"
    path.write_text(
        "track_id,timestamp,latitude,longitude,speed\n"
        "1,0,37.5,127.0,10\n"
        "1,0,37.5,127.0,10\n"
        "2,not-a-time,91,abc,fast\n"
        "3,2,,128,12\n",
        encoding="utf-8",
    )

    check, session = _run_file_check(monkeypatch, path)

    report = check.report
    assert check.status == "completed"
    assert report["total_rows"] == 4
    assert report["invalid_rows"] == 3
    assert report["valid_rows"] == 1
    assert report["errors_by_type"]["duplicate_record"]["total_errors"] == 1
    assert report["errors_by_type"]["invalid_timestamp"]["total_errors"] == 1
    assert report["errors_by_type"]["invalid_coordinate"]["total_errors"] == 2
    assert report["errors_by_type"]["missing_value"]["total_errors"] == 1
    assert report["errors_by_type"]["invalid_format"]["total_errors"] == 1
    assert any(issue.column_name == "latitude" for issue in session.issues)
    assert all(len(issue.observed_value or "") <= 256 for issue in session.issues)


def test_quality_check_uses_column_mapping_for_coordinate_and_timestamp_fields(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = tmp_path / "mapped.csv"
    path.write_text(
        "time,lat,lon\n"
        "2026-10-19T10:00:00,91,127\n",
        encoding="utf-8",
    )

    check, _ = _run_file_check(
        monkeypatch,
        path,
        mappings={
            "time": "timestamp",
            "lat": "latitude",
            "lon": "longitude",
        },
    )

    assert check.report["missing_required_columns"] == ["track_id"]
    assert check.report["errors_by_type"]["invalid_coordinate"]["total_errors"] == 1
    assert check.report["invalid_rows"] == 1


def test_quality_check_detects_missing_required_fields(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = tmp_path / "no-required-columns.csv"
    path.write_text("name,value\ncar,1\nbus,2\n", encoding="utf-8")

    check, _ = _run_file_check(monkeypatch, path)

    assert check.report["missing_required_columns"] == ["track_id", "timestamp"]
    assert check.report["invalid_rows"] == 2
    assert check.report["valid_rows"] == 0


def test_header_only_dataset_completes_with_zero_rows(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = tmp_path / "empty.csv"
    path.write_text("track_id,timestamp,speed\n", encoding="utf-8")

    check, _ = _run_file_check(monkeypatch, path)

    assert check.status == "completed"
    assert check.report["total_rows"] == 0
    assert check.report["valid_rows"] == 0
    assert check.report["invalid_rows"] == 0


def test_pneuma_wide_quality_check_keeps_track_rows_and_checks_seconds(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers = [
        "track_id",
        "type",
        "traveled_d",
        "avg_speed",
        "lat",
        "lon",
        "speed",
        "lon_acc",
        "lat_acc",
        "time",
    ]
    path = tmp_path / "pneuma.csv"
    with path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.writer(output)
        writer.writerow(headers)
        writer.writerow([1, "car", 1, 2, 37, 127, 3, 0, 0, 0.5, 38, 128, 4, 0, 0, 1.5])
        writer.writerow([2, "car", 1, 2, 37, 127, 3, 0, 0, -1])
        writer.writerow([3, "car", 1, 2, 37, 127, 3, 0, 0, 0.5, 38, 128, 4, 0, "", 1.5])
        writer.writerow([4, "car", 1, 2, 37, 127, 3, 0, 0, 0.5, 38, 128, 4, 0, 0, 1.5, ""])

    check, _ = _run_file_check(monkeypatch, path)

    assert check.report["detected_structure"] == "pneuma_wide_trajectory"
    assert check.report["total_rows"] == 4
    assert check.report["errors_by_type"]["invalid_timestamp"]["total_errors"] == 1
    assert check.report["errors_by_type"]["missing_value"]["total_errors"] == 1
    assert check.report["errors_by_type"].get("invalid_format", {}).get("total_errors", 0) == 0


def test_large_csv_is_processed_past_chunk_boundary(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = tmp_path / "large.csv"
    with path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.writer(output)
        writer.writerow(["track_id", "timestamp", "speed"])
        writer.writerows((index, index, index % 90) for index in range(5200))

    check, _ = _run_file_check(monkeypatch, path)

    assert check.report["total_rows"] == 5200
    assert check.processed_rows == 5200
    assert check.progress_percent == 100


def test_empty_file_and_timestamp_coordinate_parsing(tmp_path: Path) -> None:
    empty_path = tmp_path / "empty.csv"
    empty_path.write_text("", encoding="utf-8")

    with (
        pytest.raises(DataQualitySchemaError, match="CSV rỗng"),
        _open_records(empty_path, "CSV"),
    ):
        pass

    assert _parse_timestamp("12.25")
    assert not _parse_timestamp("-0.1")
    assert _parse_timestamp("2026-10-19T10:00:00Z")
    assert _parse_coordinate("90", latitude=True) == (True, True)
    assert _parse_coordinate("181", latitude=False) == (True, False)
    assert _parse_coordinate("north", latitude=True) == (False, False)


def test_unusable_schema_is_persisted_as_failed_check(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = tmp_path / "empty.csv"
    path.write_text("", encoding="utf-8")

    check, _ = _run_file_check(monkeypatch, path)

    assert check.status == "failed"
    assert "CSV rỗng" in check.error_message


def test_quality_check_reports_ragged_csv_rows_as_invalid_format(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = tmp_path / "ragged.csv"
    path.write_text(
        "track_id,timestamp,speed\n"
        "1,0,10\n"
        "2,1\n"
        "3,2,11,unexpected\n",
        encoding="utf-8",
    )

    check, _ = _run_file_check(monkeypatch, path)

    assert check.report["total_rows"] == 3
    assert check.report["invalid_rows"] == 2
    assert check.report["errors_by_type"]["invalid_format"]["total_errors"] == 2


def test_streamed_json_records_flag_extra_schema_fields(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = tmp_path / "traffic.json"
    path.write_text(
        '[{"track_id":1,"timestamp":1,"speed":10},'
        '{"track_id":2,"timestamp":2,"speed":11,"unexpected":true}]',
        encoding="utf-8",
    )

    check, _ = _run_file_check(monkeypatch, path, file_format="JSON")

    assert check.report["total_rows"] == 2
    assert check.report["invalid_rows"] == 1
    assert check.report["errors_by_type"]["invalid_format"]["total_errors"] == 1
