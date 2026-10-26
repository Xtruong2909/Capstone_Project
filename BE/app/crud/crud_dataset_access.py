from uuid import UUID

from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.sql.selectable import Exists

from app.models.dataset import Dataset, DatasetAccessGrant, DatasetVersion
from app.models.user import User

ACCESS_ROLES = ("data_scientist", "business_user")


def access_filter(user_id: UUID) -> Exists:
    return exists(
        select(DatasetAccessGrant.id).where(
            DatasetAccessGrant.dataset_id == Dataset.id,
            DatasetAccessGrant.user_id == user_id,
        )
    )


def get_dataset(db: Session, dataset_id: UUID) -> Dataset | None:
    return db.get(Dataset, dataset_id)


def get_version(db: Session, version_id: UUID) -> DatasetVersion | None:
    return db.get(DatasetVersion, version_id)


def get_user(db: Session, user_id: UUID) -> User | None:
    return db.get(User, user_id)


def get_grant(db: Session, dataset_id: UUID, user_id: UUID) -> DatasetAccessGrant | None:
    return db.scalar(
        select(DatasetAccessGrant).where(
            DatasetAccessGrant.dataset_id == dataset_id,
            DatasetAccessGrant.user_id == user_id,
        )
    )


def eligible_users(
    db: Session, dataset_id: UUID, search: str | None, skip: int, limit: int
) -> list[tuple[User, bool]]:
    granted = exists(
        select(DatasetAccessGrant.id).where(
            DatasetAccessGrant.dataset_id == dataset_id,
            DatasetAccessGrant.user_id == User.id,
        )
    )
    query = select(User, granted).where(User.role_id.in_(ACCESS_ROLES))
    if search:
        query = query.where(
            or_(User.full_name.ilike(f"%{search}%"), User.email.ilike(f"%{search}%"))
        )
    return list(db.execute(query.order_by(User.full_name, User.id).offset(skip).limit(limit)))


def list_grants(db: Session, dataset_id: UUID, skip: int, limit: int) -> list[DatasetAccessGrant]:
    return list(
        db.scalars(
            select(DatasetAccessGrant)
            .options(joinedload(DatasetAccessGrant.user))
            .where(
                DatasetAccessGrant.dataset_id == dataset_id,
            )
            .order_by(DatasetAccessGrant.created_at, DatasetAccessGrant.id)
            .offset(skip)
            .limit(limit)
        )
    )


def add_grant(db: Session, dataset_id: UUID, user_id: UUID, admin_id: UUID) -> DatasetAccessGrant:
    grant = DatasetAccessGrant(dataset_id=dataset_id, user_id=user_id, granted_by=admin_id)
    db.add(grant)
    db.flush()
    return grant


def remove_grant(db: Session, grant: DatasetAccessGrant) -> None:
    db.delete(grant)


def accessible_datasets(
    db: Session, user: User, search: str | None, skip: int, limit: int
) -> list[Dataset]:
    query = select(Dataset)
    if user.role_id != "admin":
        query = query.where(access_filter(user.id))
    if search:
        query = query.where(
            or_(Dataset.name.ilike(f"%{search}%"), Dataset.code.ilike(f"%{search}%"))
        )
    return list(
        db.scalars(query.order_by(Dataset.created_at.desc(), Dataset.id).offset(skip).limit(limit))
    )
