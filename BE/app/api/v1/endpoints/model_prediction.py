"""Future traffic-flow forecasts from a completed Random Forest experiment."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database.database import get_db
from app.models.user import User
from app.schemas.model_prediction import ModelPredictionRequest, ModelPredictionResponse
from app.services.model_prediction_service import predict_experiment

router = APIRouter(prefix="/model-training", tags=["Dự báo lưu lượng"])


@router.post("/predict", response_model=ModelPredictionResponse, summary="Dự báo +1, +3, +5 phút")
def predict_traffic_flow(
    payload: ModelPredictionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ModelPredictionResponse:
    """Chọn Ex theo điểm Validation rồi dùng Final Model với năm lag mới nhất."""
    return predict_experiment(db, payload, user)
