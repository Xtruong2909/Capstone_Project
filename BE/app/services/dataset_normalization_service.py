import csv
import json
import math
import shutil
import uuid
from collections.abc import Iterator
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
from app.models.dataset import DatasetFile, DatasetFileSession
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
from app.services.dataset_file_service import get_file_source_context
from app.services.dataset_preview_service import resolve_stored_file_path
from app.services.normalization_batch import write_pneuma_parquet

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


def _get_staging_dir() -> Path:
    staging_dir = DATASET_UPLOAD_DIR.resolve() / "staging"
    staging_dir.mkdir(parents=True, exist_ok=True)
    return staging_dir


def _get_normalization_source_file(
    db: Session, dataset_id: UUID,
) -> tuple[Any, DatasetFile] | None:
    """Prefer the latest dataset_file linked to raw recording sessions, then legacy raw CSV."""
    session_file = (
        db.query(DatasetFile)
        .filter(
            DatasetFile.dataset_id == dataset_id,
            DatasetFile.id.in_(db.query(DatasetFileSession.file_id)),
        )
        .order_by(DatasetFile.created_at.desc(), DatasetFile.id.desc())
        .first()
    )
    if session_file is not None:
        return session_file.dataset, session_file

    raw_file = (
        db.query(DatasetFile)
        .filter(
            DatasetFile.dataset_id == dataset_id,
        )
        .order_by(DatasetFile.created_at.asc(), DatasetFile.id.asc())
        .first()
    )
    if raw_file is not None:
        return raw_file.dataset, raw_file
    return crud_dataset.get_dataset_latest_file(db, dataset_id)


def _resolve_file_path(dataset_file: DatasetFile) -> Path:
    stored_path = dataset_file.data_file_path or dataset_file.csv_file_path or dataset_file.parquet_file_path
    if not stored_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="dữ liệu dataset không có thông tin đường dẫn file.",
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
    file_id: UUID | None = None,
    page: int = 1,
    page_size: int = 20,
) -> DatasetNormalizeResult:
    dataset_info = (
        crud_dataset.get_dataset_file(db, dataset_id, file_id)
        if file_id is not None
        else _get_normalization_source_file(db, dataset_id)
    )
    if dataset_info is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy Dataset File có dữ liệu nguồn để chuẩn hóa.",
        )
    _dataset, source_file = dataset_info
    sessions = crud_dataset.list_all_file_sessions(db, source_file.id)
    if isinstance(sessions, list) and sessions:
        sources = [
            (session.id, session.original_filename, resolve_stored_file_path(session.file_path))
            for session in sessions
        ]
    else:
        source_path = _resolve_file_path(source_file)
        sources = [(None, source_file.original_filename or source_path.name, source_path)]

    mapping_record = crud_dataset.get_dataset_column_mapping(db, dataset_id, source_file.id)
    if mapping_record is None:
        mapping_record = crud_dataset.get_latest_dataset_column_mapping(db, dataset_id)
    rename_map = {
        str(item.get("source_column", "")).strip().lower(): str(
            item.get("target_column", "")
        ).strip()
        for item in (getattr(mapping_record, "mappings", []) if mapping_record else [])
        if item.get("source_column") and item.get("target_column")
    }

    # Validate every source header before creating the staging output.
    prepared_sources: list[tuple[UUID | None, str, Path, str]] = []
    source_columns: list[str] = []
    is_pneuma: bool | None = None
    for session_id, filename, source_path in sources:
        if source_path.suffix.lower() != ".csv":
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"Chỉ hỗ trợ chuẩn hóa CSV; file không hợp lệ: {filename}",
            )
        try:
            with source_path.open(
                "r", encoding="utf-8-sig", errors="replace", newline=""
            ) as infile:
                first_line = infile.readline()
        except OSError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Không đọc được file {filename}.",
            ) from exc
        if not first_line:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"File CSV rỗng: {filename}",
            )
        delimiter = _csv_delimiter(first_line)
        headers = [
            str(value).strip()
            for value in next(csv.reader([first_line], delimiter=delimiter))
        ]
        pneuma_header = _is_pneuma_header(headers)
        if not source_columns:
            source_columns = headers
            is_pneuma = pneuma_header
        elif [value.lower() for value in headers] != [value.lower() for value in source_columns]:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Cấu trúc cột của {filename} không khớp với các session còn lại.",
            )
        prepared_sources.append((session_id, filename, source_path, delimiter))

    staging_id = uuid.uuid4()
    staging_dir = _get_staging_dir()
    staging_file_path = staging_dir / f"{staging_id}.parquet"
    staging_meta_path = staging_dir / f"{staging_id}.json"
    records_before = 0
    records_after = 0
    source_session_row_counts: dict[str, int] = {}
    normalized_columns: list[str] = []
    parquet_file: pq.ParquetFile | None = None
    try:
        if is_pneuma:
            normalized_columns = [rename_map.get(col.lower(), col) for col in PNEUMA_HEADERS]

            def pneuma_rows() -> Iterator[list[str]]:
                for _session_id, _filename, source_path, delimiter in prepared_sources:
                    point_count = 0
                    with source_path.open(
                        "r", encoding="utf-8-sig", errors="replace", newline=""
                    ) as infile:
                        reader = csv.reader(infile, delimiter=delimiter)
                        next(reader, None)
                        for row in reader:
                            if row and any(row) and not (
                                len(row) == len(PNEUMA_HEADERS)
                                and tuple(value.strip().lower() for value in row) == PNEUMA_HEADERS
                            ):
                                end = len(row)
                                while end and not row[end - 1].strip():
                                    end -= 1
                                point_count += max(0, (end - 4) // 6)
                            yield row
                    if _session_id is not None:
                        source_session_row_counts[str(_session_id)] = point_count

            records_before, records_after = write_pneuma_parquet(
                pneuma_rows(), staging_file_path, rename_map, _parse_number,
            )
        else:
            normalized_columns = [rename_map.get(col.lower(), col) for col in source_columns]
            parquet_writer: pq.ParquetWriter | None = None
            batch: list[dict[str, Any]] = []
            for _session_id, _filename, source_path, delimiter in prepared_sources:
                with source_path.open(
                    "r", encoding="utf-8-sig", errors="replace", newline=""
                ) as infile:
                    first_line = infile.readline()
                    raw_headers = [
                        str(value).strip()
                        for value in next(csv.reader([first_line], delimiter=delimiter))
                    ]
                    for row in csv.DictReader(infile, fieldnames=raw_headers, delimiter=delimiter):
                        if row is None or not any(value is not None for value in row.values()):
                            continue
                        records_before += 1
                        batch.append({
                            rename_map.get(key.lower(), key): value
                            for key, value in row.items()
                            if key
                        })
                        records_after += 1
                        if len(batch) >= 20_000:
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
            if parquet_writer is not None:
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

    except HTTPException:
        staging_file_path.unlink(missing_ok=True)
        raise
    except Exception as exc:
        if staging_file_path.exists():
            staging_file_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Quá trình chuẩn hóa dữ liệu thất bại: {exc}",
        ) from exc
    finally:
        if parquet_file is not None:
            parquet_file.close()

    # Save source session provenance for the export operation.
    staging_meta = {
        "staging_id": str(staging_id),
        "dataset_id": str(dataset_id),
        "source_file_id": str(source_file.id),
        "source_session_ids": [str(item[0]) for item in prepared_sources if item[0]],
        "source_session_row_counts": source_session_row_counts,
        "source_session_count": len(prepared_sources),
        "source_filenames": [item[1] for item in prepared_sources],
        "original_filename": f"{source_file.dataset.name}-normalized.parquet",
        "staging_file_path": str(staging_file_path),
        "records_before": records_before,
        "records_after": records_after,
        "source_columns": source_columns,
        "normalized_columns": normalized_columns,
        "applied_mappings": rename_map,
        "is_pneuma": bool(is_pneuma),
        "created_at": datetime.now(UTC).isoformat(),
    }
    try:
        with staging_meta_path.open("w", encoding="utf-8") as f:
            json.dump(staging_meta, f, ensure_ascii=False, indent=2)
    except OSError as exc:
        staging_file_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không lưu được metadata phiên chuẩn hóa.",
        ) from exc

    return DatasetNormalizeResult(
        dataset_id=dataset_id,
        source_file_id=source_file.id,
        staging_id=staging_id,
        status="normalized",
        records_before=records_before,
        records_after=records_after,
        source_columns=source_columns,
        normalized_columns=normalized_columns,
        source_session_count=len(prepared_sources),
        source_session_ids=[item[0] for item in prepared_sources if item[0]],
        preview=DatasetPreviewResponse(
            dataset_id=dataset_id,
            dataset_file_id=source_file.id,
            dataset_name=source_file.dataset.name,
            original_filename=staging_meta["original_filename"],
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
            "Chuẩn hóa cấu trúc thành công. Dữ liệu đã sẵn sàng để xuất dữ liệu "
            "(Export)."
        ),
    )


# =====================================================================
# BƯỚC 5: XUẤT dữ liệu (EXPORT NORMALIZED DATASET)
# =====================================================================
def export_normalized_dataset_service(
    db: Session,
    *,
    dataset_id: UUID,
    payload: DatasetExportRequest,
    user: User,
) -> DatasetExportResult:
    staging_dir = _get_staging_dir()
    meta_path: Path | None = None
    if payload.staging_id:
        meta_path = staging_dir / f"{payload.staging_id}.json"
        if not meta_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy phiên làm việc chuẩn hóa staging_id: {payload.staging_id}",
            )
    else:
        matching_metas = []
        for file in staging_dir.glob("*.json"):
            try:
                with open(file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if data.get("dataset_id") == str(dataset_id):
                        matching_metas.append((file.stat().st_mtime, file))
            except (OSError, json.JSONDecodeError, TypeError, ValueError):
                continue
        if not matching_metas:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Chưa có kết quả Normalize cho Dataset này. Hãy chạy Normalize trước khi Export.",
            )
        matching_metas.sort(key=lambda x: x[0], reverse=True)
        meta_path = matching_metas[0][1]

    assert meta_path is not None
    with open(meta_path, "r", encoding="utf-8") as f:
        staging_meta = json.load(f)
    if staging_meta.get("dataset_id") != str(dataset_id):
        raise HTTPException(status_code=404, detail="Không tìm thấy kết quả Normalize của Dataset này.")

    try:
        staging_file_path = Path(staging_meta["staging_file_path"]).resolve()
        staging_file_path.relative_to(staging_dir.resolve())
    except (KeyError, OSError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Đường dẫn file Normalize không hợp lệ.") from exc
    if not staging_file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File staging dữ liệu đã bị xóa hoặc không tồn tại.",
        )

    current_info = crud_dataset.get_dataset_latest_file(db, dataset_id)
    if current_info is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy tập dữ liệu.")
    # Staging files created before the migration have no current file ID.
    source_file_id = UUID(str(staging_meta.get("source_file_id") or current_info[1].id))
    if not crud_dataset.get_dataset_file(db, dataset_id, source_file_id):
        raise HTTPException(status_code=404, detail="Dataset File nguồn không còn tồn tại.")

    current_sessions = crud_dataset.list_all_file_sessions(db, source_file_id)
    staged_session_ids = staging_meta.get("source_session_ids")
    if staged_session_ids and isinstance(current_sessions, list) and (
        {str(session.id) for session in current_sessions} != set(staged_session_ids)
    ):
        raise HTTPException(status_code=409, detail="Dữ liệu nguồn đã thay đổi. Hãy chuẩn hóa lại trước khi xuất.")

    new_file_id = source_file_id

    upload_root = DATASET_UPLOAD_DIR.resolve()
    target_dir = upload_root / str(dataset_id)
    target_dir.mkdir(parents=True, exist_ok=True)

    format_upper = payload.export_format.upper()
    output_file_name = f"processed-{uuid.uuid4()}.{format_upper.lower()}"
    output_file_path = target_dir / output_file_name
    try:
        if format_upper == "PARQUET":
            shutil.copyfile(staging_file_path, output_file_path)
        else:
            import pyarrow.csv as pacsv

            parquet_file = pq.ParquetFile(staging_file_path)
            try:
                with pacsv.CSVWriter(output_file_path, parquet_file.schema_arrow) as writer:
                    for record_batch in parquet_file.iter_batches(batch_size=65_536):
                        writer.write(pa.Table.from_batches(
                            [record_batch], schema=parquet_file.schema_arrow,
                        ))
            finally:
                parquet_file.close()
        file_size_bytes = output_file_path.stat().st_size
    except Exception as exc:
        output_file_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể tạo file export từ kết quả Normalize.",
        ) from exc
    records_after = int(staging_meta["records_after"])
    records_before = int(staging_meta["records_before"])
    source_session_ids = staging_meta.get("source_session_ids", [])

    try:
        new_file, history = crud_dataset.create_normalized_file(
            db,
            dataset_id=dataset_id,
            new_file_id=new_file_id,
            file_format=format_upper,
            file_path=output_file_path.relative_to(upload_root).as_posix(),
            file_size_bytes=file_size_bytes,
            total_records=records_after,
            original_filename=staging_meta.get("original_filename"),
            records_before=records_before,
            user_id=user.id,
            cleaning_parameters={
                "source_file_id": str(source_file_id),
                "source_session_ids": source_session_ids,
                "source_session_row_counts": staging_meta.get("source_session_row_counts", {}),
                "source_session_count": int(staging_meta.get("source_session_count", len(source_session_ids) or 1)),
                "source_filenames": staging_meta.get("source_filenames", []),
                "export_format": format_upper,
                "applied_mappings": staging_meta.get("applied_mappings", {}),
                "is_pneuma": staging_meta.get("is_pneuma", True),
            },
        )
    except Exception as exc:
        db.rollback()
        output_file_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể tạo Dataset File từ kết quả Normalize.",
        ) from exc

    # Keep staging available if database creation fails; remove it only after commit.
    staging_file_path.unlink(missing_ok=True)
    meta_path.unlink(missing_ok=True)

    return DatasetExportResult(
        dataset_id=dataset_id,
        source_file_id=source_file_id,
        source_session_count=int(staging_meta.get("source_session_count", len(source_session_ids) or 1)),
        file_id=new_file.id,
        file_format=format_upper,
        file_size_bytes=file_size_bytes,
        total_records=records_after,
        cleaning_history_id=history.id,
        message=f"Đã xuất {int(staging_meta.get('source_session_count', len(source_session_ids) or 1))} session thành dữ liệu định dạng {format_upper} (dung lượng {file_size_bytes / (1024 * 1024):.2f} MB).",
    )


# =====================================================================
# BƯỚC 6: BÁO CÁO XỬ LÝ TỔNG HỢP (PROCESSING REPORT)
# =====================================================================
def get_processing_report_service(
    db: Session,
    *,
    dataset_id: UUID,
    file_id: UUID,
) -> ProcessingReportResponse:
    dataset_info = crud_dataset.get_dataset_file(db, dataset_id, file_id)
    if not dataset_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy dữ liệu dataset tương ứng.",
        )
    dataset, dataset_file = dataset_info

    history = crud_dataset.get_cleaning_history_by_file(db, dataset_file.id)
    if not history:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="dữ liệu này không có dữ liệu lịch sử chuẩn hóa/làm sạch.",
        )

    params = history.parameters or {}
    applied_mappings = params.get("applied_mappings", {})
    quality_check_id = params.get("quality_check_id")
    source_file_id, source_sessions = get_file_source_context(
        db, dataset_file, history=history,
    )

    file_size = dataset_file.file_size_bytes or 0
    file_size_mb = round(file_size / (1024 * 1024), 2)

    return ProcessingReportResponse(
        dataset_id=dataset.id,
        dataset_name=dataset.name,
        dataset_code=dataset.code,
        file_id=dataset_file.id,
        source_file_id=source_file_id,
        source_session_count=len(source_sessions),
        source_sessions=source_sessions,
        file_format=dataset_file.file_format,
        file_size_bytes=file_size,
        file_size_mb=file_size_mb,
        records_before=history.records_before,
        records_after=history.records_after,
        cleaning_operation=history.cleaning_operation,
        applied_mappings=applied_mappings,
        quality_check_id=UUID(quality_check_id) if quality_check_id else None,
        created_at=history.created_at,
    )
