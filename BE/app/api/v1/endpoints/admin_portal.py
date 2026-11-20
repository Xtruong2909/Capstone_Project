"""Admin portal read APIs; mutations use existing authorized Admin endpoints."""
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import require_admin
from app.database.database import get_db
from app.schemas.admin_portal import (
    AdminDatasetGroupItem,
    AdminDatasetItem,
    AdminGrantItem,
    AdminPage,
    AdminSummary,
)
from app.schemas.user import UserResponse
from app.services import admin_portal_service as service

router = APIRouter(dependencies=[Depends(require_admin)])
Page = Annotated[int, Query(ge=1)]
PageSize = Annotated[int, Query(ge=1, le=100)]
Search = Annotated[str | None, Query(max_length=255)]


@router.get("/summary", response_model=AdminSummary)
def summary(db: Session = Depends(get_db)) -> AdminSummary:
    return service.summary(db)


@router.get("/users", response_model=AdminPage[UserResponse])
def users(
    page: Page = 1, page_size: PageSize = 20, search: Search = None,
    role: Literal["admin", "data_engineer", "data_scientist", "business_user"] | None = None,
    is_active: bool | None = None, db: Session = Depends(get_db),
) -> AdminPage[UserResponse]:
    return service.users_page(db, page, page_size, search, role, is_active)


@router.get("/datasets", response_model=AdminPage[AdminDatasetItem])
def datasets(
    page: Page = 1, page_size: PageSize = 20, search: Search = None,
    approval_status: Literal["PENDING", "SUBMITTED", "APPROVED", "REJECTED"] | None = None,
    group_id: UUID | None = None, ungrouped: bool = False,
    db: Session = Depends(get_db),
) -> AdminPage[AdminDatasetItem]:
    return service.versions_page(db, page, page_size, search, approval_status, group_id, ungrouped)


@router.get("/dataset-groups", response_model=AdminPage[AdminDatasetGroupItem])
def dataset_groups(
    page: Page = 1, page_size: PageSize = 20, search: Search = None,
    approval_status: Literal["PENDING", "SUBMITTED", "APPROVED", "REJECTED"] | None = None,
    db: Session = Depends(get_db),
) -> AdminPage[AdminDatasetGroupItem]:
    return service.dataset_groups_page(db, page, page_size, search, approval_status)


@router.get("/access-grants", response_model=AdminPage[AdminGrantItem])
def grants(
    page: Page = 1, page_size: PageSize = 20, search: Search = None,
    db: Session = Depends(get_db),
) -> AdminPage[AdminGrantItem]:
    return service.grants_page(db, page, page_size, search)
