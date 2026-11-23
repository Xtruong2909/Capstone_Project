"""Browser authentication never exposes the session credential in JSON."""

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.schemas.browser_session import BrowserLoginRequest, BrowserSessionResponse
from app.schemas.user import MessageResponse, PasswordChangeRequest
from app.services import auth_service
from app.services import browser_session_service as sessions

router = APIRouter()


@router.post("/login", response_model=BrowserSessionResponse)
def login(
    body: BrowserLoginRequest, request: Request, response: Response,
    db: Session = Depends(get_db),
) -> BrowserSessionResponse:
    sessions.validate_origin(request)
    previous = sessions.read_session(request, db)
    user = auth_service.authenticate_browser_user(
        db, body.email, body.password, request.client.host if request.client else "unknown"
    )
    # Rotating a valid prior session also requires its CSRF token.
    if previous:
        sessions.end_session(request, db, response)
    return sessions.start_session(db, user, response, body.remember_me)


@router.get("", response_model=BrowserSessionResponse)
def profile(
    request: Request, response: Response, db: Session = Depends(get_db)
) -> BrowserSessionResponse:
    response.headers["Cache-Control"] = "no-store"
    return sessions.session_profile(request, db)


@router.post("/logout", response_model=MessageResponse)
def logout(
    request: Request, response: Response, db: Session = Depends(get_db)
) -> MessageResponse:
    sessions.validate_origin(request)
    current = sessions.read_session(request, db)
    if current:
        auth_service.logout_user(current[0], request.client.host if request.client else None)
    sessions.end_session(request, db, response)
    return MessageResponse(message="Đăng xuất thành công.")


@router.post("/change-password", response_model=BrowserSessionResponse)
def change_password(
    body: PasswordChangeRequest, request: Request, response: Response,
    db: Session = Depends(get_db),
) -> BrowserSessionResponse:
    user, previous, _ = sessions.require_session(request, db)
    remember_me = previous.remember_me
    user = auth_service.change_temporary_password(db, user, body.new_password)
    sessions.end_session(request, db, response)
    return sessions.start_session(db, user, response, remember_me)
