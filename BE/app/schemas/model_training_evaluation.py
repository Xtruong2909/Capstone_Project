"""The three persisted RQ2/RQ3 evaluation tables."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

ModelName = Literal["RANDOM_FOREST", "PERSISTENCE", "HISTORICAL_AVERAGE"]
Horizon = Literal[1, 3, 5]


class EvaluationRow(BaseModel):
    dataset_id: UUID
    session_id: UUID
    model: ModelName
    horizon: Horizon
    input_timestamp: datetime
    forecast_timestamp: datetime
    actual_timestamp: datetime
    actual_vehicle_count: float
    predicted_vehicle_count: float
    absolute_error: float = Field(ge=0)
    squared_error: float = Field(ge=0)


class HorizonMetrics(BaseModel):
    horizon: Horizon
    test_sample_count: int
    mae: float
    mse: float
    rmse: float


class EvaluationPage(BaseModel):
    experiment_id: UUID
    timestamp_timezone: Literal["UTC"] = "UTC"
    display_timezone: Literal["Europe/Athens"] = "Europe/Athens"
    horizon: Horizon | None
    model: ModelName | None
    session_id: UUID | None
    page: int
    page_size: int
    total_records: int
    total_pages: int
    data: list[EvaluationRow]


class HorizonForecastResults(EvaluationPage):
    metrics_by_horizon: list[HorizonMetrics]


class ModelEvaluationMetric(HorizonMetrics):
    model: ModelName


class RandomForestBaselineDifference(BaseModel):
    horizon: Horizon
    baseline: Literal["PERSISTENCE", "HISTORICAL_AVERAGE"]
    mae_delta_rf_minus_baseline: float
    rmse_delta_rf_minus_baseline: float


class ModelEvaluationSummary(BaseModel):
    experiment_id: UUID
    timestamp_timezone: Literal["UTC"] = "UTC"
    display_timezone: Literal["Europe/Athens"] = "Europe/Athens"
    baseline_configuration: dict[str, str]
    historical_average_train_target_means: dict[str, float]
    metrics: list[ModelEvaluationMetric]
    random_forest_vs_baselines: list[RandomForestBaselineDifference]
