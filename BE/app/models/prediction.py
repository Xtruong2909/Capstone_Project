"""Persist manual experiment forecasts separately from training evaluation."""

import uuid

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database.database import Base


class PredictionRun(Base):
    __tablename__ = "prediction_runs"
    __table_args__ = (
        UniqueConstraint("request_fingerprint", name="uq_prediction_run_fingerprint"),
        Index("ix_prediction_run_experiment_created", "experiment_id", "created_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    experiment_id = Column(UUID(as_uuid=True), ForeignKey("model_training_experiments.id"), nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    request_fingerprint = Column(String(64), nullable=False)
    status = Column(String(16), nullable=False)
    requested_horizons = Column(JSONB, nullable=False)
    session_count = Column(Integer, nullable=False)
    session_snapshots = Column(JSONB, nullable=False)
    session_errors = Column(JSONB, nullable=False, default=list)
    model_artifacts = Column(JSONB, nullable=False)
    prediction_time_ms = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class PredictionResult(Base):
    __tablename__ = "prediction_results"
    __table_args__ = (
        UniqueConstraint("prediction_run_id", "session_id", "horizon", name="uq_prediction_run_session_horizon"),
        Index("ix_prediction_result_session", "session_id", "forecast_timestamp"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    prediction_run_id = Column(UUID(as_uuid=True), ForeignKey("prediction_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    experiment_id = Column(UUID(as_uuid=True), ForeignKey("model_training_experiments.id"), nullable=False)
    model_id = Column(UUID(as_uuid=True), ForeignKey("experiment_trained_models.model_id"), nullable=False)
    dataset_id = Column(UUID(as_uuid=True), ForeignKey("datasets.id"), nullable=False)
    dataset_version_id = Column(UUID(as_uuid=True), ForeignKey("dataset_versions.id"), nullable=False)
    session_id = Column(UUID(as_uuid=True), ForeignKey("recording_sessions.id"), nullable=False)
    horizon = Column(Integer, nullable=False)
    forecast_origin_time = Column(DateTime(timezone=True), nullable=False)
    forecast_timestamp = Column(DateTime(timezone=True), nullable=False)
    predicted_vehicle_count = Column(Float, nullable=False)
    actual_vehicle_count = Column(Float)
    lag_features = Column(JSONB, nullable=False)
    artifact_sha256 = Column(String(64), nullable=False)
    prediction_time_ms = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
