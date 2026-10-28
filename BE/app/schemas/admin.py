from datetime import datetime
from enum import IntEnum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class AdminStats(BaseModel):
    total_users: int
    total_roles: int
    total_datasets: int
    pending_approvals: int
    total_audit_logs: int


class RoleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None = None


class UserRoleId(IntEnum):
    DATA_ENGINEER = 2
    DATA_SCIENTIST = 3
    BUSINESS_USER = 4


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    role_id: UserRoleId
    is_active: bool = True

    @field_validator("role_id", mode="before")
    @classmethod
    def support_existing_role_ids(cls, value: object) -> object:
        existing_role_ids = {
            "business_user": UserRoleId.BUSINESS_USER,
            "data_engineer": UserRoleId.DATA_ENGINEER,
            "data_scientist": UserRoleId.DATA_SCIENTIST,
        }
        if isinstance(value, str) and value in existing_role_ids:
            return existing_role_ids[value]
        return value


class UserStatusUpdate(BaseModel):
    is_active: bool = Field(
        description="true để kích hoạt tài khoản; false để khóa tài khoản và chặn truy cập API."
    )


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: UUID | None = None
    user_email: str | None = None
    action: str
    resource_type: str
    resource_id: str | None = None
    details: dict | None = None
    ip_address: str | None = None
    created_at: datetime


class DatasetApprovalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    dataset_id: UUID
    dataset_name: str
    version_tag: str
    file_format: str
    total_records: int
    approval_status: str
    created_at: datetime


class DatasetApprovalAction(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "status": "APPROVED",
                "note": "Đạt tiêu chuẩn chất lượng",
            }
        }
    )

    status: Literal["APPROVED", "REJECTED"] = Field(
        description="Chọn APPROVED để phê duyệt hoặc REJECTED để từ chối."
    )
    note: str | None = Field(default=None, description="Ghi chú xử lý (không bắt buộc).")


class ExperimentMetricsSummary(BaseModel):
    mae: float
    rmse: float


class ExperimentOverviewItem(BaseModel):
    id: UUID
    name: str
    model_type: str
    target_variable: str
    temporal_aggregation_sec: int
    status: str
    execution_time_sec: float | None = None
    creator_name: str | None = None
    dataset_version_tag: str | None = None
    dataset_name: str | None = None
    metrics: ExperimentMetricsSummary | None = None
    created_at: datetime


class ExperimentStats(BaseModel):
    total_experiments: int
    running_count: int
    completed_count: int
    failed_count: int


class ExperimentsOverviewResponse(BaseModel):
    stats: ExperimentStats
    experiments: list[ExperimentOverviewItem]
