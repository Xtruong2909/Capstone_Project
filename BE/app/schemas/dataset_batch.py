"""Batch deletion receipt; internal storage paths are never exposed."""
from uuid import UUID

from pydantic import BaseModel


class BatchDeleteResponse(BaseModel):
    group_id: UUID
    deleted_datasets: int
    deleted_sessions: int
    cleanup_pending: bool = False
    message: str
