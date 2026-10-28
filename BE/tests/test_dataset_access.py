"""Exercise real FastAPI dependencies with an isolated in-memory repository double."""

import asyncio
import json
from datetime import UTC, datetime
from sqlite3 import Connection
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI, HTTPException
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import IntegrityError

from app.api.v1.endpoints import dataset_access
from app.core.dataset_access import require_dataset_scientist
from app.core.deps import get_current_user
from app.crud import crud_dataset_access as repo
from app.database.database import get_db
from app.models.dataset import DatasetAccessGrant
from app.services import dataset_access_service as service


def user(role: str) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(), role_id=role, full_name=role, email=f"{role}@example.test", is_active=True
    )


@pytest.fixture
def state(monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    admin, scientist, business, engineer = [
        user(role) for role in ("admin", "data_scientist", "business_user", "data_engineer")
    ]
    datasets = {
        key: SimpleNamespace(
            id=key,
            name=f"Dataset {index}",
            code=f"DS{index}",
            source="UAV",
            description=None,
            capture_date=None,
            location_name="Test",
            created_at=datetime.now(UTC),
        )
        for index, key in enumerate([uuid4(), uuid4()])
    }
    users = {u.id: u for u in (admin, scientist, business, engineer)}
    grants = {}
    db = Mock()
    monkeypatch.setattr(repo, "has_approved_version", lambda db, ds: True)
    monkeypatch.setattr(repo, "get_dataset", lambda db, key: datasets.get(key))
    monkeypatch.setattr(repo, "get_user", lambda db, key: users.get(key))
    monkeypatch.setattr(repo, "get_grant", lambda db, ds, uid: grants.get((ds, uid)))

    def add(db: Mock, ds: UUID, uid: UUID, aid: UUID) -> SimpleNamespace:
        grant = SimpleNamespace(
            id=uuid4(),
            dataset_id=ds,
            user_id=uid,
            granted_by=aid,
            created_at=datetime.now(UTC),
            user=users[uid],
        )
        grants[ds, uid] = grant
        return grant

    monkeypatch.setattr(repo, "add_grant", add)
    monkeypatch.setattr(repo, "remove_grant", lambda db, g: grants.pop((g.dataset_id, g.user_id)))
    monkeypatch.setattr(
        repo,
        "list_grants",
        lambda db, ds, skip, limit: [g for (did, _), g in grants.items() if did == ds][
            skip : skip + limit
        ],
    )
    monkeypatch.setattr(
        repo,
        "eligible_users",
        lambda db, ds, search, skip, limit: [
            (u, (ds, u.id) in grants)
            for u in users.values()
            if u.role_id in repo.ACCESS_ROLES and (not search or search in u.email)
        ][skip : skip + limit],
    )
    monkeypatch.setattr(
        repo,
        "accessible_datasets",
        lambda db, u, search, skip, limit: [
            d
            for d in datasets.values()
            if (u.role_id == "admin" or (d.id, u.id) in grants) and (not search or search in d.name)
        ][skip : skip + limit],
    )
    app = FastAPI()
    app.include_router(dataset_access.admin_router, prefix="/admin/datasets")
    app.include_router(dataset_access.router, prefix="/datasets")
    app.include_router(dataset_access.approved_router, prefix="/datasets")
    app.dependency_overrides[get_db] = lambda: db
    state = SimpleNamespace(
        app=app,
        db=db,
        admin=admin,
        scientist=scientist,
        business=business,
        engineer=engineer,
        users=users,
        datasets=list(datasets),
        grants=grants,
        current=admin,
    )
    app.dependency_overrides[get_current_user] = lambda: state.current
    return state


def request(
    app: FastAPI,
    method: str,
    path: str,
    payload: dict | None = None,
    token: str | None = None,
) -> tuple[int, object]:
    """Minimal HTTP ASGI client, avoiding a new production/test dependency."""

    async def run() -> tuple[int, object]:
        messages = []
        body = json.dumps(payload).encode() if payload is not None else b""
        route, _, query = path.partition("?")
        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": method,
            "scheme": "http",
            "path": route,
            "raw_path": route.encode(),
            "query_string": query.encode(),
            "headers": [(b"content-type", b"application/json")]
            + ([(b"authorization", f"Bearer {token}".encode())] if token else []),
            "client": ("127.0.0.1", 1),
            "server": ("test", 80),
            "root_path": "",
        }

        async def receive() -> dict:
            return {"type": "http.request", "body": body, "more_body": False}

        async def send(message: dict) -> None:
            messages.append(message)

        await app(scope, receive, send)
        status = next(m["status"] for m in messages if m["type"] == "http.response.start")
        data = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
        return status, json.loads(data) if data else None

    return asyncio.run(run())


@pytest.mark.parametrize("role", ["scientist", "business"])
def test_admin_grants_and_revokes_access(state: SimpleNamespace, role: str) -> None:
    target = getattr(state, role)
    ds = state.datasets[0]
    path = f"/admin/datasets/{ds}/access"
    status, body = request(state.app, "POST", path, {"user_id": str(target.id)})
    assert status == 201
    assert body["granted_by"] == str(state.admin.id)
    assert body["granted_at"]
    assert "password" not in json.dumps(body)
    assert service.check_dataset_access(target, ds, state.db).id == ds
    assert request(state.app, "POST", path, {"user_id": str(target.id)})[0] == 409
    assert request(state.app, "GET", path)[1] == [body]
    assert request(state.app, "DELETE", f"{path}/{target.id}")[0] == 204
    with pytest.raises(HTTPException) as exc:
        service.check_dataset_access(target, ds, state.db)
    assert exc.value.status_code == 403
    assert request(state.app, "DELETE", f"{path}/{target.id}")[0] == 404


def test_many_users_many_datasets_revoke_is_scoped(state: SimpleNamespace) -> None:
    for ds in state.datasets:
        for target in (state.scientist, state.business):
            service.grant_access(state.db, ds, target.id, state.admin)
    service.revoke_access(state.db, state.datasets[0], state.scientist.id, state.admin)
    assert len(state.grants) == 3
    assert service.check_dataset_access(state.scientist, state.datasets[1], state.db)
    assert service.check_dataset_access(state.business, state.datasets[0], state.db)


@pytest.mark.parametrize("role", ["scientist", "business", "engineer"])
@pytest.mark.parametrize(
    "method,suffix",
    [
        ("GET", "eligible-users"),
        ("GET", "access"),
        ("POST", "access"),
        ("DELETE", "access/{user_id}"),
    ],
)
def test_non_admin_cannot_manage_grants(
    state: SimpleNamespace,
    role: str,
    method: str,
    suffix: str,
) -> None:
    state.current = getattr(state, role)
    suffix = suffix.format(user_id=state.business.id)
    assert (
        request(
            state.app,
            method,
            f"/admin/datasets/{state.datasets[0]}/{suffix}",
            {"user_id": str(state.business.id)},
        )[0]
        == 403
    )
    assert not state.grants


def test_validation_and_missing_resources(state: SimpleNamespace) -> None:
    path = f"/admin/datasets/{state.datasets[0]}/access"
    assert request(state.app, "POST", path, {"user_id": "bad"})[0] == 422
    assert request(state.app, "POST", path, {"user_id": str(uuid4())})[0] == 404
    for target in (state.admin, state.engineer):
        assert request(state.app, "POST", path, {"user_id": str(target.id)})[0] == 422
    assert (
        request(state.app, "POST", path, {"user_id": str(state.business.id), "role": "admin"})[0]
        == 422
    )
    assert (
        request(
            state.app,
            "POST",
            f"/admin/datasets/{uuid4()}/access",
            {"user_id": str(state.business.id)},
        )[0]
        == 404
    )


def test_eligible_users_search_pagination_and_granted_flag(state: SimpleNamespace) -> None:
    ds = state.datasets[0]
    service.grant_access(state.db, ds, state.business.id, state.admin)
    status, body = request(state.app, "GET", f"/admin/datasets/{ds}/eligible-users")
    assert status == 200 and len(body) == 2
    assert {r["role"] for r in body} == {"data_scientist", "business_user"}
    assert next(r for r in body if r["user_id"] == str(state.business.id))["has_access"]
    assert len(request(state.app, "GET", f"/admin/datasets/{ds}/eligible-users?limit=1")[1]) == 1
    assert (
        len(request(state.app, "GET", f"/admin/datasets/{ds}/eligible-users?search=business")[1])
        == 1
    )


@pytest.mark.parametrize("role", ["scientist", "business"])
def test_accessible_only_current_user_and_empty_default(state: SimpleNamespace, role: str) -> None:
    target = getattr(state, role)
    state.current = target
    assert request(state.app, "GET", "/datasets/accessible")[1] == []
    service.grant_access(state.db, state.datasets[0], target.id, state.admin)
    status, body = request(state.app, "GET", f"/datasets/accessible?user_id={state.admin.id}")
    assert status == 200 and [d["id"] for d in body] == [str(state.datasets[0])]


@pytest.mark.parametrize("role", ["scientist", "business"])
def test_approved_datasets_allowed_roles(
    state: SimpleNamespace, monkeypatch: pytest.MonkeyPatch, role: str
) -> None:
    state.current = getattr(state, role)
    dataset = repo.get_dataset(state.db, state.datasets[0])
    version = SimpleNamespace(
        id=uuid4(), version_tag="v1.0", approval_status="APPROVED",
        approved_by=state.admin.id,
    )
    query = Mock(return_value=[(dataset, version)])
    monkeypatch.setattr(repo, "approved_datasets", query)
    status, body = request(state.app, "GET", "/datasets/approved?search=Traffic&skip=1&limit=2")
    assert status == 200
    assert body[0]["dataset_id"] == str(dataset.id)
    assert body[0]["version_id"] == str(version.id)
    query.assert_called_once_with(state.db, state.current, "Traffic", 1, 2)
    query.return_value = []
    assert request(state.app, "GET", "/datasets/approved")[1] == []


@pytest.mark.parametrize("role", ["admin", "engineer"])
def test_approved_datasets_rejects_other_roles(
    state: SimpleNamespace, monkeypatch: pytest.MonkeyPatch, role: str
) -> None:
    state.current = getattr(state, role)
    query = Mock()
    monkeypatch.setattr(repo, "approved_datasets", query)
    assert request(state.app, "GET", "/datasets/approved")[0] == 403
    query.assert_not_called()


def test_approved_datasets_has_separate_swagger_group() -> None:
    from app.main import app

    operation = app.openapi()["paths"]["/api/v1/datasets/approved"]["get"]
    assert operation["tags"] == ["Data Scientist / Business User"]



def test_unauthenticated_and_invalid_token(state: SimpleNamespace) -> None:
    state.app.dependency_overrides.pop(get_current_user)
    assert request(state.app, "GET", "/datasets/approved")[0] == 401
    assert request(state.app, "GET", "/datasets/approved", token="invalid-token")[0] == 401
    assert request(state.app, "GET", "/datasets/accessible")[0] == 401
    assert request(state.app, "GET", "/datasets/accessible", token="invalid-token")[0] == 401
    assert request(state.app, "GET", f"/admin/datasets/{state.datasets[0]}/access")[0] == 401


def test_business_cannot_train_even_with_grant(state: SimpleNamespace) -> None:
    ds = state.datasets[0]
    service.grant_access(state.db, ds, state.business.id, state.admin)
    with pytest.raises(HTTPException) as exc:
        require_dataset_scientist(ds, state.business, state.db)
    assert exc.value.status_code == 403
    service.grant_access(state.db, ds, state.scientist.id, state.admin)
    assert require_dataset_scientist(ds, state.scientist, state.db) is state.scientist


def test_version_id_cannot_bypass_parent_grant(
    state: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        repo, "get_version", lambda db, vid: SimpleNamespace(id=vid, dataset_id=state.datasets[1])
    )
    service.grant_access(state.db, state.datasets[0], state.scientist.id, state.admin)
    with pytest.raises(HTTPException) as exc:
        service.check_dataset_version_access(state.scientist, uuid4(), state.db)
    assert exc.value.status_code == 403


def test_concurrent_unique_conflict_becomes_409(
    state: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Simulate another transaction winning after the preflight check.
    monkeypatch.setattr(repo, "get_grant", Mock(side_effect=[None, object()]))
    monkeypatch.setattr(
        repo, "add_grant", Mock(side_effect=IntegrityError("INSERT", {}, Exception()))
    )
    with pytest.raises(HTTPException) as exc:
        service.grant_access(state.db, state.datasets[0], state.scientist.id, state.admin)
    assert exc.value.status_code == 409
    state.db.rollback.assert_called_once()


def test_removed_columns_are_not_in_model() -> None:
    assert "dataset_version_id" not in DatasetAccessGrant.__table__.columns
    assert "expires_at" not in DatasetAccessGrant.__table__.columns
    assert not DatasetAccessGrant.__table__.c.dataset_id.nullable


def test_legacy_grant_endpoints_are_removed(state: SimpleNamespace) -> None:
    from app.api.v1.endpoints.admin import router

    state.app.include_router(router, prefix="/admin")
    for method, path in (
        ("GET", "/admin/access-grants"),
        ("POST", "/admin/access-grants"),
        ("DELETE", f"/admin/access-grants/{uuid4()}"),
    ):
        assert request(state.app, method, path)[0] == 404
    assert not any("/access-grants" in path for path in state.app.openapi()["paths"])
    assert not state.grants


def test_repository_filter_and_database_unique_constraint() -> None:
    compiled = str(repo.access_filter(uuid4()).compile(dialect=postgresql.dialect()))
    assert "dataset_access_grants.dataset_id = datasets.id" in compiled
    assert "dataset_access_grants.user_id" in compiled and "expires_at" not in compiled
    constraints = {constraint.name for constraint in DatasetAccessGrant.__table__.constraints}
    assert "uq_dataset_user_access" in constraints
    assert "uq_user_dataset_grant" not in constraints
    assert "ck_dataset_access_scope" not in constraints


@pytest.mark.parametrize(
    "suffix",
    [
        "preview",
        "columns",
        "column-mappings",
        "versions",
        "versions/{resource}/status",
        "versions/{resource}/report",
        "quality-checks/{resource}",
        "quality-checks/{resource}/report",
        "quality-checks/{resource}/issues",
    ],
)
def test_real_read_routes_deny_ungranted_dataset(state: SimpleNamespace, suffix: str) -> None:
    from app.main import app

    suffix = suffix.format(resource=uuid4())
    app.dependency_overrides[get_db] = lambda: state.db
    app.dependency_overrides[get_current_user] = lambda: state.scientist
    try:
        status, _ = request(app, "GET", f"/api/v1/datasets/{state.datasets[0]}/{suffix}")
        assert status == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize("suffix", ["normalize", "normalize/validate", "quality-checks"])
def test_grant_does_not_allow_business_to_preprocess(state: SimpleNamespace, suffix: str) -> None:
    from app.main import app

    ds = state.datasets[0]
    service.grant_access(state.db, ds, state.business.id, state.admin)
    app.dependency_overrides[get_db] = lambda: state.db
    app.dependency_overrides[get_current_user] = lambda: state.business
    try:
        assert request(app, "POST", f"/api/v1/datasets/{ds}/{suffix}", {})[0] == 403
    finally:
        app.dependency_overrides.clear()


def test_wrong_parent_version_rejected_with_granted_parent(state: SimpleNamespace) -> None:
    from app.main import app

    ds = state.datasets[0]
    service.grant_access(state.db, ds, state.scientist.id, state.admin)
    state.db.query.return_value.filter.return_value.first.return_value = None
    app.dependency_overrides[get_db] = lambda: state.db
    app.dependency_overrides[get_current_user] = lambda: state.scientist
    try:
        assert request(app, "GET", f"/api/v1/datasets/{ds}/versions/{uuid4()}/status")[0] == 404
    finally:
        app.dependency_overrides.clear()


def test_sqlalchemy_repository_and_unique_constraint_on_sqlite() -> None:
    """Real SQL queries/constraints in a disposable DB; not a PostGIS migration test."""
    from sqlalchemy import create_engine, event, text
    from sqlalchemy.orm import Session

    from app.models.user import Role, User

    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def spatial_projection(connection: Connection, record: object) -> None:
        connection.create_function("AsEWKB", 1, lambda value: None)
        connection.create_function("ST_AsEWKB", 1, lambda value: None)

    # Dataset geometry is irrelevant to access queries. Avoid requiring SpatiaLite.
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE datasets (id CHAR(32) PRIMARY KEY, "
                "name TEXT, code TEXT, source TEXT, description TEXT, "
                "capture_date DATE, location_name TEXT, "
                "created_by CHAR(32), created_at DATETIME)"
            )
        )
        connection.execute(text("CREATE TABLE dataset_versions (id CHAR(32) PRIMARY KEY, "
                 "dataset_id CHAR(32), approval_status TEXT)"))
    Role.__table__.create(engine)
    User.__table__.create(engine)
    DatasetAccessGrant.__table__.create(engine)
    with Session(engine) as db:
        admin_id, user_id, other_id = uuid4(), uuid4(), uuid4()
        ds1, ds2 = uuid4(), uuid4()
        db.add_all([Role(id="admin", name="Admin"), Role(id="data_scientist", name="Scientist")])
        db.flush()
        for uid, role in [
            (admin_id, "admin"),
            (user_id, "data_scientist"),
            (other_id, "data_scientist"),
        ]:
            db.add(
                User(
                    id=uid,
                    full_name=str(uid),
                    email=f"{uid}@example.test",
                    hashed_password="not-a-real-password",
                    role_id=role,
                )
            )
        for ds in (ds1, ds2):
            db.execute(
                text(
                    "INSERT INTO datasets (id, name, code, source, location_name, created_at) "
                    "VALUES (:id, 'Traffic', :id, 'UAV', 'Test', CURRENT_TIMESTAMP)"
                ),
                {"id": ds.hex},
            )
        db.commit()
        scientist = db.get(User, user_id)
        admin = db.get(User, admin_id)
        assert not repo.has_approved_version(db, ds1)
        for approval_status in ("PENDING", "SUBMITTED", "REJECTED"):
            db.execute(
                text("INSERT INTO dataset_versions (id, dataset_id, approval_status) "
                     "VALUES (:id, :ds, :status)"),
                {"id": uuid4().hex, "ds": ds1.hex, "status": approval_status},
            )
            assert not repo.has_approved_version(db, ds1)
        # Approval on another dataset must not authorize ds1.
        db.execute(
            text("INSERT INTO dataset_versions (id, dataset_id, approval_status) "
                 "VALUES (:id, :ds, 'APPROVED')"),
            {"id": uuid4().hex, "ds": ds2.hex},
        )
        assert not repo.has_approved_version(db, ds1)
        with pytest.raises(HTTPException) as exc:
            service.grant_access(db, ds1, user_id, admin)
        assert exc.value.status_code == 409
        assert repo.get_grant(db, ds1, user_id) is None
        db.execute(
            text("INSERT INTO dataset_versions (id, dataset_id, approval_status) "
                 "VALUES (:id, :ds, 'APPROVED')"),
            {"id": uuid4().hex, "ds": ds1.hex},
        )
        db.commit()
        assert repo.has_approved_version(db, ds1)
        service.grant_access(db, ds1, user_id, admin)
        service.grant_access(db, ds2, other_id, admin)
        assert [d.id for d in repo.accessible_datasets(db, scientist, None, 0, 50)] == [ds1]
        assert len(repo.accessible_datasets(db, admin, None, 0, 50)) == 2
        assert len(repo.accessible_datasets(db, admin, None, 0, 1)) == 1
        assert repo.accessible_datasets(db, scientist, "not-found", 0, 50) == []
        flags = {u.id: has_access for u, has_access in repo.eligible_users(db, ds1, None, 0, 50)}
        assert flags == {user_id: True, other_id: False}
        with pytest.raises(IntegrityError):
            repo.add_grant(db, ds1, user_id, admin_id)
        db.rollback()
        service.revoke_access(db, ds1, user_id, admin)
        assert repo.accessible_datasets(db, scientist, None, 0, 50) == []
        assert repo.get_grant(db, ds2, other_id) is not None
    engine.dispose()


@pytest.mark.parametrize("role", ["scientist", "business"])
def test_grant_requires_approval_before_writing(
    state: SimpleNamespace, monkeypatch: pytest.MonkeyPatch, role: str
) -> None:
    target = getattr(state, role)
    check = Mock(return_value=False)
    monkeypatch.setattr(repo, "has_approved_version", check)
    path = f"/admin/datasets/{state.datasets[0]}/access"
    status, body = request(state.app, "POST", path, {"user_id": str(target.id)})
    assert status == 409
    assert "APPROVED" in body["detail"]
    check.assert_called_once_with(state.db, state.datasets[0])
    assert not state.grants
    state.db.commit.assert_not_called()
    # Once approved, the same request succeeds.
    check.return_value = True
    assert request(state.app, "POST", path, {"user_id": str(target.id)})[0] == 201


@pytest.mark.parametrize("role", ["scientist", "business", "admin", "engineer"])
@pytest.mark.parametrize("approval", ["APPROVED", "PENDING", "SUBMITTED", "REJECTED"])
def test_consumer_preview_guards_and_response(
    state: SimpleNamespace, monkeypatch: pytest.MonkeyPatch, role: str, approval: str
) -> None:
    from app.schemas.dataset import DatasetPreviewResponse
    from app.services import dataset_consumer_service as consumer

    ds = state.datasets[0]
    version_id = uuid4()
    target = getattr(state, role)
    if role in ("scientist", "business"):
        service.grant_access(state.db, ds, target.id, state.admin)
    state.current = target
    version = SimpleNamespace(id=version_id, dataset_id=ds, approval_status=approval)
    monkeypatch.setattr(repo, "get_version", lambda db, vid: version)
    preview = DatasetPreviewResponse(
        dataset_id=ds, dataset_version_id=version_id, dataset_name="Traffic",
        original_filename="traffic.csv", file_format="csv", file_size=20,
        status="uploaded", columns=[{"name": "speed", "type": "number"}],
        rows=[{"speed": 30}],
        pagination={"page": 2, "page_size": 1, "returned_rows": 1,
                    "has_more": False, "total_rows": 2},
    )
    read = Mock(return_value=preview)
    mapping = Mock(return_value=preview)
    monkeypatch.setattr(consumer, "get_dataset_preview", read)
    monkeypatch.setattr(consumer, "apply_saved_column_mappings", mapping)
    path = f"/datasets/{ds}/versions/{version_id}/preview"
    status, body = request(state.app, "GET", path + "?page=2&page_size=1&representation=raw")
    if role in ("scientist", "business") and approval == "APPROVED":
        assert status == 200
        assert body["rows"] == [{"speed": 30}]
        assert body["dataset_version_id"] == str(version_id)
        read.assert_called_once_with(
            state.db, dataset_id=ds, dataset_version_id=version_id,
            page=2, page_size=1, representation="raw",
        )
        mapping.assert_called_once_with(state.db, dataset_id=ds, preview=preview)
        service.revoke_access(state.db, ds, target.id, state.admin)
        read.reset_mock()
        assert request(state.app, "GET", path)[0] == 403
        read.assert_not_called()
    else:
        assert status == 403
        read.assert_not_called()
        mapping.assert_not_called()


@pytest.mark.parametrize("case,expected", [("missing", 404), ("wrong_parent", 404),
                                          ("no_grant", 403), ("anonymous", 401)])
def test_consumer_preview_invalid_access(
    state: SimpleNamespace, monkeypatch: pytest.MonkeyPatch, case: str, expected: int
) -> None:
    from app.services import dataset_consumer_service as consumer

    ds = state.datasets[0]
    state.current = state.scientist
    if case != "no_grant":
        service.grant_access(state.db, ds, state.scientist.id, state.admin)
    version = None if case == "missing" else SimpleNamespace(
        dataset_id=state.datasets[1], approval_status="APPROVED"
    )
    monkeypatch.setattr(repo, "get_version", lambda db, vid: version)
    read = Mock()
    monkeypatch.setattr(consumer, "get_dataset_preview", read)
    if case == "anonymous":
        state.app.dependency_overrides.pop(get_current_user)
    assert request(state.app, "GET", f"/datasets/{ds}/versions/{uuid4()}/preview")[0] == expected
    read.assert_not_called()


@pytest.mark.parametrize("query", ["page=0", "page_size=101", "representation=bad"])
def test_consumer_preview_validates_parameters(state: SimpleNamespace, query: str) -> None:
    path = f"/datasets/{state.datasets[0]}/versions/{uuid4()}/preview?{query}"
    assert request(state.app, "GET", path)[0] == 422


def test_consumer_preview_swagger_group() -> None:
    from app.main import app

    path = "/api/v1/datasets/{dataset_id}/versions/{version_id}/preview"
    assert app.openapi()["paths"][path]["get"]["tags"] == ["Data Scientist / Business User"]
