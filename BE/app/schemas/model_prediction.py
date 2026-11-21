"""Contracts for automatic final-model selection and future traffic forecasts."""

from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ModelPredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dataset_version_id: UUID | None = Field(
        default=None, description="Dataset cần dự báo; dùng split_id nếu có nhiều bộ chia.",
    )
    split_id: UUID | None = Field(default=None, description="Giới hạn so sánh vào cùng bộ Train/Test.")
    experiment_id: UUID | None = Field(
        default=None,
        description="Tùy chọn tương thích: chỉ dùng để xác định dataset/split, không ép chọn Ex này.",
    )

    @model_validator(mode="after")
    def require_scope(self) -> Self:
        if self.dataset_version_id is None and self.experiment_id is None:
            raise ValueError("Supply dataset_version_id or experiment_id")
        return self


class ValidationMetric(BaseModel):
    mae: float = Field(ge=0, allow_inf_nan=False)
    rmse: float = Field(ge=0, allow_inf_nan=False)


class ValidationScores(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scores: dict[str, ValidationMetric]

    @model_validator(mode="after")
    def require_horizons(self) -> Self:
        if set(self.scores) != {"1", "3", "5"}:
            raise ValueError("Validation scores must contain horizons 1, 3 and 5")
        return self


class ForecastPoint(BaseModel):
    horizon: Literal[1, 3, 5]
    forecast_time: datetime
    predicted_flow: float = Field(ge=0, allow_inf_nan=False)


class HistoricalFlowPoint(BaseModel):
    time: datetime
    traffic_flow: float = Field(ge=0, allow_inf_nan=False)


class TrafficFlowChart(BaseModel):
    history: list[HistoricalFlowPoint] = Field(min_length=5, max_length=5)
    forecast: list[ForecastPoint] = Field(min_length=3, max_length=3)


class ForecastTableRow(ForecastPoint):
    change_from_last_observed: float = Field(allow_inf_nan=False)
    trend: Literal["increase", "decrease", "unchanged"]


class ForecastVisualization(BaseModel):
    traffic_flow_chart: TrafficFlowChart
    forecast_by_horizon: list[ForecastPoint] = Field(min_length=3, max_length=3)
    forecast_table: list[ForecastTableRow] = Field(min_length=3, max_length=3)


class ModelPredictionResponse(BaseModel):
    experiment_id: UUID
    model_id: UUID
    dataset_version_id: UUID
    last_observed_time: datetime
    last_observed_flow: float = Field(ge=0, allow_inf_nan=False)
    source_experiment_evaluation_mode: str
    source_experiment_official_evaluation_eligible: bool
    predictions: list[ForecastPoint] = Field(min_length=3, max_length=3)
    visualization: ForecastVisualization
