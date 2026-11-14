"""Pydantic v2 schemas for Result Sharing Management."""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# ── Item schemas ──────────────────────────────────────────────────────────────

class ShareItemCreate(BaseModel):
    resource_type: str
    resource_id: UUID
    visible_sections: list[str] = Field(default_factory=list)


class ShareItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    share_id: UUID
    resource_type: str
    resource_id: UUID
    resource_version_id: UUID | None = None
    visible_sections: list[str]
    created_at: datetime
    updated_at: datetime


# ── Report schemas ────────────────────────────────────────────────────────────

class ShareCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    status: str = "DRAFT"
    items: list[ShareItemCreate] = Field(default_factory=list)

class ShareUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    status: str | None = None
    items: list[ShareItemCreate] | None = None  # None = no change; list = full replace

class ShareResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    share_id: UUID = Field(validation_alias="id")
    title: str
    description: str | None
    created_by: UUID
    visibility: str
    status: str
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None
    revoked_at: datetime | None
    items: list[ShareItemResponse] = Field(default_factory=list)


class ShareListItem(BaseModel):
    """Lightweight summary used by GET /api/shares/mine."""
    model_config = ConfigDict(from_attributes=True)

    share_id: UUID
    title: str
    status: str
    item_count: int = 0
    resource_types: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None


class ShareListResponse(BaseModel):
    data: list[ShareListItem]
    total_records: int
    page: int
    page_size: int


# ── Business User view schemas ────────────────────────────────────────────────

class PublishedShareSummary(BaseModel):
    """Used by GET /api/shared-results list."""
    share_id: UUID
    title: str
    published_at: datetime | None
    available_sections: list[str] = Field(default_factory=list)


class PublishedShareListResponse(BaseModel):
    data: list[PublishedShareSummary]
    total_records: int


class SharedResourceData(BaseModel):
    """One resource block in the detail response."""
    resource_type: str
    resource_id: UUID
    item_id: UUID
    resource_version_id: UUID | None = None
    visible_sections: list[str]
    data: dict[str, Any] = Field(default_factory=dict)


class SharedResultDetail(BaseModel):
    """Used by GET /api/shared-results/{share_id}."""
    share_id: UUID
    title: str
    status: str
    resources: list[SharedResourceData] = Field(default_factory=list)


class SharedItemPage(BaseModel):
    share_id: UUID
    item_id: UUID
    section: str
    page: int
    page_size: int
    total_records: int
    data: list[dict[str, Any]]
