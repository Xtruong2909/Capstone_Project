"""Ownership checks for private data-engineering workspaces."""
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.crud import crud_dataset
from app.models.dataset import Dataset
from app.models.user import User


def require_owned_dataset(db: Session, dataset_id: UUID, user: User) -> Dataset:
    dataset = crud_dataset.get_dataset_by_id(db, dataset_id)
    if dataset is None or dataset.created_by != user.id:
        raise HTTPException(404, "Không tìm thấy Dataset thuộc tài khoản của bạn")
    return dataset
