from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class DatasetPreviewColumn(BaseModel):
    name: str
    type: str


class DatasetPreviewPagination(BaseModel):
    page: int
    page_size: int
    returned_rows: int
    has_more: bool
    total_rows: int | None = None


class DatasetPreviewResponse(BaseModel):
    dataset_id: UUID
    dataset_version_id: UUID | None = None
    dataset_name: str
    original_filename: str
    file_format: str
    file_size: int
    status: str
    detected_structure: str = "unknown"
    representation: str = "raw"
    warnings: list[str] = Field(default_factory=list)
    columns: list[DatasetPreviewColumn]
    rows: list[dict[str, Any]]
    pagination: DatasetPreviewPagination


class DatasetUploadMetadata(BaseModel):
    name: str = Field(min_length=3, max_length=128)
    source: str = Field(min_length=1, max_length=255)
    location_name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    capture_date: date | None = None


class DatasetUploadResponse(BaseModel):
    dataset_id: UUID
    version_id: UUID
    name: str
    code: str
    source: str
    description: str | None
    capture_date: date | None
    location_name: str
    version_tag: str
    file_format: str
    original_filename: str
    file_size_bytes: int
    approval_status: str
    created_at: datetime


class RecordingUploadResult(BaseModel):
    original_filename: str
    dataset_name: str | None = None
    status: str = Field(description="UPLOADED, DUPLICATE, CONFLICT, or ERROR")
    session_id: UUID | None = None
    error_message: str | None = None


class UploadedRecordingSession(BaseModel):
    session_id: UUID
    original_filename: str
    scheduled_start: datetime
    scheduled_end: datetime
    status: str = Field(description="UPLOADED or EXISTING")


class DatasetUploadGroup(BaseModel):
    name: str
    group_id: UUID | None = None
    group_name: str | None = None
    dataset_id: UUID | None = None
    version_id: UUID | None = None
    recording_date: date | None = None
    drone_id: str | None = None
    session_count: int = 0
    sessions: list[UploadedRecordingSession] = Field(default_factory=list)


class DatasetBatchUploadResponse(BaseModel):
    group_id: UUID | None = Field(
        default=None,
        description="ID chung khi mọi Dataset trong lô thuộc cùng một drone; null nếu nhiều nhóm hoặc không có Dataset thành công.",
    )
    group_name: str | None = None
    total_files: int
    uploaded_count: int
    duplicate_count: int
    failed_count: int
    datasets: list[DatasetUploadGroup]
    files: list[RecordingUploadResult]

    model_config = {"json_schema_extra": {"examples": [{
        "group_id": "35a8c86a-5149-4381-915d-5bb62ec5d307",
        "total_files": 2, "uploaded_count": 2, "duplicate_count": 0,
        "failed_count": 0,
        "datasets": [
            {
                "name": "20181024-d1", "dataset_id": "f50c1d5b-b61f-4261-a37c-786621e4bc9e",
                "version_id": "ea58ebdc-267a-4182-adf7-8db320c12fa7",
                "recording_date": "2018-10-24", "drone_id": "d1", "session_count": 1,
                "sessions": [{"session_id": "460a797f-5d1d-4fb9-81de-5fbfbfe9664c",
                              "original_filename": "20181024_d1_0830_0900.csv",
                              "scheduled_start": "2018-10-24T08:30:00+03:00",
                              "scheduled_end": "2018-10-24T09:00:00+03:00",
                              "status": "UPLOADED"}],
            },
            {
                "name": "20181029-d1", "dataset_id": "f1261b53-b61f-4261-a37c-786621e4bc9e",
                "version_id": "f3a8ebdc-267a-4182-adf7-8db320c12fa7",
                "recording_date": "2018-10-29", "drone_id": "d1", "session_count": 1,
                "sessions": [{"session_id": "ea2a797f-5d1d-4fb9-81de-5fbfbfe9664c",
                              "original_filename": "20181029_d1_0800_0830.csv",
                              "scheduled_start": "2018-10-29T08:00:00+02:00",
                              "scheduled_end": "2018-10-29T08:30:00+02:00",
                              "status": "UPLOADED"}],
            },
        ],
        "files": [
            {"original_filename": "20181024_d1_0830_0900.csv", "dataset_name": "20181024-d1",
             "status": "UPLOADED", "session_id": "460a797f-5d1d-4fb9-81de-5fbfbfe9664c"},
            {"original_filename": "20181029_d1_0800_0830.csv", "dataset_name": "20181029-d1",
             "status": "UPLOADED", "session_id": "ea2a797f-5d1d-4fb9-81de-5fbfbfe9664c"},
        ],
    }]}}


class DatasetUploadJobResponse(BaseModel):
    group_id: UUID | None = Field(
        default=None,
        description="ID chung sau khi xử lý xong; null khi đang xử lý hoặc lô chứa nhiều nhóm.",
    )
    group_name: str | None = None
    job_id: UUID
    status: str
    total_files: int
    processed_files: int
    result: DatasetBatchUploadResponse | None = None
    error_message: str | None = None


class UploadedDatasetSummary(BaseModel):
    dataset_id: UUID
    group_id: UUID | None = None
    group_name: str | None = None
    name: str
    version_id: UUID
    version: str
    drone_id: str
    recording_date: date
    total_sessions: int
    approval_status: str


class UploadedDatasetGroupSummary(BaseModel):
    group_id: UUID
    group_name: str | None = None
    source: str
    drone_id: str
    dataset_count: int
    total_sessions: int
    datasets: list[UploadedDatasetSummary] | None = None


class GroupDatasetListResponse(BaseModel):
    group_id: UUID
    group_name: str | None = None
    datasets: list[UploadedDatasetSummary]
    total: int


class UploadedDatasetListResponse(BaseModel):
    groups: list[UploadedDatasetGroupSummary]
    total: int
    page: int
    page_size: int


class UploadedDatasetDetail(UploadedDatasetSummary):
    source: str
    location_name: str
    description: str | None = None
    related_datasets: list[UploadedDatasetSummary] = Field(default_factory=list)


class RecordingSessionDetail(BaseModel):
    session_id: UUID
    dataset_id: UUID
    group_id: UUID | None = None
    version_id: UUID
    original_filename: str
    drone_id: str
    recording_date: date
    file_size: int
    scheduled_start: datetime
    scheduled_end: datetime
    scheduled_duration_seconds: int
    actual_duration_seconds: int | None = None
    checksum: str
    upload_status: str
    validation_status: str | None = None
    validation_message: str = "Chưa có kết quả xác minh ở cấp Recording Session"


class RecordingSessionListResponse(BaseModel):
    dataset_id: UUID
    version_id: UUID
    total: int
    page: int
    page_size: int
    sessions: list[RecordingSessionDetail]


class RecordingSessionPreviewResponse(BaseModel):
    session_id: UUID
    dataset_id: UUID
    version_id: UUID
    dataset_version_id: UUID
    dataset_name: str
    original_filename: str
    file_format: str
    file_size: int
    status: str
    detected_structure: str
    representation: str = "normalized"
    mapping_applied: bool = False
    columns: list[DatasetPreviewColumn]
    total_columns: int
    column_offset: int
    has_more_columns: bool
    rows: list[dict[str, Any]]
    rows_read: int
    pagination: DatasetPreviewPagination
    warnings: list[str] = Field(default_factory=list)

    model_config = {"json_schema_extra": {"examples": [{
        "session_id": "460a797f-5d1d-4fb9-81de-5fbfbfe9664c",
        "dataset_id": "f50c1d5b-b61f-4261-a37c-786621e4bc9e",
        "version_id": "ea58ebdc-267a-4182-adf7-8db320c12fa7",
        "dataset_version_id": "ea58ebdc-267a-4182-adf7-8db320c12fa7",
        "dataset_name": "20181024-d1",
        "original_filename": "20181024_d1_0830_0900.csv",
        "file_format": "csv",
        "file_size": 96,
        "status": "UPLOADED",
        "detected_structure": "pneuma_trajectory",
        "representation": "normalized",
        "columns": [{"name": "track_id", "type": "integer"},
                    {"name": "type", "type": "string"},
                    {"name": "traveled_d", "type": "float"},
                    {"name": "avg_speed", "type": "float"},
                    {"name": "lat", "type": "float"},
                    {"name": "lon", "type": "float"},
                    {"name": "speed", "type": "float"},
                    {"name": "lon_acc", "type": "float"},
                    {"name": "lat_acc", "type": "float"},
                    {"name": "time", "type": "float"}],
        "total_columns": 10,
        "column_offset": 0,
        "has_more_columns": False,
        "rows": [{"track_id": 1, "type": "Bus", "traveled_d": 17.84,
                  "avg_speed": 17.835195, "lat": 37.977149, "lon": 23.737802,
                  "speed": 21.6886, "lon_acc": 0.0571, "lat_acc": 0.306,
                  "time": 0}],
        "rows_read": 1,
        "pagination": {"page": 1, "page_size": 20, "returned_rows": 1,
                       "has_more": False, "total_rows": 1},
        "warnings": [],
    }]}}
