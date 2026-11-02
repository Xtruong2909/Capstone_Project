from typing import Any
from unittest.mock import Mock
from uuid import uuid4

from sqlalchemy import Column, Integer, MetaData, String, Table, Uuid, create_engine, event
from sqlalchemy.orm import Session

from app.crud.crud_data_quality import insert_issues


def test_bulk_issues_preserve_nulls_order_values_and_caller_transaction() -> None:
    engine = create_engine("sqlite://")
    # Isolated persistence test: no application database or PostgreSQL extensions.
    table = Table(
        "data_quality_issues", MetaData(),
        Column("id", Integer, primary_key=True),
        Column("check_id", Uuid, nullable=False),
        Column("row_number", Integer),
        Column("issue_type", String(32), nullable=False),
        Column("column_name", String(512)),
        Column("message", String(512), nullable=False),
        Column("observed_value", String(256)),
    )
    table.create(engine)
    insert_calls: list[bool] = []

    def record_insert(
        connection: Any, cursor: Any, statement: str, parameters: Any,
        context: Any, executemany: bool,
    ) -> None:
        if statement.startswith("INSERT"):
            insert_calls.append(executemany)

    event.listen(engine, "before_cursor_execute", record_insert)
    check_id = uuid4()
    rows = [
        {"check_id": check_id, "row_number": None, "issue_type": "invalid_format",
         "column_name": None, "message": "Thiếu header", "observed_value": None},
        {"check_id": check_id, "row_number": 2, "issue_type": "negative_speed",
         "column_name": "speed", "message": "Tốc độ âm", "observed_value": "-1"},
        {"check_id": check_id, "row_number": 2, "issue_type": "outlier",
         "column_name": "lon_acc", "message": "Ngoài ngưỡng", "observed_value": "11"},
    ]
    try:
        with Session(engine) as db:
            insert_issues(db, rows)
            stored = db.execute(table.select().order_by(table.c.id)).mappings().all()
            assert [{key: row[key] for key in rows[0]} for row in stored] == rows
            assert insert_calls == [True]
            db.rollback()
            assert db.execute(table.select()).all() == []
            insert_issues(db, rows)
            db.commit()
        with Session(engine) as db:
            assert len(db.execute(table.select()).all()) == 3
    finally:
        engine.dispose()


def test_empty_issue_batch_does_not_execute_sql() -> None:
    db = Mock(spec=Session)
    insert_issues(db, [])
    db.execute.assert_not_called()
