"""Verify the cleanup guard in a transaction-local, disposable PostgreSQL schema.

RUN_UNUSED_CLEANUP_POSTGRES=1 enables DB tests; public application rows are never
changed. Even successful cleanup is rolled back with the test schema.
"""

import os
from collections.abc import Iterator
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import Connection, create_engine, text
from sqlalchemy.exc import DBAPIError

from app.database.database import engine
from app.models.dataset import RecordingSession
from app.models.experiment import ForecastResult
from app.models.traffic import TrafficTimeSeries

MIGRATION = Path(__file__).parents[1] / "migrations/20261201_remove_verified_unused_columns.sql"
CANDIDATES = {
    "forecast_results": ("lower_bound", "upper_bound"),
    "recording_sessions": (
        "actual_recording_start", "actual_recording_end", "continuous_recording",
        "recording_time_source",
    ),
    "traffic_time_series": ("traffic_density",),
}
POSTGRES = pytest.mark.skipif(
    os.getenv("RUN_UNUSED_CLEANUP_POSTGRES") != "1",
    reason="PostgreSQL cleanup integration is opt-in",
)


def test_orm_has_no_removed_columns() -> None:
    for model in (RecordingSession, ForecastResult, TrafficTimeSeries):
        assert set(CANDIDATES[model.__tablename__]).isdisjoint(model.__table__.columns.keys())


@pytest.fixture
def connection() -> Iterator[Connection]:
    test_engine = create_engine(engine.url, connect_args={"connect_timeout": 5})
    try:
        with test_engine.connect() as conn, conn.begin() as transaction:
            schema = "unused_cleanup_test_" + uuid4().hex
            conn.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
            conn.exec_driver_sql(f'SET LOCAL search_path TO "{schema}"')
            conn.exec_driver_sql("""
                CREATE TABLE forecast_results (
                    id integer PRIMARY KEY, predicted_value numeric,
                    lower_bound numeric, upper_bound numeric);
                CREATE TABLE recording_sessions (
                    id integer PRIMARY KEY, original_filename text,
                    actual_recording_start timestamptz, actual_recording_end timestamptz,
                    continuous_recording boolean, recording_time_source text,
                    CONSTRAINT ck_recording_capture_metadata CHECK (
                        actual_recording_end IS NULL OR actual_recording_start IS NOT NULL));
                CREATE TABLE traffic_time_series (
                    id integer PRIMARY KEY, traffic_flow numeric,
                    traffic_density numeric,
                    CONSTRAINT ck_traffic_density CHECK (traffic_density >= 0));
                INSERT INTO forecast_results (id, predicted_value) VALUES (1, 12.5);
                INSERT INTO recording_sessions (id, original_filename) VALUES (1, 'session.csv');
                INSERT INTO traffic_time_series (id, traffic_flow) VALUES (1, 42);
            """)
            try:
                yield conn
            finally:
                transaction.rollback()
    finally:
        test_engine.dispose()


def apply_migration(connection: Connection) -> None:
    # The fixture owns the outer transaction, including the disposable schema.
    sql = MIGRATION.read_text(encoding="utf-8")
    sql = sql.replace("\nBEGIN;", "").replace("\nCOMMIT;", "")
    connection.execute(text(sql))


def candidate_columns(connection: Connection) -> set[tuple[str, str]]:
    return {
        (table, column)
        for table, column in connection.exec_driver_sql(
            "SELECT table_name, column_name FROM information_schema.columns "
            "WHERE table_schema = current_schema()"
        )
        if column in CANDIDATES.get(table, ())
    }


@POSTGRES
def test_null_only_cleanup_preserves_rows_and_can_run_twice(connection: Connection) -> None:
    assert len(candidate_columns(connection)) == 7
    for _ in range(2):
        apply_migration(connection)
        assert not candidate_columns(connection)
        assert connection.exec_driver_sql("SELECT id, predicted_value FROM forecast_results").one() == (1, 12.5)
        assert connection.exec_driver_sql("SELECT id, original_filename FROM recording_sessions").one() == (1, "session.csv")
        assert connection.exec_driver_sql("SELECT id, traffic_flow FROM traffic_time_series").one() == (1, 42)


@POSTGRES
@pytest.mark.parametrize(
    "table,column,value",
    [
        ("forecast_results", "lower_bound", "0"),
        ("forecast_results", "upper_bound", "10"),
        ("recording_sessions", "actual_recording_start", "'2026-11-22T00:00:00Z'"),
        ("recording_sessions", "actual_recording_end", "'2026-11-22T01:00:00Z'"),
        ("recording_sessions", "continuous_recording", "FALSE"),
        ("recording_sessions", "recording_time_source", "'filename'"),
        ("traffic_time_series", "traffic_density", "0"),
    ],
)
def test_populated_column_refuses_entire_cleanup(
    connection: Connection, table: str, column: str, value: str,
) -> None:
    if column == "actual_recording_end":
        connection.exec_driver_sql(
            "UPDATE recording_sessions SET actual_recording_start = '2026-11-22T00:00:00Z'"
        )
    # Identifiers/values come only from the fixed parameter list above.
    connection.exec_driver_sql(f'UPDATE "{table}" SET "{column}" = {value} WHERE id = 1')
    before = candidate_columns(connection)
    with pytest.raises(DBAPIError) as error, connection.begin_nested():
        apply_migration(connection)
    assert "Cleanup refused:" in str(error.value.orig)
    assert candidate_columns(connection) == before
    assert connection.exec_driver_sql(f'SELECT "{column}" IS NOT NULL FROM "{table}"').scalar()
