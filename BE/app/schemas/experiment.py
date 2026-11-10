from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TimeSeriesRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    timestamp: datetime
    traffic_flow: float


class ExperimentConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dataset_id: UUID | None = None
    dataset_version_id: UUID | None = None
    time_period: dict[str, datetime | str | list[dict[str, object]]] | None = None
    series: list["TimeSeriesRow"] = Field(default_factory=list)
    aggregation_interval: int = Field(default=60, ge=60, le=300)
    lag_features: int = Field(default=5, ge=1, le=10)
    model: Literal["RANDOM_FOREST", "PERSISTENCE", "HISTORICAL_AVERAGE"] = "RANDOM_FOREST"
    forecast_horizons: list[int] = Field(default_factory=lambda: [1, 3, 5])
    train_split_ratio: float = Field(default=0.70, gt=0, lt=1)
    split_strategy: Literal["CHRONOLOGICAL"] = "CHRONOLOGICAL"
    notes: str | None = None


class ExperimentCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    description: str | None = None
    configuration: ExperimentConfig = Field(default_factory=ExperimentConfig)


class SplitExperimentConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dataset_version_id: UUID | None = None
    roi_identifier: str | None = None
    recording_session_id: str | None = None
    train_ratio: float = Field(default=0.70, gt=0, lt=1)
    split_strategy: Literal["chronological", "CHRONOLOGICAL", "purged_chronological", "PURGED_CHRONOLOGICAL"] = "chronological"
    feature_order: list[str] = Field(default_factory=lambda: ["lag_1", "lag_2", "lag_3", "lag_4", "lag_5"])
    target_order: list[str] = Field(default_factory=lambda: ["target_h1", "target_h3", "target_h5"])
    X_train: list[list[float]] = Field(default_factory=list)
    y_train: list[list[float]] = Field(default_factory=list)
    X_test: list[list[float]] = Field(default_factory=list)
    y_test: list[list[float]] = Field(default_factory=list)
    train_times: list[datetime] | None = None
    test_times: list[datetime] | None = None
    official_evaluation_eligible: bool = True
    warnings: list[str] = Field(default_factory=list)
    forecast_horizons: list[int] = Field(default_factory=lambda: [1, 3, 5])


class ExperimentFromSplitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    description: str | None = None
    configuration: SplitExperimentConfig = Field(default_factory=SplitExperimentConfig)
    split_result: SplitExperimentConfig | None = None

    @property
    def effective_configuration(self) -> SplitExperimentConfig:
        return self.configuration if self.configuration.X_train or self.configuration.X_test else (self.split_result or self.configuration)


class ModelPerformance(BaseModel):
    mae: float
    rmse: float


class PredictionRow(BaseModel):
    timestamp: datetime
    horizon_minutes: int | None = None
    actual_traffic_flow: float
    random_forest_prediction: float
    persistence_prediction: float
    historical_average_prediction: float


class ExperimentRunResponse(BaseModel):
    experiment_id: UUID | None = None
    name: str
    status: str
    execution_time_sec: float
    configuration: ExperimentConfig
    performance_by_horizon: dict[int, dict[str, ModelPerformance]]
    prediction_rows: list[PredictionRow]
    logs: list[str]


class ExperimentDetailResponse(ExperimentRunResponse):
    model_config = ConfigDict(from_attributes=True)

    dataset_version_id: UUID | None = None
    created_at: datetime | None = None
