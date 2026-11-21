"""Data Scientist's manually selected Random Forest forecasts."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database.database import get_db
from app.models.user import User
from app.schemas.prediction import (
    ForecastChart,
    ForecastDetail,
    ForecastHistoryResponse,
    ForecastRequest,
    ForecastResponse,
    ForecastResultsResponse,
    PredictionExperimentsResponse,
    PredictionSessionsResponse,
)
from app.services import prediction_service as service

router = APIRouter(prefix="/prediction", tags=["Dự báo lưu lượng giao thông"])


@router.get("/experiments", response_model=PredictionExperimentsResponse,
            summary="Danh sách thí nghiệm đã hoàn thành để dự báo")
def experiments(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> PredictionExperimentsResponse:
    return service.list_experiments(db, user)


@router.get("/sessions", response_model=PredictionSessionsResponse,
            summary="Danh sách phiên ghi hình đã tổng hợp và khả năng dự báo")
def sessions(
    dataset_id: UUID | None = None, dataset_version_id: UUID | None = None,
    experiment_id: UUID | None = None, eligible_only: bool = False,
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
) -> PredictionSessionsResponse:
    return service.list_sessions(
        db, user, dataset_id=dataset_id, dataset_version_id=dataset_version_id,
        experiment_id=experiment_id, eligible_only=eligible_only,
        page=page, page_size=page_size,
    )


@router.post("/forecasts", response_model=ForecastResponse, status_code=201,
             summary="Dự báo từ 5 phút gần nhất bằng thí nghiệm đã chọn")
def create_forecast(
    payload: ForecastRequest, db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ForecastResponse:
    return service.create_forecast(db, user, payload)


@router.get("/forecasts", response_model=ForecastHistoryResponse,
            summary="Lịch sử dự báo có phân trang")
def forecast_history(
    experiment_id: UUID | None = None, session_id: UUID | None = None,
    status: Literal["COMPLETED", "PARTIAL"] | None = None,
    created_from: datetime | None = None, created_to: datetime | None = None,
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
) -> ForecastHistoryResponse:
    return service.forecast_history(
        db, user, experiment_id=experiment_id, session_id=session_id, status=status,
        created_from=created_from, created_to=created_to, page=page, page_size=page_size,
    )


@router.get("/forecasts/{forecast_id}", response_model=ForecastDetail,
            summary="Chi tiết dự báo và dữ liệu đầu vào đã lưu")
def forecast_detail(
    forecast_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user),
) -> ForecastDetail:
    return service.forecast_detail(db, user, forecast_id)


@router.get("/forecasts/{forecast_id}/results", response_model=ForecastResultsResponse,
            summary="Kết quả dự báo theo phiên và mốc thời gian, có phân trang")
def forecast_results(
    forecast_id: UUID, session_id: UUID | None = None,
    horizon: Literal[1, 3, 5] | None = None,
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
) -> ForecastResultsResponse:
    return service.forecast_results(
        db, user, forecast_id, session_id=session_id, horizon=horizon,
        page=page, page_size=page_size,
    )


@router.get("/forecasts/{forecast_id}/chart", response_model=ForecastChart,
            summary="Biểu đồ 5 phút quan sát và 3 mốc dự báo của một phiên")
def forecast_chart(
    forecast_id: UUID, session_id: UUID,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
) -> ForecastChart:
    return service.forecast_chart(db, user, forecast_id, session_id)
