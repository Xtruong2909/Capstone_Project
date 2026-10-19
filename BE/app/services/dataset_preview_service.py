import bisect
import csv
import json
import logging
import math
import os
import re
import sys
import tempfile
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, BinaryIO
from uuid import UUID

import ijson
import openpyxl
import pyarrow as pa
import xlrd
from openpyxl.utils.exceptions import InvalidFileException
from pyarrow import parquet
from sqlalchemy.orm import Session

from app.core.config import DATASET_UPLOAD_DIR, MAX_DATASET_UPLOAD_BYTES
from app.crud import crud_dataset
from app.models.dataset import DatasetVersion
from app.schemas.dataset import (
    DatasetPreviewColumn,
    DatasetPreviewPagination,
    DatasetPreviewResponse,
)

MAX_COLUMNS = 512
JSON_ARRAY_FIELDS = {"data", "rows", "records", "results"}
INTEGER_PATTERN = re.compile(r"^[+-]?\d+$")
HEADER_TOKEN_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_. -]*$")
PNEUMA_HEADERS = (
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
)
PNEUMA_POINT_FIELDS = ("lat", "lon", "speed", "lon_acc", "lat_acc", "time")
csv.field_size_limit(min(MAX_DATASET_UPLOAD_BYTES, sys.maxsize))
logger = logging.getLogger(__name__)


class DatasetPreviewNotFoundError(FileNotFoundError):
    """Raised when a dataset or its stored file cannot be found."""


class DatasetPreviewFormatError(ValueError):
    """Raised when a stored dataset format cannot be previewed."""


class DatasetPreviewReadError(ValueError):
    """Raised when a stored dataset file cannot be parsed."""


@dataclass
class DatasetPreviewData:
    columns: list[DatasetPreviewColumn]
    rows: list[dict[str, Any]]
    has_more: bool
    detected_structure: str
    representation: str
    warnings: list[str]
    total_rows: int | None = None


def _resolve_file_path(version: DatasetVersion) -> Path:
    stored_path = (
        version.data_file_path
        or version.csv_file_path
        or version.parquet_file_path
        or version.geojson_file_path
    )
    if not stored_path:
        raise DatasetPreviewNotFoundError("Dataset version không có đường dẫn file")

    upload_root = DATASET_UPLOAD_DIR.resolve()
    candidate = Path(stored_path)
    if not candidate.is_absolute():
        candidate = upload_root / candidate
    resolved_path = candidate.resolve()
    try:
        resolved_path.relative_to(upload_root)
    except ValueError as exc:
        raise DatasetPreviewNotFoundError("Đường dẫn file dataset không hợp lệ") from exc
    if not resolved_path.is_file():
        raise DatasetPreviewNotFoundError("Không tìm thấy file dataset trong kho lưu trữ")
    return resolved_path


def _headers(values: Iterator[Any]) -> list[str]:
    result: list[str] = []
    name_counts: dict[str, int] = {}
    for index, value in enumerate(values, start=1):
        name = str(value).strip() if value is not None else ""
        if not name:
            name = f"column_{index}"
        name_counts[name] = name_counts.get(name, 0) + 1
        result.append(name if name_counts[name] == 1 else f"{name}_{name_counts[name]}")
    if len(result) > MAX_COLUMNS:
        raise DatasetPreviewReadError(f"Dataset có quá nhiều cột (tối đa {MAX_COLUMNS})")
    return result


def _record_from_values(headers: list[str], values: list[Any]) -> dict[str, Any]:
    record = {
        name: _json_safe(value)
        for name, value in zip(headers, values[: len(headers)], strict=False)
    }
    if len(values) < len(headers):
        record.update({name: None for name in headers[len(values) :]})
    if len(values) > len(headers):
        record["extra_values"] = [_json_safe(value) for value in values[len(headers) :]]
    return record


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if hasattr(value, "as_py"):
        return _json_safe(value.as_py())
    if value.__class__.__module__ == "decimal":
        return int(value) if value == int(value) else float(value)
    return value


def _infer_value_type(values: list[Any]) -> str:
    observed = [value for value in values if value is not None and value != ""]
    if not observed:
        return "unknown"
    if any(isinstance(value, (list, tuple)) for value in observed):
        return "array"
    if any(isinstance(value, dict) for value in observed):
        return "object"
    if all(isinstance(value, bool) for value in observed):
        return "boolean"
    if all(isinstance(value, (int, float)) and not isinstance(value, bool) for value in observed):
        return "float" if any(isinstance(value, float) for value in observed) else "integer"
    if all(isinstance(value, datetime) for value in observed):
        return "datetime"
    if all(isinstance(value, date) for value in observed):
        return "date"

    text_values = [str(value).strip() for value in observed]
    if all(INTEGER_PATTERN.fullmatch(value) for value in text_values):
        return "integer"
    try:
        for value in text_values:
            float(value)
        return "float"
    except ValueError:
        pass
    try:
        for value in text_values:
            date.fromisoformat(value)
        return "date"
    except ValueError:
        return "string"


def _coerce_csv_records(
    records: list[dict[str, Any]],
    columns: list[DatasetPreviewColumn],
) -> tuple[list[dict[str, Any]], int]:
    column_types = {column.name: column.type for column in columns}
    coerced_records: list[dict[str, Any]] = []
    conversion_errors = 0
    for record in records:
        coerced: dict[str, Any] = {}
        for name, value in record.items():
            if value == "":
                coerced[name] = None
            elif column_types.get(name) == "integer":
                try:
                    coerced[name] = int(value)
                except (TypeError, ValueError):
                    coerced[name] = value
                    conversion_errors += 1
            elif column_types.get(name) == "float":
                try:
                    coerced[name] = float(value)
                except (TypeError, ValueError):
                    coerced[name] = value
                    conversion_errors += 1
            elif column_types.get(name) == "date":
                try:
                    coerced[name] = date.fromisoformat(value)
                except (TypeError, ValueError):
                    coerced[name] = value
                    conversion_errors += 1
            elif column_types.get(name) == "boolean":
                normalized = str(value).strip().lower()
                if normalized in {"true", "false"}:
                    coerced[name] = normalized == "true"
                else:
                    coerced[name] = value
                    conversion_errors += 1
            else:
                coerced[name] = value
        coerced_records.append(coerced)
    return coerced_records, conversion_errors


def _columns_for_records(
    headers: list[str],
    records: list[dict[str, Any]],
) -> list[DatasetPreviewColumn]:
    return [
        DatasetPreviewColumn(
            name=name,
            type=_infer_value_type([record.get(name) for record in records]),
        )
        for name in headers
    ]


def _csv_dialect(first_line: str) -> csv.Dialect:
    try:
        return csv.Sniffer().sniff(first_line, delimiters=",;\t")
    except csv.Error:
        delimiter = max((",", ";", "\t"), key=first_line.count)
        dialect = csv.excel()
        dialect.delimiter = delimiter if first_line.count(delimiter) else ","
        return dialect


def _parse_pneuma_line(raw_line: bytes, delimiter: str) -> list[str] | None:
    try:
        text = raw_line.decode("utf-8-sig").rstrip("\r\n")
        return next(csv.reader([text], delimiter=delimiter, strict=True), None)
    except (UnicodeDecodeError, csv.Error):
        return None


def _is_pneuma_record(values: list[str]) -> bool:
    values = _trim_pneuma_trailing_empty(values)
    if (
        len(values) < len(PNEUMA_HEADERS)
        or (len(values) - len(PNEUMA_HEADERS)) % len(PNEUMA_POINT_FIELDS) != 0
        or not values[1].strip()
        or not INTEGER_PATTERN.fullmatch(values[0].strip())
    ):
        return False
    numeric_values = values[2:4] + values[4:]
    try:
        return all(value.strip() and math.isfinite(float(value)) for value in numeric_values)
    except ValueError:
        return False


def _trim_pneuma_trailing_empty(values: list[str]) -> list[str]:
    end = len(values)
    while end > len(PNEUMA_HEADERS) and not values[end - 1].strip():
        end -= 1
    return values[:end]


def _pneuma_index_path(path: Path) -> Path:
    return path.with_name(f"{path.name}.preview-index.json")


def _load_pneuma_index(path: Path) -> dict[str, Any] | None:
    stat = path.stat()
    index_path = _pneuma_index_path(path)
    try:
        index = json.loads(index_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(index, dict):
        return None
    tracks = index.get("tracks")
    if (
        index.get("schema_version") != 2
        or index.get("file_size") != stat.st_size
        or index.get("mtime_ns") != stat.st_mtime_ns
        or not isinstance(tracks, list)
        or not isinstance(index.get("total_points"), int)
        or not isinstance(index.get("malformed_rows"), int)
        or not isinstance(index.get("trailing_empty_rows"), int)
        or any(
            not isinstance(track, list)
            or len(track) != 2
            or not all(isinstance(item, int) and item >= 0 for item in track)
            for track in tracks
        )
    ):
        return None
    if sum(track[1] for track in tracks) != index["total_points"]:
        return None
    return index


def _build_pneuma_index(path: Path, delimiter: str) -> dict[str, Any]:
    stat = path.stat()
    tracks: list[list[int]] = []
    total_points = 0
    malformed_rows = 0
    trailing_empty_rows = 0
    with path.open("rb") as source:
        header = _parse_pneuma_line(source.readline(), delimiter)
        if header is None or not _is_pneuma_header(header):
            raise DatasetPreviewReadError("Header CSV không khớp cấu trúc pNEUMA")
        while raw_line := source.readline():
            if not raw_line.strip():
                continue
            values = _parse_pneuma_line(raw_line, delimiter)
            if values is None or not _is_pneuma_record(values):
                malformed_rows += 1
                continue
            if len(_trim_pneuma_trailing_empty(values)) < len(values):
                trailing_empty_rows += 1
                values = _trim_pneuma_trailing_empty(values)
            point_count = 1 + (len(values) - len(PNEUMA_HEADERS)) // len(
                PNEUMA_POINT_FIELDS
            )
            tracks.append([source.tell() - len(raw_line), point_count])
            total_points += point_count

    index = {
        "schema_version": 2,
        "file_size": stat.st_size,
        "mtime_ns": stat.st_mtime_ns,
        "delimiter": delimiter,
        "tracks": tracks,
        "total_points": total_points,
        "malformed_rows": malformed_rows,
        "trailing_empty_rows": trailing_empty_rows,
    }
    _write_pneuma_index(path, index)
    return index


def _write_pneuma_index(path: Path, index: dict[str, Any]) -> None:
    index_path = _pneuma_index_path(path)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{index_path.name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary_path = Path(temporary.name)
            json.dump(index, temporary, separators=(",", ":"))
        os.replace(temporary_path, index_path)
    except OSError:
        logger.exception("Failed to persist pNEUMA preview index", extra={"path": str(path)})
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def _get_pneuma_index(path: Path, delimiter: str) -> dict[str, Any]:
    index = _load_pneuma_index(path)
    if index is not None and index.get("delimiter") == delimiter:
        return index
    return _build_pneuma_index(path, delimiter)


def _read_pneuma_normalized_page(
    path: Path,
    *,
    offset: int,
    page_size: int,
    index: dict[str, Any],
) -> list[dict[str, Any]]:
    tracks: list[list[int]] = index["tracks"]
    cumulative_ends: list[int] = []
    total = 0
    for _, point_count in tracks:
        total += point_count
        cumulative_ends.append(total)

    track_index = bisect.bisect_right(cumulative_ends, offset)
    page_end = min(offset + page_size, index["total_points"])
    points: list[dict[str, Any]] = []
    with path.open("rb") as source:
        while track_index < len(tracks) and len(points) < page_end - offset:
            byte_offset, point_count = tracks[track_index]
            source.seek(byte_offset)
            raw_line = source.readline()
            values = _parse_pneuma_line(raw_line, index["delimiter"])
            if values is None or not _is_pneuma_record(values):
                raise DatasetPreviewReadError(
                    "Dòng pNEUMA thay đổi sau khi lập chỉ mục; vui lòng thử lại preview."
                )
            values = _trim_pneuma_trailing_empty(values)
            first_point = max(0, offset - (cumulative_ends[track_index] - point_count))
            last_point = min(
                point_count,
                page_end - (cumulative_ends[track_index] - point_count),
            )
            all_points = _pneuma_points(values)
            for point_index, point in enumerate(all_points):
                if first_point <= point_index < last_point:
                    points.append(point)
                if point_index >= last_point:
                    break
            track_index += 1
    return points


def _read_csv(
    path: Path,
    *,
    offset: int,
    page_size: int,
    representation: str,
) -> DatasetPreviewData:
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        first_line = source.readline(64 * 1024)
        source.seek(0)
        dialect = _csv_dialect(first_line)
        reader = csv.reader(source, dialect)
        sample_rows = [next(reader, []) for _ in range(6)]
        first_row = sample_rows[0] if sample_rows else []
        if not first_row:
            raise DatasetPreviewReadError("CSV không có hàng tiêu đề")

        has_header, header_warning = _detect_csv_header(first_row, sample_rows[1:])
        warnings: list[str] = []
        if has_header:
            raw_headers = first_row
            data_sample = sample_rows[1:]
            headers = _headers(iter(raw_headers))
            if any(not str(value).strip() for value in raw_headers):
                warnings.append("Header có ô trống; tên cột tạm được gán dạng column_N.")
            header_values = [str(value).strip() for value in raw_headers if str(value).strip()]
            if len(set(header_values)) < len(header_values):
                warnings.append("Header có tên cột trùng; hậu tố _N được thêm để phân biệt.")
        else:
            data_sample = sample_rows
            headers = [f"column_{index}" for index in range(1, len(first_row) + 1)]
            warnings.append(
                "Không phát hiện header; dòng đầu được giữ làm dữ liệu và tên column_N được tạo tạm."
            )
        if header_warning:
            warnings.append(header_warning)

        pneuma = has_header and _is_pneuma_header(headers)
        first_data_row = next((row for row in data_sample if row), None)

        detected_structure = "pneuma_trajectory" if pneuma else "generic_csv"
        actual_representation = "raw"
        if representation == "normalized" and not pneuma:
            warnings.append(
                "Chưa có quy tắc chuẩn hóa phù hợp; dữ liệu CSV gốc được trả về."
            )
        elif representation == "normalized":
            actual_representation = "normalized"

        type_sample = [
            _record_from_values(headers, [value.strip() for value in row[: len(headers)]])
            for row in data_sample[:100]
            if row
        ]
        total_rows: int | None = None
        short_rows = 0
        extra_rows = 0
        selected: list[dict[str, Any]] = []
        if actual_representation == "normalized":
            index = _get_pneuma_index(path, dialect.delimiter)
            total_rows = index["total_points"]
            selected = _read_pneuma_normalized_page(
                path,
                offset=offset,
                page_size=page_size + 1,
                index=index,
            )
            if index["malformed_rows"]:
                warnings.append(
                    f"Bỏ qua {index['malformed_rows']} dòng pNEUMA lỗi hoặc không đủ "
                    "giá trị quỹ đạo."
                )
            if index["trailing_empty_rows"]:
                warnings.append(
                    f"Đã bỏ qua ô rỗng cuối dòng ở {index['trailing_empty_rows']} "
                    "bản ghi pNEUMA."
                )
            columns = _pneuma_normalized_columns()
        else:
            source.seek(0)
            reader = csv.reader(source, dialect)
            if has_header:
                next(reader, None)
            row_index = 0
            for values in reader:
                values = [value.strip() for value in values]
                if not values or not any(values):
                    continue
                if len(values) < len(headers):
                    short_rows += 1
                elif len(values) > len(headers):
                    extra_rows += 1
                if row_index >= offset and len(selected) < page_size + 1:
                    selected.append(_record_from_values(headers, values))
                if row_index >= offset and len(selected) >= page_size + 1:
                    break
                row_index += 1
            columns = _columns_for_records(headers, type_sample)

        if short_rows or extra_rows:
            malformed_rows = short_rows + extra_rows
            warnings.append(
                f"Có {malformed_rows} dòng thiếu hoặc thừa giá trị so với header "
                "trong phần đã đọc."
            )
        if pneuma and actual_representation == "raw" and first_data_row is not None:
            warnings.append(
                "Đã nhận diện pNEUMA; dùng representation=normalized để tách các điểm "
                "quỹ đạo thành từng dòng."
            )

    has_more = offset + len(selected) > offset + page_size
    page_records = selected[:page_size]
    if actual_representation == "raw":
        page_records, conversion_errors = _coerce_csv_records(page_records, columns)
        if conversion_errors:
            warnings.append(
                f"{conversion_errors} giá trị không khớp kiểu dữ liệu suy luận; "
                "giá trị gốc được giữ nguyên."
            )
    return DatasetPreviewData(
        columns=columns,
        rows=page_records,
        has_more=has_more,
        detected_structure=detected_structure,
        representation=actual_representation,
        warnings=warnings,
        total_rows=total_rows,
    )


def _detect_csv_header(first_row: list[str], following_rows: list[list[str]]) -> tuple[bool, str | None]:
    nonempty = [value.strip() for value in first_row if value.strip()]
    if not nonempty:
        return False, None
    if not following_rows:
        looks_like_header = any(HEADER_TOKEN_PATTERN.fullmatch(value) for value in nonempty)
        return looks_like_header, None

    evidence = 0
    for column_index, value in enumerate(first_row):
        token = value.strip()
        if not token or not HEADER_TOKEN_PATTERN.fullmatch(token):
            continue
        following_types = [
            _text_value_type(row[column_index])
            for row in following_rows
            if column_index < len(row) and row[column_index].strip()
        ]
        if (
            following_types
            and any(value_type != "string" for value_type in following_types)
        ) or "_" in token:
            evidence += 1

    if evidence:
        return True, None
    if all(_text_value_type(value) != "string" for value in nonempty):
        return False, None
    return False, (
        "Không thể xác định chắc chắn CSV có header hay không; dòng đầu được xem là dữ liệu."
    )


def _text_value_type(value: str) -> str:
    text = value.strip()
    if not text:
        return "unknown"
    if text.lower() in {"true", "false"}:
        return "boolean"
    if INTEGER_PATTERN.fullmatch(text):
        return "integer"
    try:
        float(text)
        return "float"
    except ValueError:
        pass
    try:
        date.fromisoformat(text)
        return "date"
    except ValueError:
        return "string"


def _is_pneuma_header(headers: list[str]) -> bool:
    return tuple(name.strip().lower() for name in headers) == PNEUMA_HEADERS


def _pneuma_points(values: list[str]) -> Iterator[dict[str, Any]]:
    track = {
        "track_id": _csv_number(values[0], integer=True),
        "type": values[1].strip() or None,
        "traveled_d": _csv_number(values[2]),
        "avg_speed": _csv_number(values[3]),
    }
    point_values = [values[4:10]]
    point_values.extend(
        values[index : index + len(PNEUMA_POINT_FIELDS)]
        for index in range(len(PNEUMA_HEADERS), len(values), len(PNEUMA_POINT_FIELDS))
    )
    for coordinates in point_values:
        yield {
            **track,
            **{
                name: _csv_number(value)
                for name, value in zip(PNEUMA_POINT_FIELDS, coordinates, strict=True)
            },
        }


def _csv_number(value: str, *, integer: bool = False) -> int | float | None:
    if not value:
        return None
    return int(value) if integer or INTEGER_PATTERN.fullmatch(value) else float(value)


def _pneuma_normalized_columns() -> list[DatasetPreviewColumn]:
    return [
        DatasetPreviewColumn(name="track_id", type="integer"),
        DatasetPreviewColumn(name="type", type="string"),
        DatasetPreviewColumn(name="traveled_d", type="float"),
        DatasetPreviewColumn(name="avg_speed", type="float"),
        *(DatasetPreviewColumn(name=name, type="float") for name in PNEUMA_POINT_FIELDS),
    ]


def _json_records(source: BinaryIO) -> Iterator[Any]:
    array_prefix: str | None = None
    try:
        for prefix, event, _ in ijson.parse(source):
            if event == "start_array" and (
                prefix == "" or prefix in JSON_ARRAY_FIELDS
            ):
                array_prefix = prefix
                break
    except ijson.JSONError as exc:
        raise DatasetPreviewReadError("File JSON không hợp lệ") from exc

    if array_prefix is not None:
        item_prefix = f"{array_prefix}.item" if array_prefix else "item"
        source.seek(0)
        try:
            yield from ijson.items(source, item_prefix)
        except ijson.JSONError as exc:
            raise DatasetPreviewReadError("File JSON không hợp lệ") from exc
        return

    source.seek(0)
    try:
        payload = json.load(source)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise DatasetPreviewReadError("File JSON không hợp lệ") from exc
    if isinstance(payload, dict):
        nested_records = next(
            (payload[key] for key in JSON_ARRAY_FIELDS if isinstance(payload.get(key), list)),
            None,
        )
        if nested_records is not None:
            yield from nested_records
            return
        yield payload
    elif isinstance(payload, list):
        yield from payload
    else:
        raise DatasetPreviewReadError("JSON phải là một object hoặc danh sách records")


def _json_record(record: Any, headers: list[str] | None = None) -> dict[str, Any]:
    if isinstance(record, dict):
        return {str(key): _json_safe(value) for key, value in record.items()}
    if isinstance(record, (list, tuple)):
        if headers is None:
            headers = [f"column_{index}" for index in range(1, len(record) + 1)]
        return _record_from_values(headers, list(record))
    return {"value": _json_safe(record)}


def _read_json(
    path: Path,
    *,
    offset: int,
    page_size: int,
) -> tuple[list[DatasetPreviewColumn], list[dict[str, Any]], bool]:
    records: list[dict[str, Any]] = []
    first_record: Any = None
    headers: list[str] | None = None
    with path.open("rb") as source:
        for row_index, raw_record in enumerate(_json_records(source)):
            if row_index == 0:
                first_record = raw_record
                if isinstance(raw_record, dict):
                    headers = [str(key) for key in raw_record]
                elif isinstance(raw_record, (list, tuple)):
                    headers = [f"column_{index}" for index in range(1, len(raw_record) + 1)]
            if row_index >= offset and len(records) < page_size + 1:
                records.append(_json_record(raw_record, headers))
            if len(records) >= page_size + 1:
                break

    has_more = len(records) > page_size
    page_records = records[:page_size]
    if headers is None and first_record is not None:
        headers = list(_json_record(first_record))
    headers = headers or []
    return _columns_for_records(headers, page_records), page_records, has_more


def _read_xlsx(
    path: Path,
    *,
    offset: int,
    page_size: int,
) -> tuple[list[DatasetPreviewColumn], list[dict[str, Any]], bool]:
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        worksheet = workbook.active
        row_iterator = worksheet.iter_rows(values_only=True)
        headers = _headers(iter(next(row_iterator, ())))
        if not headers:
            raise DatasetPreviewReadError("Excel không có hàng tiêu đề")
        page_records: list[dict[str, Any]] = []
        type_sample: list[dict[str, Any]] = []
        for row_index, values in enumerate(row_iterator):
            record = _record_from_values(headers, list(values))
            if row_index < 100:
                type_sample.append(record)
            if row_index >= offset and len(page_records) < page_size + 1:
                page_records.append(record)
            if row_index >= 99 and len(page_records) >= page_size + 1:
                break
        has_more = len(page_records) > page_size
        records = page_records[:page_size]
        return _columns_for_records(headers, type_sample or records), records, has_more
    finally:
        workbook.close()


def _read_xls(
    path: Path,
    *,
    offset: int,
    page_size: int,
) -> tuple[list[DatasetPreviewColumn], list[dict[str, Any]], bool]:
    workbook = xlrd.open_workbook(path, on_demand=True)
    try:
        if workbook.nsheets == 0:
            raise DatasetPreviewReadError("Excel không có worksheet")
        worksheet = workbook.sheet_by_index(0)
        headers = _headers(iter(worksheet.row_values(0))) if worksheet.nrows else []
        if not headers:
            raise DatasetPreviewReadError("Excel không có hàng tiêu đề")
        page_records: list[dict[str, Any]] = []
        type_sample: list[dict[str, Any]] = []
        for row_index in range(1, worksheet.nrows):
            values: list[Any] = []
            for cell in worksheet.row(row_index):
                if cell.ctype in {xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK}:
                    values.append(None)
                elif cell.ctype == xlrd.XL_CELL_DATE:
                    values.append(xlrd.xldate_as_datetime(cell.value, workbook.datemode))
                elif cell.ctype == xlrd.XL_CELL_NUMBER and cell.value.is_integer():
                    values.append(int(cell.value))
                else:
                    values.append(cell.value)
            record = _record_from_values(headers, values)
            data_index = row_index - 1
            if data_index < 100:
                type_sample.append(record)
            if data_index >= offset and len(page_records) < page_size + 1:
                page_records.append(record)
            if data_index >= 99 and len(page_records) >= page_size + 1:
                break
        has_more = len(page_records) > page_size
        records = page_records[:page_size]
        return _columns_for_records(headers, type_sample or records), records, has_more
    finally:
        workbook.release_resources()


def _read_parquet(
    path: Path,
    *,
    offset: int,
    page_size: int,
) -> tuple[list[DatasetPreviewColumn], list[dict[str, Any]], bool]:
    parquet_file = parquet.ParquetFile(path)
    schema = parquet_file.schema_arrow
    if len(schema) > MAX_COLUMNS:
        raise DatasetPreviewReadError(f"Dataset có quá nhiều cột (tối đa {MAX_COLUMNS})")
    columns = [
        DatasetPreviewColumn(name=field.name, type=_arrow_type(field.type))
        for field in schema
    ]
    page_records: list[dict[str, Any]] = []
    skipped = 0
    for batch in parquet_file.iter_batches(batch_size=1024):
        if skipped + batch.num_rows <= offset:
            skipped += batch.num_rows
            continue
        start_in_batch = max(0, offset - skipped)
        for row_index in range(start_in_batch, batch.num_rows):
            page_records.append(
                {
                    name: _json_safe(batch.column(column_index)[row_index].as_py())
                    for column_index, name in enumerate(schema.names)
                }
            )
            if len(page_records) >= page_size + 1:
                break
        skipped += batch.num_rows
        if len(page_records) >= page_size + 1:
            break
    has_more = len(page_records) > page_size
    return columns, page_records[:page_size], has_more


def _arrow_type(arrow_type: pa.DataType) -> str:
    if pa.types.is_boolean(arrow_type):
        return "boolean"
    if pa.types.is_integer(arrow_type):
        return "integer"
    if pa.types.is_floating(arrow_type) or pa.types.is_decimal(arrow_type):
        return "float"
    if pa.types.is_date(arrow_type):
        return "date"
    if pa.types.is_timestamp(arrow_type):
        return "datetime"
    if pa.types.is_list(arrow_type) or pa.types.is_large_list(arrow_type):
        return "array"
    if pa.types.is_struct(arrow_type) or pa.types.is_map(arrow_type):
        return "object"
    if pa.types.is_string(arrow_type) or pa.types.is_large_string(arrow_type):
        return "string"
    return "unknown"


def _read_preview_rows(
    path: Path,
    file_format: str,
    *,
    offset: int,
    page_size: int,
    representation: str,
) -> DatasetPreviewData:
    suffix = path.suffix.lower()
    if suffix == ".csv" or file_format.lower() == "csv":
        return _read_csv(
            path,
            offset=offset,
            page_size=page_size,
            representation=representation,
        )

    parser = {
        ".json": _read_json,
        ".xlsx": _read_xlsx,
        ".xls": _read_xls,
        ".parquet": _read_parquet,
    }.get(suffix)
    if parser is None:
        raise DatasetPreviewFormatError("Định dạng dataset không được hỗ trợ để preview")
    columns, rows, has_more = parser(path, offset=offset, page_size=page_size)
    warnings = []
    actual_representation = "raw"
    if representation == "normalized":
        warnings.append(
            "Chưa có quy tắc chuẩn hóa cho định dạng này; dữ liệu gốc được trả về."
        )
    return DatasetPreviewData(
        columns=columns,
        rows=rows,
        has_more=has_more,
        detected_structure=f"generic_{suffix[1:]}",
        representation=actual_representation,
        warnings=warnings,
    )


def get_dataset_preview(
    db: Session,
    *,
    dataset_id: UUID,
    dataset_version_id: UUID | None = None,
    page: int,
    page_size: int,
    representation: str = "normalized",
) -> DatasetPreviewResponse:
    """Read a paginated preview from a specific or latest uploaded dataset file."""
    dataset_version = (
        crud_dataset.get_dataset_version(db, dataset_id, dataset_version_id)
        if dataset_version_id is not None
        else crud_dataset.get_dataset_latest_version(db, dataset_id)
    )
    if dataset_version is None:
        raise DatasetPreviewNotFoundError("Không tìm thấy dataset hoặc phiên bản đã upload")
    dataset, version = dataset_version
    path = _resolve_file_path(version)
    try:
        preview = _read_preview_rows(
            path,
            version.file_format,
            offset=(page - 1) * page_size,
            page_size=page_size,
            representation=representation,
        )
    except DatasetPreviewReadError:
        raise
    except (
        OSError,
        csv.Error,
        json.JSONDecodeError,
        UnicodeDecodeError,
        ijson.JSONError,
        xlrd.XLRDError,
        InvalidFileException,
        pa.ArrowException,
        ValueError,
    ) as exc:
        logger.exception(
            "Failed to read dataset preview",
            extra={"dataset_id": str(dataset_id), "file_format": version.file_format},
        )
        raise DatasetPreviewReadError("Không đọc hoặc phân tích được file dataset") from exc

    return DatasetPreviewResponse(
        dataset_id=dataset.id,
        dataset_version_id=version.id,
        dataset_name=dataset.name,
        original_filename=version.original_filename or path.name,
        file_format=version.file_format.lower(),
        file_size=version.file_size_bytes,
        status="uploaded",
        detected_structure=preview.detected_structure,
        representation=preview.representation,
        warnings=preview.warnings,
        columns=preview.columns,
        rows=preview.rows,
        pagination=DatasetPreviewPagination(
            page=page,
            page_size=page_size,
            returned_rows=len(preview.rows),
            has_more=preview.has_more,
            total_rows=preview.total_rows,
        ),
    )
