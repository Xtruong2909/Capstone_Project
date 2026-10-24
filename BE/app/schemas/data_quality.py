from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, model_validator

QualityCheckStatus = Literal["queued", "running", "completed", "failed"]
QualityIssueType = Literal[
    "missing_value",
    "duplicate_record",
    "invalid_timestamp",
    "invalid_coordinate",
    "invalid_format",
    "negative_speed",
    "outlier",
]


class DataQualityOutlierRule(BaseModel):
    """Bounds are inclusive; units describe both the input values and the bounds."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    field: Literal["speed", "avg_speed", "lon_acc", "lat_acc"]
    min_value: FiniteFloat | None = Field(default=None, strict=True)
    max_value: FiniteFloat | None = Field(default=None, strict=True)
    unit: Literal["km/h", "m/s^2"]
    basis: str = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def validate_bounds_and_unit(self) -> Self:
        if self.min_value is None and self.max_value is None:
            raise ValueError("Cần ít nhất một ngưỡng min_value hoặc max_value")
        if (
            self.min_value is not None
            and self.max_value is not None
            and self.min_value > self.max_value
        ):
            raise ValueError("min_value phải <= max_value")
        is_speed = self.field in {"speed", "avg_speed"}
        expected_unit = "km/h" if is_speed else "m/s^2"
        if self.unit != expected_unit:
            raise ValueError(f"{self.field} yêu cầu đơn vị {expected_unit}")
        if is_speed and any(
            bound is not None and bound < 0 for bound in (self.min_value, self.max_value)
        ):
            raise ValueError("Ngưỡng tốc độ phải >= 0; tốc độ âm là lỗi negative_speed")
        return self


class DataQualityCheckRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"examples": [{"outlier_rules": []}]},
    )

    outlier_rules: list[DataQualityOutlierRule] = Field(default_factory=list, max_length=4)

    @model_validator(mode="after")
    def validate_unique_fields(self) -> Self:
        if len({rule.field for rule in self.outlier_rules}) != len(self.outlier_rules):
            raise ValueError("Mỗi trường chỉ được có một outlier rule")
        return self


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


class DataQualityWarningCount(BaseModel):
    total_warnings: int
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
    total_warnings: int = 0
    warning_rows: int = 0
    warnings_by_type: dict[str, DataQualityWarningCount] = Field(default_factory=dict)
    warnings_by_column: dict[str, int] = Field(default_factory=dict)
    outlier_rules: list[DataQualityOutlierRule] = Field(default_factory=list)
    errors_by_type: dict[str, DataQualityIssueCount]
    errors_by_column: list[DataQualityColumnCount]
    missing_values_by_column: list[DataQualityColumnCount]
    missing_required_columns: list[str]
    generated_at: datetime


class DataQualityIssueItem(BaseModel):
    row_number: int | None
    issue_type: str
    severity: Literal["error", "warning"] = "error"
    column_name: str | None
    message: str
    observed_value: str | None


class DataQualityIssuesPage(BaseModel):
    check_id: UUID
    page: int
    page_size: int
    total: int
    issues: list[DataQualityIssueItem]
