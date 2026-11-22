"""Read a small sample of the current job's output without running normalization."""

import json
from uuid import UUID

import pyarrow as pa
import pyarrow.parquet as pq
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import DATASET_UPLOAD_DIR
from app.crud import crud_dataset
from app.schemas.dataset import (
    DatasetPreviewColumn,
    DatasetPreviewPagination,
    DatasetPreviewResponse,
)
from app.schemas.dataset_normalization import NormalizationResultPreview
from app.services.dataset_pipeline_service import get_group_pipeline_state
from app.services.dataset_preview_service import (
    DatasetPreviewFormatError,
    DatasetPreviewNotFoundError,
    DatasetPreviewReadError,
    get_dataset_preview,
)

PREVIEW_ROWS = 10


def get_normalization_result_preview(
    db: Session, *, group_id: UUID, job_id: UUID, dataset_id: UUID, owner_id: UUID,
) -> NormalizationResultPreview:
    # This also rejects jobs invalidated by new uploads or column mappings.
    state = get_group_pipeline_state(db, group_id, owner_id)
    if state.job is None or state.job.job_id != job_id:
        raise HTTPException(404, "Không tìm thấy kết quả xử lý hiện tại của batch.")
    result = next((item for item in state.job.results if item.dataset_id == dataset_id), None)
    if result is None:
        raise HTTPException(404, "Tập dữ liệu không thuộc tác vụ xử lý này.")
    if result.status != "COMPLETED":
        raise HTTPException(409, "Tập dữ liệu chưa xử lý thành công để xem trước.")
    if state.job.operation == "EXPORT":
        if result.file_id is None:
            raise HTTPException(409, "Tác vụ chưa có tệp kết quả đã xuất.")
        history = crud_dataset.get_cleaning_history_by_file(db, result.file_id)
        if history is None:
            raise HTTPException(409, "Chưa có kết quả chuẩn hóa cho tệp đã xuất.")
        try:
            preview = get_dataset_preview(db, dataset_id=dataset_id,
                dataset_file_id=result.file_id, page=1, page_size=PREVIEW_ROWS)
        except (DatasetPreviewFormatError, DatasetPreviewNotFoundError, DatasetPreviewReadError) as exc:
            raise HTTPException(409, "Không đọc được tệp kết quả đã xuất.") from exc
        return NormalizationResultPreview(
            dataset_id=dataset_id, dataset_name=result.dataset_name,
            is_pneuma=bool((history.parameters or {}).get("is_pneuma", False)),
            records_before=history.records_before, records_after=history.records_after,
            preview=preview,
        )

    # The staging ID comes only from the authorized server job, never a client path.
    job = crud_dataset.get_group_processing_job(db, job_id)
    if job is None:
        raise HTTPException(404, "Không tìm thấy tác vụ chuẩn hóa.")
    stored = next((item for item in job.results if item.get("dataset_id") == str(dataset_id)), {})
    try:
        staging_id = UUID(str(stored.get("staging_id")))
        root = DATASET_UPLOAD_DIR.resolve() / "staging"
        meta = json.loads((root / f"{staging_id}.json").read_text(encoding="utf-8"))
        if meta.get("dataset_id") != str(dataset_id):
            raise ValueError("staging dataset mismatch")
        path = root / f"{staging_id}.parquet"
        with pq.ParquetFile(path) as parquet:
            batch = next(parquet.iter_batches(batch_size=PREVIEW_ROWS), None)
            rows = batch.to_pylist() if batch is not None else []
            columns = [DatasetPreviewColumn(name=field.name, type=(
                "integer" if pa.types.is_integer(field.type) else
                "float" if pa.types.is_floating(field.type) else
                "boolean" if pa.types.is_boolean(field.type) else
                "string" if pa.types.is_string(field.type) or pa.types.is_large_string(field.type)
                else str(field.type)
            )) for field in parquet.schema_arrow]
            total = parquet.metadata.num_rows
        preview = DatasetPreviewResponse(
            dataset_id=dataset_id, dataset_file_id=result.source_file_id,
            dataset_name=result.dataset_name, original_filename=meta.get("original_filename") or path.name,
            file_format="PARQUET", file_size=path.stat().st_size, status="normalized",
            detected_structure="pneuma_trajectory" if meta.get("is_pneuma") else "generic_parquet",
            representation="normalized", columns=columns, rows=rows,
            pagination=DatasetPreviewPagination(page=1, page_size=PREVIEW_ROWS,
                returned_rows=len(rows), has_more=total > len(rows), total_rows=total),
        )
        return NormalizationResultPreview(
            dataset_id=dataset_id, dataset_name=result.dataset_name,
            is_pneuma=bool(meta.get("is_pneuma")), records_before=meta.get("records_before"),
            records_after=total, source_columns=meta.get("source_columns", []), preview=preview,
        )
    except (OSError, ValueError, TypeError, pa.ArrowException) as exc:
        raise HTTPException(409, "Kết quả chuẩn hóa không còn khả dụng. Hãy làm mới trạng thái batch.") from exc
