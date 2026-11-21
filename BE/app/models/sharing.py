"""ORM models for Result Sharing Management."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.database.database import Base

RESOURCE_TYPES = ("DATASET", "TRAIN_TEST", "EXPERIMENT", "PREDICTION")

SHARE_STATUSES = ("DRAFT", "PUBLISHED", "REVOKED")

VISIBLE_SECTIONS_BY_TYPE = {
    "DATASET": {"metadata", "statistics", "sessions", "traffic_flow_chart"},
    "TRAIN_TEST": {"split_summary", "train_test_counts", "session_distribution", "split_configuration"},
    "EXPERIMENT": {
        "experiment_summary", "hyperparameters", "evaluation_metrics",
        "baseline_comparison", "prediction_rows", "horizon_comparison",
    },
    "PREDICTION": {
        "forecast_summary", "model_information", "lag_features",
        "forecast_results", "forecast_chart",
    },
}


class SharedReport(Base):
    __tablename__ = "shared_reports"
    __table_args__ = (
        CheckConstraint(
            "status IN ('DRAFT', 'PUBLISHED', 'REVOKED')",
            name="ck_shared_report_status",
        ),
        CheckConstraint(
            "visibility = 'BUSINESS_USER'",
            name="ck_shared_report_visibility",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    visibility = Column(String(32), nullable=False, default="BUSINESS_USER")
    status = Column(String(16), nullable=False, default="DRAFT")
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))
    published_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)

    creator = relationship("User", foreign_keys=[created_by])
    items = relationship("SharedReportItem", back_populates="report", cascade="all, delete-orphan")


class SharedReportItem(Base):
    __tablename__ = "shared_report_items"
    __table_args__ = (
        UniqueConstraint("share_id", "resource_type", "resource_id", name="uq_share_item_resource"),
        CheckConstraint(
            "resource_type IN ('DATASET', 'TRAIN_TEST', 'EXPERIMENT', 'PREDICTION')",
            name="ck_share_item_resource_type",
        ),
        CheckConstraint("jsonb_typeof(visible_sections) = 'array'", name="ck_share_item_sections_array"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    share_id = Column(UUID(as_uuid=True), ForeignKey("shared_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    resource_type = Column(String(32), nullable=False)
    resource_id = Column(UUID(as_uuid=True), nullable=False)
    # Pin an approved Dataset version so later uploads cannot silently change a published result.
    resource_version_id = Column(
        UUID(as_uuid=True), ForeignKey("dataset_versions.id", ondelete="RESTRICT"), nullable=True,
    )
    visible_sections = Column(JSONB, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))

    report = relationship("SharedReport", back_populates="items")
