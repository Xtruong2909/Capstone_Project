import math
from datetime import UTC, datetime, timedelta
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.feature_engineering import FeatureConfiguration, TargetTimes, TrainingSample

FEATURE_ORDER = ("lag_1", "lag_2", "lag_3", "lag_4", "lag_5")
TARGET_ORDER = ("target_h1", "target_h3", "target_h5")


class SplitSample(TrainingSample):
    """Validate the existing FE contract, without deriving new lag values."""

    @model_validator(mode="after")
    def validate_sample(self) -> Self:
        timestamps = [self.time_bucket, self.history_start_time, *self.target_times.model_dump().values()]
        if any(value.tzinfo is None or value.utcoffset() is None for value in timestamps):
            raise ValueError("All sample timestamps must include a timezone")
        origin = self.time_bucket.astimezone(UTC)
        if self.history_start_time.astimezone(UTC) != origin - timedelta(minutes=4):
            raise ValueError("history_start_time must be t-4 minutes")
        for horizon in (1, 3, 5):
            if getattr(self.target_times, f"target_h{horizon}").astimezone(UTC) != origin + timedelta(minutes=horizon):
                raise ValueError(f"target_h{horizon} timestamp must be t+{horizon} minutes")
        expected_x = [getattr(self.features, name) for name in FEATURE_ORDER]
        expected_y = [getattr(self.targets, name) for name in TARGET_ORDER]
        if any(not math.isfinite(value) or value < 0 for value in [*expected_x, *expected_y, *self.x, *self.y]):
            raise ValueError("Features and targets must be finite non-negative observed values")
        if self.x != expected_x or self.y != expected_y:
            raise ValueError("x/y must match the named features/targets in the fixed order")
        return self


class SplitFeatureConfiguration(FeatureConfiguration):
    model_config = ConfigDict(extra="forbid")


class TrainTestSplitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    dataset_version_id: UUID
    roi_identifier: str = Field(default="MAIN_ROI", min_length=1, max_length=64)
    recording_session_id: str | None = Field(
        default=None, min_length=1, max_length=255,
        description="Optional: inferred from samples when all belong to one recording session.",
    )
    configuration: SplitFeatureConfiguration | None = Field(
        default=None, description="Accepts the configuration returned by Feature Engineering.",
    )
    sample_count: int | None = Field(default=None, ge=0)
    train_ratio: float = Field(default=0.7, gt=0, lt=1, allow_inf_nan=False)
    split_strategy: Literal["chronological", "purged_chronological"] = "chronological"
    feature_order: tuple[Literal["lag_1"], Literal["lag_2"], Literal["lag_3"], Literal["lag_4"], Literal["lag_5"]] = FEATURE_ORDER
    target_order: tuple[Literal["target_h1"], Literal["target_h3"], Literal["target_h5"]] = TARGET_ORDER
    samples: list[SplitSample] = Field(
        min_length=2,
        description="Prepared feature samples. Samples are required; ID-only requests are not rebuilt automatically.",
    )

    @model_validator(mode="after")
    def accept_feature_response(self) -> Self:
        if self.sample_count is not None and self.sample_count != len(self.samples):
            raise ValueError("sample_count must match the number of supplied samples")
        if self.recording_session_id is None:
            sessions = {sample.recording_session_id for sample in self.samples}
            if len(sessions) != 1:
                raise ValueError("Cannot infer recording_session_id from mixed sessions")
            session = next(iter(sessions))
            if not session.strip() or len(session) > 255:
                raise ValueError("Invalid recording_session_id in samples")
            self.recording_session_id = session
        return self


class TrainTestSplitResponse(BaseModel):
    split_id: UUID | None = None
    dataset_version_id: UUID
    roi_identifier: str
    recording_session_id: str
    train_ratio: float
    split_strategy: str
    total_samples: int
    initial_train_count: int
    train_count: int
    test_count: int
    purged_count: int
    purged_times: list[datetime]
    feature_order: tuple[str, ...] = FEATURE_ORDER
    target_order: tuple[str, ...] = TARGET_ORDER
    X_train: list[list[float]]
    y_train: list[list[float]]
    X_test: list[list[float]]
    y_test: list[list[float]]
    train_times: list[datetime]
    test_times: list[datetime]
    train_history_start_times: list[datetime]
    test_history_start_times: list[datetime]
    train_target_times: list[TargetTimes]
    test_target_times: list[TargetTimes]
    official_evaluation_eligible: bool
    overlap_policy: str = "max(train target times) < min(test history_start_time)"
