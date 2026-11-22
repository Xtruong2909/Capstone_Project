import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    BigInteger,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.database.database import Base


class DatasetGroup(Base):
    __tablename__ = "dataset_groups"
    __table_args__ = (UniqueConstraint("source", "drone_id", name="uq_dataset_group_source_drone"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(128), nullable=True)
    source = Column(String(255), nullable=False)
    drone_id = Column(String(32), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    datasets = relationship("Dataset", back_populates="group")


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(128), nullable=False, unique=True)
    code = Column(String(64), nullable=False, unique=True)
    source = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    capture_date = Column(Date, nullable=True)
    recording_date = Column(Date, nullable=True)
    drone_id = Column(String(32), nullable=True)
    group_id = Column(UUID(as_uuid=True), ForeignKey("dataset_groups.id", ondelete="SET NULL"), nullable=True, index=True)
    location_name = Column(String(255), nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    creator = relationship("User", foreign_keys=[created_by])
    group = relationship("DatasetGroup", back_populates="datasets")
    dataset_files = relationship("DatasetFile", back_populates="dataset", cascade="all, delete-orphan")


class DatasetFile(Base):
    __tablename__ = "dataset_files"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id = Column(UUID(as_uuid=True), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, unique=True)
    data_file_path = Column(String(512), nullable=True)
    original_filename = Column(String(255), nullable=True)
    csv_file_path = Column(String(512), nullable=True)
    parquet_file_path = Column(String(512), nullable=True)
    file_format = Column(String(16), nullable=False, default="CSV")
    file_size_bytes = Column(BigInteger, nullable=False, default=0)
    total_records = Column(BigInteger, nullable=False, default=0)
    approval_status = Column(String(32), nullable=False, default="PENDING")
    submitted_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approval_note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC),
                        onupdate=lambda: datetime.now(UTC), nullable=False)
    dataset = relationship("Dataset", back_populates="dataset_files")
    submitter = relationship("User", foreign_keys=[submitted_by])
    approver = relationship("User", foreign_keys=[approved_by])
    recording_sessions = relationship(
        "RecordingSession", secondary="dataset_file_sessions", viewonly=True,
    )


class RecordingSession(Base):
    __tablename__ = "recording_sessions"
    __table_args__ = (
        UniqueConstraint("dataset_id", "original_filename", name="uq_recording_session_filename"),
        UniqueConstraint("dataset_id", "checksum", name="uq_recording_session_checksum"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id = Column(UUID(as_uuid=True), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False)
    original_filename = Column(String(255), nullable=False)
    drone_id = Column(String(32), nullable=False)
    recording_date = Column(Date, nullable=False)
    scheduled_start = Column(DateTime(timezone=True), nullable=False)
    scheduled_end = Column(DateTime(timezone=True), nullable=False)
    file_path = Column(String(512), nullable=False)
    file_size = Column(BigInteger, nullable=False)
    checksum = Column(String(64), nullable=False)
    upload_status = Column(String(32), nullable=False, default="UPLOADED")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class DatasetFileSession(Base):
    __tablename__ = "dataset_file_sessions"
    __table_args__ = (UniqueConstraint("file_id", "session_id", name="uq_file_session"),)

    file_id = Column(UUID(as_uuid=True), ForeignKey("dataset_files.id", ondelete="CASCADE"), primary_key=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey("recording_sessions.id", ondelete="CASCADE"), primary_key=True)


class DatasetUploadJob(Base):
    __tablename__ = "dataset_upload_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(20), nullable=False, default="PENDING")
    total_files = Column(Integer, nullable=False)
    processed_files = Column(Integer, nullable=False, default=0)
    result = Column(JSONB, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC),
                        onupdate=lambda: datetime.now(UTC))


class DatasetGroupProcessingJob(Base):
    __tablename__ = "dataset_group_processing_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id = Column(UUID(as_uuid=True), ForeignKey("dataset_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    staging_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    operation = Column(String(16), nullable=False)
    status = Column(String(20), nullable=False, default="PENDING")
    total_datasets = Column(Integer, nullable=False)
    processed_datasets = Column(Integer, nullable=False, default=0)
    results = Column(JSONB, nullable=False, default=list)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC),
                        onupdate=lambda: datetime.now(UTC), nullable=False)


class DatasetColumnMapping(Base):
    __tablename__ = "dataset_column_mappings"
    __table_args__ = (
        UniqueConstraint(
            "dataset_id",
            "dataset_file_id",
            name="uq_dataset_column_mapping_file",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id = Column(
        UUID(as_uuid=True),
        ForeignKey("datasets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dataset_file_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dataset_files.id", ondelete="CASCADE"),
        nullable=False,
    )
    mappings = Column(JSONB, nullable=False)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    dataset = relationship("Dataset")
    dataset_file = relationship("DatasetFile")
    updater = relationship("User", foreign_keys=[updated_by])


class DataCleaningHistory(Base):
    __tablename__ = "data_cleaning_histories"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    dataset_file_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dataset_files.id", ondelete="CASCADE"),
        nullable=False,
    )
    step_order = Column(Integer, nullable=False, default=1)
    cleaning_operation = Column(String(64), nullable=False)
    parameters = Column(JSONB, nullable=True)
    records_before = Column(BigInteger, nullable=False, default=0)
    records_after = Column(BigInteger, nullable=False, default=0)
    executed_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    dataset_file = relationship("DatasetFile")
    executor = relationship("User", foreign_keys=[executed_by])


class DatasetAccessGrant(Base):
    __tablename__ = "dataset_access_grants"
    __table_args__ = (
        UniqueConstraint("dataset_id", "user_id", name="uq_dataset_user_access"),
        Index("ix_dataset_access_grants_user_id", "user_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id = Column(UUID(as_uuid=True), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    granted_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    dataset = relationship("Dataset")
    user = relationship("User", foreign_keys=[user_id])
    granter = relationship("User", foreign_keys=[granted_by])
