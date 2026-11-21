import csv
import hashlib
import json
import logging
import math
import sqlite3
import tempfile
from collections import Counter
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, date, datetime
from itertools import chain, islice
from pathlib import Path
from time import monotonic
from typing import Any
from uuid import UUID

import ijson
import openpyxl
import pyarrow as pa
import xlrd
from pyarrow import parquet
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.crud import crud_data_quality, crud_dataset
from app.database.database import SessionLocal
from app.models.data_quality import DataQualityCheck
from app.models.dataset import (
    Dataset,
    DatasetColumnMapping,
    DatasetVersion,
    RecordingSession,
)
from app.models.user import User
from app.schemas.data_quality import (
    DataQualityCheckStarted,
    DataQualityCheckStatus,
    DataQualityColumnCount,
    DataQualityIssueCount,
    DataQualityIssueItem,
    DataQualityIssuesPage,
    DataQualityOutlierRule,
    DataQualityReport,
)
from app.services.dataset_preview_service import (
    JSON_ARRAY_FIELDS,
    PNEUMA_HEADERS,
    PNEUMA_POINT_FIELDS,
    _resolve_file_path,
    resolve_stored_file_path,
)
from app.services.quality_point_batch import clean_point_block

logger = logging.getLogger(__name__)
MAX_COLUMNS = 512
SAMPLE_ROWS = 1000
DB_BATCH_SIZE = 1000
PROGRESS_BATCH_SIZE = 5000
PROGRESS_INTERVAL_SECONDS = 2.0
PROGRESS_POINT_BATCH_SIZE = 1024
NULL_TOKENS = {"", "null", "none", "nan"}
OUTLIER_FIELDS = {"speed", "avg_speed", "lon_acc", "lat_acc"}
ALIASES = {
    "track_id": {"track_id", "vehicle_id", "trackid", "vehicleid"},
    "timestamp": {"timestamp", "time", "timestamp_ms"},
    "latitude": {"latitude", "lat"},
    "longitude": {"longitude", "lon", "lng"},
}


class DataQualityNotFoundError(FileNotFoundError):
    """Raised when a dataset version or quality check cannot be found."""


class DataQualityConflictError(ValueError):
    """Raised when a quality check is already queued or running."""


class DataQualitySchemaError(ValueError):
    """Raised when a dataset has no usable tabular schema."""


class DataQualityReportNotReadyError(ValueError):
    """Raised when a report is requested before a check completes."""


def _resolve_dataset_version(
    db: Session,
    dataset_id: UUID,
    dataset_version_id: UUID | None = None,
) -> tuple[Any, DatasetVersion]:
    result = (
        crud_dataset.get_dataset_version(db, dataset_id, dataset_version_id)
        if dataset_version_id is not None
        else crud_dataset.get_dataset_latest_version(db, dataset_id)
    )
    if result is None:
        raise DataQualityNotFoundError("Không tìm thấy dataset hoặc phiên bản đã tải lên")
    return result


def _value_matches_type(value: Any, expected_type: str) -> bool:
    if expected_type == "unknown" or expected_type == "string":
        return True
    if expected_type == "number":
        try:
            return math.isfinite(float(value))
        except (TypeError, ValueError):
            return False
    if expected_type == "integer":
        if isinstance(value, bool):
            return False
        try:
            return float(value).is_integer()
        except (TypeError, ValueError):
            return False
    if expected_type == "float":
        try:
            return math.isfinite(float(value))
        except (TypeError, ValueError):
            return False
    if expected_type == "boolean":
        return isinstance(value, bool) or str(value).strip().lower() in {
            "true",
            "false",
        }
    if expected_type == "date":
        if isinstance(value, (date, datetime)):
            return True
        try:
            date.fromisoformat(str(value).strip())
            return True
        except ValueError:
            return False
    if expected_type == "datetime":
        if isinstance(value, datetime):
            return True
        try:
            datetime.fromisoformat(str(value).strip())
            return True
        except ValueError:
            return False
    return True


def _get_mappings(
    db: Session,
    dataset_id: UUID,
    version_id: UUID,
) -> dict[str, str]:
    record: DatasetColumnMapping | None = crud_dataset.get_dataset_column_mapping(
        db,
        dataset_id,
        version_id,
    )
    if record is None:
        record = crud_dataset.get_latest_dataset_column_mapping(db, dataset_id)
    if record is None:
        return {}
    return {
        str(item["source_column"]): str(item["target_column"])
        for item in record.mappings
        if item.get("target_column") is not None
    }


def _version_path(version: DatasetVersion) -> Path:
    try:
        return _resolve_file_path(version)
    except FileNotFoundError as exc:
        raise DataQualityNotFoundError(str(exc)) from exc


def _status_schema(check: DataQualityCheck) -> DataQualityCheckStatus:
    return DataQualityCheckStatus(
        check_id=check.id,
        dataset_id=check.dataset_id,
        dataset_version_id=check.dataset_version_id,
        session_id=check.recording_session_id,
        status=check.status,
        progress_percent=check.progress_percent,
        processed_rows=check.processed_rows,
        total_rows=check.total_rows,
        error_message=check.error_message,
        created_at=check.created_at,
        started_at=check.started_at,
        completed_at=check.completed_at,
    )


def _clear_cross_session_findings(summary: dict[str, Any]) -> dict[str, Any]:
    """Recompute cross-session findings for the current validation snapshot."""
    summary = dict(summary)
    errors_by_type = dict(summary.get("errors_by_type", {}))
    warnings_by_type = dict(summary.get("warnings_by_type", {}))
    for issue_type in (
        "mapping_inconsistent", "schema_inconsistent", "session_metadata_mismatch",
        "duplicate_file", "cross_session_duplicate",
    ):
        prior = errors_by_type.pop(issue_type, {})
        summary["total_errors"] = max(
            0, int(summary.get("total_errors", 0)) - int(prior.get("total_errors", 0)),
        )
    prior_overlap = warnings_by_type.pop("cross_session_overlap", {})
    summary["total_warnings"] = max(
        0,
        int(summary.get("total_warnings", 0))
        - int(prior_overlap.get("total_warnings", 0)),
    )
    summary["errors_by_type"] = errors_by_type
    summary["warnings_by_type"] = warnings_by_type
    summary["validation_status"] = (
        "FAIL" if summary["total_errors"]
        else "WARNING" if summary["total_warnings"]
        else "PASS"
    )
    return summary


def start_data_quality_check(
    db: Session,
    *,
    dataset_id: UUID,
    user: User,
    dataset_version_id: UUID | None = None,
    session_id: UUID | None = None,
) -> tuple[DataQualityCheckStarted, Path | None]:
    dataset, version = _resolve_dataset_version(db, dataset_id, dataset_version_id)
    sessions = crud_dataset.list_all_version_sessions(db, version.id)
    selected_session: RecordingSession | None = None
    if session_id is not None:
        selected_session = crud_dataset.get_version_session(db, version.id, session_id)
        if selected_session is None or selected_session.dataset_id != dataset_id:
            raise DataQualityNotFoundError(
                "Không tìm thấy Recording Session trong Dataset Version đã chọn"
            )
        # A missing file is a session-level validation failure, not a reason to
        # reject the job. The worker records it in the version report.
        path = None
    elif sessions:
        path = None
    else:
        path = _version_path(version)

    active = crud_data_quality.get_active_check(db, version.id)
    if active is not None:
        raise DataQualityConflictError(
            f"Dataset đang được kiểm tra (check_id={active.id})"
        )
    check = DataQualityCheck(
        dataset_id=dataset_id,
        dataset_version_id=version.id,
        recording_session_id=session_id,
        started_by=user.id,
        status="queued",
        progress_percent=0,
        processed_rows=0,
    )
    if session_id is not None:
        previous = crud_data_quality.get_latest_completed_check(db, version.id)
        prior_sessions = (
            previous.report.get("sessions", [])
            if previous is not None and isinstance(previous.report, dict)
            else []
        )
        check.report = {
            "base_session_results": [
                _clear_cross_session_findings(item) for item in prior_sessions
                if item.get("session_id") != str(session_id)
            ]
        }
    db.add(check)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise DataQualityConflictError(
            "Dataset đang có một tác vụ kiểm tra đang chờ hoặc đang chạy"
        ) from exc
    db.refresh(check)
    response = DataQualityCheckStarted(
        **_status_schema(check).model_dump(),
        message=(
            "Đã xếp hàng kiểm tra Recording Session"
            if session_id is not None
            else "Đã xếp hàng kiểm tra Dataset Version"
        ),
    )
    return response, path


def get_data_quality_status(
    db: Session,
    *,
    dataset_id: UUID,
    check_id: UUID,
) -> DataQualityCheckStatus:
    check = crud_data_quality.get_check(db, dataset_id, check_id)
    if check is None:
        raise DataQualityNotFoundError("Không tìm thấy tác vụ kiểm tra chất lượng")
    return _status_schema(check)


def get_data_quality_report(
    db: Session,
    *,
    dataset_id: UUID,
    check_id: UUID,
) -> DataQualityReport:
    check = crud_data_quality.get_check(db, dataset_id, check_id)
    if check is None:
        raise DataQualityNotFoundError("Không tìm thấy tác vụ kiểm tra chất lượng")
    if check.status != "completed" or check.report is None:
        if check.status == "failed":
            raise DataQualityReportNotReadyError(
                f"Tác vụ kiểm tra thất bại: {check.error_message or 'lỗi không xác định'}"
            )
        raise DataQualityReportNotReadyError(
            f"Báo cáo chưa sẵn sàng (status={check.status})"
        )
    return DataQualityReport(check_id=check.id, **check.report)


def get_data_quality_issues(
    db: Session,
    *,
    dataset_id: UUID,
    check_id: UUID,
    page: int,
    page_size: int,
    session_id: UUID | None = None,
) -> DataQualityIssuesPage:
    check = crud_data_quality.get_check(db, dataset_id, check_id)
    if check is None:
        raise DataQualityNotFoundError("Không tìm thấy tác vụ kiểm tra chất lượng")
    issue_check_ids = [check_id]
    if session_id is not None and isinstance(check.report, dict):
        session_summary = next(
            (
                item for item in check.report.get("sessions", [])
                if item.get("session_id") == str(session_id)
            ),
            None,
        )
        if session_summary is None:
            raise DataQualityNotFoundError(
                "Session chưa có trong báo cáo Validation này"
            )
        issue_check_ids.append(UUID(session_summary.get("source_check_id", str(check_id))))
    issues, total = crud_data_quality.list_issues(
        db,
        list(set(issue_check_ids)),
        offset=(page - 1) * page_size,
        limit=page_size,
        recording_session_id=session_id,
    )
    return DataQualityIssuesPage(
        check_id=check_id,
        page=page,
        page_size=page_size,
        total=total,
        session_id=session_id,
        issues=[
            DataQualityIssueItem(
                row_number=issue.row_number,
                issue_type=issue.issue_type,
                severity=(
                    "warning"
                    if issue.issue_type in {"outlier", "cross_session_overlap"}
                    else "error"
                ),
                column_name=issue.column_name,
                message=issue.message,
                observed_value=issue.observed_value,
                session_id=issue.recording_session_id,
            )
            for issue in issues
        ],
    )


def _clean_headers(values: Iterator[Any]) -> tuple[list[str], list[str]]:
    headers: list[str] = []
    issues: list[str] = []
    seen: Counter[str] = Counter()
    for index, raw_value in enumerate(values, start=1):
        name = str(raw_value).strip() if raw_value is not None else ""
        if not name:
            issues.append(f"Header cột {index} bị trống")
            name = f"column_{index}"
        seen[name] += 1
        if seen[name] > 1:
            issues.append(f"Header '{name}' bị trùng")
            name = f"{name}_{seen[name]}"
        headers.append(name)
    if len(headers) > MAX_COLUMNS:
        raise DataQualitySchemaError(f"Dataset vượt quá giới hạn {MAX_COLUMNS} cột")
    if not headers:
        raise DataQualitySchemaError("Dataset không có header hợp lệ")
    return headers, issues


def _json_array_prefix(path: Path) -> str | None:
    try:
        with path.open("rb") as source:
            for prefix, event, _ in ijson.parse(source):
                if event == "start_array" and (
                    prefix == "" or prefix in JSON_ARRAY_FIELDS
                ):
                    return prefix
    except (OSError, ijson.JSONError) as exc:
        raise DataQualitySchemaError("Không đọc được cấu trúc JSON") from exc
    return None


def _json_record_values(record: Any, headers: list[str] | None = None) -> list[Any]:
    if isinstance(record, dict):
        return [record.get(name) for name in headers] if headers else list(record.values())
    if isinstance(record, (list, tuple)):
        return list(record)
    return [record]


@contextmanager
def _open_records(
    path: Path,
    file_format: str,
) -> Iterator[
    tuple[
        list[str],
        list[str],
        str,
        Iterator[tuple[int, list[Any], str | None]],
        int | None,
    ]
]:
    suffix = path.suffix.lower()
    format_name = file_format.lower()
    if suffix == ".csv" or format_name == "csv":
        try:
            source = path.open("r", encoding="utf-8-sig", newline="")
            first_line = source.readline(64 * 1024)
            source.seek(0)
            try:
                dialect = csv.Sniffer().sniff(first_line, delimiters=",;\t")
            except csv.Error:
                dialect = csv.excel()
                dialect.delimiter = max((",", ";", "\t"), key=first_line.count)
                if not first_line.count(dialect.delimiter):
                    dialect.delimiter = ","
            reader = csv.reader(source, dialect, strict=True)
            try:
                raw_headers = next(reader)
            except StopIteration as exc:
                source.close()
                raise DataQualitySchemaError("CSV rỗng, không có header") from exc
            headers, header_issues = _clean_headers(iter(raw_headers))
            is_pneuma = tuple(name.lower() for name in headers) == PNEUMA_HEADERS

            def csv_records() -> Iterator[tuple[int, list[Any], str | None]]:
                while True:
                    try:
                        values = next(reader)
                    except StopIteration:
                        return
                    except csv.Error as exc:
                        yield reader.line_num, [], str(exc)
                        continue
                    yield reader.line_num, values, None

            try:
                yield (
                    headers,
                    header_issues,
                    "pneuma_wide_trajectory" if is_pneuma else "tabular_csv",
                    csv_records(),
                    None,
                )
            finally:
                source.close()
            return
        except OSError as exc:
            raise DataQualitySchemaError("Không mở được file CSV") from exc

    if suffix == ".parquet" or format_name == "parquet":
        try:
            parquet_file = parquet.ParquetFile(path)
            schema = parquet_file.schema_arrow
            headers, header_issues = _clean_headers(iter(schema.names))

            def parquet_records() -> Iterator[tuple[int, list[Any], str | None]]:
                row_number = 2
                for batch in parquet_file.iter_batches(batch_size=2048):
                    for offset in range(batch.num_rows):
                        yield (
                            row_number,
                            [
                                batch.column(index)[offset].as_py()
                                for index in range(batch.num_columns)
                            ],
                            None,
                        )
                        row_number += 1

            yield headers, header_issues, "tabular_parquet", parquet_records(), parquet_file.metadata.num_rows
            return
        except (OSError, pa.ArrowException, ValueError) as exc:
            raise DataQualitySchemaError("Không đọc được schema Parquet") from exc

    if suffix == ".json" or format_name == "json":
        prefix = _json_array_prefix(path)
        if prefix is None:
            raise DataQualitySchemaError(
                "JSON cần là mảng records hoặc có mảng records/data/rows/results"
            )
        item_prefix = f"{prefix}.item" if prefix else "item"
        try:
            source = path.open("rb")
            iterator = iter(ijson.items(source, item_prefix))
            first_record = next(iterator, None)
            if first_record is None:
                source.close()
                raise DataQualitySchemaError("JSON không chứa records")
            if isinstance(first_record, dict):
                headers, header_issues = _clean_headers(iter(first_record.keys()))
            elif isinstance(first_record, (list, tuple)):
                headers, header_issues = _clean_headers(
                    iter(f"column_{index}" for index in range(1, len(first_record) + 1))
                )
            else:
                headers, header_issues = ["value"], []

            def json_records() -> Iterator[tuple[int, list[Any], str | None]]:
                yield 2, _json_record_values(first_record, headers), None
                for row_number, record in enumerate(iterator, start=3):
                    if isinstance(record, dict):
                        values = [record.get(name) for name in headers]
                        extra_keys = set(record) - set(headers)
                        missing_keys = set(headers) - set(record)
                        errors = []
                        if extra_keys:
                            extra_values = {
                                str(key): record[key]
                                for key in sorted(extra_keys, key=str)
                            }
                            values.append(
                                "__extra_fields__="
                                + json.dumps(extra_values, ensure_ascii=False, default=str)
                            )
                            errors.append(
                                "trường ngoài schema: "
                                + ", ".join(sorted(str(key) for key in extra_keys)[:10])
                            )
                        if missing_keys:
                            errors.append(
                                "thiếu trường: "
                                + ", ".join(sorted(str(key) for key in missing_keys)[:10])
                            )
                        parse_error = (
                            "JSON record " + "; ".join(errors) if errors else None
                        )
                        yield row_number, values, parse_error
                    else:
                        values = _json_record_values(record, headers)
                        parse_error = (
                            f"JSON record có {len(values)} trường, schema có {len(headers)}"
                            if len(values) != len(headers)
                            else None
                        )
                        yield row_number, values, parse_error

            try:
                yield headers, header_issues, "json_records", json_records(), None
            finally:
                source.close()
            return
        except (OSError, ijson.JSONError) as exc:
            raise DataQualitySchemaError("JSON records không hợp lệ") from exc

    if suffix == ".xlsx" or format_name == "xlsx":
        try:
            workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
            worksheet = workbook.active
            iterator = worksheet.iter_rows(values_only=True)
            raw_headers = next(iterator, ())
            headers, header_issues = _clean_headers(iter(raw_headers))

            def xlsx_records() -> Iterator[tuple[int, list[Any], str | None]]:
                for row_number, values in enumerate(iterator, start=2):
                    yield row_number, list(values), None

            try:
                yield headers, header_issues, "tabular_xlsx", xlsx_records(), worksheet.max_row - 1
            finally:
                workbook.close()
            return
        except (OSError, ValueError, StopIteration) as exc:
            raise DataQualitySchemaError("Không đọc được workbook XLSX") from exc

    if suffix == ".xls" or format_name == "xls":
        try:
            workbook = xlrd.open_workbook(path, on_demand=True)
            if workbook.nsheets == 0:
                raise DataQualitySchemaError("Excel không có worksheet")
            worksheet = workbook.sheet_by_index(0)
            headers, header_issues = _clean_headers(
                iter(worksheet.row_values(0) if worksheet.nrows else [])
            )

            def xls_records() -> Iterator[tuple[int, list[Any], str | None]]:
                for row_index in range(1, worksheet.nrows):
                    yield row_index + 1, worksheet.row_values(row_index), None

            try:
                yield headers, header_issues, "tabular_xls", xls_records(), worksheet.nrows - 1
            finally:
                workbook.release_resources()
            return
        except (OSError, xlrd.XLRDError, ValueError) as exc:
            raise DataQualitySchemaError("Không đọc được workbook XLS") from exc

    raise DataQualitySchemaError(
        f"Data Quality Check chưa hỗ trợ định dạng '{file_format}'"
    )


def _is_missing(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    return isinstance(value, str) and value.strip().lower() in NULL_TOKENS


def _value_kind(value: Any) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "integer" if value.is_integer() else "float"
    if isinstance(value, datetime):
        return "datetime"
    if isinstance(value, date):
        return "date"
    text_value = str(value).strip()
    if text_value.lower() in {"true", "false"}:
        return "boolean"
    try:
        int(text_value)
        return "integer"
    except ValueError:
        pass
    try:
        number = float(text_value)
        return "float" if math.isfinite(number) else "invalid"
    except (ValueError, TypeError):
        pass
    try:
        date.fromisoformat(text_value)
        return "date"
    except ValueError:
        pass
    try:
        datetime.fromisoformat(text_value)
        return "datetime"
    except ValueError:
        return "string"


def _infer_column_types(
    headers: list[str],
    sample: list[list[Any]],
    mappings: dict[str, str],
    is_pneuma: bool,
) -> dict[str, str]:
    result: dict[str, str] = {}
    numeric_names = {
        name.lower()
        for name in ("latitude", "lat", "longitude", "lon", "lng", "speed", "average_speed",
                     "avg_speed", "lon_acc", "lat_acc", "longitudinal_acceleration",
                     "lateral_acceleration", "x", "y", "timestamp", "time", "timestamp_ms")
    }
    for index, header in enumerate(headers):
        logical_name = mappings.get(header, header).lower()
        if is_pneuma or logical_name in numeric_names:
            result[header] = "number"
            continue
        kinds = Counter(
            _value_kind(row[index])
            for row in sample
            if index < len(row) and not _is_missing(row[index])
        )
        if not kinds:
            result[header] = "unknown"
            continue
        kind, count = kinds.most_common(1)[0]
        result[header] = (
            kind if kind != "invalid" and count / sum(kinds.values()) >= 0.7 else "unknown"
        )
    return result


def _parse_timestamp(value: Any) -> bool:
    if isinstance(value, bool) or value is None:
        return False
    if isinstance(value, (int, float)):
        return math.isfinite(float(value)) and value >= 0
    text_value = str(value).strip()
    try:
        number = float(text_value)
        return math.isfinite(number) and number >= 0
    except ValueError:
        pass
    try:
        datetime.fromisoformat(text_value)
        return True
    except ValueError:
        try:
            date.fromisoformat(text_value)
            return True
        except ValueError:
            return False


def _timestamp_order_value(value: Any) -> float | None:
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        try:
            parsed = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
            return parsed.timestamp()
        except (TypeError, ValueError, OverflowError):
            return None


def _parse_coordinate(value: Any, *, latitude: bool) -> tuple[bool, bool]:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return False, False
    if not math.isfinite(number):
        return False, False
    low, high = (-90, 90) if latitude else (-180, 180)
    return True, low <= number <= high


def _normalize_pneuma_trailing_delimiter(values: list[Any]) -> list[Any]:
    if (
        values
        and _is_missing(values[-1])
        and (len(values) - len(PNEUMA_HEADERS)) % len(PNEUMA_POINT_FIELDS) == 1
    ):
        return values[:-1]
    return values


def _string_value(value: Any) -> str:
    text_value = str(value)
    return text_value if len(text_value) <= 256 else text_value[:253] + "..."


def _semantic_sources(
    headers: list[str],
    mappings: dict[str, str],
) -> dict[str, str | None]:
    result: dict[str, str | None] = {}
    for semantic, aliases in ALIASES.items():
        result[semantic] = next(
            (
                source
                for source in headers
                if source.lower() in aliases
                or mappings.get(source, "").lower() in aliases
            ),
            None,
        )
    return result


def _run_check(
    check_id: UUID,
    path: Path,
    version: DatasetVersion,
    mappings: dict[str, str],
    *,
    outlier_rules: list[DataQualityOutlierRule] | None = None,
    session_id: UUID | None = None,
    finalize: bool = True,
    cross_session_hashes: sqlite3.Connection | None = None,
) -> dict[str, Any] | None:
    db = SessionLocal()
    temp_dir = tempfile.TemporaryDirectory(prefix="traffic-quality-")
    disk_state = sqlite3.connect(str(Path(temp_dir.name) / "quality_state.sqlite"))
    disk_state.execute("CREATE TABLE seen_hashes (digest BLOB PRIMARY KEY)")
    disk_state.execute(
        "CREATE TABLE track_timestamps (track_id TEXT PRIMARY KEY, timestamp REAL NOT NULL)"
    )
    disk_state.execute("CREATE TABLE affected_rows (row_number INTEGER PRIMARY KEY)")
    disk_state.execute(
        "CREATE TABLE issue_affected_rows "
        "(issue_type TEXT NOT NULL, row_number INTEGER NOT NULL, "
        "PRIMARY KEY(issue_type, row_number))"
    )
    try:
        check = db.query(DataQualityCheck).filter(DataQualityCheck.id == check_id).one()
        if finalize:
            check.status = "running"
            check.progress_percent = 1
            check.started_at = datetime.now(UTC)
            db.commit()

        error_totals: Counter[str] = Counter()
        column_errors: Counter[str] = Counter()
        warning_totals: Counter[str] = Counter()
        column_warnings: Counter[str] = Counter()
        rules_by_field = {rule.field: rule for rule in outlier_rules or []}
        missing_by_column: Counter[str] = Counter()
        total_values_by_column: Counter[str] = Counter()
        missing_required: list[str] = []
        schema_invalid = False
        total_rows = 0
        processed = 0
        pending_issues: list[dict[str, Any]] = []
        row_issue_types: set[str] = set()
        row_has_error = False
        last_progress_at = monotonic()

        with _open_records(path, version.file_format) as (
            headers,
            header_issues,
            structure,
            records,
            known_total,
        ):
            is_pneuma = structure == "pneuma_wide_trajectory"
            schema_invalid = bool(header_issues)
            logical_sources = _semantic_sources(headers, mappings)
            missing_required = [
                required
                for required in ("track_id", "timestamp")
                if logical_sources[required] is None
            ]
            schema_invalid = schema_invalid or bool(missing_required)
            # pNEUMA has a fixed numeric schema. Sampling 1,000 entire trajectories
            # delays all validation and can retain millions of point values in RAM.
            sample = [] if is_pneuma else list(islice(records, SAMPLE_ROWS))
            sample_values = [values for _, values, parse_error in sample if parse_error is None]
            expected_types = _infer_column_types(
                headers,
                sample_values,
                mappings,
                is_pneuma,
            )

            def flush_issues() -> None:
                crud_data_quality.insert_issues(db, pending_issues)
                pending_issues.clear()

            def publish_progress(*, force: bool = False) -> None:
                nonlocal last_progress_at
                now = monotonic()
                if not force and now - last_progress_at < PROGRESS_INTERVAL_SECONDS:
                    return
                flush_issues()
                current_check = db.query(DataQualityCheck).filter(
                    DataQualityCheck.id == check_id
                ).one()
                current_check.processed_rows = processed
                current_check.total_rows = known_total
                current_check.progress_percent = (
                    max(1, min(95, processed * 95 // known_total))
                    if known_total
                    else min(95, 5 + processed // PROGRESS_BATCH_SIZE)
                )
                db.commit()
                disk_state.commit()
                last_progress_at = now

            def add_issue(
                row_number: int | None,
                issue_type: str,
                column_name: str | None,
                message: str,
                observed_value: Any = None,
            ) -> None:
                nonlocal row_has_error
                pending_issues.append({
                    "check_id": check_id,
                    "recording_session_id": session_id,
                    "row_number": row_number,
                    "issue_type": issue_type,
                    "column_name": column_name,
                    "message": message[:512],
                    "observed_value": (
                        None if observed_value is None else _string_value(observed_value)
                    ),
                })
                is_warning = issue_type == "outlier"
                totals = warning_totals if is_warning else error_totals
                columns = column_warnings if is_warning else column_errors
                totals[issue_type] += 1
                if column_name:
                    columns[column_name] += 1
                if row_number is not None:
                    if not is_warning and not row_has_error:
                        disk_state.execute(
                            "INSERT OR IGNORE INTO affected_rows(row_number) VALUES (?)",
                            (row_number,),
                        )
                        row_has_error = True
                    if issue_type not in row_issue_types:
                        disk_state.execute(
                            "INSERT OR IGNORE INTO issue_affected_rows "
                            "(issue_type, row_number) VALUES (?, ?)",
                            (issue_type, row_number),
                        )
                        row_issue_types.add(issue_type)
                if len(pending_issues) >= DB_BATCH_SIZE:
                    flush_issues()
                    db.commit()
                    disk_state.commit()

            def check_outlier(
                row_number: int,
                column_name: str,
                field_name: str,
                value: Any,
                *,
                number: float | None = None,
            ) -> None:
                rule = rules_by_field.get(field_name)
                if rule is None or _is_missing(value) or isinstance(value, bool):
                    return
                if number is None:
                    try:
                        number = float(value)
                    except (TypeError, ValueError, OverflowError):
                        return
                if not math.isfinite(number):
                    return
                # Negative speeds remain errors, not duplicate outlier warnings.
                if field_name in {"speed", "avg_speed"} and number < 0:
                    return
                if (
                    rule.min_value is not None and number < rule.min_value
                    or rule.max_value is not None and number > rule.max_value
                ):
                    add_issue(
                        row_number,
                        "outlier",
                        column_name,
                        f"{field_name} ngoài ngưỡng cấu hình "
                        f"[{rule.min_value}, {rule.max_value}] {rule.unit}",
                        value,
                    )

            for header_issue in header_issues:
                add_issue(None, "invalid_format", None, header_issue)
            for required in missing_required:
                add_issue(
                    None,
                    "invalid_format",
                    None,
                    f"Thiếu cột bắt buộc '{required}' trong schema",
                )

            timestamp_source = logical_sources["timestamp"]
            track_id_source = logical_sources["track_id"]
            latitude_source = logical_sources["latitude"]
            longitude_source = logical_sources["longitude"]
            all_records = chain(sample, records)
            for row_number, raw_values, parse_error in all_records:
                total_rows += 1
                row_issue_types.clear()
                row_has_error = False
                if parse_error is not None:
                    add_issue(
                        row_number,
                        "invalid_format",
                        None,
                        "Dòng không khớp cú pháp hoặc schema của file",
                        parse_error,
                    )
                    if not raw_values:
                        processed += 1
                        publish_progress(force=processed % PROGRESS_BATCH_SIZE == 0)
                        continue

                values = list(raw_values)
                if is_pneuma:
                    values = _normalize_pneuma_trailing_delimiter(values)
                    if (
                        len(values) < len(PNEUMA_HEADERS)
                        or (len(values) - len(PNEUMA_HEADERS)) % len(PNEUMA_POINT_FIELDS)
                    ):
                        add_issue(
                            row_number,
                            "invalid_format",
                            None,
                            "Số trường không khớp cấu trúc pNEUMA wide trajectory",
                            len(values),
                        )
                    digest_values = values
                else:
                    if len(values) != len(headers) and parse_error is None:
                        add_issue(
                            row_number,
                            "invalid_format",
                            None,
                            f"Dòng có {len(values)} trường, header có {len(headers)}",
                            len(values),
                        )
                    digest_values = values

                digest = hashlib.sha256(
                    json.dumps(
                        digest_values,
                        ensure_ascii=False,
                        separators=(",", ":"),
                        default=str,
                    ).encode("utf-8")
                ).digest()
                inserted = disk_state.execute(
                    "INSERT OR IGNORE INTO seen_hashes(digest) VALUES (?)",
                    (digest,),
                ).rowcount
                if not inserted:
                    add_issue(
                        row_number,
                        "duplicate_record",
                        None,
                        "Bản ghi trùng hoàn toàn với một dòng trước đó",
                    )
                if cross_session_hashes is not None and session_id is not None:
                    prior = cross_session_hashes.execute(
                        "SELECT session_id FROM seen_session_hashes WHERE digest = ?",
                        (digest,),
                    ).fetchone()
                    if prior is None:
                        cross_session_hashes.execute(
                            "INSERT INTO seen_session_hashes(digest, session_id) VALUES (?, ?)",
                            (digest, str(session_id)),
                        )
                    elif prior[0] != str(session_id):
                        add_issue(
                            row_number,
                            "cross_session_duplicate",
                            None,
                            "Bản ghi trùng hoàn toàn với dữ liệu ở một Recording Session khác",
                        )

                if is_pneuma:
                    # Mirror dataset_preview_service: floor division starting from
                    # len(PNEUMA_HEADERS)=10 so the first point group (indices 4-9)
                    # is counted as point 1, additional groups start at index 10.
                    point_count = (
                        1 + (len(values) - len(PNEUMA_HEADERS)) // len(PNEUMA_POINT_FIELDS)
                        if len(values) >= len(PNEUMA_HEADERS)
                        else 0
                    )
                    for field_index, field_name in enumerate(PNEUMA_HEADERS[:4]):
                        value = values[field_index] if field_index < len(values) else None
                        total_values_by_column[field_name] += 1
                        if _is_missing(value):
                            missing_by_column[field_name] += 1
                            add_issue(
                                row_number,
                                "missing_value",
                                field_name,
                                "Giá trị bị thiếu",
                                value,
                            )
                        elif field_name in {"track_id", "traveled_d", "avg_speed"}:
                            try:
                                number = float(value)
                                valid_number = math.isfinite(number)
                                if field_name == "track_id":
                                    valid_number = valid_number and number.is_integer()
                            except (TypeError, ValueError):
                                valid_number = False
                            if not valid_number:
                                add_issue(
                                    row_number,
                                    "invalid_format",
                                    field_name,
                                    "Giá trị không khớp kiểu dữ liệu pNEUMA",
                                    value,
                                )
                            elif field_name == "avg_speed" and number < 0:
                                add_issue(
                                    row_number,
                                    "negative_speed",
                                    field_name,
                                    "Tốc độ phải >= 0",
                                    value,
                                )
                            if valid_number and field_name in rules_by_field:
                                check_outlier(
                                    row_number, field_name, field_name, value, number=number
                                )
                    point_start = 4
                    validated_until = 0
                    for point_index in range(point_count):
                        if point_index and point_index % PROGRESS_POINT_BATCH_SIZE == 0:
                            publish_progress()
                        start = point_start + point_index * len(PNEUMA_POINT_FIELDS)
                        point_values = values[start : start + len(PNEUMA_POINT_FIELDS)]
                        if point_index > 0:
                            previous_time_index = start - len(PNEUMA_POINT_FIELDS) + 5
                            current_time_index = start + 5
                            try:
                                previous_time = float(values[previous_time_index])
                                current_time = float(values[current_time_index])
                            except (IndexError, TypeError, ValueError):
                                previous_time = current_time = None
                            if (
                                previous_time is not None
                                and current_time is not None
                                and math.isfinite(previous_time)
                                and math.isfinite(current_time)
                                and current_time <= previous_time
                            ):
                                add_issue(
                                    row_number,
                                    "invalid_trajectory",
                                    "time",
                                    "Timestamp các điểm trong trajectory phải tăng dần",
                                    current_time,
                                )
                        if point_index < validated_until:
                            continue
                        if point_index % PROGRESS_POINT_BATCH_SIZE == 0:
                            block_end = min(point_count, point_index + PROGRESS_POINT_BATCH_SIZE)
                            if clean_point_block(
                                values, point_start + point_index * 6,
                                point_start + block_end * 6, rules_by_field,
                            ):
                                for field_name in PNEUMA_POINT_FIELDS:
                                    total_values_by_column[field_name] += block_end - point_index
                                validated_until = block_end
                                continue
                        if len(point_values) < len(PNEUMA_POINT_FIELDS):
                            add_issue(
                                row_number,
                                "invalid_format",
                                None,
                                "Nhóm điểm quỹ đạo pNEUMA không đủ 6 trường",
                                len(point_values),
                            )
                        for field_offset, field_name in enumerate(PNEUMA_POINT_FIELDS):
                            value = (
                                point_values[field_offset]
                                if field_offset < len(point_values)
                                else None
                            )
                            total_values_by_column[field_name] += 1
                            if _is_missing(value):
                                missing_by_column[field_name] += 1
                                add_issue(
                                    row_number,
                                    "missing_value",
                                    field_name,
                                    "Giá trị điểm quỹ đạo bị thiếu",
                                    value,
                                )
                                continue
                            try:
                                number = float(value)
                                valid_number = math.isfinite(number)
                            except (TypeError, ValueError):
                                valid_number = False
                                number = 0
                            if not valid_number:
                                issue_type = (
                                    "invalid_timestamp"
                                    if field_name == "time"
                                    else "invalid_coordinate"
                                    if field_name in {"lat", "lon"}
                                    else "invalid_format"
                                )
                                add_issue(
                                    row_number,
                                    issue_type,
                                    field_name,
                                    "Giá trị không phải số hữu hạn",
                                    value,
                                )
                            elif field_name == "speed" and number < 0:
                                add_issue(
                                    row_number,
                                    "negative_speed",
                                    field_name,
                                    "Tốc độ phải >= 0",
                                    value,
                                )
                            elif field_name == "time" and number < 0:
                                add_issue(
                                    row_number,
                                    "invalid_timestamp",
                                    field_name,
                                    "Thời gian pNEUMA tương đối phải >= 0 giây",
                                    value,
                                )
                            elif field_name in {"lat", "lon"}:
                                limit = 90 if field_name == "lat" else 180
                                if not -limit <= number <= limit:
                                    add_issue(
                                        row_number,
                                        "invalid_coordinate",
                                        field_name,
                                        f"Giá trị nằm ngoài miền [-{limit}, {limit}]",
                                        value,
                                    )
                            if valid_number and field_name in rules_by_field:
                                check_outlier(
                                    row_number, field_name, field_name, value, number=number
                                )
                else:
                    row = {
                        header: values[index] if index < len(values) else None
                        for index, header in enumerate(headers)
                    }
                    for header in headers:
                        value = row[header]
                        total_values_by_column[header] += 1
                        if _is_missing(value):
                            missing_by_column[header] += 1
                            add_issue(
                                row_number,
                                "missing_value",
                                header,
                                "Giá trị bị thiếu",
                                value,
                            )
                            continue

                        logical_name = mappings.get(header, header).lower()
                        if header == timestamp_source and not _parse_timestamp(value):
                            add_issue(
                                row_number,
                                "invalid_timestamp",
                                header,
                                "Timestamp không đúng định dạng hoặc miền giá trị",
                                value,
                            )
                        elif header == latitude_source or logical_name in ALIASES["latitude"]:
                            numeric, in_bounds = _parse_coordinate(value, latitude=True)
                            if not numeric or not in_bounds:
                                add_issue(
                                    row_number,
                                    "invalid_coordinate",
                                    header,
                                    "Latitude phải là số trong [-90, 90]",
                                    value,
                                )
                        elif header == longitude_source or logical_name in ALIASES["longitude"]:
                            numeric, in_bounds = _parse_coordinate(value, latitude=False)
                            if not numeric or not in_bounds:
                                add_issue(
                                    row_number,
                                    "invalid_coordinate",
                                    header,
                                    "Longitude phải là số trong [-180, 180]",
                                    value,
                                )
                        elif (
                            expected_types.get(header) != "unknown"
                            and not _value_matches_type(
                                value,
                                expected_types.get(header, "unknown"),
                            )
                        ):
                            add_issue(
                                row_number,
                                "invalid_format",
                                header,
                                "Giá trị không khớp kiểu dữ liệu suy luận",
                                value,
                            )

                        # Preserve source column names and validate finiteness before sign.
                        if (
                            {header.lower(), logical_name} & {"speed", "avg_speed"}
                            and _value_matches_type(value, "number")
                            and float(value) < 0
                        ):
                            add_issue(
                                row_number,
                                "negative_speed",
                                header,
                                "Tốc độ phải >= 0",
                                value,
                            )

                        # Mapping takes precedence; retain canonical source names as fallback.
                        outlier_field = (
                            logical_name if logical_name in OUTLIER_FIELDS else header.lower()
                        )
                        if outlier_field in rules_by_field:
                            check_outlier(row_number, header, outlier_field, value)

                    if track_id_source and timestamp_source:
                        track_value = row.get(track_id_source)
                        timestamp_value = _timestamp_order_value(row.get(timestamp_source))
                        if not _is_missing(track_value) and timestamp_value is not None:
                            track_key = str(track_value).strip()
                            previous = disk_state.execute(
                                "SELECT timestamp FROM track_timestamps WHERE track_id = ?",
                                (track_key,),
                            ).fetchone()
                            if previous is not None and timestamp_value <= previous[0]:
                                add_issue(
                                    row_number,
                                    "invalid_trajectory",
                                    timestamp_source,
                                    "Timestamp phải tăng dần trong cùng một track của session",
                                    row.get(timestamp_source),
                                )
                            disk_state.execute(
                                "INSERT INTO track_timestamps(track_id, timestamp) VALUES (?, ?) "
                                "ON CONFLICT(track_id) DO UPDATE SET timestamp = excluded.timestamp",
                                (track_key, timestamp_value),
                            )

                processed += 1
                publish_progress(force=processed % PROGRESS_BATCH_SIZE == 0)

            flush_issues()
        db.commit()
        disk_state.commit()
        affected_total = disk_state.execute(
            "SELECT COUNT(*) FROM affected_rows"
        ).fetchone()[0]
        errors_by_type: dict[str, DataQualityIssueCount] = {}
        for issue_type, count in error_totals.items():
            type_affected = disk_state.execute(
                "SELECT COUNT(*) FROM issue_affected_rows WHERE issue_type = ?",
                (issue_type,),
            ).fetchone()[0]
            if schema_invalid and issue_type == "invalid_format":
                type_affected = max(type_affected, total_rows)
            errors_by_type[issue_type] = DataQualityIssueCount(
                total_errors=count,
                affected_rows=type_affected,
            )
        if schema_invalid:
            affected_total = max(affected_total, total_rows)

        warning_rows = disk_state.execute(
            "SELECT COUNT(DISTINCT row_number) FROM issue_affected_rows "
            "WHERE issue_type = 'outlier'"
        ).fetchone()[0]

        column_summary = [
            DataQualityColumnCount(
                column_name=name,
                missing_values=missing_by_column[name],
                total_values=total_values_by_column[name],
                missing_percent=round(
                    missing_by_column[name] * 100 / total_values_by_column[name], 2
                )
                if total_values_by_column[name]
                else 0,
                errors=column_errors[name],
            )
            for name in sorted(set(total_values_by_column) | set(column_errors))
        ]
        report = {
            "dataset_id": str(check.dataset_id),
            "dataset_version_id": str(check.dataset_version_id),
            "status": "completed",
            "validation_status": (
                "FAIL" if sum(error_totals.values())
                else "WARNING" if sum(warning_totals.values())
                else "PASS"
            ),
            "session_id": str(session_id) if session_id else None,
            "detected_structure": structure,
            "source_columns": headers,
            "total_rows": total_rows,
            "valid_rows": max(0, total_rows - affected_total),
            "invalid_rows": min(total_rows, affected_total),
            "total_errors": sum(error_totals.values()),
            "total_warnings": sum(warning_totals.values()),
            "warning_rows": warning_rows,
            "warnings_by_type": {
                "outlier": {
                    "total_warnings": warning_totals["outlier"],
                    "affected_rows": warning_rows,
                }
            } if warning_totals else {},
            "warnings_by_column": dict(column_warnings),
            "outlier_rules": [rule.model_dump() for rule in outlier_rules or []],
            "errors_by_type": {
                issue_type: count.model_dump()
                for issue_type, count in errors_by_type.items()
            },
            "errors_by_column": [item.model_dump() for item in column_summary],
            "missing_values_by_column": [
                item.model_dump()
                for item in column_summary
                if item.missing_values or item.total_values
            ],
            "missing_required_columns": missing_required,
            "generated_at": datetime.now(UTC).isoformat(),
        }
        check = db.query(DataQualityCheck).filter(DataQualityCheck.id == check_id).one()
        if finalize:
            check.status = "completed"
            check.progress_percent = 100
            check.processed_rows = total_rows
            check.total_rows = total_rows
            check.report = report
            check.completed_at = datetime.now(UTC)
        db.commit()
        return report
    except Exception as exc:
        db.rollback()
        logger.exception(
            "Data quality check failed",
            extra={"check_id": str(check_id), "dataset_version_id": str(version.id)},
        )
        if finalize:
            failed = db.query(DataQualityCheck).filter(DataQualityCheck.id == check_id).one_or_none()
            if failed is not None:
                failed.status = "failed"
                failed.error_message = (
                    str(exc)[:1000]
                    if isinstance(exc, (DataQualitySchemaError, OSError, ValueError))
                    else "Tác vụ kiểm tra chất lượng thất bại; xem log server theo check_id"
                )
                failed.completed_at = datetime.now(UTC)
                db.commit()
        else:
            raise
    finally:
        disk_state.close()
        temp_dir.cleanup()
        db.close()


def _session_summary(
    check_id: UUID,
    session: RecordingSession,
    report: dict[str, Any],
) -> dict[str, Any]:
    errors = int(report.get("total_errors", 0))
    warnings = int(report.get("total_warnings", 0))
    status = "FAIL" if errors else "WARNING" if warnings else "PASS"
    return {
        "session_id": str(session.id),
        "source_check_id": str(check_id),
        "original_filename": session.original_filename,
        "detected_structure": report.get("detected_structure", "unknown"),
        "validation_status": status,
        "total_rows": int(report.get("total_rows", 0)),
        "valid_rows": int(report.get("valid_rows", 0)),
        "invalid_rows": int(report.get("invalid_rows", 0)),
        "total_errors": errors,
        "total_warnings": warnings,
        "warning_rows": int(report.get("warning_rows", 0)),
        "missing_required_columns": report.get("missing_required_columns", []),
        "errors_by_type": report.get("errors_by_type", {}),
        "errors_by_column": report.get("errors_by_column", []),
        "missing_values_by_column": report.get("missing_values_by_column", []),
        "warnings_by_column": report.get("warnings_by_column", {}),
        "warnings_by_type": report.get("warnings_by_type", {}),
        "source_columns": report.get("source_columns", []),
    }


def _populate_cross_session_hashes(
    connection: sqlite3.Connection,
    sessions: list[RecordingSession],
    *,
    skip_session_id: UUID,
    version: DatasetVersion,
) -> None:
    """Stream other sessions into a disk-backed digest index for single-session rechecks."""
    for session in sessions:
        if session.id == skip_session_id:
            continue
        try:
            path = resolve_stored_file_path(session.file_path)
            with _open_records(path, version.file_format) as (
                _, _, structure, records, _,
            ):
                for _, values, parse_error in records:
                    if parse_error is not None or not values:
                        continue
                    digest_values = (
                        _normalize_pneuma_trailing_delimiter(list(values))
                        if structure == "pneuma_wide_trajectory"
                        else values
                    )
                    digest = hashlib.sha256(
                        json.dumps(
                            digest_values,
                            ensure_ascii=False,
                            separators=(",", ":"),
                            default=str,
                        ).encode("utf-8")
                    ).digest()
                    connection.execute(
                        "INSERT OR IGNORE INTO seen_session_hashes(digest, session_id) "
                        "VALUES (?, ?)",
                        (digest, str(session.id)),
                    )
        except (DataQualitySchemaError, OSError, ValueError):
            logger.warning(
                "Skipped cross-session digest indexing for unreadable session",
                extra={"session_id": str(session.id)},
                exc_info=True,
            )
    connection.commit()


def _add_cross_session_issue(
    db: Session,
    *,
    check_id: UUID,
    session_id: UUID,
    issue_type: str,
    message: str,
    summaries: dict[str, dict[str, Any]],
    severity: str = "error",
) -> None:
    crud_data_quality.insert_issues(db, [{
        "check_id": check_id,
        "recording_session_id": session_id,
        "row_number": None,
        "issue_type": issue_type,
        "column_name": None,
        "message": message[:512],
        "observed_value": None,
    }])
    summary = summaries.get(str(session_id))
    if summary is None:
        return
    if severity == "warning":
        summary["total_warnings"] += 1
        warning_counts = summary.setdefault("warnings_by_type", {})
        warning_count = warning_counts.setdefault(
            issue_type, {"total_warnings": 0, "affected_rows": 0},
        )
        warning_count["total_warnings"] += 1
        if summary["validation_status"] == "PASS":
            summary["validation_status"] = "WARNING"
        return
    summary["total_errors"] += 1
    summary["validation_status"] = "FAIL"
    errors_by_type = summary.setdefault("errors_by_type", {})
    count = errors_by_type.setdefault(issue_type, {"total_errors": 0, "affected_rows": 0})
    count["total_errors"] += 1


def _aggregate_session_report(
    *,
    check: DataQualityCheck,
    summaries: list[dict[str, Any]],
    total_sessions: int,
    outlier_rules: list[DataQualityOutlierRule] | None,
) -> dict[str, Any]:
    counts = {"PASS": 0, "WARNING": 0, "FAIL": 0}
    errors_by_type: dict[str, dict[str, int]] = {}
    warnings_by_type: dict[str, dict[str, int]] = {}
    column_totals: dict[str, dict[str, int]] = {}
    warnings_by_column: Counter[str] = Counter()
    missing_required: set[str] = set()
    for summary in summaries:
        status = summary["validation_status"]
        counts[status] += 1
        missing_required.update(summary.get("missing_required_columns", []))
        warnings_by_column.update(summary.get("warnings_by_column", {}))
        for issue_type, value in summary.get("warnings_by_type", {}).items():
            count = warnings_by_type.setdefault(
                issue_type, {"total_warnings": 0, "affected_rows": 0},
            )
            count["total_warnings"] += int(value.get("total_warnings", 0))
            count["affected_rows"] += int(value.get("affected_rows", 0))
        for issue_type, value in summary.get("errors_by_type", {}).items():
            count = errors_by_type.setdefault(
                issue_type, {"total_errors": 0, "affected_rows": 0},
            )
            count["total_errors"] += int(value.get("total_errors", 0))
            count["affected_rows"] += int(value.get("affected_rows", 0))
        for item in summary.get("errors_by_column", []):
            values = column_totals.setdefault(item["column_name"], {
                "missing_values": 0, "total_values": 0, "errors": 0,
            })
            for field in values:
                values[field] += int(item.get(field, 0))

    columns = [
        {
            "column_name": name,
            **values,
            "missing_percent": round(values["missing_values"] * 100 / values["total_values"], 2)
            if values["total_values"] else 0,
        }
        for name, values in sorted(column_totals.items())
    ]
    total_rows = sum(int(item.get("total_rows", 0)) for item in summaries)
    valid_rows = sum(int(item.get("valid_rows", 0)) for item in summaries)
    invalid_rows = sum(int(item.get("invalid_rows", 0)) for item in summaries)
    total_errors = sum(int(item.get("total_errors", 0)) for item in summaries)
    total_warnings = sum(int(item.get("total_warnings", 0)) for item in summaries)
    status = (
        "FAIL" if counts["FAIL"]
        else "WARNING" if counts["WARNING"] or len(summaries) < total_sessions
        else "PASS"
    )
    structures = sorted({item.get("detected_structure", "unknown") for item in summaries})
    return {
        "dataset_id": str(check.dataset_id),
        "dataset_version_id": str(check.dataset_version_id),
        "status": "completed",
        "validation_status": status,
        "session_id": str(check.recording_session_id) if check.recording_session_id else None,
        "session_counts": counts,
        "total_sessions": total_sessions,
        "sessions_checked": len(summaries),
        "unchecked_session_count": max(0, total_sessions - len(summaries)),
        "sessions": summaries,
        "detected_structure": structures[0] if len(structures) == 1 else "mixed",
        "total_rows": total_rows,
        "valid_rows": valid_rows,
        "invalid_rows": invalid_rows,
        "total_errors": total_errors,
        "total_warnings": total_warnings,
        "warning_rows": sum(int(item.get("warning_rows", 0)) for item in summaries),
        "warnings_by_type": warnings_by_type,
        "warnings_by_column": dict(warnings_by_column),
        "outlier_rules": [rule.model_dump() for rule in outlier_rules or []],
        "errors_by_type": errors_by_type,
        "errors_by_column": columns,
        "missing_values_by_column": columns,
        "missing_required_columns": sorted(missing_required),
        "generated_at": datetime.now(UTC).isoformat(),
    }


def run_data_quality_check(
    check_id: UUID,
    *,
    outlier_rules: list[DataQualityOutlierRule] | None = None,
) -> None:
    db = SessionLocal()
    cross_temp: tempfile.TemporaryDirectory[str] | None = None
    cross_hashes: sqlite3.Connection | None = None
    try:
        check = db.query(DataQualityCheck).filter(DataQualityCheck.id == check_id).one_or_none()
        if check is None:
            raise DataQualityNotFoundError("Không tìm thấy tác vụ kiểm tra chất lượng")
        result = crud_dataset.get_dataset_version(
            db, check.dataset_id, check.dataset_version_id,
        )
        if result is None:
            raise DataQualityNotFoundError("Không tìm thấy phiên bản Dataset được kiểm tra")
        dataset, version = result
        sessions = crud_dataset.list_all_version_sessions(db, version.id)
        mappings = _get_mappings(db, check.dataset_id, version.id)
        check.status = "running"
        check.progress_percent = 1
        check.started_at = datetime.now(UTC)
        db.commit()

        if not sessions:
            path = _version_path(version)
            _run_check(
                check_id, path, version, mappings,
                outlier_rules=outlier_rules,
                session_id=check.recording_session_id,
                finalize=True,
            )
            return

        if check.recording_session_id is not None:
            selected = next(
                (item for item in sessions if item.id == check.recording_session_id), None,
            )
            if selected is None:
                raise DataQualityNotFoundError("Session không còn thuộc Dataset Version này")
            targets = [selected]
            cross_temp = tempfile.TemporaryDirectory(prefix="traffic-quality-cross-")
            cross_hashes = sqlite3.connect(str(Path(cross_temp.name) / "cross_hashes.sqlite"))
            cross_hashes.execute(
                "CREATE TABLE seen_session_hashes (digest BLOB PRIMARY KEY, session_id TEXT NOT NULL)"
            )
            _populate_cross_session_hashes(
                cross_hashes, sessions,
                skip_session_id=selected.id,
                version=version,
            )
        else:
            targets = sessions
            cross_temp = tempfile.TemporaryDirectory(prefix="traffic-quality-cross-")
            cross_hashes = sqlite3.connect(str(Path(cross_temp.name) / "cross_hashes.sqlite"))
            cross_hashes.execute(
                "CREATE TABLE seen_session_hashes (digest BLOB PRIMARY KEY, session_id TEXT NOT NULL)"
            )

        prior = check.report if isinstance(check.report, dict) else {}
        summaries_by_id = {
            str(item.get("session_id")): item
            for item in prior.get("base_session_results", [])
            if item.get("session_id")
        }
        processed_total = 0
        for index, session in enumerate(targets):
            db.refresh(check)
            check.progress_percent = max(1, min(90, int(index * 90 / len(targets)) + 1))
            db.commit()
            try:
                path = resolve_stored_file_path(session.file_path)
                report = _run_check(
                    check_id, path, version, mappings,
                    outlier_rules=outlier_rules,
                    session_id=session.id,
                    finalize=False,
                    cross_session_hashes=cross_hashes,
                )
            except (DataQualitySchemaError, DataQualityNotFoundError, OSError, ValueError) as exc:
                error_message = f"Không thể đọc session {session.original_filename}: {exc}"
                summaries_by_id[str(session.id)] = {
                    "session_id": str(session.id),
                    "source_check_id": str(check_id),
                    "original_filename": session.original_filename,
                    "detected_structure": "unknown",
                    "validation_status": "FAIL",
                    "total_rows": 0,
                    "valid_rows": 0,
                    "invalid_rows": 0,
                    "total_errors": 1,
                    "total_warnings": 0,
                    "warning_rows": 0,
                    "missing_required_columns": [],
                    "errors_by_type": {
                        "file_unreadable": {"total_errors": 1, "affected_rows": 0},
                    },
                    "errors_by_column": [],
                    "missing_values_by_column": [],
                    "warnings_by_column": {},
                    "warnings_by_type": {},
                    "source_columns": [],
                }
                crud_data_quality.insert_issues(db, [{
                    "check_id": check_id,
                    "recording_session_id": session.id,
                    "row_number": None,
                    "issue_type": "file_unreadable",
                    "column_name": None,
                    "message": error_message[:512],
                    "observed_value": None,
                }])
                db.commit()
                continue
            if report is None:
                raise DataQualitySchemaError("Không tạo được báo cáo cho session")
            summaries_by_id[str(session.id)] = _session_summary(check_id, session, report)
            processed_total += int(report.get("total_rows", 0))
            if cross_hashes is not None:
                cross_hashes.commit()

        reference_columns: list[str] | None = None
        for session in sessions:
            summary = summaries_by_id.get(str(session.id))
            if summary is None:
                continue
            source_columns = summary.get("source_columns", [])
            if not source_columns:
                continue
            if reference_columns is None:
                reference_columns = source_columns
            elif source_columns != reference_columns:
                _add_cross_session_issue(
                    db, check_id=check_id, session_id=session.id,
                    issue_type="schema_inconsistent",
                    message="Danh sách cột khác với các Recording Session cùng Dataset Version",
                    summaries=summaries_by_id,
                )
            if set(mappings) - set(source_columns):
                _add_cross_session_issue(
                    db, check_id=check_id, session_id=session.id,
                    issue_type="mapping_inconsistent",
                    message="Column Mapping có cột nguồn không tồn tại trong session này",
                    summaries=summaries_by_id,
                )

        # Run cross-session metadata checks independently of row-level checks.
        seen_checksums: dict[str, RecordingSession] = {}
        seen_filenames: dict[str, RecordingSession] = {}
        for session in sessions:
            summary = summaries_by_id.get(str(session.id))
            if dataset.drone_id and session.drone_id != dataset.drone_id:
                _add_cross_session_issue(
                    db, check_id=check_id, session_id=session.id,
                    issue_type="session_metadata_mismatch",
                    message=f"Drone ID {session.drone_id} không khớp Dataset {dataset.drone_id}",
                    summaries=summaries_by_id,
                )
            if dataset.recording_date and session.recording_date != dataset.recording_date:
                _add_cross_session_issue(
                    db, check_id=check_id, session_id=session.id,
                    issue_type="session_metadata_mismatch",
                    message="Recording date không khớp ngày của Dataset",
                    summaries=summaries_by_id,
                )
            checksum_prior = seen_checksums.get(session.checksum)
            filename_prior = seen_filenames.get(session.original_filename.casefold())
            if checksum_prior is not None and checksum_prior.id != session.id:
                _add_cross_session_issue(
                    db, check_id=check_id, session_id=session.id,
                    issue_type="duplicate_file",
                    message=f"Nội dung file trùng với {checksum_prior.original_filename}",
                    summaries=summaries_by_id,
                )
            if filename_prior is not None and filename_prior.id != session.id:
                _add_cross_session_issue(
                    db, check_id=check_id, session_id=session.id,
                    issue_type="duplicate_file",
                    message=f"Tên file trùng với {filename_prior.original_filename}",
                    summaries=summaries_by_id,
                )
            seen_checksums.setdefault(session.checksum, session)
            seen_filenames.setdefault(session.original_filename.casefold(), session)

        chronological = sorted(sessions, key=lambda item: (item.scheduled_start, item.scheduled_end))
        for position, session in enumerate(chronological):
            for other in chronological[:position]:
                if other.scheduled_end > session.scheduled_start:
                    _add_cross_session_issue(
                        db, check_id=check_id, session_id=session.id,
                        issue_type="cross_session_overlap",
                        message=(
                            f"Khoảng thời gian chồng lấn với {other.original_filename}; "
                            "các session vẫn được kiểm tra độc lập"
                        ),
                        summaries=summaries_by_id,
                        severity="warning",
                    )

        db.flush()
        summaries = list(summaries_by_id.values())
        aggregate = _aggregate_session_report(
            check=check,
            summaries=summaries,
            total_sessions=len(sessions),
            outlier_rules=outlier_rules,
        )
        check = db.query(DataQualityCheck).filter(DataQualityCheck.id == check_id).one()
        check.status = "completed"
        check.progress_percent = 100
        check.processed_rows = processed_total
        check.total_rows = aggregate["total_rows"]
        check.report = aggregate
        check.error_message = None
        check.completed_at = datetime.now(UTC)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.exception("Could not start data quality worker", extra={"check_id": str(check_id)})
        check = db.query(DataQualityCheck).filter(DataQualityCheck.id == check_id).one_or_none()
        if check is not None and check.status in {"queued", "running"}:
            check.status = "failed"
            check.error_message = (
                str(exc)[:1000]
                if isinstance(exc, (DataQualitySchemaError, DataQualityNotFoundError, OSError, ValueError))
                else "Không thể khởi chạy tác vụ kiểm tra chất lượng"
            )
            check.completed_at = datetime.now(UTC)
            db.commit()
    finally:
        if cross_hashes is not None:
            cross_hashes.close()
        if cross_temp is not None:
            cross_temp.cleanup()
        db.close()
