"""Opt-in PostgreSQL checks; all schema/data changes are rolled back.

RUN_FORECAST_POSTGRES=1 uses the project's configured database. Creates a random
test schema inside one transaction, never mutates public application tables.
"""

import os
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import DBAPIError

from app.database.database import engine

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_FORECAST_POSTGRES") != "1", reason="PostgreSQL integration opt-in"
)
MIGRATION = Path(__file__).parents[1] / "migrations/20261028_traffic_forecasting.sql"


@pytest.fixture
def connection():
    test_engine = create_engine(engine.url, connect_args={"connect_timeout": 5})
    with test_engine.connect() as conn:
        transaction = conn.begin()
        schema = "forecast_test_" + uuid4().hex
        try:
            conn.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
            conn.exec_driver_sql(f'SET LOCAL search_path TO "{schema}"')
            # The relevant original table definitions, without unrelated FK parents.
            conn.exec_driver_sql("""
                CREATE TABLE experiments (
                    id uuid PRIMARY KEY, model_type varchar(32) NOT NULL,
                    target_variable varchar(32) NOT NULL DEFAULT 'traffic_flow',
                    temporal_aggregation_sec integer NOT NULL DEFAULT 60,
                    forecast_horizon_steps integer NOT NULL DEFAULT 1,
                    train_split_ratio numeric(3,2) NOT NULL DEFAULT .80,
                    status varchar(32) NOT NULL DEFAULT 'DRAFT');
                CREATE TABLE forecast_results (
                    id bigserial PRIMARY KEY, experiment_id uuid REFERENCES experiments(id),
                    timestamp timestamptz NOT NULL, step_ahead integer NOT NULL,
                    predicted_value numeric(10,2), actual_value numeric(10,2));
                CREATE TABLE evaluation_metrics (
                    id uuid PRIMARY KEY, experiment_id uuid UNIQUE REFERENCES experiments(id),
                    mae numeric(10,4), rmse numeric(10,4), evaluated_at timestamptz);
                CREATE TABLE traffic_time_series (
                    id bigserial PRIMARY KEY, dataset_version_id uuid NOT NULL,
                    time_bucket timestamptz NOT NULL, aggregation_interval integer NOT NULL,
                    roi_identifier varchar(64) NOT NULL, vehicle_count integer NOT NULL DEFAULT 0,
                    traffic_flow numeric(10,2) NOT NULL DEFAULT 0,
                    traffic_density numeric(10,4) NOT NULL DEFAULT 0,
                    mean_speed numeric(6,2) NOT NULL DEFAULT 0,
                    congestion_level varchar(32) NOT NULL DEFAULT 'FREE_FLOW');
            """)
            yield conn
        finally:
            transaction.rollback()


def apply_migration(connection) -> None:
    # Keep the production script's SQL intact; transaction ownership belongs to
    # the fixture so even a successful migration cannot commit test objects.
    sql = MIGRATION.read_text(encoding="utf-8").replace("\nBEGIN;", "").replace("\nCOMMIT;", "")
    connection.exec_driver_sql(sql)


def test_preserves_valid_rows_and_enforces_constraints(connection) -> None:
    experiment_id, dataset_id = uuid4(), uuid4()
    connection.exec_driver_sql(
        "INSERT INTO experiments(id, model_type, train_split_ratio, forecast_horizon_steps) VALUES (%s, 'PERSISTENCE', .70, 3)",
        (experiment_id,),
    )
    connection.exec_driver_sql(
        "INSERT INTO traffic_time_series(dataset_version_id, time_bucket, aggregation_interval, roi_identifier, traffic_flow) VALUES (%s, '2026-01-01Z', 60, 'ROI', 12)",
        (dataset_id,),
    )
    apply_migration(connection)
    assert (
        connection.exec_driver_sql("SELECT forecast_horizon_minutes FROM experiments").scalar() == 3
    )
    assert connection.exec_driver_sql("SELECT traffic_flow FROM traffic_time_series").scalar() == 12
    connection.exec_driver_sql(
        "INSERT INTO forecast_results(experiment_id, timestamp, horizon_minutes, predicted_value) VALUES (%s, '2026-01-01Z', 3, 12)",
        (experiment_id,),
    )
    statements = [
        ("UPDATE experiments SET temporal_aggregation_sec = 180", ()),
        ("UPDATE experiments SET forecast_horizon_minutes = 2", ()),
        ("UPDATE experiments SET train_split_ratio = .80", ()),
        ("UPDATE experiments SET model_type = 'ARIMA'", ()),
        ("UPDATE forecast_results SET horizon_minutes = 1", ()),
        (
            "INSERT INTO forecast_results(experiment_id, timestamp, horizon_minutes) VALUES (%s, '2026-01-01Z', 3)",
            (experiment_id,),
        ),
        (
            "INSERT INTO evaluation_metrics(id, experiment_id, mae, rmse) VALUES (%s, %s, -1, 2)",
            (uuid4(), experiment_id),
        ),
        ("UPDATE traffic_time_series SET aggregation_interval = 180", ()),
    ]
    for sql, params in statements:
        with pytest.raises(DBAPIError), connection.begin_nested():
            connection.exec_driver_sql(sql, params)
    connection.exec_driver_sql(
        "INSERT INTO evaluation_metrics(id, experiment_id, mae, rmse) VALUES (%s, %s, 1, 2)",
        (uuid4(), experiment_id),
    )
    with pytest.raises(DBAPIError), connection.begin_nested():
        connection.exec_driver_sql(
            "INSERT INTO evaluation_metrics(id, experiment_id, mae, rmse) VALUES (%s, %s, 1, 2)",
            (uuid4(), experiment_id),
        )


@pytest.mark.parametrize(
    "interval,ratio,status", [(180, 0.70, "DRAFT"), (60, 0.80, "DRAFT"), (60, 0.70, "COMPLETED")]
)
def test_unsafe_migration_reports_ids_and_preserves_old_schema(
    connection, interval: int, ratio: float, status: str
) -> None:
    identifier = uuid4()
    connection.exec_driver_sql(
        "INSERT INTO experiments(id, model_type, temporal_aggregation_sec, train_split_ratio, status) VALUES (%s, 'PERSISTENCE', %s, %s, %s)",
        (identifier, interval, ratio, status),
    )
    with pytest.raises(DBAPIError) as error, connection.begin_nested():
        apply_migration(connection)
    assert "REVIEW_REQUIRED" in str(error.value)
    assert str(identifier) in str(error.value)
    assert (
        connection.exec_driver_sql(
            "SELECT forecast_horizon_steps FROM experiments WHERE id = %s", (identifier,)
        ).scalar()
        == 1
    )
    assert connection.exec_driver_sql("SELECT count(*) FROM experiments").scalar() == 1
