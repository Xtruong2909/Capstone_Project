"""Persisted vehicle-count windows and their fitted Random Forest models."""

import uuid

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database.database import Base


class LagFeatureGeneration(Base):
    __tablename__ = "lag_feature_generations"
    __table_args__ = (
        UniqueConstraint("aggregation_id", "configuration_hash", name="uq_lag_generation_config"),
        CheckConstraint("status IN ('PROCESSING', 'COMPLETED', 'FAILED')", name="ck_lag_generation_status"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    aggregation_id = Column(UUID(as_uuid=True), ForeignKey("traffic_aggregation_jobs.id"), nullable=False)
    configuration_hash = Column(String(64), nullable=False)
    configuration = Column(JSONB, nullable=False)
    status = Column(String(16), nullable=False, default="PROCESSING")
    sample_count = Column(Integer, nullable=False, default=0)
    warning = Column(String(255), nullable=False, default="Recording coverage is not verified")
    error_message = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at = Column(DateTime(timezone=True))


class LagFeatureSample(Base):
    __tablename__ = "lag_feature_samples"
    __table_args__ = (
        UniqueConstraint("generation_id", "session_id", "timestamp", name="uq_lag_sample_session_time"),
        CheckConstraint("lag_1 >= 0 AND lag_2 >= 0 AND lag_3 >= 0 AND lag_4 >= 0 AND lag_5 >= 0", name="ck_lag_sample_features"),
        CheckConstraint("target_h1 >= 0 AND target_h3 >= 0 AND target_h5 >= 0", name="ck_lag_sample_targets"),
    )

    id = Column(BigInteger, primary_key=True)
    generation_id = Column(UUID(as_uuid=True), ForeignKey("lag_feature_generations.id", ondelete="CASCADE"), nullable=False)
    aggregation_id = Column(UUID(as_uuid=True), ForeignKey("traffic_aggregation_jobs.id"), nullable=False)
    dataset_id = Column(UUID(as_uuid=True), ForeignKey("datasets.id"), nullable=False)
    session_id = Column(UUID(as_uuid=True), ForeignKey("recording_sessions.id"), nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False)
    lag_1 = Column(Integer, nullable=False)
    lag_2 = Column(Integer, nullable=False)
    lag_3 = Column(Integer, nullable=False)
    lag_4 = Column(Integer, nullable=False)
    lag_5 = Column(Integer, nullable=False)
    target_h1 = Column(Integer, nullable=False)
    target_h3 = Column(Integer, nullable=False)
    target_h5 = Column(Integer, nullable=False)


class LagFeatureSplit(Base):
    __tablename__ = "lag_feature_splits"
    __table_args__ = (
        UniqueConstraint(
            "feature_generation_id", "configuration_hash",
            name="uq_lag_split_generation_config",
        ),
        CheckConstraint("status = 'COMPLETED'", name="ck_lag_split_status"),
        CheckConstraint(
            "split_strategy IN ('DAY_BASED', 'SESSION_BASED')",
            name="ck_lag_split_strategy",
        ),
        CheckConstraint(
            "train_ratio_requested > 0 AND train_ratio_requested < 1 "
            "AND train_ratio_actual > 0 AND train_ratio_actual < 1",
            name="ck_lag_split_ratios",
        ),
        CheckConstraint(
            "total_samples = train_sample_count + test_sample_count "
            "AND train_sample_count > 0 AND test_sample_count > 0",
            name="ck_lag_split_sample_counts",
        ),
        CheckConstraint("shuffle = false", name="ck_lag_split_no_shuffle"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    feature_generation_id = Column(
        UUID(as_uuid=True), ForeignKey("lag_feature_generations.id"), nullable=False,
    )
    configuration_hash = Column(String(64), nullable=False)
    status = Column(String(16), nullable=False, default="COMPLETED")
    split_strategy = Column(String(16), nullable=False)
    train_ratio_requested = Column(Float, nullable=False)
    train_ratio_actual = Column(Float, nullable=False)
    shuffle = Column(Boolean, nullable=False, default=False)
    forecast_horizons = Column(JSONB, nullable=False)
    total_sessions = Column(Integer, nullable=False)
    train_sessions = Column(JSONB, nullable=False)
    test_sessions = Column(JSONB, nullable=False)
    total_samples = Column(Integer, nullable=False)
    train_sample_count = Column(Integer, nullable=False)
    test_sample_count = Column(Integer, nullable=False)
    samples_by_horizon = Column(JSONB, nullable=False)
    leakage_check = Column(JSONB, nullable=False)
    warnings = Column(JSONB, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class LagFeatureSplitSample(Base):
    __tablename__ = "lag_feature_split_samples"
    __table_args__ = (
        CheckConstraint("subset IN ('TRAIN', 'TEST')", name="ck_lag_split_sample_subset"),
        Index("ix_lag_split_sample_subset", "split_id", "subset", "sample_id"),
    )

    split_id = Column(
        UUID(as_uuid=True), ForeignKey("lag_feature_splits.id", ondelete="CASCADE"),
        primary_key=True,
    )
    sample_id = Column(
        BigInteger, ForeignKey("lag_feature_samples.id", ondelete="CASCADE"),
        primary_key=True,
    )
    subset = Column(String(5), nullable=False)


class LagFeatureForest(Base):
    __tablename__ = "lag_feature_forests"
    __table_args__ = (CheckConstraint("train_samples > 0 AND test_samples > 0", name="ck_lag_forest_split"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    generation_id = Column(UUID(as_uuid=True), ForeignKey("lag_feature_generations.id"), nullable=False)
    split_id = Column(
        UUID(as_uuid=True), ForeignKey("lag_feature_splits.id"), index=True,
    )
    split_strategy = Column(String(32), nullable=False)
    train_samples = Column(Integer, nullable=False)
    test_samples = Column(Integer, nullable=False)
    trained_through = Column(DateTime(timezone=True), nullable=False)
    hyperparameters = Column(JSONB, nullable=False)
    metrics = Column(JSONB, nullable=False)
    artifact_path = Column(Text, nullable=False)
    artifact_sha256 = Column(String(64), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
