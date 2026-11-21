"""Response contracts for persisted forecast-origin analysis."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class ForecastOriginSession(BaseModel):
    session_id: UUID
    filename: str
    origin_count: int


class ForecastOriginPrediction(BaseModel):
    experiment_id: UUID
    dataset_version_id: UUID
    session_id: UUID
    origin_time: datetime
    horizon_minutes: Literal[1, 3, 5]
    target_time: datetime
    actual: float
    predicted: float
    absolute_error: float
    split: Literal["TEST"] = "TEST"


class ForecastOriginMetric(BaseModel):
    horizon_minutes: Literal[1, 3, 5]
    mae: float
    rmse: float
    sample_count: int


class ForecastOriginAnalysisResponse(BaseModel):
    experiment_id: UUID
    dataset_version_id: UUID | None
    sessions: list[ForecastOriginSession]
    selected_session_id: UUID | None
    origins: list[datetime]
    selected_origin_time: datetime | None
    predictions: list[ForecastOriginPrediction]
    session_metrics: list[ForecastOriginMetric]
    overall_metrics: list[ForecastOriginMetric]
    message: str | None = None
