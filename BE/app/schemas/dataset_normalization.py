from datetime import datetime
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
    staging_id: UUID
    status: str = Field(default="normalized")
    records_before: int = Field(description="Số xe ban đầu trong file gốc")
    records_after: int = Field(description="Số điểm quỹ đạo sau khi bung dòng (unpivot)")
    source_columns: list[str]
    normalized_columns: list[str]
    preview: DatasetPreviewResponse
    message: str = Field(
        default="Chuẩn hóa cấu trúc thành công. Dữ liệu đã sẵn sàng để xuất phiên bản mới (Export)."
    )


class NormalizedDataValidationCounts(BaseModel):
    missing_values: int = Field(ge=0)
    duplicate_records: int = Field(ge=0)
    invalid_coordinates: int = Field(ge=0)
    negative_speed: int = Field(ge=0)


class NormalizedDataValidationResponse(BaseModel):
    dataset_id: UUID
    validation_status: Literal["completed"]
    total_rows: int = Field(ge=0)
    valid_rows: int = Field(ge=0)
    invalid_rows: int = Field(ge=0)
    validation_results: NormalizedDataValidationCounts


# =====================================================================
# BƯỚC 5: XUẤT PHIÊN BẢN MỚI (EXPORT NORMALIZED DATASET)
# =====================================================================

class DatasetExportRequest(BaseModel):
    staging_id: UUID | None = Field(
        default=None,
        description="ID phiên làm việc từ Bước 4 (nếu để trống, hệ thống tự lấy bản chuẩn hóa gần nhất)",
    )
    new_version_tag: str | None = Field(
        default=None,
        description="Tag phiên bản mới (mặc định tự tăng: v1.0-clean, v1.1...)",
    )
    export_format: Literal["PARQUET", "CSV"] = Field(
        default="PARQUET",
        description="Định dạng xuất: Khuyên dùng PARQUET để tối ưu dung lượng",
    )
    quality_check_id: UUID | None = Field(
        default=None,
        description="ID lần kiểm tra chất lượng ở Bước 3 (nếu có để gắn vào báo cáo)",
    )


class DatasetExportResult(BaseModel):
    dataset_id: UUID
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

class ProcessingReportResponse(BaseModel):
    dataset_id: UUID
    dataset_name: str
    dataset_code: str
    version_id: UUID
    version_tag: str
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
    version_id: UUID
    version_tag: str
    approval_status: str
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
    version_id: UUID
    version_tag: str
    approval_status: str
    submitted_by: UUID
    submitted_at: datetime
    message: str


class DatasetVersionListItem(BaseModel):
    dataset_id: UUID
    version_id: UUID
    version_tag: str
    approval_status: str
    submitted_by: UUID | None = None
    submitted_at: datetime | None = None
    approved_by: UUID | None = None
    approval_note: str | None = None
    created_at: datetime


class DatasetVersionStatusResponse(BaseModel):
    dataset_id: UUID
    version_id: UUID
    version_tag: str
    approval_status: str
    submitted_by: UUID | None = None
    submitted_at: datetime | None = None
    approved_by: UUID | None = None
    approval_note: str | None = None
    message: str | None = None
