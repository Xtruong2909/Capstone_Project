"""Contracts for split-scoped model-training experiments."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.model_training import Hyperparameters, TrainingExperimentResponse

ForecastHorizon = Literal[1, 3, 5]


class ExperimentListResponse(BaseModel):
    page: int
    page_size: int
    total_records: int
    total_pages: int
    data: list[TrainingExperimentResponse]


class TrainingExperimentCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    split_id: UUID
    model: Literal["RANDOM_FOREST"] = "RANDOM_FOREST"
    forecast_horizons: list[ForecastHorizon] = Field(
        default_factory=lambda: [1, 3, 5],
        min_length=1,
        max_length=3,
    )
    hyperparameters: Hyperparameters = Field(default_factory=Hyperparameters)

    @model_validator(mode="after")
    def unique_horizons(self) -> "TrainingExperimentCreateRequest":
        if tuple(sorted(set(self.forecast_horizons))) != (1, 3, 5):
            raise ValueError("forecast_horizons must contain 1, 3 and 5 exactly once")
        return self


class ExperimentPrediction(BaseModel):
    dataset_id: UUID
    session_id: UUID
    input_timestamp: datetime
    forecast_timestamp: datetime
    model_type: Literal["RANDOM_FOREST", "PERSISTENCE", "HISTORICAL_AVERAGE"]
    horizon: ForecastHorizon
    actual_vehicle_count: float
    predicted_vehicle_count: float
    absolute_error: float


class ExperimentPredictionListResponse(BaseModel):
    experiment_id: UUID
    horizon: ForecastHorizon | None
    session_id: UUID | None
    page: int
    page_size: int
    total_records: int
    total_pages: int
    data: list[ExperimentPrediction]


class TrainedModelSummary(BaseModel):
    model_id: UUID
    experiment_id: UUID
    horizon: ForecastHorizon
    model_type: str
    hyperparameters: Hyperparameters
    training_time_ms: float | None
    artifact_reference: str | None
    status: Literal["COMPLETED", "FAILED"]


class ExperimentModelsResponse(BaseModel):
    experiment_id: UUID
    data: list[TrainedModelSummary]
