"""Ownership of private research outputs is separate from access to source datasets."""

from uuid import UUID

from fastapi import HTTPException

from app.models.user import User


def require_scientist_owner(user: User, owner_id: UUID | None) -> None:
    if user.role_id == "data_scientist" and owner_id != user.id:
        raise HTTPException(404, "Không tìm thấy kết quả nghiên cứu của tài khoản này")
