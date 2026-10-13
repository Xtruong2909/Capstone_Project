import uuid
from datetime import UTC, datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database.database import Base


class Experiment(Base):
    __tablename__ = "experiments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    dataset_version_id = Column(UUID(as_uuid=True), ForeignKey("dataset_versions.id", ondelete="RESTRICT"), nullable=False)
    model_type = Column(String(32), nullable=False)  # ARIMA, PROPHET, BASELINE, RANDOM_FOREST, LSTM
    target_variable = Column(String(32), nullable=False, default="traffic_flow")
    temporal_aggregation_sec = Column(Integer, nullable=False, default=60)
    forecast_horizon_steps = Column(Integer, nullable=False, default=1)
    train_split_ratio = Column(Numeric(3, 2), nullable=False, default=0.80)
    random_seed = Column(Integer, nullable=False, default=42)
    status = Column(String(32), nullable=False, default="DRAFT")  # DRAFT, RUNNING, COMPLETED, FAILED
    execution_time_sec = Column(Numeric(8, 2), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    dataset_version = relationship("DatasetVersion")
    creator = relationship("User", foreign_keys=[created_by])
    evaluation_metric = relationship("EvaluationMetric", back_populates="experiment", uselist=False, cascade="all, delete-orphan")


class EvaluationMetric(Base):
    __tablename__ = "evaluation_metrics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    experiment_id = Column(UUID(as_uuid=True), ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False, unique=True)
    mae = Column(Numeric(10, 4), nullable=False)
    rmse = Column(Numeric(10, 4), nullable=False)
    mape = Column(Numeric(8, 4), nullable=False)
    r2_score = Column(Numeric(6, 4), nullable=False)
    evaluated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    experiment = relationship("Experiment", back_populates="evaluation_metric")
