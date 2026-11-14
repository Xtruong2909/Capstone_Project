from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.v1.endpoints import admin, auth
from app.core.deps import require_admin
from app.crud import crud_admin
from app.main import app
from app.models.audit import AuditLog
from app.schemas.admin import AuditLogPage
from app.schemas.user import LoginRequest
from app.services import audit_log_service


class AuditQueryStub:
    def __init__(self, rows: list[object]) -> None:
        self.rows = rows
        self.filters = []
        self.ordering = ()
        self.offset_value = 0
        self.limit_value = 0

    def filter(self, *conditions):
        self.filters.extend(conditions)
        return self

    def count(self) -> int:
        return len(self.rows)

    def order_by(self, *expressions):
        self.ordering = expressions
        return self

    def offset(self, value: int):
        self.offset_value = value
        return self

    def limit(self, value: int):
        self.limit_value = value
        return self

    def all(self) -> list[object]:
        return self.rows[self.offset_value:self.offset_value + self.limit_value]


def _request() -> Request:
    return Request({
        "type": "http",
        "method": "POST",
        "path": "/api/v1/auth/login",
        "headers": [],
        "client": ("127.0.0.1", 1234),
        "server": ("testserver", 80),
        "scheme": "http",
        "query_string": b"",
    })


def test_audit_query_filters_stably_and_paginates() -> None:
    user_id = uuid4()
    rows = [SimpleNamespace(id=uuid4()) for _ in range(5)]
    query = AuditQueryStub(rows)

    class DbStub:
        def query(self, model):
            assert model is AuditLog
            return query

    start = datetime.now(UTC) - timedelta(days=1)
    end = datetime.now(UTC)
    total, page = crud_admin.get_audit_logs(
        DbStub(),
        skip=1,
        limit=2,
        user_id=user_id,
        action="LOGIN",
        module="Authentication",
        resource_id="experiment-123",
        status="SUCCESS",
        start_date=start,
        end_date=end,
        search="browser",
    )

    assert total == 5
    assert page == rows[1:3]
    assert query.offset_value == 1
    assert query.limit_value == 2
    assert len(query.filters) == 8
    assert len(query.ordering) == 2
    assert "created_at DESC" in str(query.ordering[0])
    assert "id DESC" in str(query.ordering[1])


def test_admin_audit_endpoint_returns_paged_shape_and_validates_dates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    created_at = datetime.now(UTC)
    item = AuditLog(
        id=uuid4(),
        user_id=uuid4(),
        username="Admin",
        action="LOGIN",
        module="Authentication",
        status="SUCCESS",
        description="Login successful",
        resource_type="AUTHENTICATION",
        created_at=created_at,
    )
    monkeypatch.setattr(crud_admin, "get_audit_logs", lambda *args, **kwargs: (1, [item]))

    result = admin.list_audit_logs(skip=5, limit=10)

    assert isinstance(result, AuditLogPage)
    assert result.model_dump()["total"] == 1
    assert result.skip == 5
    assert result.limit == 10
    assert result.items[0].username == "Admin"
    assert result.items[0].resource_type == "AUTHENTICATION"
    assert result.items[0].created_at == created_at

    with pytest.raises(HTTPException) as error:
        admin.list_audit_logs(
            start_date=datetime.fromisoformat("2026-01-01T00:00:00"),
            end_date=created_at,
        )
    assert error.value.status_code == 422


def test_login_success_and_failure_are_audited_without_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events = []
    monkeypatch.setattr(auth, "record_audit_event", lambda **event: events.append(event))
    user = SimpleNamespace(
        id=uuid4(),
        full_name="Data Scientist",
        email="scientist@example.com",
        role_id="data_scientist",
        must_change_password=False,
        is_active=True,
    )
    monkeypatch.setattr(auth.crud_user, "authenticate_user", lambda *_args, **_kwargs: user)
    monkeypatch.setattr(auth, "create_access_token", lambda data: "test-token")
    auth.login(LoginRequest(email="scientist@example.com", password="do-not-log"), _request(), object())
    assert events[-1]["action"] == "LOGIN"
    assert events[-1]["user_id"] if "user_id" in events[-1] else events[-1]["user"].id
    assert "details" not in events[-1] or "password" not in events[-1]["details"]

    events.clear()
    monkeypatch.setattr(auth.crud_user, "authenticate_user", lambda *_args, **_kwargs: None)
    with pytest.raises(HTTPException):
        auth.login(LoginRequest(email="unknown@example.com", password="do-not-log"), _request(), object())
    assert events[0]["action"] == "LOGIN_FAILED"
    assert events[0]["username"] == "unknown@example.com"
    assert "password" not in events[0]


def test_admin_login_success_is_not_audited(monkeypatch: pytest.MonkeyPatch) -> None:
    events = []
    monkeypatch.setattr(auth, "record_audit_event", lambda **event: events.append(event))
    user = SimpleNamespace(
        id=uuid4(),
        full_name="System Administrator",
        email="admin@example.com",
        role_id="admin",
        must_change_password=False,
        is_active=True,
    )
    monkeypatch.setattr(auth.crud_user, "authenticate_user", lambda *_args, **_kwargs: user)
    monkeypatch.setattr(auth, "create_access_token", lambda data: "test-token")

    auth.login(LoginRequest(email="admin@example.com", password="secret"), _request(), object())

    assert events == []


def test_audit_write_failures_do_not_escape_or_commit_business_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = SimpleNamespace(
        add=lambda _entry: None,
        commit=lambda: (_ for _ in ()).throw(RuntimeError("database down")),
        rollback=lambda: setattr(session, "rolled_back", True),
        close=lambda: None,
    )
    monkeypatch.setattr(audit_log_service, "SessionLocal", lambda: session)

    audit_log_service.record_audit_event(
        action="LOGIN",
        module="Authentication",
        status="SUCCESS",
        description="Login successful",
        username="user@example.test",
    )

    assert session.rolled_back is True


def test_audit_route_is_admin_protected_and_has_no_mutation_routes() -> None:
    paths = app.openapi()["paths"]
    operation = paths["/api/v1/admin/audit-logs"]["get"]
    assert operation["security"]
    assert not any(
        method in paths["/api/v1/admin/audit-logs"]
        for method in ("post", "put", "patch", "delete")
    )
    assert {"skip", "limit", "user_id", "action", "module", "resource_id", "status",
            "start_date", "end_date", "search"} <= {
        parameter["name"] for parameter in operation["parameters"]
    }
    assert any(dependency.dependency is require_admin for dependency in admin.router.dependencies)
    assert require_admin(SimpleNamespace(role_id="admin")).role_id == "admin"
    with pytest.raises(HTTPException) as error:
        require_admin(SimpleNamespace(role_id="data_scientist"))
    assert error.value.status_code == 403
