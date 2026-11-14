"""Contracts for manual, saved traffic-flow forecasts."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ForecastRequest(BaseModel):
    experiment_id: UUID
    session_ids: list[UUID] = Field(min_length=1)
    forecast_horizons: list[int] = Field(default_factory=lambda: [1, 3, 5])
    forecast_origin: str = "LATEST_AVAILABLE"

    @field_validator("session_ids", "forecast_horizons")
    @classmethod
    def unique_values(cls, values: list) -> list:
        if len(values) != len(set(values)):
            raise ValueError("Không được nhập giá trị trùng lặp")
        return values


class PredictionExperiment(BaseModel):
    experiment_id: UUID
    experiment_name: str
    status: str
    hyperparameters: dict
    model_ids: dict[str, UUID]
    evaluation_metrics: dict
    prediction_eligible: bool


class PredictionExperimentsResponse(BaseModel):
    experiments: list[PredictionExperiment]


class PredictionSession(BaseModel):
    session_id: UUID
    dataset_id: UUID
    dataset_version_id: UUID
    start_time: datetime | None
    end_time: datetime | None
    aggregation_interval: int
    total_records: int
    available_consecutive_minutes: int
    prediction_eligible: bool
    ineligible_reason: str | None


class PredictionSessionsResponse(BaseModel):
    sessions: list[PredictionSession]
    total_records: int
    page: int
    page_size: int
    timestamp_timezone: Literal["Europe/Athens"] = "Europe/Athens"


class ForecastPrediction(BaseModel):
    horizon: int
    model_id: UUID
    forecast_timestamp: datetime
    predicted_vehicle_count: float
    actual_vehicle_count: float | None = None


class ForecastSessionResult(BaseModel):
    session_id: UUID
    dataset_id: UUID
    dataset_version_id: UUID
    forecast_origin_time: datetime
    lag_features: dict[str, int]
    predictions: list[ForecastPrediction]


class ForecastResponse(BaseModel):
    forecast_id: UUID
    experiment_id: UUID
    experiment_name: str
    status: str
    timestamp_timezone: Literal["Europe/Athens"] = "Europe/Athens"
    display_timezone: Literal["Europe/Athens"] = "Europe/Athens"
    results_by_session: list[ForecastSessionResult]
    session_errors: list[dict] = Field(default_factory=list)
    prediction_time_ms: float
    created_at: datetime


class ForecastHistoryItem(BaseModel):
    forecast_id: UUID
    experiment_id: UUID
    experiment_name: str
    session_count: int
    forecast_horizons: list[int]
    status: str
    prediction_time_ms: float
    created_at: datetime


class ForecastHistoryResponse(BaseModel):
    forecasts: list[ForecastHistoryItem]
    total_records: int
    page: int
    page_size: int
    timestamp_timezone: Literal["Europe/Athens"] = "Europe/Athens"


class ForecastDetail(BaseModel):
    forecast_id: UUID
    experiment_id: UUID
    experiment_name: str
    hyperparameters: dict
    selected_model_ids: dict[str, UUID]
    session_ids: list[UUID]
    session_snapshots: list[dict]
    prediction_time_ms: float
    status: str
    created_at: datetime
    timestamp_timezone: Literal["Europe/Athens"] = "Europe/Athens"
    display_timezone: Literal["Europe/Athens"] = "Europe/Athens"


class ForecastResultRow(BaseModel):
    session_id: UUID
    experiment_id: UUID
    model_id: UUID
    horizon: int
    forecast_origin_time: datetime
    forecast_timestamp: datetime
    predicted_vehicle_count: float
    actual_vehicle_count: float | None
    absolute_error: float | None


class ForecastResultsResponse(BaseModel):
    forecast_id: UUID
    results: list[ForecastResultRow]
    total_records: int
    page: int
    page_size: int
    timestamp_timezone: Literal["Europe/Athens"] = "Europe/Athens"
    display_timezone: Literal["Europe/Athens"] = "Europe/Athens"


class ForecastChart(BaseModel):
    forecast_id: UUID
    session_id: UUID
    historical: list[dict]
    forecast: list[dict]
    timestamp_timezone: Literal["Europe/Athens"] = "Europe/Athens"
    display_timezone: Literal["Europe/Athens"] = "Europe/Athens"
