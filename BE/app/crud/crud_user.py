from uuid import UUID

from sqlalchemy.orm import Session

from app.core.security import verify_password
from app.models.user import User


def get_user_by_email(db: Session, email: str) -> User | None:
    """Retrieve a user by their email address."""
    return db.query(User).filter(User.email == email).first()


def get_user_by_id(db: Session, user_id: UUID) -> User | None:
    """Retrieve a user by their UUID primary key."""
    return db.query(User).filter(User.id == user_id).first()


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    """Authenticate user with email and password."""
    user = get_user_by_email(db, email=email)
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user
