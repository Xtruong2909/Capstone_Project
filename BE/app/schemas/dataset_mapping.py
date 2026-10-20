import re
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

COLUMN_NAME_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")


class DatasetColumnInfo(BaseModel):
    source_column: str
    data_type: str
    mapped_column: str | None
    is_mapped: bool


class DatasetColumnsResponse(BaseModel):
    dataset_id: UUID
    dataset_version_id: UUID
    columns: list[DatasetColumnInfo]


class DatasetColumnMappingInput(BaseModel):
    source_column: str = Field(min_length=1, max_length=512)
    target_column: str | None = Field(default=None, max_length=128)

    @field_validator("source_column")
    @classmethod
    def normalize_source_column(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Tên cột nguồn không được để trống")
        return value

    @field_validator("target_column")
    @classmethod
    def validate_target_column(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Tên cột đích không được để trống; dùng null để bỏ ánh xạ")
        if not COLUMN_NAME_PATTERN.fullmatch(value):
            raise ValueError(
                "Tên cột đích chỉ được chứa chữ cái, số và dấu gạch dưới, "
                "đồng thời phải bắt đầu bằng chữ cái"
            )
        return value


class DatasetColumnMappingsPatch(BaseModel):
    mappings: list[DatasetColumnMappingInput] = Field(max_length=512)


class DatasetColumnMappingItem(BaseModel):
    source_column: str
    target_column: str


class DatasetColumnMappingsResponse(BaseModel):
    dataset_id: UUID
    dataset_version_id: UUID
    mappings: list[DatasetColumnMappingItem] = Field(default_factory=list)
