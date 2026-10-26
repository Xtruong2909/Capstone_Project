from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.crud import crud_dataset_access as repo
from app.models.dataset import Dataset, DatasetAccessGrant
from app.models.user import User
from app.schemas.dataset_access import AccessibleDataset, DatasetAccessResponse, EligibleDatasetUser


def require_dataset(db: Session, dataset_id: UUID) -> Dataset:
    dataset = repo.get_dataset(db, dataset_id)
    if dataset is None:
        raise HTTPException(404, "Dataset not found")
    return dataset


def check_dataset_access(current_user: User, dataset_id: UUID, db: Session) -> Dataset:
    dataset = require_dataset(db, dataset_id)
    if current_user.role_id == "admin":
        return dataset
    if current_user.role_id in repo.ACCESS_ROLES:
        grant = repo.get_grant(db, dataset_id, current_user.id)
        if grant:
            return dataset
    raise HTTPException(403, "Dataset access has not been granted")


def check_dataset_version_access(current_user: User, version_id: UUID, db: Session) -> Dataset:
    version = repo.get_version(db, version_id)
    if version is None:
        raise HTTPException(404, "Dataset version not found")
    return check_dataset_access(current_user, version.dataset_id, db)


def require_access_admin(user: User) -> None:
    if user.role_id != "admin":
        raise HTTPException(403, "Administrator role required")


def serialize_grant(grant: DatasetAccessGrant) -> DatasetAccessResponse:
    return DatasetAccessResponse(
        id=grant.id,
        dataset_id=grant.dataset_id,
        user_id=grant.user_id,
        full_name=grant.user.full_name,
        email=grant.user.email,
        role=grant.user.role_id,
        granted_by=grant.granted_by,
        granted_at=grant.created_at,
    )


def grant_access(
    db: Session, dataset_id: UUID, user_id: UUID, admin: User
) -> DatasetAccessResponse:
    require_access_admin(admin)
    require_dataset(db, dataset_id)
    user = repo.get_user(db, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    if user.role_id not in repo.ACCESS_ROLES:
        raise HTTPException(422, "Only Data Scientist and Business User can receive access")
    if repo.get_grant(db, dataset_id, user_id):
        raise HTTPException(409, "Dataset access already exists")
    try:
        grant = repo.add_grant(db, dataset_id, user_id, admin.id)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # Only translate the expected unique conflict, not arbitrary DB failures.
        if repo.get_grant(db, dataset_id, user_id):
            raise HTTPException(409, "Dataset access already exists") from exc
        raise
    db.refresh(grant)
    return serialize_grant(grant)


def revoke_access(db: Session, dataset_id: UUID, user_id: UUID, admin: User) -> None:
    require_access_admin(admin)
    require_dataset(db, dataset_id)
    grant = repo.get_grant(db, dataset_id, user_id)
    if grant is None:
        raise HTTPException(404, "Dataset access not found")
    repo.remove_grant(db, grant)
    db.commit()


def list_eligible_users(
    db: Session, dataset_id: UUID, search: str | None, skip: int, limit: int
) -> list[EligibleDatasetUser]:
    require_dataset(db, dataset_id)
    return [
        EligibleDatasetUser(
            user_id=user.id,
            full_name=user.full_name,
            email=user.email,
            role=user.role_id,
            has_access=granted,
        )
        for user, granted in repo.eligible_users(db, dataset_id, search, skip, limit)
    ]


def list_access(
    db: Session, dataset_id: UUID, skip: int, limit: int
) -> list[DatasetAccessResponse]:
    require_dataset(db, dataset_id)
    return [serialize_grant(grant) for grant in repo.list_grants(db, dataset_id, skip, limit)]


def list_accessible(
    db: Session, user: User, search: str | None, skip: int, limit: int
) -> list[AccessibleDataset]:
    if user.role_id not in ("admin", *repo.ACCESS_ROLES):
        raise HTTPException(403, "Dataset consumer role required")
    return [
        AccessibleDataset.model_validate(dataset)
        for dataset in repo.accessible_datasets(db, user, search, skip, limit)
    ]
