"""Database operations for browser sessions."""

from datetime import datetime

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models.browser_session import BrowserSession


def get_session(db: Session, token_hash: str) -> BrowserSession | None:
    return db.get(BrowserSession, token_hash)


def save_session(db: Session, session: BrowserSession, now: datetime) -> None:
    db.execute(delete(BrowserSession).where(BrowserSession.expires_at <= now))
    db.add(session)
    db.commit()


def delete_session(db: Session, token_hash: str) -> None:
    db.execute(delete(BrowserSession).where(BrowserSession.token_hash == token_hash))
    db.commit()
