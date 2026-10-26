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


class AccessibleDataset(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    code: str
    source: str
    description: str | None
    capture_date: date | None
    location_name: str
    created_at: datetime
