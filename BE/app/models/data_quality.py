import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database.database import Base


class DataQualityCheck(Base):
    __tablename__ = "data_quality_checks"
    __table_args__ = (
        Index(
            "uq_data_quality_active_version",
            "dataset_version_id",
            unique=True,
            postgresql_where=text("status IN ('queued', 'running')"),
        ),
    )

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
    started_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    status = Column(String(16), nullable=False, default="queued", index=True)
    progress_percent = Column(Integer, nullable=False, default=0)
    processed_rows = Column(BigInteger, nullable=False, default=0)
    total_rows = Column(BigInteger, nullable=True)
    report = Column(JSONB, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)


class DataQualityIssue(Base):
    __tablename__ = "data_quality_issues"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    check_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_quality_checks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    row_number = Column(BigInteger, nullable=True)
    issue_type = Column(String(32), nullable=False, index=True)
    column_name = Column(String(512), nullable=True)
    message = Column(String(512), nullable=False)
    observed_value = Column(String(256), nullable=True)

    __table_args__ = (
        Index("ix_data_quality_issue_check_row", "check_id", "row_number"),
    )
