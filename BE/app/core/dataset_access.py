from uuid import UUID

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_data_engineer
from app.database.database import get_db
from app.models.user import User
from app.services.dataset_access_service import check_dataset_access


def require_dataset_reader(
    dataset_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    # Preserve the existing data-engineering workflow and its separate role.
    if current_user.role_id == "data_engineer":
        return require_data_engineer(current_user)
    check_dataset_access(current_user, dataset_id, db)
    return current_user


def require_dataset_scientist(
    dataset_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    """For future analysis/training routes; a dataset grant is not an action grant."""
    if current_user.role_id not in ("admin", "data_scientist"):
        raise HTTPException(403, "Data Scientist role required")
    check_dataset_access(current_user, dataset_id, db)
    return current_user
