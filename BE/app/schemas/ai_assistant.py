"""Validated, bounded contract for the single AI Assistant endpoint."""

from enum import StrEnum
from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.model_training import Hyperparameters


class AssistantAction(StrEnum):
    EXPERIMENT_ANALYSIS = "EXPERIMENT_ANALYSIS"
    MODEL_RECOMMENDATION = "MODEL_RECOMMENDATION"
    EXPERIMENT_COMPARISON = "EXPERIMENT_COMPARISON"
    FORECAST_EXPLANATION = "FORECAST_EXPLANATION"
    CHAT = "CHAT"


class AssistantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: AssistantAction
    experiment_ids: list[UUID] = Field(default_factory=list, max_length=20)
    prediction_id: int | None = Field(default=None, ge=1)
    model_id: UUID | None = None
    dataset_version_id: UUID | None = None
    message: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_action(self) -> Self:
        count = len(self.experiment_ids)
        if count != len(set(self.experiment_ids)):
            raise ValueError("Danh sách experiment_ids không được trùng lặp")
        if self.action == AssistantAction.EXPERIMENT_ANALYSIS and count != 1:
            raise ValueError("Phân tích cần đúng một experiment_id")
        if self.action == AssistantAction.MODEL_RECOMMENDATION and count < 1:
            raise ValueError("Đề xuất mô hình cần ít nhất một experiment_id")
        if self.action == AssistantAction.EXPERIMENT_COMPARISON and count < 2:
            raise ValueError("So sánh cần ít nhất hai experiment_id")
        if self.action == AssistantAction.FORECAST_EXPLANATION and self.prediction_id is None:
            raise ValueError("Giải thích dự báo cần prediction_id")
        if self.action == AssistantAction.CHAT and not (self.message and self.message.strip()):
            raise ValueError("Chat cần nội dung message")
        return self


class AssistantResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str | None = Field(default=None, min_length=1)
    message: str | None = Field(default=None, min_length=1)
    strengths: list[str] | None = None
    weaknesses: list[str] | None = None
    recommendations: list[str] | None = None
    reason: str | None = None
    forecast_trends: list[str] | None = None
    explanation: str | None = None
    suggested_configuration: Hyperparameters | None = None
    best_experiment_id: UUID | None = None


class ChatResponseResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str


class ExperimentAnalysisResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str
    strengths: list[str] | None = None
    weaknesses: list[str] | None = None
    recommendations: list[str] | None = None


class ModelRecommendationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str
    suggested_configuration: Hyperparameters | None = None
    reason: str | None = None


class ExperimentComparisonItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    experiment_id: UUID
    experiment_name: str
    performance_by_horizon: dict[str, dict[str, dict[str, float]]]


class ExperimentComparisonResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str
    best_experiment_id: UUID | None = None
    comparison: list[ExperimentComparisonItem] | None = None


class ForecastExplanationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str
    forecast_trends: list[str] | None = None
    explanation: str | None = None


class AssistantResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: AssistantAction
    status: str = "success"
    result: (
        ChatResponseResult
        | ExperimentAnalysisResult
        | ModelRecommendationResult
        | ExperimentComparisonResult
        | ForecastExplanationResult
    )
