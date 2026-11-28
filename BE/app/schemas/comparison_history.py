"""Validated comparison history requests and snapshots."""

from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, model_validator

from app.schemas.model_training import ExperimentComparisonRequest, ExperimentComparisonResponse


class ComparisonHistoryCreate(ExperimentComparisonRequest):
    group_id: UUID
    mode: Literal["compare", "overall"] = "compare"

    @model_validator(mode="after")
    def distinct_experiments(self) -> Self:
        if len(set(self.experiment_ids)) != len(self.experiment_ids):
            raise ValueError("Choose distinct experiments")
        return self


class ComparisonHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    group_id: UUID
    mode: Literal["compare", "overall"]
    experiment_ids: list[UUID]
    created_at: datetime
    result: ExperimentComparisonResponse
