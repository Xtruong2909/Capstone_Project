from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database.database import get_db
from app.models.user import User
from app.schemas.feature_engineering import (
    FeatureRequest,
    PredictionFeatureResponse,
    TrainingFeatureResponse,
)
from app.services.audit_log_service import audit_action
from app.services.feature_engineering_service import prepare_features

router = APIRouter(prefix="/feature-engineering", tags=["Tạo đặc trưng"])


@router.post("/training", response_model=TrainingFeatureResponse, summary="Tạo đặc trưng cho huấn luyện")
def training_features(
    payload: FeatureRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    request: Request = None,
) -> TrainingFeatureResponse:
    """Prepare complete X/Y samples only; does not train or split data."""
    with audit_action(
        action="GENERATE_FEATURES",
        module="Feature Engineering",
        description="Training lag features generated",
        user=user,
        resource_id=payload.dataset_version_id,
        ip_address=request.client.host if request and request.client else None,
        details={"mode": "training"},
    ):
        return prepare_features(db, payload, user, prediction=False)


@router.post("/prediction", response_model=PredictionFeatureResponse, summary="Tạo đặc trưng cho dự báo")
def prediction_features(
    payload: FeatureRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    request: Request = None,
) -> PredictionFeatureResponse:
    """Prepare observed X and forecast timestamps only; no predictions."""
    with audit_action(
        action="GENERATE_FEATURES",
        module="Feature Engineering",
        description="Prediction lag features generated",
        user=user,
        resource_id=payload.dataset_version_id,
        ip_address=request.client.host if request and request.client else None,
        details={"mode": "prediction"},
    ):
        return prepare_features(db, payload, user, prediction=True)
