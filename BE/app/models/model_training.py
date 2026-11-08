"""Separate tables from the legacy four experiment endpoints."""

import uuid

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Column,
    Computed,
    DateTime,
    Float,
    ForeignKey,
    Identity,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database.database import Base


class ModelTrainingSplit(Base):
    __tablename__ = "model_training_splits"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_version_id = Column(UUID(as_uuid=True), ForeignKey("dataset_versions.id"), nullable=False, index=True)
    fingerprint = Column(String(64), nullable=False, unique=True)
    payload = Column(JSONB, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ModelTrainingExperiment(Base):
    __tablename__ = "model_training_experiments"
    __table_args__ = (CheckConstraint(
        "status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')", name="ck_training_status"
    ),)
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    number = Column(BigInteger, Identity(), nullable=False, unique=True)
    name = Column(String(64), Computed(
        "'Ex-' || lpad(number::text, greatest(3, length(number::text)), '0')"
    ), unique=True, nullable=False)
    split_id = Column(UUID(as_uuid=True), ForeignKey("model_training_splits.id"), nullable=False, index=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    configuration = Column(JSONB, nullable=False)
    evaluation = Column(JSONB, nullable=False)
    status = Column(String(16), nullable=False, default="PENDING")
    training_time_sec = Column(Float)
    prediction_time_sec = Column(Float)
    execution_time_sec = Column(Float)
    performance_by_horizon = Column(JSONB, nullable=False, default=dict)
    prediction_rows = Column(JSONB, nullable=False, default=list)
    library_versions = Column(JSONB, nullable=False, default=dict)
    logs = Column(JSONB, nullable=False, default=list)
    error = Column(String(512))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
