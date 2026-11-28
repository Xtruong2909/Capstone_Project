"""Frozen temporal partitions and validation-only model selection."""

import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database.database import Base


class ValidationStudy(Base):
    __tablename__ = "validation_studies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    feature_generation_id = Column(UUID(as_uuid=True), ForeignKey("lag_feature_generations.id", ondelete="CASCADE"), nullable=False)
    validation_split_id = Column(UUID(as_uuid=True), ForeignKey("lag_feature_splits.id", ondelete="CASCADE"), nullable=False)
    final_split_id = Column(UUID(as_uuid=True), ForeignKey("lag_feature_splits.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(24), nullable=False, default="READY")
    protocol = Column(JSONB, nullable=False)
    candidates = Column(JSONB, nullable=False)
    result = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
