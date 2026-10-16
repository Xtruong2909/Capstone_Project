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
