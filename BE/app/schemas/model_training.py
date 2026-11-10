"""Contracts for persisted training experiments; no feature generation or splitting."""

import math
from datetime import UTC, datetime, timedelta
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.json_schema import SkipJsonSchema

from app.schemas.feature_engineering import TargetTimes
from app.schemas.train_test_split import FEATURE_ORDER, TARGET_ORDER, SplitSample

EvaluationMode = Literal["exploratory", "official"]
ModelName = Literal["RANDOM_FOREST", "PERSISTENCE", "HISTORICAL_AVERAGE"]


class Hyperparameters(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    n_estimators: int = Field(default=100, ge=1, le=1000)
    max_depth: int | None = Field(default=10, ge=1, le=100)
    min_samples_split: int = Field(default=2, ge=2)
    min_samples_leaf: int = Field(default=1, ge=1)
    max_features: int | float | Literal["sqrt", "log2"] | None = 1.0
    bootstrap: bool = True
    random_state: int = Field(default=42, ge=0, le=4294967295)

    @model_validator(mode="after")
    def validate_features(self) -> Self:
        value = self.max_features
        if isinstance(value, bool):
            raise ValueError("max_features must not be boolean")  # noqa: TRY004 - Pydantic validation
        if isinstance(value, int) and not 1 <= value <= 5:
            raise ValueError("Integer max_features must be between 1 and 5")
        if isinstance(value, float) and (not math.isfinite(value) or not 0 < value <= 1):
            raise ValueError("Float max_features must be in (0, 1]")
        return self


class TrainingSplitInput(BaseModel):
    # The existing split response contains descriptive counts/warnings and a legacy
    # experiment_request. Ignore those; recompute eligibility from actual timestamps.
    model_config = ConfigDict(extra="ignore")
    # Accept IDs in pasted old responses, but do not ask for a duplicate in Swagger.
    dataset_version_id: SkipJsonSchema[UUID | None] = None
    roi_identifier: str = Field(min_length=1, max_length=64)
    recording_session_id: str = Field(min_length=1, max_length=255)
    train_ratio: Literal[0.7] = 0.7
    split_strategy: Literal["chronological"] = "chronological"
    feature_order: list[str] = Field(default_factory=lambda: list(FEATURE_ORDER))
    target_order: list[str] = Field(default_factory=lambda: list(TARGET_ORDER))
    X_train: list[list[float]] = Field(min_length=1, max_length=50000)
    y_train: list[list[float]] = Field(min_length=1, max_length=50000)
    X_test: list[list[float]] = Field(min_length=1, max_length=50000)
    y_test: list[list[float]] = Field(min_length=1, max_length=50000)
    train_times: list[datetime]
    test_times: list[datetime]
    train_history_start_times: list[datetime] | None = None
    test_history_start_times: list[datetime] | None = None
    train_target_times: list[TargetTimes] | None = None
    test_target_times: list[TargetTimes] | None = None


class TrainingSplit(TrainingSplitInput):
    dataset_version_id: UUID

    @model_validator(mode="after")
    def validate_split(self) -> Self:
        if self.feature_order != list(FEATURE_ORDER) or self.target_order != list(TARGET_ORDER):
            raise ValueError("Expected lag_1..lag_5 and target_h1,target_h3,target_h5 in order")
        observations: dict[datetime, float] = {}
        for partition in ("train", "test"):
            xs, ys = getattr(self, f"X_{partition}"), getattr(self, f"y_{partition}")
            times = getattr(self, f"{partition}_times")
            histories = getattr(self, f"{partition}_history_start_times")
            targets = getattr(self, f"{partition}_target_times")
            if len(xs) != len(ys) or len(xs) != len(times):
                raise ValueError("X, y and timestamps must have matching row counts")
            if histories is not None and len(histories) != len(xs):
                raise ValueError("History timestamps must match row counts")
            if targets is not None and len(targets) != len(xs):
                raise ValueError("Target timestamps must match row counts")
            if any(t.tzinfo is None or t.utcoffset() is None for t in times):
                raise ValueError("Timestamps must include timezone")
            times = [t.astimezone(UTC) for t in times]
            if times != sorted(set(times)):
                raise ValueError("Timestamps must be strictly increasing; input is never reordered")
            for i, (x, y, origin) in enumerate(zip(xs, ys, times, strict=True)):
                if len(x) != 5 or len(y) != 3:
                    raise ValueError("Each X row needs 5 lags and each y row needs 3 targets")
                # Reuse the split service's validated sample contract, without re-splitting.
                SplitSample(
                    dataset_version_id=self.dataset_version_id,
                    roi_identifier=self.roi_identifier,
                    recording_session_id=self.recording_session_id,
                    history_start_time=histories[i] if histories else origin - timedelta(minutes=4),
                    time_bucket=origin,
                    features=dict(zip(FEATURE_ORDER, x, strict=True)),
                    targets=dict(zip(TARGET_ORDER, y, strict=True)),
                    target_times=targets[i] if targets else {
                        f"target_h{h}": origin + timedelta(minutes=h) for h in (1, 3, 5)
                    },
                    x=x, y=y,
                )
                values = [(origin - timedelta(minutes=j), value) for j, value in enumerate(x)]
                values += [(origin + timedelta(minutes=h), value)
                           for h, value in zip((1, 3, 5), y, strict=True)]
                for timestamp, value in values:
                    if timestamp in observations and observations[timestamp] != value:
                        raise ValueError("Conflicting traffic flow values at the same timestamp")
                    observations[timestamp] = value
            setattr(self, f"{partition}_times", times)
            setattr(self, f"{partition}_history_start_times", [
                t - timedelta(minutes=4) for t in times
            ])
            setattr(self, f"{partition}_target_times", [TargetTimes(**{
                f"target_h{h}": t + timedelta(minutes=h) for h in (1, 3, 5)
            }) for t in times])
        if self.train_times[-1] >= self.test_times[0]:
            raise ValueError("All training origins must precede test origins")
        if len(self.X_train) != (len(self.X_train) + len(self.X_test)) * 7 // 10:
            raise ValueError("Expected chronological 70/30 split: train_count=floor(N*0.7)")
        return self


class TrainingExperimentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dataset_version_id: UUID
    split_id: UUID | None = None
    split_result: TrainingSplit | None = None
    model: Literal["RANDOM_FOREST"] = "RANDOM_FOREST"
    forecast_horizons: tuple[Literal[1], Literal[3], Literal[5]] = (1, 3, 5)
    hyperparameters: Hyperparameters = Field(default_factory=Hyperparameters)
    evaluation_mode: EvaluationMode = "exploratory"

    @model_validator(mode="after")
    def validate_source(self) -> Self:
        if (self.split_id is None) == (self.split_result is None):
            raise ValueError("Supply exactly one of split_id or split_result")
        if self.split_result and self.split_result.dataset_version_id != self.dataset_version_id:
            raise ValueError("Dataset version does not match split_result")
        return self


class Metric(BaseModel):
    mae: float
    rmse: float
    sample_count: int


class ExperimentComparisonRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    experiment_ids: list[UUID] = Field(min_length=2, max_length=20)

    @model_validator(mode="after")
    def unique_ids(self) -> Self:
        if len(set(self.experiment_ids)) != len(self.experiment_ids):
            raise ValueError("Experiment IDs must be distinct")
        return self


class ComparisonMetric(BaseModel):
    mae: float = Field(ge=0, allow_inf_nan=False)
    rmse: float = Field(ge=0, allow_inf_nan=False)


class ComparisonExperiment(Hyperparameters):
    experiment_id: UUID
    experiment_name: str
    training_time_sec: float | None
    prediction_time_sec: float | None
    performance: dict[str, ComparisonMetric]


class ExperimentComparisonResponse(BaseModel):
    experiments: list[ComparisonExperiment]
    best_by_horizon: dict[str, str]
    best_experiment_ids_by_horizon: dict[str, UUID]
    tied_experiment_ids_by_horizon: dict[str, list[UUID]]


class Prediction(BaseModel):
    model: ModelName
    horizon_minutes: Literal[1, 3, 5]
    forecast_origin_time: datetime
    target_timestamp: datetime
    actual_traffic_flow: float
    predicted_traffic_flow: float
    absolute_error: float
    squared_error: float


class ModelSummary(BaseModel):
    model: ModelName
    sample_count: int
    mae: float
    mse: float
    rmse: float


class HorizonForecast(Prediction):
    sample_count: int
    mse: float = Field(description="MSE trên toàn bộ mẫu Test của Random Forest tại horizon này.")
    rmse: float = Field(description="RMSE trên toàn bộ mẫu Test tại horizon này, không phải sai số một dòng.")


class ResultTables(BaseModel):
    horizon_forecasts: list[HorizonForecast] = Field(
        default_factory=list,
        description="Bảng 1: Random Forest tại mốc dự báo cuối tập Test, gồm +1, +3, +5 phút.",
    )
    prediction_details: list[Prediction] = Field(
        default_factory=list,
        description="Bảng 2: mọi dự đoán Test của 3 mô hình và 3 horizon; sai số theo từng dòng.",
    )
    model_summary: list[ModelSummary] = Field(
        default_factory=list,
        description="Bảng 3: sai số mỗi mô hình gộp tất cả cặp mẫu Test và horizon, trọng số bằng nhau.",
    )


class TrainingLogEntry(BaseModel):
    timestamp: datetime
    level: Literal["INFO", "ERROR"]
    message: str


class TrainingExperimentResponse(BaseModel):
    experiment_id: UUID
    experiment_name: str
    dataset_version_id: UUID
    split_id: UUID
    model: str
    forecast_horizons: list[int]
    hyperparameters: Hyperparameters
    status: Literal["PENDING", "RUNNING", "COMPLETED", "FAILED"]
    training_time_sec: float | None
    prediction_time_sec: float | None
    execution_time_sec: float | None
    evaluation_mode: EvaluationMode
    official_evaluation_eligible: bool
    evaluation_policy: str
    performance_by_horizon: dict[str, dict[str, Metric]]
    prediction_rows: list[Prediction]
    result_tables: ResultTables = Field(default_factory=ResultTables)
    library_versions: dict[str, str]
    logs: list[TrainingLogEntry] = Field(default_factory=list)
    error: str | None
    created_at: datetime
