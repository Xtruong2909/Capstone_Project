"""Real PostgreSQL checks using an explicitly supplied, disposable test database."""
import os
from collections.abc import Iterator
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.crud import crud_sharing as repo
from app.models.sharing import SharedReport, SharedReportItem
from app.models.user import Role, User


@pytest.fixture(scope="module")
def database() -> Iterator[tuple]:
    url = os.getenv("SHARE_RECIPIENT_TEST_URL")
    if not url:
        pytest.skip("Set SHARE_RECIPIENT_TEST_URL to an empty disposable database")
    engine = create_engine(url)
    assert engine.url.host in ("127.0.0.1", "localhost")
    assert engine.url.database.startswith("share_recipient_test_")
    with engine.begin() as connection:
        Role.__table__.create(connection)
        User.__table__.create(connection)
        connection.execute(text("CREATE TABLE dataset_files (id uuid PRIMARY KEY)"))
        SharedReport.__table__.create(connection)
        SharedReportItem.__table__.create(connection)
    owner, first, disabled, second = (uuid4() for _ in range(4))
    legacy = uuid4()
    with engine.begin() as c:
        c.execute(text("INSERT INTO roles(id,name) VALUES ('data_scientist','Scientist'),('business_user','Business')"))
        for user_id, role, active in [(owner, "data_scientist", True), (first, "business_user", True),
                                       (disabled, "business_user", False)]:
            c.execute(text("INSERT INTO users(id,email,hashed_password,full_name,role_id,is_active,must_change_password) VALUES (:id,:email,'test-hash',:name,:role,:active,false)"),
                      {"id": user_id, "email": f"{user_id}@example.com", "name": str(user_id), "role": role, "active": active})
        c.execute(text("INSERT INTO shared_reports(id,title,created_by,visibility,status,created_at,updated_at) VALUES (:id,'Legacy',:owner,'BUSINESS_USER','PUBLISHED',now(),now())"),
                  {"id": legacy, "owner": owner})
    migration = (Path(__file__).parents[1] / "migrations/20261206_share_recipients.sql").read_text()
    with engine.connect() as c:
        c.exec_driver_sql(migration)
    with engine.begin() as c:
        c.execute(text("INSERT INTO users(id,email,hashed_password,full_name,role_id,is_active,must_change_password) VALUES (:id,'new@example.com','test-hash','Second','business_user',true,false)"), {"id": second})
    # A deployment replay must not silently grant the new user access to legacy shares.
    with engine.connect() as c:
        c.exec_driver_sql(migration)
    yield engine, owner, first, second, disabled, legacy
    engine.dispose()


def test_migration_backfills_only_existing_active_business_users_once(database: tuple) -> None:
    engine, _owner, first, second, disabled, legacy = database
    with Session(engine) as db:
        assert repo.has_share_recipient(db, legacy, first)
        assert not repo.has_share_recipient(db, legacy, second)
        assert not repo.has_share_recipient(db, legacy, disabled)


def test_recipient_queries_exclude_disabled_users_and_other_roles(database: tuple) -> None:
    engine, owner, first, second, disabled, _legacy = database
    with Session(engine) as db:
        assert {user.id for user in repo.list_business_recipients(db)} == {first, second}
        assert {user.id for user in repo.get_business_recipients(db, [owner, first, disabled])} == {first}


def test_real_queries_isolate_recipients_and_avoid_duplicate_grants(database: tuple) -> None:
    engine, owner, first, second, _disabled, _legacy = database
    resource = {"resource_type": "EXPERIMENT", "resource_id": uuid4(), "visible_sections": ["experiment_summary"]}
    with Session(engine) as db:
        initial = repo.create_share(db, title="First only", description=None, created_by=owner,
                                    status="PUBLISHED", items_data=[resource], recipient_ids=[first])
        new = repo.create_selection_shares(db, title="Additional recipient", owner_id=owner,
                                          items_data=[resource], recipient_ids=[first, second])
        assert len(new) == 1 and new[0].recipient_ids == [second]
        assert repo.has_share_recipient(db, initial.id, first)
        assert not repo.has_share_recipient(db, initial.id, second)
        for viewer, expected in [(first, initial.id), (second, new[0].id)]:
            reports, total = repo.get_published_shares(db, viewer_id=viewer, resource_type="EXPERIMENT")
            assert total == 1 and [r.id for r in reports] == [expected]
        reports, total = repo.get_published_shares(db, viewer_id=uuid4(), resource_type="EXPERIMENT")
        assert reports == [] and total == 0
        key = ("EXPERIMENT", resource["resource_id"])
        assert repo.active_share_ids(db, [key], recipient_ids=[first, second]) == {key}
        repo.update_share(db, share=new[0], status="REVOKED")
        assert repo.get_published_shares(db, viewer_id=second, resource_type="EXPERIMENT")[1] == 0
        assert repo.active_share_ids(db, [key], recipient_ids=[first, second]) == set()


def test_replacing_audience_revokes_previous_user_immediately(database: tuple) -> None:
    engine, owner, first, second, _disabled, _legacy = database
    with Session(engine) as db:
        report = repo.create_share(db, title="Replace audience", description=None, created_by=owner,
                                   status="PUBLISHED", recipient_ids=[first], items_data=[{
                                       "resource_type": "DATASET", "resource_id": uuid4(), "visible_sections": ["metadata"],
                                   }])
        repo.update_share(db, share=report, recipient_ids=[second])
        assert report.recipient_ids == [second]
        assert not repo.has_share_recipient(db, report.id, first)
        assert repo.has_share_recipient(db, report.id, second)
