"""Bounded requests for private S3 multipart uploads."""
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class DirectFileRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    size: int = Field(gt=0)


class DirectUploadRequest(BaseModel):
    files: list[DirectFileRequest] = Field(min_length=1, max_length=1000)
    group_name: str | None = Field(default=None, max_length=128)
    source: str | None = Field(default=None, max_length=255)
    location_name: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=10000)

    @field_validator('group_name', 'source', 'location_name', 'description', mode='before')
    @classmethod
    def trim_optional_metadata(cls, value: str | None) -> str | None:
        return (value.strip() or None) if isinstance(value, str) else value


class DirectFileResponse(BaseModel):
    file_id: UUID
    filename: str
    size: int
    part_size: int


class DirectUploadResponse(BaseModel):
    job_id: UUID
    files: list[DirectFileResponse]


class PartUrlsRequest(BaseModel):
    part_numbers: list[int] = Field(min_length=1, max_length=100)


class PartUrl(BaseModel):
    part_number: int
    url: str


class PartUrlsResponse(BaseModel):
    parts: list[PartUrl]


class UploadedPart(BaseModel):
    part_number: int = Field(ge=1, le=10000)
    etag: str = Field(min_length=1, max_length=256)


class CompleteFileRequest(BaseModel):
    parts: list[UploadedPart] = Field(min_length=1, max_length=10000)


class DirectUploadCapabilities(BaseModel):
    mode: Literal['s3', 'local']
