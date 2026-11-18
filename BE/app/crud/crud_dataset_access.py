from uuid import UUID

from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.sql.selectable import Exists

from app.models.dataset import Dataset, DatasetAccessGrant, DatasetGroup, DatasetVersion
from app.models.user import User

ACCESS_ROLES = ("data_scientist", "business_user")


def get_group(db: Session, group_id: UUID) -> DatasetGroup | None:
    return db.get(DatasetGroup, group_id)


def list_groups(
    db: Session, user: User, search: str | None, skip: int, limit: int,
) -> list[DatasetGroup]:
    membership = select(Dataset.id).where(Dataset.group_id == DatasetGroup.id)
    if user.role_id != "admin":
        membership = membership.where(access_filter(user.id))
    query = select(DatasetGroup).where(exists(membership))
    if search:
        pattern = f"%{search}%"
        query = query.where(or_(
            DatasetGroup.name.ilike(pattern), DatasetGroup.drone_id.ilike(pattern),
        ))
    return list(db.scalars(query.order_by(DatasetGroup.created_at.desc(), DatasetGroup.id)
                           .offset(skip).limit(limit)))


def list_approved_groups(
    db: Session, user_id: UUID, search: str | None, skip: int, limit: int,
) -> list[DatasetGroup]:
    visible_approved = (
        select(Dataset.id)
        .join(DatasetVersion, DatasetVersion.dataset_id == Dataset.id)
        .where(
            Dataset.group_id == DatasetGroup.id,
            DatasetVersion.approval_status == "APPROVED",
            access_filter(user_id),
        )
    )
    query = select(DatasetGroup).where(exists(visible_approved))
    if search:
        pattern = f"%{search}%"
        query = query.where(or_(
            DatasetGroup.name.ilike(pattern), DatasetGroup.drone_id.ilike(pattern),
        ))
    return list(db.scalars(
        query.order_by(DatasetGroup.created_at.desc(), DatasetGroup.id)
        .offset(skip).limit(limit)
    ))


def approved_group_dataset_ids_for_user(
    db: Session, group_id: UUID, user_id: UUID,
) -> set[UUID]:
    rows = db.scalars(
        select(Dataset.id)
        .join(DatasetVersion, DatasetVersion.dataset_id == Dataset.id)
        .where(
            Dataset.group_id == group_id,
            DatasetVersion.approval_status == "APPROVED",
            access_filter(user_id),
        )
        .distinct()
    )
    return set(rows)


def list_group_datasets(db: Session, group_id: UUID) -> list[Dataset]:
    return list(db.scalars(select(Dataset).where(Dataset.group_id == group_id)
                           .order_by(Dataset.recording_date, Dataset.id)))


def approved_group_dataset_ids(db: Session, group_id: UUID) -> set[UUID]:
    rows = db.scalars(
        select(Dataset.id).join(DatasetVersion, DatasetVersion.dataset_id == Dataset.id)
        .where(Dataset.group_id == group_id, DatasetVersion.approval_status == "APPROVED")
        .distinct()
    )
    return set(rows)


def list_group_grants(
    db: Session, group_id: UUID, user_id: UUID | None = None,
) -> list[DatasetAccessGrant]:
    query = (
        select(DatasetAccessGrant)
        .join(Dataset, Dataset.id == DatasetAccessGrant.dataset_id)
        .options(joinedload(DatasetAccessGrant.user))
        .where(Dataset.group_id == group_id)
    )
    if user_id is not None:
        query = query.where(DatasetAccessGrant.user_id == user_id)
    return list(db.scalars(query.order_by(DatasetAccessGrant.created_at, DatasetAccessGrant.id)))


def list_eligible_group_users(
    db: Session, search: str | None, skip: int, limit: int,
) -> list[User]:
    query = select(User).where(User.role_id.in_(ACCESS_ROLES))
    if search:
        pattern = f"%{search}%"
        query = query.where(or_(User.full_name.ilike(pattern), User.email.ilike(pattern)))
    return list(db.scalars(query.order_by(User.full_name, User.id).offset(skip).limit(limit)))


def access_filter(user_id: UUID) -> Exists:
    return exists(
        select(DatasetAccessGrant.id).where(
            DatasetAccessGrant.dataset_id == Dataset.id,
            DatasetAccessGrant.user_id == user_id,
        )
    )


def get_dataset(db: Session, dataset_id: UUID) -> Dataset | None:
    return db.get(Dataset, dataset_id)


def has_approved_version(db: Session, dataset_id: UUID) -> bool:
    return bool(
        db.scalar(
            select(
                exists().where(
                    DatasetVersion.dataset_id == dataset_id,
                    DatasetVersion.approval_status == "APPROVED",
                )
            )
        )
    )


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


def approved_datasets(
    db: Session, user: User, search: str | None, skip: int, limit: int
) -> list[tuple[Dataset, DatasetVersion]]:
    query = (
        select(Dataset, DatasetVersion)
        .join(DatasetVersion, DatasetVersion.dataset_id == Dataset.id)
        .where(DatasetVersion.approval_status == "APPROVED")
    )
    query = query.where(access_filter(user.id))
    if search:
        query = query.where(
            or_(Dataset.name.ilike(f"%{search}%"), Dataset.code.ilike(f"%{search}%"))
        )
    rows = db.execute(
        query.order_by(Dataset.created_at.desc(), DatasetVersion.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(rows)
