from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.dataset import DatasetPreviewResponse

# =====================================================================
# BƯỚC 4: CHUẨN HÓA CẤU TRÚC (NORMALIZE STRUCTURE)
# =====================================================================

class DatasetNormalizeResult(BaseModel):
    dataset_id: UUID
    source_file_id: UUID
    staging_id: UUID
    status: str = Field(default="normalized")
    source_session_count: int = Field(ge=1)
    source_session_ids: list[UUID] = Field(default_factory=list)
    records_before: int = Field(description="Số xe ban đầu trong file gốc")
    records_after: int = Field(description="Số điểm quỹ đạo sau khi bung dòng (unpivot)")
    source_columns: list[str]
    normalized_columns: list[str]
    preview: DatasetPreviewResponse
    message: str = Field(
        default="Chuẩn hóa cấu trúc thành công. Dữ liệu đã sẵn sàng để xuất dữ liệu (Export)."
    )


# =====================================================================
# BƯỚC 5: XUẤT dữ liệu (EXPORT NORMALIZED DATASET)
# =====================================================================

class DatasetExportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    staging_id: UUID | None = Field(
        default=None,
        description="ID kết quả Normalize cần xuất; để trống sẽ dùng kết quả gần nhất của Dataset.",
    )
    export_format: Literal["PARQUET", "CSV"] = Field(
        default="PARQUET",
        description="Định dạng file Dataset File được tạo.",
    )
class DatasetExportResult(BaseModel):
    dataset_id: UUID
    source_file_id: UUID
    source_session_count: int = Field(ge=1)
    file_id: UUID
    file_format: str
    file_size_bytes: int
    total_records: int
    cleaning_history_id: int
    message: str = Field(
        default="Đã xuất và tạo dữ liệu dataset mới thành công."
    )


class GroupProcessingDatasetResult(BaseModel):
    dataset_id: UUID
    dataset_name: str
    status: Literal["PENDING", "RUNNING", "COMPLETED", "FAILED"]
    session_count: int = 0
    source_file_id: UUID | None = None
    file_id: UUID | None = None
    records_before: int | None = None
    records_after: int | None = None
    error_message: str | None = None


class GroupProcessingJobResponse(BaseModel):
    group_id: UUID
    staging_id: UUID = Field(description="ID chung của lần Normalize, áp dụng cho mọi Dataset trong nhóm")
    job_id: UUID
    operation: Literal["NORMALIZE", "EXPORT"]
    status: Literal["PENDING", "RUNNING", "COMPLETED", "PARTIAL_SUCCESS", "FAILED"]
    total_datasets: int
    processed_datasets: int
    results: list[GroupProcessingDatasetResult] = Field(default_factory=list)


class NormalizationResultPreview(BaseModel):
    dataset_id: UUID
    dataset_name: str
    is_pneuma: bool
    records_before: int | None = None
    records_after: int
    source_columns: list[str] = Field(default_factory=list)
    preview: DatasetPreviewResponse


# =====================================================================
# BƯỚC 6: BÁO CÁO XỬ LÝ TỔNG HỢP (PROCESSING REPORT)
# =====================================================================

class DatasetFileSessionSummary(BaseModel):
    session_id: UUID
    original_filename: str
    drone_id: str
    recording_date: date
    scheduled_start: datetime
    scheduled_end: datetime
    file_size: int
    checksum: str
    upload_status: str


class ProcessingReportResponse(BaseModel):
    dataset_id: UUID
    dataset_name: str
    dataset_code: str
    file_id: UUID
    source_file_id: UUID | None = None
    source_session_count: int = 0
    source_sessions: list[DatasetFileSessionSummary] = Field(default_factory=list)
    file_format: str
    file_size_bytes: int
    file_size_mb: float
    records_before: int
    records_after: int
    cleaning_operation: str
    applied_mappings: dict
    quality_check_id: UUID | None
    created_at: datetime


class DatasetFileSubmitRequest(BaseModel):
    note: str | None = Field(
        default=None,
        description="Ghi chú gửi cho admin xem xét dữ liệu dataset",
    )


class DatasetFileSubmitResponse(BaseModel):
    dataset_id: UUID
    dataset_name: str | None = None
    file_id: UUID
    approval_status: str
    source_file_id: UUID | None = None
    source_session_count: int = 0
    source_sessions: list[DatasetFileSessionSummary] = Field(default_factory=list)
    submitted_by: UUID
    submitted_at: datetime
    message: str


class DatasetFileResubmitRequest(BaseModel):
    note: str | None = Field(
        default=None,
        description="Ghi chú khi data engineer gửi lại dữ liệu sau khi sửa theo phản hồi từ admin",
    )


class DatasetFileResubmitResponse(BaseModel):
    dataset_id: UUID
    dataset_name: str | None = None
    file_id: UUID
    approval_status: str
    source_file_id: UUID | None = None
    source_session_count: int = 0
    source_sessions: list[DatasetFileSessionSummary] = Field(default_factory=list)
    submitted_by: UUID
    submitted_at: datetime
    message: str


class DatasetFileListItem(BaseModel):
    dataset_id: UUID
    dataset_name: str | None = None
    code: str | None = None
    source: str | None = None
    description: str | None = None
    location_name: str | None = None
    capture_date: date | None = None
    recording_date: date | None = None
    group_id: UUID | None = None
    group_name: str | None = None
    file_id: UUID

    original_filename: str | None = None
    filename: str | None = None
    file_format: str | None = None
    file_size_bytes: int = 0
    total_records: int = 0
    total_records_known: bool = False
    source_file_id: UUID | None = None
    source_session_count: int = 0
    source_sessions: list[DatasetFileSessionSummary] = Field(default_factory=list)
    approval_status: str
    submitted_by: UUID | None = None
    submitted_at: datetime | None = None
    approved_by: UUID | None = None
    approval_note: str | None = None
    created_at: datetime
    updated_at: datetime | None = None


class DatasetFileStatusResponse(BaseModel):
    dataset_id: UUID
    dataset_name: str | None = None
    file_id: UUID
    approval_status: str
    source_file_id: UUID | None = None
    source_session_count: int = 0
    source_sessions: list["DatasetFileSessionSummary"] = Field(default_factory=list)
    submitted_by: UUID | None = None
    submitted_at: datetime | None = None
    approved_by: UUID | None = None
    approval_note: str | None = None
    message: str | None = None


class GroupDatasetFilesResponse(BaseModel):
    group_id: UUID
    total_datasets: int
    total_files: int
    dataset_files: list[DatasetFileListItem] = Field(default_factory=list)


class GroupFileSubmitRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"example": {"comment": "Đã kiểm tra dữ liệu, nhờ Admin duyệt nhóm."}})

    comment: str | None = Field(
        default=None,
        max_length=2000,
        description="Bình luận của Data Engineer gửi Admin khi duyệt các Dataset trong nhóm",
    )


class GroupFileStatusResponse(BaseModel):
    group_id: UUID
    staging_id: UUID
    total_datasets: int
    approval_status: Literal["PENDING", "SUBMITTED", "APPROVED", "REJECTED", "MIXED"]
    dataset_files: list[DatasetFileStatusResponse] = Field(default_factory=list)
    message: str | None = None


class GroupProcessingReportResponse(BaseModel):
    group_id: UUID
    staging_id: UUID
    total_datasets: int
    total_sessions: int
    total_records_before: int
    total_records_after: int
    reports: list[ProcessingReportResponse] = Field(default_factory=list)
