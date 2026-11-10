"""Run from BE: uv run python -m scripts.apply_model_prediction_migration."""

from pathlib import Path

from app.database.database import engine


def main() -> None:
    migration = Path(__file__).resolve().parents[1] / "migrations/20261108_model_prediction.sql"
    connection = engine.raw_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(migration.read_text(encoding="utf-8"))
        connection.commit()
        print("Model prediction migration applied successfully.")
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    main()
