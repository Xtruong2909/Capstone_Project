"""Separate tables from the legacy four experiment endpoints."""

import uuid

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Identity,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
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
    __table_args__ = (
        CheckConstraint(
            "status IN ('PENDING', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')",
            name="ck_training_status",
        ),
        CheckConstraint(
            "(split_id IS NOT NULL AND lag_feature_split_id IS NULL) OR "
            "(split_id IS NULL AND lag_feature_split_id IS NOT NULL)",
            name="ck_training_experiment_split_source",
        ),
        UniqueConstraint("batch_id", "experiment_number", name="uq_training_batch_number"),
        UniqueConstraint("batch_id", "name", name="uq_training_batch_name"),
        UniqueConstraint(
            "lag_feature_split_id", "experiment_number",
            name="uq_training_split_experiment_number",
        ),
        UniqueConstraint("lag_feature_split_id", "name", name="uq_training_split_experiment_name"),
    )
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    number = Column(BigInteger, Identity(), nullable=False, unique=True)
    dataset_id = Column(UUID(as_uuid=True), ForeignKey("datasets.id"), nullable=True)
    name = Column(String(64), nullable=False)
    split_id = Column(UUID(as_uuid=True), ForeignKey("model_training_splits.id"), nullable=True, index=True)
    lag_feature_split_id = Column(
        UUID(as_uuid=True), ForeignKey("lag_feature_splits.id"), nullable=True, index=True,
    )
    batch_id = Column(UUID(as_uuid=True), ForeignKey("experiment_batches.batch_id"), nullable=True, index=True)
    experiment_number = Column(Integer, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    configuration = Column(JSONB, nullable=False)
    evaluation = Column(JSONB, nullable=False)
    status = Column(String(16), nullable=False, default="PENDING")
    training_time_sec = Column(Float)
    prediction_time_sec = Column(Float)
    training_time_ms = Column(Float)
    prediction_time_ms = Column(Float)
    execution_time_sec = Column(Float)
    performance_by_horizon = Column(JSONB, nullable=False, default=dict)
    prediction_rows = Column(JSONB, nullable=False, default=list)
    library_versions = Column(JSONB, nullable=False, default=dict)
    logs = Column(JSONB, nullable=False, default=list)
    error = Column(String(512))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at = Column(DateTime(timezone=True))
    performance_by_model_and_horizon = Column(JSONB, nullable=False, default=dict)


class ModelTrainingSplitExperimentCounter(Base):
    __tablename__ = "model_training_split_experiment_counters"

    split_id = Column(
        UUID(as_uuid=True), ForeignKey("lag_feature_splits.id", ondelete="CASCADE"),
        primary_key=True,
    )
    last_number = Column(Integer, nullable=False, default=0)


class ExperimentBatch(Base):
    __tablename__ = "experiment_batches"
    __table_args__ = (
        CheckConstraint(
            "(lag_feature_split_id IS NOT NULL AND legacy_split_id IS NULL) OR "
            "(lag_feature_split_id IS NULL AND legacy_split_id IS NOT NULL)",
            name="ck_experiment_batch_split_source",
        ),
        CheckConstraint("next_sequence_number > 0", name="ck_experiment_batch_next_sequence"),
        CheckConstraint(
            "status IN ('ACTIVE', 'ARCHIVED', 'LEGACY')",
            name="ck_experiment_batch_status",
        ),
    )

    batch_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lag_feature_split_id = Column(
        UUID(as_uuid=True), ForeignKey("lag_feature_splits.id"), nullable=True, index=True,
    )
    legacy_split_id = Column(
        UUID(as_uuid=True), ForeignKey("model_training_splits.id"), nullable=True, index=True,
    )
    description = Column(Text)
    status = Column(String(16), nullable=False, default="ACTIVE")
    next_sequence_number = Column(Integer, nullable=False, default=1)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ExperimentTrainedModel(Base):
    __tablename__ = "experiment_trained_models"
    __table_args__ = (
        CheckConstraint("horizon IN (1, 3, 5)", name="ck_trained_model_horizon"),
        CheckConstraint(
            "status IN ('COMPLETED', 'FAILED')",
            name="ck_trained_model_status",
        ),
        UniqueConstraint("experiment_id", "horizon", name="uq_experiment_model_horizon"),
        Index("ix_experiment_trained_model_experiment", "experiment_id", "horizon"),
    )

    model_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    experiment_id = Column(
        UUID(as_uuid=True), ForeignKey("model_training_experiments.id", ondelete="CASCADE"),
        nullable=False,
    )
    horizon = Column(Integer, nullable=False)
    model_type = Column(String(32), nullable=False, default="RANDOM_FOREST")
    hyperparameters = Column(JSONB, nullable=False)
    training_time_ms = Column(Float)
    artifact_reference = Column(Text)
    lag_feature_forest_id = Column(
        UUID(as_uuid=True), ForeignKey("lag_feature_forests.id"), nullable=True,
    )
    status = Column(String(16), nullable=False, default="COMPLETED")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ModelTrainingForecastResult(Base):
    __tablename__ = "model_training_forecast_results"
    __table_args__ = (
        CheckConstraint("horizon IN (1, 3, 5)", name="ck_training_forecast_horizon"),
        CheckConstraint(
            "actual_vehicle_count >= 0 AND predicted_vehicle_count >= 0 AND absolute_error >= 0",
            name="ck_training_forecast_values",
        ),
        CheckConstraint(
            "model_type IN ('RANDOM_FOREST', 'PERSISTENCE', 'HISTORICAL_AVERAGE')",
            name="ck_training_forecast_model_type",
        ),
        UniqueConstraint(
            "experiment_id", "session_id", "input_timestamp", "horizon", "model_type",
            name="uq_training_forecast_sample_horizon",
        ),
        Index(
            "ix_training_forecast_experiment_model_horizon",
            "experiment_id", "model_type", "horizon",
        ),
    )

    id = Column(BigInteger, Identity(), primary_key=True)
    experiment_id = Column(
        UUID(as_uuid=True), ForeignKey("model_training_experiments.id", ondelete="CASCADE"),
        nullable=False,
    )
    model_id = Column(
        UUID(as_uuid=True), ForeignKey("experiment_trained_models.model_id", ondelete="CASCADE"),
        nullable=True,
    )
    model_type = Column(String(32), nullable=False, default="RANDOM_FOREST")
    dataset_id = Column(UUID(as_uuid=True), ForeignKey("datasets.id"), nullable=False)
    session_id = Column(UUID(as_uuid=True), ForeignKey("recording_sessions.id"), nullable=False)
    input_timestamp = Column(DateTime(timezone=True), nullable=False)
    forecast_timestamp = Column(DateTime(timezone=True), nullable=False)
    actual_timestamp = Column(DateTime(timezone=True), nullable=False)
    horizon = Column(Integer, nullable=False)
    actual_vehicle_count = Column(Float, nullable=False)
    predicted_vehicle_count = Column(Float, nullable=False)
    absolute_error = Column(Float, nullable=False)
    squared_error = Column(Float, nullable=False)


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
