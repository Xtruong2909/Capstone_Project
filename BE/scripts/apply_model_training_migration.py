"""Run from BE: uv run python -m scripts.apply_model_training_migration."""

from pathlib import Path

from app.database.database import engine


def main() -> None:
    migration_directory = Path(__file__).resolve().parents[1] / "migrations"
    migrations = (
        migration_directory / "20261106_model_training.sql",
        migration_directory / "20261107_add_model_training_logs.sql",
        migration_directory / "20261110_experiment_names_per_dataset.sql",
        migration_directory / "20261123_model_training_batches.sql",
        migration_directory / "20261124_model_training_baseline_evaluation.sql",
        migration_directory / "20261125_model_training_evaluation_results.sql",
        migration_directory / "20261126_backfill_saved_experiment_baselines.sql",
        migration_directory / "20261127_backfill_experiment_audit_history.sql",
    )
    connection = engine.raw_connection()
    try:
        with connection.cursor() as cursor:
            for migration in migrations:
                if migration.name == "20261110_experiment_names_per_dataset.sql":
                    cursor.execute(
                        "SELECT EXISTS (SELECT 1 FROM pg_constraint "
                        "WHERE conname = 'uq_training_experiment_dataset_name' "
                        "AND conrelid = 'model_training_experiments'::regclass)"
                    )
                    if cursor.fetchone()[0]:
                        continue
                cursor.execute(migration.read_text(encoding="utf-8"))
        connection.commit()
        print("Model training experiment migrations applied successfully.")
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    main()
