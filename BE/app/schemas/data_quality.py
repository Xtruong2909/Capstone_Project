from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

QualityCheckStatus = Literal["queued", "running", "completed", "failed"]
QualityIssueType = Literal[
    "missing_value",
    "duplicate_record",
    "invalid_timestamp",
    "invalid_coordinate",
    "invalid_format",
]


class DataQualityCheckStatus(BaseModel):
    check_id: UUID
    dataset_id: UUID
    dataset_version_id: UUID
    status: QualityCheckStatus
    progress_percent: int = Field(ge=0, le=100)
    processed_rows: int = Field(ge=0)
    total_rows: int | None = None
    error_message: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None


class DataQualityCheckStarted(DataQualityCheckStatus):
    message: str


class DataQualityIssueCount(BaseModel):
    total_errors: int
    affected_rows: int


class DataQualityColumnCount(BaseModel):
    column_name: str
    missing_values: int = 0
    total_values: int = 0
    missing_percent: float = 0
    errors: int = 0


class DataQualityReport(BaseModel):
    check_id: UUID
    dataset_id: UUID
    dataset_version_id: UUID
    status: Literal["completed"]
    detected_structure: str
    total_rows: int
    valid_rows: int
    invalid_rows: int
    total_errors: int
    errors_by_type: dict[str, DataQualityIssueCount]
    errors_by_column: list[DataQualityColumnCount]
    missing_values_by_column: list[DataQualityColumnCount]
    missing_required_columns: list[str]
    generated_at: datetime


class DataQualityIssueItem(BaseModel):
    row_number: int | None
    issue_type: str
    column_name: str | None
    message: str
    observed_value: str | None


class DataQualityIssuesPage(BaseModel):
    check_id: UUID
    page: int
    page_size: int
    total: int
    issues: list[DataQualityIssueItem]
