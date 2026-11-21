from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.json_schema import SkipJsonSchema


class FeatureRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    dataset_version_id: UUID
    # Hide the optional selector in Swagger while preserving existing clients.
    roi_identifier: SkipJsonSchema[str] = Field(default="MAIN_ROI", min_length=1, max_length=64)


class FeatureConfiguration(BaseModel):
    target_column: Literal["traffic_flow"] = "traffic_flow"
    aggregation_interval: Literal[60] = 60
    lag_count: Literal[5] = 5
    forecast_horizons: tuple[Literal[1], Literal[3], Literal[5]] = (1, 3, 5)
    method: Literal["sliding_window"] = "sliding_window"


class TrafficObservation(BaseModel):
    dataset_version_id: UUID
    roi_identifier: str = "MAIN_ROI"
    recording_session_id: str
    time_bucket: datetime
    traffic_flow: float | None
    aggregation_interval: Literal[60] = 60


class LagFeatures(BaseModel):
    lag_1: float
    lag_2: float
    lag_3: float
    lag_4: float
    lag_5: float


class TrainingTargets(BaseModel):
    target_h1: float
    target_h3: float
    target_h5: float


class TargetTimes(BaseModel):
    target_h1: datetime
    target_h3: datetime
    target_h5: datetime


class TrainingSample(BaseModel):
    dataset_version_id: UUID
    roi_identifier: str
    recording_session_id: str
    history_start_time: datetime
    time_bucket: datetime
    features: LagFeatures
    targets: TrainingTargets
    target_times: TargetTimes
    x: list[float]
    y: list[float]


class TrainingFeatureResponse(BaseModel):
    dataset_version_id: UUID
    roi_identifier: str
    configuration: FeatureConfiguration = Field(default_factory=FeatureConfiguration)
    feature_order: list[str] = Field(default_factory=lambda: [f"lag_{i}" for i in range(1, 6)])
    target_order: list[str] = Field(default_factory=lambda: ["target_h1", "target_h3", "target_h5"])
    sample_count: int
    samples: list[TrainingSample]


class PredictionFeatureResponse(BaseModel):
    dataset_version_id: UUID
    roi_identifier: str
    recording_session_id: str
    configuration: FeatureConfiguration = Field(default_factory=FeatureConfiguration)
    feature_order: list[str] = Field(default_factory=lambda: [f"lag_{i}" for i in range(1, 6)])
    history_start_time: datetime
    latest_time_bucket: datetime
    features: LagFeatures
    x: list[float]
    forecast_horizons: tuple[int, int, int] = (1, 3, 5)
    target_times: list[datetime]
