from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class DatasetAccessRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: UUID


class EligibleDatasetUser(BaseModel):
    user_id: UUID
    full_name: str
    email: str
    role: str
    has_access: bool


class DatasetAccessResponse(BaseModel):
    id: UUID
    dataset_id: UUID
    user_id: UUID
    full_name: str
    email: str
    role: str
    granted_by: UUID | None
    granted_at: datetime


class GroupAccessCatalogItem(BaseModel):
    group_id: UUID
    group_name: str | None
    source: str
    drone_id: str
    total_datasets: int
    approved_datasets: int


class GroupUserAccess(BaseModel):
    user_id: UUID
    full_name: str
    email: str
    role: str
    granted_datasets: int
    total_datasets: int
    has_full_access: bool


class GroupAccessResponse(BaseModel):
    group_id: UUID
    user_id: UUID
    total_datasets: int
    granted_datasets: int
    grants: list[DatasetAccessResponse]


class AccessibleDataset(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    code: str
    source: str
    description: str | None
    capture_date: date | None
    recording_date: date | None = None
    drone_id: str | None = None
    location_name: str
    created_at: datetime


class ApprovedDatasetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    dataset_id: UUID
    dataset_name: str
    dataset_code: str
    source: str
    location_name: str
    recording_date: date | None = None
    drone_id: str | None = None
    version_id: UUID
    version_tag: str
    approval_status: str
    approved_by: UUID | None
