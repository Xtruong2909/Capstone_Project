"""API contracts for persisted vehicle-count lag features and forecasts."""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LagGenerationRequest(BaseModel):
    aggregation_id: UUID
    lag_count: Literal[5] = 5
    forecast_horizons: tuple[Literal[1], Literal[3], Literal[5]] = (1, 3, 5)
    method: Literal["sliding_window"] = "sliding_window"


class LagGenerationStatus(BaseModel):
    feature_generation_id: UUID
    aggregation_id: UUID
    status: str
    configuration: dict
    sample_count: int
    error_message: str | None = None


class LagSessionCount(BaseModel):
    dataset_id: UUID
    session_id: UUID
    sample_count: int


class LagSessionResponse(BaseModel):
    feature_generation_id: UUID
    sessions: list[LagSessionCount]


class LagSampleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    aggregation_id: UUID
    dataset_id: UUID
    session_id: UUID
    timestamp: datetime
    lag_1: int
    lag_2: int
    lag_3: int
    lag_4: int
    lag_5: int
    target_h1: int
    target_h3: int
    target_h5: int


class LagPreviewResponse(BaseModel):
    feature_generation_id: UUID
    total_records: int
    page: int
    page_size: int
    total_pages: int
    data: list[LagSampleResponse]


class LagSummaryResponse(BaseModel):
    feature_generation_id: UUID
    aggregation_id: UUID
    total_datasets: int
    total_sessions: int
    total_samples: int
    samples_by_horizon: dict[str, int]


class LagTrainTestSplitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    feature_generation_id: UUID
    split_strategy: Literal["DAY_BASED", "SESSION_BASED"] = "DAY_BASED"
    train_ratio: float = Field(default=0.7, gt=0, lt=1, allow_inf_nan=False)
    shuffle: Literal[False] = False
    forecast_horizons: tuple[Literal[1], Literal[3], Literal[5]] = (1, 3, 5)


class LagSplitSessionSummary(BaseModel):
    dataset_id: UUID
    session_id: UUID
    recording_date: date
    sample_count: int = Field(ge=0)


class LagSplitLeakageCheck(BaseModel):
    checked: bool
    has_leakage: bool
    rule: str
    train_latest_target_time: datetime
    test_earliest_history_time: datetime


class LagTrainTestSplitResponse(BaseModel):
    split_id: UUID
    feature_generation_id: UUID
    status: Literal["COMPLETED"]
    split_strategy: Literal["DAY_BASED", "SESSION_BASED"]
    train_ratio_requested: float
    train_ratio_actual: float
    forecast_horizons: list[int]
    shuffle: Literal[False]
    total_sessions: int
    train_sessions: list[LagSplitSessionSummary]
    test_sessions: list[LagSplitSessionSummary]
    total_samples: int
    train_sample_count: int
    test_sample_count: int
    samples_by_horizon: dict[str, dict[str, int]]
    leakage_check: LagSplitLeakageCheck
    warnings: list[str]
    created_at: datetime


class LagSplitPreviewSample(BaseModel):
    dataset_id: UUID
    session_id: UUID
    timestamp: datetime
    lag_1: int
    lag_2: int
    lag_3: int
    lag_4: int
    lag_5: int
    target_h1: int
    target_h3: int
    target_h5: int
    subset: Literal["TRAIN", "TEST"]


class LagSplitPreviewResponse(BaseModel):
    split_id: UUID
    subset: Literal["TRAIN", "TEST"]
    session_id: UUID | None
    page: int
    page_size: int
    total_records: int
    total_pages: int
    data: list[LagSplitPreviewSample]


class LagForestTrainingRequest(BaseModel):
    split_id: UUID
    n_estimators: int = Field(default=100, ge=1, le=1000)
    max_depth: int | None = Field(default=10, ge=1, le=100)
    random_state: int = Field(default=42, ge=0)


class LagForestTrainingResponse(BaseModel):
    model_id: UUID
    split_id: UUID
    feature_generation_id: UUID
    split_strategy: str
    train_samples: int
    test_samples: int
    metrics: dict[str, dict[str, float]]


class VehiclePredictionRequest(BaseModel):
    model_id: UUID
    aggregation_id: UUID
    session_id: UUID


class VehicleForecastPoint(BaseModel):
    forecast_timestamp: datetime
    horizon: Literal[1, 3, 5]
    predicted_vehicle_count: int = Field(ge=0)


class VehiclePredictionResponse(BaseModel):
    model_id: UUID
    aggregation_id: UUID
    dataset_id: UUID
    session_id: UUID
    latest_timestamp: datetime
    lag_1: int
    lag_2: int
    lag_3: int
    lag_4: int
    lag_5: int
    predictions: list[VehicleForecastPoint]
