"""Validation workflow request and response contracts."""

from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.model_training import Hyperparameters


class ValidationStudyCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    feature_generation_id: UUID
    split_strategy: Literal["DAY_BASED", "SESSION_BASED"] = "DAY_BASED"
    train_ratio: float = Field(default=0.5, gt=0, lt=1, allow_inf_nan=False)
    validation_ratio: float = Field(default=0.25, gt=0, lt=1, allow_inf_nan=False)
    candidates: list[Hyperparameters] = Field(min_length=2, max_length=20)
    test_previously_used: bool = True

    @model_validator(mode="after")
    def validate_protocol(self) -> Self:
        if self.train_ratio + self.validation_ratio >= 1:
            raise ValueError("Train + validation ratios must leave a non-empty Test partition")
        configs = [item.model_dump_json() for item in self.candidates]
        if len(set(configs)) != len(configs):
            raise ValueError("Candidate configurations must be distinct")
        return self


class ValidationStudyResponse(BaseModel):
    id: UUID
    feature_generation_id: UUID
    status: str
    protocol: dict
    candidates: list[dict]
    result: dict | None
    created_at: datetime
