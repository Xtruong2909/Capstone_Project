"""Apply only reviewed, idempotent schema updates when local Compose starts."""

import logging
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.database.database import engine

logger = logging.getLogger(__name__)
LOCAL_MIGRATIONS = (
    "20261205_browser_sessions.sql",
    "20261206_share_recipients.sql",
    "20261205_isolated_upload_batches.sql",
    "20261127_validation_studies.sql",
    "20261128_comparison_history.sql",
)


def apply_local_migrations(database_engine: Engine, migrations_dir: Path) -> None:
    """Never discover/replay the historical migration directory automatically."""
    scripts = [(name, (migrations_dir / name).read_text(encoding="utf-8-sig")) for name in LOCAL_MIGRATIONS]
    with database_engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
        connection.execute(text("SELECT pg_advisory_lock(714032601)"))
        try:
            for name, script in scripts:
                connection.exec_driver_sql(script)
                logger.info("Local schema ready: %s", name)
        except Exception:
            # Migration files may contain an explicit BEGIN; release a failed
            # transaction before issuing the advisory-unlock statement.
            connection.exec_driver_sql("ROLLBACK")
            raise
        finally:
            connection.execute(text("SELECT pg_advisory_unlock(714032601)"))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    apply_local_migrations(engine, Path(__file__).resolve().parents[2] / "migrations")
