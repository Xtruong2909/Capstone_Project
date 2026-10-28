"""One-minute observations; NULL means an unimplemented measurement, never zero."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database.database import Base


class TrafficAggregationJob(Base):
    __tablename__ = "traffic_aggregation_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id = Column(
        UUID(as_uuid=True),
        ForeignKey("datasets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dataset_version_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dataset_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    aggregation_interval = Column(Integer, nullable=False, default=60)
    roi_identifier = Column(String(64), nullable=False, default="MAIN_ROI")
    replace_existing = Column(Boolean, nullable=False, default=False)
    status = Column(String(16), nullable=False, default="queued", index=True)
    progress_percent = Column(Integer, nullable=False, default=0)
    records_created = Column(Integer, nullable=False, default=0)
    error_message = Column(Text, nullable=True)
    job_metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class TrafficTimeSeries(Base):
    __tablename__ = "traffic_time_series"
    __table_args__ = (
        CheckConstraint("aggregation_interval = 60", name="ck_traffic_interval"),
        CheckConstraint("vehicle_count >= 0", name="ck_traffic_count"),
        CheckConstraint("traffic_flow >= 0 AND traffic_flow < 'Infinity'", name="ck_traffic_flow"),
        CheckConstraint("mean_speed >= 0 AND mean_speed < 'Infinity'", name="ck_traffic_speed"),
        CheckConstraint(
            "traffic_density >= 0 AND traffic_density < 'Infinity'", name="ck_traffic_density"
        ),
        UniqueConstraint(
            "dataset_version_id", "roi_identifier", "time_bucket", name="uq_traffic_bucket"
        ),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    dataset_version_id = Column(
        UUID(as_uuid=True), ForeignKey("dataset_versions.id", ondelete="CASCADE"), nullable=False
    )
    time_bucket = Column(DateTime(timezone=True), nullable=False)
    aggregation_interval = Column(Integer, nullable=False, default=60, server_default="60")
    roi_identifier = Column(String(64), nullable=False, default="MAIN_ROI")
    vehicle_count = Column(Integer, nullable=True)
    traffic_flow = Column(
        Numeric(10, 2), nullable=True, comment="Counting-line passages per minute"
    )
    traffic_density = Column(Numeric(10, 4), nullable=True)
    mean_speed = Column(Numeric(6, 2), nullable=True, comment="km/h")
    congestion_level = Column(String(32), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
