"""Create or update a Data Engineer account using a password from stdin."""

import argparse
import getpass
import sys

from sqlalchemy import select

from app.core.security import hash_password
from app.database.database import SessionLocal
from app.models.user import Role, User


def provision_data_engineer(email: str, password: str, full_name: str) -> None:
    """Upsert a Data Engineer without storing its plaintext password."""
    if not password:
        raise ValueError("Password must not be empty")

    with SessionLocal() as db:
        if db.get(Role, "data_engineer") is None:
            raise RuntimeError("The data_engineer role is missing")
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(email=email, full_name=full_name)
            db.add(user)
        user.hashed_password = hash_password(password)
        user.role_id = "data_engineer"
        user.is_active = True
        user.must_change_password = False
        db.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--full-name", default="Data Engineer")
    args = parser.parse_args()
    password = (
        getpass.getpass("Password: ")
        if sys.stdin.isatty()
        else sys.stdin.readline().rstrip("\r\n")
    )
    provision_data_engineer(args.email, password, args.full_name)
    print("Data Engineer account saved")


if __name__ == "__main__":
    main()
