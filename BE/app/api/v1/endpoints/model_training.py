from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database.database import get_db
from app.models.user import User
from app.schemas.forecast_origin_analysis import ForecastOriginAnalysisResponse
from app.schemas.model_training import (
    BestOverallRequest,
    ExperimentComparisonRequest,
    ExperimentComparisonResponse,
    TrainingExperimentResponse,
)
from app.schemas.model_training_experiment import (
    ExperimentListResponse,
    ExperimentModelsResponse,
    ExperimentPredictionListResponse,
    TrainingExperimentCreateRequest,
)
from app.services import forecast_origin_analysis_service
from app.services import model_training_experiment_service as experiment_service

router = APIRouter(prefix="/model-training", tags=["Huấn luyện mô hình"])


@router.post("/experiments", response_model=TrainingExperimentResponse, status_code=201)
def create_experiment(
    payload: TrainingExperimentCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TrainingExperimentResponse:
    return experiment_service.create_experiment(db, user, payload)


@router.get("/experiments", response_model=ExperimentListResponse, summary="Danh sách thí nghiệm")
def list_experiments(
    split_id: UUID | None = None,
    dataset_file_id: UUID | None = None,
    status: Literal["PENDING", "QUEUED", "RUNNING", "COMPLETED", "FAILED"] | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    skip: int | None = Query(None, ge=0),
    limit: int | None = Query(None, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ExperimentListResponse:
    offset = None
    if skip is not None or limit is not None:
        page_size = limit or page_size
        offset = skip or 0
        page = offset // page_size + 1
    total, data = experiment_service.list_experiments(
        db,
        user,
        split_id=split_id,
        status=status,
        dataset_file_id=dataset_file_id,
        page=page,
        page_size=page_size,
        offset=offset,
    )
    return ExperimentListResponse(
        page=page,
        page_size=page_size,
        total_records=total,
        total_pages=(total + page_size - 1) // page_size,
        data=data,
    )


# Static compare route must precede the UUID route.
@router.post(
    "/experiments/best-overall",
    response_model=ExperimentComparisonResponse,
    summary="Chọn và lưu Best Overall theo Average Test RMSE của cùng Split",
)
def select_best_overall(
    payload: BestOverallRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ExperimentComparisonResponse:
    return experiment_service.select_best_overall(
        db, user, payload.split_id, experiment_ids=payload.experiment_ids,
    )


@router.post(
    "/experiments/compare",
    response_model=ExperimentComparisonResponse,
    summary="So sánh các thí nghiệm",
)
def compare_experiments(
    payload: ExperimentComparisonRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ExperimentComparisonResponse:
    return experiment_service.compare_experiments(db, user, payload)


@router.get(
    "/experiments/{experiment_id}/forecast-origin-analysis",
    response_model=ForecastOriginAnalysisResponse,
    summary="Phân tích dự báo Test theo thời gian gốc",
)
def get_forecast_origin_analysis(
    experiment_id: UUID,
    session_id: UUID | None = None,
    origin_time: datetime | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ForecastOriginAnalysisResponse:
    return forecast_origin_analysis_service.get_forecast_origin_analysis(
        db, user, experiment_id, session_id=session_id, origin_time=origin_time,
    )


@router.get(
    "/experiments/{experiment_id}/predictions",
    response_model=ExperimentPredictionListResponse,
)
def get_experiment_predictions(
    experiment_id: UUID,
    model_type: Literal["RANDOM_FOREST", "PERSISTENCE", "HISTORICAL_AVERAGE"] | None = None,
    horizon: int | None = Query(None, description="Optional forecast horizon: 1, 3 or 5."),
    session_id: UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ExperimentPredictionListResponse:
    if horizon is not None and horizon not in (1, 3, 5):
        raise HTTPException(422, "horizon must be 1, 3 or 5")
    return experiment_service.get_experiment_predictions(
        db,
        user,
        experiment_id,
        model_type=model_type,
        horizon=horizon,
        session_id=session_id,
        page=page,
        page_size=page_size,
    )


@router.get("/experiments/{experiment_id}/models", response_model=ExperimentModelsResponse)
def get_experiment_models(
    experiment_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ExperimentModelsResponse:
    return experiment_service.get_experiment_models(db, user, experiment_id)


@router.get(
    "/experiments/{experiment_id}",
    response_model=TrainingExperimentResponse,
    summary="Xem chi tiết thí nghiệm",
)
def get_experiment(
    experiment_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TrainingExperimentResponse:
    return experiment_service.get_experiment(db, user, experiment_id)
