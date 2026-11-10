"""Run from BE: uv run python -m scripts.apply_model_training_migration."""

from pathlib import Path

from app.database.database import engine


def main() -> None:
    migration_directory = Path(__file__).resolve().parents[1] / "migrations"
    migrations = (
        migration_directory / "20261106_model_training.sql",
        migration_directory / "20261107_add_model_training_logs.sql",
        migration_directory / "20261110_experiment_names_per_dataset.sql",
    )
    connection = engine.raw_connection()
    try:
        with connection.cursor() as cursor:
            for migration in migrations:
                cursor.execute(migration.read_text(encoding="utf-8"))
        connection.commit()
        print("Model training migrations, including per-dataset experiment names, applied successfully.")
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    main()
