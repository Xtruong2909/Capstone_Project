from pathlib import Path
from unittest.mock import MagicMock

import pytest

from app.database.local_migrations import LOCAL_MIGRATIONS, apply_local_migrations


def test_only_reviewed_scripts_are_applied_and_lock_is_released(tmp_path: Path) -> None:
    for name in LOCAL_MIGRATIONS:
        (tmp_path / name).write_text(f"SELECT '{name}';", encoding="utf-8")
    (tmp_path / "old_destructive.sql").write_text("DROP TABLE datasets;", encoding="utf-8")
    engine = MagicMock()
    connection = engine.connect.return_value.execution_options.return_value.__enter__.return_value
    apply_local_migrations(engine, tmp_path)
    assert [args.args[0] for args in connection.exec_driver_sql.call_args_list] == [
        f"SELECT '{name}';" for name in LOCAL_MIGRATIONS
    ]
    assert 'pg_advisory_unlock' in str(connection.execute.call_args.args[0])


def test_failed_script_rolls_back_and_releases_lock(tmp_path: Path) -> None:
    for name in LOCAL_MIGRATIONS:
        (tmp_path / name).write_text("BEGIN; SELECT 1; COMMIT;", encoding="utf-8")
    engine = MagicMock()
    connection = engine.connect.return_value.execution_options.return_value.__enter__.return_value
    connection.exec_driver_sql.side_effect = [RuntimeError("migration failed"), None]
    with pytest.raises(RuntimeError, match="migration failed"):
        apply_local_migrations(engine, tmp_path)
    assert connection.exec_driver_sql.call_args.args == ("ROLLBACK",)
    assert 'pg_advisory_unlock' in str(connection.execute.call_args.args[0])
