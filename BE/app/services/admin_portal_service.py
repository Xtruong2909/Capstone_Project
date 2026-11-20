"""Serialize Admin pages without exposing internal user or dataset fields."""
from uuid import UUID

from sqlalchemy.orm import Session

from app.crud import crud_admin_portal as repo
from app.schemas.admin_portal import (
    AdminDatasetGroupItem,
    AdminDatasetItem,
    AdminGrantItem,
    AdminPage,
    AdminSummary,
)
from app.schemas.user import UserResponse


def users_page(
    db: Session, page: int, page_size: int, search: str | None,
    role: str | None, is_active: bool | None,
) -> AdminPage[UserResponse]:
    total, rows = repo.users_page(db, page, page_size, search, role, is_active)
    return AdminPage[UserResponse](items=[UserResponse.model_validate(row) for row in rows],
                                   total=total, page=page, page_size=page_size)


def versions_page(
    db: Session, page: int, page_size: int, search: str | None, approval_status: str | None,
    group_id: UUID | None = None, ungrouped: bool = False,
) -> AdminPage[AdminDatasetItem]:
    total, rows = repo.versions_page(db, page, page_size, search, approval_status, group_id, ungrouped)
    return AdminPage[AdminDatasetItem](items=rows, total=total, page=page, page_size=page_size)


def dataset_groups_page(
    db: Session, page: int, page_size: int, search: str | None, approval_status: str | None,
) -> AdminPage[AdminDatasetGroupItem]:
    total, rows = repo.dataset_groups_page(db, page, page_size, search, approval_status)
    return AdminPage[AdminDatasetGroupItem](items=rows, total=total, page=page, page_size=page_size)


def grants_page(db: Session, page: int, page_size: int, search: str | None) -> AdminPage[AdminGrantItem]:
    total, rows = repo.grants_page(db, page, page_size, search)
    return AdminPage[AdminGrantItem](items=rows, total=total, page=page, page_size=page_size)


def summary(db: Session) -> AdminSummary:
    return AdminSummary.model_validate(repo.summary(db))
