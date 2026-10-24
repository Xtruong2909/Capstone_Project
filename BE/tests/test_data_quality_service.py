import csv
import json
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pyarrow as pa
import pytest
from pyarrow import parquet

from app.schemas.data_quality import DataQualityOutlierRule
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
        self.issue_batch_sizes: list[int] = []
        self.progress_snapshots: list[tuple[str, int, int]] = []

    def query(self, model: object) -> FakeQuery:
        return FakeQuery(self.check)

    def add(self, item: object) -> None:
        self.issues.append(item)

    def execute(self, statement: object, parameters: list[dict]) -> None:
        self.issue_batch_sizes.append(len(parameters))
        self.issues.extend(SimpleNamespace(**item) for item in parameters)

    def commit(self) -> None:
        self.progress_snapshots.append((
            self.check.status, self.check.processed_rows, len(self.issues),
        ))

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
    outlier_rules: list[DataQualityOutlierRule] | None = None,
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
    _run_check(check.id, path, version, mappings or {}, outlier_rules=outlier_rules)
    return check, session


@pytest.mark.parametrize("enable_outliers", [False, True])
def test_quality_check_reports_missing_duplicate_timestamp_and_coordinates(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    enable_outliers: bool,
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

    check, session = _run_file_check(
        monkeypatch, path,
        outlier_rules=[_outlier_rule("speed")] if enable_outliers else None,
    )

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


@pytest.mark.parametrize("structure", ["tabular", "pneuma"])
@pytest.mark.parametrize(
    ("value", "issue_type"),
    [
        ("-2.5", "negative_speed"),
        ("0", None),
        ("-0.0", None),
        ("12.5", None),
        ("fast", "invalid_format"),
        ("-inf", "invalid_format"),
        ("inf", "invalid_format"),
        ("NaN", "missing_value"),
        ("", "missing_value"),
    ],
)
def test_speed_validation_requires_finite_negative_numbers(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    structure: str,
    value: str,
    issue_type: str | None,
) -> None:
    path = tmp_path / "speeds.csv"
    if structure == "pneuma":
        content = (
            "track_id;type;traveled_d;avg_speed;lat;lon;speed;lon_acc;lat_acc;time\n"
            f"1;car;10;{value};37;23;{value};-1;-2;0\n"
        )
    else:
        content = f"track_id,timestamp,speed,avg_speed\n1,0,{value},{value}\n"
    path.write_text(content, encoding="utf-8")
    original = path.read_bytes()

    check, session = _run_file_check(monkeypatch, path)

    assert check.status == "completed"
    assert path.read_bytes() == original
    assert check.report["errors_by_type"] == (
        {issue_type: {"total_errors": 2, "affected_rows": 1}} if issue_type else {}
    )
    assert check.report["invalid_rows"] == int(issue_type is not None)
    assert check.report["valid_rows"] == int(issue_type is None)
    assert sorted(
        (issue.row_number, issue.column_name, issue.observed_value)
        for issue in session.issues
    ) == ([(2, "avg_speed", value), (2, "speed", value)] if issue_type else [])


def test_negative_speed_checks_all_mapped_and_named_columns(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = tmp_path / "mapped-speeds.csv"
    path.write_text(
        "track_id,timestamp,speed,avg_speed,velocity,mean_velocity\n"
        "1,0,-1,-2,-3,-4\n"
        "2,1,0,1,2,3\n",
        encoding="utf-8",
    )

    check, session = _run_file_check(
        monkeypatch, path, mappings={"velocity": "speed", "mean_velocity": "avg_speed"}
    )

    assert check.status == "completed"
    assert check.report["errors_by_type"] == {
        "negative_speed": {"total_errors": 4, "affected_rows": 1}
    }
    assert check.report["invalid_rows"] == 1
    assert check.report["valid_rows"] == 1
    assert [
        (issue.row_number, issue.column_name, issue.observed_value)
        for issue in session.issues
    ] == [(2, "speed", "-1"), (2, "avg_speed", "-2"),
          (2, "velocity", "-3"), (2, "mean_velocity", "-4")]


def test_pneuma_counts_each_negative_point_once_per_affected_row(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = tmp_path / "negative-trajectory.csv"
    path.write_text(
        "track_id;type;traveled_d;avg_speed;lat;lon;speed;lon_acc;lat_acc;time\n"
        "1;car;10;-2;37;23;-3;0;0;0;37;23;-4;0;0;1;37;23;-3;0;0;2;\n"
        "2;car;10;2;37;23;0;0;0;0;37;23;4;0;0;1;\n",
        encoding="utf-8",
    )

    check, session = _run_file_check(monkeypatch, path)

    assert check.status == "completed"
    assert check.report["errors_by_type"] == {
        "negative_speed": {"total_errors": 4, "affected_rows": 1}
    }
    assert check.report["total_rows"] == 2
    assert check.report["total_errors"] == 4
    assert check.report["invalid_rows"] == 1
    assert check.report["valid_rows"] == 1
    assert [
        (issue.row_number, issue.column_name, issue.observed_value)
        for issue in session.issues
    ] == [(2, "avg_speed", "-2"), (2, "speed", "-3"),
          (2, "speed", "-4"), (2, "speed", "-3")]


def _outlier_rule(field: str) -> DataQualityOutlierRule:
    # Synthetic bounds for testing only, not recommended traffic thresholds.
    return DataQualityOutlierRule(
        field=field,
        min_value=0 if field in {"speed", "avg_speed"} else -10,
        max_value=10,
        unit="km/h" if field in {"speed", "avg_speed"} else "m/s^2",
        basis="Synthetic unit-test bounds; not a production recommendation",
    )


@pytest.mark.parametrize("structure", ["pneuma", "csv", "parquet", "json"])
@pytest.mark.parametrize("field", ["speed", "avg_speed", "lon_acc", "lat_acc"])
@pytest.mark.parametrize(
    ("value", "warning_count"),
    [(0, 0), (5, 0), (10, 0), (10.01, 1), ("fast", 0),
     (None, 0), ("NaN", 0), ("inf", 0), ("-inf", 0)],
)
def test_outlier_bounds_for_each_field_and_structure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    structure: str,
    field: str,
    value: object,
    warning_count: int,
) -> None:
    record = dict(zip(
        data_quality_service.PNEUMA_HEADERS,
        [1, "car", 10, 5, 37, 23, 5, 0, 0, 0],
        strict=True,
    ))
    record[field] = value
    path = tmp_path / f"outliers.{structure if structure != 'pneuma' else 'csv'}"
    if structure == "parquet":
        parquet.write_table(pa.Table.from_pylist([record]), path)
    elif structure == "json":
        path.write_text(json.dumps([record]), encoding="utf-8")
    else:
        if structure == "csv":
            # A normalized CSV can have a different column order from raw pNEUMA.
            record["timestamp"] = record.pop("time")
        with path.open("w", encoding="utf-8", newline="") as output:
            writer = csv.DictWriter(output, fieldnames=record.keys(), delimiter=";")
            writer.writeheader()
            writer.writerow(record)
    original = path.read_bytes()
    rule = _outlier_rule(field)

    check, session = _run_file_check(
        monkeypatch, path, file_format=path.suffix[1:], outlier_rules=[rule]
    )

    assert check.status == "completed"
    assert path.read_bytes() == original
    report = check.report
    assert report["total_warnings"] == warning_count
    assert report["warning_rows"] == warning_count
    assert report["outlier_rules"] == [rule.model_dump()]
    assert "outlier" not in report["errors_by_type"]
    warnings = [issue for issue in session.issues if issue.issue_type == "outlier"]
    assert len(warnings) == warning_count
    if warning_count:
        assert report["warnings_by_type"] == {
            "outlier": {"total_warnings": 1, "affected_rows": 1}
        }
        assert report["warnings_by_column"] == {field: 1}
        assert report["invalid_rows"] == 0
        assert report["valid_rows"] == 1
        assert report["total_errors"] == 0
        assert warnings[0].row_number == 2
        assert warnings[0].column_name == field
        assert warnings[0].observed_value == str(value)
        assert rule.unit in warnings[0].message
        assert all(column["errors"] == 0 for column in report["errors_by_column"])


@pytest.mark.parametrize("field", ["speed", "avg_speed", "lon_acc", "lat_acc"])
@pytest.mark.parametrize("value", [-10.01, -10, -1])
def test_outliers_preserve_negative_speed_and_signed_acceleration(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    field: str,
    value: float,
) -> None:
    path = tmp_path / "signed.csv"
    path.write_text(f"track_id,timestamp,{field}\n1,0,{value}\n", encoding="utf-8")

    check, _ = _run_file_check(monkeypatch, path, outlier_rules=[_outlier_rule(field)])

    is_speed = field in {"speed", "avg_speed"}
    assert check.status == "completed"
    assert check.report["invalid_rows"] == int(is_speed)
    assert check.report["total_warnings"] == int(not is_speed and value < -10)
    assert check.report["errors_by_type"] == (
        {"negative_speed": {"total_errors": 1, "affected_rows": 1}} if is_speed else {}
    )


def test_outlier_rules_are_opt_in_and_keep_unconfigured_fields_unchecked(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = tmp_path / "unconfigured.csv"
    path.write_text("track_id,timestamp,speed,lon_acc\n1,0,99999,99999\n", encoding="utf-8")
    check, _ = _run_file_check(monkeypatch, path)
    assert check.report["total_warnings"] == 0
    assert check.report["outlier_rules"] == []
    rule = _outlier_rule("speed").model_copy(update={"max_value": 100000})
    check, _ = _run_file_check(monkeypatch, path, outlier_rules=[rule])
    assert check.report["total_warnings"] == 0
    assert check.report["invalid_rows"] == 0


@pytest.mark.parametrize("bound", ["min_value", "max_value"])
def test_one_sided_outlier_rules(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, bound: str,
) -> None:
    path = tmp_path / "one-sided.csv"
    path.write_text("track_id,timestamp,speed\n1,0,5\n", encoding="utf-8")
    rule = DataQualityOutlierRule(
        field="speed", unit="km/h", basis="Synthetic test",
        **{bound: 6 if bound == "min_value" else 4},
    )
    check, _ = _run_file_check(monkeypatch, path, outlier_rules=[rule])
    assert check.report["total_warnings"] == 1
    assert check.report["invalid_rows"] == 0


def test_mapped_outliers_and_errors_count_rows_independently(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = tmp_path / "mapped-outliers.csv"
    path.write_text(
        "track_id,timestamp,velocity,mean_velocity,ax,ay\n"
        "1,0,11,12,-11,11\n"
        "2,1,-1,12,0,0\n",
        encoding="utf-8",
    )
    fields = ["speed", "avg_speed", "lon_acc", "lat_acc"]
    check, session = _run_file_check(
        monkeypatch, path,
        mappings=dict(zip(["velocity", "mean_velocity", "ax", "ay"], fields, strict=True)),
        outlier_rules=[_outlier_rule(field) for field in fields],
    )
    assert check.status == "completed"
    assert check.report["invalid_rows"] == 1
    assert check.report["valid_rows"] == 1
    assert check.report["total_errors"] == 1
    assert check.report["total_warnings"] == 5
    assert check.report["warning_rows"] == 2
    assert check.report["warnings_by_column"] == {
        "velocity": 1, "mean_velocity": 2, "ax": 1, "ay": 1,
    }
    assert [
        (issue.row_number, issue.column_name, issue.observed_value)
        for issue in session.issues if issue.issue_type == "outlier"
    ] == [(2, "velocity", "11"), (2, "mean_velocity", "12"),
          (2, "ax", "-11"), (2, "ay", "11"), (3, "mean_velocity", "12")]


def test_pneuma_outliers_count_points_without_invalidating_trajectory(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = tmp_path / "wide-outliers.csv"
    path.write_text(
        "track_id;type;traveled_d;avg_speed;lat;lon;speed;lon_acc;lat_acc;time\n"
        "1;car;10;11;37;23;12;-11;11;0;37;23;12;11;-11;1;\n",
        encoding="utf-8",
    )
    check, session = _run_file_check(
        monkeypatch, path,
        outlier_rules=[_outlier_rule(field) for field in ("speed", "avg_speed", "lon_acc", "lat_acc")],
    )
    assert check.status == "completed"
    assert check.report["warnings_by_type"] == {
        "outlier": {"total_warnings": 7, "affected_rows": 1}
    }
    assert check.report["warning_rows"] == 1
    assert check.report["total_errors"] == 0
    assert check.report["invalid_rows"] == 0
    assert check.report["valid_rows"] == 1
    assert len(session.issues) == 7
    assert all(issue.row_number == 2 for issue in session.issues)


def test_outlier_report_and_issues_are_exposed_with_warning_severity(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = tmp_path / "report.csv"
    path.write_text("track_id,timestamp,speed\n1,0,11\n2,1,-1\n", encoding="utf-8")
    check, session = _run_file_check(monkeypatch, path, outlier_rules=[_outlier_rule("speed")])
    monkeypatch.setattr(data_quality_service.crud_data_quality, "get_check", lambda *args: check)
    monkeypatch.setattr(
        data_quality_service.crud_data_quality, "list_issues",
        lambda *args, **kwargs: (session.issues, len(session.issues)),
    )
    report = data_quality_service.get_data_quality_report(
        session, dataset_id=check.dataset_id, check_id=check.id,
    ).model_dump(mode="json")
    issues = data_quality_service.get_data_quality_issues(
        session, dataset_id=check.dataset_id, check_id=check.id, page=1, page_size=50,
    ).model_dump(mode="json")
    assert report["total_warnings"] == 1
    assert report["warnings_by_type"]["outlier"]["affected_rows"] == 1
    assert report["outlier_rules"][0]["basis"] == _outlier_rule("speed").basis
    assert [(issue["issue_type"], issue["severity"]) for issue in issues["issues"]] == [
        ("outlier", "warning"), ("negative_speed", "error"),
    ]

    # Existing persisted JSON reports must remain readable after schema extension.
    for key in ("total_warnings", "warning_rows", "warnings_by_type",
                "warnings_by_column", "outlier_rules"):
        check.report.pop(key)
    legacy_report = data_quality_service.get_data_quality_report(
        session, dataset_id=check.dataset_id, check_id=check.id,
    )
    assert legacy_report.total_warnings == 0
    assert legacy_report.outlier_rules == []


def test_outlier_warnings_survive_batch_boundaries(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(data_quality_service, "DB_BATCH_SIZE", 2)
    monkeypatch.setattr(data_quality_service, "PROGRESS_BATCH_SIZE", 2)
    path = tmp_path / "batches.csv"
    path.write_text("track_id,timestamp,speed\n1,0,11\n2,1,12\n3,2,13\n", encoding="utf-8")
    check, session = _run_file_check(monkeypatch, path, outlier_rules=[_outlier_rule("speed")])
    assert check.status == "completed"
    assert check.report["total_warnings"] == 3
    assert check.report["warning_rows"] == 3
    assert check.report["invalid_rows"] == 0
    assert len(session.issues) == 3


@pytest.mark.parametrize(
    ("mapping", "expected_warnings"),
    [({"speed": "avg_speed"}, 0), ({"speed": "display_speed"}, 1),
     ({"speed": "SPEED"}, 1)],
)
def test_outlier_mapping_precedence_and_canonical_source_fallback(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
    mapping: dict[str, str], expected_warnings: int,
) -> None:
    path = tmp_path / "mapping.csv"
    path.write_text("track_id,timestamp,speed\n1,0,11\n", encoding="utf-8")
    check, _ = _run_file_check(
        monkeypatch, path, mappings=mapping, outlier_rules=[_outlier_rule("speed")],
    )
    assert check.report["total_warnings"] == expected_warnings


def test_quality_worker_forwards_outlier_configuration(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = tmp_path / "worker.csv"
    path.write_text("track_id,timestamp,speed\n1,0,11\n", encoding="utf-8")
    check, session = _run_file_check(monkeypatch, path)
    check.status = "queued"
    version = SimpleNamespace(id=check.dataset_version_id, file_format="CSV")
    monkeypatch.setattr(
        data_quality_service.crud_dataset, "get_dataset_version",
        lambda *args: (object(), version),
    )
    monkeypatch.setattr(data_quality_service, "_version_path", lambda version: path)
    monkeypatch.setattr(data_quality_service, "_get_mappings", lambda *args: {})

    data_quality_service.run_data_quality_check(check.id, outlier_rules=[_outlier_rule("speed")])

    assert check.status == "completed"
    assert check.report["total_warnings"] == 1
    assert len(session.issues) == 1


def test_wide_trajectory_batches_all_issues_and_marks_each_row_only_once(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(data_quality_service, "DB_BATCH_SIZE", 3)
    statements: list[str] = []
    original_connect = data_quality_service.sqlite3.connect

    def traced_connect(*args: object, **kwargs: object) -> object:
        connection = original_connect(*args, **kwargs)
        connection.set_trace_callback(statements.append)
        return connection

    monkeypatch.setattr(data_quality_service.sqlite3, "connect", traced_connect)
    path = tmp_path / "many-issues.csv"
    path.write_text(
        ";".join(data_quality_service.PNEUMA_HEADERS) + "\n"
        + "1;car;10;5;"
        + ";".join(f"37;23;-1;11;0;{point}" for point in range(7)) + "\n",
        encoding="utf-8",
    )
    check, session = _run_file_check(
        monkeypatch, path, outlier_rules=[_outlier_rule("lon_acc")],
    )
    assert check.status == "completed"
    assert session.issue_batch_sizes == [3, 3, 3, 3, 2]
    assert len(session.issues) == 14
    assert check.report["errors_by_type"]["negative_speed"] == {
        "total_errors": 7, "affected_rows": 1,
    }
    assert check.report["warnings_by_type"]["outlier"] == {
        "total_warnings": 7, "affected_rows": 1,
    }
    assert check.report["invalid_rows"] == 1
    assert sum("INSERT OR IGNORE INTO affected_rows" in sql for sql in statements) == 1
    assert sum("INSERT OR IGNORE INTO issue_affected_rows" in sql for sql in statements) == 2


def test_pneuma_does_not_sample_trajectories_before_processing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_infer = data_quality_service._infer_column_types
    samples: list[list] = []

    def capture_sample(
        headers: list[str], sample: list[list], mappings: dict[str, str], is_pneuma: bool,
    ) -> dict[str, str]:
        assert is_pneuma
        samples.append(sample)
        return original_infer(headers, sample, mappings, is_pneuma)

    monkeypatch.setattr(data_quality_service, "_infer_column_types", capture_sample)
    path = tmp_path / "no-sampling.csv"
    path.write_text(
        ";".join(data_quality_service.PNEUMA_HEADERS) + "\n"
        + "1;car;10;5;37;23;5;0;0;0\n", encoding="utf-8",
    )
    check, _ = _run_file_check(monkeypatch, path)
    assert check.status == "completed"
    assert check.report["valid_rows"] == 1
    assert samples == [[]]


def test_time_based_progress_updates_before_row_batch_boundary(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    ticks = iter(range(0, 100, 3))
    monkeypatch.setattr(data_quality_service, "monotonic", lambda: next(ticks))
    path = tmp_path / "progress.csv"
    path.write_text("track_id,timestamp,speed\n1,0,11\n2,1,11\n", encoding="utf-8")
    check, session = _run_file_check(monkeypatch, path, outlier_rules=[_outlier_rule("speed")])
    assert ("running", 1, 1) in session.progress_snapshots
    assert ("running", 2, 2) in session.progress_snapshots
    assert check.processed_rows == 2
    assert check.progress_percent == 100


def test_progress_during_long_trajectory_does_not_count_unfinished_row(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    ticks = iter(range(0, 100, 3))
    monkeypatch.setattr(data_quality_service, "monotonic", lambda: next(ticks))
    monkeypatch.setattr(data_quality_service, "PROGRESS_POINT_BATCH_SIZE", 1)
    path = tmp_path / "long-trajectory.csv"
    path.write_text(
        ";".join(data_quality_service.PNEUMA_HEADERS) + "\n"
        + "1;car;10;5;37;23;11;0;0;0;37;23;11;0;0;1\n", encoding="utf-8",
    )
    check, session = _run_file_check(monkeypatch, path, outlier_rules=[_outlier_rule("speed")])
    assert ("running", 0, 1) in session.progress_snapshots
    assert ("running", 1, 2) in session.progress_snapshots
    assert check.report["warnings_by_type"]["outlier"] == {
        "total_warnings": 2, "affected_rows": 1,
    }


def test_bulk_insert_failure_does_not_report_success(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_insert(*args: object, **kwargs: object) -> None:
        raise RuntimeError("Synthetic persistence failure")

    monkeypatch.setattr(data_quality_service.crud_data_quality, "insert_issues", fail_insert)
    path = tmp_path / "failed-insert.csv"
    path.write_text("track_id,timestamp,speed\n1,0,-1\n", encoding="utf-8")
    check, _ = _run_file_check(monkeypatch, path)
    assert check.status == "failed"
    assert check.report is None
    assert check.error_message
