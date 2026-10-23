import csv
import json
import math
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

import pyarrow as pa
import pyarrow.parquet as pq
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import DATASET_UPLOAD_DIR
from app.crud import crud_dataset
from app.models.dataset import DatasetVersion
from app.models.user import User
from app.schemas.dataset import (
    DatasetPreviewColumn,
    DatasetPreviewPagination,
    DatasetPreviewResponse,
)
from app.schemas.dataset_normalization import (
    DatasetExportRequest,
    DatasetExportResult,
    DatasetNormalizeResult,
    ProcessingReportResponse,
)

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
VERSION_TAG_PATTERN = re.compile(r"^v[0-9]+(\.[0-9]+)*(-[a-zA-Z0-9_-]+)?$")


def _get_staging_dir() -> Path:
    staging_dir = DATASET_UPLOAD_DIR.resolve() / "staging"
    staging_dir.mkdir(parents=True, exist_ok=True)
    return staging_dir


def _resolve_file_path(version: DatasetVersion) -> Path:
    stored_path = (
        version.data_file_path
        or version.csv_file_path
        or version.parquet_file_path
        or version.geojson_file_path
    )
    if not stored_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Phiên bản dataset không có thông tin đường dẫn file.",
        )

    upload_root = DATASET_UPLOAD_DIR.resolve()
    candidate = Path(stored_path)
    if not candidate.is_absolute():
        candidate = upload_root / candidate

    resolved_path = candidate.resolve()
    if not resolved_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy file dataset gốc trên hệ thống: {resolved_path.name}",
        )
    return resolved_path


def _prepare_version_tag(
    db: Session,
    dataset_id: UUID,
    current_tag: str,
    requested_tag: str | None,
) -> str:
    if requested_tag:
        requested_tag = requested_tag.strip()
        if not VERSION_TAG_PATTERN.fullmatch(requested_tag):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Version tag '{requested_tag}' không đúng định dạng chuẩn (ví dụ: v1.1, v1.0-clean).",
            )
        existing = (
            db.query(DatasetVersion)
            .filter(
                DatasetVersion.dataset_id == dataset_id,
                DatasetVersion.version_tag == requested_tag,
            )
            .first()
        )
        if existing:
            if existing.approval_status == "PENDING":
                try:
                    old_path = _resolve_file_path(existing)
                    if old_path.exists():
                        old_path.unlink(missing_ok=True)
                except Exception:
                    pass
                db.delete(existing)
                db.commit()
                return requested_tag
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Phiên bản '{requested_tag}' đã được phê duyệt và không thể ghi đè.",
            )
        return requested_tag

    candidates = [
        f"{current_tag}-clean",
        f"{current_tag}-normalized",
        "v1.1",
        "v1.2",
        "v2.0",
    ]
    for tag in candidates:
        exists = (
            db.query(DatasetVersion)
            .filter(
                DatasetVersion.dataset_id == dataset_id,
                DatasetVersion.version_tag == tag,
            )
            .first()
        )
        if not exists:
            return tag

    index = 1
    while True:
        tag = f"{current_tag}.{index}"
        exists = (
            db.query(DatasetVersion)
            .filter(
                DatasetVersion.dataset_id == dataset_id,
                DatasetVersion.version_tag == tag,
            )
            .first()
        )
        if not exists:
            return tag
        index += 1


def _csv_delimiter(first_line: str) -> str:
    try:
        sniffed = csv.Sniffer().sniff(first_line, delimiters=",;\t")
        return sniffed.delimiter
    except Exception:
        counts = {",": first_line.count(","), ";": first_line.count(";"), "\t": first_line.count("\t")}
        return max(counts, key=counts.get) or ","


def _is_pneuma_header(headers: list[str]) -> bool:
    clean = tuple(h.strip().lower() for h in headers)
    return len(clean) >= len(PNEUMA_HEADERS) and clean[: len(PNEUMA_HEADERS)] == PNEUMA_HEADERS


def _parse_number(val: str, integer: bool = False) -> int | float | None:
    val = val.strip()
    if not val:
        return None
    try:
        if integer:
            return int(float(val))
        f = float(val)
        return f if math.isfinite(f) else None
    except ValueError:
        return None


# =====================================================================
# BƯỚC 4: CHUẨN HÓA CẤU TRÚC (NORMALIZE STRUCTURE)
# =====================================================================
def normalize_dataset_structure_service(
    db: Session,
    *,
    dataset_id: UUID,
    user: User,
    page: int = 1,
    page_size: int = 20,
) -> DatasetNormalizeResult:
    # 1. Tìm dataset và version nguồn
    source_version = (
        db.query(DatasetVersion)
        .filter(
            DatasetVersion.dataset_id == dataset_id,
            ~DatasetVersion.version_tag.ilike("%clean%"),
            ~DatasetVersion.version_tag.ilike("%normalized%"),
        )
        .order_by(DatasetVersion.created_at.asc())
        .first()
    )
    if not source_version:
        dataset_info = crud_dataset.get_dataset_latest_version(db, dataset_id)
        if not dataset_info:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Không tìm thấy dataset với mã định danh đã cho.",
            )
        _dataset, source_version = dataset_info

    source_file_path = _resolve_file_path(source_version)

    # 2. Lấy hoặc lưu cấu hình Mapping
    rename_map: dict[str, str] = {}
    mapping_record = crud_dataset.get_dataset_column_mapping(
        db, dataset_id, source_version.id
    )
    if mapping_record and mapping_record.mappings:
        for item in mapping_record.mappings:
            src = str(item.get("source_column", "")).strip().lower()
            tgt = str(item.get("target_column", "")).strip()
            if src and tgt:
                rename_map[src] = tgt

    # 3. Chuẩn bị file staging tạm dạng Parquet (để tối ưu RAM và tốc độ)
    staging_id = uuid.uuid4()
    staging_dir = _get_staging_dir()
    staging_file_path = staging_dir / f"{staging_id}.parquet"
    staging_meta_path = staging_dir / f"{staging_id}.json"

    records_before = 0
    records_after = 0
    source_columns: list[str] = []
    normalized_columns: list[str] = []

    try:
        with open(source_file_path, "r", encoding="utf-8-sig", errors="replace") as infile:
            first_line = infile.readline()
            if not first_line:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="File dataset nguồn rỗng.",
                )

            delimiter = _csv_delimiter(first_line)
            raw_headers = [c.strip() for c in next(csv.reader([first_line], delimiter=delimiter))]
            source_columns = raw_headers

            is_pneuma = _is_pneuma_header(raw_headers)
            parquet_writer = None
            batch: list[dict[str, Any]] = []

            if is_pneuma:
                base_fields = ["track_id", "type", "traveled_d", "avg_speed"]
                point_fields = ["lat", "lon", "speed", "lon_acc", "lat_acc", "time"]
                all_pneuma_fields = base_fields + point_fields
                normalized_columns = [rename_map.get(col.lower(), col) for col in all_pneuma_fields]

                csv_reader = csv.reader(infile, delimiter=delimiter)
                for row in csv_reader:
                    if not row or not any(row):
                        continue
                    records_before += 1
                    while row and not row[-1].strip():
                        row.pop()

                    if len(row) < len(PNEUMA_HEADERS):
                        continue

                    track_id = _parse_number(row[0], integer=True)
                    vehicle_type = row[1].strip() or None
                    traveled_d = _parse_number(row[2])
                    avg_speed = _parse_number(row[3])

                    track_data = {
                        rename_map.get("track_id", "track_id"): track_id,
                        rename_map.get("type", "type"): vehicle_type,
                        rename_map.get("traveled_d", "traveled_d"): traveled_d,
                        rename_map.get("avg_speed", "avg_speed"): avg_speed,
                    }

                    point_slices = [row[4:10]]
                    for idx in range(10, len(row), 6):
                        chunk = row[idx : idx + 6]
                        if len(chunk) == 6:
                            point_slices.append(chunk)

                    for coords in point_slices:
                        point_dict = {
                            rename_map.get("lat", "lat"): _parse_number(coords[0]),
                            rename_map.get("lon", "lon"): _parse_number(coords[1]),
                            rename_map.get("speed", "speed"): _parse_number(coords[2]),
                            rename_map.get("lon_acc", "lon_acc"): _parse_number(coords[3]),
                            rename_map.get("lat_acc", "lat_acc"): _parse_number(coords[4]),
                            rename_map.get("time", "time"): _parse_number(coords[5]),
                        }
                        batch.append({**track_data, **point_dict})
                        records_after += 1

                    if len(batch) >= 20000:
                        table = pa.Table.from_pylist(batch)
                        if parquet_writer is None:
                            parquet_writer = pq.ParquetWriter(
                                staging_file_path, table.schema, compression="snappy"
                            )
                        parquet_writer.write_table(table)
                        batch.clear()

            else:
                normalized_columns = [rename_map.get(col.lower(), col) for col in raw_headers]
                dict_reader = csv.DictReader(infile, fieldnames=raw_headers, delimiter=delimiter)
                for row in dict_reader:
                    records_before += 1
                    mapped_row = {
                        rename_map.get(k.lower(), k): v for k, v in row.items() if k
                    }
                    batch.append(mapped_row)
                    records_after += 1

                    if len(batch) >= 20000:
                        table = pa.Table.from_pylist(batch)
                        if parquet_writer is None:
                            parquet_writer = pq.ParquetWriter(
                                staging_file_path, table.schema, compression="snappy"
                            )
                        parquet_writer.write_table(table)
                        batch.clear()

            if batch:
                table = pa.Table.from_pylist(batch)
                if parquet_writer is None:
                    parquet_writer = pq.ParquetWriter(
                        staging_file_path, table.schema, compression="snappy"
                    )
                parquet_writer.write_table(table)
                batch.clear()

            if parquet_writer:
                parquet_writer.close()

        parquet_file = pq.ParquetFile(staging_file_path)
        preview_offset = (page - 1) * page_size
        preview_rows: list[dict[str, Any]] = []
        for batch_index, preview_batch in enumerate(
            parquet_file.iter_batches(batch_size=page_size)
        ):
            batch_start = batch_index * page_size
            batch_end = batch_start + preview_batch.num_rows
            if batch_end <= preview_offset:
                continue
            start_in_batch = max(preview_offset - batch_start, 0)
            preview_rows = preview_batch.slice(start_in_batch).to_pylist()
            break
        preview_columns = [
            DatasetPreviewColumn(
                name=field.name,
                type=(
                    "integer"
                    if pa.types.is_integer(field.type)
                    else "float"
                    if pa.types.is_floating(field.type)
                    else "boolean"
                    if pa.types.is_boolean(field.type)
                    else "string"
                    if pa.types.is_string(field.type) or pa.types.is_large_string(field.type)
                    else str(field.type)
                ),
            )
            for field in parquet_file.schema_arrow
        ]

    except Exception as exc:
        if staging_file_path.exists():
            staging_file_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Quá trình chuẩn hóa dữ liệu thất bại: {exc}",
        ) from exc

    # Lưu metadata của phiên staging để Bước 5 sử dụng
    staging_meta = {
        "staging_id": str(staging_id),
        "dataset_id": str(dataset_id),
        "source_version_id": str(source_version.id),
        "source_version_tag": source_version.version_tag,
        "staging_file_path": str(staging_file_path),
        "records_before": records_before,
        "records_after": records_after,
        "source_columns": source_columns,
        "normalized_columns": normalized_columns,
        "applied_mappings": rename_map,
        "is_pneuma": is_pneuma,
        "created_at": datetime.now(UTC).isoformat(),
    }
    with open(staging_meta_path, "w", encoding="utf-8") as f:
        json.dump(staging_meta, f, ensure_ascii=False, indent=2)

    return DatasetNormalizeResult(
        dataset_id=dataset_id,
        source_version_id=source_version.id,
        staging_id=staging_id,
        status="normalized",
        records_before=records_before,
        records_after=records_after,
        source_columns=source_columns,
        normalized_columns=normalized_columns,
        preview=DatasetPreviewResponse(
            dataset_id=dataset_id,
            dataset_version_id=source_version.id,
            dataset_name=source_version.dataset.name,
            original_filename=source_version.original_filename or source_file_path.name,
            file_format="PARQUET",
            file_size=staging_file_path.stat().st_size,
            status="normalized",
            detected_structure="pneuma" if is_pneuma else "tabular",
            representation="normalized",
            warnings=[],
            columns=preview_columns,
            rows=preview_rows,
            pagination=DatasetPreviewPagination(
                page=page,
                page_size=page_size,
                returned_rows=len(preview_rows),
                has_more=page * page_size < records_after,
                total_rows=records_after,
            ),
        ),
        message=(
            "Chuẩn hóa cấu trúc thành công. Dữ liệu đã sẵn sàng để xuất phiên bản mới "
            "(Export)."
        ),
    )


# =====================================================================
# BƯỚC 5: XUẤT PHIÊN BẢN MỚI (EXPORT NORMALIZED DATASET)
# =====================================================================
def export_normalized_dataset_service(
    db: Session,
    *,
    dataset_id: UUID,
    payload: DatasetExportRequest,
    user: User,
) -> DatasetExportResult:
    staging_dir = _get_staging_dir()

    # 1. Tìm metadata staging
    meta_path = None
    if payload.staging_id:
        meta_path = staging_dir / f"{payload.staging_id}.json"
        if not meta_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy phiên làm việc chuẩn hóa staging_id: {payload.staging_id}",
            )
    else:
        # Tự động tìm staging gần nhất của dataset này
        matching_metas = []
        for file in staging_dir.glob("*.json"):
            try:
                with open(file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if data.get("dataset_id") == str(dataset_id):
                        matching_metas.append((file.stat().st_mtime, file))
            except Exception:
                continue
        if not matching_metas:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Chưa có phiên chuẩn hóa nào của dataset này. Vui lòng chạy Bước 4 (Normalize) trước.",
            )
        matching_metas.sort(key=lambda x: x[0], reverse=True)
        meta_path = matching_metas[0][1]

    with open(meta_path, "r", encoding="utf-8") as f:
        staging_meta = json.load(f)

    staging_file_path = Path(staging_meta["staging_file_path"])
    if not staging_file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File staging dữ liệu đã bị xóa hoặc không tồn tại.",
        )

    # 2. Chuẩn bị phiên bản và thư mục đích
    new_version_id = uuid.uuid4()
    source_tag = staging_meta.get("source_version_tag", "v1.0")
    new_version_tag = _prepare_version_tag(
        db, dataset_id, source_tag, payload.new_version_tag
    )

    upload_root = DATASET_UPLOAD_DIR.resolve()
    target_dir = upload_root / str(dataset_id)
    target_dir.mkdir(parents=True, exist_ok=True)

    format_upper = payload.export_format.upper()
    if format_upper == "PARQUET":
        output_file_name = f"{new_version_id}.parquet"
        output_file_path = target_dir / output_file_name
        # Di chuyển hoặc copy trực tiếp file staging Parquet
        staging_file_path.replace(output_file_path)
    else:
        # Nếu muốn xuất ra CSV
        output_file_name = f"{new_version_id}.csv"
        output_file_path = target_dir / output_file_name
        table = pq.read_table(staging_file_path)
        import pyarrow.csv as pacsv
        pacsv.write_csv(table, output_file_path)
        staging_file_path.unlink(missing_ok=True)

    # Xóa file meta staging sau khi xuất thành công
    meta_path.unlink(missing_ok=True)

    file_size_bytes = output_file_path.stat().st_size
    records_after = staging_meta["records_after"]
    records_before = staging_meta["records_before"]

    # 3. Lưu vào Database (DatasetVersion & DataCleaningHistory)
    new_version, history = crud_dataset.create_normalized_version(
        db,
        dataset_id=dataset_id,
        new_version_id=new_version_id,
        version_tag=new_version_tag,
        file_format=format_upper,
        file_path=str(output_file_path),
        file_size_bytes=file_size_bytes,
        total_records=records_after,
        records_before=records_before,
        user_id=user.id,
        cleaning_parameters={
            "source_version_id": staging_meta["source_version_id"],
            "export_format": format_upper,
            "applied_mappings": staging_meta.get("applied_mappings", {}),
            "is_pneuma": staging_meta.get("is_pneuma", True),
            "quality_check_id": str(payload.quality_check_id) if payload.quality_check_id else None,
        },
    )

    return DatasetExportResult(
        dataset_id=dataset_id,
        version_id=new_version.id,
        version_tag=new_version.version_tag,
        file_format=format_upper,
        file_size_bytes=file_size_bytes,
        total_records=records_after,
        cleaning_history_id=history.id,
        message=f"Đã xuất phiên bản {new_version_tag} định dạng {format_upper} thành công (Dung lượng: {file_size_bytes / (1024 * 1024):.2f} MB).",
    )


# =====================================================================
# BƯỚC 6: BÁO CÁO XỬ LÝ TỔNG HỢP (PROCESSING REPORT)
# =====================================================================
def get_processing_report_service(
    db: Session,
    *,
    dataset_id: UUID,
    version_id: UUID,
) -> ProcessingReportResponse:
    dataset_info = crud_dataset.get_dataset_version(db, dataset_id, version_id)
    if not dataset_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy phiên bản dataset tương ứng.",
        )
    dataset, version = dataset_info

    history = crud_dataset.get_cleaning_history_by_version(db, version.id)
    if not history:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Phiên bản này không có dữ liệu lịch sử chuẩn hóa/làm sạch.",
        )

    params = history.parameters or {}
    applied_mappings = params.get("applied_mappings", {})
    quality_check_id = params.get("quality_check_id")

    file_size = version.file_size_bytes or 0
    file_size_mb = round(file_size / (1024 * 1024), 2)

    return ProcessingReportResponse(
        dataset_id=dataset.id,
        dataset_name=dataset.name,
        dataset_code=dataset.code,
        version_id=version.id,
        version_tag=version.version_tag,
        file_format=version.file_format,
        file_size_bytes=file_size,
        file_size_mb=file_size_mb,
        records_before=history.records_before,
        records_after=history.records_after,
        cleaning_operation=history.cleaning_operation,
        applied_mappings=applied_mappings,
        quality_check_id=UUID(quality_check_id) if quality_check_id else None,
        created_at=history.created_at,
    )
