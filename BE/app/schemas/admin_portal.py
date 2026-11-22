"""Typed pages used by the administrator portal."""
from datetime import datetime
from typing import Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel

from app.schemas.admin import DatasetApprovalResponse

T = TypeVar("T")


class AdminPage(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class AdminDatasetItem(DatasetApprovalResponse):
    group_id: UUID | None = None
    group_name: str | None = None
    approval_note: str | None = None


class AdminDatasetGroupItem(BaseModel):
    group_id: UUID | None
    group_name: str | None
    dataset_count: int
    file_count: int
    approval_status: str
    approval_notes: list[str]


class AdminGrantItem(BaseModel):
    id: UUID
    dataset_id: UUID
    dataset_name: str
    user_id: UUID
    user_name: str
    user_email: str
    user_role: str
    granted_by_email: str | None
    created_at: datetime


class AdminBatchGrantItem(BaseModel):
    group_id: UUID | None
    group_name: str | None
    dataset_id: UUID | None
    dataset_name: str | None
    user_id: UUID
    user_name: str
    user_email: str
    user_role: str
    granted_datasets: int
    total_datasets: int
    created_at: datetime


class AdminSummary(BaseModel):
    total_users: int
    active_users: int
    users_by_role: dict[str, int]
    total_datasets: int
    total_files: int
    pending_approvals: int
    approved_files: int
    total_audit_logs: int
    total_access_grants: int
