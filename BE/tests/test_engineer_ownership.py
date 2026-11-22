"""Exercise real ownership queries and HTTP guards without the application database."""

from datetime import date
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import JSON, Column, MetaData, Table, create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.v1.endpoints import dataset_mapping, datasets
from app.core.deps import get_current_user
from app.crud import crud_dataset
from app.database.database import get_db
from app.models.dataset import (
    DataCleaningHistory,
    Dataset,
    DatasetAccessGrant,
    DatasetColumnMapping,
    DatasetFile,
    DatasetFileSession,
    DatasetGroup,
    DatasetGroupProcessingJob,
    RecordingSession,
)
from app.models.user import User
from app.services import dataset_group_processing_service as processing


@pytest.fixture
def workspace():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    metadata = MetaData()
    for model in (User, DatasetGroup, Dataset, DatasetFile, RecordingSession,
                  DatasetFileSession, DataCleaningHistory, DatasetAccessGrant,
                  DatasetGroupProcessingJob, DatasetColumnMapping):
        Table(model.__tablename__, metadata, *[
            Column(column.name, JSON() if isinstance(column.type, JSONB) else column.type,
                   primary_key=column.primary_key)
            for column in model.__table__.columns
        ])
    metadata.create_all(engine)
    with Session(engine) as db:
        owners = [SimpleNamespace(id=uuid4(), role_id="data_engineer") for _ in range(3)]
        group = DatasetGroup(id=uuid4(), name="Shared drone batch", source="pneuma", drone_id="d1")
        foreign_group = DatasetGroup(id=uuid4(), source="pneuma", drone_id="d2")
        db.add_all([group, foreign_group])
        items = []
        for index, owner_id in enumerate([owners[0].id, owners[0].id, owners[1].id, None,
                                          owners[1].id]):
            item = Dataset(id=uuid4(), name=f"day-{index}", code=f"day-{index}", source="pNEUMA",
                           location_name="Athens", created_by=owner_id,
                           group_id=foreign_group.id if index == 4 else group.id,
                           recording_date=date(2018, 10, 24 + index), drone_id="d1")
            dataset_file = DatasetFile(id=uuid4(), dataset_id=item.id, 
                                     total_records=10, approval_status="PENDING")
            db.add_all([item, dataset_file])
            items.append(item)
        db.commit()
        actor = SimpleNamespace(id=owners[0].id, role_id="data_engineer")
        app = FastAPI()
        for router in (datasets.file_router, datasets.upload_router, datasets.review_router,
                       datasets.normalization_router, dataset_mapping.router, datasets.router):
            app.include_router(router, prefix="/datasets")
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user] = lambda: actor
        with TestClient(app) as client:
            yield SimpleNamespace(client=client, db=db, actor=actor, owners=owners, items=items,
                                  group=group, foreign_group=foreign_group)
    engine.dispose()


def test_accounts_receive_disjoint_files_and_new_account_is_empty(workspace) -> None:
    w = workspace
    ids = []
    for owner in w.owners:
        w.actor.id = owner.id
        response = w.client.get("/datasets/files")
        assert response.status_code == 200, response.text
        ids.append({row["dataset_id"] for row in response.json()})
    assert ids[0] == {str(item.id) for item in w.items[:2]}
    assert ids[1] == {str(w.items[2].id), str(w.items[4].id)}
    assert ids[0].isdisjoint(ids[1]) and ids[2] == set()
    assert w.db.get(Dataset, w.items[3].id).created_by is None


def test_normalization_preview_endpoint_rejects_another_engineers_job(workspace) -> None:
    from datetime import UTC, datetime

    w = workspace
    job = DatasetGroupProcessingJob(id=uuid4(), group_id=w.group.id, staging_id=uuid4(),
        operation="NORMALIZE", status="RUNNING", total_datasets=2, processed_datasets=0,
        results=[{"dataset_id": str(item.id), "dataset_name": item.name,
                  "status": "RUNNING"} for item in w.items[:2]],
        created_by=w.actor.id, created_at=datetime.now(UTC), updated_at=datetime.now(UTC))
    w.db.add(job)
    w.db.commit()
    url = f"/datasets/groups/{w.group.id}/processing-jobs/{job.id}/datasets/{w.items[0].id}/preview"
    assert w.client.get(url).status_code == 409
    w.actor.id = w.owners[1].id
    assert w.client.get(url).status_code == 404


def test_batch_totals_details_and_pagination_only_count_owned_data(workspace) -> None:
    w = workspace
    response = w.client.get("/datasets?page_size=1")
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1
    assert response.json()["groups"][0]["dataset_count"] == 2
    assert w.client.get("/datasets?page_size=1&page=2").json()["groups"] == []
    group = w.client.get(f"/datasets/groups/{w.group.id}/datasets")
    assert group.status_code == 200, group.text
    assert {row["dataset_id"] for row in group.json()["datasets"]} == {
        str(item.id) for item in w.items[:2]
    }
    dataset_files = w.client.get(f"/datasets/groups/{w.group.id}/files")
    assert dataset_files.status_code == 200, dataset_files.text
    assert dataset_files.json()["total_datasets"] == dataset_files.json()["total_files"] == 2
    detail = w.client.get(f"/datasets/{w.items[0].id}")
    assert detail.status_code == 200, detail.text
    assert len(detail.json()["related_datasets"]) == 2
    assert w.client.get(f"/datasets/groups/{w.foreign_group.id}/datasets").status_code == 404


def test_foreign_dataset_reads_and_mutations_are_blocked_before_processing(workspace) -> None:
    w = workspace
    for item in w.items[2:]:
        base = f"/datasets/{item.id}"
        dataset_file = crud_dataset.get_dataset_latest_file(w.db, item.id)[1]
        for suffix in ("", "/preview", "/files", "/columns", "/column-mappings",
                       f"/files/{dataset_file.id}/sessions"):
            response = w.client.get(base + suffix)
            assert response.status_code == 404, (suffix, response.text)
        for suffix, body in (("/normalize", None), ("/export", {"staging_id": str(uuid4())}),
                             (f"/files/{dataset_file.id}/submit", {}),
                             (f"/files/{dataset_file.id}/resubmit", {})):
            response = w.client.post(base + suffix, json=body)
            assert response.status_code == 404, (suffix, response.text)
        assert w.client.patch(base + "/column-mappings", json={"mappings": []}).status_code == 404
    assert w.db.query(DatasetGroupProcessingJob).count() == 0
    assert w.db.query(DataCleaningHistory).count() == 0


def test_admin_catalog_stays_global_and_engineers_cannot_use_admin_access(workspace) -> None:
    w = workspace
    w.actor.role_id = "admin"
    response = w.client.get(f"/datasets/groups/{w.group.id}/datasets")
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 4


@pytest.mark.parametrize(("statuses", "expected"), [
    (("PENDING", "PENDING"), "PENDING"),
    (("SUBMITTED", "SUBMITTED"), "SUBMITTED"),
    (("APPROVED", "APPROVED"), "APPROVED"),
    (("REJECTED", "REJECTED"), "REJECTED"),
    (("APPROVED", "SUBMITTED"), "MIXED"),
])
def test_batch_approval_counts_only_current_owners_files(workspace, statuses, expected) -> None:
    w = workspace
    for dataset, value in zip(w.items[:2], statuses, strict=True):
        dataset.dataset_files[0].approval_status = value
    w.items[2].dataset_files[0].approval_status = "REJECTED"
    w.db.commit()
    response = w.client.get("/datasets")
    assert response.status_code == 200, response.text
    batch = response.json()["groups"][0]
    assert batch["approval_status"] == expected
    assert batch["approval_counts"] == {value: statuses.count(value) for value in statuses}
    # Searching one dataset must still report the whole visible batch's review state.
    searched = w.client.get("/datasets", params={"search": w.items[0].name})
    assert searched.json()["groups"][0]["approval_counts"] == batch["approval_counts"]


def test_processing_jobs_use_only_the_current_owners_datasets(workspace) -> None:
    w = workspace
    first = processing.start_group_processing(w.db, group_id=w.group.id,
                                             operation="NORMALIZE", user=w.actor)
    assert {row.dataset_id for row in first.results} == {item.id for item in w.items[:2]}
    w.actor.id = w.owners[1].id
    second = processing.start_group_processing(w.db, group_id=w.group.id,
                                              operation="NORMALIZE", user=w.actor)
    assert [row.dataset_id for row in second.results] == [w.items[2].id]
    assert crud_dataset.get_active_group_processing_job(
        w.db, w.group.id, owner_id=w.actor.id,
    ).id == second.job_id
    with pytest.raises(HTTPException) as exc:
        processing.get_group_processing_result(w.db, group_id=w.group.id,
                                               job_id=first.job_id, user_id=w.actor.id)
    assert exc.value.status_code == 404
    # Historical jobs created before ownership filtering must not expose foreign rows.
    job = crud_dataset.get_group_processing_job(w.db, second.job_id)
    job.results = [*job.results, {"dataset_id": str(w.items[0].id)}]
    w.db.commit()
    with pytest.raises(HTTPException) as exc:
        processing.get_group_processing_result(w.db, group_id=w.group.id,
                                               job_id=second.job_id, user_id=w.actor.id)
    assert exc.value.status_code == 404
