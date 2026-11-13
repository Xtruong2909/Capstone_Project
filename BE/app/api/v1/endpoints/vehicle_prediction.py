"""Forecast vehicle counts with a previously trained Random Forest."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database.database import get_db
from app.models.user import User
from app.schemas.lag_feature import VehiclePredictionRequest, VehiclePredictionResponse
from app.services.lag_feature_model_service import predict_vehicle_count

router = APIRouter(tags=["Vehicle Count Prediction"])


@router.post("/predictions", response_model=VehiclePredictionResponse, summary="Dự báo số phương tiện bằng Random Forest đã huấn luyện")
def predict_vehicles(
    payload: VehiclePredictionRequest,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
) -> VehiclePredictionResponse:
    return predict_vehicle_count(db, user, payload)
