from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database.database import get_db
from app.models.user import User
from app.schemas.lag_feature import (
    LagSplitPreviewResponse,
    LagTrainTestSplitRequest,
    LagTrainTestSplitResponse,
)
from app.services import train_test_splits_service as service

router = APIRouter(prefix="/train-test-splits", tags=["Train/Test Split"])


@router.post(
    "",
    response_model=LagTrainTestSplitResponse,
    status_code=201,
    summary="Tạo Train/Test Split từ Feature Generation đã lưu",
)
def create_split(
    payload: LagTrainTestSplitRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LagTrainTestSplitResponse:
    return service.create_train_test_split(db, user, payload)


@router.get(
    "/{split_id}",
    response_model=LagTrainTestSplitResponse,
    summary="Xem cấu hình và kết quả Train/Test Split",
)
def get_split(
    split_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LagTrainTestSplitResponse:
    return service.get_train_test_split(db, user, split_id)


@router.get(
    "/{split_id}/preview",
    response_model=LagSplitPreviewResponse,
    summary="Xem trước mẫu Train hoặc Test",
)
def preview_split(
    split_id: UUID,
    subset: Literal["TRAIN", "TEST"],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    session_id: UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LagSplitPreviewResponse:
    return service.preview_train_test_split(
        db, user, split_id, subset, page, page_size, session_id,
    )
