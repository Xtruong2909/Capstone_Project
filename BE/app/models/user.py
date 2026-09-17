import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum as SAEnum

from app.core.db import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"                    # Quản trị viên
    DATA_ENGINEER = "data_engineer"    # Kỹ sư dữ liệu
    DATA_SCIENTIST = "data_scientist"  # Nhà khoa học dữ liệu
    BUSINESS_USER = "business_user"    # Người dùng nghiệp vụ


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    full_name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole), nullable=False, default=UserRole.BUSINESS_USER)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
