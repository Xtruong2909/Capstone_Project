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
    AvailableResourcePage,
    BatchShareRequest,
    BatchShareResponse,
    BatchShareResult,
    GroupShareRequest,
    ManagedResourceShare,
    ManagedResourceSharePage,
    PublishedShareListResponse,
    PublishedShareSummary,
    ShareCatalogResponse,
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

    try:
        share = crud_sharing.create_share(
            db,
            title=payload.title,
            description=payload.description,
            created_by=current_user.id,
            status=payload.status,
            items_data=items_data,
        )
    except crud_sharing.DuplicateActiveShareError as exc:
        raise HTTPException(409, {"code": "DUPLICATE_ACTIVE_SHARE",
                                  "message": "Tài nguyên đã được chia sẻ."}) from exc

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
    try:
        share = crud_sharing.update_share(
            db,
            share=share,
            title=payload.title,
            description=payload.description,
            set_description="description" in payload.model_fields_set,
            status=payload.status,
            items_data=items_data,
        )
    except crud_sharing.DuplicateActiveShareError as exc:
        raise HTTPException(409, {"code": "DUPLICATE_ACTIVE_SHARE",
                                  "message": "Tài nguyên đã được chia sẻ."}) from exc

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


@ds_router.get("/available-resources", response_model=AvailableResourcePage)
def list_available_resources(
    resource_type: Literal["DATASET", "TRAIN_TEST", "EXPERIMENT", "PREDICTION"],
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AvailableResourcePage:
    _require_data_scientist(current_user)
    rows, total = sharing_service.available_resources(
        db, current_user, resource_type=resource_type,
        search=search, page=page, page_size=page_size,
    )
    return AvailableResourcePage(data=rows, total_records=total, page=page, page_size=page_size)


@ds_router.get("/catalog", response_model=ShareCatalogResponse)
def get_share_catalog(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ShareCatalogResponse:
    _require_data_scientist(current_user)
    return ShareCatalogResponse(batches=sharing_service.share_catalog(db, current_user))


@ds_router.post("/selection", response_model=ShareResponse, status_code=status.HTTP_201_CREATED)
def share_group_selection(
    payload: GroupShareRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    _require_data_scientist(current_user)
    title, items = sharing_service.prepare_group_share(
        db, current_user, payload.group_id, payload.experiment_ids, payload.prediction_ids,
    )
    try:
        share = crud_sharing.create_share(
            db, title=title, description=None, created_by=current_user.id,
            status="PUBLISHED", items_data=items,
        )
    except crud_sharing.DuplicateActiveShareError as exc:
        raise HTTPException(409, {"code": "DUPLICATE_ACTIVE_SHARE",
                                  "message": "Một tài nguyên trong batch đã được chia sẻ."}) from exc
    audit_log_service.record_audit_event(
        action="CREATE_SHARE", module="SHARING", status="SUCCESS",
        description=f"Shared batch {payload.group_id} with {len(items)} resources",
        user=current_user, resource_id=str(share.id), ip_address=_get_client_ip(request),
        details={"group_id": str(payload.group_id), "item_count": len(items)},
    )
    return share


@ds_router.post("/batch", response_model=BatchShareResponse)
def create_resource_share_batch(
    payload: BatchShareRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BatchShareResponse:
    _require_data_scientist(current_user)
    prepared, failures = sharing_service.prepare_resource_shares(
        db, current_user,
        [(item.resource_type, item.resource_id) for item in payload.resources],
    )
    created, duplicates = crud_sharing.create_resource_shares(
        db, owner_id=current_user.id, resources=prepared,
    ) if prepared else ([], set())
    results = [BatchShareResult.model_validate(item) for item in failures]
    created_by_key = {
        (share.items[0].resource_type, share.items[0].resource_id): share.id
        for share in created
    }
    for item in prepared:
        key = (item["resource_type"], item["resource_id"])
        share_id = created_by_key.get(key)
        results.append(BatchShareResult(
            resource_type=key[0], resource_id=key[1], success=share_id is not None,
            share_id=share_id,
            message="Tài nguyên đã được chia sẻ." if key in duplicates else None,
        ))
        if share_id:
            audit_log_service.record_audit_event(
                action="CREATE_SHARE", module="SHARING", status="SUCCESS",
                description=f"Shared {key[0]} {key[1]}", user=current_user,
                resource_id=str(share_id), ip_address=_get_client_ip(request),
                details={"resource_type": key[0], "resource_id": str(key[1])},
            )
    return BatchShareResponse(
        results=results, created_count=len(created), failed_count=len(results) - len(created),
    )


@ds_router.get("/manage", response_model=ManagedResourceSharePage)
def list_managed_resources(
    resource_type: Literal["DATASET", "TRAIN_TEST", "EXPERIMENT", "PREDICTION"] | None = Query(None),
    status_filter: Literal["DRAFT", "PUBLISHED", "REVOKED"] | None = Query(None, alias="status"),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ManagedResourceSharePage:
    _require_data_scientist(current_user)
    rows, total, active, revoked = crud_sharing.list_managed_resource_shares(
        db, owner_id=current_user.id, resource_type=resource_type,
        status=status_filter, search=search, page=page, page_size=page_size,
    )
    summaries = []
    for share in rows:
        if not share.items:
            continue
        item = next(
            (item for item in share.items if item.resource_type == resource_type),
            share.items[0],
        )
        summaries.append(ManagedResourceShare(
            share_id=share.id, resource_type=item.resource_type,
            resource_id=item.resource_id,
            name=share.title if len(share.items) > 1 else
            sharing_service.managed_resource_name(db, item, share.title),
            shared_by=share.created_by, shared_at=share.published_at,
            status=share.status, revoked_at=share.revoked_at,
            item_count=len(share.items),
        ))
    return ManagedResourceSharePage(
        data=summaries,
        total_records=total, page=page, page_size=page_size,
        active_count=active, revoked_count=revoked,
        unshared_count=sharing_service.count_unshared_resources(db, current_user),
    )


@ds_router.patch("/{share_id}/revoke", response_model=ShareResponse)
def revoke_resource_share(
    share_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    _require_data_scientist(current_user)
    share = crud_sharing.get_share_by_id(db, share_id, for_update=True)
    if share is None:
        raise HTTPException(404, {"code": "SHARE_NOT_FOUND", "message": "Không tìm thấy chia sẻ."})
    sharing_service.require_owner(share, current_user)
    if share.status != "PUBLISHED":
        raise HTTPException(409, {"code": "INVALID_SHARE_STATUS", "message": "Chia sẻ không còn hiệu lực."})
    share = crud_sharing.update_share(db, share=share, status="REVOKED")
    audit_log_service.record_audit_event(
        action="REVOKE_SHARE", module="SHARING", status="SUCCESS",
        description=f"Revoked share {share.id}", user=current_user,
        resource_id=str(share.id), ip_address=_get_client_ip(request),
    )
    return share


@ds_router.get("/{share_id}", response_model=SharedResultDetail)
def get_managed_share_detail(
    share_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SharedResultDetail:
    _require_data_scientist(current_user)
    share = crud_sharing.get_share_by_id(db, share_id)
    if share is None:
        raise HTTPException(404, {"code": "SHARE_NOT_FOUND", "message": "Không tìm thấy chia sẻ."})
    sharing_service.require_owner(share, current_user)
    return SharedResultDetail.model_validate(
        sharing_service.assemble_shared_result_detail(db, share)
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
