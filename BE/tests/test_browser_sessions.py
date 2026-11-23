from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.v1.endpoints import auth, browser_session
from app.core import config
from app.core.deps import get_current_user, get_current_user_optional
from app.core.security import create_access_token, hash_password
from app.database.database import get_db
from app.models.browser_session import BrowserSession
from app.models.user import Role, User
from app.services import auth_service, login_rate_limit_service


@pytest.fixture
def session_app(monkeypatch: pytest.MonkeyPatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Role.__table__.create(engine)
    User.__table__.create(engine)
    BrowserSession.__table__.create(engine)
    db = Session(engine)
    db.add(Role(id="data_engineer", name="Data Engineer"))
    user = User(
        id=uuid4(), email="session@example.com", full_name="Session Test",
        role_id="data_engineer", hashed_password=hash_password("test-password-123"),
        is_active=True, must_change_password=False,
    )
    db.add(user)
    db.commit()
    monkeypatch.setattr(config, "AUTH_ALLOW_BEARER_LOGIN", False)
    monkeypatch.setattr(config, "AUTH_COOKIE_SECURE", True)
    monkeypatch.setattr(config, "AUTH_COOKIE_NAME", "__Host-capstone_session")
    monkeypatch.setattr(config, "CORS_ALLOWED_ORIGINS", ["https://testserver"])
    monkeypatch.setattr(auth_service, "record_audit_event", lambda **kwargs: None)
    login_rate_limit_service._attempts.clear()
    app = FastAPI()
    app.include_router(browser_session.router, prefix="/auth/session")
    app.include_router(auth.router, prefix="/auth")
    app.dependency_overrides[get_db] = lambda: db

    @app.get("/protected")
    @app.post("/protected")
    def protected(current: User = Depends(get_current_user)) -> dict:
        return {"id": str(current.id)}

    @app.post("/optional")
    def optional(current: User | None = Depends(get_current_user_optional)) -> dict:
        return {"authenticated": current is not None}

    with TestClient(app, base_url="https://testserver") as client:
        yield client, db, user
    db.close()
    engine.dispose()


def sign_in(client: TestClient, remember: bool = False):
    response = client.post("/auth/session/login", json={
        "email": "session@example.com", "password": "test-password-123", "remember_me": remember,
    }, headers={"Origin": "https://testserver"})
    assert response.status_code == 200
    return response


def test_cookie_is_private_and_only_digest_is_stored(session_app) -> None:
    client, db, user = session_app
    response = sign_in(client)
    cookie = client.cookies.get(config.AUTH_COOKIE_NAME)
    header = response.headers["set-cookie"]
    assert "HttpOnly" in header and "Secure" in header and "SameSite=lax" in header
    assert "Path=/" in header and "Domain=" not in header and "Max-Age=" not in header
    assert "access_token" not in response.json() and cookie not in response.text
    assert response.headers["cache-control"] == "no-store"
    saved = db.scalar(select(BrowserSession))
    assert saved.token_hash != cookie and len(saved.token_hash) == 64
    assert client.get("/protected").json()["id"] == str(user.id)
    assert client.get("/auth/session").json()["csrf_token"] == response.json()["csrf_token"]


def test_csrf_is_required_for_mutations_and_logout_revokes_cookie(session_app) -> None:
    client, _, _ = session_app
    response = sign_in(client)
    cookie = client.cookies.get(config.AUTH_COOKIE_NAME)
    csrf = response.json()["csrf_token"]
    assert client.post("/protected").status_code == 403
    assert client.post("/optional").status_code == 403
    assert client.post("/auth/session/logout").status_code == 403
    assert client.post("/protected", headers={
        "X-CSRF-Token": csrf, "Origin": "https://evil.example",
    }).status_code == 403
    assert client.post("/protected", headers={"X-CSRF-Token": csrf}).status_code == 200
    assert client.post("/auth/session/logout", headers={"X-CSRF-Token": csrf}).status_code == 200
    assert client.get("/protected").status_code == 401
    # Replaying the cookie after logout must fail, even from another browser.
    client.cookies.set(config.AUTH_COOKIE_NAME, cookie)
    assert client.get("/protected").status_code == 401


def test_expiry_disabled_user_and_password_change_invalidate_sessions(session_app) -> None:
    client, db, user = session_app
    sign_in(client)
    saved = db.scalar(select(BrowserSession))
    user.is_active = False
    db.commit()
    assert client.get("/protected").status_code == 401
    user.is_active = True
    saved.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db.commit()
    assert client.get("/protected").status_code == 401
    saved.expires_at = datetime.now(UTC) + timedelta(minutes=5)
    user.hashed_password = hash_password("changed-password-123")
    db.commit()
    assert client.get("/protected").status_code == 401


def test_remember_cookie_expiry_and_limited_password_rotation(session_app) -> None:
    client, db, user = session_app
    user.must_change_password = True
    db.commit()
    response = sign_in(client, remember=True)
    assert f"Max-Age={config.AUTH_REMEMBER_EXPIRE_MINUTES * 60}" in response.headers["set-cookie"]
    old_cookie = client.cookies.get(config.AUTH_COOKIE_NAME)
    csrf = response.json()["csrf_token"]
    assert client.get("/protected").status_code == 403
    assert client.get("/auth/session").json()["must_change_password"] is True
    changed = client.post("/auth/session/change-password", json={
        "new_password": "brand-new-password-123",
    }, headers={"X-CSRF-Token": csrf})
    assert changed.status_code == 200
    assert changed.json()["must_change_password"] is False
    assert client.cookies.get(config.AUTH_COOKIE_NAME) != old_cookie
    assert client.get("/protected").status_code == 200
    client.cookies.clear()
    client.cookies.set(config.AUTH_COOKIE_NAME, old_cookie)
    assert client.get("/protected").status_code == 401


def test_cookie_and_bearer_cannot_bypass_csrf_and_legacy_login_is_disabled(session_app) -> None:
    client, _, user = session_app
    bearer = create_access_token({"sub": str(user.id)})
    assert client.get("/protected", headers={"Authorization": f"Bearer {bearer}"}).status_code == 401
    assert client.post("/auth/login", json={
        "email": user.email, "password": "test-password-123",
    }).status_code == 404
    sign_in(client)
    assert client.post("/protected", headers={"Authorization": f"Bearer {bearer}"}).status_code == 403


def test_login_origin_and_rate_limit(session_app) -> None:
    client, _, _ = session_app
    body = {"email": "session@example.com", "password": "wrong-password"}
    assert client.post("/auth/session/login", json=body, headers={
        "Origin": "https://evil.example",
    }).status_code == 403
    assert client.post("/auth/session/login", json=body, headers={
        "Sec-Fetch-Site": "cross-site",
    }).status_code == 403
    for _ in range(20):
        assert client.post("/auth/session/login", json=body).status_code == 401
    response = client.post("/auth/session/login", json=body)
    assert response.status_code == 429 and "retry-after" in response.headers


def test_csrf_nonce_from_a_different_session_is_rejected(session_app) -> None:
    client, _, _ = session_app
    csrf = sign_in(client).json()["csrf_token"]
    client.cookies.clear()
    sign_in(client)
    assert client.post("/protected", headers={"X-CSRF-Token": csrf}).status_code == 403


def test_http_local_development_cookie_can_be_explicitly_enabled(session_app, monkeypatch) -> None:
    client, _, _ = session_app
    monkeypatch.setattr(config, "AUTH_COOKIE_SECURE", False)
    monkeypatch.setattr(config, "AUTH_COOKIE_NAME", "capstone_session")
    response = sign_in(client)
    assert "Secure" not in response.headers["set-cookie"]
    assert "HttpOnly" in response.headers["set-cookie"]
