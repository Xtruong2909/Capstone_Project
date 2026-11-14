"""Quản lý chia sẻ kết quả nghiên cứu cho Data Scientist và Business User."""
from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.crud import crud_sharing
from app.models.user import User
from app.schemas.sharing import (
    PublishedShareListResponse,
    PublishedShareSummary,
    ShareCreate,
    SharedItemPage,
    SharedResultDetail,
    ShareListItem,
    ShareListResponse,
    ShareResponse,
    ShareUpdate,
)
from app.services import audit_log_service, sharing_service

ds_router = APIRouter()
bu_router = APIRouter()


# ── helpers ───────────────────────────────────────────────────────────────────

def _require_data_scientist(user: User) -> None:
    if user.role_id not in ("data_scientist", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "SHARE_ACCESS_DENIED",
                "message": "Only Data Scientists can manage shares",
            },
        )


def _require_business_user(user: User) -> None:
    if user.role_id not in ("business_user", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "SHARE_ACCESS_DENIED",
                "message": "Only Business Users can view shared results",
            },
        )


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ── POST /api/shares ──────────────────────────────────────────────────────────

@ds_router.post(
    "",
    response_model=ShareResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tạo bản chia sẻ kết quả",
)
def create_share(
    payload: ShareCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    _require_data_scientist(current_user)
    ip = _get_client_ip(request)

    items_data = [
        {
            "resource_type": item.resource_type,
            "resource_id": item.resource_id,
            "visible_sections": item.visible_sections,
        }
        for item in payload.items
    ]
    sharing_service.validate_share_status(
        None, payload.status, len(items_data),
        any(item["visible_sections"] for item in items_data),
    )
    sharing_service.validate_and_check_items(db, items_data, current_user)

    share = crud_sharing.create_share(
        db,
        title=payload.title,
        description=payload.description,
        created_by=current_user.id,
        status=payload.status,
        items_data=items_data,
    )

    audit_log_service.record_audit_event(
        action="SHARE_CREATED",
        module="SHARING",
        status="SUCCESS",
        description=f"Share '{share.title}' created with status {share.status}",
        user=current_user,
        resource_id=str(share.id),
        ip_address=ip,
        details={
            "share_id": str(share.id),
            "status": share.status,
            "item_count": len(items_data),
        },
    )
    if share.status == "PUBLISHED":
        audit_log_service.record_audit_event(
            action="SHARE_PUBLISHED",
            module="SHARING",
            status="SUCCESS",
            description=f"Share '{share.title}' published",
            user=current_user,
            resource_id=str(share.id),
            ip_address=ip,
        )
    if items_data:
        audit_log_service.record_audit_event(
            action="SHARE_ITEM_ADDED", module="SHARING", status="SUCCESS",
            description=f"{len(items_data)} share items added", user=current_user,
            resource_id=str(share.id), ip_address=ip,
            details={"item_count": len(items_data)},
        )
    return share


# ── PATCH /api/shares/{share_id} ─────────────────────────────────────────────

@ds_router.patch(
    "/{share_id}",
    response_model=ShareResponse,
    summary="Cập nhật hoặc thu hồi bản chia sẻ; items thay thế toàn bộ danh sách",
)
def update_share(
    share_id: UUID,
    payload: ShareUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    _require_data_scientist(current_user)
    ip = _get_client_ip(request)

    share = crud_sharing.get_share_by_id(db, share_id, for_update=True)
    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SHARE_NOT_FOUND", "message": f"Share {share_id} not found"},
        )
    sharing_service.require_owner(share, current_user)

    items_data: list[dict] | None = None
    if payload.items is not None:
        items_data = [
            {
                "resource_type": item.resource_type,
                "resource_id": item.resource_id,
                "visible_sections": item.visible_sections,
            }
            for item in payload.items
        ]
        sharing_service.validate_and_check_items(db, items_data, current_user)

    effective_status = payload.status if payload.status is not None else share.status
    effective_items = items_data if items_data is not None else share.items
    sharing_service.validate_share_status(
        share.status, effective_status, len(effective_items),
        any(
            item["visible_sections"] if isinstance(item, dict) else item.visible_sections
            for item in effective_items
        ),
    )
    old_items = {(item.resource_type, item.resource_id) for item in share.items}

    old_status = share.status
    old_sections = {
        (item.resource_type, str(item.resource_id)): list(item.visible_sections)
        for item in share.items
    }
    share = crud_sharing.update_share(
        db,
        share=share,
        title=payload.title,
        description=payload.description,
        set_description="description" in payload.model_fields_set,
        status=payload.status,
        items_data=items_data,
    )

    new_sections = {
        (item.resource_type, str(item.resource_id)): list(item.visible_sections)
        for item in share.items
    }
    section_changes = [
        {"resource_type": kind, "resource_id": resource_id,
         "before": old_sections[(kind, resource_id)],
         "after": new_sections[(kind, resource_id)]}
        for kind, resource_id in sorted(old_sections.keys() & new_sections.keys())
        if old_sections[(kind, resource_id)] != new_sections[(kind, resource_id)]
    ]
    audit_log_service.record_audit_event(
        action="SHARE_UPDATED",
        module="SHARING",
        status="SUCCESS",
        description=f"Share '{share.title}' updated",
        user=current_user,
        resource_id=str(share.id),
        ip_address=ip,
        details={
            "old_status": old_status, "new_status": share.status,
            "section_changes": section_changes,
            "added_items": len(new_sections.keys() - old_sections.keys()),
            "removed_items": len(old_sections.keys() - new_sections.keys()),
        },
    )
    if old_status != "PUBLISHED" and share.status == "PUBLISHED":
        audit_log_service.record_audit_event(
            action="SHARE_PUBLISHED",
            module="SHARING",
            status="SUCCESS",
            description=f"Share '{share.title}' published",
            user=current_user,
            resource_id=str(share.id),
            ip_address=ip,
        )
    elif share.status == "REVOKED":
        audit_log_service.record_audit_event(
            action="SHARE_REVOKED",
            module="SHARING",
            status="SUCCESS",
            description=f"Share '{share.title}' revoked",
            user=current_user,
            resource_id=str(share.id),
            ip_address=ip,
        )
    new_items = {(item.resource_type, item.resource_id) for item in share.items}
    for action, changed in (
        ("SHARE_ITEM_ADDED", new_items - old_items),
        ("SHARE_ITEM_REMOVED", old_items - new_items),
    ):
        if changed:
            audit_log_service.record_audit_event(
                action=action, module="SHARING", status="SUCCESS",
                description=f"{len(changed)} share items changed", user=current_user,
                resource_id=str(share.id), ip_address=ip,
                details={"item_count": len(changed)},
            )
    return share


# ── GET /api/shares/mine ──────────────────────────────────────────────────────

@ds_router.get(
    "/mine",
    response_model=ShareListResponse,
    summary="Danh sách bản chia sẻ của tôi",
)
def list_my_shares(
    status_filter: Literal["DRAFT", "PUBLISHED", "REVOKED"] | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    _require_data_scientist(current_user)

    shares, total = crud_sharing.get_shares_by_owner(
        db,
        owner_id=current_user.id,
        status=status_filter,
        search=search,
        page=page,
        page_size=page_size,
    )

    items = [
        ShareListItem(
            share_id=s.id,
            title=s.title,
            status=s.status,
            item_count=len(s.items),
            resource_types=list({item.resource_type for item in s.items}),
            created_at=s.created_at,
            updated_at=s.updated_at,
            published_at=s.published_at,
        )
        for s in shares
    ]

    return ShareListResponse(
        data=items,
        total_records=total,
        page=page,
        page_size=page_size,
    )


# ── GET /api/shared-results ───────────────────────────────────────────────────

@bu_router.get(
    "",
    response_model=PublishedShareListResponse,
    summary="Danh sách kết quả đã công bố",
)
def list_shared_results(
    resource_type: Literal["DATASET", "TRAIN_TEST", "EXPERIMENT", "PREDICTION"] | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    _require_business_user(current_user)

    shares, total = crud_sharing.get_published_shares(
        db,
        resource_type=resource_type,
        search=search,
        page=page,
        page_size=page_size,
    )

    data = [
        PublishedShareSummary(
            share_id=s.id,
            title=s.title,
            published_at=s.published_at,
            available_sections=list({item.resource_type for item in s.items}),
        )
        for s in shares
    ]

    return PublishedShareListResponse(data=data, total_records=total)


# ── GET /api/shared-results/{share_id} ───────────────────────────────────────

@bu_router.get(
    "/{share_id}",
    response_model=SharedResultDetail,
    summary="Xem chi tiết kết quả được chia sẻ",
)
def get_shared_result_detail(
    share_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    _require_business_user(current_user)

    share = sharing_service.require_published_share(db, share_id)
    return sharing_service.assemble_shared_result_detail(db, share)


@bu_router.get(
    "/{share_id}/items/{item_id}/rows",
    response_model=SharedItemPage,
    summary="Xem nội dung chia sẻ có phân trang",
)
def get_shared_item_rows(
    share_id: UUID,
    item_id: UUID,
    section: Literal[
        "sessions", "traffic_flow_chart", "prediction_rows", "forecast_results", "forecast_chart",
    ],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SharedItemPage:
    _require_business_user(current_user)
    share = sharing_service.require_published_share(db, share_id)
    item = next((item for item in share.items if item.id == item_id), None)
    if item is None:
        raise HTTPException(404, {"code": "SHARE_NOT_FOUND", "message": "Không tìm thấy nội dung"})
    return SharedItemPage.model_validate(
        sharing_service.page_item_section(db, share, item, section, page, page_size)
    )
