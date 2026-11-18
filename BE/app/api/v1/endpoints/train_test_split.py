from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database.database import get_db
from app.models.user import User
from app.schemas.train_test_split import TrainTestSplitRequest, TrainTestSplitResponse
from app.services.audit_log_service import audit_action
from app.services.train_test_split_service import prepare_training_split

router = APIRouter(prefix="/train-test-split", tags=["Chia dữ liệu Train/Test"])


@router.post("/training", response_model=TrainTestSplitResponse, summary="Chia dữ liệu Train/Test để huấn luyện")
def split_training(
    payload: TrainTestSplitRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    request: Request = None,
) -> TrainTestSplitResponse:
    """Accept prepared training samples and split them into train/test sets.

    Tự lấy recording_session_id từ samples, mặc định train_ratio=0.7.
    Có thể thêm split_strategy=purged_chronological để chia an toàn.
    Không tạo lại Lag hoặc huấn luyện mô hình.
    """
    with audit_action(
        action="TRAIN_MODEL",
        module="Model Training",
        description="Train/test split prepared",
        user=user,
        resource_id=payload.dataset_version_id,
        ip_address=request.client.host if request and request.client else None,
        details={
            "operation": "train_test_split",
            "sample_count": len(payload.samples),
            "split_strategy": payload.split_strategy,
        },
    ):
        return prepare_training_split(db, payload, user)
