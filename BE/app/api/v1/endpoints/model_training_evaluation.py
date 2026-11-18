"""Separate Swagger section for the three RQ2/RQ3 result tables."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database.database import get_db
from app.models.user import User
from app.schemas.model_training_evaluation import (
    EvaluationPage,
    HorizonForecastResults,
    ModelEvaluationSummary,
)
from app.services import model_training_evaluation_service as service

router = APIRouter(
    prefix="/model-training/experiments/{experiment_id}/evaluation",
    tags=["Thí nghiệm - Evaluation RQ2/RQ3"],
)


@router.get("/horizon-results", response_model=HorizonForecastResults, summary="Bảng 1 - Horizon Forecast Results (RQ3)")
def horizon_results(
    experiment_id: UUID = Path(description="experiment_id của thí nghiệm đã hoàn tất"),
    horizon: Literal[1, 3, 5] | None = None,
    session_id: UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> HorizonForecastResults:
    return service.evaluation_page(
        db, user, experiment_id, model="RANDOM_FOREST", horizon=horizon,
        session_id=session_id, page=page, page_size=page_size, horizon_table=True,
    )


@router.get("/comparison", response_model=EvaluationPage, summary="Bảng 2 - Model Prediction Comparison (RQ2)")
def comparison(
    experiment_id: UUID = Path(description="experiment_id của thí nghiệm đã hoàn tất"),
    model: Literal["RANDOM_FOREST", "PERSISTENCE", "HISTORICAL_AVERAGE"] | None = None,
    horizon: Literal[1, 3, 5] | None = None,
    session_id: UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EvaluationPage:
    return service.evaluation_page(
        db, user, experiment_id, model=model, horizon=horizon,
        session_id=session_id, page=page, page_size=page_size, horizon_table=False,
    )


@router.get("/summary", response_model=ModelEvaluationSummary, summary="Bảng 3 - Model Evaluation Summary (RQ2/RQ3)")
def summary(
    experiment_id: UUID = Path(description="experiment_id của thí nghiệm đã hoàn tất"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ModelEvaluationSummary:
    return service.evaluation_summary(db, user, experiment_id)
