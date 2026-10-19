import uuid
from datetime import UTC, datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    BigInteger,
    Column,
    Date,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.database.database import Base


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(128), nullable=False, unique=True)
    code = Column(String(64), nullable=False, unique=True)
    source = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    capture_date = Column(Date, nullable=True)
    location_name = Column(String(255), nullable=False)
    roi_geometry = Column(Geometry("POLYGON", srid=4326), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    creator = relationship("User", foreign_keys=[created_by])
    versions = relationship("DatasetVersion", back_populates="dataset", cascade="all, delete-orphan")


class DatasetVersion(Base):
    __tablename__ = "dataset_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id = Column(UUID(as_uuid=True), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False)
    version_tag = Column(String(32), nullable=False)
    data_file_path = Column(String(512), nullable=True)
    original_filename = Column(String(255), nullable=True)
    csv_file_path = Column(String(512), nullable=True)
    parquet_file_path = Column(String(512), nullable=True)
    geojson_file_path = Column(String(512), nullable=True)
    file_format = Column(String(16), nullable=False, default="CSV")
    file_size_bytes = Column(BigInteger, nullable=False, default=0)
    total_records = Column(BigInteger, nullable=False, default=0)
    approval_status = Column(String(32), nullable=False, default="PENDING")
    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approval_note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    dataset = relationship("Dataset", back_populates="versions")
    approver = relationship("User", foreign_keys=[approved_by])


class DatasetColumnMapping(Base):
    __tablename__ = "dataset_column_mappings"
    __table_args__ = (
        UniqueConstraint(
            "dataset_id",
            "dataset_version_id",
            name="uq_dataset_column_mapping_version",
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
    dataset_version = relationship("DatasetVersion")
    updater = relationship("User", foreign_keys=[updated_by])


class DatasetAccessGrant(Base):
    __tablename__ = "dataset_access_grants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_version_id = Column(UUID(as_uuid=True), ForeignKey("dataset_versions.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    granted_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    dataset_version = relationship("DatasetVersion")
    user = relationship("User", foreign_keys=[user_id])
    granter = relationship("User", foreign_keys=[granted_by])
