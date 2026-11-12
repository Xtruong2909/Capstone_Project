"""One-minute observations; NULL means an unimplemented measurement, never zero."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
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
    total_sessions = Column(Integer, nullable=False, default=0)
    completed_sessions = Column(Integer, nullable=False, default=0)
    failed_sessions = Column(Integer, nullable=False, default=0)
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


class TrafficAggregationSessionResult(Base):
    __tablename__ = "traffic_aggregation_session_results"
    __table_args__ = (
        CheckConstraint("time_bins >= 0", name="ck_aggregation_session_time_bins"),
        CheckConstraint("records_read >= 0", name="ck_aggregation_session_records_read"),
        UniqueConstraint(
            "aggregation_id", "session_id", name="uq_aggregation_session_result"
        ),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    aggregation_id = Column(
        UUID(as_uuid=True),
        ForeignKey("traffic_aggregation_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id = Column(
        UUID(as_uuid=True),
        ForeignKey("recording_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status = Column(String(24), nullable=False, default="QUEUED")
    time_bins = Column(Integer, nullable=False, default=0)
    records_read = Column(BigInteger, nullable=False, default=0)
    error_message = Column(Text, nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)


class TrafficTimeSeries(Base):
    __tablename__ = "traffic_time_series"
    __table_args__ = (
        CheckConstraint("aggregation_interval > 0", name="ck_traffic_interval"),
        CheckConstraint("vehicle_count >= 0", name="ck_traffic_count"),
        CheckConstraint("traffic_flow >= 0 AND traffic_flow < 'Infinity'", name="ck_traffic_flow"),
        CheckConstraint("mean_speed >= 0 AND mean_speed < 'Infinity'", name="ck_traffic_speed"),
        CheckConstraint(
            "traffic_density >= 0 AND traffic_density < 'Infinity'", name="ck_traffic_density"
        ),
        Index(
            "uq_traffic_bucket_legacy",
            "dataset_version_id", "roi_identifier", "time_bucket",
            unique=True,
            postgresql_where=text("aggregation_id IS NULL"),
        ),
        Index(
            "uq_traffic_run_session_bucket",
            "aggregation_id", "recording_session_id", "time_bucket",
            unique=True,
            postgresql_where=text(
                "aggregation_id IS NOT NULL AND recording_session_id IS NOT NULL"
            ),
        ),
        Index(
            "ix_traffic_run_session_time",
            "aggregation_id", "recording_session_id", "time_bucket",
        ),
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    dataset_version_id = Column(
        UUID(as_uuid=True), ForeignKey("dataset_versions.id", ondelete="CASCADE"), nullable=False
    )
    aggregation_id = Column(
        UUID(as_uuid=True), ForeignKey("traffic_aggregation_jobs.id", ondelete="CASCADE"),
        nullable=True, index=True,
    )
    recording_session_id = Column(
        # This column predates per-session aggregation and is VARCHAR(255) in
        # existing databases because legacy rows store source filenames here.
        # Keep the ORM aligned with that schema; new aggregation rows store
        # the RecordingSession UUID as text.
        String(255),
        nullable=True, index=True,
    )
    time_bucket = Column(DateTime(timezone=True), nullable=False)
    aggregation_interval = Column(Integer, nullable=False, default=60, server_default="60")
    roi_identifier = Column(String(64), nullable=False, default="MAIN_ROI")
    vehicle_count = Column(Integer, nullable=True)
    traffic_flow = Column(
        Numeric(10, 2), nullable=True, comment="Counting-line passages per minute"
    )
    traffic_density = Column(Numeric(10, 4), nullable=True    )
    mean_speed = Column(Numeric(6, 2), nullable=True, comment="km/h")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
