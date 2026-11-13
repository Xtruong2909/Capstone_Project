"""Persisted Lag Feature Generation for vehicle-count aggregation."""

from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database.database import get_db
from app.models.user import User
from app.schemas.lag_feature import (
    LagGenerationRequest,
    LagGenerationStatus,
    LagPreviewResponse,
    LagSessionResponse,
    LagSummaryResponse,
)
from app.services import lag_feature_service as service

router = APIRouter(prefix="/lag-features", tags=["Lag Feature Generation"])


@router.post("/generate", response_model=LagGenerationStatus, summary="Tạo Lag Features từ Aggregation đã hoàn tất")
def generate(
    payload: LagGenerationRequest,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
) -> LagGenerationStatus:
    return service.generate_lag_features(db, user, payload)


@router.get("/{feature_generation_id}", response_model=LagGenerationStatus, summary="Xem trạng thái Feature Generation")
def status(
    feature_generation_id: UUID = Path(description="ID trả về từ POST /api/lag-features/generate"),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
) -> LagGenerationStatus:
    return service.get_generation_status(db, user, feature_generation_id)


@router.get("/{feature_generation_id}/sessions", response_model=LagSessionResponse, summary="Số mẫu theo Recording Session")
def sessions(
    feature_generation_id: UUID = Path(description="ID trả về từ POST /api/lag-features/generate"),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
) -> LagSessionResponse:
    return service.get_generation_sessions(db, user, feature_generation_id)


@router.get("/{feature_generation_id}/preview", response_model=LagPreviewResponse, summary="Xem bảng Lag Features và Targets")
def preview(
    feature_generation_id: UUID = Path(description="ID trả về từ POST /api/lag-features/generate"),
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
) -> LagPreviewResponse:
    return service.get_generation_preview(db, user, feature_generation_id, page, page_size)


@router.get("/{feature_generation_id}/summary", response_model=LagSummaryResponse, summary="Thống kê mẫu hợp lệ theo horizon")
def summary(
    feature_generation_id: UUID = Path(description="ID trả về từ POST /api/lag-features/generate"),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
) -> LagSummaryResponse:
    return service.get_generation_summary(db, user, feature_generation_id)
