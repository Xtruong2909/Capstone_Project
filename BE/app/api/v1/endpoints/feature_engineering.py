from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database.database import get_db
from app.models.user import User
from app.schemas.feature_engineering import (
    FeatureRequest,
    PredictionFeatureResponse,
    TrainingFeatureResponse,
)
from app.services.feature_engineering_service import prepare_features

router = APIRouter(prefix="/feature-engineering", tags=["Feature Engineering"])


@router.post("/training", response_model=TrainingFeatureResponse)
def training_features(
    payload: FeatureRequest, db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TrainingFeatureResponse:
    """Prepare complete X/Y samples only; does not train or split data."""
    return prepare_features(db, payload, user, prediction=False)


@router.post("/prediction", response_model=PredictionFeatureResponse)
def prediction_features(
    payload: FeatureRequest, db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PredictionFeatureResponse:
    """Prepare observed X and forecast timestamps only; no predictions."""
    return prepare_features(db, payload, user, prediction=True)
