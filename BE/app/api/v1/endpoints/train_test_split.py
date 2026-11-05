from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database.database import get_db
from app.models.user import User
from app.schemas.train_test_split import TrainTestSplitRequest, TrainTestSplitResponse
from app.services.train_test_split_service import prepare_training_split

router = APIRouter(prefix="/train-test-split", tags=["Train/Test Split"])


@router.post("/training", response_model=TrainTestSplitResponse)
def split_training(
    payload: TrainTestSplitRequest, db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TrainTestSplitResponse:
    """Dán nguyên response của /api/feature-engineering/training vào request body.

    Tự lấy recording_session_id từ samples, mặc định train_ratio=0.7.
    Có thể thêm split_strategy=purged_chronological để chia an toàn.
    Không tạo lại Lag hoặc huấn luyện mô hình.
    """
    return prepare_training_split(db, payload, user)
