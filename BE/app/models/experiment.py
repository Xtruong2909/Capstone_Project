import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.database.database import Base


class Experiment(Base):
    __tablename__ = "experiments"
    __table_args__ = (
        CheckConstraint(
            "model_type IN ('RANDOM_FOREST', 'PERSISTENCE', 'HISTORICAL_AVERAGE')",
            name="ck_experiment_model",
        ),
        CheckConstraint("target_variable = 'traffic_flow'", name="ck_experiment_target"),
        CheckConstraint("temporal_aggregation_sec = 60", name="ck_experiment_interval"),
        CheckConstraint("forecast_horizon_minutes IN (1, 3, 5)", name="ck_experiment_horizon"),
        CheckConstraint("train_split_ratio = 0.70", name="ck_experiment_split"),
        CheckConstraint("split_strategy = 'CHRONOLOGICAL'", name="ck_experiment_strategy"),
        UniqueConstraint("id", "forecast_horizon_minutes", name="uq_experiment_horizon"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    dataset_version_id = Column(
        UUID(as_uuid=True), ForeignKey("dataset_versions.id", ondelete="RESTRICT"), nullable=False
    )
    model_type = Column(String(32), nullable=False)
    target_variable = Column(String(32), nullable=False, default="traffic_flow")
    temporal_aggregation_sec = Column(Integer, nullable=False, default=60)
    forecast_horizon_minutes = Column(Integer, nullable=False, default=1, server_default="1")
    train_split_ratio = Column(Numeric(3, 2), nullable=False, default=0.70, server_default="0.70")
    split_strategy = Column(
        String(32), nullable=False, default="CHRONOLOGICAL", server_default="CHRONOLOGICAL"
    )
    run_config = Column(JSONB, nullable=True)
    random_seed = Column(Integer, nullable=False, default=42)
    status = Column(
        String(32), nullable=False, default="DRAFT"
    )  # DRAFT, RUNNING, COMPLETED, FAILED
    execution_time_sec = Column(Numeric(8, 2), nullable=True)
    created_by = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    dataset_version = relationship("DatasetVersion")
    creator = relationship("User", foreign_keys=[created_by])
    evaluation_metric = relationship(
        "EvaluationMetric", back_populates="experiment", uselist=False, cascade="all, delete-orphan"
    )


class EvaluationMetric(Base):
    __tablename__ = "evaluation_metrics"
    __table_args__ = (
        CheckConstraint("mae >= 0 AND mae < 'Infinity'", name="ck_metric_mae"),
        CheckConstraint("rmse >= 0 AND rmse < 'Infinity'", name="ck_metric_rmse"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    experiment_id = Column(
        UUID(as_uuid=True),
        ForeignKey("experiments.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    mae = Column(Numeric(10, 4), nullable=False)
    rmse = Column(Numeric(10, 4), nullable=False)
    evaluated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    experiment = relationship("Experiment", back_populates="evaluation_metric")


class ForecastResult(Base):
    __tablename__ = "forecast_results"
    __table_args__ = (
        ForeignKeyConstraint(
            ["experiment_id", "horizon_minutes"],
            ["experiments.id", "experiments.forecast_horizon_minutes"],
            ondelete="CASCADE",
            name="fk_forecast_horizon",
        ),
        CheckConstraint("horizon_minutes IN (1, 3, 5)", name="ck_forecast_horizon"),
        UniqueConstraint("experiment_id", "timestamp", name="uq_forecast_target"),
    )
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    experiment_id = Column(UUID(as_uuid=True), nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False, comment="Forecast target time")
    horizon_minutes = Column(Integer, nullable=False)
    predicted_value = Column(Numeric(10, 2), nullable=False)
    actual_value = Column(Numeric(10, 2))
    lower_bound = Column(Numeric(10, 2))
    upper_bound = Column(Numeric(10, 2))
