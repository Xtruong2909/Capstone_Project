from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.crud import crud_dataset_access as repo
from app.models.dataset import Dataset, DatasetAccessGrant
from app.models.user import User
from app.schemas.dataset_access import (
    AccessibleDataset,
    ApprovedDatasetResponse,
    DatasetAccessResponse,
    EligibleDatasetUser,
    GroupAccessCatalogItem,
    GroupAccessResponse,
    GroupUserAccess,
)


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
    if not repo.has_approved_version(db, dataset_id):
        raise HTTPException(
            409,
            "Dataset phải có ít nhất một phiên bản được Admin phê duyệt (APPROVED) "
            "trước khi cấp quyền cho Data Scientist hoặc Business User",
        )
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


def list_approved_datasets(
    db: Session, user: User, search: str | None, skip: int, limit: int
) -> list[ApprovedDatasetResponse]:
    if user.role_id not in repo.ACCESS_ROLES:
        raise HTTPException(403, "Data Scientist or Business User role required")

    return [
        ApprovedDatasetResponse(
            dataset_id=dataset.id,
            dataset_name=dataset.name,
            dataset_code=dataset.code,
            source=dataset.source,
            location_name=dataset.location_name,
            recording_date=getattr(dataset, "recording_date", None),
            drone_id=getattr(dataset, "drone_id", None),
            version_id=version.id,
            version_tag=version.version_tag,
            approval_status=version.approval_status,
            approved_by=version.approved_by,
        )
        for dataset, version in repo.approved_datasets(db, user, search, skip, limit)
    ]


def list_approved_groups(
    db: Session, user: User, search: str | None, skip: int, limit: int,
) -> list[GroupAccessCatalogItem]:
    if user.role_id not in repo.ACCESS_ROLES:
        raise HTTPException(403, "Data Scientist or Business User role required")
    groups = repo.list_approved_groups(db, user.id, search, skip, limit)
    return [
        GroupAccessCatalogItem(
            group_id=group.id,
            group_name=group.name,
            source=group.source,
            drone_id=group.drone_id,
            total_datasets=len(repo.list_group_datasets(db, group.id)),
            approved_datasets=len(repo.approved_group_dataset_ids_for_user(db, group.id, user.id)),
        )
        for group in groups
    ]


def _group_datasets(db: Session, group_id: UUID) -> list[Dataset]:
    if repo.get_group(db, group_id) is None:
        raise HTTPException(404, "Dataset group not found")
    datasets = repo.list_group_datasets(db, group_id)
    if not datasets:
        raise HTTPException(409, "Dataset group has no datasets")
    return datasets


def list_accessible_groups(
    db: Session, user: User, search: str | None, skip: int, limit: int,
) -> list[GroupAccessCatalogItem]:
    if user.role_id not in ("admin", *repo.ACCESS_ROLES):
        raise HTTPException(403, "Dataset consumer role required")
    groups = repo.list_groups(db, user, search, skip, limit)
    result = []
    for group in groups:
        datasets = repo.list_group_datasets(db, group.id)
        approved = repo.approved_group_dataset_ids(db, group.id)
        result.append(GroupAccessCatalogItem(
            group_id=group.id, group_name=group.name, source=group.source,
            drone_id=group.drone_id, total_datasets=len(datasets),
            approved_datasets=len(approved),
        ))
    return result


def _group_user_access(user: User, granted_count: int, total_count: int) -> GroupUserAccess:
    return GroupUserAccess(
        user_id=user.id, full_name=user.full_name, email=user.email,
        role=user.role_id, granted_datasets=granted_count,
        total_datasets=total_count, has_full_access=granted_count == total_count,
    )


def list_group_eligible_users(
    db: Session, group_id: UUID, search: str | None, skip: int, limit: int,
) -> list[GroupUserAccess]:
    datasets = _group_datasets(db, group_id)
    grants = repo.list_group_grants(db, group_id)
    counts: dict[UUID, int] = {}
    for grant in grants:
        counts[grant.user_id] = counts.get(grant.user_id, 0) + 1
    return [
        _group_user_access(user, counts.get(user.id, 0), len(datasets))
        for user in repo.list_eligible_group_users(db, search, skip, limit)
    ]


def list_group_access(
    db: Session, group_id: UUID, skip: int, limit: int,
) -> list[GroupUserAccess]:
    datasets = _group_datasets(db, group_id)
    grants = repo.list_group_grants(db, group_id)
    users: dict[UUID, tuple[User, int]] = {}
    for grant in grants:
        user, count = users.get(grant.user_id, (grant.user, 0))
        users[grant.user_id] = (user, count + 1)
    ordered = sorted(users.values(), key=lambda item: (item[0].full_name, str(item[0].id)))
    return [_group_user_access(user, count, len(datasets))
            for user, count in ordered[skip:skip + limit]]


def grant_group_access(
    db: Session, group_id: UUID, user_id: UUID, admin: User,
) -> GroupAccessResponse:
    require_access_admin(admin)
    datasets = _group_datasets(db, group_id)
    user = repo.get_user(db, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    if user.role_id not in repo.ACCESS_ROLES:
        raise HTTPException(422, "Only Data Scientist and Business User can receive access")
    approved = repo.approved_group_dataset_ids(db, group_id)
    if approved != {dataset.id for dataset in datasets}:
        raise HTTPException(409, "Every Dataset in the group must have an APPROVED version")
    existing = repo.list_group_grants(db, group_id, user_id)
    granted_ids = {grant.dataset_id for grant in existing}
    try:
        for dataset in datasets:
            if dataset.id not in granted_ids:
                repo.add_grant(db, dataset.id, user_id, admin.id)
        if len(granted_ids) != len(datasets):
            db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Dataset group access changed; please retry") from exc
    grants = repo.list_group_grants(db, group_id, user_id)
    return GroupAccessResponse(
        group_id=group_id, user_id=user_id, total_datasets=len(datasets),
        granted_datasets=len(grants), grants=[serialize_grant(grant) for grant in grants],
    )


def revoke_group_access(db: Session, group_id: UUID, user_id: UUID, admin: User) -> None:
    require_access_admin(admin)
    _group_datasets(db, group_id)
    grants = repo.list_group_grants(db, group_id, user_id)
    if not grants:
        raise HTTPException(404, "Dataset group access not found")
    for grant in grants:
        repo.remove_grant(db, grant)
    db.commit()
