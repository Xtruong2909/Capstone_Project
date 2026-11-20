"""Database queries for bounded, filtered Admin pages."""
from uuid import UUID

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.models.audit import AuditLog
from app.models.dataset import Dataset, DatasetAccessGrant, DatasetGroup, DatasetVersion
from app.models.user import User


def users_page(
    db: Session, page: int, page_size: int, search: str | None,
    role: str | None, is_active: bool | None,
) -> tuple[int, list[User]]:
    query = select(User)
    if search:
        query = query.where(or_(User.full_name.ilike(f"%{search}%"), User.email.ilike(f"%{search}%")))
    if role:
        query = query.where(User.role_id == role)
    if is_active is not None:
        query = query.where(User.is_active == is_active)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(query.order_by(User.created_at.desc(), User.id)
                      .offset((page - 1) * page_size).limit(page_size)).all()
    return total, list(rows)


def versions_page(
    db: Session, page: int, page_size: int, search: str | None, approval_status: str | None,
    group_id: UUID | None = None, ungrouped: bool = False,
) -> tuple[int, list[dict]]:
    query = (select(DatasetVersion, Dataset.name, Dataset.recording_date, Dataset.drone_id,
                    Dataset.group_id, DatasetGroup.name.label("group_name"))
             .join(Dataset, Dataset.id == DatasetVersion.dataset_id)
             .outerjoin(DatasetGroup, DatasetGroup.id == Dataset.group_id))
    query = _filter_versions(query, search, approval_status)
    if ungrouped:
        query = query.where(Dataset.group_id.is_(None))
    elif group_id is not None:
        query = query.where(Dataset.group_id == group_id)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.execute(query.order_by(DatasetVersion.created_at.desc(), DatasetVersion.id)
                      .offset((page - 1) * page_size).limit(page_size)).all()
    return total, [{
        "id": ver.id, "dataset_id": ver.dataset_id, "dataset_name": name,
        "recording_date": date, "drone_id": drone, "group_id": group_id,
        "group_name": group_name, "version_tag": ver.version_tag,
        "file_format": ver.file_format, "total_records": ver.total_records,
        "approval_status": ver.approval_status, "approval_note": ver.approval_note,
        "created_at": ver.created_at,
    } for ver, name, date, drone, group_id, group_name in rows]


def _filter_versions(query: Select, search: str | None, approval_status: str | None) -> Select:
    if approval_status:
        query = query.where(DatasetVersion.approval_status == approval_status)
    if approval_status == "SUBMITTED":
        query = query.where(DatasetVersion.submitted_by.is_not(None),
                            DatasetVersion.submitted_at.is_not(None))
    if search:
        query = query.where(or_(Dataset.name.ilike(f"%{search}%"),
                                DatasetVersion.version_tag.ilike(f"%{search}%"),
                                DatasetGroup.name.ilike(f"%{search}%")))
    return query


def dataset_groups_page(
    db: Session, page: int, page_size: int, search: str | None, approval_status: str | None,
) -> tuple[int, list[dict]]:
    query = (select(Dataset.group_id, DatasetGroup.name.label("group_name"),
                    func.count(func.distinct(Dataset.id)).label("dataset_count"),
                    func.count(DatasetVersion.id).label("version_count"),
                    func.min(DatasetVersion.approval_status).label("first_status"),
                    func.max(DatasetVersion.approval_status).label("last_status"))
             .select_from(DatasetVersion)
             .join(Dataset, Dataset.id == DatasetVersion.dataset_id)
             .outerjoin(DatasetGroup, DatasetGroup.id == Dataset.group_id))
    query = _filter_versions(query, search, approval_status).group_by(
        Dataset.group_id, DatasetGroup.name,
    )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.execute(query.order_by(DatasetGroup.name, Dataset.group_id)
                      .offset((page - 1) * page_size).limit(page_size)).mappings().all()
    items = []
    for row in rows:
        item = dict(row)
        first_status, last_status = item.pop("first_status"), item.pop("last_status")
        item["approval_status"] = first_status if first_status == last_status else "MIXED"
        item["approval_notes"] = []
        items.append(item)
    if items:
        group_ids = [item["group_id"] for item in items if item["group_id"] is not None]
        predicates = [Dataset.group_id.in_(group_ids)]
        if any(item["group_id"] is None for item in items):
            predicates.append(Dataset.group_id.is_(None))
        notes_query = (select(Dataset.group_id, DatasetVersion.approval_note)
                       .select_from(DatasetVersion)
                       .join(Dataset, Dataset.id == DatasetVersion.dataset_id)
                       .outerjoin(DatasetGroup, DatasetGroup.id == Dataset.group_id)
                       .where(or_(*predicates), DatasetVersion.approval_note.is_not(None)))
        notes = db.execute(_filter_versions(notes_query, search, approval_status).distinct()).all()
        grouped_notes: dict[UUID | None, set[str]] = {}
        for group_id, note in notes:
            if note.strip():
                grouped_notes.setdefault(group_id, set()).add(note.strip())
        for item in items:
            item["approval_notes"] = sorted(grouped_notes.get(item["group_id"], set()))
    return total, items


def grants_page(db: Session, page: int, page_size: int, search: str | None) -> tuple[int, list[dict]]:
    granter = aliased(User)
    query = (select(DatasetAccessGrant, Dataset.name, User.full_name, User.email,
                    User.role_id, granter.email)
             .join(Dataset, Dataset.id == DatasetAccessGrant.dataset_id)
             .join(User, User.id == DatasetAccessGrant.user_id)
             .outerjoin(granter, granter.id == DatasetAccessGrant.granted_by))
    if search:
        query = query.where(or_(Dataset.name.ilike(f"%{search}%"),
                                User.full_name.ilike(f"%{search}%"),
                                User.email.ilike(f"%{search}%")))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.execute(query.order_by(DatasetAccessGrant.created_at.desc(), DatasetAccessGrant.id)
                      .offset((page - 1) * page_size).limit(page_size)).all()
    return total, [{
        "id": grant.id, "dataset_id": grant.dataset_id, "dataset_name": dataset_name,
        "user_id": grant.user_id, "user_name": name, "user_email": email,
        "user_role": role, "granted_by_email": granted_email, "created_at": grant.created_at,
    } for grant, dataset_name, name, email, role, granted_email in rows]


def summary(db: Session) -> dict:
    def count(model: type) -> int:
        return db.scalar(select(func.count()).select_from(model)) or 0

    statuses = dict(db.execute(select(DatasetVersion.approval_status, func.count())
                               .group_by(DatasetVersion.approval_status)).all())
    return {
        "total_users": count(User),
        "active_users": db.scalar(select(func.count()).select_from(User)
                                   .where(User.is_active.is_(True))) or 0,
        "users_by_role": dict(db.execute(select(User.role_id, func.count())
                                          .group_by(User.role_id)).all()),
        "total_datasets": count(Dataset), "total_versions": sum(statuses.values()),
        "pending_approvals": db.scalar(select(func.count()).select_from(DatasetVersion).where(
            DatasetVersion.approval_status == "SUBMITTED",
            DatasetVersion.submitted_by.is_not(None), DatasetVersion.submitted_at.is_not(None),
        )) or 0,
        "approved_versions": statuses.get("APPROVED", 0),
        "total_audit_logs": count(AuditLog), "total_access_grants": count(DatasetAccessGrant),
    }
