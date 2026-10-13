from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr


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


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role_id: str
    is_active: bool = True


class UserStatusUpdate(BaseModel):
    is_active: bool


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
    status: str  # APPROVED | REJECTED
    note: str | None = None
