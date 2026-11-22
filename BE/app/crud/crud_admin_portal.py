"""Database queries for bounded, filtered Admin pages."""
from uuid import UUID

from sqlalchemy import Select, case, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.models.audit import AuditLog
from app.models.dataset import Dataset, DatasetAccessGrant, DatasetFile, DatasetGroup
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


def files_page(
    db: Session, page: int, page_size: int, search: str | None, approval_status: str | None,
    group_id: UUID | None = None, ungrouped: bool = False,
) -> tuple[int, list[dict]]:
    query = (select(DatasetFile, Dataset.name, Dataset.recording_date, Dataset.drone_id,
                    Dataset.group_id, DatasetGroup.name.label("group_name"))
             .join(Dataset, Dataset.id == DatasetFile.dataset_id)
             .outerjoin(DatasetGroup, DatasetGroup.id == Dataset.group_id))
    query = _filter_files(query, search, approval_status)
    if ungrouped:
        query = query.where(Dataset.group_id.is_(None))
    elif group_id is not None:
        query = query.where(Dataset.group_id == group_id)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.execute(query.order_by(DatasetFile.created_at.desc(), DatasetFile.id)
                      .offset((page - 1) * page_size).limit(page_size)).all()
    return total, [{
        "id": ver.id, "dataset_id": ver.dataset_id, "dataset_name": name,
        "recording_date": date, "drone_id": drone, "group_id": group_id,
        "group_name": group_name,
        "file_format": ver.file_format, "total_records": ver.total_records,
        "approval_status": ver.approval_status, "approval_note": ver.approval_note,
        "created_at": ver.created_at,
    } for ver, name, date, drone, group_id, group_name in rows]


def _filter_files(query: Select, search: str | None, approval_status: str | None) -> Select:
    if approval_status:
        query = query.where(DatasetFile.approval_status == approval_status)
    if approval_status == "SUBMITTED":
        query = query.where(DatasetFile.submitted_by.is_not(None),
                            DatasetFile.submitted_at.is_not(None))
    if search:
        query = query.where(or_(Dataset.name.ilike(f"%{search}%"),
                                DatasetGroup.name.ilike(f"%{search}%")))
    return query


def dataset_groups_page(
    db: Session, page: int, page_size: int, search: str | None, approval_status: str | None,
) -> tuple[int, list[dict]]:
    query = (select(Dataset.group_id, DatasetGroup.name.label("group_name"),
                    func.count(func.distinct(Dataset.id)).label("dataset_count"),
                    func.count(DatasetFile.id).label("file_count"),
                    func.min(DatasetFile.approval_status).label("first_status"),
                    func.max(DatasetFile.approval_status).label("last_status"))
             .select_from(DatasetFile)
             .join(Dataset, Dataset.id == DatasetFile.dataset_id)
             .outerjoin(DatasetGroup, DatasetGroup.id == Dataset.group_id))
    query = _filter_files(query, search, approval_status).group_by(
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
        notes_query = (select(Dataset.group_id, DatasetFile.approval_note)
                       .select_from(DatasetFile)
                       .join(Dataset, Dataset.id == DatasetFile.dataset_id)
                       .outerjoin(DatasetGroup, DatasetGroup.id == Dataset.group_id)
                       .where(or_(*predicates), DatasetFile.approval_note.is_not(None)))
        notes = db.execute(_filter_files(notes_query, search, approval_status).distinct()).all()
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


def batch_grants_page(
    db: Session, page: int, page_size: int, search: str | None,
) -> tuple[int, list[dict]]:
    """Count and paginate user/batch grants after grouping; keep ungrouped datasets separate."""
    scope_id = func.coalesce(Dataset.group_id, Dataset.id)
    dataset_id = case((Dataset.group_id.is_(None), Dataset.id))
    dataset_name = case((Dataset.group_id.is_(None), Dataset.name))
    totals = (select(scope_id.label("scope_id"), func.count(Dataset.id).label("total_datasets"))
              .group_by(scope_id).subquery())
    grouped = (select(
        scope_id.label("scope_id"), Dataset.group_id,
        DatasetGroup.name.label("group_name"), dataset_id.label("dataset_id"),
        dataset_name.label("dataset_name"), DatasetAccessGrant.user_id,
        User.full_name.label("user_name"), User.email.label("user_email"),
        User.role_id.label("user_role"),
        func.count(func.distinct(Dataset.id)).label("granted_datasets"),
        func.max(DatasetAccessGrant.created_at).label("created_at"),
    ).select_from(DatasetAccessGrant)
        .join(Dataset, Dataset.id == DatasetAccessGrant.dataset_id)
        .join(User, User.id == DatasetAccessGrant.user_id)
        .outerjoin(DatasetGroup, DatasetGroup.id == Dataset.group_id)
        .group_by(scope_id, Dataset.group_id, DatasetGroup.name, dataset_id, dataset_name,
                  DatasetAccessGrant.user_id, User.full_name, User.email, User.role_id)
        .subquery())
    query = (select(grouped, totals.c.total_datasets)
             .join(totals, totals.c.scope_id == grouped.c.scope_id))
    if search:
        query = query.where(or_(
            grouped.c.group_name.ilike(f"%{search}%"), grouped.c.dataset_name.ilike(f"%{search}%"),
            grouped.c.user_name.ilike(f"%{search}%"), grouped.c.user_email.ilike(f"%{search}%"),
        ))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.execute(query.order_by(grouped.c.created_at.desc(), grouped.c.scope_id, grouped.c.user_id)
                      .offset((page - 1) * page_size).limit(page_size)).mappings().all()
    return total, [dict(row) for row in rows]


def summary(db: Session) -> dict:
    def count(model: type) -> int:
        return db.scalar(select(func.count()).select_from(model)) or 0

    statuses = dict(db.execute(select(DatasetFile.approval_status, func.count())
                               .group_by(DatasetFile.approval_status)).all())
    return {
        "total_users": count(User),
        "active_users": db.scalar(select(func.count()).select_from(User)
                                   .where(User.is_active.is_(True))) or 0,
        "users_by_role": dict(db.execute(select(User.role_id, func.count())
                                          .group_by(User.role_id)).all()),
        "total_datasets": count(Dataset), "total_files": sum(statuses.values()),
        "pending_approvals": db.scalar(select(func.count()).select_from(DatasetFile).where(
            DatasetFile.approval_status == "SUBMITTED",
            DatasetFile.submitted_by.is_not(None), DatasetFile.submitted_at.is_not(None),
        )) or 0,
        "approved_files": statuses.get("APPROVED", 0),
        "total_audit_logs": count(AuditLog), "total_access_grants": count(DatasetAccessGrant),
    }
