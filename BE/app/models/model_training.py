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
    Integer,
    String,
    Text,
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


class ModelValidationResult(Base):
    """Scores from a separate, identified Validation set (never Test metrics)."""

    __tablename__ = "model_validation_results"
    experiment_id = Column(
        UUID(as_uuid=True), ForeignKey("model_training_experiments.id"), primary_key=True,
    )
    validation_fingerprint = Column(String(64), nullable=False)
    sample_count = Column(Integer, nullable=False)
    performance_by_horizon = Column(JSONB, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class FinalModel(Base):
    """Immutable metadata for a trusted, already fitted three-horizon model bundle."""

    __tablename__ = "final_models"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    experiment_id = Column(
        UUID(as_uuid=True), ForeignKey("model_training_experiments.id"),
        nullable=False, unique=True,
    )
    dataset_version_id = Column(
        UUID(as_uuid=True), ForeignKey("dataset_versions.id"), nullable=False,
    )
    split_id = Column(UUID(as_uuid=True), ForeignKey("model_training_splits.id"), nullable=False)
    roi_identifier = Column(String(64), nullable=False)
    recording_session_id = Column(String(255), nullable=False)
    artifact_path = Column(Text, nullable=False)
    artifact_sha256 = Column(String(64), nullable=False)
    trained_through = Column(DateTime(timezone=True), nullable=False)
    feature_order = Column(JSONB, nullable=False)
    forecast_horizons = Column(JSONB, nullable=False)
    hyperparameters = Column(JSONB, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
