from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.dataset import UploadedDatasetGroupSummary
from app.schemas.dataset_normalization import GroupProcessingJobResponse


class GroupPipelineState(BaseModel):
    group_id: UUID
    source_key: str
    step: int = Field(ge=1, le=4)
    mapped: bool
    normalized: bool
    exported: bool
    completed: bool
    job: GroupProcessingJobResponse | None = None


class PipelineGroupSummary(UploadedDatasetGroupSummary):
    pipeline: GroupPipelineState


class PipelineGroupListResponse(BaseModel):
    groups: list[PipelineGroupSummary]
    total: int
    page: int
    page_size: int
