"""Opaque cookies, session expiry/revocation and synchronizer CSRF protection."""

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.core import config
from app.crud import crud_browser_session, crud_user
from app.models.browser_session import BrowserSession
from app.models.user import User
from app.schemas.browser_session import BrowserSessionResponse
from app.schemas.user import UserResponse


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _csrf_token(cookie: str) -> str:
    return hmac.new(config.SECRET_KEY.encode(), f"csrf:{cookie}".encode(), "sha256").hexdigest()


def validate_origin(request: Request) -> None:
    """Block cross-site browser writes, including login CSRF."""
    origin = request.headers.get("origin")
    if origin and origin not in config.CORS_ALLOWED_ORIGINS:
        raise HTTPException(status_code=403, detail="Untrusted request origin")
    if request.headers.get("sec-fetch-site") == "cross-site":
        raise HTTPException(status_code=403, detail="Cross-site session requests are not allowed")


def _response(user: User, cookie: str, expires_at: datetime) -> BrowserSessionResponse:
    return BrowserSessionResponse(
        user=UserResponse.model_validate(user),
        must_change_password=user.must_change_password,
        csrf_token=_csrf_token(cookie),
        expires_at=expires_at,
    )


def start_session(
    db: Session, user: User, response: Response, remember_me: bool = False
) -> BrowserSessionResponse:
    cookie = secrets.token_urlsafe(48)
    now = datetime.now(UTC)
    minutes = (
        config.AUTH_REMEMBER_EXPIRE_MINUTES if remember_me else config.AUTH_SESSION_EXPIRE_MINUTES
    )
    expires_at = now + timedelta(minutes=minutes)
    crud_browser_session.save_session(
        db,
        BrowserSession(
            token_hash=_digest(cookie), user_id=user.id,
            password_fingerprint=_digest(user.hashed_password),
            remember_me=remember_me,
            expires_at=expires_at, created_at=now,
        ),
        now,
    )
    response.set_cookie(
        config.AUTH_COOKIE_NAME, cookie, httponly=True, secure=config.AUTH_COOKIE_SECURE,
        samesite="lax", path="/", max_age=minutes * 60 if remember_me else None,
    )
    response.headers["Cache-Control"] = "no-store"
    return _response(user, cookie, expires_at)


def read_session(request: Request, db: Session) -> tuple[User, BrowserSession, str] | None:
    cookie = request.cookies.get(config.AUTH_COOKIE_NAME)
    if not cookie or len(cookie) > 128:
        return None
    session = crud_browser_session.get_session(db, _digest(cookie))
    if not session:
        return None
    # SQLite tests return naive timestamps; PostgreSQL returns timezone-aware timestamps.
    expires_at = session.expires_at.replace(tzinfo=UTC)
    if expires_at <= datetime.now(UTC):
        return None
    user = crud_user.get_user_by_id(db, session.user_id)
    if not user or not user.is_active:
        return None
    if not hmac.compare_digest(session.password_fingerprint, _digest(user.hashed_password)):
        return None
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        validate_origin(request)
        provided = request.headers.get("x-csrf-token", "")
        if not hmac.compare_digest(provided.encode(), _csrf_token(cookie).encode()):
            raise HTTPException(status_code=403, detail="Invalid CSRF token")
    return user, session, cookie


def require_session(request: Request, db: Session) -> tuple[User, BrowserSession, str]:
    session = read_session(request, db)
    if session is None:
        raise HTTPException(status_code=401, detail="Session expired or invalid")
    return session


def session_profile(request: Request, db: Session) -> BrowserSessionResponse:
    user, session, cookie = require_session(request, db)
    return _response(user, cookie, session.expires_at)


def end_session(request: Request, db: Session, response: Response) -> None:
    cookie = request.cookies.get(config.AUTH_COOKIE_NAME)
    if cookie:
        crud_browser_session.delete_session(db, _digest(cookie))
    response.delete_cookie(
        config.AUTH_COOKIE_NAME, path="/", httponly=True,
        secure=config.AUTH_COOKIE_SECURE, samesite="lax",
    )
    response.headers["Cache-Control"] = "no-store"
