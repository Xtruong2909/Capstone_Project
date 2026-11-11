from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.dataset import DatasetPreviewResponse

# =====================================================================
# BƯỚC 4: CHUẨN HÓA CẤU TRÚC (NORMALIZE STRUCTURE)
# =====================================================================

class DatasetNormalizeResult(BaseModel):
    dataset_id: UUID
    source_version_id: UUID
    source_version_tag: str
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
        default="Chuẩn hóa cấu trúc thành công. Dữ liệu đã sẵn sàng để xuất phiên bản mới (Export)."
    )


# =====================================================================
# BƯỚC 5: XUẤT PHIÊN BẢN MỚI (EXPORT NORMALIZED DATASET)
# =====================================================================

class DatasetExportRequest(BaseModel):
    staging_id: UUID | None = Field(
        default=None,
        description="ID kết quả Normalize cần xuất; để trống sẽ dùng kết quả gần nhất của Dataset.",
    )
    new_version_tag: str | None = Field(
        default=None,
        description="Tag phiên bản mới; để trống hệ thống tự chọn tag chưa được dùng.",
    )
    export_format: Literal["PARQUET", "CSV"] = Field(
        default="PARQUET",
        description="Định dạng file Dataset Version được tạo.",
    )
class DatasetExportResult(BaseModel):
    dataset_id: UUID
    source_version_id: UUID
    source_session_count: int = Field(ge=1)
    version_id: UUID
    version_tag: str
    file_format: str
    file_size_bytes: int
    total_records: int
    cleaning_history_id: int
    message: str = Field(
        default="Đã xuất và tạo phiên bản dataset mới thành công."
    )


# =====================================================================
# BƯỚC 6: BÁO CÁO XỬ LÝ TỔNG HỢP (PROCESSING REPORT)
# =====================================================================

class DatasetVersionSessionSummary(BaseModel):
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
    version_id: UUID
    version_tag: str
    source_version_id: UUID | None = None
    source_version_tag: str | None = None
    source_session_count: int = 0
    source_sessions: list[DatasetVersionSessionSummary] = Field(default_factory=list)
    file_format: str
    file_size_bytes: int
    file_size_mb: float
    records_before: int
    records_after: int
    cleaning_operation: str
    applied_mappings: dict
    quality_check_id: UUID | None
    created_at: datetime


class DatasetVersionSubmitRequest(BaseModel):
    note: str | None = Field(
        default=None,
        description="Ghi chú gửi cho admin xem xét phiên bản dataset",
    )


class DatasetVersionSubmitResponse(BaseModel):
    dataset_id: UUID
    dataset_name: str | None = None
    version_id: UUID
    version_tag: str
    approval_status: str
    source_version_id: UUID | None = None
    source_version_tag: str | None = None
    source_session_count: int = 0
    source_sessions: list[DatasetVersionSessionSummary] = Field(default_factory=list)
    submitted_by: UUID
    submitted_at: datetime
    message: str


class DatasetVersionResubmitRequest(BaseModel):
    note: str | None = Field(
        default=None,
        description="Ghi chú khi data engineer gửi lại phiên bản sau khi sửa theo phản hồi từ admin",
    )


class DatasetVersionResubmitResponse(BaseModel):
    dataset_id: UUID
    dataset_name: str | None = None
    version_id: UUID
    version_tag: str
    approval_status: str
    source_version_id: UUID | None = None
    source_version_tag: str | None = None
    source_session_count: int = 0
    source_sessions: list[DatasetVersionSessionSummary] = Field(default_factory=list)
    submitted_by: UUID
    submitted_at: datetime
    message: str


class DatasetVersionListItem(BaseModel):
    dataset_id: UUID
    dataset_name: str | None = None
    version_id: UUID
    version_tag: str
    file_format: str | None = None
    file_size_bytes: int = 0
    total_records: int = 0
    source_version_id: UUID | None = None
    source_version_tag: str | None = None
    source_session_count: int = 0
    source_sessions: list[DatasetVersionSessionSummary] = Field(default_factory=list)
    approval_status: str
    submitted_by: UUID | None = None
    submitted_at: datetime | None = None
    approved_by: UUID | None = None
    approval_note: str | None = None
    created_at: datetime


class DatasetVersionStatusResponse(BaseModel):
    dataset_id: UUID
    dataset_name: str | None = None
    version_id: UUID
    version_tag: str
    approval_status: str
    source_version_id: UUID | None = None
    source_version_tag: str | None = None
    source_session_count: int = 0
    source_sessions: list["DatasetVersionSessionSummary"] = Field(default_factory=list)
    submitted_by: UUID | None = None
    submitted_at: datetime | None = None
    approved_by: UUID | None = None
    approval_note: str | None = None
    message: str | None = None
