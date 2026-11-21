"""Apply the idempotent Result Sharing SQL migration to the configured PostgreSQL DB."""

from pathlib import Path

from sqlalchemy import text

from app.database.database import engine


def main() -> None:
    migration = Path(__file__).resolve().parents[1] / "migrations/20261114_result_sharing.sql"
    statements = [statement.strip() for statement in migration.read_text(encoding="utf-8").split(";")]
    with engine.begin() as connection:
        for statement in statements:
            if statement:
                connection.execute(text(statement))
    print("Result Sharing migration applied")


if __name__ == "__main__":
    main()
